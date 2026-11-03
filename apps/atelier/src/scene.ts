import { paintStroke, type Target } from './brush';
import { rng } from './brush';
import { pathToRings, ringsToPath, simplifyRing, type Ring } from './cut';
import { guideColor, layerBox, shapePath, type Doc, type Layer, type Pt, type ShapeKind } from './model';
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

const RECT = 'M0 0L1 0L1 1L0 1Z';
const shapeCuts = new Map<ShapeKind, string>();
export function shapeCut(k: ShapeKind): string {
  let d = shapeCuts.get(k);
  if (!d) shapeCuts.set(k, (d = ringsToPath([shapePath(k)], 0.0005)));
  return d;
}

/** Découpe d'une couche (tracé SVG, coordonnées de la couche). */
export function cutOf(l: Layer): string {
  return l.cut ?? (l.shape ? shapeCut(l.shape) : RECT);
}

/** Contours de la découpe en coordonnées de la couche. */
export function localRings(l: Layer): Ring[] {
  return pathToRings(cutOf(l));
}

/** Contours de la découpe en unités du format. */
export function maskRings(l: Layer, f: Format): Ring[] {
  return localRings(l).map((r) => r.map((p) => localToPage(l, f, p.x, p.y)));
}

/** Matrice coordonnées de la couche (0..1) → unités du format, rotation comprise. */
export function layerMatrix(l: Layer, f: Format): DOMMatrix {
  const b = layerBox(l, f);
  return new DOMMatrix()
    .translate(b.cx, b.cy)
    .rotate(((l.rot ?? 0) * 180) / Math.PI)
    .translate(-b.w / 2, -b.h / 2)
    .scale(b.w, b.h);
}

export function localToPage(l: Layer, f: Format, u: number, v: number): Pt {
  const b = layerBox(l, f);
  const r = l.rot ?? 0;
  const x = (u - 0.5) * b.w;
  const y = (v - 0.5) * b.h;
  return { x: b.cx + x * Math.cos(r) - y * Math.sin(r), y: b.cy + x * Math.sin(r) + y * Math.cos(r) };
}

export function pageToLocal(l: Layer, f: Format, x: number, y: number): Pt {
  const b = layerBox(l, f);
  const r = -(l.rot ?? 0);
  const dx = x - b.cx;
  const dy = y - b.cy;
  return { x: (dx * Math.cos(r) - dy * Math.sin(r)) / b.w + 0.5, y: (dx * Math.sin(r) + dy * Math.cos(r)) / b.h + 0.5 };
}

/** Rectangle serré de la découpe, en coordonnées de la couche. */
export function localBounds(l: Layer) {
  let [u0, v0, u1, v1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of localRings(l))
    for (const p of r) {
      u0 = Math.min(u0, p.x);
      v0 = Math.min(v0, p.y);
      u1 = Math.max(u1, p.x);
      v1 = Math.max(v1, p.y);
    }
  return u0 === Infinity ? { u0: 0, v0: 0, u1: 1, v1: 1 } : { u0, v0, u1, v1 };
}

/** Encombrement de la découpe dans la page (rectangle aligné sur la page). */
export function pageBounds(l: Layer, f: Format) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of maskRings(l, f))
    for (const p of r) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  return { x0, y0, x1, y1 };
}

const paths = new Map<string, Path2D>();
/** Découpe en Path2D, en unités du format. */
export function maskPath2D(l: Layer, f: Format): Path2D {
  const d = cutOf(l);
  let local = paths.get(d);
  if (!local) {
    if (paths.size > 400) paths.clear();
    paths.set(d, (local = new Path2D(d)));
  }
  const p = new Path2D();
  p.addPath(local, layerMatrix(l, f));
  return p;
}

export function tracePath(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
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

const layerBuffers: HTMLCanvasElement[] = [];
let depth = 0;

/** Dessine les couches ; le contexte est déjà transformé en unités du format. */
export function drawLayers(ctx: CanvasRenderingContext2D, doc: Doc, f: Format, o: DrawOptions) {
  const minSide = Math.min(f.width, f.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, f.width, f.height);
  ctx.clip();
  for (const l of doc.layers) {
    if (!l.visible || (l.opacity ?? 1) <= 0) continue;
    // couche translucide : rendue à part, puis posée d'un bloc (son ombre ne transparaît pas)
    if ((l.opacity ?? 1) < 1) {
      const c = (layerBuffers[depth] ??= document.createElement('canvas'));
      c.width = ctx.canvas.width;
      c.height = ctx.canvas.height;
      const bx = c.getContext('2d')!;
      bx.setTransform(ctx.getTransform());
      depth++;
      drawLayers(bx, { ...doc, layers: [{ ...l, opacity: 1 }] }, f, o);
      depth--;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = l.opacity ?? 1;
      ctx.drawImage(c, 0, 0);
      ctx.restore();
      continue;
    }
    ctx.save();
    const path = maskPath2D(l, f);
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
      ctx.fill(path, 'evenodd');
      // le bord déborde de l'objet : il porte ombre lui aussi
      if (l.border && l.border.width > 0) {
        ctx.strokeStyle = '#000';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2 * l.border.width * minSide;
        ctx.stroke(path);
      }
      ctx.restore();
    }

    // bord : à l'extérieur de la découpe, en débordement de l'objet
    if (l.border && l.border.width > 0) {
      ctx.save();
      const outside = new Path2D();
      outside.rect(-f.width, -f.height, 3 * f.width, 3 * f.height);
      outside.addPath(path);
      ctx.clip(outside, 'evenodd');
      drawBorder(ctx, l, doc, f, path);
      ctx.restore();
    }

    ctx.save();
    ctx.clip(path, 'evenodd');
    // matière et peinture tournent avec la couche
    ctx.save();
    if (l.rot) {
      ctx.translate(b.cx, b.cy);
      ctx.rotate(l.rot);
      ctx.translate(-b.cx, -b.cy);
    }
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
    ctx.restore();

    // biseau : bord éclairé côté lumière, bord sombre à l'opposé
    const bevel = l.bevel ?? 0;
    if (bevel > 0.001 && l.kind !== 'surface') {
      const a = (doc.light * Math.PI) / 180;
      const lx = Math.sin(a);
      const ly = -Math.cos(a);
      const r = Math.max(b.w, b.h) / 2;
      const grad = ctx.createLinearGradient(b.cx + lx * r, b.cy + ly * r, b.cx - lx * r, b.cy - ly * r);
      grad.addColorStop(0, `rgba(255,255,255,${Math.min(0.95, 0.3 + 0.5 * bevel)})`);
      grad.addColorStop(0.5, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, 'rgba(0,0,0,0)');
      grad.addColorStop(1, `rgba(0,0,0,${Math.min(0.7, 0.2 + 0.4 * bevel)})`);
      ctx.strokeStyle = grad;
      // amplitude : jusqu'à 9 % du petit côté (la moitié tombe dans la découpe)
      ctx.lineWidth = 0.09 * bevel * minSide;
      ctx.stroke(path);
    }
    ctx.restore();
    ctx.restore();
  }
  ctx.restore();
}

/** Bord extérieur de la découpe (débordement) : arrondi, droit (facettes) ou déchiré. */
function drawBorder(ctx: CanvasRenderingContext2D, l: Layer, doc: Doc, f: Format, path: Path2D) {
  const bd = l.border;
  if (!bd || bd.width <= 0) return;
  const minSide = Math.min(f.width, f.height);
  const wd = bd.width * minSide;
  const g = doc.guides[bd.guide];
  const box = pageBounds(l, f);
  if (g?.type === 'gradient') {
    const grad = ctx.createLinearGradient(box.x0, box.y0, box.x1, box.y1);
    g.stops.forEach((c, i) => grad.addColorStop(i / Math.max(1, g.stops.length - 1), c));
    ctx.strokeStyle = grad;
  } else ctx.strokeStyle = guideColor(g);
  // le trait est centré sur la découpe : sa moitié extérieure fait la largeur voulue
  ctx.lineWidth = 2 * wd;
  ctx.lineCap = 'round';
  if (bd.style === 'round') {
    ctx.lineJoin = 'round';
    ctx.stroke(path);
    return;
  }
  const rings = maskRings(l, f);
  const p2 = new Path2D();
  if (bd.style === 'straight') {
    ctx.lineJoin = 'miter';
    for (const r of rings) {
      const s = simplifyRing(r, Math.max(wd * 0.9, minSide * 0.004));
      s.forEach((q, i) => (i ? p2.lineTo(q.x, q.y) : p2.moveTo(q.x, q.y)));
      p2.closePath();
    }
  } else {
    // déchiré : un liseré dont le bord extérieur suit un bruit irrégulier
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.2 * wd;
    let seed = 0;
    for (const ch of l.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rnd = rng(seed);
    for (const r of rings) {
      const step = Math.max(wd * 0.45, minSide * 0.002);
      const pts = resample(r, step);
      if (pts.length < 3) continue;
      // sens de la normale intérieure
      const a0 = pts[0]!;
      const c0 = pts[1]!;
      const t = Math.hypot(c0.x - a0.x, c0.y - a0.y) || 1;
      const probe = { x: (a0.x + c0.x) / 2 - ((c0.y - a0.y) / t) * step * 0.2, y: (a0.y + c0.y) / 2 + ((c0.x - a0.x) / t) * step * 0.2 };
      // vers l'extérieur
      const sign = insideRing(r, probe.x, probe.y) ? -1 : 1;
      let slow = rnd();
      pts.forEach((q, i) => {
        const a = pts[(i - 1 + pts.length) % pts.length]!;
        const c = pts[(i + 1) % pts.length]!;
        const nl = Math.hypot(c.x - a.x, c.y - a.y) || 1;
        const nx = (-(c.y - a.y) / nl) * sign;
        const ny = ((c.x - a.x) / nl) * sign;
        slow += (rnd() - slow) * 0.25;
        const k = (0.15 + 0.55 * slow + 0.2 * rnd()) * wd;
        const x = q.x + nx * k;
        const y = q.y + ny * k;
        if (i) p2.lineTo(x, y);
        else p2.moveTo(x, y);
      });
      p2.closePath();
    }
    // le papier entre la découpe et la déchirure
    ctx.save();
    ctx.lineWidth = 0.6 * wd;
    ctx.stroke(path);
    ctx.restore();
  }
  ctx.stroke(p2);
}

function insideRing(pts: Pt[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

function resample(r: Pt[], step: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < r.length; i++) {
    const a = r[i]!;
    const b = r[(i + 1) % r.length]!;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.round(d / step));
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
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

/**
 * Au changement de format, les couches dont la découpe touche des bords de
 * la page y restent : deux bords opposés aimantés gardent le remplissage
 * (mise à l'échelle sans déformation), un seul bord garde son appui.
 */
export function holdPins(doc: Doc, f: Format): Doc {
  return {
    ...doc,
    layers: doc.layers.map((l) => {
      const p = l.pins;
      if (!p || l.kind === 'surface' || !(p.left || p.right || p.top || p.bottom)) return l;
      let bb = pageBounds(l, f);
      const kx = p.left && p.right ? f.width / (bb.x1 - bb.x0) : 0;
      const ky = p.top && p.bottom ? f.height / (bb.y1 - bb.y0) : 0;
      const k = Math.max(kx, ky) || 1;
      let n: Layer = k !== 1 ? { ...l, w: l.w * k, h: l.h * k } : l;
      bb = pageBounds(n, f);
      const sx = p.left && p.right ? (f.width - bb.x1 - bb.x0) / 2 : p.left ? -bb.x0 : p.right ? f.width - bb.x1 : 0;
      const sy = p.top && p.bottom ? (f.height - bb.y1 - bb.y0) / 2 : p.top ? -bb.y0 : p.bottom ? f.height - bb.y1 : 0;
      n = { ...n, dx: n.dx + sx / f.width, dy: n.dy + sy / f.height };
      return n;
    }),
  };
}

/** Bords de la page touchés par la découpe (à `tol` près, unités du format). */
export function pinsOf(l: Layer, f: Format, tol: number): Layer['pins'] {
  const bb = pageBounds(l, f);
  const pins = { left: Math.abs(bb.x0) < tol, right: Math.abs(bb.x1 - f.width) < tol, top: Math.abs(bb.y0) < tol, bottom: Math.abs(bb.y1 - f.height) < tol };
  return pins.left || pins.right || pins.top || pins.bottom ? pins : undefined;
}
