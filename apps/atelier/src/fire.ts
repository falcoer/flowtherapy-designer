import { BURN_N, burnShapes, drawBlurred, paintStroke, rng, type BurnShape, type Target } from './brush';
import { guideColor, type Guide, type Stroke } from './model';

/**
 * Moteur Contagion, élément Feu : la brûlure est un front qui avance tant que la pointe appuie.
 * Tant qu'on ne l'a pas éteint, le front brûle : braises vives et flammes qui montent (rendu posé
 * au-dessus de la couche, il peut dépasser de sa découpe). Éteint (bouton Éteindre de la roue),
 * il ne reste que le trou, la marge roussie et un bord de charbon. Les fronts qui se touchent n'en
 * font qu'un, et un feu posé sur du déjà brûlé ne reprend pas : seul le front qui gagne du papier
 * neuf porte des flammes. Sur une zone éteinte, il carbonise davantage (les marges s'additionnent).
 */

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
function toWhite(c: string, k: number, a = 1) {
  const n = parseInt(c.slice(1, 7), 16);
  const f = (v: number) => Math.round(v + (255 - v) * k);
  return `rgba(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)},${a})`;
}
function mixHex(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1, 7), 16);
  const pb = parseInt(b.slice(1, 7), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0');
}
function toDark(c: string, k: number, a = 1) {
  const n = parseInt(c.slice(1, 7), 16);
  const f = (v: number) => Math.round(v * (1 - k));
  return `rgba(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)},${a})`;
}

/** Le point (x, y) est-il dans une autre forme de feu ? (rayon modulé lu à l'angle du point) */
function inside(x: number, y: number, list: BurnShape[], self: BurnShape) {
  for (const o of list) {
    if (o === self) continue;
    const dx = x - o.cx;
    const dy = y - o.cy;
    const R = o.rr * 1.2;
    if (dx > R || dx < -R || dy > R || dy < -R) continue;
    const a = Math.atan2(dy, dx);
    const k = Math.round((((a / (Math.PI * 2)) % 1) + 1) % 1 * BURN_N);
    if (Math.hypot(dx, dy) < o.rr * o.m[k]! * 0.97) return true;
  }
  return false;
}

export interface Flames {
  c: HTMLCanvasElement;
  /** Place du canevas dans la boîte de la couche (fractions de sa largeur et de sa hauteur) : il déborde pour laisser monter les flammes. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Flammes et braises des feux encore vivants d'une couche ; null s'il n'y en a pas. */
export function flames(all: Stroke[], live: (s: Stroke) => boolean, guides: Guide[], t: Target, on: (x: number, y: number) => boolean = () => true, over: Stroke[] = []): Flames | null {
  const lit = all.filter((s) => s.flame !== undefined && live(s));
  if (!lit.length) return null;
  const { shapes } = burnShapes(all, t);
  // front : les points du bord des formes vivantes qui ne sont dans aucune autre forme (ni vivante ni éteinte)
  type Lick = { x: number; y: number; L: number; bw: number; sway: number; g: Guide | undefined; tongue: boolean };
  const licks: Lick[] = [];
  let maxL = 0;
  for (const sh of shapes) {
    const s = sh.s;
    if (s.flame === undefined || !live(s)) continue;
    const r = rng(s.seed ^ 0x51f3);
    const fl = clamp(s.flame);
    // braises serrées le long du front, une langue de flamme sur deux braises
    const step = Math.max(1, Math.round(BURN_N / 48));
    for (let k = 0; k < BURN_N; k += step) {
      const a = (k / BURN_N) * Math.PI * 2;
      const rad = sh.rr * sh.m[k]!;
      const x = sh.cx + Math.cos(a) * rad;
      const y = sh.cy + Math.sin(a) * rad;
      if (x < -sh.rr || y < -sh.rr || x > t.pw + sh.rr || y > t.ph + sh.rr) continue;
      if (!on(x, y) || inside(x, y, shapes, sh)) continue;
      // les flammes vont par touffes : une onde lente le long du front, plus un peu de hasard
      const wave = Math.max(0.15, 0.6 + 0.4 * Math.sin(x * 0.05 + s.seed) * Math.sin(x * 0.013 + s.seed * 0.7));
      const L = sh.rr * (0.25 + 1.9 * fl) * wave * (0.55 + 0.9 * r());
      maxL = Math.max(maxL, L);
      licks.push({ x, y, L, bw: Math.max(3, sh.rr * (0.22 + 0.12 * r())), sway: (r() - 0.5) * 0.5, g: guides[s.guide], tongue: (k / step) % 2 === 0 });
    }
  }
  if (!licks.length) return null;
  // le canevas déborde de la couche : en haut pour les flammes, un peu tout autour pour la lueur
  const padX = Math.ceil(maxL * 0.5 + 8);
  const padT = Math.ceil(maxL * 1.35 + 8);
  const padB = Math.ceil(maxL * 0.2 + 8);
  const W = Math.ceil(t.pw + padX * 2);
  const H = Math.ceil(t.ph + padT + padB);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  x.translate(padX, padT);
  // langue de flamme : ventre arrondi au pied, puis une pointe qui ondule (en S) vers le haut
  const tongue = (k: Lick, len: number, wide: number) => {
    const bw = k.bw * wide;
    const sw = k.sway * len;
    const tx = k.x + sw;
    const ty = k.y - len;
    x.beginPath();
    x.moveTo(k.x, k.y + bw * 0.25);
    x.bezierCurveTo(k.x - bw * 0.75, k.y + bw * 0.2, k.x - bw * 0.7, k.y - len * 0.3, k.x - bw * 0.25 - sw * 0.3, k.y - len * 0.55);
    x.bezierCurveTo(k.x - bw * 0.05 + sw * 0.2, k.y - len * 0.75, tx - bw * 0.1, ty + len * 0.12, tx, ty);
    x.bezierCurveTo(tx + bw * 0.2, ty + len * 0.2, k.x + bw * 0.25 + sw * 0.6, k.y - len * 0.6, k.x + bw * 0.35, k.y - len * 0.35);
    x.bezierCurveTo(k.x + bw * 0.75, k.y - len * 0.15, k.x + bw * 0.7, k.y + bw * 0.2, k.x, k.y + bw * 0.25);
    x.closePath();
  };
  // trois couches : enveloppe rouge et large, corps orangé, cœur jaune presque blanc ; la couleur du guide les teinte un peu
  const tint = (g: Guide | undefined, base: string, k: number) => mixHex(base, guideColor(g, 0.5), k);
  for (const [lenK, wideK, alpha, col] of [
    [1.12, 1.55, 0.55, (g: Guide | undefined) => [toDark(tint(g, '#e2401b', 0.25), 0, 0.9), toDark(tint(g, '#a3200f', 0.25), 0.2, 0)]],
    [0.8, 0.95, 0.8, (g: Guide | undefined) => [tint(g, '#ff9a1f', 0.2), toDark(tint(g, '#f05a14', 0.2), 0, 0)]],
    [0.42, 0.5, 0.9, (g: Guide | undefined) => [toWhite(tint(g, '#ffe27a', 0.1), 0.55), toWhite(tint(g, '#ffc23a', 0.1), 0.1, 0)]],
  ] as const) {
    x.globalAlpha = alpha;
    for (const k of licks) {
      const len = k.L * lenK;
      // trop courte, une langue ressemble à une bougie : on laisse les braises seules
      if (!k.tongue || k.L < k.bw * 1.3) continue;
      const [c0, c1] = col(k.g);
      const gr = x.createLinearGradient(k.x, k.y, k.x + k.sway * len, k.y - len);
      gr.addColorStop(0, c0);
      gr.addColorStop(1, c1);
      x.fillStyle = gr;
      tongue(k, len, wideK);
      x.fill();
    }
  }
  // braises : le front lui-même rougeoie, en lueurs douces qui se chevauchent
  for (const k of licks) {
    const rr = k.bw * 0.5;
    const gr = x.createRadialGradient(k.x, k.y, 0, k.x, k.y, rr);
    gr.addColorStop(0, toWhite(tint(k.g, '#ffb340', 0.15), 0.35, 0.85));
    gr.addColorStop(0.45, toDark(tint(k.g, '#ee5a16', 0.2), 0, 0.5));
    gr.addColorStop(1, toDark(tint(k.g, '#b8260e', 0.2), 0, 0));
    x.globalAlpha = 0.9;
    x.fillStyle = gr;
    x.beginPath();
    x.arc(k.x, k.y, rr, 0, Math.PI * 2);
    x.fill();
  }
  x.globalAlpha = 1;
  x.setTransform(1, 0, 0, 1, 0, 0);
  // lueur : une copie floue s'ajoute autour
  const glow = document.createElement('canvas');
  glow.width = W;
  glow.height = H;
  const gx = glow.getContext('2d')!;
  gx.drawImage(c, 0, 0);
  x.globalCompositeOperation = 'lighter';
  x.globalAlpha = 0.35;
  drawBlurred(x, glow, Math.max(3, maxL * 0.18));
  x.globalAlpha = 1;
  x.globalCompositeOperation = 'source-over';
  glow.width = glow.height = 0;
  // second moteur du feu (étincelles, fumée) : au-dessus des flammes, libre de sortir de la couche
  if (over.length) {
    x.translate(padX, padT);
    for (const s of over) paintStroke(x, { ...s, over: undefined }, guides, t);
    x.setTransform(1, 0, 0, 1, 0, 0);
  }
  return { c, x: -padX / t.pw, y: -padT / t.ph, w: W / t.pw, h: H / t.ph };
}
