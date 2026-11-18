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
  /**
   * Gestes posés sur la frise : chaque geste propre du sticker se déclenche à la demande, autant de fois qu'il faut, ou jamais.
   * Absent : sticker d'avant, ses gestes se répètent à chaque cycle (voir actsOf dans anim.ts).
   */
  acts?: Act[];
  /** Paramètres du générateur, par clé (Param.key). */
  [key: string]: number | string | Act[] | undefined;
}

/** Un geste posé sur la frise : lequel, sa place (début et durée en périodes), puis ses réglages propres par clé. */
export interface Act {
  id: string;
  /** Le geste (Gesture.id). */
  g: string;
  at: number;
  len: number;
  /** Geste en boucle : durée d'une boucle (un tour, un battement), en périodes. */
  cycle?: number;
  [key: string]: number | string | undefined;
}

/** Un paramètre réglable, tel que le panneau le présente. */
export interface Param {
  key: string;
  name: string;
  title?: string;
  /**
   * `int` : nombre saisi ; `range` : potard continu ; `steps` : potard à crans entiers ; `check` : case (valeurs on / off) ; `font` : police ;
   * `letters` : lettres visées d'un texte, toutes (« all ») ou une seule par son numéro (depuis 0, sans les blancs ; « mid », « last » au départ). Une autre lettre = un autre geste posé.
   * `choice` : un type de pièce parmi `options` (forme d'aile, de bec…), présenté en bulles à glisser, chacune montrant la forme qu'elle donne.
   */
  type: 'int' | 'range' | 'steps' | 'check' | 'font' | 'letters' | 'choice';
  min?: number;
  max?: number;
  /** Potard à crans : l'écart entre deux crans (1 sans précision). */
  step?: number;
  def: number | string;
  /** Choix : les types proposés, dans l'ordre de la bande. */
  options?: { id: string; name: string }[];
  /** Case : valeur cochée et décochée. */
  on?: number;
  off?: number;
  /** Le paramètre change les proportions de la boîte. */
  reshape?: boolean;
  /** Lecture de la valeur quand elle ne se lit pas telle quelle (anciens documents). */
  read?: (a: Anim) => number | string;
}

/**
 * Un jeu de réglages tout prêt (une espèce, un modèle) : il pose d'un coup les valeurs de plusieurs paramètres,
 * qu'on affine ensuite un par un. Reconnu tant que les valeurs sont les siennes.
 */
export interface Preset {
  id: string;
  name: string;
  set: Partial<Anim>;
}

/** Écart demandé à la pose de l'objet : s'ajoute aux consignes de la frise. */
export interface Order {
  dx?: number;
  dy?: number;
  /** Radians. */
  rot?: number;
  scale?: number;
  lift?: number;
  /** Déplacement compté en parts de la boîte de l'objet (largeur, hauteur) : il suit sa taille. */
  bx?: number;
  by?: number;
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
  /** Le geste tourne en boucle tant qu'il dure (rotation, battement) ; sinon il se joue une fois sur sa durée. */
  loop?: boolean;
  /** Paramètres propres au geste (Param.key), parmi ceux du générateur : chaque geste posé a les siens. */
  params?: string[];
  /** Plage de départ du geste dans le cycle (début et durée, 0..1) : le cycle entier si absente. */
  at?: number;
  len?: number;
  /** Geste en boucle : durée de départ d'une boucle, en périodes (celle du générateur si absente). */
  cycle?: number;
  /** `false` : le geste n'est pas posé au départ, il s'ajoute depuis la frise. */
  start?: boolean;
}

/**
 * Avancée d'un geste à un instant : de 0 à 1 sur la durée du geste posé (0 avant le premier, 1 une fois fini) ;
 * pour un geste en boucle, le nombre de boucles faites depuis le début de la vidéo.
 * C'est ce que lit un générateur pour se dessiner : chaque geste a sa place dans le cycle, réglée sur la frise.
 */
export type Progress = (gesture: string) => number;

/** Un geste posé, vu à un instant : son avancée et ses propres réglages (ceux de l'objet, remplacés par les siens). */
export interface ActState {
  act: Act;
  /** Avancée sur sa durée : 0 avant son début, 1 une fois fini. */
  u: number;
  /** Geste en boucle : boucles faites depuis son début (arrêté à sa fin), et boucles sur toute sa durée. */
  turns: number;
  of: number;
  /** Réglages vus par ce geste posé. */
  a: Anim;
}

/**
 * Ce qu'un générateur reçoit en plus de son avancée : chaque geste posé avec ses réglages (pour qu'ils s'additionnent
 * au lieu de se remplacer : deux lettres qui tombent l'une après l'autre), et l'objet animé quand le générateur
 * anime un objet existant (`Generator.on`) au lieu de dessiner sa propre forme.
 */
export interface Context {
  each: (gesture: string) => ActState[];
  host?: { text?: import('../text').TextStyle };
}

/** Plage d'un geste dans le cycle : celle réglée sur la frise (clés « geste.at », « geste.len »), sinon celle de départ. */
export function spanOf(a: Anim, g: Gesture): { at: number; len: number } {
  const at = Math.max(0, Math.min(0.98, numOf(a, `${g.id}.at`, g.at ?? 0)));
  const len = Math.max(0.02, Math.min(1 - at, numOf(a, `${g.id}.len`, g.len ?? 1)));
  return { at, len };
}
/** Avancée de chaque geste à une avancée du cycle. */
export function progressOf(a: Anim, gestures: Gesture[], phase: number): Progress {
  return (id) => {
    const g = gestures.find((x) => x.id === id);
    if (!g) return phase;
    const { at, len } = spanOf(a, g);
    return Math.max(0, Math.min(1, (phase - at) / len));
  };
}

export interface Generator {
  kind: string;
  name: string;
  /**
   * Sorte d'objet que ce générateur anime (« text », ou une forme par son nom : « shape:drop ») : il ne se pose pas comme un sticker, ses gestes s'offrent sur la frise
   * de tout objet de cette sorte, et sa découpe part de celle de l'objet (reçue dans `ctx.host`). Absent : un sticker.
   */
  on?: string;
  /** Cycle de départ (en périodes), son nom dans les réglages et ce qu'il dure. */
  cycle: number;
  cycleName: string;
  cycleWhat: string;
  params: Param[];
  /** Jeux de réglages tout prêts, proposés en premier dans les réglages de la forme, sous le nom `presetName`. */
  presets?: Preset[];
  presetName?: string;
  gestures: (a: Anim) => Gesture[];
  /** Découpe (coordonnées 0..1 de la boîte) à une avancée du cycle (0..1) ; `g` donne l'avancée de chaque geste. */
  cut: (a: Anim, phase: number, g: Progress, ctx: Context) => string;
  /**
   * Pièces du sticker : posé, il devient une couche par pièce, dans la même boîte, solidaires (chacune sa teinte, son bord).
   * La pièce d'une couche est dans ses données (`part`), avec l'identifiant du sticker posé (`set`) ; les autres réglages restent communs. `tint` décale la teinte de départ.
   */
  parts?: { id: string; name: string; tint?: number }[];
  /**
   * Partie de la forme qu'un réglage change (coordonnées 0..1 de la boîte, à la pose de la vignette) :
   * les bulles de ce réglage zooment dessus au lieu de montrer toute la forme. Absent : la forme entière.
   */
  focus?: (a: Anim, key: string) => { x: number; y: number; w: number; h: number } | undefined;
  /**
   * Déformation de la surface : la teinte, le dégradé, la peinture, le relief et les effets de matière se posent sur la forme
   * au repos ; à chaque instant, le maillage les emmène là où la forme est allée (le décor suit l'aile qui bat).
   * Absent, ou nul à cet instant : la surface reste fixe dans la boîte et la découpe bouge dessus.
   */
  warp?: (a: Anim, phase: number, g: Progress, ctx: Context) => Warp | null;
  /**
   * Os de la forme au repos (lignes brisées, coordonnées 0..1 de la boîte d'origine) : la vue « os seuls » les montre
   * pliés par la même déformation que la surface (warp), la chair cachée.
   */
  bones?: (a: Anim) => Array<Array<[number, number]>>;
  /**
   * Squelette à un instant : ses os, toujours dans le même ordre, chacun de son attache à son bout (coordonnées 0..1 de la boîte).
   * Un objet attaché au sticker suit l'os dont il est le plus proche au repos (un chapeau suit la tête).
   */
  /** La découpe sort de la boîte de l'objet (cils d'un œil) : la teinte la suit hors de la boîte. Matière, peinture et relief restent dans la boîte. */
  spill?: (a: Anim) => boolean;
  skeleton?: (a: Anim, phase: number, g: Progress, ctx: Context) => Array<[[number, number], [number, number]]>;
  /** Un objet attaché suit la surface pliée (warp) plutôt que l'os le plus proche (l'oiseau : ses os ne disent pas tout du battement). */
  surfaceFollow?: boolean;
  /** Proportions de la boîte (largeur / hauteur). */
  ratio: (a: Anim) => number;
  /** Consigne de mouvement ajoutée au plan général, à une avancée du cycle. */
  order?: (a: Anim, phase: number, g: Progress, ctx: Context) => Order;
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

/**
 * Déformation de la surface à un instant : `map` donne où va un point de la boîte au repos (0..1), à cet instant.
 * Le maillage passe par les colonnes `us` et les rangées `vs` (0..1, croissantes, bords compris) : y mettre les plis de la forme
 * (épaule, coude), car entre deux lignes la surface est tirée à plat. `key` désigne la déformation (elle se calcule une fois).
 */
export interface Warp {
  key: string;
  us: number[];
  vs: number[];
  map: (u: number, v: number) => [number, number];
  /**
   * Morceau de la surface sous un point de la boîte au repos (une lettre) : la surface se déchire entre deux morceaux,
   * une maille dont les coins vont à des morceaux différents n'est pas posée (elle ne porte rien, et tirée elle couvrirait ses voisines).
   */
  part?: (u: number, v: number) => number;
}

/** Valeur d'un paramètre : celle des données, sinon celle de départ. */
export function valueOf(p: Param, a: Anim): number | string {
  const v = a[p.key];
  return p.read ? p.read(a) : typeof v === 'number' || typeof v === 'string' ? v : p.def;
}
/** Le jeu de réglages dont les valeurs sont celles des données, s'il y en a un. */
export function presetOf(g: Generator, a: Anim): Preset | undefined {
  return g.presets?.find((p) => Object.entries(p.set).every(([k, v]) => {
    const prm = g.params.find((x) => x.key === k);
    return (prm ? valueOf(prm, a) : a[k]) === v;
  }));
}
export function numOf(a: Anim, key: string, def: number): number {
  return typeof a[key] === 'number' ? (a[key] as number) : def;
}

/** Les mêmes réglages pour une autre pièce du même sticker : seule la pièce reste la sienne. */
export function forPart(a: Anim, mine: Anim): Anim {
  const { part: _p, set: _s, ...rest } = a;
  return { ...rest, ...(mine.part === undefined ? {} : { part: mine.part }), ...(mine.set === undefined ? {} : { set: mine.set }) };
}

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

type Bone = [[number, number], [number, number]];
/**
 * Déformation de la surface par ses os (Generator.warp d'un sticker articulé) : chaque point suit l'os dont il est le plus près
 * au repos, en gardant sa place le long de l'os et son écart à lui (comme un objet attaché) ; près d'une articulation,
 * il prend un peu des deux os, pour que la peau se plie au lieu de se déchirer. `only` : les os qui portent cette pièce.
 * `ratio` : largeur / hauteur de la boîte (les distances se mesurent à unités égales). Nul quand les os n'ont pas bougé.
 */
export function skinWarp(key: string, rest: Bone[], cur: Bone[], ratio: number, only?: number[], band = 0.035): Warp | null {
  const ids = (only ?? rest.map((_, i) => i)).filter((i) => rest[i] && cur[i]);
  const q = (v: number) => Math.round(v * 2000);
  const sig = (bs: Bone[]) => ids.map((i) => bs[i]!.flat().map(q).join(',')).join(';');
  const now = sig(cur);
  if (!ids.length || now === sig(rest)) return null;
  const r = ratio || 1;
  // chaque os : son repère au repos et à l'instant (attache, direction, longueur), à unités égales
  const frames = ids.map((i) => {
    const [[ax, ay], [bx, by]] = rest[i]!;
    const [[cx, cy], [dx, dy]] = cur[i]!;
    const [p, v] = [[ax * r, ay], [(bx - ax) * r, by - ay]];
    const [s, w] = [[cx * r, cy], [(dx - cx) * r, dy - cy]];
    const rot = Math.atan2(w[1]!, w[0]!) - Math.atan2(v[1]!, v[0]!);
    return { p, v, len2: v[0]! ** 2 + v[1]! ** 2 || 1e-9, s, w, c: Math.cos(rot), sn: Math.sin(rot) };
  });
  type F = (typeof frames)[number];
  const near = (F: F, x: number, y: number) => {
    const k = Math.max(0, Math.min(1, ((x - F.p[0]!) * F.v[0]! + (y - F.p[1]!) * F.v[1]!) / F.len2));
    return { k, d: Math.hypot(x - F.p[0]! - k * F.v[0]!, y - F.p[1]! - k * F.v[1]!) };
  };
  const move = (F: F, k: number, x: number, y: number): [number, number] => {
    const [ox, oy] = [x - F.p[0]! - k * F.v[0]!, y - F.p[1]! - k * F.v[1]!];
    return [F.s[0]! + k * F.w[0]! + ox * F.c - oy * F.sn, F.s[1]! + k * F.w[1]! + ox * F.sn + oy * F.c];
  };
  const map = (u: number, v: number): [number, number] => {
    const [x, y] = [u * r, v];
    let [b1, b2] = [-1, -1];
    let [d1, d2, k1, k2] = [Infinity, Infinity, 0, 0];
    frames.forEach((F, i) => {
      const { k, d } = near(F, x, y);
      if (d < d1) [b2, d2, k2, b1, d1, k1] = [b1, d1, k1, i, d, k];
      else if (d < d2) [b2, d2, k2] = [i, d, k];
    });
    let [X, Y] = move(frames[b1]!, k1, x, y);
    if (b2 >= 0 && d2 - d1 < band) {
      const t = 0.5 * (1 - (d2 - d1) / band);
      const [X2, Y2] = move(frames[b2]!, k2, x, y);
      [X, Y] = [X + (X2 - X) * t, Y + (Y2 - Y) * t];
    }
    return [X / r, Y];
  };
  // maillage : régulier, plus une ligne par articulation (là où la peau se plie)
  const lines = (pick: (p: [number, number]) => number) => {
    const xs = [...Array.from({ length: 17 }, (_, i) => i / 16), ...ids.flatMap((i) => rest[i]!.map(pick))].filter((x) => x >= 0 && x <= 1).sort((a, b) => a - b);
    const out = [0];
    for (const x of xs) if (x - out[out.length - 1]! > 0.01) out.push(x);
    if (1 - out[out.length - 1]! < 0.01) out.pop();
    out.push(1);
    return out;
  };
  return { key: `${key}|${now}`, us: lines((p) => p[0]), vs: lines((p) => p[1]), map };
}
