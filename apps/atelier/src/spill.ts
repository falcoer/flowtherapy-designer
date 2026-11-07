import type { Format } from '@ftd/core';
import { paintStroke, type Target } from './brush';
import type { Ring } from './cut';
import { layerBox, type Guide, type Layer, type Stroke } from './model';
import { contours } from './text';

/**
 * Déborder : tampons, poils et ramures peuvent sortir de la découpe et la repousser.
 * Pendant le geste, l'encre se peint dans une fenêtre plus grande que la boîte de la couche
 * (`win`, en coordonnées de la boîte : 0..1 = la boîte) ; au lâcher, ses contours élargissent la découpe.
 */
export type Win = [number, number, number, number];

/** Pinceaux qui peuvent déborder. */
export const canSpill = (s: Pick<Stroke, 'brush'>) => s.brush === 'stamp' || s.brush === 'hair' || s.brush === 'branch';

/** Cible de peinture d'une fenêtre de la boîte, à la résolution `step` (pixels par unité du format) au plus. */
function winTarget(l: Layer, f: Format, win: Win, step: number): Target {
  const b = layerBox(l, f);
  const W = (win[2] - win[0]) * b.w;
  const H = (win[3] - win[1]) * b.h;
  const k = Math.min(step, 2048 / Math.max(W, H, 1e-6));
  return { pw: Math.max(1, Math.round(W * k)), ph: Math.max(1, Math.round(H * k)), pxPerMin: Math.min(f.width, f.height) * k };
}

/** Résolution de la peinture de la couche (même palier que paintTarget). */
const stepOf = (pxPerUnit: number) => 2 ** (Math.ceil(Math.log2(Math.max(1e-6, pxPerUnit)) * 4) / 4);

/** Fenêtre du geste : la boîte et, tout autour, de quoi couvrir la page où que la couche soit posée. */
export function spillWindow(l: Layer, f: Format, pxPerUnit: number): { win: Win; t: Target } {
  const b = layerBox(l, f);
  const P = Math.max(f.width, f.height);
  const win: Win = [-P / b.w, -P / b.h, 1 + P / b.w, 1 + P / b.h];
  return { win, t: winTarget(l, f, win, stepOf(pxPerUnit)) };
}

/** Le trait dans le repère de la fenêtre (simple translation en pixels : les empreintes restent identiques). */
export function inWin(s: Stroke, win: Win): Stroke {
  const [sx, sy] = [win[2] - win[0], win[3] - win[1]];
  return { ...s, pts: s.pts.map((p) => ({ ...p, x: (p.x - win[0]) / sx, y: (p.y - win[1]) / sy })) };
}

/**
 * Rectangle de l'encre posée sur un canevas (pixels), ou null s'il est vide. Le canevas du geste
 * peut faire 2048 px de côté : on le lit réduit (256 px au plus), ce qui suffit à situer l'encre,
 * avec un pixel réduit de marge tout autour.
 */
function inkBox(c: HTMLCanvasElement, th: number) {
  const { width: W, height: H } = c;
  const q = Math.min(1, 256 / Math.max(W, H));
  const [w, h] = [Math.max(1, Math.ceil(W * q)), Math.max(1, Math.ceil(H * q))];
  const s = document.createElement('canvas');
  s.width = w;
  s.height = h;
  const sx = s.getContext('2d', { willReadFrequently: true })!;
  sx.drawImage(c, 0, 0, w, h);
  const a = sx.getImageData(0, 0, w, h).data;
  s.width = s.height = 0;
  // réduite, une encre fine s'éclaircit : seuil abaissé d'autant
  const t = q < 1 ? Math.max(1, Math.floor(th * q)) : th;
  let [x0, y0, x1, y1] = [w, h, -1, -1];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (a[(y * w + x) * 4 + 3]! >= t) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  const pad = q < 1 ? 1 : 0;
  return { x0: Math.max(0, Math.floor((x0 - pad) / q)), y0: Math.max(0, Math.floor((y0 - pad) / q)), x1: Math.min(W, Math.ceil((x1 + 1 + pad) / q)), y1: Math.min(H, Math.ceil((y1 + 1 + pad) / q)) };
}

function ringArea(r: Ring) {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j]!.x + r[i]!.x) * (r[j]!.y - r[i]!.y);
  return Math.abs(s / 2);
}

/** Seuil d'encre (alpha sur 255) : en dessous, un voile trop léger pour pousser le bord. */
const INK = 40;

/**
 * Contours de l'encre du trait, en coordonnées de la boîte (elles sortent de 0..1 là où l'encre déborde).
 * `wet` : l'aperçu du geste dans la fenêtre `win`, qui situe l'encre ; elle est refaite nette autour.
 */
export function inkRings(l: Layer, f: Format, s: Stroke, guides: Guide[], pxPerUnit: number, wet: HTMLCanvasElement, win: Win): Ring[] {
  const box = inkBox(wet, INK / 2);
  if (!box) return [];
  const [sx, sy] = [(win[2] - win[0]) / wet.width, (win[3] - win[1]) / wet.height];
  // fenêtre serrée sur l'encre, avec une marge de quelques pixels de l'aperçu
  const m = 4;
  const tight: Win = [win[0] + (box.x0 - m) * sx, win[1] + (box.y0 - m) * sy, win[0] + (box.x1 + m) * sx, win[1] + (box.y1 + m) * sy];
  const t = winTarget(l, f, tight, stepOf(pxPerUnit));
  const c = document.createElement('canvas');
  c.width = t.pw;
  c.height = t.ph;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  paintStroke(ctx, inWin(s, tight), guides, t);
  const rings = contours(ctx.getImageData(0, 0, t.pw, t.ph).data, t.pw, t.ph, INK);
  c.width = c.height = 0;
  // poussières de grain : trop petites pour compter
  const dust = Math.max(4, (t.pxPerMin * 0.0015) ** 2);
  const [ux, uy] = [(tight[2] - tight[0]) / t.pw, (tight[3] - tight[1]) / t.ph];
  return rings.filter((r) => r.length >= 3 && ringArea(r) >= dust).map((r) => r.map((p) => ({ x: tight[0] + p.x * ux, y: tight[1] + p.y * uy })));
}
