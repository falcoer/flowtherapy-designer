import { contours, intersect, ringsOfGeom, simplifyRing, union, type Ring } from '../cut';

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
  /**
   * Objet à plusieurs vues (Layer.views) : avancée d'un demi-tour (0 : sa vue, 1 : la vue la plus éloignée), qui passe
   * par les vues qu'il a, chacune à son tour, l'objet s'amincissant à chaque changement.
   */
  turn?: number;
  /** Objet à plusieurs vues : la vue à montrer pendant le geste (« profil » pour la marche de côté). */
  view?: string;
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
  /** L'objet qui porte l'animation : son texte, ou sa découpe au repos (une silhouette que la peau suit). */
  host?: { text?: import('../text').TextStyle; cut?: string };
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
  /** La découpe sort de la boîte de l'objet (cils d'un œil) : la teinte la suit hors de la boîte. Matière, peinture et relief restent dans la boîte. */
  spill?: (a: Anim) => boolean;
  /**
   * Squelette à un instant : ses os, toujours dans le même ordre, chacun de son attache à son bout (coordonnées 0..1 de la boîte).
   * C'est le squelette commun : la vue des os le montre, un objet attaché suit l'os dont il est le plus proche au repos (un chapeau suit la tête),
   * et la peau (skinWarp) le suit de la même façon.
   */
  skeleton?: (a: Anim, phase: number, g: Progress, ctx: Context) => Bone[];
  /**
   * Chair (le gras) autour de chaque os, dans l'ordre du squelette : son épaisseur de l'os au bord, en parts de la hauteur de la boîte.
   * Un point choisit l'os dont la chair est la plus proche (pas seulement la ligne de l'os) : le ventre suit la colonne, pas la clavicule.
   * La vue des os la montre en transparence. Absente : des os sans épaisseur.
   */
  flesh?: (a: Anim) => number[];
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
  /**
   * Marionnette : la surface en pièces rigides (une par os), posées dans l'ordre (les premières dessous). Chaque pièce garde
   * ses anneaux pris sur la surface au repos (coordonnées 0..1 de la boîte) et la transformation affine qui la pose
   * ([a, b, c, d, e, f] : x' = a·x + c·y + e, y' = b·x + d·y + f). Quand elles sont là, la surface se dessine par pièces, sans maillage.
   */
  pieces?: Array<{ rings: Ring[]; A: [number, number, number, number, number, number] }>;
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

/** Un os : de son attache à son bout (coordonnées 0..1 de la boîte). */
export type Bone = [[number, number], [number, number]];

/**
 * Repère d'un os, au repos et à l'instant, mesuré à unités égales (x × largeur/hauteur de la boîte) : attache, direction, rotation,
 * et sa chair (rayon). C'est la mécanique commune du squelette : la peau (skinWarp) et les objets attachés (anim.ts, animFollow) la partagent.
 */
export interface BoneFrame {
  /** Attache et direction au repos, longueur au carré. */
  p: [number, number];
  v: [number, number];
  len2: number;
  /** Attache et direction à l'instant. */
  s: [number, number];
  w: [number, number];
  /** Rotation de l'os depuis le repos (radians), et son cosinus, son sinus. */
  rot: number;
  c: number;
  sn: number;
  /** Chair autour de l'os (même unité). */
  r: number;
}
/** Les repères des os `ids` (tous si absent) ; `flesh` : la chair de chaque os, dans l'ordre du squelette. */
export function boneFrames(rest: Bone[], cur: Bone[], ratio: number, ids?: number[], flesh?: number[]): Array<BoneFrame & { i: number }> {
  const r = ratio || 1;
  return (ids ?? rest.map((_, i) => i))
    .filter((i) => rest[i] && cur[i])
    .map((i) => {
      const [[ax, ay], [bx, by]] = rest[i]!;
      const [[cx, cy], [dx, dy]] = cur[i]!;
      const v: [number, number] = [(bx - ax) * r, by - ay];
      const w: [number, number] = [(dx - cx) * r, dy - cy];
      const rot = Math.atan2(w[1], w[0]) - Math.atan2(v[1], v[0]);
      return { i, p: [ax * r, ay], v, len2: v[0] ** 2 + v[1] ** 2 || 1e-9, s: [cx * r, cy], w, rot, c: Math.cos(rot), sn: Math.sin(rot), r: Math.max(0, flesh?.[i] ?? 0) };
    });
}
/** Place d'un point le long de l'os au repos (0..1), et sa distance au bord de la chair (négative dedans). */
export function boneNear(F: BoneFrame, x: number, y: number): { k: number; d: number } {
  const k = Math.max(0, Math.min(1, ((x - F.p[0]) * F.v[0] + (y - F.p[1]) * F.v[1]) / F.len2));
  return { k, d: Math.hypot(x - F.p[0] - k * F.v[0], y - F.p[1] - k * F.v[1]) - F.r };
}
/** Le point emmené par l'os : il garde sa place le long de l'os (même s'il s'allonge) et son écart à lui, qui tourne avec lui. */
export function boneCarry(F: BoneFrame, k: number, x: number, y: number): [number, number] {
  const [ox, oy] = [x - F.p[0] - k * F.v[0], y - F.p[1] - k * F.v[1]];
  return [F.s[0] + k * F.w[0] + ox * F.c - oy * F.sn, F.s[1] + k * F.w[1] + ox * F.sn + oy * F.c];
}
/** Les deux os les plus proches d'un point (chair comptée) : indices dans `frames`, places le long de l'os, distances. */
export function nearestBones(frames: BoneFrame[], x: number, y: number) {
  let [b1, b2] = [-1, -1];
  let [d1, d2, k1, k2] = [Infinity, Infinity, 0, 0];
  frames.forEach((F, i) => {
    const { k, d } = boneNear(F, x, y);
    if (d < d1) [b2, d2, k2, b1, d1, k1] = [b1, d1, k1, i, d, k];
    else if (d < d2) [b2, d2, k2] = [i, d, k];
  });
  return { b1, d1, k1, b2, d2, k2 };
}

/**
 * Déformation de la surface par ses os (Generator.warp d'un sticker articulé) : chaque point suit l'os dont la chair est la plus près
 * au repos, en gardant sa place le long de l'os et son écart à lui (comme un objet attaché) ; près d'une articulation,
 * il prend un peu des deux os, pour que la peau se plie au lieu de se déchirer. `only` : les os qui portent cette pièce.
 * `ratio` : largeur / hauteur de la boîte (les distances se mesurent à unités égales). `flesh` : chair de chaque os (Generator.flesh).
 * Nul quand les os n'ont pas bougé.
 */
export function skinWarp(key: string, rest: Bone[], cur: Bone[], ratio: number, only?: number[], band = 0.035, flesh?: number[], fieldOf?: () => BoneField | undefined, order?: number[]): Warp | null {
  const ids = (only ?? rest.map((_, i) => i)).filter((i) => rest[i] && cur[i]);
  const q = (v: number) => Math.round(v * 2000);
  const sig = (bs: Bone[]) => ids.map((i) => bs[i]!.flat().map(q).join(',')).join(';');
  const now = sig(cur);
  if (!ids.length || now === sig(rest)) return null;
  // le champ des os ne se calcule qu'une fois le squelette en mouvement (caler les articulations à la main n'en a pas besoin)
  const field = fieldOf?.();
  const r = ratio || 1;
  const frames = boneFrames(rest, cur, r, ids, flesh);
  const map = (u: number, v: number): [number, number] => {
    const [x, y] = [u * r, v];
    const { b1, d1, k1, b2, d2, k2 } = field ? fieldBones(field, frames, u, v, x, y) : nearestBones(frames, x, y);
    let [X, Y] = boneCarry(frames[b1]!, k1, x, y);
    if (b2 >= 0 && d2 - d1 < band) {
      const t = 0.5 * (1 - (d2 - d1) / band);
      const [X2, Y2] = boneCarry(frames[b2]!, k2, x, y);
      [X, Y] = [X + (X2 - X) * t, Y + (Y2 - Y) * t];
    }
    return [X / r, Y];
  };
  // maillage : régulier, plus une ligne par articulation (là où la peau se plie)
  // une silhouette suivie (image détourée) : maillage plus fin, la peau se plie au ras du bras au lieu d'emmener ses voisins
  const fine = field ? 33 : 17;
  const lines = (pick: (p: [number, number]) => number) => {
    const xs = [...Array.from({ length: fine }, (_, i) => i / (fine - 1)), ...ids.flatMap((i) => rest[i]!.map(pick))].filter((x) => x >= 0 && x <= 1).sort((a, b) => a - b);
    const out = [0];
    for (const x of xs) if (x - out[out.length - 1]! > 0.01) out.push(x);
    if (1 - out[out.length - 1]! < 0.01) out.pop();
    out.push(1);
    return out;
  };
  const w: Warp = { key: `${key}|${now}|${flesh ? ids.map((i) => q(flesh[i] ?? 0)).join(',') : ''}|${field?.id ?? ''}`, us: lines((p) => p[0]), vs: lines((p) => p[1]), map };
  if (field) {
    const parts = restPieces(field, rest, r, flesh);
    const byBone = new Map(frames.map((F) => [F.i, F]));
    w.pieces = (order ?? ids)
      .filter((i) => parts[i]?.length && byBone.has(i))
      .map((i) => ({ rings: parts[i]!, A: boneAffine(byBone.get(i)!, r) }));
  }
  return w;
}

/**
 * Transformation qui emmène tout le plan avec un os (comme boneCarry, sans borner la place le long de l'os),
 * dans les coordonnées 0..1 de la boîte : [a, b, c, d, e, f].
 */
export function boneAffine(F: BoneFrame, r: number): [number, number, number, number, number, number] {
  // en unités égales (x × r) : p ↦ S + k·w + R·(p − P − k·v), k = (p − P)·v / |v|²
  const [vx, vy] = F.v;
  const [wx, wy] = F.w;
  const L = F.len2;
  const [c, sn] = [F.c, F.sn];
  // partie linéaire M = w·vᵀ/L + R·(I − v·vᵀ/L)
  const [p00, p01, p11] = [1 - (vx * vx) / L, -(vx * vy) / L, 1 - (vy * vy) / L];
  const M00 = (wx * vx) / L + c * p00 - sn * p01;
  const M01 = (wx * vy) / L + c * p01 - sn * p11;
  const M10 = (wy * vx) / L + sn * p00 + c * p01;
  const M11 = (wy * vy) / L + sn * p01 + c * p11;
  const [P0, P1] = F.p;
  const [S0, S1] = F.s;
  const t0 = S0 - (M00 * P0 + M01 * P1);
  const t1 = S1 - (M10 * P0 + M11 * P1);
  // retour aux coordonnées de la boîte (x / r)
  return [M00, M10 * r, M01 / r, M11, t0 / r, t1];
}

/**
 * Pièces de la marionnette au repos : pour chaque os, la part de la silhouette qu'il emmène (champ des os), un peu élargie
 * pour que les pièces se chevauchent sans fil de jour, plus un disque autour de son attache (l'épaule reste ronde quand le bras tourne).
 */
function restPieces(F: BoneField, rest: Bone[], r: number, flesh?: number[]): Array<Ring[] | null> {
  if (F.parts) return F.parts;
  const { cols, rows } = F;
  const N = cols * rows;
  const owner = new Int16Array(N).fill(-1);
  for (let c = 0; c < N; c++) {
    let [b, d] = [-1, Infinity];
    F.d.forEach((D, i) => {
      if (D && D[c]! < d) [b, d] = [i, D[c]!];
    });
    owner[c] = b;
  }
  // hors de la silhouette, chaque case prend l'os de la case de la silhouette la plus proche : les parts coupent le bord
  // de l'image franchement, au lieu de le longer (ce qui laisserait des fils)
  {
    const q: number[] = [];
    const seen = new Uint8Array(N);
    for (let c = 0; c < N; c++) if (F.inside[c]) (seen[c] = 1), q.push(c);
    for (let h = 0; h < q.length; h++) {
      const c = q[h]!;
      const [k, j] = [c % cols, (c / cols) | 0];
      for (const [dk, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const [kk, jj] = [k + dk, j + dj];
        if (kk < 0 || jj < 0 || kk >= cols || jj >= rows) continue;
        const nc = jj * cols + kk;
        if (seen[nc]) continue;
        seen[nc] = 1;
        owner[nc] = owner[c]!;
        q.push(nc);
      }
    }
  }
  // os voisins : qui partagent une articulation (le bras et la clavicule)
  const touch = (bi: number, bj: number) => {
    const [A, B] = [rest[bi], rest[bj]];
    if (!A || !B) return false;
    const same = (p: [number, number], q: [number, number]) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6;
    return same(A[0], B[1]) || same(A[1], B[0]) || same(A[0], B[0]) || same(A[1], B[1]);
  };
  // ou par un os entre eux (la cuisse et le tronc, par la hanche)
  const near = (bi: number, bj: number) => touch(bi, bj) || rest.some((_, k) => k !== bi && k !== bj && touch(bi, k) && touch(k, bj));
  const cell = Math.max(r / cols, 1 / rows);
  F.parts = rest.map((b, i) => {
    if (!b) return null;
    // la part de l'os dans la silhouette, sans ses fils de deux cases (ouverture : rognée puis regonflée), élargie d'une case ;
    // dehors, les cases qu'il emmène (le bord de l'image y passe)
    let m = new Uint8Array(N);
    for (let c = 0; c < N; c++) m[c] = owner[c] === i && F.inside[c] ? 1 : 0;
    const grow = (src: Uint8Array, keep: boolean) => {
      const out = new Uint8Array(N);
      for (let j = 0; j < rows; j++)
        for (let k = 0; k < cols; k++) {
          let all = true;
          let one = false;
          for (let dj = -1; dj <= 1; dj++)
            for (let dk = -1; dk <= 1; dk++) {
              const [jj, kk] = [j + dj, k + dk];
              const v = jj >= 0 && kk >= 0 && jj < rows && kk < cols ? src[jj * cols + kk]! : 0;
              if (v) one = true;
              else all = false;
            }
          out[j * cols + k] = (keep ? all : one) ? 1 : 0;
        }
      return out;
    };
    m = grow(grow(m, true), false);
    // élargie d'une case vers les os voisins seulement (ceux d'une même articulation) : les pièces se chevauchent aux jointures,
    // sans qu'une main collée à la hanche n'emporte une bande de hanche
    const wide = grow(m, false);
    for (let c = 0; c < N; c++) if (wide[c] && !m[c] && owner[c]! >= 0 && near(i, owner[c]!)) m[c] = 1;
    for (let c = 0; c < N; c++) if (owner[c] === i && !F.inside[c]) m[c] = 1;
    const px = new Uint8ClampedArray(N * 4);
    let any = false;
    for (let c = 0; c < N; c++)
      if (m[c]) {
        px[c * 4 + 3] = 255;
        any = true;
      }
    if (!any) return null;
    let rings: Ring[] = contours(px, cols, rows, 128).map((ring) => ring.map((p) => ({ x: p.x / cols, y: p.y / rows })));
    // l'attache : un disque autour de l'articulation d'où part l'os, pris sur la part de l'os et de ses voisins
    if (i !== 1) {
      const R = Math.max(2 * cell, 0.5 * (flesh?.[i] ?? 0));
      const [ax, ay] = b[0];
      const disc: Ring = Array.from({ length: 20 }, (_, n) => {
        const t = (n / 20) * 2 * Math.PI;
        return { x: ax + (Math.cos(t) * R) / r, y: ay + Math.sin(t) * R };
      });
      const kin = new Uint8ClampedArray(N * 4);
      for (let c = 0; c < N; c++) if (owner[c] === i || (owner[c]! >= 0 && near(i, owner[c]!))) kin[c * 4 + 3] = 255;
      const around = contours(kin, cols, rows, 128).map((ring) => ring.map((p) => ({ x: p.x / cols, y: p.y / rows })));
      const cap = ringsOfGeom(intersect([disc], around));
      if (cap.length) rings = ringsOfGeom(union(rings, cap));
    }
    // les éclats (un bout de tronc sous l'aisselle rattaché au bras) restent avec leur voisin : seules les vraies parts de l'os comptent
    const geo = intersect(F.rings, rings);
    const area = (poly: (typeof geo)[number]) => Math.abs(poly[0]!.reduce((a, p, k) => { const q = poly[0]![(k + 1) % poly[0]!.length]!; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
    const big = Math.max(0, ...geo.map(area));
    const out = ringsOfGeom(geo.filter((poly) => area(poly) >= 0.2 * big)).map((ring) => simplifyRing(ring, 0.0015)).filter((ring) => ring.length >= 3);
    return out.length ? out : null;
  });
  return F.parts;
}

/**
 * Distances le long de la silhouette (au repos) de chaque point de la boîte à chaque os, chair déduite : un bras collé au tronc
 * dans l'image n'est rejoint par le tronc qu'en passant par l'épaule, il n'emmène donc pas la moitié du bras quand celui-ci se lève.
 * Grille de `cols` × `rows` cases (centres), une couche de distances par os (indices du squelette).
 */
export interface BoneField {
  id: number;
  cols: number;
  rows: number;
  d: Array<Float32Array | null>;
  /** La silhouette au repos, et ses cases. */
  rings: Ring[];
  inside: Uint8Array;
  /** Pièces de la marionnette au repos, par os (calculées une fois). */
  parts?: Array<Ring[] | null>;
}

/** Cases de la grille dans la silhouette (anneaux en coordonnées 0..1 de la boîte, pair-impair). */
export function maskOf(rings: Array<Array<{ x: number; y: number }>>, cols: number, rows: number): Uint8Array {
  const m = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    const y = (j + 0.5) / rows;
    const xs: number[] = [];
    for (const r of rings)
      r.forEach((p, i) => {
        const q = r[(i + 1) % r.length]!;
        if (p.y <= y !== q.y <= y) xs.push(p.x + ((y - p.y) * (q.x - p.x)) / (q.y - p.y));
      });
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil(xs[k]! * cols - 0.5));
      const i1 = Math.min(cols - 1, Math.floor(xs[k + 1]! * cols - 0.5));
      for (let i = i0; i <= i1; i++) m[j * cols + i] = 1;
    }
  }
  return m;
}

let fieldIds = 0;
const fields = new Map<string, BoneField>();
/**
 * Champ des os dans une silhouette (voir BoneField). `rings` : la silhouette au repos ; `rest` : les os au repos ;
 * `ratio` : largeur / hauteur de la boîte ; `flesh` : chair de chaque os, déduite de la distance. Calculé une fois par silhouette et squelette.
 */
export function boneField(sig: string, rings: Array<Array<{ x: number; y: number }>>, rest: Bone[], ratio: number, flesh?: number[]): BoneField {
  const key = `${sig}|${ratio.toFixed(4)}|${rest.map((b) => b.flat().map((v) => v.toFixed(4)).join(',')).join(';')}|${(flesh ?? []).map((v) => v.toFixed(4)).join(',')}`;
  const hit = fields.get(key);
  if (hit) return hit;
  const r = ratio || 1;
  const rows = 96;
  const cols = Math.max(8, Math.min(192, Math.round(rows * r)));
  const inside = maskOf(rings, cols, rows);
  const [hx, hy] = [r / cols, 1 / rows];
  const hd = Math.hypot(hx, hy);
  // hors de la silhouette, le chemin coûte cher : il ne sert qu'à donner un os aux nœuds du maillage qui tombent dehors
  const OUT = 6;
  const N = cols * rows;
  const steps: Array<[number, number, number]> = [[1, 0, hx], [-1, 0, hx], [0, 1, hy], [0, -1, hy], [1, 1, hd], [1, -1, hd], [-1, 1, hd], [-1, -1, hd]];
  const d = rest.map((b, bi) => {
    if (!b) return null;
    // en double : arrondie à chaque pas, une distance égale paraîtrait plus courte et se reposerait sans fin
    const D = new Float64Array(N).fill(Infinity);
    // tas binaire des cases à visiter
    const heap: number[] = [];
    const prio: number[] = [];
    const push = (c: number, v: number) => {
      heap.push(c);
      prio.push(v);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (prio[p]! <= prio[i]!) break;
        [heap[p], heap[i]] = [heap[i]!, heap[p]!];
        [prio[p], prio[i]] = [prio[i]!, prio[p]!];
        i = p;
      }
    };
    const pop = (): [number, number] => {
      const top: [number, number] = [heap[0]!, prio[0]!];
      const lc = heap.pop()!;
      const lp = prio.pop()!;
      if (heap.length) {
        heap[0] = lc;
        prio[0] = lp;
        let i = 0;
        for (;;) {
          const [a, c] = [2 * i + 1, 2 * i + 2];
          let m = i;
          if (a < heap.length && prio[a]! < prio[m]!) m = a;
          if (c < heap.length && prio[c]! < prio[m]!) m = c;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i]!, heap[m]!];
          [prio[m], prio[i]] = [prio[i]!, prio[m]!];
          i = m;
        }
      }
      return top;
    };
    // l'os lui-même : ses cases partent de zéro moins sa chair ; un os en bout de chaîne (avant-bras, tibia, tête)
    // continue un peu au-delà de son articulation : la main, le pied dépassent du poignet, de la cheville
    const [[ax, ay], [b0x, b0y]] = b;
    const last = !rest.some((o, k) => k !== bi && o && Math.abs(o[0][0] - b0x) < 1e-6 && Math.abs(o[0][1] - b0y) < 1e-6);
    const [bx, by] = last ? [b0x + (b0x - ax) * 0.25, b0y + (b0y - ay) * 0.25] : [b0x, b0y];
    const len = Math.hypot((bx - ax) * r, by - ay);
    const n = Math.max(2, Math.ceil(len / (0.5 * Math.min(hx, hy))));
    const f0 = -(flesh?.[bi] ?? 0);
    for (let k = 0; k <= n; k++) {
      const [x, y] = [ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n];
      const i = Math.max(0, Math.min(cols - 1, Math.floor(x * cols)));
      const j = Math.max(0, Math.min(rows - 1, Math.floor(y * rows)));
      const c = j * cols + i;
      if (f0 < D[c]!) {
        D[c] = f0;
        push(c, f0);
      }
    }
    while (heap.length) {
      const [c, v] = pop();
      if (v > D[c]!) continue;
      const [i, j] = [c % cols, (c / cols) | 0];
      for (const [di, dj, h] of steps) {
        const [ni, nj] = [i + di, j + dj];
        if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
        const nc = nj * cols + ni;
        const w = v + h * (inside[nc] && inside[c] ? 1 : OUT);
        if (w < D[nc]!) {
          D[nc] = w;
          push(nc, w);
        }
      }
    }
    return Float32Array.from(D);
  });
  const F: BoneField = { id: ++fieldIds, cols, rows, d, inside, rings: rings.map((ring) => ring.map((p) => ({ x: p.x, y: p.y }))) };
  if (fields.size > 12) fields.clear();
  fields.set(key, F);
  return F;
}

/** Distance (champ des os) d'un point de la boîte (0..1) à l'os `i` : moyenne des quatre cases voisines. */
function fieldAt(F: BoneField, i: number, u: number, v: number): number {
  const D = F.d[i];
  if (!D) return Infinity;
  const fx = Math.max(0, Math.min(F.cols - 1, u * F.cols - 0.5));
  const fy = Math.max(0, Math.min(F.rows - 1, v * F.rows - 0.5));
  const [i0, j0] = [Math.floor(fx), Math.floor(fy)];
  const [i1, j1] = [Math.min(F.cols - 1, i0 + 1), Math.min(F.rows - 1, j0 + 1)];
  const [tx, ty] = [fx - i0, fy - j0];
  const at = (a: number, b: number) => D[b * F.cols + a]!;
  return (at(i0, j0) * (1 - tx) + at(i1, j0) * tx) * (1 - ty) + (at(i0, j1) * (1 - tx) + at(i1, j1) * tx) * ty;
}

/** Les deux os les plus proches d'un point en suivant la silhouette (champ des os) : comme nearestBones. */
function fieldBones(F: BoneField, frames: Array<BoneFrame & { i: number }>, u: number, v: number, x: number, y: number) {
  let [b1, b2] = [-1, -1];
  let [d1, d2] = [Infinity, Infinity];
  frames.forEach((Fr, n) => {
    const d = fieldAt(F, Fr.i, u, v);
    if (d < d1) [b2, d2, b1, d1] = [b1, d1, n, d];
    else if (d < d2) [b2, d2] = [n, d];
  });
  if (b1 < 0) return nearestBones(frames, x, y);
  return { b1, d1, k1: boneNear(frames[b1]!, x, y).k, b2, d2, k2: b2 >= 0 ? boneNear(frames[b2]!, x, y).k : 0 };
}
