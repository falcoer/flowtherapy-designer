import { paintStroke, type Target } from './brush';
import { guideColor, layerBox, shapePath, type Doc, type Layer, type Pt } from './model';
import type { Format } from '@ftd/core';

/**
 * Rendu de la scène sur un canevas 2D. Chaque couche est dessinée dans sa
 * découpe : ombre (déduite de sa hauteur et de la lumière unique), matière
 * (support, photo, forme), peinture, puis un liseré d'épaisseur côté lumière.
 */

const images = new Map<string, HTMLImageElement>();
export function imageFor(src: string, onLoad: () => void): HTMLImageElement | null {
  let im = images.get(src);
  if (!im) {
    im = new Image();
    im.onload = onLoad;
    im.src = src;
    images.set(src, im);
  }
  return im.complete && im.naturalWidth ? im : null;
}

/** Contour de la découpe, en unités du format. */
export function maskPath(l: Layer, f: Format): Pt[] {
  const b = layerBox(l, f);
  const m = l.mask ?? (l.shape ? shapePath(l.shape) : null);
  const local = m ?? [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  return local.map((p) => ({ x: b.cx + (p.x - 0.5) * b.w, y: b.cy + (p.y - 0.5) * b.h }));
}

export function tracePath(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}

/** Point dans un polygone (règle pair-impair). */
export function inside(pts: Pt[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** Peinture d'une couche, mise en cache à la résolution d'affichage. */
interface PaintCache {
  canvas: HTMLCanvasElement;
  key: string;
  done: number;
}
const paints = new Map<string, PaintCache>();

export function paintTarget(l: Layer, f: Format, pxPerUnit: number): Target {
  const b = layerBox(l, f);
  // au plus 2048 px de côté
  const k = Math.min(pxPerUnit, 2048 / Math.max(b.w, b.h));
  return { pw: Math.max(1, Math.round(b.w * k)), ph: Math.max(1, Math.round(b.h * k)), pxPerMin: Math.min(f.width, f.height) * k };
}

export function paintFor(l: Layer, doc: Doc, f: Format, pxPerUnit: number): HTMLCanvasElement | null {
  if (!l.strokes.length) return null;
  const t = paintTarget(l, f, pxPerUnit);
  const key = `${t.pw}x${t.ph}:${JSON.stringify(doc.guides)}`;
  let c = paints.get(l.id);
  if (!c || c.key !== key || c.done > l.strokes.length) {
    const canvas = c?.canvas ?? document.createElement('canvas');
    canvas.width = t.pw;
    canvas.height = t.ph;
    c = { canvas, key, done: 0 };
    paints.set(l.id, c);
  }
  const ctx = c.canvas.getContext('2d')!;
  for (; c.done < l.strokes.length; c.done++) paintStroke(ctx, l.strokes[c.done]!, doc.guides, t);
  return c.canvas;
}

export function forgetPaint(id?: string) {
  if (id) paints.delete(id);
  else paints.clear();
}

/** Vecteur d'ombre : à l'opposé de la lumière, proportionnel à la hauteur. */
export function shadowVector(doc: Doc, height: number, minSide: number) {
  const a = ((doc.light + 180) * Math.PI) / 180;
  const d = height * 0.06 * minSide;
  return { dx: Math.sin(a) * d, dy: -Math.cos(a) * d, blur: height * 0.07 * minSide + 0.004 * minSide };
}

export interface DrawOptions {
  /** Pixels du canevas par unité du format (ombre et résolution de la peinture). */
  scale: number;
  /** Rotation de la vue (radians) : les décalages d'ombre du canevas ne la suivent pas. */
  rot?: number;
  onImage: () => void;
  /** Couche peinte en direct : aperçu dessiné par-dessus, dans sa découpe. */
  wet?: { id: string; canvas: HTMLCanvasElement };
}

/** Dessine les couches ; le contexte est déjà transformé en unités du format. */
export function drawLayers(ctx: CanvasRenderingContext2D, doc: Doc, f: Format, o: DrawOptions) {
  const minSide = Math.min(f.width, f.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, f.width, f.height);
  ctx.clip();
  for (const l of doc.layers) {
    if (!l.visible) continue;
    const path = maskPath(l, f);
    const b = layerBox(l, f);
    const x0 = b.cx - b.w / 2;
    const y0 = b.cy - b.h / 2;

    // ombre portée : la découpe remplie, décalée et floutée
    if (l.height > 0.001 && l.kind !== 'surface') {
      const s = shadowVector(doc, l.height, minSide);
      ctx.save();
      ctx.shadowColor = `rgba(20, 16, 30, ${0.3 + 0.3 * l.height})`;
      const cr = Math.cos(o.rot ?? 0);
      const sr = Math.sin(o.rot ?? 0);
      ctx.shadowOffsetX = (s.dx * cr - s.dy * sr) * o.scale;
      ctx.shadowOffsetY = (s.dx * sr + s.dy * cr) * o.scale;
      ctx.shadowBlur = s.blur * o.scale;
      ctx.fillStyle = '#000';
      tracePath(ctx, path);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    tracePath(ctx, path);
    ctx.clip();
    // matière
    if (l.kind === 'photo' && l.src) {
      const im = imageFor(l.src, o.onImage);
      if (im) {
        const k = Math.max(b.w / im.naturalWidth, b.h / im.naturalHeight);
        const w = im.naturalWidth * k;
        const h = im.naturalHeight * k;
        ctx.drawImage(im, b.cx - w / 2, b.cy - h / 2, w, h);
      } else {
        ctx.fillStyle = '#ccc';
        ctx.fillRect(x0, y0, b.w, b.h);
      }
    } else {
      const g = doc.guides[l.guide];
      if (g?.type === 'gradient') {
        const grad = ctx.createLinearGradient(x0, y0, x0, y0 + b.h);
        g.stops.forEach((c, i) => grad.addColorStop(i / Math.max(1, g.stops.length - 1), c));
        ctx.fillStyle = grad;
      } else ctx.fillStyle = guideColor(g);
      ctx.fillRect(x0, y0, b.w, b.h);
    }
    // peinture
    const paint = paintFor(l, doc, f, o.scale);
    if (paint) ctx.drawImage(paint, x0, y0, b.w, b.h);
    if (o.wet?.id === l.id) ctx.drawImage(o.wet.canvas, x0, y0, b.w, b.h);

    // épaisseur : bord éclairé côté lumière, bord sombre à l'opposé
    if (l.height > 0.001 && l.kind !== 'surface') {
      const a = (doc.light * Math.PI) / 180;
      const lx = Math.sin(a);
      const ly = -Math.cos(a);
      const r = Math.max(b.w, b.h) / 2;
      const grad = ctx.createLinearGradient(b.cx + lx * r, b.cy + ly * r, b.cx - lx * r, b.cy - ly * r);
      grad.addColorStop(0, `rgba(255,255,255,${0.25 + 0.35 * l.height})`);
      grad.addColorStop(0.5, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, 'rgba(0,0,0,0)');
      grad.addColorStop(1, `rgba(0,0,0,${0.15 + 0.25 * l.height})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = (0.004 + 0.01 * l.height) * minSide;
      tracePath(ctx, path);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

/** Damier de transparence sous la page. */
export function drawChecker(ctx: CanvasRenderingContext2D, f: Format) {
  const s = Math.min(f.width, f.height) / 24;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, f.width, f.height);
  ctx.fillStyle = '#ececec';
  for (let y = 0; y < f.height; y += s)
    for (let x = ((y / s) % 2) * s; x < f.width; x += 2 * s) ctx.fillRect(x, y, Math.min(s, f.width - x), Math.min(s, f.height - y));
  ctx.restore();
}
