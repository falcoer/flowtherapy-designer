import type { Format } from '@ftd/core';
import { applyPixelFx, fxOf } from './fx';
import type { Doc, SceneLook } from './model';
import { lightAt } from './scene';

/**
 * Rendu de la scène : ce que l'appareil photo fait de la page entière, après la lumière.
 * Une transformation (cartoon, trame, risographie…) posée sur toute la scène,
 * puis l'objectif : distorsion (barillet ↔ coussinet), vignettage, franges colorées.
 */

export const lookOn = (doc: Doc): SceneLook | undefined => {
  const s = doc.scene;
  if (!s) return undefined;
  const lens = s.lens;
  const lensOn = !!lens && (Math.abs(lens.warp) > 0.005 || lens.vignette > 0.005 || lens.fringe > 0.005);
  return s.fx || lensOn ? s : undefined;
};

export const lensOn = (s: SceneLook) => !!s.lens && (Math.abs(s.lens.warp) > 0.005 || s.lens.vignette > 0.005 || s.lens.fringe > 0.005);

/**
 * Applique le rendu de la scène à un canevas qui contient la page entière (0,0 → f.width,f.height).
 * `quick` : l'objectif seul, sans la transformation (pendant un geste).
 */
export function applySceneLook(c: HTMLCanvasElement, doc: Doc, f: Format, quick = false) {
  const s = lookOn(doc);
  if (!s || c.width < 2 || c.height < 2) return;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  if (s.fx && !quick && fxOf(s.fx.id)?.pixel) {
    const li = lightAt(doc, f, f.width / 2, f.height / 2);
    const n = doc.guides.length;
    // les teintes de la transformation restent dans la palette, même raccourcie
    const fx = { ...s.fx, guides: n ? s.fx.guides.map((g) => Math.min(Math.max(0, g), n - 1)) : [] };
    applyPixelFx(img, [fx], doc.guides, Math.min(c.width, c.height), li.lx, li.ly);
  }
  const out = lensOn(s) ? lens(img, s.lens!, quick) : img;
  ctx.putImageData(out, 0, 0);
  ctx.restore();
}

/** L'objectif : chaque pixel va chercher sa couleur un peu plus loin (barillet) ou plus près (coussinet) du centre. */
function lens(img: ImageData, L: NonNullable<SceneLook['lens']>, quick: boolean): ImageData {
  const { width: w, height: h, data: src } = img;
  const out = new ImageData(w, h);
  const dst = out.data;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const R = Math.hypot(cx, cy) || 1;
  const k = L.warp * 0.32;
  // barillet : on resserre pour que les coins restent pleins
  const fill = k > 0 ? 1 / (1 + k) : 1;
  // franges colorées : le rouge s'écarte vers les bords, le bleu se resserre (un peu au centre, jusqu'à ~3 % du rayon au bord)
  const fr = L.fringe * 0.03;
  const vig = L.vignette;
  const sample = (x: number, y: number, ch: number): number => {
    if (x < 0) x = 0;
    else if (x > w - 1) x = w - 1;
    if (y < 0) y = 0;
    else if (y > h - 1) y = h - 1;
    if (quick) return src[((Math.round(y) * w + Math.round(x)) << 2) + ch]!;
    const x0 = x | 0;
    const y0 = y | 0;
    const x1 = x0 < w - 1 ? x0 + 1 : x0;
    const y1 = y0 < h - 1 ? y0 + 1 : y0;
    const tx = x - x0;
    const ty = y - y0;
    const a = src[((y0 * w + x0) << 2) + ch]!;
    const b = src[((y0 * w + x1) << 2) + ch]!;
    const c = src[((y1 * w + x0) << 2) + ch]!;
    const d = src[((y1 * w + x1) << 2) + ch]!;
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  };
  for (let y = 0; y < h; y++) {
    const v = (y - cy) / R;
    for (let x = 0; x < w; x++) {
      const u = (x - cx) / R;
      const r2 = u * u + v * v;
      const m = (1 + k * r2) * fill;
      const o = (y * w + x) << 2;
      const gx = cx + u * m * R;
      const gy = cy + v * m * R;
      let r: number, g: number, b: number;
      if (fr > 0) {
        // décalage le long du rayon, en pixels : déjà visible près du centre, plus fort vers les bords
        const rr = Math.sqrt(r2);
        const d = fr * R * (0.25 + rr * rr * rr);
        const n = Math.max(rr, 0.12);
        const dx = (u / n) * d;
        const dy = (v / n) * d;
        r = sample(gx + dx, gy + dy, 0);
        g = sample(gx, gy, 1);
        b = sample(gx - dx, gy - dy, 2);
      } else {
        r = sample(gx, gy, 0);
        g = sample(gx, gy, 1);
        b = sample(gx, gy, 2);
      }
      let a = sample(gx, gy, 3);
      if (vig > 0) {
        // assombri vers les bords, doucement
        const t = Math.min(1, Math.max(0, (Math.sqrt(r2) - 0.35) / 0.7));
        const dark = 1 - vig * 0.8 * t * t * (3 - 2 * t);
        r *= dark;
        g *= dark;
        b *= dark;
        if (a < 255) a = a + (255 - a) * (1 - dark) * 0.6;
      }
      dst[o] = r;
      dst[o + 1] = g;
      dst[o + 2] = b;
      dst[o + 3] = a;
    }
  }
  return out;
}
