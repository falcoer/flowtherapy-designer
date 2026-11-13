import { buffer, drawBlurred, LEAN, rng, type Target } from './brush';
import { guideColor, type Guide, type Stroke } from './model';

/**
 * Particules : la pointe lâche des grains qui voyagent un moment. Ouvert, c'est un nuage ; resserré,
 * les grains partent ensemble et leur chemin reste visible (comètes, puis traînées). La matière dit
 * comment un grain se dessine : poussière mate, lumière qui s'additionne, goutte d'eau, paillette.
 */
export type Matter = 'dust' | 'light' | 'water' | 'glitter';
export const MATTERS: Array<[Matter, string, string]> = [
  ['dust', 'Poussière', 'grains mats qui se déposent'],
  ['light', 'Lumière', 'points et traînées qui brillent'],
  ['water', 'Eau', 'bruine, gouttes, zones mouillées'],
  ['glitter', 'Paillettes', 'éclats qui scintillent'],
];
/** Zone du resserrage, pour le libellé du potard. */
export const focusName = (v: number) => (v < 0.3 ? 'nuage' : v < 0.7 ? 'comètes' : 'traînées');

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a: number, b: number, v: number) => {
  const x = clamp((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const rgbCache = new Map<string, [number, number, number]>();
function rgbOf(c: string): [number, number, number] {
  let v = rgbCache.get(c);
  if (!v) {
    const h = c.startsWith('#') ? c.slice(1) : '';
    const full = h.length === 3 ? [...h].map((x) => x + x).join('') : h;
    v = full.length >= 6 ? [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)] : [128, 128, 128];
    if (v.some(Number.isNaN)) v = [128, 128, 128];
    if (rgbCache.size > 4096) rgbCache.clear();
    rgbCache.set(c, v);
  }
  return v;
}
/** Couleur éclaircie (k > 0) ou assombrie (k < 0), avec son opacité. */
function tone(c: string, k: number, a = 1): string {
  const [r, g, b] = rgbOf(c);
  const f = (v: number) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k));
  return `rgba(${f(r)},${f(g)},${f(b)},${a})`;
}

interface Grain {
  /** Chemin parcouru (x, y par pas) et distance parcourue à chaque pas, en fraction de la portée. */
  path: Float32Array;
  n: number;
  /** Premier pas visible : avant lui, le grain n'a pas laissé de trace. */
  from: number;
  /** Taille du grain en pixels, et deux tirages (lumière accrochée, rotation). */
  sz: number;
  lit: number;
  rot: number;
  /** Distance du départ à la tête, en fraction de la portée (position dans le dégradé). */
  far: number;
}

/** Grains par départ, selon la matière : la poussière est fine et nombreuse, les paillettes sont grosses et rares. */
const COUNT: Record<Matter, number> = { dust: 2.4, light: 1, water: 1.3, glitter: 0.7 };
const MAX_GRAINS = 14000;

function grains(s: Stroke, t: Target, matter: Matter) {
  const focus = clamp(s.focus ?? 0);
  const bend = clamp(s.bend ?? 0, -1, 1);
  const density = clamp(s.density ?? 0.5);
  const grow = clamp(s.grow ?? 1, 0.05, 1);
  const R = Math.max(1, s.size * t.pxPerMin);
  // resserré, le jet porte plus loin ; la portée pleine fixe la courbe, la poussée ne fait que l'allonger
  const reach = R * (1.3 + 2.9 * focus);
  const trail = smooth(0.12, 0.78, focus);
  const sigma = Math.PI * 0.9 * (1 - focus) ** 1.6 + 0.045;
  const pts = s.pts.map((p) => ({ x: p.x * t.pw, y: p.y * t.ph, p: p.p ?? 0.6, K: (p.k ?? 0) * LEAN, d: p.d ?? 0 }));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  const total = cum[cum.length - 1]!;
  const at = (d: number) => {
    const dd = clamp(d, 0, total);
    let i = 1;
    while (i < pts.length - 1 && cum[i]! < dd) i++;
    const a = pts[i - 1] ?? pts[0]!;
    const b = pts[i] ?? a;
    const span = cum[i]! - cum[i - 1]! || 1;
    const f = pts.length > 1 ? clamp((dd - cum[i - 1]!) / span) : 0;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, p: a.p + (b.p - a.p) * f, K: a.K + (b.K - a.K) * f, d: a.d };
  };
  const moving = total > R * 0.5;
  const sp = Math.max(2, R * 0.3);
  const starts = moving ? Math.floor(total / sp) + 1 : 1;
  // pointe immobile et resserrée : une gerbe de quelques rayons, toujours les mêmes pour ce trait
  const r0 = rng(s.seed ^ 0x5bd1);
  const rays = 5 + Math.floor(r0() * 4);
  const rayAt = Array.from({ length: rays }, (_, j) => r0() * 0.5 + (j / rays) * Math.PI * 2);
  const out: Grain[] = [];
  const emits: Array<{ x: number; y: number; p: number }> = [];
  for (let k = 0; k < starts && out.length < MAX_GRAINS; k++) {
    const e = at(k * sp);
    emits.push(e);
    const r = rng((s.seed ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0);
    // direction du jet : celle du geste ; à l'arrêt, celle où penche la pointe, sinon aucune
    let dir: number | null = null;
    if (moving) {
      const a = at(k * sp - sp);
      const b = at(k * sp + sp);
      dir = Math.atan2(b.y - a.y, b.x - a.x);
    } else if (e.K > 0.06) dir = e.d;
    const base = (12 - 6 * trail) * (0.3 + 1.4 * density) * (0.5 + 0.8 * e.p) * COUNT[matter] * clamp(R / 36, 0.3, 1.6) ** 0.7;
    // à l'arrêt, la pointe continue de lâcher des grains tant qu'elle reste posée
    const n = Math.max(1, Math.round(moving ? base : base * 8 * (0.3 + 0.7 * grow)));
    const steps = 4 + Math.round(10 * trail + 6 * Math.abs(bend));
    for (let i = 0; i < n && out.length < MAX_GRAINS; i++) {
      const oa = r() * Math.PI * 2;
      const or = R * 0.35 * (1 - 0.8 * focus) * Math.sqrt(r());
      let x = e.x + Math.cos(oa) * or;
      let y = e.y + Math.sin(oa) * or;
      const gauss = Math.sqrt(-2 * Math.log(Math.max(1e-6, r()))) * Math.cos(r() * Math.PI * 2);
      let ang = (dir ?? rayAt[Math.floor(r() * rays)]!) + gauss * sigma;
      const u = r();
      const len = reach * grow * (u ** 0.8 * (1 - focus) + (0.35 + 0.65 * u) * focus);
      const turn = ((bend * 2.6) / reach) * (0.8 + 0.4 * r());
      const wander = 1.2 * (1 - focus) ** 2;
      const ds = len / steps;
      const path = new Float32Array((steps + 1) * 2);
      path[0] = x;
      path[1] = y;
      for (let j = 1; j <= steps; j++) {
        ang += turn * ds + (r() - 0.5) * wander;
        let [ox, oy] = [Math.cos(ang) * ds, Math.sin(ang) * ds];
        // pointe couchée : le nuage s'allonge du côté où elle penche
        if (e.K) {
          const along = (ox * Math.cos(e.d) + oy * Math.sin(e.d)) * e.K;
          ox += along * Math.cos(e.d);
          oy += along * Math.sin(e.d);
        }
        x += ox;
        y += oy;
        path[j * 2] = x;
        path[j * 2 + 1] = y;
      }
      // sans resserrage, seule la tête se voit ; la courbure laisse une courte mèche qui montre le tourbillon
      const seen = Math.max(trail, 0.3 * Math.abs(bend));
      out.push({ path, n: steps, from: Math.min(steps, Math.round(steps * (1 - seen))), sz: R * (0.03 + 0.07 * r()), lit: r(), rot: r() * Math.PI, far: len / reach });
    }
  }
  return { list: out, emits, R, reach, focus, grow, density };
}

let poolTile: HTMLCanvasElement | null = null;
/**
 * Cumul : là où les grains se posent en nombre, ils se rejoignent. Renvoie le masque de la zone fusionnée
 * (canevas à la taille de la peinture) et de quoi savoir si un point y est pris ; null si rien ne fusionne.
 */
function poolMask(list: Grain[], t: Target, R: number, pool: number) {
  if (pool <= 0.01 || !list.length) return null;
  const q = Math.min(1, 320 / Math.max(t.pw, t.ph), 8 / (R * 0.25));
  const w = Math.max(2, Math.ceil(t.pw * q));
  const h = Math.max(2, Math.ceil(t.ph * q));
  const rb = Math.max(1.5, R * 0.25 * q * (0.7 + 0.6 * pool));
  const field = new Float32Array(w * h);
  const ir = Math.ceil(rb);
  for (const g of list) {
    const hx = g.path[g.n * 2]! * q;
    const hy = g.path[g.n * 2 + 1]! * q;
    const [cx, cy] = [Math.round(hx), Math.round(hy)];
    for (let yy = Math.max(0, cy - ir); yy <= Math.min(h - 1, cy + ir); yy++)
      for (let xx = Math.max(0, cx - ir); xx <= Math.min(w - 1, cx + ir); xx++) {
        const d2 = ((xx - hx) ** 2 + (yy - hy) ** 2) / (rb * rb);
        if (d2 < 1) field[yy * w + xx]! += (1 - d2) ** 2;
      }
  }
  const T = 3.6 - 2.6 * pool;
  const img = new ImageData(w, h);
  let any = false;
  for (let i = 0; i < field.length; i++) {
    const a = smooth(T * 0.85, T * 1.2, field[i]!);
    if (a > 0) {
      any = true;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255;
      img.data[i * 4 + 3] = Math.round(a * 255);
    }
  }
  if (!any) return null;
  // carreau neuf à chaque fois : Safari peut reporter un putImageData sur un canevas déjà collé ailleurs
  const tile = (poolTile ??= document.createElement('canvas'));
  tile.width = 0;
  tile.width = w;
  tile.height = h;
  tile.getContext('2d')!.putImageData(img, 0, 0);
  const { c, ctx } = buffer('b', t.pw, t.ph);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(tile, 0, 0, w, h, 0, 0, t.pw, t.ph);
  const T1 = T * 1.05;
  return { c, taken: (x: number, y: number) => (field[clamp(Math.round(y * q), 0, h - 1) * w + clamp(Math.round(x * q), 0, w - 1)] ?? 0) > T1 };
}

/** Le masque teinté d'une couleur, entier ou réduit à son croissant du côté (sx, sy), posé sur l'encre. */
function layMask(ax: CanvasRenderingContext2D, mask: HTMLCanvasElement, color: string, alpha: number, shift?: [number, number], mode: GlobalCompositeOperation = 'source-over') {
  const { c, ctx } = buffer('c', mask.width, mask.height);
  ctx.drawImage(mask, 0, 0);
  if (shift) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(mask, shift[0], shift[1]);
  }
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  ax.save();
  ax.globalAlpha = alpha;
  ax.globalCompositeOperation = mode;
  ax.drawImage(c, 0, 0);
  ax.restore();
}

/** Trace la partie visible du chemin d'un grain, en quelques tronçons : chacun prend sa largeur et son opacité selon sa place (0 = queue, 1 = tête). */
function streak(ax: CanvasRenderingContext2D, g: Grain, look: (u: number) => { w: number; a: number; c: string }) {
  const segs = g.n - g.from;
  if (segs < 1) return;
  const chunks = Math.min(4, segs);
  for (let k = 0; k < chunks; k++) {
    const i0 = g.from + Math.floor((k * segs) / chunks);
    const i1 = g.from + Math.floor(((k + 1) * segs) / chunks);
    const lk = look((k + 0.5) / chunks);
    if (lk.a <= 0.004) continue;
    ax.strokeStyle = lk.c;
    ax.globalAlpha = Math.min(1, lk.a);
    ax.lineWidth = lk.w;
    ax.beginPath();
    ax.moveTo(g.path[i0 * 2]!, g.path[i0 * 2 + 1]!);
    for (let i = i0 + 1; i <= i1; i++) ax.lineTo(g.path[i * 2]!, g.path[i * 2 + 1]!);
    ax.stroke();
  }
  ax.globalAlpha = 1;
}

export function particles(dst: CanvasRenderingContext2D, s: Stroke, guides: Guide[], full: Target) {
  const matter: Matter = s.matter ?? 'glitter';
  const guide = guides[s.guide];
  const { list, emits, R, reach, focus, grow, density } = grains(s, full, matter);
  const pool = clamp(s.pool ?? 0);
  // on ne travaille que dans le rectangle où il y a des grains (arrondi large : le tampon ne change pas de taille à chaque image)
  const pad = R * 0.6 + 16;
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const e of emits) {
    const hr = matter === 'dust' ? reach * grow : 0;
    [x0, y0, x1, y1] = [Math.min(x0, e.x - hr), Math.min(y0, e.y - hr), Math.max(x1, e.x + hr), Math.max(y1, e.y + hr)];
  }
  for (const g of list)
    for (let i = 0; i <= g.n; i++) {
      const [x, y] = [g.path[i * 2]!, g.path[i * 2 + 1]!];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  const bx = clamp(Math.floor((x0 - pad) / 128) * 128, 0, full.pw);
  const by = clamp(Math.floor((y0 - pad) / 128) * 128, 0, full.ph);
  const t: Target = { ...full, pw: Math.min(full.pw, Math.ceil((x1 + pad) / 128) * 128) - bx, ph: Math.min(full.ph, Math.ceil((y1 + pad) / 128) * 128) - by };
  if (t.pw < 1 || t.ph < 1) return;
  for (const e of emits) {
    e.x -= bx;
    e.y -= by;
  }
  for (const g of list)
    for (let i = 0; i <= g.n; i++) {
      g.path[i * 2]! -= bx;
      g.path[i * 2 + 1]! -= by;
    }
  const mask = poolMask(list, t, R, pool);
  const { c: ink, ctx: ax } = buffer('a', t.pw, t.ph);
  ax.lineCap = 'round';
  ax.lineJoin = 'round';
  const c0 = guideColor(guide, 0);
  const lift = Math.max(1, R * 0.06);
  // place dans le dégradé : du départ (0) à la portée pleine (1)
  const colAt = (g: Grain, u: number) => guideColor(guide, clamp(g.far * ((g.from + u * (g.n - g.from)) / g.n)));
  // le long d'une traînée : une comète s'éteint vers sa queue, une traînée pleine s'effile aux deux bouts
  const shape = (u: number) => u * (1 - focus * focus) + Math.sin(Math.PI * clamp(0.08 + u * 0.84)) ** 0.6 * focus * focus;

  if (matter === 'dust') {
    // voile : la poussière la plus fine ne se distingue pas grain par grain
    if (focus < 0.7) {
      const hr = reach * grow * 0.9;
      for (const e of emits) {
        const rg = ax.createRadialGradient(e.x, e.y, 0, e.x, e.y, hr);
        rg.addColorStop(0, tone(c0, 0, 0.05 * (1 - focus) * (0.4 + density)));
        rg.addColorStop(1, tone(c0, 0, 0));
        ax.fillStyle = rg;
        ax.fillRect(e.x - hr, e.y - hr, hr * 2, hr * 2);
      }
    }
    if (mask) {
      layMask(ax, mask.c, tone(c0, -0.1), 0.55);
      layMask(ax, mask.c, tone(c0, -0.5), 0.3, [-lift * 0.6, -lift * 0.6]);
    }
    for (const g of list) {
      const col = colAt(g, 1);
      const k = (g.lit - 0.5) * 0.5;
      streak(ax, g, (u) => ({ w: Math.max(0.4, g.sz * 0.3), a: 0.45 * shape(u) * (0.5 + 0.5 * g.lit), c: tone(colAt(g, u), k) }));
      const rad = Math.max(0.35, g.sz * 0.36);
      ax.fillStyle = tone(col, k, 0.35 + 0.5 * g.lit);
      const [hx, hy] = [g.path[g.n * 2]!, g.path[g.n * 2 + 1]!];
      if (rad < 0.9) ax.fillRect(hx - rad, hy - rad, rad * 2, rad * 2);
      else {
        ax.beginPath();
        ax.arc(hx, hy, rad, 0, Math.PI * 2);
        ax.fill();
      }
    }
  } else if (matter === 'light') {
    ax.globalCompositeOperation = 'lighter';
    if (mask) layMask(ax, mask.c, tone(c0, 0.35), 0.5, undefined, 'lighter');
    for (const g of list) {
      streak(ax, g, (u) => ({ w: g.sz * 1.7, a: 0.13 * shape(u), c: colAt(g, u) }));
      streak(ax, g, (u) => ({ w: Math.max(0.6, g.sz * 0.36), a: (0.45 + 0.55 * g.lit) * shape(u), c: tone(colAt(g, u), 0.55) }));
      const col = colAt(g, 1);
      const [hx, hy] = [g.path[g.n * 2]!, g.path[g.n * 2 + 1]!];
      const rad = Math.max(0.5, g.sz * (0.3 + 0.35 * g.lit));
      ax.fillStyle = tone(col, 0, 0.16);
      ax.beginPath();
      ax.arc(hx, hy, rad * 3.2, 0, Math.PI * 2);
      ax.fill();
      ax.fillStyle = tone(col, 0.8, 0.6 + 0.4 * g.lit);
      ax.beginPath();
      ax.arc(hx, hy, rad, 0, Math.PI * 2);
      ax.fill();
      // quelques points éclatent en étoile
      if (g.lit > 0.965) {
        const L = rad * 7;
        ax.strokeStyle = 'rgba(255,255,255,0.85)';
        ax.lineWidth = Math.max(0.5, rad * 0.4);
        ax.beginPath();
        ax.moveTo(hx - L, hy);
        ax.lineTo(hx + L, hy);
        ax.moveTo(hx, hy - L);
        ax.lineTo(hx, hy + L);
        ax.stroke();
      }
    }
    // halo : la lumière bave autour d'elle
    const { c: copy, ctx: cx } = buffer('c', t.pw, t.ph);
    cx.drawImage(ink, 0, 0);
    ax.globalAlpha = 0.7;
    drawBlurred(ax, copy, Math.min(14, Math.max(1.5, R * 0.14)));
    ax.globalAlpha = 1;
    ax.globalCompositeOperation = 'source-over';
  } else if (matter === 'water') {
    if (mask) {
      // zone mouillée : le fond fonce, le bord accroche la lumière d'un côté et porte une ombre de l'autre
      layMask(ax, mask.c, tone(c0, -0.45), 0.2);
      layMask(ax, mask.c, tone(c0, -0.6), 0.5, [-lift, -lift]);
      layMask(ax, mask.c, 'rgb(255,255,255)', 0.8, [lift, lift]);
    }
    for (const g of list) {
      const col = colAt(g, 1);
      const [hx, hy] = [g.path[g.n * 2]!, g.path[g.n * 2 + 1]!];
      const rad = g.sz * (0.35 + 1.5 * g.lit * g.lit);
      streak(ax, g, (u) => ({ w: Math.max(0.5, rad * 0.9), a: 0.2 * shape(u), c: tone(colAt(g, u), -0.2) }));
      streak(ax, g, (u) => ({ w: Math.max(0.35, rad * 0.22), a: 0.5 * shape(u), c: 'rgb(255,255,255)' }));
      if (mask?.taken(hx, hy)) continue;
      if (rad < 0.9) {
        // bruine : trop fine pour avoir un reflet
        ax.fillStyle = tone(col, 0.45, 0.55);
        ax.fillRect(hx - rad, hy - rad, rad * 2, rad * 2);
        continue;
      }
      ax.fillStyle = tone(col, -0.2, 0.22);
      ax.beginPath();
      ax.arc(hx, hy, rad, 0, Math.PI * 2);
      ax.fill();
      ax.strokeStyle = tone(col, -0.55, 0.5);
      ax.lineWidth = Math.max(0.5, rad * 0.2);
      ax.beginPath();
      ax.arc(hx, hy, rad * 0.92, -Math.PI * 0.2, Math.PI * 0.7);
      ax.stroke();
      ax.fillStyle = 'rgba(255,255,255,0.3)';
      ax.beginPath();
      ax.arc(hx + rad * 0.3, hy + rad * 0.3, rad * 0.4, 0, Math.PI * 2);
      ax.fill();
      ax.fillStyle = 'rgba(255,255,255,0.9)';
      ax.beginPath();
      ax.arc(hx - rad * 0.36, hy - rad * 0.36, Math.max(0.4, rad * 0.26), 0, Math.PI * 2);
      ax.fill();
    }
  } else {
    if (mask) {
      layMask(ax, mask.c, tone(c0, -0.2), 0.7);
      layMask(ax, mask.c, 'rgb(255,255,255)', 0.35, [lift * 0.6, lift * 0.6]);
    }
    const fleck = (x: number, y: number, sz: number, base: string, lit: number, rot: number) => {
      // chaque éclat accroche la lumière différemment
      ax.fillStyle = lit > 0.85 ? tone(base, 0.75) : lit < 0.3 ? tone(base, -0.35) : tone(base, (lit - 0.5) * 0.5);
      ax.save();
      ax.translate(x, y);
      ax.rotate(rot);
      if (lit * 7 - Math.floor(lit * 7) < 0.5) ax.fillRect(-sz / 2, -sz / 2, sz, sz);
      else {
        ax.beginPath();
        for (let h = 0; h < 6; h++) ax.lineTo(Math.cos((h * Math.PI) / 3) * sz * 0.6, Math.sin((h * Math.PI) / 3) * sz * 0.6);
        ax.fill();
      }
      ax.restore();
      // scintillement : une petite croix de lumière
      if (lit > 0.965) {
        const L = sz * 2.6;
        ax.strokeStyle = 'rgba(255,255,255,0.9)';
        ax.lineWidth = Math.max(0.6, sz * 0.18);
        ax.beginPath();
        ax.moveTo(x - L, y);
        ax.lineTo(x + L, y);
        ax.moveTo(x, y - L);
        ax.lineTo(x, y + L);
        ax.stroke();
      }
    };
    for (const g of list) {
      const sz = Math.max(1, g.sz * 1.6);
      streak(ax, g, (u) => ({ w: Math.max(0.4, sz * 0.16), a: 0.3 * shape(u), c: tone(colAt(g, u), 0.3) }));
      // resserrées, les paillettes s'égrènent le long du chemin
      const segs = g.n - g.from;
      if (segs >= 3)
        for (const u of [0.35, 0.7]) {
          const i = g.from + Math.round(u * segs);
          fleck(g.path[i * 2]!, g.path[i * 2 + 1]!, sz * (0.45 + 0.3 * u), colAt(g, u), (g.lit * (3 + u * 5)) % 1, g.rot + u * 2);
        }
      fleck(g.path[g.n * 2]!, g.path[g.n * 2 + 1]!, sz, colAt(g, 1), g.lit, g.rot);
    }
  }
  dst.save();
  dst.globalAlpha = matter === 'glitter' ? Math.min(1, 0.5 + 0.5 * s.opacity) : s.opacity;
  dst.drawImage(ink, bx, by);
  dst.restore();
}
