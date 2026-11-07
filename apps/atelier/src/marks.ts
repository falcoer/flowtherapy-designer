import type { AnchorFrame } from '@ftd/core';
import type { Pin } from './model';

/**
 * Couleurs des repères. Chaque sorte de point ou de ligne de la page a sa
 * couleur caractéristique : on la retrouve sur le repère lui-même et sur le
 * bord de l'objet qui s'y tient pendant un déplacement. Les familles « objets »
 * (repères relatifs, lignes d'alignement) sont réservées aux points que les
 * objets posés créeront ensuite.
 */

export type MarkKind =
  | 'page'
  | 'margin'
  | 'half'
  | 'third'
  | 'quarter'
  | 'sixth'
  | 'fine'
  | 'golden'
  | 'diagonal'
  | 'reciprocal'
  | 'rabattement'
  | 'relative'
  | 'align';

export type MarkGroup = 'page' | AnchorFrame | 'objets';

export interface Mark {
  label: string;
  hint: string;
  group: MarkGroup;
  color: string;
  /** Famille prévue, pas encore créée par l'atelier. */
  soon?: boolean;
}

export const MARKS: Record<MarkKind, Mark> = {
  page: { label: 'Bord de page', hint: 'Le bord du format', group: 'page', color: '#3b3f4a' },
  margin: { label: 'Marge', hint: 'Le cadre des marges', group: 'page', color: '#00a6c8' },
  half: { label: 'Moitiés', hint: 'Centre et médianes', group: 'repartition', color: '#ff3b6b' },
  third: { label: 'Tiers', hint: 'Lignes à 1/3 et 2/3', group: 'repartition', color: '#7a5cff' },
  quarter: { label: 'Quarts', hint: 'Lignes à 1/4 et 3/4', group: 'repartition', color: '#ff9419' },
  sixth: { label: 'Sixièmes', hint: 'Lignes à 1/6 et 5/6', group: 'repartition', color: '#25b06c' },
  fine: { label: 'Plus fin', hint: 'Huitièmes, douzièmes, vingt-quatrièmes', group: 'repartition', color: '#8d93a0' },
  golden: { label: 'Nombre d’or', hint: 'Sections dorées', group: 'or', color: '#d4a20f' },
  diagonal: { label: 'Diagonales', hint: 'Points forts sur les diagonales', group: 'armature', color: '#e2573a' },
  reciprocal: { label: 'Réciproques', hint: 'Croisements des perpendiculaires depuis les coins', group: 'armature', color: '#25b06c' },
  rabattement: { label: 'Rabattements', hint: 'Le petit côté reporté sur le grand', group: 'armature', color: '#3d7bff' },
  relative: { label: 'Repères relatifs', hint: 'Points créés par les objets posés', group: 'objets', color: '#e14fd0', soon: true },
  align: { label: 'Alignements', hint: 'Lignes d’alignement entre objets', group: 'objets', color: '#00bfa5', soon: true },
};

export const MARK_KINDS = Object.keys(MARKS) as MarkKind[];

// couleurs choisies par la personne (préférences), par-dessus les couleurs d'origine
let custom: Partial<Record<MarkKind, string>> = {};
export const setMarkColors = (c: Partial<Record<MarkKind, string>>) => (custom = c);
export const markColor = (k: MarkKind) => custom[k] ?? MARKS[k].color;

/** Sortes de repères visibles avec ce référentiel : la page, puis ses points. */
export const marksOfFrame = (frame: AnchorFrame) => MARK_KINDS.filter((k) => MARKS[k].group === 'page' || MARKS[k].group === frame);

const DEN_KIND: Array<[number, MarkKind]> = [
  [2, 'half'],
  [3, 'third'],
  [4, 'quarter'],
  [6, 'sixth'],
];
const RANK: MarkKind[] = ['half', 'third', 'quarter', 'sixth', 'fine'];
const denKind = (frac: string): MarkKind => {
  const den = Number(frac.split('/')[1] ?? 1);
  return den <= 1 ? 'half' : (DEN_KIND.find(([d]) => d === den)?.[1] ?? 'fine');
};

/**
 * Sorte d'un point d'ancrage, d'après son nom. Un point de la répartition
 * prend la couleur de sa ligne la plus fine (celle qui l'a fait apparaître
 * en montant la densité) ; un point de l'armature, celle de sa ligne la plus
 * marquante (rabattement, puis diagonale, puis réciproque).
 */
export function anchorKind(frame: AnchorFrame, id: string): MarkKind {
  // sommets et milieux des côtés : la couleur de leur cadre
  if (id.startsWith('page ')) return 'page';
  if (id.startsWith('marge ')) return 'margin';
  if (frame === 'or') return 'golden';
  if (frame === 'repartition') {
    const m = /^h(\S+)\s+v(\S+)$/.exec(id);
    if (!m) return 'fine';
    const a = denKind(m[1]!);
    const b = denKind(m[2]!);
    return RANK.indexOf(a) >= RANK.indexOf(b) ? a : b;
  }
  if (frame === 'armature') {
    const parts = id.split('×').map((s) => s.trim());
    // le croisement des diagonales est le centre : même couleur que les moitiés
    if (parts.every((p) => p === 'd1' || p === 'd2')) return 'half';
    if (parts.some((p) => p.startsWith('rb'))) return 'rabattement';
    if (parts.some((p) => p.startsWith('d'))) return 'diagonal';
    if (parts.some((p) => p.startsWith('r'))) return 'reciprocal';
    return 'half';
  }
  return 'margin';
}

/** Sorte de la ligne tenue par un bord : la marge, ou la page quand il n'y a pas de marge. */
export const pinKind = (p: Pin, hasMargin: boolean): MarkKind => (p === 'margin' && hasMargin ? 'margin' : 'page');

const KEY = 'ftd-atelier-marks';
export function loadMarkColors(): Partial<Record<MarkKind, string>> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
export function saveMarkColors(c: Partial<Record<MarkKind, string>>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* stockage indisponible : les couleurs restent pour cette session */
  }
}
