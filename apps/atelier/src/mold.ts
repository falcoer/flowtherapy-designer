import type { Format } from '@ftd/core';
import { geomArea, pathToRings, ringsOfGeom, ringsToPath, simplifyRing, subtract, union, type Ring } from './cut';
import type { Layer } from './model';
import { cutOf } from './scene';
import { moldPx, type Mold } from './text';

/**
 * Outil Modeler : la découpe de n'importe quel objet se tire ou se repousse au stylet.
 * On travaille en pixels dans le repère de la boîte d'origine de l'objet (avant tout modelage),
 * pour que les gestes, le lissage et le retour à l'origine parlent du même espace.
 */
type Frame = [number, number, number, number];
const S = 1000;
/** Unité des tailles de l'outil, en fraction du petit côté de la page (proche du corps d'un titre). */
export const MOLD_UNIT = 0.2;

const NONE: Frame = [0, 0, 1, 1];
function space(l: Layer) {
  const fr = l.molded?.frame ?? NONE;
  const k = S / Math.max(l.w, l.h, 1e-6);
  return { fr, k, KX: (k * l.w) / (fr[2] - fr[0] || 1), KY: (k * l.h) / (fr[3] - fr[1] || 1) };
}
/** Pixels de travail par unité de l'outil. */
export const unitPx = (l: Layer) => space(l).k * MOLD_UNIT;

/** Point de la boîte actuelle (0..1) vers les pixels de travail. */
export function localToPx(l: Layer, u: number, v: number): [number, number] {
  const { fr, KX, KY } = space(l);
  return [(fr[0] + u * (fr[2] - fr[0])) * KX, (fr[1] + v * (fr[3] - fr[1])) * KY];
}
/** Découpe actuelle, en pixels de travail. */
export function currentPx(l: Layer): Ring[] {
  const { fr, KX, KY } = space(l);
  return pathToRings(cutOf(l)).map((r) => r.map((p) => ({ x: (fr[0] + p.x * (fr[2] - fr[0])) * KX, y: (fr[1] + p.y * (fr[3] - fr[1])) * KY })));
}
/** Découpe d'origine (avant tout modelage), en pixels de travail. */
export function pristinePx(l: Layer): Ring[] {
  if (!l.molded) return currentPx(l);
  const { KX, KY } = space(l);
  return pathToRings(cutOf({ ...l, cut: l.molded.cut, molded: undefined })).map((r) => r.map((p) => ({ x: p.x * KX, y: p.y * KY })));
}

/** Boîte de la couche quand son cadre (dans le repère d'origine) passe de `a` à `b` : le contenu ne bouge pas. */
function rebox(l: Layer, f: Format, a: Frame, b: Frame) {
  const m = Math.min(f.width, f.height);
  const kx = l.w / (a[2] - a[0] || 1);
  const ky = l.h / (a[3] - a[1] || 1);
  const ux = ((b[0] + b[2]) / 2 - (a[0] + a[2]) / 2) * kx * m;
  const uy = ((b[1] + b[3]) / 2 - (a[1] + a[3]) / 2) * ky * m;
  const r = l.rot ?? 0;
  const [c, sn] = [Math.cos(r), Math.sin(r)];
  return { w: Math.max(0.005, (b[2] - b[0]) * kx), h: Math.max(0.005, (b[3] - b[1]) * ky), dx: l.dx + (ux * c - uy * sn) / f.width, dy: l.dy + (ux * sn + uy * c) / f.height };
}

/**
 * Le geste appliqué à la découpe de départ. Une photo garde son cadre (on ne peut pas tirer
 * le papier au-delà de l'image) ; une forme ou un texte s'agrandit avec son contour.
 */
export function moldPatch(l: Layer, f: Format, base: Ring[], pristine: Ring[], m: Mold): Partial<Layer> {
  const { fr, KX, KY } = space(l);
  let rings = moldPx(base, m, pristine);
  if (l.kind === 'photo') {
    const [x0, y0, x1, y1] = [fr[0] * KX, fr[1] * KY, fr[2] * KX, fr[3] * KY];
    rings = rings.map((r) => r.map((p) => ({ x: Math.max(x0, Math.min(x1, p.x)), y: Math.max(y0, Math.min(y1, p.y)) })));
  }
  return bake(l, f, rings, m.live ? 0.6 : 0.35);
}

/**
 * Pose des contours (pixels de travail) comme nouvelle découpe : la boîte suit leur emprise et la
 * peinture reste en place sur la page (ses points sont repris dans la nouvelle boîte).
 */
function bake(l: Layer, f: Format, rings: Ring[], eps: number): Partial<Layer> {
  const { fr, KX, KY } = space(l);
  const keep = l.kind === 'photo';
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings)
    for (const p of r) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  if (!isFinite(x0)) return {};
  const b: Frame = keep ? fr : [x0 / KX, y0 / KY, x1 / KX, y1 / KY];
  const [bw, bh] = [(b[2] - b[0]) * KX || 1, (b[3] - b[1]) * KY || 1];
  const norm = rings.map((r) => simplifyRing(r, eps).map((p) => ({ x: (p.x - b[0] * KX) / bw, y: (p.y - b[1] * KY) / bh })));
  return { cut: ringsToPath(norm, 1e-6, 55, false), molded: { cut: l.molded ? l.molded.cut : l.cut, frame: b }, ...(keep ? {} : { ...rebox(l, f, fr, b), strokes: restroke(l, fr, b) }) };
}

/** Points de peinture du cadre `a` vers le cadre `b` (repère d'origine) : la peinture ne bouge pas sur la page. */
function restroke(l: Layer, a: Frame, b: Frame) {
  if (a.every((v, i) => v === b[i])) return l.strokes;
  const [sx, sy] = [(a[2] - a[0]) / (b[2] - b[0] || 1), (a[3] - a[1]) / (b[3] - b[1] || 1)];
  const [ox, oy] = [(a[0] - b[0]) / (b[2] - b[0] || 1), (a[1] - b[1]) / (b[3] - b[1] || 1)];
  return l.strokes.map((s) => ({ ...s, pts: s.pts.map((p) => ({ ...p, x: ox + p.x * sx, y: oy + p.y * sy })) }));
}

/**
 * Déborder : l'encre d'un tampon, des poils ou des ramures sort de la découpe et la repousse.
 * `ink` : contours de l'encre dans la boîte actuelle (0..1, ils peuvent en sortir). La découpe
 * devient leur union avec l'ancienne, comme un modelage (« Revenir à la forme » la rend).
 */
export function growPatch(l: Layer, f: Format, ink: Ring[]): Partial<Layer> {
  const { fr, KX, KY } = space(l);
  const px = ink.map((r) => r.map((p) => ({ x: (fr[0] + p.x * (fr[2] - fr[0])) * KX, y: (fr[1] + p.y * (fr[3] - fr[1])) * KY })));
  if (!px.length) return {};
  const base = currentPx(l);
  let rings: Ring[];
  try {
    // encre restée dans la découpe : rien à repousser (un texte reste un texte)
    if (geomArea(subtract(px, base)) < 4) return {};
    rings = ringsOfGeom(union(base, px));
  } catch {
    return {};
  }
  if (l.kind === 'photo') {
    const [x0, y0, x1, y1] = [fr[0] * KX, fr[1] * KY, fr[2] * KX, fr[3] * KY];
    rings = rings.map((r) => r.map((p) => ({ x: Math.max(x0, Math.min(x1, p.x)), y: Math.max(y0, Math.min(y1, p.y)) })));
  }
  return bake(l, f, rings, 0.35);
}

/** Retour à la forme, au texte ou au cadre d'avant le modelage, à la même place. */
export function unmoldPatch(l: Layer, f: Format): Partial<Layer> {
  if (!l.molded) return {};
  return { cut: l.molded.cut, molded: undefined, ...(l.kind === 'photo' ? {} : { ...rebox(l, f, l.molded.frame, NONE), strokes: restroke(l, l.molded.frame, NONE) }) };
}
