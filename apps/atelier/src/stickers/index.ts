import { bird } from './bird';
import { countdown } from './countdown';
import { eye } from './eye';
import { humanoid } from './humanoid';
import type { Anim, Generator } from './kit';
import { letters } from './letters';
import { propeller } from './propeller';

export * from './kit';

/** Le catalogue des stickers, dans l'ordre du rayon « Animées ». */
export const GENERATORS: Generator[] = [countdown, bird, propeller, eye, humanoid];
/** Les générateurs qui animent un objet existant (Generator.on) : leurs gestes s'offrent sur la frise de cet objet. */
export const ANIMATORS: Generator[] = [letters];

const byKind = new Map([...GENERATORS, ...ANIMATORS].map((g) => [g.kind, g]));
/** Générateur qui anime une sorte d'objet (« text »), s'il y en a un. */
export const animatorFor = (kind: string): Generator | undefined => ANIMATORS.find((g) => g.on === kind);
/** Générateur d'un sticker ; absent si la composition vient d'une version qui en connaît d'autres. */
export const generatorOf = (a: Anim | string): Generator | undefined => byKind.get(typeof a === 'string' ? a : a.kind);

/** Données d'un nouveau sticker : son cycle et ses paramètres de départ. */
export function newAnim(g: Generator, over: Partial<Anim> = {}): Anim {
  const a: Anim = { kind: g.kind, cycle: g.cycle };
  for (const p of g.params) if (!(p.type === 'check' && p.def === p.off)) a[p.key] = p.def;
  return { ...a, ...over };
}
