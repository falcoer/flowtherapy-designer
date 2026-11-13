import type { ElementSheet, ElementStore } from '@ftd/core';
import type { BrushKind, EdgeElementStyle, Stroke } from './model';
import type { Matter } from './particles';
import type { Ramify } from './ramify';

/**
 * Éléments : ce que l'on peint (eau, feu, poussière, acrylique). L'utilisateur choisit un élément,
 * puis un jeu de paramètres, puis affine aux potards ; le moteur qui calcule (`brush`) est un détail
 * de la fiche. « Matière » reste le mot du support des objets.
 */
export type ElementId = 'acrylic' | 'aquarelle' | 'spray' | 'water' | 'dust' | 'glitter' | 'light' | 'smoke' | 'spark' | 'burn' | 'branch' | 'bolt' | 'frost' | 'fire' | 'hair';

/** Réglages d'un trait que les potards d'un élément peuvent porter (tous entre 0 et 1, sauf `bend` entre −1 et 1). */
export type ParamKey = 'focus' | 'bend' | 'density' | 'pool' | 'branches' | 'converge' | 'core' | 'hairLen' | 'curl' | 'char' | 'hole' | 'flame';
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
  /** Bornes que le potard parcourt (par défaut 0 et 1, −1 et 1 pour un potard à deux sens). */
  lo?: number;
  hi?: number;
  /** Interrupteur au lieu d'un potard : icône, et bulles d'aide quand il est actif ou non. */
  toggle?: { icon: string; on: string; off: string };
  /** Mot ajouté au nom selon la valeur (« Frisure · alpaga »). */
  zone?: (v: number) => string;
  /** Valeur affichée à la place du pourcentage. */
  fmt?: (v: number) => string;
}

export interface ElementDef {
  /** Identifiant : celui d'une fiche d'origine, ou celui d'une copie faite dans la Configuration globale. */
  id: string;
  /** Fiche d'origine : elle donne le moteur et le rendu (une copie ne peut pas en inventer). */
  base: ElementId;
  /** Copie faite par un gérant (on peut la modifier et la retirer). */
  copy?: boolean;
  /** Réglages figés : leurs potards sont cachés, la valeur est toujours celle-ci. */
  fixed?: Params;
  /** Passe vivante : false pour une copie qui sèche aussitôt. */
  pass?: boolean;
  /** Déborder : false pour une copie qui reste toujours dans la forme. */
  spill?: boolean;
  name: string;
  family: string;
  icon: string;
  hint: string;
  /** Moteur qui calcule le trait. */
  brush: BrushKind;
  /** Moteur des particules : comment un grain se dessine. */
  matter?: Matter;
  /** Moteur Ramification : rendu des ramifications (électricité, givre), sinon Ramures. */
  ramify?: Ramify;
  /** Outils qui tirent l'élément, quand il y en a plusieurs : chacun peut changer de moteur. */
  tools?: Array<{ key: string; label: string; icon: string; hint: string; brush: BrushKind }>;
  knobs: KnobDef[];
  /** Jeux de paramètres prêts à l'emploi ; le premier donne les réglages de départ. */
  presets: Array<{ name: string; values: Params }>;
}

const BRANCH_MAX = 16;
/** Ramifications : le potard va de 0 à 1, le trait en compte de 1 à 16. */
export const branchCount = (v: number) => 1 + Math.round(v * (BRANCH_MAX - 1));

const ZONES = ['nuage', 'comètes', 'traînées'];
/** Potards du moteur Jet, avec les mots de l'élément ; sans nom de cumul, l'élément n'en a pas. */
const jet = (focus: string, density: string, bend: string, pool: string | null, mainPool: boolean, zones = ZONES): KnobDef[] => [
  { key: 'focus', label: focus, glyph: 'resserrage', main: true, zone: (v) => zones[v < 0.3 ? 0 : v < 0.7 ? 1 : 2]! },
  { key: 'density', label: density, glyph: 'densité', main: true },
  { key: 'bend', label: bend, glyph: 'courbure', center: true, main: !mainPool },
  ...(pool ? [{ key: 'pool' as const, label: pool, glyph: 'cumul', main: mainPool }] : []),
];

const BUILTIN: Array<Omit<ElementDef, 'id' | 'base'> & { id: ElementId }> = [
  {
    id: 'acrylic',
    name: 'Acrylique',
    family: 'Revêtements',
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
  { id: 'aquarelle', name: 'Aquarelle', family: 'Revêtements', icon: 'brush-aquarelle', hint: 'lavis transparent, les couleurs fusent dans le mouillé', brush: 'aquarelle', knobs: [], presets: [] },
  {
    id: 'spray',
    name: 'Bombe',
    family: 'Revêtements',
    icon: 'brush-spray',
    hint: 'voile de gouttelettes, projections quand on resserre',
    brush: 'glitter',
    matter: 'spray',
    knobs: jet('Projection', 'Débit', 'Courbure', 'Coulures', false, ['voile', 'éclaboussures', 'jet']),
    presets: [
      { name: 'Voile', values: { focus: 0, density: 0.5, bend: 0, pool: 0 } },
      { name: 'Voile dense', values: { focus: 0, density: 0.95, bend: 0, pool: 0.25 } },
      { name: 'Coulures', values: { focus: 0.2, density: 1, bend: 0, pool: 0.75 } },
      { name: 'Éclaboussures', values: { focus: 0.55, density: 0.45, bend: 0, pool: 0 } },
      { name: 'Jet', values: { focus: 0.95, density: 0.6, bend: 0.1, pool: 0 } },
    ],
  },
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
    id: 'frost',
    name: 'Givre',
    family: 'Eau',
    icon: 'matter-frost',
    hint: 'cristaux qui poussent en aiguilles',
    brush: 'branch',
    ramify: 'frost',
    knobs: [
      { key: 'branches', label: 'Bras', main: true, fmt: (v) => String(branchCount(v)) },
      { key: 'converge', label: 'Désordre', main: true },
    ],
    presets: [
      { name: 'Étoile', values: { branches: 5 / 15, converge: 0.05 } },
      { name: 'Fougère', values: { branches: 0, converge: 0.15 } },
      { name: 'Givre épais', values: { branches: 9 / 15, converge: 0.4 } },
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
    id: 'smoke',
    name: 'Fumée',
    family: 'Lumière et feu',
    icon: 'matter-smoke',
    hint: 'volutes pâles qui montent',
    brush: 'glitter',
    matter: 'smoke',
    knobs: jet('Resserrage', 'Épaisseur', 'Volutes', null, false, ['brume', 'volutes', 'filet']),
    presets: [
      { name: 'Brume', values: { focus: 0, density: 0.5, bend: 0 } },
      { name: 'Volutes', values: { focus: 0.45, density: 0.55, bend: 0.6 } },
      { name: 'Filet', values: { focus: 0.9, density: 0.4, bend: 0.25 } },
    ],
  },
  {
    id: 'spark',
    name: 'Étincelles',
    family: 'Lumière et feu',
    icon: 'matter-spark',
    hint: 'traits brûlants qui retombent',
    brush: 'glitter',
    matter: 'spark',
    knobs: jet('Resserrage', 'Densité', 'Courbure', null, false, ['éparses', 'gerbe', 'traits']),
    presets: [
      { name: 'Gerbe', values: { focus: 0.55, density: 0.5, bend: 0 } },
      { name: 'Pluie de feu', values: { focus: 0.2, density: 0.75, bend: 0 } },
      { name: 'Traits', values: { focus: 1, density: 0.35, bend: 0 } },
    ],
  },
  {
    id: 'bolt',
    name: 'Électricité',
    family: 'Lumière et feu',
    icon: 'matter-bolt',
    hint: 'arcs brisés qui fourchent',
    brush: 'branch',
    ramify: 'bolt',
    knobs: [
      { key: 'focus', label: 'Resserrage', glyph: 'resserrage', main: true, zone: (v) => (v < 0.3 ? 'plasma' : v < 0.75 ? 'gerbe' : 'foudre') },
      { key: 'branches', label: 'Arcs', main: true, fmt: (v) => String(branchCount(v)) },
      { key: 'converge', label: 'Désordre' },
    ],
    presets: [
      { name: 'Foudre', values: { focus: 1, branches: 1 / 15, converge: 0.45 } },
      { name: 'Orage', values: { focus: 0.85, branches: 4 / 15, converge: 0.6 } },
      { name: 'Arc', values: { focus: 0.6, branches: 1 / 15, converge: 0.3 } },
      { name: 'Plasma', values: { focus: 0, branches: 9 / 15, converge: 0.8 } },
    ],
  },
  {
    id: 'fire',
    name: 'Feu',
    family: 'Lumière et feu',
    icon: 'matter-fire',
    hint: 'le front brûle et porte des flammes jusqu’à ce qu’on l’éteigne',
    brush: 'burn',
    knobs: [
      { key: 'flame', label: 'Flammes', main: true },
      { key: 'char', label: 'Roussi', main: true, min: 0.02 },
      { key: 'hole', label: 'Trous', toggle: { icon: 'burn-hole', on: 'Trous : le feu perce la couche', off: 'Sans trou : le feu roussit seulement' } },
    ],
    presets: [
      { name: 'Feu de papier', values: { flame: 0.45, char: 0.3, hole: 1 } },
      { name: 'Brasier', values: { flame: 1, char: 0.5, hole: 1 } },
      { name: 'Braises', values: { flame: 0.12, char: 0.55, hole: 0 } },
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
    hint: 'brins fins couchés dans le sens du geste',
    brush: 'glitter',
    matter: 'hair',
    knobs: [
      { key: 'hairLen', label: 'Longueur', main: true, min: 0.03 },
      { key: 'curl', label: 'Frisure', main: true, zone: (v) => (v < 0.15 ? 'raide' : v < 0.6 ? 'alpaga' : 'mouton') },
      { key: 'density', label: 'Densité', glyph: 'densité' },
      { key: 'bend', label: 'Couchage', glyph: 'courbure', center: true },
    ],
    presets: [
      { name: 'Raides', values: { hairLen: 0.3, curl: 0, density: 0.5, bend: 0 } },
      { name: 'Coiffés', values: { hairLen: 0.4, curl: 0, density: 0.6, bend: 0.5 } },
      { name: 'Alpaga', values: { hairLen: 0.4, curl: 0.45, density: 0.5, bend: 0 } },
      { name: 'Mouton', values: { hairLen: 0.3, curl: 0.9, density: 0.5, bend: 0 } },
    ],
  },
];

/** Fiches d'origine : elles vivent dans le code, on peut les cacher mais pas les retirer. */
export const ELEMENTS: ElementDef[] = BUILTIN.map((e) => ({ ...e, base: e.id }));
const ORIGIN = new Map<string, ElementDef>(ELEMENTS.map((e) => [e.id, e]));
export const isBuiltin = (id: string): id is ElementId => ORIGIN.has(id);

/** Bornes que parcourt un potard. */
export const knobRange = (k: KnobDef): [number, number] => [k.lo ?? (k.center ? -1 : 0), k.hi ?? 1];

/** Réglages ramenés dans les bornes des potards (une copie peut les avoir resserrées). */
export function clampParams(def: ElementDef, p: Params): Params {
  const out: Params = { ...p };
  for (const k of def.knobs) {
    const v = out[k.key];
    if (v === undefined || k.toggle) continue;
    const [lo, hi] = knobRange(k);
    out[k.key] = Math.max(lo, Math.min(hi, v));
  }
  return out;
}

/**
 * Fiche d'un élément tirée d'une copie rangée sur le serveur : moteur, rendu, outils et potards
 * viennent de la fiche d'origine, la copie choisit ce qu'elle montre et sous quel nom.
 */
export function elementFrom(sh: ElementSheet): ElementDef | null {
  const o = ORIGIN.get(sh.base);
  if (!o || ORIGIN.has(sh.id)) return null;
  const fixed: Params = { ...o.fixed };
  const knobs: KnobDef[] = [];
  for (const k of o.knobs) {
    const c = sh.knobs.find((x) => x.key === k.key);
    if (c?.fixed !== undefined) {
      fixed[k.key] = c.fixed;
      continue;
    }
    const [lo, hi] = c?.lo !== undefined && c.hi !== undefined ? [c.lo, c.hi] : knobRange(k);
    knobs.push({ ...k, ...(c?.label ? { label: c.label } : {}), ...(c?.main !== undefined ? { main: c.main } : {}), lo, hi, ...(k.min !== undefined ? { min: Math.max(k.min, lo) } : {}) });
  }
  const keys = new Set<string>(o.knobs.map((k) => k.key));
  const tools = sh.tools && o.tools ? o.tools.filter((t) => sh.tools!.includes(t.key)) : o.tools;
  const def: ElementDef = {
    ...o,
    id: sh.id,
    base: o.base,
    copy: true,
    name: sh.name,
    family: sh.family,
    icon: sh.icon,
    hint: sh.hint,
    knobs,
    ...(Object.keys(fixed).length ? { fixed } : {}),
    tools: tools?.length ? tools : undefined,
    presets: sh.presets.map((p) => ({ name: p.name, values: Object.fromEntries(Object.entries(p.values).filter(([k]) => keys.has(k))) as Params })),
    ...(sh.pass !== undefined ? { pass: sh.pass } : {}),
    ...(sh.spill !== undefined ? { spill: sh.spill } : {}),
  };
  // les jeux restent dans les bornes de la copie
  def.presets = def.presets.map((p) => ({ ...p, values: clampParams(def, p.values) }));
  return def;
}

/** Toutes les fiches : celles d'origine, puis les copies des gérants (cachées comprises). */
export const elementList = (store: ElementStore | null | undefined): ElementDef[] => [...ELEMENTS, ...(store?.sheets ?? []).map(elementFrom).filter((d): d is ElementDef => !!d)];

/** La fiche d'un élément ; une copie retirée entre-temps revient à l'aquarelle. */
export const elementOf = (id: string, list: ElementDef[] = ELEMENTS) => list.find((e) => e.id === id) ?? ORIGIN.get(id) ?? ORIGIN.get('aquarelle')!;

/** Réglages de départ de chaque élément : son premier jeu de paramètres. */
export const startParams = (): Record<string, Params> => Object.fromEntries(ELEMENTS.map((e) => [e.id, { ...(e.presets[0]?.values ?? {}) }]));

/** Réglages en cours d'un élément (ceux de départ s'il n'a pas encore servi). */
export const paramsOf = (all: Record<string, Params>, def: ElementDef): Params => (all[def.id] && def.copy ? clampParams(def, all[def.id]!) : (all[def.id] ?? { ...(def.presets[0]?.values ?? {}) }));

/** Jeu de paramètres en cours : celui dont toutes les valeurs sont celles des potards, sinon aucun. */
export const presetOf = (def: ElementDef, p: Params) => def.presets.findIndex((s) => Object.entries(s.values).every(([k, v]) => Math.abs((p[k as ParamKey] ?? 0) - v) < 0.005));

/** Ce que les réglages de l'élément écrivent dans le trait. */
export function strokeParams(def: ElementDef, params: Params): Partial<Stroke> {
  const inBounds = def.copy ? clampParams(def, params) : params;
  const p: Params = def.fixed ? { ...inBounds, ...def.fixed } : inBounds;
  switch (def.brush) {
    case 'glitter':
      // les poils ne poussent pas : le brin est entier dès qu'il est planté
      if (def.matter === 'hair') return { matter: 'hair', hairLen: p.hairLen ?? 0.3, curl: p.curl ?? 0, density: p.density ?? 0.5, bend: p.bend ?? 0 };
      return { matter: def.matter, focus: p.focus ?? 0, bend: p.bend ?? 0, density: p.density ?? 0.5, pool: p.pool ?? 0, grow: 0.12 };
    case 'branch':
      if (def.ramify === 'bolt') return { ramify: 'bolt', focus: p.focus ?? 1, branches: branchCount(p.branches ?? 1 / 15), converge: p.converge ?? 0.45, grow: 0.12 };
      if (def.ramify) return { ramify: def.ramify, branches: branchCount(p.branches ?? 5 / 15), converge: p.converge ?? 0.3, grow: 0.12 };
      return { branches: branchCount(p.branches ?? 5 / 15), converge: p.converge ?? 0.3, core: p.core ?? 1, grow: 0.12 };
    case 'burn':
      return { char: p.char ?? 0.3, hole: (p.hole ?? 1) > 0.5, grow: 0.15, ...(def.base === 'fire' ? { flame: p.flame ?? 0.5 } : {}) };
    default:
      return {};
  }
}

/**
 * Lueurs de bord tirées des éléments : le contour de l'objet devient le geste. Chaque lueur nomme un
 * élément, un de ses jeux de paramètres et une taille de pointe (multipliée par l'épaisseur de la lueur).
 */
export const EDGE_ELEMENTS: Record<EdgeElementStyle, { element: ElementId; preset: string; size: number }> = {
  bolt: { element: 'bolt', preset: 'Arc', size: 0.045 },
  frost: { element: 'frost', preset: 'Givre épais', size: 0.05 },
  sparks: { element: 'spark', preset: 'Gerbe', size: 0.05 },
  dust: { element: 'dust', preset: '', size: 0.06 },
  glitter: { element: 'glitter', preset: '', size: 0.05 },
  drops: { element: 'water', preset: 'Embruns', size: 0.05 },
  veins: { element: 'branch', preset: 'Veines', size: 0.04 },
  fur: { element: 'hair', preset: 'Raides', size: 0.05 },
};

/** Le trait qu'une lueur d'élément pose le long d'un contour (points en fractions de la cible). */
export function edgeStroke(style: EdgeElementStyle, pts: Array<{ x: number; y: number }>, guide: number, width: number, seed: number): Stroke {
  const ee = EDGE_ELEMENTS[style];
  const def = ORIGIN.get(ee.element)!;
  const values = def.presets.find((p) => p.name === ee.preset)?.values ?? def.presets[0]?.values ?? {};
  return { brush: def.brush, guide, size: ee.size * (0.4 + 1.6 * width), opacity: 1, seed, pts: pts.map((q) => ({ x: q.x, y: q.y, p: 0.7 })), ...strokeParams(def, values), grow: 1 };
}
