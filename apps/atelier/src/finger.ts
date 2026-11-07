import type { FingerMode } from './prefs';

/**
 * Le doigt et le stylet. Sans stylet (téléphone, tablette sans crayon), le doigt tient l'outil ;
 * dès qu'un stylet s'est montré sur l'appareil, ou qu'une souris est branchée, il reprend le déplacement.
 */

/** Le doigt dessine-t-il ? « draw » et « move » le fixent ; « auto » décide d'après l'appareil. */
export const fingerDrawsFor = (mode: FingerMode, penSeen: boolean, finePointer: boolean) => mode === 'draw' || (mode === 'auto' && !penSeen && !finePointer);

/**
 * Un stylet vient de se montrer : « draw » revient à l'automatique (le stylet prend l'outil), et on
 * le dit quand le doigt dessinait jusque-là (sauf si on a choisi « move », qui ne change rien).
 */
export const afterPen = (mode: FingerMode, fingerDrew: boolean): { mode: FingerMode; toast: boolean } => ({
  mode: mode === 'draw' ? 'auto' : mode,
  toast: fingerDrew && mode !== 'move',
});

/** Stylet posé : la paume et les doigts qui frôlent l'écran sont ignorés. */
export const ignoreTouch = (pointerType: string, down: Iterable<{ type: string }>) => pointerType === 'touch' && [...down].some((p) => p.type === 'pen');

/** L'outil que prend un pointeur : le doigt déplace sauf s'il dessine ; le volet des attributs déplace toujours. */
export const pointerTool = <T extends string>(pointerType: string, fingerDraws: boolean, tool: T, editing: boolean): T | 'move' =>
  (pointerType === 'touch' && !fingerDraws) || editing ? 'move' : tool;
