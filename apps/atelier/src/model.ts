import type { BrushTip } from './tips';
import type { LookSettings } from './looks';
import type { Fx } from './fx';
import { DEFAULT_FORMATS, MAX_MARGIN, MAX_ZONE, anchorsFor, formatFraction, nearestAnchor, parseFraction, resolveAnchor, type AnchorFrame, type AnchorPoint, type Format } from '@ftd/core';

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
/**
 * `role` : rôle de la couleur dans les variantes de l'activité (fond, texte…) ; changer de variante remplace la couleur du même rôle.
 * `from` : nom de l'objet ou du dessin importé qui a apporté la couleur dans le document.
 */
export type Guide = { name: string; type: 'color'; color: string; role?: string; from?: string } | { name: string; type: 'gradient'; stops: string[]; blend?: Blend; shape?: GradStyle; role?: string; from?: string };

/** Mode d'un dégradé : le long d'un axe, en cercle, autour d'un centre (angle), en losange. */
export type GradMode = 'linear' | 'radial' | 'conic' | 'diamond';
/**
 * Forme d'un dégradé, dans la boîte de l'objet qu'il colore (0..1 sur chaque côté).
 * `angle` en degrés (0 = vers la droite, 90 = vers le bas) ; `spread` : étendue (1 = la boîte) ;
 * `repeat` : nombre de passages ; `mirror` : un passage sur deux à l'envers ; `ellipse` : le radial suit la boîte.
 */
export interface GradShape {
  mode: GradMode;
  cx: number;
  cy: number;
  angle: number;
  spread: number;
  repeat: number;
  mirror?: boolean;
  ellipse?: boolean;
}
/** Ce que la palette retient d'un dégradé : son mode et ses répétitions. */
export type GradStyle = Pick<GradShape, 'mode' | 'repeat' | 'mirror' | 'ellipse'>;
/** Ce que chaque objet retient : où se pose le dégradé (centre, angle, étendue), réglé avec le repère sur l'objet. */
export type GradPlace = Pick<GradShape, 'cx' | 'cy' | 'angle' | 'spread'>;
/** Sans forme enregistrée : l'ancien dégradé, du haut vers le bas. */
export const DEFAULT_SHAPE: GradShape = { mode: 'linear', cx: 0.5, cy: 0.5, angle: 90, spread: 1, repeat: 1 };
/** Forme d'un dégradé sur un objet : le style de la palette, posé selon le repère de l'objet ; undefined = ancien dégradé. */
export function shapeOf(g: Guide | undefined, place?: GradPlace): GradShape | undefined {
  if (g?.type !== 'gradient' || (!g.shape && !place)) return undefined;
  const st = g.shape;
  return { ...DEFAULT_SHAPE, ...(st ? { mode: st.mode, repeat: st.repeat, mirror: st.mirror, ellipse: st.ellipse } : {}), ...(place ? { cx: place.cx, cy: place.cy, angle: place.angle, spread: place.spread } : {}) };
}

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
  /**
   * Aquarelle : passe humide à laquelle appartient le trait. Les traits d'une même passe se
   * mêlent sur le papier mouillé (couleurs fondues, un seul liseré) ; une passe séchée se recouvre en glacis.
   */
  wash?: number;
  /** Outil Tampons : motif posé à chaque point, et dilution de l'encre (0 = encre pleine, 1 = très diluée). */
  stamp?: string;
  dilution?: number;
  /** Forme de la brosse (aquarelle, acrylique, rouleau) : ronde, plate, croix, triangle, râteau 2 à 5 dents, épis ; l'angle est porté par chaque point (Pt.r). */
  tip?: BrushTip;
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
  /** Pinceau Poils : longueur des brins (0..1, 0.3 par défaut) et frisure (0 = raides, 0.5 = ondulés comme l'alpaga, 1 = bouclés comme le mouton). */
  hairLen?: number;
  curl?: number;
  /** Pinceau Brûlure : largeur de la marge roussie et carbonisée autour du trou (0..1). */
  char?: number;
  /** Pinceau Brûlure : false = la couche n'est pas percée, seule la marge la teinte. */
  hole?: boolean;
}

export type BorderStyle = 'round' | 'straight' | 'torn' | 'stamp' | 'burst' | 'double';
export type GlowStyle = 'neon' | 'laser' | 'electric' | 'particles' | 'smoke' | 'halo' | 'aura' | 'fire';
export type LayerKind = 'surface' | 'support' | 'photo' | 'shape' | 'text';
export type ShapeKind = 'star' | 'circle' | 'arch' | 'blob' | 'rounded' | 'triangle' | import('./silhouettes').SilhouetteKind;

export type Pin = boolean | 'margin' | 'zone';

export interface Layer {
  id: string;
  name: string;
  kind: LayerKind;
  /** Ancrage dans les repères : la couche suit ce point d'un format à l'autre. */
  anchor: { frame: AnchorFrame; point: string };
  /** Décalage du centre par rapport à l'ancrage, en fraction du format. */
  dx: number;
  dy: number;
  /** Point de l'objet posé sur l'ancrage (un sommet ou un milieu de côté) : décalage depuis le centre, en fraction de la largeur et de la hauteur de la boîte. Absent = le centre. */
  grip?: { x: number; y: number };
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
  /** Où se pose le dégradé de son guide sur cet objet (centre, angle, étendue) : propre à l'objet. */
  grad?: GradPlace;
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
  /** Extrusion (0..1) : l'objet prend de l'épaisseur, comme un bloc découpé ; toutes ses pièces solidaires la partagent. */
  extrude?: number;
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
  /** Bords tenus : true = bord de la page, 'margin' = ligne de la marge, 'zone' = ligne de la zone d'intérêt. */
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

/** Ce que l'appareil photo fait de la page : transformation globale et déformation de l'objectif. */
export interface SceneLook {
  /** Transformation (groupe « effet ») posée sur toute la scène. */
  fx?: Fx;
  /** Objectif : distorsion −1 (coussinet) … +1 (barillet), vignettage et franges colorées 0..1. */
  lens?: { warp: number; vignette: number; fringe: number };
  /** Appareil : mise au point sur un objet (absent = sur la feuille) et ouverture 0 (tout net) … 1 (f/1.4, flou fort). */
  camera?: { focus?: string; aperture: number };
}

export interface Lamp {
  x: number;
  y: number;
  z: number;
  color: string;
}

export interface Target {
  channel?: string;
  format: string;
  palette?: string;
  /** Marges de la publication, côté par côté (zones mortes de certains réseaux) ; sinon celle du média. */
  margins?: Margins;
  /** Zone d'intérêt de la publication, depuis le bord de la page et dans la marge ; sinon celle du média. */
  zone?: Margins;
  /** Résolution d'export : largeur en pixels (la hauteur suit le format) ; sinon celle du format. */
  width?: number;
  /** Titre donné à la publication ; sinon « réseau · format ». */
  name?: string;
}

/** Marges côté par côté, en fraction du petit côté du format (positives vers l'intérieur). */
export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export const uniformMargins = (m = 0): Margins => ({ top: m, right: m, bottom: m, left: m });
export const hasMargins = (m: Margins) => !!(m.top || m.right || m.bottom || m.left);
/** Marges du document : côté par côté si réglées, sinon la marge unique d'avant. */
export const docMargins = (d: { margin?: number; margins?: Margins }): Margins => d.margins ?? uniformMargins(d.margin ?? 0);

export interface Doc {
  formatId: string;
  frame: AnchorFrame;
  /** Densité des points d'ancrage de la répartition (1 = demis … 6 = vingt-quatrièmes), 3 par défaut. */
  density?: number;
  /** Marge des repères autour du bord du format, en fraction du petit côté (-0.25..0.25) : positive vers l'intérieur. */
  margin?: number;
  /** Marges côté par côté (remplacent `margin` quand elles sont là). */
  margins?: Margins;
  /** Zone d'intérêt : cadre de l'essentiel, depuis le bord de la page, toujours dans la marge. */
  zone?: Margins;
  /** Points d'ancrage ajoutables (cases à cocher), tous présents par défaut : sommets et milieux des côtés de la page et de la marge, points des bords en répartition. */
  points?: AnchorExtras;
  guides: Guide[];
  /** Cibles du document (média, format, variante) ; `target` est celle affichée. */
  targets?: Target[];
  target?: number;
  /** Occasion dont part le document. */
  operation?: string;
  /** Campagne à laquelle il contribue. */
  campaign?: string;
  /** Texte qui accompagne la publication (légende du post). */
  caption?: string;
  /** Lumière unique : direction d'où elle vient (degrés, 0 = haut, sens horaire). */
  light: number;
  /** Lampe au-dessus de la feuille : position (fractions de la page, peut sortir de la page), hauteur 0..1 et couleur. */
  lamp?: Lamp;
  /** Rendu de la scène entière, après la lumière : une transformation et l'objectif. */
  scene?: SceneLook;
  layers: Layer[];
  /** Palette de matières (« Mes matières ») : des supports nommés, liés aux objets qui les portent. */
  materials?: PaletteMatter[];
  /** Palette de vernis (« Mes vernis »). */
  varnishes?: PaletteMatter[];
  /** Palette de bords (« Mes bords ») : un bord, une lueur ou un rognage nommé, à déposer sur un objet. */
  edges?: PaletteEdge[];
}

/** Une entrée de la palette de bords : un seul des trois emplacements (bord, lueur ou rognage), avec tous ses réglages. */
export interface PaletteEdge {
  id: string;
  name: string;
  border?: Layer['border'];
  glow?: Layer['glow'];
  trim?: Layer['trim'];
}

/** Une entrée des palettes de matières ou de vernis : un réglage nommé, partagé par les objets qui y sont liés (Fx.ref). */
export interface PaletteMatter {
  id: string;
  name: string;
  fx: import('./fx').Fx;
}

/** Formats de l'atelier : ceux d'origine, puis ceux du catalogue du site une fois chargé (setCatalog). */
export const FORMATS: Format[] = [...DEFAULT_FORMATS];
export const formatOf = (id: string) => FORMATS.find((f) => f.id === id) ?? FORMATS[0]!;

/** Bords perdus de la surface de fond, en fraction du petit côté. */
export const BLEED = 0.03;

/** Boîte d'une couche en unités du format : centre, largeur, hauteur. */
export function layerBox(l: Layer, f: Format): { cx: number; cy: number; w: number; h: number } {
  const m = Math.min(f.width, f.height);
  if (l.kind === 'surface') return { cx: f.width / 2, cy: f.height / 2, w: f.width + 2 * BLEED * m, h: f.height + 2 * BLEED * m };
  let a = { x: 0.5, y: 0.5 };
  try {
    a = resolvePoint(l.anchor.frame, l.anchor.point, f);
  } catch {
    /* ancrage absent de ce format : centre */
  }
  const gx = (l.grip?.x ?? 0) * l.w * m;
  const gy = (l.grip?.y ?? 0) * l.h * m;
  return { cx: (a.x + l.dx) * f.width - gx, cy: (a.y + l.dy) * f.height - gy, w: l.w * m, h: l.h * m };
}

/** Point d'ancrage d'une couche sur la page : son centre décalé de dx, dy, ou le sommet / milieu de côté qui s'y accroche. */
export function anchorPointOf(l: Layer, f: Format) {
  const b = layerBox(l, f);
  const m = Math.min(f.width, f.height);
  return { x: b.cx + (l.grip?.x ?? 0) * l.w * m - l.dx * f.width, y: b.cy + (l.grip?.y ?? 0) * l.h * m - l.dy * f.height };
}

/** La même couche sans point d'accroche : le décalage dx, dy garde la boîte en place. */
export function ungrip(l: Layer, f: Format): Layer {
  if (!l.grip) return l;
  const m = Math.min(f.width, f.height);
  return { ...l, grip: undefined, dx: l.dx - (l.grip.x * l.w * m) / f.width, dy: l.dy - (l.grip.y * l.h * m) / f.height };
}

/** Dénominateurs de la répartition selon la densité choisie. */
export const DENSITY_STEPS: number[][] = [[2], [2, 3], [2, 3, 4], [2, 3, 4, 6], [12], [24]];
// densité du document ouvert : réglée par l'atelier, lue par tous les calculs d'ancrage
export const DEFAULT_DENSITY = 4;
let density = DEFAULT_DENSITY;
export const setAnchorDensity = (d: number | undefined) => (density = Math.max(1, Math.min(DENSITY_STEPS.length, d ?? DEFAULT_DENSITY)));
/** Marge des repères d'une page neuve : 5 % du petit côté. */
export const DEFAULT_MARGIN = 0.05;
// marges des repères du document ouvert : les points se répartissent dans le format rentré (ou agrandi) de ces marges
let margins: Margins = uniformMargins(0);
// zone d'intérêt du document ouvert, toujours dans la marge (null : pas de zone)
let zone: Margins | null = null;
const clampM = (v: number) => Math.max(-0.25, Math.min(MAX_MARGIN, v || 0));
/** Marge et zone d'intérêt montent jusqu'à 45 % du petit côté depuis chaque bord. */
export { MAX_MARGIN, MAX_ZONE };
const SIDES4 = ['top', 'right', 'bottom', 'left'] as const;
/** Zone ramenée dans la marge, côté par côté ; null quand elle se confond avec la marge. */
export function zoneWithin(m: Margins, z: Margins | undefined | null): Margins | null {
  if (!z) return null;
  const out = { ...m };
  let wider = false;
  for (const k of SIDES4) {
    out[k] = Math.max(m[k], Math.min(MAX_ZONE, z[k] || 0));
    if (out[k] > m[k] + 1e-4) wider = true;
  }
  return wider ? out : null;
}
export const setAnchorMargin = (m: number | Margins | undefined, z?: Margins | null) => {
  const x = typeof m === 'object' ? m : uniformMargins(m ?? 0);
  margins = { top: clampM(x.top), right: clampM(x.right), bottom: clampM(x.bottom), left: clampM(x.left) };
  zone = zoneWithin(margins, z);
};
/** Cadres des repères d'un document : sa marge et sa zone d'intérêt. */
export const setAnchorFrames = (d: { margin?: number; margins?: Margins; zone?: Margins }) => setAnchorMargin(docMargins(d), d.zone);
const fracOf = (x: Margins, f: Format) => {
  const m = Math.min(f.width, f.height);
  return { l: (x.left * m) / f.width, r: (x.right * m) / f.width, t: (x.top * m) / f.height, b: (x.bottom * m) / f.height };
};
/** Marges en fraction de la largeur (gauche, droite) et de la hauteur (haut, bas) du format. */
export const marginOf = (f: Format) => fracOf(margins, f);
/** Zone d'intérêt, de même ; la marge quand il n'y en a pas. */
export const zoneOf = (f: Format) => fracOf(zone ?? margins, f);
export const hasZone = () => !!zone;
const linesOf = (x: Margins, f: Format) => {
  const { l, r, t, b } = fracOf(x, f);
  return { left: l * f.width, right: f.width - r * f.width, top: t * f.height, bottom: f.height - b * f.height };
};
/** Lignes où un bord d'objet peut se tenir, en unités du format : la page, la marge si elle existe, la zone d'intérêt si elle existe. */
export function edgeLines(f: Format) {
  const page = { left: 0, right: f.width, top: 0, bottom: f.height };
  return { page, margin: hasMargins(margins) ? linesOf(margins, f) : null, zone: zone ? linesOf(zone, f) : null };
}
/** Coordonnée de la ligne tenue par un bord (la zone absente se replie sur la marge, la marge absente sur la page). */
export const pinLine = (f: Format, side: 'left' | 'right' | 'top' | 'bottom', p: Pin | undefined) => {
  const e = edgeLines(f);
  if (p === 'zone' && e.zone) return e.zone[side];
  return (p === 'margin' || p === 'zone') && e.margin ? e.margin[side] : e.page[side];
};
/** Point du référentiel (0..1) ramené dans la zone des repères. */
function inset<T extends { x: number; y: number }>(a: T, f: Format, by: Margins = margins): T {
  if (!hasMargins(by)) return a;
  const { l, r, t, b } = fracOf(by, f);
  return { ...a, x: l + a.x * (1 - l - r), y: t + a.y * (1 - t - b) };
}

/** Familles de points qu'on coche en plus de ceux du référentiel. */
export interface AnchorExtras {
  /** Sommets : les coins de la page, de la marge et de la zone d'intérêt. */
  corners?: boolean;
  /** Milieux des côtés de la page, et ceux de la marge. */
  sides?: boolean;
  /** Répartition : les lignes de partage prolongées jusqu'aux bords extérieurs. */
  edges?: boolean;
  /** L'objet s'accroche aussi par ses sommets… */
  objCorners?: boolean;
  /** … et par le milieu de ses côtés (le centre s'accroche toujours). */
  objSides?: boolean;
}
export const ANCHOR_EXTRAS: Array<{ key: keyof AnchorExtras; label: string; hint: string; frame?: AnchorFrame; obj?: boolean }> = [
  { key: 'objCorners', label: 'Sommets de l’objet', hint: 'Un coin de l’objet s’accroche aux repères', obj: true },
  { key: 'objSides', label: 'Milieux des côtés de l’objet', hint: 'Le milieu d’un côté de l’objet s’accroche aux repères', obj: true },
  { key: 'corners', label: 'Sommets', hint: 'Les coins de la page, de la marge et de la zone d’intérêt' },
  { key: 'sides', label: 'Milieux des côtés', hint: 'Le milieu de chaque côté de la page, de la marge et de la zone d’intérêt' },
  { key: 'edges', label: 'Points des bords', hint: 'Les lignes de partage (½, ⅓…) touchent les bords extérieurs', frame: 'repartition' },
];
// familles cochées du document ouvert (absentes = cochées)
let extras: AnchorExtras = {};
export const setAnchorExtras = (e: AnchorExtras | undefined) => (extras = e ?? {});
export const extraOn = (e: AnchorExtras | undefined, k: keyof AnchorExtras) => e?.[k] !== false;

/** Points de l'objet qui peuvent s'accrocher, en fraction de sa boîte depuis le centre : le centre, puis les familles cochées. */
export function objectGrips(e: AnchorExtras | undefined): Array<{ x: number; y: number }> {
  const out = [{ x: 0, y: 0 }];
  if (extraOn(e, 'objSides')) out.push({ x: 0, y: -0.5 }, { x: 0.5, y: 0 }, { x: 0, y: 0.5 }, { x: -0.5, y: 0 });
  if (extraOn(e, 'objCorners')) out.push({ x: -0.5, y: -0.5 }, { x: 0.5, y: -0.5 }, { x: 0.5, y: 0.5 }, { x: -0.5, y: 0.5 });
  return out;
}

// sommets et milieux posés sur la page (« page h0 v1/2 ») ou sur le cadre des marges (« marge h1 v0 »)
const FRAME_PT = /^(page|marge|zone)\s+h(\S+)\s+v(\S+)$/;

/** Position (0..1) d'un point d'ancrage nommé, marge comprise. */
export function resolvePoint(frame: AnchorFrame, id: string, f: Format): { x: number; y: number } {
  const m = FRAME_PT.exec(id.trim());
  if (m) {
    const p = { x: parseFraction(m[2]!), y: parseFraction(m[3]!) };
    return m[1] === 'marge' ? inset(p, f) : m[1] === 'zone' ? inset(p, f, zone ?? margins) : p;
  }
  return inset(resolveAnchor(frame, id, f), f);
}

/** Points d'ancrage du référentiel ; la répartition suit la densité (les fractions y sont libres). Puis les familles cochées. */
export function anchorsOf(frame: AnchorFrame, f: Format) {
  let pts: AnchorPoint[];
  if (frame !== 'repartition') pts = anchorsFor(frame, f).map((a) => inset(a, f));
  else {
    const fr = [...new Set(DENSITY_STEPS[density - 1]!.flatMap((n) => Array.from({ length: n - 1 }, (_, i) => (i + 1) / n)))].sort((a, b) => a - b);
    const id = (x: number, y: number) => `h${formatFraction(x, 24)} v${formatFraction(y, 24)}`;
    pts = fr.flatMap((x) => fr.map((y) => inset({ id: id(x, y), frame, x, y }, f)));
    // les lignes de partage prolongées jusqu'au cadre extérieur (la marge, sinon la page)
    if (extraOn(extras, 'edges'))
      for (const t of fr) for (const e of [0, 1]) pts.push(inset({ id: id(t, e), frame, x: t, y: e }, f), inset({ id: id(e, t), frame, x: e, y: t }, f));
  }
  const frames: Array<'page' | 'marge' | 'zone'> = [...(hasMargins(margins) ? (['marge'] as const) : []), ...(zone ? (['zone'] as const) : []), 'page'];
  const add = (u: number[][]) => {
    for (const box of frames)
      for (const [x, y] of u) {
        const a = { id: `${box} h${formatFraction(x!)} v${formatFraction(y!)}`, frame, x: x!, y: y! };
        pts.push(box === 'marge' ? inset(a, f) : box === 'zone' ? inset(a, f, zone!) : a);
      }
  };
  if (extraOn(extras, 'sides')) add([[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]);
  if (extraOn(extras, 'corners')) add([[0, 0], [1, 0], [1, 1], [0, 1]]);
  // un même endroit ne garde que son premier nom (le point du référentiel avant le sommet ajouté)
  const seen = new Set<string>();
  return pts.filter((a) => {
    const k = `${Math.round(a.x * 1e6)},${Math.round(a.y * 1e6)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
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

export type VolumeKind = 'flat' | 'dome' | 'cylinder' | 'cone' | 'cushion';
/** Peau du volume : des plis ou des fissures posés sur la forme (ou sur l'objet à plat). */
export type SkinKind = 'drape' | 'crumple' | 'crack';
export interface Skin {
  kind: SkinKind;
  /** Profondeur des plis ou des fissures (0..1). */
  depth: number;
  /** Densité (0..1) : peu de grands plis → beaucoup de petits. */
  density: number;
  /** Draperie : orientation des plis (radians, 0 = plis qui tombent, comme un rideau de scène). */
  angle?: number;
}
export interface Volume {
  kind: VolumeKind;
  /** Force (0..1) : 1 = demi-sphère pour le dôme, pente à 45° pour le cône. */
  amount: number;
  /** Cylindre : direction de l'axe dans la forme (radians, 0 = debout). */
  axis?: number;
  skin?: Skin;
}
export const VOLUMES: Array<[VolumeKind, string]> = [
  ['flat', 'À plat'],
  ['dome', 'Dôme'],
  ['cylinder', 'Cylindre'],
  ['cone', 'Cône'],
  ['cushion', 'Coussin'],
];
export const SKINS: Array<[SkinKind, string]> = [
  ['drape', 'Draperie'],
  ['crumple', 'Froissure'],
  ['crack', 'Craquelure'],
];
/** Le volume soulève-t-il quelque chose (une forme ou une peau) ? */
export const volumeOn = (v: Volume | undefined): boolean => !!v && ((v.kind !== 'flat' && v.amount > 0.001) || (!!v.skin && v.skin.depth > 0.001));
/** Nom du volume dans la liste des attributs : « Dôme », « Draperie », « Dôme froissé »… */
export function volumeName(v: Volume): string {
  const shape = VOLUMES.find((x) => x[0] === v.kind)?.[1] ?? 'Volume';
  if (!v.skin) return shape;
  const skin = SKINS.find((x) => x[0] === v.skin!.kind)![1];
  return v.kind === 'flat' ? skin : `${shape} · ${skin.toLowerCase()}`;
}

/** Taille de l'image exportée : 300 dpi pour l'imprimé, la taille native pour les écrans. */
export function exportSize(f: Format, width?: number): { w: number; h: number } {
  if (width) return { w: Math.round(width), h: Math.round((width * f.height) / f.width) };
  if (f.unit === 'mm') {
    const dpi = f.dpi ?? 300;
    return { w: Math.round((f.width / 25.4) * dpi), h: Math.round((f.height / 25.4) * dpi) };
  }
  return { w: Math.round(f.width), h: Math.round(f.height) };
}
