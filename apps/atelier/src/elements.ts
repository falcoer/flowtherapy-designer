import type { BrushKind, Stroke } from './model';
import type { Matter } from './particles';

/**
 * Éléments : ce que l'on peint (eau, feu, poussière, acrylique). L'utilisateur choisit un élément,
 * puis un jeu de paramètres, puis affine aux potards ; le moteur qui calcule (`brush`) est un détail
 * de la fiche. « Matière » reste le mot du support des objets.
 */
export type ElementId = 'acrylic' | 'aquarelle' | 'spray' | 'water' | 'dust' | 'glitter' | 'light' | 'burn' | 'branch' | 'hair';

/** Réglages d'un trait que les potards d'un élément peuvent porter (tous entre 0 et 1, sauf `bend` entre −1 et 1). */
export type ParamKey = 'focus' | 'bend' | 'density' | 'pool' | 'branches' | 'converge' | 'core' | 'hairLen' | 'curl' | 'char' | 'hole';
export type Params = Partial<Record<ParamKey, number>>;

export interface KnobDef {
  key: ParamKey;
  /** Nom du potard, avec les mots de l'élément. */
  label: string;
  /** Dessin du potard : un libellé connu de knob.tsx (par défaut, le nom). */
  glyph?: string;
  /** Montré aussi en Mode simplifié. */
  main?: boolean;
  /** Potard à deux sens, neutre au milieu. */
  center?: boolean;
  /** Plus petite valeur acceptée. */
  min?: number;
  /** Interrupteur au lieu d'un potard : icône, et bulles d'aide quand il est actif ou non. */
  toggle?: { icon: string; on: string; off: string };
  /** Mot ajouté au nom selon la valeur (« Frisure · alpaga »). */
  zone?: (v: number) => string;
  /** Valeur affichée à la place du pourcentage. */
  fmt?: (v: number) => string;
}

export interface ElementDef {
  id: ElementId;
  name: string;
  family: string;
  icon: string;
  hint: string;
  /** Moteur qui calcule le trait. */
  brush: BrushKind;
  /** Moteur des particules : comment un grain se dessine. */
  matter?: Matter;
  /** Outils qui tirent l'élément, quand il y en a plusieurs : chacun peut changer de moteur. */
  tools?: Array<{ key: string; label: string; icon: string; hint: string; brush: BrushKind }>;
  knobs: KnobDef[];
  /** Jeux de paramètres prêts à l'emploi ; le premier donne les réglages de départ. */
  presets: Array<{ name: string; values: Params }>;
}

const BRANCH_MAX = 16;
/** Ramifications : le potard va de 0 à 1, le trait en compte de 1 à 16. */
export const branchCount = (v: number) => 1 + Math.round(v * (BRANCH_MAX - 1));

const jet = (focus: string, density: string, bend: string, pool: string, mainPool: boolean): KnobDef[] => [
  { key: 'focus', label: focus, glyph: 'resserrage', main: true, zone: (v) => (v < 0.3 ? 'nuage' : v < 0.7 ? 'comètes' : 'traînées') },
  { key: 'density', label: density, glyph: 'densité', main: true },
  { key: 'bend', label: bend, glyph: 'courbure', center: true, main: !mainPool },
  { key: 'pool', label: pool, glyph: 'cumul', main: mainPool },
];

export const ELEMENTS: ElementDef[] = [
  {
    id: 'acrylic',
    name: 'Acrylique',
    family: 'Peintures',
    icon: 'brush-acrylic',
    hint: 'pâte couvrante, tirée au pinceau ou au rouleau',
    brush: 'acrylic',
    tools: [
      { key: 'brush', label: 'Pinceau', icon: 'brush-acrylic', hint: 'pâte striée', brush: 'acrylic' },
      { key: 'roller', label: 'Rouleau', icon: 'brush-roller', hint: 'bande large pochée', brush: 'roller' },
    ],
    knobs: [],
    presets: [],
  },
  { id: 'aquarelle', name: 'Aquarelle', family: 'Peintures', icon: 'brush-aquarelle', hint: 'lavis transparent, les couleurs fusent dans le mouillé', brush: 'aquarelle', knobs: [], presets: [] },
  { id: 'spray', name: 'Bombe', family: 'Peintures', icon: 'brush-spray', hint: 'voile de gouttelettes', brush: 'spray', knobs: [], presets: [] },
  {
    id: 'water',
    name: 'Eau',
    family: 'Eau',
    icon: 'matter-water',
    hint: 'bruine, gouttes, zones mouillées',
    brush: 'glitter',
    matter: 'water',
    knobs: jet('Jet', 'Gouttes', 'Courbure', 'Mouillé', true),
    presets: [
      { name: 'Bruine', values: { focus: 0, density: 0.8, bend: 0, pool: 0 } },
      { name: 'Embruns', values: { focus: 0.35, density: 0.6, bend: 0, pool: 0.15 } },
      { name: 'Jet d’eau', values: { focus: 0.9, density: 0.6, bend: 0.15, pool: 0 } },
      { name: 'Zone mouillée', values: { focus: 0, density: 1, bend: 0, pool: 0.8 } },
    ],
  },
  {
    id: 'dust',
    name: 'Poussière',
    family: 'Poudres',
    icon: 'matter-dust',
    hint: 'grains mats qui se déposent',
    brush: 'glitter',
    matter: 'dust',
    knobs: jet('Souffle', 'Densité', 'Tourbillon', 'Dépôt', false),
    presets: [
      { name: 'Nuage', values: { focus: 0, density: 0.5, bend: 0, pool: 0 } },
      { name: 'Souffle', values: { focus: 0.5, density: 0.6, bend: 0, pool: 0 } },
      { name: 'Tourbillon', values: { focus: 0.2, density: 0.6, bend: 0.8, pool: 0 } },
      { name: 'Dépôt', values: { focus: 0, density: 1, bend: 0, pool: 0.7 } },
    ],
  },
  {
    id: 'glitter',
    name: 'Paillettes',
    family: 'Poudres',
    icon: 'matter-glitter',
    hint: 'éclats qui scintillent',
    brush: 'glitter',
    matter: 'glitter',
    knobs: jet('Resserrage', 'Densité', 'Courbure', 'Tapis', false),
    presets: [
      { name: 'Semées', values: { focus: 0, density: 0.5, bend: 0, pool: 0 } },
      { name: 'Pluie', values: { focus: 0.6, density: 0.6, bend: 0, pool: 0 } },
      { name: 'Traînée', values: { focus: 1, density: 0.5, bend: 0, pool: 0 } },
    ],
  },
  {
    id: 'light',
    name: 'Lumière',
    family: 'Lumière et feu',
    icon: 'matter-light',
    hint: 'points et traînées qui brillent',
    brush: 'glitter',
    matter: 'light',
    knobs: jet('Resserrage', 'Densité', 'Courbure', 'Fusion', false),
    presets: [
      { name: 'Poussière d’étoiles', values: { focus: 0, density: 0.5, bend: 0, pool: 0 } },
      { name: 'Comètes', values: { focus: 0.5, density: 0.5, bend: 0, pool: 0 } },
      { name: 'Traînées', values: { focus: 1, density: 0.5, bend: 0, pool: 0 } },
      { name: 'Arcs', values: { focus: 1, density: 0.5, bend: 0.7, pool: 0 } },
    ],
  },
  {
    id: 'burn',
    name: 'Brûlure',
    family: 'Lumière et feu',
    icon: 'brush-burn',
    hint: 'consume la couche, lisière de braise',
    brush: 'burn',
    knobs: [
      { key: 'char', label: 'Roussi', main: true, min: 0.02 },
      { key: 'hole', label: 'Trous', main: true, toggle: { icon: 'burn-hole', on: 'Trous : la brûlure perce la couche', off: 'Sans trou : la brûlure teinte seulement' } },
    ],
    presets: [
      { name: 'Trou', values: { char: 0.3, hole: 1 } },
      { name: 'Roussi', values: { char: 0.6, hole: 0 } },
    ],
  },
  {
    id: 'branch',
    name: 'Ramures',
    family: 'Vivant',
    icon: 'brush-branch',
    hint: 'veines, racines : la couleur se propage',
    brush: 'branch',
    knobs: [
      { key: 'branches', label: 'Ramifications', main: true, fmt: (v) => String(branchCount(v)) },
      { key: 'converge', label: 'Chaos', main: true },
      { key: 'core', label: 'Taille noyau' },
    ],
    presets: [
      { name: 'Veines', values: { branches: 5 / 15, converge: 0.3, core: 1 } },
      { name: 'Racines', values: { branches: 8 / 15, converge: 0.8, core: 1 } },
      { name: 'Fissures', values: { branches: 3 / 15, converge: 0.05, core: 0 } },
    ],
  },
  {
    id: 'hair',
    name: 'Poils',
    family: 'Vivant',
    icon: 'brush-hair',
    hint: 'brins fins effilés',
    brush: 'hair',
    knobs: [
      { key: 'hairLen', label: 'Longueur', main: true, min: 0.03 },
      { key: 'curl', label: 'Frisure', main: true, zone: (v) => (v < 0.15 ? 'raide' : v < 0.6 ? 'alpaga' : 'mouton') },
    ],
    presets: [
      { name: 'Raides', values: { hairLen: 0.3, curl: 0 } },
      { name: 'Alpaga', values: { hairLen: 0.4, curl: 0.45 } },
      { name: 'Mouton', values: { hairLen: 0.3, curl: 0.9 } },
    ],
  },
];

export const elementOf = (id: ElementId) => ELEMENTS.find((e) => e.id === id)!;

/** Réglages de départ de chaque élément : son premier jeu de paramètres. */
export const startParams = () => Object.fromEntries(ELEMENTS.map((e) => [e.id, { ...(e.presets[0]?.values ?? {}) }])) as Record<ElementId, Params>;

/** Jeu de paramètres en cours : celui dont toutes les valeurs sont celles des potards, sinon aucun. */
export const presetOf = (def: ElementDef, p: Params) => def.presets.findIndex((s) => Object.entries(s.values).every(([k, v]) => Math.abs((p[k as ParamKey] ?? 0) - v) < 0.005));

/** Ce que les réglages de l'élément écrivent dans le trait. */
export function strokeParams(def: ElementDef, p: Params): Partial<Stroke> {
  switch (def.brush) {
    case 'glitter':
      return { matter: def.matter, focus: p.focus ?? 0, bend: p.bend ?? 0, density: p.density ?? 0.5, pool: p.pool ?? 0, grow: 0.12 };
    case 'branch':
      return { branches: branchCount(p.branches ?? 5 / 15), converge: p.converge ?? 0.3, core: p.core ?? 1, grow: 0.12 };
    case 'hair':
      return { hairLen: p.hairLen ?? 0.3, curl: p.curl ?? 0 };
    case 'burn':
      return { char: p.char ?? 0.3, hole: (p.hole ?? 1) > 0.5, grow: 0.15 };
    default:
      return {};
  }
}
