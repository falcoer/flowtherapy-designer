import { paintStroke, type Target } from './brush';
import { rng } from './brush';
import { pathToRings, ringsToPath, simplifyRing, type Ring } from './cut';
import { guideColor, layerBox, shapePath, type Doc, type Guide, type Layer, type Pt, type ShapeKind } from './model';
import type { Format } from '@ftd/core';
import { applyLook, lookGuides, lookOf } from './looks';
import { applyPixelFx, hasPixelFx, hexRGB, type Fx, type FxId } from './fx';

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
      // (même géométrie que le bord, qui le recouvre ensuite exactement)
      if (l.border && l.border.width > 0) drawBorder(ctx, l, doc, f, path);
      ctx.restore();
    }

    drawGlow(ctx, l, doc, f, o, true);
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
    // matière et peinture, passées par les effets de matière s'il y en a
    const buf = hasPixelFx(pixelFx(l)) ? fxBuffer(l, doc, f, o) : null;
    if (buf) ctx.drawImage(buf, x0, y0, b.w, b.h);
    else drawMaterial(ctx, l, doc, f, o);
    if (o.wet?.id === l.id) ctx.drawImage(o.wet.canvas, x0, y0, b.w, b.h);
    ctx.restore();
    drawFxInside(ctx, l, doc, f, o, path);

    // biseau : bord éclairé côté lumière, bord sombre à l'opposé
    const bevel = l.bevel ?? 0;
    if (bevel > 0.001 && l.kind !== 'surface') {
      const a = (doc.light * Math.PI) / 180;
      const lx = Math.sin(a);
      const ly = -Math.cos(a);
      const r = Math.max(b.w, b.h) / 2;
      const grad = ctx.createLinearGradient(b.cx + lx * r, b.cy + ly * r, b.cx - lx * r, b.cy - ly * r);
      grad.addColorStop(0, `rgba(255,255,255,${Math.min(0.9, 0.35 + 0.55 * bevel)})`);
      grad.addColorStop(0.5, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, 'rgba(0,0,0,0)');
      grad.addColorStop(1, `rgba(0,0,0,${Math.min(0.75, 0.25 + 0.5 * bevel)})`);
      ctx.strokeStyle = grad;
      // amplitude : jusqu'à 35 % du petit côté (la moitié tombe dans la découpe)
      ctx.lineWidth = 0.35 * bevel * minSide;
      ctx.lineJoin = 'round';
      ctx.stroke(path);
    }
    ctx.restore();
    drawGlow(ctx, l, doc, f, o, false);
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
  if (bd.style === 'double') {
    // deux bandes concentriques : la seconde couleur à l'extérieur
    ctx.lineJoin = 'round';
    const save = ctx.strokeStyle;
    ctx.strokeStyle = guideStyle(ctx, doc.guides[bd.guide2 ?? 1], box);
    ctx.lineWidth = 4 * wd;
    ctx.stroke(path);
    ctx.strokeStyle = save;
    ctx.lineWidth = 2 * wd;
    ctx.stroke(path);
    return;
  }
  const rings = maskRings(l, f);
  if (bd.style === 'stamp' || bd.style === 'burst') {
    const z = new Path2D();
    let seed = 3;
    for (const ch of l.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rnd = rng(seed);
    for (const r of rings) {
      if (bd.style === 'stamp') continue;
      // explosion : des pointes de longueur et d'écart irréguliers, comme une onomatopée de BD
      const pts = resampleArc(r, Math.max(wd * 0.5, minSide * 0.002));
      if (pts.length < 8) continue;
      const raw = outwardNormals(r, pts);
      const n = pts.length;
      // normales lissées sur un large voisinage : les pointes voisines restent presque parallèles
      // et ne se croisent pas dans les creux de la forme
      const K = 5;
      const nr = raw.map((_, i) => {
        let x = 0;
        let y = 0;
        for (let d = -K; d <= K; d++) {
          const q = raw[(i + d + n) % n]!;
          const w = 1 - Math.abs(d) / (K + 1);
          x += q.x * w;
          y += q.y * w;
        }
        const l = Math.hypot(x, y) || 1;
        return { x: x / l, y: y / l };
      });
      // creux tenus à distance de l'objet, pointes larges posées entre deux creux
      const valley = wd * 0.9;
      const at = (i: number, k: number) => ({ x: pts[i % n]!.x + nr[i % n]!.x * k, y: pts[i % n]!.y + nr[i % n]!.y * k });
      let i = 0;
      while (i < n) {
        const gap = Math.min(n - i, 3 + Math.floor(rnd() * 4));
        if (gap < 2) break;
        const A = at(i, valley);
        const B = at(i + gap, valley);
        const t = i + Math.round(gap * (0.4 + rnd() * 0.2));
        const tip = at(t, wd * (2 + rnd() * 1.8 + rnd() ** 3 * 2.5));
        const cross = (B.x - A.x) * (tip.y - A.y) - (B.y - A.y) * (tip.x - A.x);
        const [p1, p2] = cross > 0 ? [A, B] : [B, A];
        z.moveTo(p1.x, p1.y);
        z.lineTo(p2.x, p2.y);
        z.lineTo(tip.x, tip.y);
        z.closePath();
        i += gap;
      }
    }
    if (bd.style === 'stamp') {
      // timbre : une bande pleine, mordue de demi-cercles réguliers sur son bord extérieur.
      // Rendue à part pour que les morsures n'effacent que la bande.
      const c = (stampBuffer ??= document.createElement('canvas'));
      c.width = ctx.canvas.width;
      c.height = ctx.canvas.height;
      const sx = c.getContext('2d')!;
      sx.setTransform(ctx.getTransform());
      sx.strokeStyle = ctx.strokeStyle;
      sx.lineJoin = 'round';
      sx.lineWidth = 2 * wd;
      sx.stroke(path);
      sx.globalCompositeOperation = 'destination-out';
      const period = Math.max(wd * 1.1, minSide * 0.004);
      const bites = new Path2D();
      for (const r of rings) {
        const pts = resampleArc(r, period);
        if (pts.length < 4) continue;
        const nr = outwardNormals(r, pts);
        pts.forEach((q, i) => {
          const x = q.x + nr[i]!.x * wd * 1.02;
          const y = q.y + nr[i]!.y * wd * 1.02;
          bites.moveTo(x + period * 0.3, y);
          bites.arc(x, y, period * 0.3, 0, Math.PI * 2);
        });
      }
      sx.fill(bites);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(c, 0, 0);
      ctx.restore();
      return;
    }
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill(z, 'nonzero');

    // la bande pleine jusqu'aux creux : pas de jour entre l'objet et ses pointes
    ctx.lineWidth = wd * 1.9;
    ctx.lineJoin = 'round';
    ctx.stroke(path);
    return;
  }
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

/** Matière de la couche (photo avec son style, ou aplat du guide) et sa peinture, dans sa boîte. */
function drawMaterial(ctx: CanvasRenderingContext2D, l: Layer, doc: Doc, f: Format, o: DrawOptions) {
  const b = layerBox(l, f);
  const x0 = b.cx - b.w / 2;
  const y0 = b.cy - b.h / 2;
  // matière
  if (l.kind === 'photo' && l.src) {
    const im = imageFor(l.src, o.onImage);
    if (im) {
      const k = Math.max(b.w / im.naturalWidth, b.h / im.naturalHeight);
      const w = im.naturalWidth * k;
      const h = im.naturalHeight * k;
      const look = l.look && lookOf(l.look.style);
      const m = look ? Math.max(0, Math.min(1, l.look!.mix)) : 0;
      if (m < 1) ctx.drawImage(im, b.cx - w / 2, b.cy - h / 2, w, h);
      if (look && m > 0) {
        const t = applyLook(im, l.src.length + l.src.slice(-40), look, lookGuides(look, l.look).map((i) => doc.guides[i]));
        ctx.save();
        ctx.globalAlpha *= m;
        ctx.drawImage(t, b.cx - w / 2, b.cy - h / 2, w, h);
        ctx.restore();
      }
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
}

/** Traitements de la couche : filtre dessin de la photo, puis la matière, puis les effets. */
function pixelFx(l: Layer): Fx[] {
  return [...(l.kind === 'photo' && l.look?.draw ? [l.look.draw] : []), ...(l.material ? [l.material] : []), ...(l.fx ?? [])];
}

const fxBuffers = new Map<string, { key: string; canvas: HTMLCanvasElement }>();

/** Matière passée par les effets de matière, mise en cache (au plus 1000 px de côté). */
function fxBuffer(l: Layer, doc: Doc, f: Format, o: DrawOptions): HTMLCanvasElement | null {
  const b = layerBox(l, f);
  const k = Math.min(o.scale, 1000 / Math.max(b.w, b.h));
  const pw = Math.max(1, Math.round(b.w * k));
  const ph = Math.max(1, Math.round(b.h * k));
  const im = l.kind === 'photo' && l.src ? imageFor(l.src, o.onImage) : null;
  if (l.kind === 'photo' && !im) return null;
  const key = JSON.stringify([pw, ph, l.kind, l.guide, l.src?.length, l.src?.slice(-40), l.look, l.fx, l.strokes.length, l.rot ?? 0, doc.light, doc.guides]);
  const hit = fxBuffers.get(l.id);
  if (hit?.key === key) return hit.canvas;
  const c = hit?.canvas ?? document.createElement('canvas');
  c.width = pw;
  c.height = ph;
  const bx = c.getContext('2d', { willReadFrequently: true })!;
  bx.setTransform(k, 0, 0, k, -(b.cx - b.w / 2) * k, -(b.cy - b.h / 2) * k);
  drawMaterial(bx, l, doc, f, o);
  bx.setTransform(1, 0, 0, 1, 0, 0);
  const img = bx.getImageData(0, 0, pw, ph);
  // la lumière, ramenée dans le repère de la couche (qui peut tourner)
  const a = (doc.light * Math.PI) / 180 - (l.rot ?? 0);
  applyPixelFx(img, pixelFx(l), doc.guides, Math.min(f.width, f.height) * k, Math.sin(a), -Math.cos(a));
  bx.putImageData(img, 0, 0);
  if (fxBuffers.size > 60) fxBuffers.clear();
  fxBuffers.set(l.id, { key, canvas: c });
  return c;
}

function guideStyle(ctx: CanvasRenderingContext2D, g: Guide | undefined, box: { x0: number; y0: number; x1: number; y1: number }) {
  if (g?.type === 'gradient') {
    const grad = ctx.createLinearGradient(box.x0, box.y0, box.x1, box.y1);
    g.stops.forEach((c, i) => grad.addColorStop(i / Math.max(1, g.stops.length - 1), c));
    return grad;
  }
  return guideColor(g);
}

/** Décalage du canevas (en pixels) d'un vecteur du format : les ombres ne suivent pas la transformation. */
function deviceOffset(dx: number, dy: number, o: DrawOptions) {
  const cr = Math.cos(o.rot ?? 0);
  const sr = Math.sin(o.rot ?? 0);
  return { x: (dx * cr - dy * sr) * o.scale, y: (dx * sr + dy * cr) * o.scale };
}

const fxList = (l: Layer, id: FxId) => l.fx?.filter((x) => x.id === id) ?? [];

/** Dans la découpe : ombre intérieure (côté lumière) et reflet brillant. */
function drawFxInside(ctx: CanvasRenderingContext2D, l: Layer, doc: Doc, f: Format, o: DrawOptions, path: Path2D) {
  const minSide = Math.min(f.width, f.height);
  const a = (doc.light * Math.PI) / 180;
  const lx = Math.sin(a);
  const ly = -Math.cos(a);
  if ((l.inner ?? 0) > 0.001) {
    const e = { amount: l.inner! };
    // on remplit tout sauf l'objet : seule l'ombre de ce cadre tombe dans la découpe
    const outside = new Path2D();
    outside.rect(-f.width, -f.height, 3 * f.width, 3 * f.height);
    outside.addPath(path);
    const d = (0.004 + e.amount * 0.03) * minSide;
    const off = deviceOffset(-lx * d, -ly * d, o);
    ctx.save();
    ctx.shadowColor = `rgba(16, 12, 28, ${0.5 + 0.4 * e.amount})`;
    ctx.shadowBlur = d * 1.6 * o.scale;
    ctx.shadowOffsetX = off.x;
    ctx.shadowOffsetY = off.y;
    ctx.fillStyle = '#000';
    ctx.fill(outside, 'evenodd');
    ctx.restore();
  }
  for (const e of fxList(l, 'gloss')) {
    const box = pageBounds(l, f);
    const cx = (box.x0 + box.x1) / 2;
    const cy = (box.y0 + box.y1) / 2;
    const r = Math.hypot(box.x1 - box.x0, box.y1 - box.y0) / 2;
    const k = e.amount;
    // vernis : lumière forte côté lampe, puis un éclat net en diagonale
    const g = ctx.createLinearGradient(cx + lx * r, cy + ly * r, cx - lx * r, cy - ly * r);
    g.addColorStop(0, `rgba(255,255,255,${0.55 * k})`);
    g.addColorStop(0.3, `rgba(255,255,255,${0.12 * k})`);
    g.addColorStop(0.42, `rgba(255,255,255,${0.5 * k})`);
    g.addColorStop(0.47, `rgba(255,255,255,${0.04 * k})`);
    g.addColorStop(0.75, 'rgba(255,255,255,0)');
    g.addColorStop(1, `rgba(0,0,0,${0.18 * k})`);
    ctx.fillStyle = g;
    ctx.fillRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
  }
}


let stampBuffer: HTMLCanvasElement | null = null;

/** Points pris à intervalle régulier le long du contour (longueur d'arc). */
function resampleArc(r: Pt[], step: number): Pt[] {
  const out: Pt[] = [];
  let carry = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i]!;
    const b = r[(i + 1) % r.length]!;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    let t = carry;
    while (t < d) {
      out.push({ x: a.x + ((b.x - a.x) * t) / d, y: a.y + ((b.y - a.y) * t) / d });
      t += step;
    }
    carry = t - d;
  }
  return out;
}

/** Normales vers l'extérieur de la découpe, pour des points pris le long d'un contour. */
function outwardNormals(ring: Pt[], pts: Pt[]): Pt[] {
  const n = pts.length;
  const a0 = pts[0]!;
  const c0 = pts[1 % n]!;
  const t = Math.hypot(c0.x - a0.x, c0.y - a0.y) || 1;
  const e = t * 0.2;
  const probe = { x: (a0.x + c0.x) / 2 - ((c0.y - a0.y) / t) * e, y: (a0.y + c0.y) / 2 + ((c0.x - a0.x) / t) * e };
  const sign = insideRing(ring, probe.x, probe.y) ? -1 : 1;
  return pts.map((_, i) => {
    const a = pts[(i - 1 + n) % n]!;
    const c = pts[(i + 1) % n]!;
    const nl = Math.hypot(c.x - a.x, c.y - a.y) || 1;
    return { x: (-(c.y - a.y) / nl) * sign, y: ((c.x - a.x) / nl) * sign };
  });
}

/** Lueurs posées derrière l'objet ; les autres passent devant. */
const GLOW_BEHIND = new Set(['smoke', 'halo', 'aura']);

/**
 * Lueur autour de la découpe, à une distance du bord et sur une largeur
 * réglables : néon, laser, électricité, particules, fumée, halo, énergie.
 */
function drawGlow(ctx: CanvasRenderingContext2D, l: Layer, doc: Doc, f: Format, o: DrawOptions, behind: boolean) {
  const gl = l.glow;
  if (!gl || GLOW_BEHIND.has(gl.style) !== behind) return;
  const minSide = Math.min(f.width, f.height);
  const dist = gl.distance * 0.08 * minSide + (l.border ? l.border.width * minSide * (l.border.style === 'double' ? 2 : 1) : 0);
  const w = (0.002 + gl.width * gl.width * 0.05) * minSide;
  const col = guideColor(doc.guides[gl.guide], 0.5);
  const S = o.scale;
  let seed = 7;
  for (const ch of l.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = rng(seed);
  const rings = maskRings(l, f);
  const step = Math.max(minSide * 0.004, w * 0.5);
  const lines = rings
    .map((r) => {
      const pts = resample(r, step);
      return pts.length < 3 ? null : { pts, nr: outwardNormals(r, pts) };
    })
    .filter((x): x is { pts: Pt[]; nr: Pt[] } => !!x);
  const offset = (k: number) => {
    const p = new Path2D();
    for (const { pts, nr } of lines) {
      pts.forEach((q, i) => (i ? p.lineTo(q.x + nr[i]!.x * k, q.y + nr[i]!.y * k) : p.moveTo(q.x + nr[i]!.x * k, q.y + nr[i]!.y * k)));
      p.closePath();
    }
    return p;
  };
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const mid = dist + w / 2;
  switch (gl.style) {
    case 'neon': {
      const p = offset(mid);
      ctx.strokeStyle = col;
      ctx.shadowColor = col;
      for (const b of [4, 2.2, 1]) {
        ctx.shadowBlur = w * b * S;
        ctx.lineWidth = w;
        ctx.stroke(p);
      }
      ctx.shadowBlur = w * 0.8 * S;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = w * 0.35;
      ctx.stroke(p);
      break;
    }
    case 'laser': {
      const p = offset(mid);
      ctx.shadowColor = col;
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.35;
      ctx.shadowBlur = w * 5 * S;
      ctx.lineWidth = w * 1.4;
      ctx.stroke(p);
      ctx.globalAlpha = 1;
      ctx.shadowBlur = w * 1.2 * S;
      ctx.lineWidth = w * 0.55;
      ctx.stroke(p);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(w * 0.16, 0.8 / S);
      ctx.stroke(p);
      break;
    }
    case 'electric': {
      // éclairs : un tracé brisé qui suit le bord, et des branches qui s'en échappent
      const bolt = new Path2D();
      const branches = new Path2D();
      for (const { pts, nr } of lines)
        for (let pass = 0; pass < 2; pass++) {
          const every = 2;
          for (let i = 0; i <= pts.length; i += every) {
            const j = i % pts.length;
            const k = mid + (rnd() - 0.5) * w * 2.4;
            const x = pts[j]!.x + nr[j]!.x * k;
            const y = pts[j]!.y + nr[j]!.y * k;
            if (i) bolt.lineTo(x, y);
            else bolt.moveTo(x, y);
            if (rnd() < 0.06) {
              let bx = x;
              let by = y;
              branches.moveTo(bx, by);
              for (let s2 = 0; s2 < 4; s2++) {
                const len = w * (0.8 + rnd() * 1.6);
                const tx = -nr[j]!.y;
                const ty = nr[j]!.x;
                const side = (rnd() - 0.5) * 1.6;
                bx += (nr[j]!.x + tx * side) * len;
                by += (nr[j]!.y + ty * side) * len;
                branches.lineTo(bx, by);
              }
            }
          }
        }
      ctx.shadowColor = col;
      ctx.strokeStyle = col;
      ctx.lineJoin = 'miter';
      ctx.shadowBlur = w * 3 * S;
      ctx.lineWidth = w * 0.5;
      ctx.stroke(bolt);
      ctx.lineWidth = w * 0.3;
      ctx.stroke(branches);
      ctx.shadowBlur = w * S;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = w * 0.16;
      ctx.stroke(bolt);
      ctx.stroke(branches);
      break;
    }
    case 'particles': {
      ctx.shadowColor = col;
      for (const { pts, nr } of lines) {
        const n = Math.round(pts.length * 1.6);
        for (let c = 0; c < n; c++) {
          const j = Math.floor(rnd() * pts.length);
          const k = dist + rnd() * rnd() * w * 3;
          const r = w * (0.06 + 0.3 * rnd() * rnd());
          const x = pts[j]!.x + nr[j]!.x * k + (rnd() - 0.5) * step;
          const y = pts[j]!.y + nr[j]!.y * k + (rnd() - 0.5) * step;
          ctx.fillStyle = rnd() < 0.3 ? '#fff' : col;
          ctx.globalAlpha = 0.5 + 0.5 * rnd();
          ctx.shadowBlur = r * 4 * S;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'smoke': {
      // volutes : des bouffées douces qui s'éloignent en pâlissant
      const [r0, g0, b0] = hexRGB(col).map((v) => Math.round(v * 255));
      for (const { pts, nr } of lines)
        for (let i = 0; i < pts.length; i += 1) {
          for (let layer = 0; layer < 2; layer++) {
            const k = dist + w * (layer ? 1.2 + rnd() * 1.5 : rnd() * 0.8);
            const rad = w * (layer ? 1.2 + rnd() * 1.4 : 0.6 + rnd() * 0.8);
            const x = pts[i]!.x + nr[i]!.x * k + (rnd() - 0.5) * w;
            const y = pts[i]!.y + nr[i]!.y * k - (layer ? rnd() * w : 0);
            const a = (layer ? 0.06 : 0.12) * (0.5 + rnd());
            const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
            g.addColorStop(0, `rgba(${r0},${g0},${b0},${a})`);
            g.addColorStop(1, `rgba(${r0},${g0},${b0},0)`);
            ctx.fillStyle = g;
            ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
          }
        }
      break;
    }
    case 'halo': {
      const p = offset(mid);
      ctx.strokeStyle = col;
      ctx.shadowColor = col;
      ctx.globalAlpha = 0.35;
      ctx.shadowBlur = w * 6 * S;
      ctx.lineWidth = w * 1.5;
      ctx.stroke(p);
      ctx.globalAlpha = 0.25;
      ctx.shadowBlur = w * 12 * S;
      ctx.lineWidth = w * 3;
      ctx.stroke(p);
      break;
    }
    case 'aura': {
      // aura d'énergie : des flammes qui montent depuis le bord, cœur blanc
      const [r0, g0, b0] = hexRGB(col).map((v) => Math.round(v * 255));
      const flame = (x: number, y: number, dx: number, dy: number, len: number, wid: number, inner: boolean) => {
        const tx = -dy;
        const ty = dx;
        const ex = x + dx * len;
        const ey = y + dy * len;
        const g = ctx.createLinearGradient(x, y, ex, ey);
        if (inner) {
          g.addColorStop(0, 'rgba(255,255,255,0.9)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
        } else {
          g.addColorStop(0, `rgba(${r0},${g0},${b0},0.85)`);
          g.addColorStop(0.6, `rgba(${r0},${g0},${b0},0.35)`);
          g.addColorStop(1, `rgba(${r0},${g0},${b0},0)`);
        }
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x + tx * wid, y + ty * wid);
        ctx.quadraticCurveTo(x + dx * len * 0.5 + tx * wid * 0.9, y + dy * len * 0.5 + ty * wid * 0.9, ex, ey);
        ctx.quadraticCurveTo(x + dx * len * 0.5 - tx * wid * 0.9, y + dy * len * 0.5 - ty * wid * 0.9, x - tx * wid, y - ty * wid);
        ctx.closePath();
        ctx.fill();
      };
      ctx.shadowColor = col;
      ctx.shadowBlur = w * 1.5 * S;
      for (const inner of [false, true])
        for (const { pts, nr } of lines)
          for (let i = 0; i < pts.length; i++) {
            const n = nr[i]!;
            // les flammes montent : la normale penche vers le haut
            let dx = n.x * 0.75;
            let dy = n.y * 0.75 - 0.65;
            const dl = Math.hypot(dx, dy) || 1;
            dx /= dl;
            dy /= dl;
            const up = Math.max(0.25, 0.6 - n.y * 0.5);
            const len = w * (inner ? 0.8 + rnd() * 1.2 : 1.5 + rnd() * 3) * up;
            const x = pts[i]!.x + n.x * dist;
            const y = pts[i]!.y + n.y * dist;
            flame(x, y, dx, dy, len, w * (inner ? 0.18 : 0.35), inner);
          }
      break;
    }
  }
  ctx.restore();
}
