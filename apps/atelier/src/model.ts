import type { LookSettings } from './looks';
import { anchorsFor, nearestAnchor, resolveAnchor, type AnchorFrame, type Format } from '@ftd/core';

/**
 * Modèle de l'atelier : un document est une pile de couches. Chaque couche a
 * sa découpe (masque), son ordre, sa hauteur et ses traits de peinture. Toutes
 * les couleurs viennent des guides de l'unique palette du document.
 */

/** Point d'un trait ou d'un masque, en coordonnées de la couche (0..1 sur sa boîte). */
export interface Pt {
  x: number;
  y: number;
  /** Pression du stylet (0..1). */
  p?: number;
}

export type Guide = { name: string; type: 'color'; color: string } | { name: string; type: 'gradient'; stops: string[] };

export interface Stroke {
  brush: 'aquarelle';
  guide: number;
  /** Rayon du pinceau en fraction du petit côté du format. */
  size: number;
  opacity: number;
  seed: number;
  pts: Pt[];
}

export type BorderStyle = 'round' | 'straight' | 'torn';
export type LayerKind = 'surface' | 'support' | 'photo' | 'shape';
export type ShapeKind = 'star' | 'circle' | 'arch' | 'blob';

export interface Layer {
  id: string;
  name: string;
  kind: LayerKind;
  /** Ancrage dans les repères : la couche suit ce point d'un format à l'autre. */
  anchor: { frame: AnchorFrame; point: string };
  /** Décalage du centre par rapport à l'ancrage, en fraction du format. */
  dx: number;
  dy: number;
  /** Taille de la boîte en fraction du petit côté (ignorée pour la surface de fond). */
  w: number;
  h: number;
  /** Découpe : tracé SVG (pair-impair) en coordonnées de la couche ; absente = la forme, sinon la boîte entière. */
  cut?: string;
  /** Ancienne découpe polygonale (documents antérieurs), convertie au chargement. */
  mask?: Pt[];
  shape?: ShapeKind;
  /** Guide de couleur du support ou de la forme. */
  guide: number;
  /** Photo (URL ou data URI). */
  src?: string;
  /** Hauteur au-dessus de la page (0..1) : l'ombre portée en découle. */
  height: number;
  /** Opacité de la couche entière (0..1, 1 par défaut). */
  opacity?: number;
  /** Biseau (0..1) : liseré éclairé côté lumière, sombre à l'opposé. */
  bevel?: number;
  /** Rotation autour du centre de la boîte, en radians. */
  rot?: number;
  /** Centre de rotation en coordonnées de la couche ; absent = centre du cadre des poignées. */
  pivot?: { u: number; v: number };
  /** Bord : style, guide de la palette, largeur (fraction du petit côté). */
  border?: { style: BorderStyle; guide: number; width: number };
  /** Bords de la découpe aimantés sur les bords de la page : tenus au changement de format. */
  pins?: { left?: boolean; right?: boolean; top?: boolean; bottom?: boolean };
  /** Style photographique (outil Transformer). */
  look?: LookSettings;
  visible: boolean;
  strokes: Stroke[];
}

export interface Doc {
  formatId: string;
  frame: AnchorFrame;
  guides: Guide[];
  /** Lumière unique : direction d'où elle vient (degrés, 0 = haut, sens horaire). */
  light: number;
  layers: Layer[];
}

export const FORMATS: Format[] = [
  { id: 'a4', title: 'A4 portrait', width: 210, height: 297, unit: 'mm', dpi: 300, target: 'print' },
  { id: 'carre', title: 'Carré', width: 1080, height: 1080, unit: 'px', target: 'social' },
  { id: 'story', title: 'Story', width: 1080, height: 1920, unit: 'px', target: 'social' },
  { id: 'banniere', title: 'Bannière', width: 1640, height: 624, unit: 'px', target: 'social' },
];
export const formatOf = (id: string) => FORMATS.find((f) => f.id === id) ?? FORMATS[0]!;

/** Bords perdus de la surface de fond, en fraction du petit côté. */
export const BLEED = 0.03;

/** Boîte d'une couche en unités du format : centre, largeur, hauteur. */
export function layerBox(l: Layer, f: Format): { cx: number; cy: number; w: number; h: number } {
  const m = Math.min(f.width, f.height);
  if (l.kind === 'surface') return { cx: f.width / 2, cy: f.height / 2, w: f.width + 2 * BLEED * m, h: f.height + 2 * BLEED * m };
  let a = { x: 0.5, y: 0.5 };
  try {
    a = resolveAnchor(l.anchor.frame, l.anchor.point, f);
  } catch {
    /* ancrage absent de ce format : centre */
  }
  return { cx: (a.x + l.dx) * f.width, cy: (a.y + l.dy) * f.height, w: l.w * m, h: l.h * m };
}

/** Ancrage le plus proche d'un point du format, avec le décalage qui garde la position exacte. */
export function anchorFor(frame: AnchorFrame, f: Format, x: number, y: number) {
  const a = nearestAnchor(anchorsFor(frame, f), x / f.width, y / f.height, f);
  return { anchor: { frame, point: a.id }, dx: x / f.width - a.x, dy: y / f.height - a.y, at: a };
}

/** Contour d'une forme, en coordonnées de la couche. */
export function shapePath(s: ShapeKind): Pt[] {
  const pts: Pt[] = [];
  if (s === 'star') {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 0.2 : 0.5;
      pts.push({ x: 0.5 + Math.cos(a) * r, y: 0.52 + Math.sin(a) * r });
    }
  } else if (s === 'circle') {
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      pts.push({ x: 0.5 + Math.cos(a) * 0.5, y: 0.5 + Math.sin(a) * 0.5 });
    }
  } else if (s === 'arch') {
    pts.push({ x: 0, y: 1 });
    for (let i = 0; i <= 32; i++) {
      const a = Math.PI + (i / 32) * Math.PI;
      pts.push({ x: 0.5 + Math.cos(a) * 0.5, y: 0.5 + Math.sin(a) * 0.5 });
    }
    pts.push({ x: 1, y: 1 });
  } else {
    // tache organique
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const r = 0.42 + 0.06 * Math.sin(a * 3 + 0.6) + 0.04 * Math.cos(a * 5 + 1.3);
      pts.push({ x: 0.5 + Math.cos(a) * r, y: 0.5 + Math.sin(a) * r });
    }
  }
  return pts;
}

/** Couleur d'un guide à la position t (0..1) : unie, ou prise le long du dégradé. */
export function guideColor(g: Guide | undefined, t = 0): string {
  if (!g) return '#888888';
  if (g.type === 'color') return g.color;
  const s = g.stops;
  if (s.length === 1) return s[0]!;
  const x = Math.max(0, Math.min(1, t)) * (s.length - 1);
  const i = Math.min(s.length - 2, Math.floor(x));
  return mix(s[i]!, s[i + 1]!, x - i);
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p: number, sh: number) => (p >> sh) & 255;
  const c = (sh: number) => Math.round(ch(pa, sh) + (ch(pb, sh) - ch(pa, sh)) * t);
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0')}`;
}

export const uid = () => Math.random().toString(36).slice(2, 9);

/** Simplifie un tracé : garde un point tous les `min` (coordonnées quelconques). */
export function simplify<T extends { x: number; y: number }>(pts: T[], min: number): T[] {
  const out: T[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p.x - q.x, p.y - q.y) >= min) out.push(p);
  }
  return out;
}

export const DEFAULT_GUIDES: Guide[] = [
  { name: 'Papier', type: 'color', color: '#f4ede0' },
  { name: 'Nuit', type: 'color', color: '#1c1b3a' },
  { name: 'Corail', type: 'color', color: '#ee6b5b' },
  { name: 'Lagon', type: 'color', color: '#2aa79b' },
  { name: 'Or', type: 'color', color: '#e3a83c' },
  { name: 'Crépuscule', type: 'gradient', stops: ['#ee6b5b', '#9b4f9e', '#2b3a8c'] },
  { name: 'Craie', type: 'color', color: '#fffcf6' },
];
