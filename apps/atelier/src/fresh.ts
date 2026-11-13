import { paintStroke, rng, type Target } from './brush';
import { waterPass } from './particles';
import type { Guide, Stroke } from './model';

/**
 * Passe fraîche des revêtements (acrylique, rouleau, bombe) : tant que la passe n'est pas sèche,
 * ses traits travaillent ensemble. Un nouveau trait d'acrylique tire la pâte encore fraîche et s'y
 * mélange ; la bombe trop chargée coule ; les gouttes d'eau d'une même passe se rejoignent. La peinture d'avant la passe (sèche) n'est jamais touchée.
 * La passe sèche quand le contexte se termine (autre couche, autre élément ou outil) ou au bouton Sécher.
 */
export type PassKind = 'aquarelle' | 'acrylic' | 'spray' | 'water';

/** Sorte de passe humide d'un trait : l'aquarelle a la sienne (paintWash), les revêtements celle-ci. */
export function passKind(s: Pick<Stroke, 'brush' | 'matter'> | undefined): PassKind | null {
  if (!s) return null;
  const b = s.brush ?? 'aquarelle';
  if (b === 'aquarelle') return 'aquarelle';
  if (b === 'acrylic' || b === 'roller') return 'acrylic';
  if (b === 'glitter' && s.matter === 'spray') return 'spray';
  if (b === 'glitter' && s.matter === 'water') return 'water';
  return null;
}

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
let passCanvas: HTMLCanvasElement | null = null;
let strokeCanvas: HTMLCanvasElement | null = null;
let carryCanvas: HTMLCanvasElement | null = null;
let dripCanvas: HTMLCanvasElement | null = null;

function sized(c: HTMLCanvasElement, w: number, h: number) {
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const ctx = c.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, w, h);
  return ctx;
}

/** Peint une passe fraîche de revêtement (un ou plusieurs traits consécutifs de la même passe). */
export function paintPass(dst: CanvasRenderingContext2D, list: Stroke[], guides: Guide[], t: Target) {
  const kind = passKind(list[0]);
  if (list.length === 1 && kind !== 'spray') return paintStroke(dst, list[0]!, guides, t);
  if (kind === 'water') return waterPass(dst, list, guides, t);
  const [W, H] = [Math.max(1, Math.ceil(t.pw)), Math.max(1, Math.ceil(t.ph))];
  const B = (passCanvas ??= document.createElement('canvas'));
  const bx = sized(B, W, H);
  list.forEach((s, i) => {
    if (i === 0 || kind !== 'acrylic') return paintStroke(bx, s, guides, t);
    // mouillé sur mouillé : la brosse tire la pâte fraîche, puis sa propre couleur s'y mêle à moitié
    smear(bx, B, s, t);
    const T = (strokeCanvas ??= document.createElement('canvas'));
    const tx = sized(T, W, H);
    paintStroke(tx, s, guides, t);
    bx.globalCompositeOperation = 'destination-over';
    bx.drawImage(T, 0, 0);
    bx.globalCompositeOperation = 'source-over';
    bx.globalAlpha = 0.5;
    bx.drawImage(T, 0, 0);
    bx.globalAlpha = 1;
  });
  if (kind === 'spray') drips(bx, B, list[list.length - 1]!, t);
  dst.drawImage(B, 0, 0);
}

/**
 * Traîne la peinture fraîche le long du trait : la brosse emporte ce qu'elle touche et le dépose un
 * peu plus loin, en se rechargeant à chaque pas de ce qu'elle rencontre.
 */
function smear(bx: CanvasRenderingContext2D, B: HTMLCanvasElement, s: Stroke, t: Target) {
  const R = Math.max(2, s.size * t.pxPerMin * 0.75);
  const d = Math.ceil(R * 2) + 2;
  const C = (carryCanvas ??= document.createElement('canvas'));
  const cx = sized(C, d, d);
  const pts = s.pts.map((p) => ({ x: p.x * t.pw, y: p.y * t.ph }));
  if (pts.length < 2) return;
  const step = Math.max(1, R * 0.25);
  const mask = () => {
    const g = cx.createRadialGradient(d / 2, d / 2, 0, d / 2, d / 2, R);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.8)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    cx.globalCompositeOperation = 'destination-in';
    cx.globalAlpha = 1;
    cx.fillStyle = g;
    cx.fillRect(0, 0, d, d);
    cx.globalCompositeOperation = 'source-over';
  };
  const pick = (x: number, y: number, a: number) => {
    cx.globalAlpha = a;
    cx.drawImage(B, x - d / 2, y - d / 2, d, d, 0, 0, d, d);
    cx.globalAlpha = 1;
    mask();
  };
  pick(pts[0]!.x, pts[0]!.y, 1);
  let carried = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 1; k <= n; k++) {
      const x = a.x + ((b.x - a.x) * k) / n;
      const y = a.y + ((b.y - a.y) * k) / n;
      // la charge s'épuise : au-delà de quelques largeurs de brosse, on ne traîne presque plus rien
      carried += len / n;
      const load = 0.85 * Math.exp(-carried / (R * 10));
      if (load < 0.03) return;
      bx.globalAlpha = load;
      bx.drawImage(C, x - d / 2, y - d / 2);
      bx.globalAlpha = 1;
      pick(x, y, 0.25);
    }
  }
}

/**
 * Coulures de la bombe : là où la passe fraîche est assez chargée, la peinture descend en filet et
 * finit en goutte. Plus le réglage Coulures est haut, plus elles partent tôt et loin.
 */
function drips(bx: CanvasRenderingContext2D, B: HTMLCanvasElement, s: Stroke, t: Target) {
  const pool = clamp(s.pool ?? 0);
  if (pool <= 0.01) return;
  const q = Math.min(1, 200 / Math.max(t.pw, t.ph));
  const w = Math.max(2, Math.round(t.pw * q));
  const h = Math.max(2, Math.round(t.ph * q));
  const D = (dripCanvas ??= document.createElement('canvas'));
  const dx = sized(D, w, h);
  dx.drawImage(B, 0, 0, w, h);
  const px = dx.getImageData(0, 0, w, h).data;
  const thr = 0.8 - 0.45 * pool;
  const cells: number[] = [];
  for (let i = 0; i < w * h; i++) if (px[i * 4 + 3]! / 255 > thr) cells.push(i);
  if (!cells.length) return;
  const r = rng(s.seed ^ 0xd21b);
  const R = Math.max(2, s.size * t.pxPerMin);
  const want = Math.round(3 + 22 * pool);
  const placed: Array<[number, number]> = [];
  for (let tries = 0; tries < want * 6 && placed.length < want; tries++) {
    const i = cells[Math.floor(r() * cells.length)]!;
    const cx0 = ((i % w) + r()) / q;
    const cy0 = (Math.floor(i / w) + r()) / q;
    if (placed.some(([x, y]) => Math.abs(x - cx0) < R * 0.35 && Math.abs(y - cy0) < R * 1.5)) continue;
    placed.push([cx0, cy0]);
    const a = px[i * 4 + 3]! / 255;
    const k = clamp((a - thr) / Math.max(0.05, 1 - thr));
    const len = R * (0.5 + 3 * pool) * (0.35 + 0.65 * k) * (0.5 + r());
    const lw = Math.max(1, R * 0.055 * (0.6 + 0.8 * r()));
    const [cr, cg, cb] = [px[i * 4]!, px[i * 4 + 1]!, px[i * 4 + 2]!];
    const col = (al: number, f = 0) => `rgba(${Math.round(cr * (1 + f))},${Math.round(cg * (1 + f))},${Math.round(cb * (1 + f))},${al})`;
    // le filet ondule à peine et s'amincit avant la goutte
    const wob = (r() - 0.5) * lw * 2;
    bx.lineCap = 'round';
    bx.strokeStyle = col(0.9);
    bx.lineWidth = lw;
    bx.beginPath();
    bx.moveTo(cx0, cy0);
    bx.quadraticCurveTo(cx0 + wob, cy0 + len * 0.5, cx0 + wob * 0.4, cy0 + len);
    bx.stroke();
    bx.fillStyle = col(0.95, -0.12);
    bx.beginPath();
    bx.ellipse(cx0 + wob * 0.4, cy0 + len, lw * 1.05, lw * 1.35, 0, 0, Math.PI * 2);
    bx.fill();
    // reflet sur la goutte
    bx.fillStyle = 'rgba(255,255,255,0.45)';
    bx.beginPath();
    bx.arc(cx0 + wob * 0.4 - lw * 0.35, cy0 + len - lw * 0.4, lw * 0.3, 0, Math.PI * 2);
    bx.fill();
  }
}
