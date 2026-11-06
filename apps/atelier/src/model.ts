import type { LookSettings } from './looks';
import type { Fx } from './fx';
import { anchorsFor, formatFraction, nearestAnchor, resolveAnchor, type AnchorFrame, type Format } from '@ftd/core';

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
  /** Tampons : rotation donnée par le stylet (radians, repère de la couche). */
  r?: number;
  /** Tampons : inclinaison (0 = droit, 1 = très penché) et côté où il penche (radians, repère de la couche). */
  k?: number;
  d?: number;
}

/** Passage d'une teinte à l'autre dans un dégradé : douce (fondu continu), faible (aplats aux bords fondus), sans (aplats nets). */
export type Blend = 'smooth' | 'soft' | 'hard';
export type Guide = { name: string; type: 'color'; color: string } | { name: string; type: 'gradient'; stops: string[]; blend?: Blend };

/** Arrêts d'un dégradé (position 0..1, couleur) selon sa transition. */
export function blendStops(stops: string[], blend: Blend = 'smooth'): Array<[number, string]> {
  const n = stops.length;
  if (n < 2 || blend === 'smooth') return stops.map((c, i) => [i / Math.max(1, n - 1), c]);
  // aplats de même largeur ; « faible » fond les bords sur un tiers de la largeur d'un aplat
  const half = blend === 'soft' ? 0.17 / n : 0;
  const out: Array<[number, string]> = [];
  stops.forEach((c, i) => {
    const a = i / n;
    const b = (i + 1) / n;
    out.push([i === 0 ? 0 : a + half, c], [i === n - 1 ? 1 : b - half, c]);
  });
  return out;
}
/** Le même dégradé en CSS, pour les pastilles et aperçus. */
export const cssGradient = (stops: string[], blend: Blend | undefined, angle = '135deg') =>
  stops.length > 1
    ? `linear-gradient(${angle}, ${blendStops(stops, blend)
        .map(([p, c]) => `${c} ${(p * 100).toFixed(2)}%`)
        .join(',')})`
    : (stops[0] ?? '#888888');

/** Modes de projection du pinceau. */
export type BrushKind = 'aquarelle' | 'acrylic' | 'roller' | 'spray' | 'glitter' | 'hair' | 'stamp' | 'branch' | 'burn';

export interface Stroke {
  brush: BrushKind;
  guide: number;
  /** Rayon du pinceau en fraction du petit côté du format. */
  size: number;
  opacity: number;
  seed: number;
  pts: Pt[];
  /** Outil Tampons : motif posé à chaque point, et dilution de l'encre (0 = encre pleine, 1 = très diluée). */
  stamp?: string;
  dilution?: number;
  /** Forme de la brosse (aquarelle, acrylique, rouleau) ; l'angle est porté par chaque point (Pt.r). */
  tip?: 'round' | 'flat' | 'triangle';
  /** Tampon essuyé : après l'empreinte, le geste étire l'encre au lieu d'imprimer une traînée. */
  wipe?: boolean;
  /** Tampon semé : copies du motif éparpillées le long du geste, tournées dans son sens, mises en perspective au hasard. */
  sow?: { density: number; spread: number; persp: number };
  /** Motif rempli : ses formes prennent le dégradé du guide. */
  filled?: boolean;
  /** Pinceau Ramures : nombre de ramifications, convergence (0 = elles s'arrêtent au contact, 1 = elles se croisent), poussée (0..1). */
  branches?: number;
  converge?: number;
  grow?: number;
  /** Pinceau Ramures : taille du noyau de couleur au point de départ (0 = aucun, 1 = plein). */
  core?: number;
  /** Pinceau Brûlure : largeur de la marge roussie et carbonisée autour du trou (0..1). */
  char?: number;
  /** Pinceau Brûlure : false = la couche n'est pas percée, seule la marge la teinte. */
  hole?: boolean;
}

export type BorderStyle = 'round' | 'straight' | 'torn' | 'stamp' | 'burst' | 'double';
export type GlowStyle = 'neon' | 'laser' | 'electric' | 'particles' | 'smoke' | 'halo' | 'aura' | 'fire';
export type LayerKind = 'surface' | 'support' | 'photo' | 'shape' | 'text';
export type ShapeKind = 'star' | 'circle' | 'arch' | 'blob' | 'rounded' | 'triangle' | import('./silhouettes').SilhouetteKind;

export type Pin = boolean | 'margin';

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
  /**
   * Modelé (outil Modeler) : la découpe a été tirée ou repoussée, elle est dans `cut`.
   * On garde la découpe d'avant (absente = celle de la forme ou du texte) et le cadre actuel
   * dans le repère de la boîte d'origine, pour pouvoir revenir à la forme ou au texte.
   */
  molded?: { cut?: string; frame: [number, number, number, number] };
  /** Texte : contenu et typographie ; la découpe suit les lettres. */
  text?: import('./text').TextStyle;
  /** Guide de couleur du support ou de la forme. */
  guide: number;
  /** Photo (URL ou data URI). */
  src?: string;
  /** Élément de bibliothèque d'origine (« image/<id> ») : l'instance n'en garde que les écarts. */
  ref?: string;
  /** Hauteur au-dessus de la page (0..1) : l'ombre portée en découle. En dessous de 0, c'est `inner` (creux). */
  height: number;
  /** Opacité de la couche entière (0..1, 1 par défaut). */
  opacity?: number;
  /** Relief sculpté (outil Modeler, mode Relief) : carte de hauteurs éclairée par la lampe. */
  bump?: import('./bump').Bump;
  /** Biseau (0..1) : largeur du relief au bord, éclairé par la lampe (scene.ts drawBevel). */
  bevel?: number;
  /** Volume de la forme, tiré de son contour (indépendant du matériau). */
  volume?: Volume;
  /** Profil du biseau : arrondi (par défaut) ou chanfrein. */
  bevelProfile?: 'round' | 'chamfer';
  /** Le biseau commence au bord ajouté (et non à la découpe). */
  bevelBorder?: boolean;
  /** Rotation autour du centre de la boîte, en radians. */
  rot?: number;
  /** Centre de rotation en coordonnées de la couche ; absent = centre du cadre des poignées. */
  pivot?: { u: number; v: number };
  /** Bord : style, guide de la palette, largeur (fraction du petit côté). */
  border?: { style: BorderStyle; guide: number; width: number; /** Seconde couleur (double bord). */ guide2?: number };
  /** Rognage de la découpe (0..1 chacun) : bords flous, flottants arrondis, dents en zigzag. */
  trim?: { blur: number; float: number; zigzag: number; /** Aléa des dents (0 = régulières, 1 = déchiquetées). */ chaos?: number };
  /** Générateur de forme : polygone régulier de `sides` côtés ; `depth` (0..0.95) creuse le milieu de chaque côté vers le centre (étoile). */
  gen?: { sides: number; depth: number };
  /** Proportions libres : les poignées étirent la largeur et la hauteur séparément. */
  free?: boolean;
  /** Ombre intérieure (0..1). */
  inner?: number;
  /** Lueur autour de la découpe : style, guide, distance au bord et largeur (0..1). */
  glow?: { style: GlowStyle; guide: number; distance: number; width: number };
  /** Bords de la découpe aimantés sur les bords de la page : tenus au changement de format. */
  /** Bords tenus : true = bord de la page, 'margin' = ligne de la marge des repères. */
  pins?: { left?: Pin; right?: Pin; top?: Pin; bottom?: Pin };
  /** Style photographique (outil Transformer). */
  look?: LookSettings;
  /** Matière de la forme ou de l'image (outil Matière), une seule. */
  material?: Fx;
  /** Effets cumulés (outil Transformer). */
  fx?: Fx[];
  /** Objets solidaires : même identifiant de groupe, déplacés, tournés et agrandis ensemble. */
  link?: string;
  visible: boolean;
  strokes: Stroke[];
}

export interface Lamp {
  x: number;
  y: number;
  z: number;
  color: string;
}

export interface Doc {
  formatId: string;
  frame: AnchorFrame;
  /** Densité des points d'ancrage de la répartition (1 = demis … 6 = vingt-quatrièmes), 3 par défaut. */
  density?: number;
  /** Marge des repères autour du bord du format, en fraction du petit côté (-0.25..0.25) : positive vers l'intérieur. */
  margin?: number;
  guides: Guide[];
  /** Lumière unique : direction d'où elle vient (degrés, 0 = haut, sens horaire). */
  light: number;
  /** Lampe au-dessus de la feuille : position (fractions de la page, peut sortir de la page), hauteur 0..1 et couleur. */
  lamp?: Lamp;
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
    a = inset(resolveAnchor(l.anchor.frame, l.anchor.point, f), f);
  } catch {
    /* ancrage absent de ce format : centre */
  }
  return { cx: (a.x + l.dx) * f.width, cy: (a.y + l.dy) * f.height, w: l.w * m, h: l.h * m };
}

/** Dénominateurs de la répartition selon la densité choisie. */
export const DENSITY_STEPS: number[][] = [[2], [2, 3], [2, 3, 4], [2, 3, 4, 6], [12], [24]];
// densité du document ouvert : réglée par l'atelier, lue par tous les calculs d'ancrage
export const DEFAULT_DENSITY = 4;
let density = DEFAULT_DENSITY;
export const setAnchorDensity = (d: number | undefined) => (density = Math.max(1, Math.min(DENSITY_STEPS.length, d ?? DEFAULT_DENSITY)));
// marge des repères du document ouvert : les points se répartissent dans le format rentré (ou agrandi) de cette marge
let margin = 0;
export const setAnchorMargin = (m: number | undefined) => (margin = Math.max(-0.25, Math.min(0.25, m ?? 0)));
/** Marge en fraction de la largeur et de la hauteur du format. */
export function marginOf(f: Format) {
  const m = Math.min(f.width, f.height) * margin;
  return { mx: m / f.width, my: m / f.height };
}
/** Lignes où un bord d'objet peut se tenir, en unités du format : la page, puis la marge si elle existe. */
export function edgeLines(f: Format) {
  const { mx, my } = marginOf(f);
  const page = { left: 0, right: f.width, top: 0, bottom: f.height };
  const marg = { left: mx * f.width, right: f.width - mx * f.width, top: my * f.height, bottom: f.height - my * f.height };
  return { page, margin: margin ? marg : null };
}
/** Coordonnée de la ligne tenue par un bord. */
export const pinLine = (f: Format, side: 'left' | 'right' | 'top' | 'bottom', p: Pin | undefined) => {
  const e = edgeLines(f);
  return p === 'margin' && e.margin ? e.margin[side] : e.page[side];
};
/** Point du référentiel (0..1) ramené dans la zone des repères. */
function inset<T extends { x: number; y: number }>(a: T, f: Format): T {
  if (!margin) return a;
  const { mx, my } = marginOf(f);
  return { ...a, x: mx + a.x * (1 - 2 * mx), y: my + a.y * (1 - 2 * my) };
}

/** Points d'ancrage du référentiel ; la répartition suit la densité (les fractions y sont libres). */
export function anchorsOf(frame: AnchorFrame, f: Format) {
  if (frame !== 'repartition') return anchorsFor(frame, f).map((a) => inset(a, f));
  const fr = [...new Set(DENSITY_STEPS[density - 1]!.flatMap((n) => Array.from({ length: n - 1 }, (_, i) => (i + 1) / n)))].sort((a, b) => a - b);
  return fr.flatMap((x) => fr.map((y) => inset({ id: `h${formatFraction(x, 24)} v${formatFraction(y, 24)}`, frame, x, y }, f)));
}

/** Ancrage le plus proche d'un point du format, avec le décalage qui garde la position exacte. */
export function anchorFor(frame: AnchorFrame, f: Format, x: number, y: number) {
  const a = nearestAnchor(anchorsOf(frame, f), x / f.width, y / f.height, f);
  return { anchor: { frame, point: a.id }, dx: x / f.width - a.x, dy: y / f.height - a.y, at: a };
}

/** Formes que le générateur sait refaire, avec leurs réglages d'origine. */
export const GEN_DEFAULTS: Partial<Record<string, { sides: number; depth: number }>> = {
  star: { sides: 5, depth: 0.55 },
  triangle: { sides: 3, depth: 0 },
  pentagon: { sides: 5, depth: 0 },
  hexagon: { sides: 6, depth: 0 },
  octagon: { sides: 8, depth: 0 },
};
/** Polygone ou étoile générés, inscrits dans le cercle de la boîte. */
export function genPath(g: { sides: number; depth: number }): Pt[] {
  const n = Math.max(3, Math.min(48, Math.round(g.sides)));
  const pts: Pt[] = [];
  const inner = 0.5 * Math.cos(Math.PI / n) * (1 - Math.max(0, Math.min(0.95, g.depth)));
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    pts.push({ x: 0.5 + Math.cos(a) * 0.5, y: 0.5 + Math.sin(a) * 0.5 });
    if (g.depth > 0.001) {
      const b = a + Math.PI / n;
      pts.push({ x: 0.5 + Math.cos(b) * inner, y: 0.5 + Math.sin(b) * inner });
    }
  }
  return pts;
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
  } else if (s === 'rounded') {
    // rectangle aux coins arrondis (rayon 18 % du petit côté de la boîte)
    const r = 0.18;
    const corners: Array<[number, number, number]> = [
      [1 - r, r, -Math.PI / 2],
      [1 - r, 1 - r, 0],
      [r, 1 - r, Math.PI / 2],
      [r, r, Math.PI],
    ];
    for (const [cx, cy, a0] of corners)
      for (let i = 0; i <= 8; i++) {
        const a = a0 + (i / 8) * (Math.PI / 2);
        pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
      }
  } else if (s === 'triangle') {
    pts.push({ x: 0.5, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 });
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
  const s = blendStops(g.stops, g.blend);
  if (s.length === 1) return s[0]![1];
  const x = Math.max(0, Math.min(1, t));
  for (let i = 0; i < s.length - 1; i++) {
    const [p, a] = s[i]!;
    const [q, b] = s[i + 1]!;
    if (x <= q) return q - p < 1e-9 ? b : mix(a, b, (x - p) / (q - p));
  }
  return s[s.length - 1]![1];
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

/**
 * Pour enregistrer : les nombres gardent 5 décimales (un cent-millième de la couche ou de la page).
 * Les traits de peinture comptent des milliers de points : le document pèse ainsi plusieurs fois moins.
 */
export const compact = (_k: string, v: unknown) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1e5) / 1e5 : v);

export type VolumeKind = 'dome' | 'cylinder' | 'cone' | 'cushion';
export interface Volume {
  kind: VolumeKind;
  /** Force (0..1) : 1 = demi-sphère pour le dôme, pente à 45° pour le cône. */
  amount: number;
  /** Cylindre : direction de l'axe dans la forme (radians, 0 = debout). */
  axis?: number;
}
export const VOLUMES: Array<[VolumeKind, string]> = [
  ['dome', 'Dôme'],
  ['cylinder', 'Cylindre'],
  ['cone', 'Cône'],
  ['cushion', 'Coussin'],
];
