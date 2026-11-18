import { bird } from './bird';
import { countdown } from './countdown';
import { eye } from './eye';
import { humanoid } from './humanoid';
import type { Anim, Generator } from './kit';
import { letters } from './letters';
import { propeller } from './propeller';
import { puddle } from './puddle';
import { rig } from './rig';
import { views } from './turn';

export * from './kit';

/** Le catalogue des stickers, dans l'ordre du rayon « Animées ». */
export const GENERATORS: Generator[] = [countdown, bird, propeller, eye, humanoid];
/** Les générateurs qui animent un objet existant (Generator.on) : leurs gestes s'offrent sur la frise de cet objet. */
export const ANIMATORS: Generator[] = [letters, puddle, views];

/** Le squelette qu'on pose dans un objet existant (photo, forme) pour l'habiller : ni sticker du rayon, ni animateur d'une sorte d'objet. */
export const RIG = rig;

const byKind = new Map([...GENERATORS, ...ANIMATORS, rig].map((g) => [g.kind, g]));
/** Générateur qui anime une sorte d'objet (« text », ou une forme : « shape:drop »), s'il y en a un. */
export const animatorFor = (kind: string): Generator | undefined => ANIMATORS.find((g) => g.on === kind);
/** Générateur d'un sticker ; absent si la composition vient d'une version qui en connaît d'autres. */
export const generatorOf = (a: Anim | string): Generator | undefined => byKind.get(typeof a === 'string' ? a : a.kind);

/** Données d'un nouveau sticker : son cycle et ses paramètres de départ. */
export function newAnim(g: Generator, over: Partial<Anim> = {}): Anim {
  const a: Anim = { kind: g.kind, cycle: g.cycle };
  for (const p of g.params) if (!(p.type === 'check' && p.def === p.off)) a[p.key] = p.def;
  return { ...a, ...over };
}

/**
 * Squelette posé dans un objet de proportions `ratio` (largeur / hauteur de sa boîte) : ses articulations de départ,
 * à caler ensuite, et aucun geste posé. L'objet garde sa découpe (marque `carved`) : elle se plie avec les os.
 */
export function newRig(ratio: number): Anim {
  return { ...newAnim(rig, { acts: [] }), ratio: Math.round(ratio * 1e4) / 1e4, carved: 1 };
}
export { RIG_BONES, RIG_JOINTS, RIG_NAMES, TEMPLATE_WIDTH, defaultJoints, fitJoints, jointsText, rigJoints, templateJoints, templateOf, type RigJoint } from './rig';
