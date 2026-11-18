import { numOf, type Anim, type Context, type Generator, type Gesture, type Order } from './kit';

/**
 * Gestes d'un objet à plusieurs vues (personnage illustré, forme) : se retourner, en passant par chacune de ses vues.
 * Le geste ne dessine rien : il dit où en est le demi-tour (Order.turn), la pose de l'objet choisit la vue et l'amincit
 * au changement (anim.ts, posed).
 */
export const TURN: Gesture = { id: 'turn', name: 'Se retourner', note: 'passe par ses vues : face, trois-quarts, profil, dos', params: ['back'], len: 0.5, start: false };
export const TURN_PARAMS = [{ key: 'back', name: 'Aller-retour', title: 'Revient à sa vue de départ à la fin du geste', type: 'check' as const, on: 1, off: 0, def: 1 }];

/** Avancée du demi-tour à cet instant (0 : vue de départ, 1 : vue la plus éloignée), ou undefined sans demi-tour posé. */
export function turnOf(ctx: Context): number | undefined {
  const all = ctx.each('turn');
  if (!all.length) return undefined;
  // le dernier demi-tour commencé l'emporte ; aller-retour : la moitié pour aller, l'autre pour revenir
  const live = all.filter((s) => s.u > 0);
  if (!live.length) return 0;
  const s = live[live.length - 1]!;
  const back = numOf(s.a, 'back', 1) > 0.5;
  const ease = (x: number) => x * x * (3 - 2 * x);
  return back ? ease(s.u < 0.5 ? 2 * s.u : 2 - 2 * s.u) : ease(s.u);
}

export const turnOrder = (_a: Anim, _phase: number, _g: unknown, ctx: Context): Order => ({ turn: turnOf(ctx) });

/** L'animateur des objets à plusieurs vues qui n'ont pas d'autre animation (une forme, une illustration sans squelette). */
export const views: Generator = {
  kind: 'views',
  name: 'Vues',
  on: 'views',
  cycle: 1,
  cycleName: 'Boucle',
  cycleWhat: 'Un demi-tour',
  params: TURN_PARAMS,
  gestures: () => [TURN],
  // l'objet garde sa découpe (celle de sa vue) : celle-ci ne sert qu'à une vignette
  cut: () => 'M0 0L1 0L1 1L0 1Z',
  order: turnOrder,
  // l'objet garde sa boîte : ce rapport ne sert qu'à une vignette
  ratio: () => 1,
  glyphText: '↻',
};
