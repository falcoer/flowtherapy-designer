import { bird } from './bird';
import { countdown } from './countdown';
import type { Anim, Generator } from './kit';
import { propeller } from './propeller';

export * from './kit';

/** Le catalogue des stickers, dans l'ordre du rayon « Animées ». */
export const GENERATORS: Generator[] = [countdown, bird, propeller];

const byKind = new Map(GENERATORS.map((g) => [g.kind, g]));
/** Générateur d'un sticker ; absent si la composition vient d'une version qui en connaît d'autres. */
export const generatorOf = (a: Anim | string): Generator | undefined => byKind.get(typeof a === 'string' ? a : a.kind);

/** Données d'un nouveau sticker : son cycle et ses paramètres de départ. */
export function newAnim(g: Generator, over: Partial<Anim> = {}): Anim {
  const a: Anim = { kind: g.kind, cycle: g.cycle };
  for (const p of g.params) if (!(p.type === 'check' && p.def === p.off)) a[p.key] = p.def;
  return { ...a, ...over };
}
