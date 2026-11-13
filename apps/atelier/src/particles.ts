import { buffer, drawBlurred, LEAN, rasterDrops, rng, stretch, type Target } from './brush';
import { guideColor, type Guide, type Stroke } from './model';

/**
 * Moteur Jet : la pointe lâche des grains qui voyagent un moment. Ouvert, c'est un nuage ; resserré,
 * les grains partent ensemble et leur chemin reste visible (comètes, puis traînées). Le rendu dit
 * comment un grain se dessine : poussière mate, lumière qui s'additionne, goutte d'eau, paillette,
 * voile de peinture (bombe), volute de fumée, étincelle qui retombe, brin de poil.
 */
export type Matter = 'dust' | 'light' | 'water' | 'glitter' | 'spray' | 'smoke' | 'spark' | 'hair';

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
const COUNT: Record<Matter, number> = { dust: 2.4, light: 1, water: 1.3, glitter: 0.7, spray: 1, smoke: 0.45, spark: 0.55, hair: 1 };
const MAX_GRAINS = 14000;

/** Le geste : points en pixels, longueur, et position (avec pression et inclinaison) à une distance donnée. */
function track(s: Stroke, t: Target) {
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
  const R = Math.max(1, s.size * t.pxPerMin);
  const moving = total > R * 0.5;
  // pointe immobile et resserrée : une gerbe de quelques rayons, toujours les mêmes pour ce trait
  const r0 = rng(s.seed ^ 0x5bd1);
  const rays = 5 + Math.floor(r0() * 4);
  const rayAt = Array.from({ length: rays }, (_, j) => r0() * 0.5 + (j / rays) * Math.PI * 2);
  /** Direction du jet au départ placé à la distance d : celle du geste ; à l'arrêt, celle où penche la pointe, sinon aucune. */
  const heading = (d: number, sp: number, e: { K: number; d: number }) => {
    if (moving) {
      const a = at(d - sp);
      const b = at(d + sp);
      return Math.atan2(b.y - a.y, b.x - a.x);
    }
    return e.K > 0.06 ? e.d : null;
  };
  return { at, total, R, moving, rays, rayAt, heading };
}

/** Physique propre à certains rendus : la fumée monte et tourbillonne, l'étincelle retombe, les autres flottent. */
const RISE: Partial<Record<Matter, number>> = { smoke: -0.55, spark: 1.7 };

function grains(s: Stroke, t: Target, matter: Matter) {
  const focus = clamp(s.focus ?? 0);
  const bend = clamp(s.bend ?? 0, -1, 1);
  const density = clamp(s.density ?? 0.5);
  const grow = clamp(s.grow ?? 1, 0.05, 1);
  const { at, total, R, moving, rays, rayAt, heading } = track(s, t);
  // resserré, le jet porte plus loin ; la portée pleine fixe la courbe, la poussée ne fait que l'allonger
  const reach = R * (1.3 + 2.9 * focus) * (matter === 'smoke' ? 1.6 : 1);
  const trail = matter === 'smoke' ? 1 : matter === 'spark' ? Math.max(0.45, smooth(0.12, 0.78, focus)) : smooth(0.12, 0.78, focus);
  const sigma = Math.PI * 0.9 * (1 - focus) ** 1.6 + 0.045;
  const rise = RISE[matter] ?? 0;
  const sp = Math.max(2, R * 0.3);
  const starts = moving ? Math.floor(total / sp) + 1 : 1;
  // budget de grains : un geste très long garde tous ses départs, chacun lâche moins de grains
  // (les premiers de chaque départ restent les mêmes : le trait s'éclaircit sans se redistribuer)
  const typical = (12 - 6 * trail) * (0.3 + 1.4 * density) * 1.3 * COUNT[matter] * clamp(R / 36, 0.3, 1.6) ** 0.7;
  const thin = Math.min(1, MAX_GRAINS / (starts * Math.max(1, typical)));
  const stride = Math.max(1, Math.ceil(starts / MAX_GRAINS));
  const out: Grain[] = [];
  const emits: Array<{ x: number; y: number; p: number }> = [];
  for (let k = 0; k < starts && out.length < MAX_GRAINS; k++) {
    if (k % stride) continue;
    const e = at(k * sp);
    emits.push(e);
    const r = rng((s.seed ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0);
    // direction du jet : celle du geste ; à l'arrêt, celle où penche la pointe, sinon aucune
    const dir = heading(k * sp, sp, e);
    const base = (12 - 6 * trail) * (0.3 + 1.4 * density) * (0.5 + 0.8 * e.p) * COUNT[matter] * clamp(R / 36, 0.3, 1.6) ** 0.7;
    // à l'arrêt, la pointe continue de lâcher des grains tant qu'elle reste posée
    const n = Math.max(1, Math.round(moving ? base * thin : base * 8 * (0.3 + 0.7 * grow)));
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
      // la fumée reste turbulente même en filet ; l'étincelle file droit
      const wander = matter === 'smoke' ? 0.35 + 0.6 * (1 - focus) : matter === 'spark' ? 0.08 * (1 - focus) : 1.2 * (1 - focus) ** 2;
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
        // la fumée monte d'un pas régulier ; l'étincelle tombe de plus en plus vite
        if (rise) oy += rise * ds * (rise > 0 ? j / steps : 1);
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

/**
 * Poils : chaque départ plante des brins dans la largeur de la brosse, couchés dans le sens du geste.
 * Le chemin du grain est le brin entier ; la Frisure l'ondule puis l'enroule, la Courbure les couche tous du même côté.
 */
function strands(s: Stroke, t: Target) {
  const { at, total, R, moving, rays, rayAt, heading } = track(s, t);
  const lenK = (s.hairLen ?? 0.3) / 0.3;
  const curl = clamp(s.curl ?? 0);
  const bend = clamp(s.bend ?? 0, -1, 1);
  const density = clamp(s.density ?? 0.5);
  const sp = Math.max(2, R * 0.3);
  const starts = moving ? Math.floor(total / sp) + 1 : 1;
  const segs = curl < 0.02 ? 6 : Math.round(10 + curl * 26);
  // autant de brins qu'avant le moteur Jet à densité moyenne : la laine est plus fournie que le poil raide
  const per = (rad: number) => 1.2 * (2 + rad * 0.12) * (1 + curl * 0.8) * (sp / Math.max(1, rad * 0.22)) * (0.3 + 1.4 * density);
  const typical = per(R * 0.74);
  const thin = Math.min(1, MAX_GRAINS / (starts * Math.max(1, typical)));
  const stride = Math.max(1, Math.ceil(starts / MAX_GRAINS));
  const out: Grain[] = [];
  const emits: Array<{ x: number; y: number; p: number }> = [];
  for (let k = 0; k < starts && out.length < MAX_GRAINS; k++) {
    if (k % stride) continue;
    const e = at(k * sp);
    emits.push(e);
    const r = rng((s.seed ^ Math.imul(k + 1, 0x27d4eb2f)) >>> 0);
    const rad = R * (0.35 + 0.65 * e.p);
    const head = heading(k * sp, sp, e);
    const n = Math.max(1, Math.round(per(rad) * (moving ? thin : 2)));
    for (let i = 0; i < n && out.length < MAX_GRAINS; i++) {
      const dir = head ?? rayAt[Math.floor(r() * rays)]!;
      const o = (r() * 2 - 1) * rad;
      const [ox, oy] = stretch(-Math.sin(dir) * o, Math.cos(dir) * o, e.K, e.d);
      let x = e.x + ox;
      let y = e.y + oy;
      // le brin part dans le sens du geste, un peu dévié (la laine part dans tous les sens)
      const ang = dir + (r() - 0.5) * (0.5 + curl * 2.2);
      const len = rad * (0.8 + r() * 1.4) * lenK;
      const sway = (r() - 0.5) * 2;
      const lay = bend * 1.6 * (0.8 + 0.4 * r());
      const waves = 1 + curl * 5 + r() * 1.5;
      const amp = curl < 0.02 ? 0 : Math.min(1, curl * 1.6) * 1.1;
      const spin = Math.max(0, (curl - 0.55) / 0.45) * Math.PI * 2 * (2 + r() * 2) * (r() < 0.5 ? -1 : 1);
      const phase = r() * Math.PI * 2;
      const dl = len / segs;
      const path = new Float32Array((segs + 1) * 2);
      path[0] = x;
      path[1] = y;
      for (let j = 1; j <= segs; j++) {
        const u = (j - 0.5) / segs;
        const a = ang + sway * (u - 0.5) + lay * u + amp * Math.sin(phase + u * waves * Math.PI * 2) + spin * u;
        x += Math.cos(a) * dl;
        y += Math.sin(a) * dl;
        path[j * 2] = x;
        path[j * 2 + 1] = y;
      }
      // far : place du départ le long du geste, pour suivre le dégradé comme les autres pinceaux
      out.push({ path, n: segs, from: 0, sz: Math.max(0.5, rad * (0.035 + curl * 0.02)), lit: r(), rot: 0, far: total ? (k * sp) / total : 0 });
    }
  }
  return { list: out, emits, R, reach: R * 2.2 * lenK, focus: 1, grow: 1, density };
}

const MAX_DROPS = 400000;
/**
 * Bombe : un voile de gouttelettes autour de la buse. Resserrée, la peinture est projetée en avant
 * (éclaboussures, plus grosses au loin) ; la Courbure courbe la projection. Les gouttes sont posées
 * pixel par pixel comme l'ancien pistolet, bien moins cher qu'en disques du canevas.
 */
function veil(dst: CanvasRenderingContext2D, s: Stroke, guides: Guide[], t: Target) {
  const guide = guides[s.guide];
  const focus = clamp(s.focus ?? 0);
  const bend = clamp(s.bend ?? 0, -1, 1);
  const density = clamp(s.density ?? 0.5);
  const grow = clamp(s.grow ?? 1, 0.05, 1);
  const { at, total, R, moving, rays, rayAt, heading } = track(s, t);
  const reach = R * (1.3 + 2.9 * focus);
  const sigma = Math.PI * 0.9 * (1 - focus) ** 1.6 + 0.045;
  const sp = Math.max(1.5, R * 0.12);
  const starts = moving ? Math.floor(total / sp) + 1 : 1;
  // teintes du dégradé, lues une fois
  const pal = Array.from({ length: 65 }, (_, i) => rgbOf(guideColor(guide, i / 64)));
  const count = (p: number) => (7.4 + 0.69 * R) * (0.3 + 1.4 * density) * (0.5 + 0.8 * p);
  const thin = Math.min(1, MAX_DROPS / (starts * count(0.6)));
  let cap = 4096;
  let D = new Float32Array(cap * 7);
  let n = 0;
  for (let k = 0; k < starts && n < MAX_DROPS; k++) {
    const e = at(k * sp);
    const r = rng((s.seed ^ Math.imul(k + 1, 0x85ebca6b)) >>> 0);
    const dir = heading(k * sp, sp, e);
    const frac = total ? (k * sp) / total : 0;
    const m = Math.max(1, Math.round(count(e.p) * (moving ? thin : 10 * (0.3 + 0.7 * grow))));
    for (let i = 0; i < m && n < MAX_DROPS; i++) {
      // répartition gaussienne autour de la buse, étirée quand la bombe penche
      const u = Math.max(1e-6, r());
      const rad = Math.sqrt(-2 * Math.log(u)) * R * 0.53 * (1 - 0.6 * focus);
      const a = r() * Math.PI * 2;
      let [x, y] = stretch(Math.cos(a) * rad, Math.sin(a) * rad, e.K, e.d);
      // projection : la goutte part dans le sens du jet et suit un arc
      const L = reach * grow * focus * (0.15 + 0.85 * r());
      if (L > 0.5) {
        const gauss = Math.sqrt(-2 * Math.log(Math.max(1e-6, r()))) * Math.cos(r() * Math.PI * 2);
        const ang = (dir ?? rayAt[Math.floor(r() * rays)]!) + gauss * sigma;
        const th = (bend * 2.6 * L) / reach;
        if (Math.abs(th) < 1e-3) {
          x += Math.cos(ang) * L;
          y += Math.sin(ang) * L;
        } else {
          const rho = L / th;
          x += rho * (Math.sin(ang + th) - Math.sin(ang));
          y += rho * (Math.cos(ang) - Math.cos(ang + th));
        }
      }
      const far = L / reach;
      const d = (0.3 + r() * Math.max(0.6, R * 0.025)) * (1 + 2.5 * focus * far);
      const [cr, cg, cb] = pal[Math.round(clamp(frac * (1 - focus) + far * focus) * 64)]!;
      if (n === cap) {
        const more = new Float32Array(cap * 2 * 7);
        more.set(D);
        D = more;
        cap *= 2;
      }
      const o = n * 7;
      D[o] = e.x + x;
      D[o + 1] = e.y + y;
      D[o + 2] = d;
      D[o + 3] = s.opacity * (0.25 + 0.5 * r());
      D[o + 4] = cr;
      D[o + 5] = cg;
      D[o + 6] = cb;
      n++;
    }
  }
  rasterDrops(dst, D, n, t);
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
  if (matter === 'spray') return veil(dst, s, guides, full);
  const guide = guides[s.guide];
  const { list, emits, R, reach, focus, grow, density } = matter === 'hair' ? strands(s, full) : grains(s, full, matter);
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
  } else if (matter === 'smoke') {
    // volutes : chaque grain laisse un ruban large et très pâle qui s'élargit en montant, puis tout est fondu
    for (const g of list) {
      const k = (g.lit - 0.5) * 0.3;
      streak(ax, g, (u) => ({ w: R * (0.2 + 0.8 * u * g.far), a: 0.11 * (0.4 + density) * (1 - 0.5 * u) * (0.6 + 0.4 * g.lit), c: tone(colAt(g, u), k) }));
    }
    const { c: copy, ctx: cx } = buffer('c', t.pw, t.ph);
    cx.clearRect(0, 0, t.pw, t.ph);
    cx.drawImage(ink, 0, 0);
    ax.clearRect(0, 0, t.pw, t.ph);
    drawBlurred(ax, copy, Math.min(26, Math.max(2, R * 0.28)));
    ax.globalAlpha = 0.5;
    ax.drawImage(copy, 0, 0);
    ax.globalAlpha = 1;
  } else if (matter === 'spark') {
    // étincelles : traits fins, la tête chauffée à blanc, la queue refroidie à la couleur ; posées normalement
    // (une addition disparaîtrait sur un papier clair), puis une lueur additionnée qui se voit sur le sombre
    for (const g of list) {
      streak(ax, g, (u) => ({ w: Math.max(0.6, g.sz * 0.34), a: (0.45 + 0.55 * g.lit) * (0.2 + 0.8 * u), c: tone(colAt(g, u), -0.15 + 0.85 * u * u) }));
      const [hx, hy] = [g.path[g.n * 2]!, g.path[g.n * 2 + 1]!];
      const rad = Math.max(0.6, g.sz * (0.22 + 0.25 * g.lit));
      ax.fillStyle = tone(colAt(g, 1), -0.2, 0.5);
      ax.beginPath();
      ax.arc(hx, hy, rad * 1.6, 0, Math.PI * 2);
      ax.fill();
      ax.fillStyle = tone(colAt(g, 1), 0.92, 0.95);
      ax.beginPath();
      ax.arc(hx, hy, rad, 0, Math.PI * 2);
      ax.fill();
    }
    const { c: copy, ctx: cx } = buffer('c', t.pw, t.ph);
    cx.drawImage(ink, 0, 0);
    ax.globalCompositeOperation = 'lighter';
    ax.globalAlpha = 0.45;
    drawBlurred(ax, copy, Math.min(8, Math.max(1, R * 0.08)));
    ax.globalAlpha = 1;
    ax.globalCompositeOperation = 'source-over';
  } else if (matter === 'hair') {
    // brins : teintes voisines de la couleur, un peu plus fins vers la pointe ; chacun garde sa transparence, ils se fondent en se croisant
    const curl = clamp(s.curl ?? 0);
    const a = 0.35 + 0.5 * s.opacity;
    for (const g of list) {
      const col = tone(colAt(g, 1), (g.lit - 0.5) * 0.6 + curl * 0.08);
      streak(ax, g, (u) => ({ w: g.sz * (1 - 0.45 * u), a, c: col }));
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
  dst.globalAlpha = matter === 'glitter' ? Math.min(1, 0.5 + 0.5 * s.opacity) : matter === 'hair' ? 1 : s.opacity;
  dst.drawImage(ink, bx, by);
  dst.restore();
}
