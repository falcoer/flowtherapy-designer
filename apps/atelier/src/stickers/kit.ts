/**
 * Contrat d'un générateur de sticker. Un sticker est une forme dont la découpe dépend du temps :
 * son générateur décrit ses paramètres (annotés : nom, bornes, valeur de départ), ses gestes propres,
 * sa découpe à une avancée donnée du cycle et, s'il en a une, la consigne de mouvement qu'il ajoute au plan général.
 * Le moteur (anim.ts), la frise et les réglages ne lisent que cette description : aucun ne connaît un sticker par son nom.
 * Pour ajouter un sticker : un fichier dans ce dossier, puis une ligne dans index.ts.
 */

/** Données d'un sticker, enregistrées dans la composition : sa sorte, son cycle, puis ses paramètres par clé. */
export interface Anim {
  kind: string;
  /**
   * Calage du cycle, en nombre de périodes de référence de la page (Doc.timing).
   * 1/4, 1/2, 1, 2, 3… : un cycle qui divise la durée totale boucle sans saut.
   */
  cycle?: number;
  /** Ancienne vitesse (par seconde), lue quand `cycle` manque. */
  speed?: number;
  /** Paramètres du générateur, par clé (Param.key). */
  [key: string]: number | string | undefined;
}

/** Un paramètre réglable, tel que le panneau le présente. */
export interface Param {
  key: string;
  name: string;
  title?: string;
  /** `int` : nombre saisi ; `range` : potard continu ; `steps` : potard à crans entiers ; `check` : case (valeurs on / off) ; `font` : police. */
  type: 'int' | 'range' | 'steps' | 'check' | 'font';
  min?: number;
  max?: number;
  def: number | string;
  /** Case : valeur cochée et décochée. */
  on?: number;
  off?: number;
  /** Le paramètre change les proportions de la boîte. */
  reshape?: boolean;
  /** Lecture de la valeur quand elle ne se lit pas telle quelle (anciens documents). */
  read?: (a: Anim) => number | string;
}

/** Écart demandé à la pose de l'objet : s'ajoute aux consignes de la frise. */
export interface Order {
  dx?: number;
  dy?: number;
  /** Radians. */
  rot?: number;
  scale?: number;
  lift?: number;
}

/**
 * Un geste propre du sticker : il remonte sur la frise, sur sa ligne, répété à chaque cycle.
 * `order` = le geste passe par le plan général (mouvement d'objet) au lieu d'être dessiné dans la découpe.
 */
export interface Gesture {
  id: string;
  name: string;
  note?: string;
  order?: boolean;
  /** Paramètres propres au geste (Param.key), parmi ceux du générateur. */
  params?: string[];
}

export interface Generator {
  kind: string;
  name: string;
  /** Cycle de départ (en périodes), son nom dans les réglages et ce qu'il dure. */
  cycle: number;
  cycleName: string;
  cycleWhat: string;
  params: Param[];
  gestures: (a: Anim) => Gesture[];
  /** Découpe (coordonnées 0..1 de la boîte) à une avancée du cycle (0..1). */
  cut: (a: Anim, phase: number) => string;
  /** Proportions de la boîte (largeur / hauteur). */
  ratio: (a: Anim) => number;
  /** Consigne de mouvement ajoutée au plan général, à une avancée du cycle. */
  order?: (a: Anim, phase: number) => Order;
  /** Durée naturelle d'un cycle en « unités de vitesse » : sert seulement aux anciens documents réglés en vitesse. */
  legacyUnits?: (a: Anim) => number;
  /** Retouche des données quand on cale le cycle d'un ancien document. */
  migrate?: (a: Anim) => Partial<Anim>;
  /** Ligne d'information sous les réglages (durée d'un cycle en secondes). */
  note?: (a: Anim, cycleSeconds: number) => string;
  /** Taille de la boîte à la pose, en fraction du petit côté (0,55 par défaut). */
  size?: number;
  /** Vignette : un texte, ou la découpe à cette avancée du cycle. */
  glyphText?: string;
  glyphPhase?: number;
}

/** Valeur d'un paramètre : celle des données, sinon celle de départ. */
export function valueOf(p: Param, a: Anim): number | string {
  return p.read ? p.read(a) : (a[p.key] ?? p.def);
}
export const numOf = (a: Anim, key: string, def: number) => (typeof a[key] === 'number' ? (a[key] as number) : def);

export const frac = (x: number) => x - Math.floor(x);

// les découpes tournent en boucle sur un nombre fini d'images, gardées en cache
const cache = new Map<string, string>();
export function cached(key: string, make: () => string): string {
  let d = cache.get(key);
  if (d === undefined) {
    if (cache.size > 600) cache.clear();
    cache.set(key, (d = make()));
  }
  return d;
}
