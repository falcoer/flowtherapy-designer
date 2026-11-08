/**
 * La touche Maj, au clavier ou par le bouton Maj de la barre (tablette).
 * Tenue : l'objet glisse sans aimant (ni ancrages, ni bords, ni angles de 15°), et une pièce
 * solidaire se déplace seule, sans se détacher de son ensemble.
 * Elle change aussi les gestes du trackpad : Maj + deux doigts tourne la Vue 3D.
 */

/** Maj est-elle tenue ? La touche du clavier, celle que porte l'évènement, ou le bouton verrouillé. */
export const shiftHeld = (latched: boolean, keyDown: boolean, eventShift = false) => latched || keyDown || eventShift;

/** Ce que fait un pas de molette ou de trackpad. */
export type WheelAction = 'zoom' | 'pan' | 'tilt' | 'rotate';

export interface WheelLike {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  /** Safari et Chrome : multiple de 120 pour une molette de souris. */
  wheelDeltaY?: number;
  wheelDeltaX?: number;
}

/**
 * Molette de souris ou trackpad ? La souris avance par crans (lignes, ou multiples de 120 dans
 * wheelDelta) et seulement sur un axe ; le trackpad glisse en petits pas, souvent sur les deux axes.
 */
export const looksLikeMouse = (e: WheelLike) => {
  if (e.deltaMode !== 0) return true;
  if (e.deltaX !== 0 && e.deltaY !== 0) return false;
  const w = e.wheelDeltaY || e.wheelDeltaX;
  if (w === undefined || w === 0) return false;
  return Math.abs(w) % 120 === 0 && Number.isInteger(e.deltaY) && Number.isInteger(e.deltaX);
};

/**
 * Un flot de pas de molette garde le même appareil : un glissé de trackpad qui passe par un pas
 * « rond » ne devient pas souris en plein geste.
 */
export const wheelDevice = (prev: { mouse: boolean; t: number } | null, e: WheelLike, now: number, gap = 250) =>
  prev && now - prev.t < gap ? { mouse: prev.mouse, t: now } : { mouse: looksLikeMouse(e), t: now };

/**
 * Trackpad (Mac) : deux doigts déplacent la vue, pincer zoome (Ctrl + molette, comme Safari et
 * Chrome l'envoient), Maj + deux doigts tourne la Vue 3D. Souris : la molette zoome, Maj + molette
 * tourne la Vue 3D, Alt + molette fait tourner la page.
 */
export const wheelAction = (e: WheelLike, shift: boolean, mouse: boolean): WheelAction => {
  if (e.ctrlKey) return 'zoom';
  if (shift || e.shiftKey) return 'tilt';
  if (e.altKey) return 'rotate';
  if (mouse) return Math.abs(e.deltaX) > Math.abs(e.deltaY) ? 'tilt' : 'zoom';
  return 'pan';
};

/** Le pas de la Vue 3D pour un pas de molette : [gauche-droite, avant-arrière] en degrés. */
export const tiltStep = (e: WheelLike, k = 0.15): [number, number] => {
  // Maj + molette de souris : le Mac change le défilement vertical en horizontal
  return [e.deltaX * k, -e.deltaY * k];
};

/** Zoom d'un pas : pincer (Ctrl) va plus vite que la molette. */
export const zoomFactor = (e: WheelLike) => Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));

/**
 * Le bouton Maj de la barre : tenu, il fait la touche Maj ; deux appuis rapprochés le verrouillent ;
 * verrouillé, un seul appui le relâche.
 */
export interface ShiftButton {
  /** Doigt posé sur le bouton. */
  held: boolean;
  /** Verrouillé par un double appui. */
  latched: boolean;
  /** Fin du dernier appui bref (ms), pour reconnaître le double appui ; 0 = aucun. */
  tapEnd: number;
  /** Début de l'appui en cours (ms). */
  downAt: number;
}
export const SHIFT_IDLE: ShiftButton = { held: false, latched: false, tapEnd: 0, downAt: 0 };
const DOUBLE_GAP = 350;
const TAP_MS = 300;

export const shiftDown = (s: ShiftButton, now: number): ShiftButton => {
  // verrouillé : un appui le relâche
  if (s.latched) return { ...SHIFT_IDLE };
  // second appui bref juste après le premier : verrou
  if (s.tapEnd && now - s.tapEnd < DOUBLE_GAP) return { held: true, latched: true, tapEnd: 0, downAt: now };
  return { held: true, latched: false, tapEnd: s.tapEnd, downAt: now };
};

export const shiftUp = (s: ShiftButton, now: number): ShiftButton => {
  if (!s.held) return s;
  // l'appui qui vient de verrouiller ne compte pas comme premier appui d'un autre double
  const brief = !s.latched && now - s.downAt < TAP_MS;
  return { ...s, held: false, tapEnd: brief ? now : 0 };
};

export const shiftButtonOn = (s: ShiftButton) => s.held || s.latched;
