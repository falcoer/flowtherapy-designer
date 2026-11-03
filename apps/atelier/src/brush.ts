import { guideColor, type Guide, type Stroke } from './model';

/**
 * Pinceau aquarelle. Un trait se rend en trois passes :
 * 1. une silhouette aux bords irréguliers (tampons ronds le long du trait,
 *    rayon modulé par la pression et un bruit doux) ;
 * 2. un lavis transparent de cette silhouette ;
 * 3. un liseré plus foncé sur les bords, là où le pigment s'accumule en séchant.
 * Le grain du papier creuse ensuite le lavis. Les traits se superposent en
 * mode « produit » : deux passages foncent, comme de vraies couches d'eau.
 */

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let grain: HTMLCanvasElement | null = null;
/** Grain de papier : bruit doux répété. */
function paperGrain(): HTMLCanvasElement {
  if (grain) return grain;
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(160, 160);
  const r = rng(7);
  for (let i = 0; i < 160 * 160; i++) {
    const v = r();
    img.data[i * 4 + 3] = v > 0.55 ? Math.round((v - 0.55) * 300) : 0;
  }
  ctx.putImageData(img, 0, 0);
  // adoucit le grain
  const s = document.createElement('canvas');
  s.width = s.height = 160;
  const sx = s.getContext('2d')!;
  sx.filter = 'blur(0.7px)';
  sx.drawImage(c, 0, 0);
  grain = s;
  return s;
}

const scratch = { a: null as HTMLCanvasElement | null, b: null as HTMLCanvasElement | null };
function buffer(key: 'a' | 'b', w: number, h: number) {
  let c = scratch[key];
  if (!c) c = scratch[key] = document.createElement('canvas');
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const ctx = c.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.clearRect(0, 0, w, h);
  return { c, ctx };
}

export interface Target {
  /** Taille du canevas de peinture de la couche, en pixels. */
  pw: number;
  ph: number;
  /** Pixels par unité du petit côté du format (pour convertir le rayon). */
  pxPerMin: number;
}

/** Tampons d'un trait : position en pixels, rayon, position relative le long du trait. */
function stamps(s: Stroke, t: Target) {
  const r = rng(s.seed);
  const out: Array<{ x: number; y: number; r: number; t: number }> = [];
  const pts = s.pts.map((p) => ({ x: p.x * t.pw, y: p.y * t.ph, p: p.p ?? 0.6 }));
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  let along = 0;
  const base = s.size * t.pxPerMin;
  let phase = r() * 10;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[i + 1] ?? a;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const rad0 = base * (0.35 + 0.65 * a.p);
    const step = Math.max(1, rad0 * 0.22);
    const n = Math.max(1, Math.ceil(d / step));
    for (let k = 0; k < n; k++) {
      const f = k / n;
      phase += 0.21;
      const wobble = 1 + 0.16 * Math.sin(phase) + 0.1 * Math.sin(phase * 2.7 + 1) + (r() - 0.5) * 0.14;
      const p = a.p + (b.p - a.p) * f;
      out.push({
        x: a.x + (b.x - a.x) * f + (r() - 0.5) * rad0 * 0.25,
        y: a.y + (b.y - a.y) * f + (r() - 0.5) * rad0 * 0.25,
        r: base * (0.35 + 0.65 * p) * wobble,
        t: total ? (along + d * f) / total : 0,
      });
      if (d === 0) break;
    }
    along += d;
  }
  return out;
}

/** Rend un trait aquarelle dans le canevas de peinture d'une couche. */
export function paintStroke(dst: CanvasRenderingContext2D, s: Stroke, guides: Guide[], t: Target) {
  const { c: sil, ctx: sx } = buffer('a', t.pw, t.ph);
  const g = guides[s.guide];
  for (const st of stamps(s, t)) {
    sx.fillStyle = guideColor(g, st.t);
    sx.beginPath();
    sx.arc(st.x, st.y, Math.max(0.5, st.r), 0, Math.PI * 2);
    sx.fill();
  }
  // grain : le pigment se dépose moins dans les creux du papier
  sx.globalCompositeOperation = 'destination-out';
  sx.globalAlpha = 0.35;
  sx.fillStyle = sx.createPattern(paperGrain(), 'repeat')!;
  sx.fillRect(0, 0, t.pw, t.ph);

  // liseré : silhouette moins sa version floutée
  const { c: edge, ctx: ex } = buffer('b', t.pw, t.ph);
  ex.drawImage(sil, 0, 0);
  ex.globalCompositeOperation = 'destination-out';
  ex.filter = `blur(${Math.max(1, s.size * t.pxPerMin * 0.18)}px)`;
  ex.drawImage(sil, 0, 0);

  dst.save();
  dst.globalCompositeOperation = 'multiply';
  dst.globalAlpha = 0.42 * s.opacity;
  dst.drawImage(sil, 0, 0);
  dst.globalAlpha = 0.75 * s.opacity;
  dst.drawImage(edge, 0, 0);
  dst.restore();
}

/** Aperçu en direct pendant le geste : tampons translucides, sans liseré. */
export function previewStamps(ctx: CanvasRenderingContext2D, s: Stroke, guides: Guide[], t: Target, from: number) {
  const g = guides[s.guide];
  const all = stamps(s, t);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.05 * s.opacity;
  for (let i = from; i < all.length; i++) {
    const st = all[i]!;
    ctx.fillStyle = guideColor(g, st.t);
    ctx.beginPath();
    ctx.arc(st.x, st.y, Math.max(0.5, st.r), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  return all.length;
}
