import type { Layer } from './model';

/**
 * Choix des éléments de la page. Un toucher prend l'élément avec tout son ensemble (ses pièces solidaires) ;
 * avec Maj, il prend la pièce seule, puis chaque toucher ajoute un élément au choix ou l'en retire.
 *
 * Un choix : `main`, l'élément dont les attributs s'affichent ; `picks`, null pour « main et son ensemble »,
 * sinon la liste exacte des éléments choisis (main compris).
 */
export interface Pick {
  main: string | null;
  picks: string[] | null;
}

export interface PickStep {
  /** Le choix dès que le doigt se pose (c'est lui qu'un glisser emporte). */
  now: Pick;
  /** Le choix si le doigt se lève sans avoir bougé (simple toucher). */
  tap?: Pick;
  /** Ce qu'il y a à dire : plusieurs éléments choisis, ou la pièce seule prise dans son ensemble. */
  say?: 'many' | 'piece';
}

/**
 * Ce que fait un toucher sur l'élément `target`.
 * `current` : les éléments choisis avant le toucher (main en premier).
 */
export function pickStep(state: Pick, current: string[], target: string, withShift: boolean): PickStep {
  const inside = current.includes(target);
  if (!withShift) {
    if (!inside) return { now: { main: target, picks: null } };
    // déjà choisi : un glisser emporte tout le choix ; un simple toucher revient à l'ensemble de l'élément
    if (state.picks) return { now: { main: target, picks: current }, tap: { main: target, picks: null } };
    return { now: { main: target, picks: null } };
  }
  if (!inside) {
    const next = [...current, target];
    return { now: { main: target, picks: next }, say: next.length > 1 ? 'many' : undefined };
  }
  // un ensemble choisi en entier : Maj n'en garde que la pièce touchée
  if (!state.picks && current.length > 1) return { now: { main: target, picks: [target] }, say: 'piece' };
  // déjà choisi avec Maj : un simple toucher le retire du choix, un glisser emporte tout
  const rest = current.filter((x) => x !== target);
  const main = state.main && rest.includes(state.main) ? state.main : (rest[rest.length - 1] ?? null);
  return { now: { main: target, picks: current }, tap: rest.length ? { main, picks: rest } : { main: null, picks: null } };
}

/** Ce qui reste propre à chaque élément quand un réglage s'applique à plusieurs éléments choisis. */
const SPREAD_SKIP = new Set<string>(['id', 'name', 'kind', 'anchor', 'dx', 'dy', 'grip', 'w', 'h', 'cut', 'mask', 'shape', 'molded', 'text', 'src', 'ref', 'pins', 'link', 'strokes', 'rot', 'pivot', 'bump', 'anim', 'motion', 'gen', 'free', 'grad']);
const plainObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Reporte sur `to` ce qui a changé de `from` à `next` ; dans un réglage composé (bord, lueur…), seules les valeurs changées. */
const spreadOnto = (from: unknown, to: unknown, next: unknown): unknown => {
  if (plainObj(from) && plainObj(next) && plainObj(to)) {
    const out: Record<string, unknown> = { ...to };
    for (const k of new Set([...Object.keys(from), ...Object.keys(next)])) {
      if (same(from[k], next[k])) continue;
      const v = spreadOnto(from[k], to[k], next[k]);
      if (v === undefined) delete out[k];
      else out[k] = v;
    }
    return out;
  }
  return next === undefined ? undefined : structuredClone(next);
};
/** La part d'un réglage de l'élément principal qui passe à un autre élément choisi. */
export const spreadPatch = (main: Layer, other: Layer, patch: Partial<Layer>): Partial<Layer> => {
  const out: Record<string, unknown> = {};
  const m = main as unknown as Record<string, unknown>;
  const o = other as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (SPREAD_SKIP.has(k) || same(m[k], v)) continue;
    out[k] = spreadOnto(m[k], o[k], v);
  }
  return out as Partial<Layer>;
};
