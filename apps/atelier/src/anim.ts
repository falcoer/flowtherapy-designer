import { pathToRings, ringsToPath, type Ring } from './cut';
import type { Format } from '@ftd/core';
import type { Layer, Pt } from './model';
import { textCut, textEpoch, type TextStyle } from './text';

/**
 * Formes animées : un générateur reçoit le temps `t` (en secondes) et rend la découpe de l'objet
 * à cet instant. Tout le reste (teinte, bord, lueur, volume, matière) s'applique comme sur une forme fixe.
 * Chaque animation tourne en boucle sur un nombre fini d'images, gardées en cache.
 */
export type AnimKind = 'countdown' | 'bird' | 'propeller';

export interface Anim {
  kind: AnimKind;
  /**
   * Calage du cycle, en nombre de périodes de référence de la page (Doc.timing) : le décompte entier,
   * un battement d'ailes, un tour d'hélice. 1/4, 1/2, 1, 2, 3… : un cycle qui divise la durée totale boucle sans saut.
   */
  cycle?: number;
  /** Hélice : sens de rotation (-1 = inverse des aiguilles d'une montre). */
  dir?: 1 | -1;
  /** Ancienne vitesse (par seconde), lue quand `cycle` manque. */
  speed?: number;
  /** Compte à rebours : valeur de départ, pas de décompte, police. */
  from?: number;
  step?: number;
  font?: string;
  /** Hélice : nombre de pales et leur largeur (0..1). */
  blades?: number;
  width?: number;
  /** Oiseau : amplitude du battement (0..1). */
  amp?: number;
}

export const ANIM_DEFAULTS: Record<AnimKind, Anim> = {
  countdown: { kind: 'countdown', cycle: 4, from: 3, step: 1, font: 'anton' },
  bird: { kind: 'bird', cycle: 1 / 2, amp: 0.8 },
  propeller: { kind: 'propeller', cycle: 1, blades: 3, width: 0.55 },
};

export const ANIM_NAMES: Record<AnimKind, string> = { countdown: 'Compte à rebours', bird: 'Vol d’oiseau', propeller: 'Hélice' };

// --- horloge ---

/**
 * Durée de la page animée : une période de référence (s) répétée un nombre de fois.
 * L'horloge revient à zéro au bout de période × nombre ; chaque animation cale son cycle en périodes.
 */
export interface Timing {
  period: number;
  count: number;
}
export const DEFAULT_TIMING: Timing = { period: 1, count: 4 };
export const timingOf = (t?: Partial<Timing>): Timing => ({
  // bornes larges : nombre (1..120) et durée totale (jusqu'à 600 s) se règlent dans la barre, la période en découle
  period: Math.max(0.005, Math.min(600, t?.period ?? DEFAULT_TIMING.period)),
  count: Math.max(1, Math.min(120, Math.round(t?.count ?? DEFAULT_TIMING.count))),
});
/** Durée totale (s). */
export const totalOf = (t: Timing) => t.period * t.count;

/** Coefficients proposés pour caler un cycle : fractions et multiples de la période. */
export const CYCLES = [1 / 8, 1 / 6, 1 / 4, 1 / 3, 1 / 2, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32];
export const cycleName = (c: number) => (c >= 1 ? `× ${Math.round(c)}` : `1/${Math.round(1 / c)}`);

let now = 0;
let timing = DEFAULT_TIMING;
/** Temps courant des animations (s), réglé avant chaque dessin. */
export const animTime = () => now;
export const setAnimTime = (t: number) => void (now = t);
/** Période de référence de la page affichée, réglée avant chaque dessin. */
export const setAnimTiming = (t?: Partial<Timing>) => void (timing = timingOf(t));

/** Le document a-t-il au moins une forme animée ? */
export const hasAnim = (layers: Layer[]) => layers.some((l) => l.visible !== false && ((l.anim && !l.cut) || !!l.motion?.length));

/** Coefficient du cycle, en périodes (les animations d'avant gardent à peu près leur vitesse). */
export function cycleOf(a: Anim, tm = timing): number {
  if (a.cycle) return a.cycle;
  const sp = Math.max(0.05, Math.abs(a.speed ?? 1));
  const sec = a.kind === 'countdown' ? countdownValues(a).length / sp : 1 / sp;
  return sec / tm.period;
}
/** Durée d'un cycle (s). */
export const cycleSeconds = (a: Anim, tm = timing) => cycleOf(a, tm) * tm.period;
/** Le cycle tombe-t-il juste dans la durée totale (sinon la boucle saute) ? */
export function cycleFits(a: Anim, tm = timing): boolean {
  const r = tm.count / cycleOf(a, tm);
  return Math.abs(r - Math.round(r)) < 1e-6;
}
/** Avancée dans le cycle à l'instant t (0..1). */
const phaseOf = (a: Anim, t: number) => frac(t / Math.max(0.01, cycleSeconds(a)));

// --- découpes ---

const cache = new Map<string, string>();
function cached(key: string, make: () => string): string {
  let d = cache.get(key);
  if (d === undefined) {
    if (cache.size > 600) cache.clear();
    cache.set(key, (d = make()));
  }
  return d;
}

/** Découpe de la forme animée à l'instant t (coordonnées 0..1 de sa boîte). */
export function animCut(a: Anim, t = now): string {
  if (a.kind === 'propeller') return propellerCut(a, t);
  if (a.kind === 'bird') return birdCut(a, t);
  return countdownCut(a, t);
}

/** Proportions de la boîte (largeur / hauteur) qui conviennent à l'animation. */
export function animRatio(a: Anim): number {
  if (a.kind === 'bird') return 1 / BIRD_H;
  if (a.kind === 'countdown') return textCut(refStyle(a)).ratio;
  return 1;
}

const frac = (x: number) => x - Math.floor(x);

// hélice : un moyeu, des pales en goutte déportée, un trou d'axe
function propellerCut(a: Anim, t: number): string {
  const n = Math.max(2, Math.min(8, Math.round(a.blades ?? 3)));
  const w = Math.max(0.2, Math.min(0.9, a.width ?? 0.55));
  // la rotation n'est plus dans la découpe : c'est une consigne (animOrder) ajoutée au mouvement de l'objet,
  // pour que teinte, dégradé, peinture et bord tournent avec les pales
  void t;
  return cached(`p|${n}|${w}`, () => {
    const turn = (2 * Math.PI) / n;
    const th = 0;
    const [R0, R1] = [0.13, 0.48];
    const outer: Pt[] = [];
    const N = 90 * n;
    for (let i = 0; i < N; i++) {
      const phi = (i / N) * 2 * Math.PI;
      const psi = frac((phi - th) / turn);
      let r = R0;
      if (psi < w) {
        // bord d'attaque arrondi, bord de fuite étiré : la pale semble balayer
        const u = psi / w;
        const p = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.65)), 0.7);
        r = R0 + (R1 - R0) * p;
      }
      outer.push({ x: 0.5 + r * Math.cos(phi), y: 0.5 + r * Math.sin(phi) });
    }
    const hole: Pt[] = [];
    for (let i = 0; i < 24; i++) {
      const phi = (i / 24) * 2 * Math.PI;
      hole.push({ x: 0.5 + 0.035 * Math.cos(phi), y: 0.5 + 0.035 * Math.sin(phi) });
    }
    return ringsToPath([outer, hole], 0.0006, 40);
  });
}

// oiseau vu de face : ailes en V qui battent (le bout suit le coude avec un retard), le corps monte et descend
const BIRD_FRAMES = 40;
const BIRD_H = 0.66;
function birdCut(a: Anim, t: number): string {
  const amp = Math.max(0.1, Math.min(1, a.amp ?? 0.8));
  const k = Math.floor(phaseOf(a, t) * BIRD_FRAMES);
  return cached(`b|${amp}|${k}`, () => {
    const ph = (k / BIRD_FRAMES) * 2 * Math.PI;
    const s = Math.sin(ph);
    const yb = 0.035 * amp * Math.sin(ph + Math.PI);
    const yEl = -0.12 * amp * s + yb;
    const yTip = -0.23 * amp * Math.sin(ph - 0.7) + 0.02;
    const xTip = 0.47 - 0.04 * amp * Math.abs(s);
    // contour : dessus de l'aile gauche, tête, dessus de l'aile droite, puis dessous en revenant, queue
    const half = (sx: number) => ({
      tip: { x: sx * xTip, y: yTip },
      elUp: { x: sx * 0.26, y: yEl - 0.03 },
      shUp: { x: sx * 0.08, y: yb - 0.05 },
      shLo: { x: sx * 0.07, y: yb + 0.06 },
      elLo: { x: sx * 0.25, y: yEl + 0.06 },
      tipLo: { x: sx * (xTip - 0.07), y: yTip + 0.04 },
    });
    const [L, R] = [half(-1), half(1)];
    const ctrl: Pt[] = [
      L.tip,
      L.elUp,
      L.shUp,
      { x: -0.045, y: yb - 0.1 },
      { x: 0, y: yb - 0.13 },
      { x: 0.045, y: yb - 0.1 },
      R.shUp,
      R.elUp,
      R.tip,
      R.tipLo,
      R.elLo,
      R.shLo,
      { x: 0.05, y: yb + 0.14 },
      { x: 0, y: yb + 0.11 },
      { x: -0.05, y: yb + 0.14 },
      L.shLo,
      L.elLo,
      L.tipLo,
    ];
    const ring = catmull(ctrl, 8).map((p) => ({ x: p.x + 0.5, y: (p.y + BIRD_H / 2) / BIRD_H }));
    return ringsToPath([ring], 0.0005, 30);
  });
}

/** Courbe fermée passant par les points (Catmull-Rom), `n` points par segment. */
function catmull(P: Pt[], n: number): Ring {
  const out: Pt[] = [];
  const m = P.length;
  for (let i = 0; i < m; i++) {
    const [p0, p1, p2, p3] = [P[(i - 1 + m) % m]!, P[i]!, P[(i + 1) % m]!, P[(i + 2) % m]!];
    for (let j = 0; j < n; j++) {
      const t = j / n;
      const [t2, t3] = [t * t, t * t * t];
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  return out;
}

// compte à rebours : chaque nouvelle valeur arrive en grossissant légèrement (10 images)
const POP_FRAMES = 10;
export function countdownValues(a: Anim): number[] {
  const from = Math.max(0, Math.min(9999, Math.round(a.from ?? 10)));
  const step = Math.max(1, Math.round(a.step ?? 1));
  const out: number[] = [];
  for (let v = from; v >= 0; v -= step) out.push(v);
  return out;
}
const styleOf = (a: Anim, content: string): TextStyle => ({ content, font: a.font ?? 'anton', weight: 400, italic: false, align: 'center' });
/** Boîte de référence : autant de 8 que la plus longue valeur, toutes les valeurs s'y centrent. */
const refStyle = (a: Anim) => styleOf(a, '8'.repeat(String(countdownValues(a)[0] ?? 0).length));

/** Valeur affichée à l'instant t, et l'avancée dans son temps (0..1) : les valeurs se partagent le cycle. */
export function countdownAt(a: Anim, t: number): { value: number; f: number } {
  const vals = countdownValues(a);
  const x = phaseOf(a, t) * vals.length;
  const i = Math.min(vals.length - 1, Math.floor(x));
  return { value: vals[i] ?? 0, f: frac(x) };
}

function countdownCut(a: Anim, t: number): string {
  const { value, f } = countdownAt(a, t);
  const k = Math.min(POP_FRAMES - 1, Math.floor(f * POP_FRAMES * 3));
  return cached(`c|${a.font}|${refStyle(a).content.length}|${value}|${k}|${textEpoch()}`, () => {
    const r = textCut(refStyle(a));
    const c = textCut(styleOf(a, String(value)));
    // l'arrivée : de 80 % à 100 % sur le premier tiers du temps de la valeur
    const e = k / (POP_FRAMES - 1);
    const s = 0.8 + 0.2 * (1 - Math.pow(1 - e, 3));
    const rings = pathToRings(c.d).map((ring) =>
      ring.map((p) => {
        const X = c.ox + p.x * c.bw + (r.fw - c.fw) / 2;
        const Y = c.oy + p.y * c.bh;
        const u = (X - r.ox) / r.bw;
        const v = (Y - r.oy) / r.bh;
        return { x: 0.5 + (u - 0.5) * s, y: 0.5 + (v - 0.5) * s };
      }),
    );
    return ringsToPath(rings, 1e-6, 55, false);
  });
}

// --- mouvement général : des consignes posées sur la frise ---

export type Accel = 'linear' | 'soft' | 'fast';
export type Brake = 'sharp' | 'damped' | 'bounce' | 'fast' | 'slow';
export const ACCELS: Array<[Accel, string]> = [['linear', 'Linéaire'], ['soft', 'Progressive'], ['fast', 'Rapide']];
export const BRAKES: Array<[Brake, string]> = [['sharp', 'Net'], ['damped', 'Amorti'], ['bounce', 'Rebond'], ['fast', 'Rapide'], ['slow', 'Lent']];

/**
 * Une consigne de mouvement : sur une plage de la frise (début et durée en périodes), l'objet se déplace,
 * tourne, grandit ou monte de la quantité donnée. Les consignes s'ajoutent entre elles et à celle du sticker ;
 * une consigne finie garde son effet jusqu'à la fin de la vidéo (sauf aller-retour).
 */
export interface Move {
  id: string;
  /** Début et durée, en périodes de référence. */
  at: number;
  len: number;
  /** Déplacement, en fraction de la largeur et de la hauteur du format. */
  dx?: number;
  dy?: number;
  /** Rotation, en tours (négatif = sens inverse). */
  rot?: number;
  /** Taille à l'arrivée (1 = inchangée). */
  scale?: number;
  /** Hauteur ajoutée au-dessus de la page (profondeur). */
  lift?: number;
  /** Modèle d'accélération au départ et de freinage à l'arrivée. */
  accel?: Accel;
  brake?: Brake;
  /** Aller-retour : l'objet revient à son état de départ sur la seconde moitié de la plage. */
  back?: boolean;
}

function bounceOut(v: number): number {
  const [n, d] = [7.5625, 2.75];
  if (v < 1 / d) return n * v * v;
  if (v < 2 / d) return n * (v -= 1.5 / d) * v + 0.75;
  if (v < 2.5 / d) return n * (v -= 2.25 / d) * v + 0.9375;
  return n * (v -= 2.625 / d) * v + 0.984375;
}
/** Avancée de la consigne (0..1) selon ses modèles : l'accélération façonne le départ, le freinage l'arrivée. */
export function ease(u: number, accel: Accel = 'linear', brake: Brake = 'sharp'): number {
  const x = Math.max(0, Math.min(1, u));
  const v = accel === 'soft' ? x * x : accel === 'fast' ? Math.pow(x, 0.55) : x;
  if (brake === 'damped') return 1 - (1 - v) * (1 - v);
  if (brake === 'slow') return 1 - Math.pow(1 - v, 3.2);
  if (brake === 'bounce') return bounceOut(v);
  if (brake === 'fast') {
    // pleine vitesse jusqu'aux trois quarts, puis un freinage court
    const c = 0.75;
    const k = 1 / (c + (1 - c) / 2);
    if (v < c) return k * v;
    const w = (v - c) / (1 - c);
    return k * c + (1 - k * c) * (2 * w - w * w);
  }
  return v;
}

/** Écart d'un objet par rapport à sa pose de repos, à un instant. */
export interface Pose {
  dx: number;
  dy: number;
  /** Radians. */
  rot: number;
  scale: number;
  lift: number;
}

/**
 * Consigne propre au sticker : son générateur peut demander un mouvement d'objet (l'hélice : un tour par cycle),
 * qui s'ajoute au plan général au lieu d'être dessiné dans la découpe.
 */
export function animOrder(a: Anim, t = now): Partial<Pose> | null {
  if (a.kind !== 'propeller') return null;
  const dir = a.dir ?? (a.speed !== undefined && a.speed < 0 ? -1 : 1);
  return { rot: dir * phaseOf(a, t) * 2 * Math.PI };
}
/**
 * Animations propres d'un sticker, telles que son générateur les déclare : elles remontent sur la frise,
 * chacune sur sa ligne, répétée à chaque cycle. `order` = l'animation passe par le plan général (mouvement d'objet).
 */
export interface Gesture {
  id: string;
  name: string;
  note?: string;
  order?: boolean;
}
export function gesturesOf(a: Anim): Gesture[] {
  if (a.kind === 'propeller') return [{ id: 'spin', name: 'Rotation', note: 'un tour par cycle', order: true }];
  if (a.kind === 'bird') return [{ id: 'flap', name: 'Battement d’ailes', note: 'un battement par cycle' }];
  return [{ id: 'count', name: 'Décompte', note: `${countdownValues(a).length} valeurs par cycle` }];
}

/** Pose d'un objet à l'instant t : la consigne de son sticker, plus toutes ses consignes de la frise. */
export function poseOf(l: Layer, t = now, tm = timing): Pose | null {
  const own = l.anim && !l.cut ? animOrder(l.anim, t) : null;
  if (!own && !l.motion?.length) return null;
  const p: Pose = { dx: own?.dx ?? 0, dy: own?.dy ?? 0, rot: own?.rot ?? 0, scale: own?.scale ?? 1, lift: own?.lift ?? 0 };
  const at = t / tm.period;
  for (const m of l.motion ?? []) {
    let u = (at - m.at) / Math.max(0.001, m.len);
    if (u <= 0) continue;
    u = Math.min(1, u);
    if (m.back) u = u < 0.5 ? 2 * u : 2 - 2 * u;
    const e = ease(u, m.accel, m.brake);
    p.dx += (m.dx ?? 0) * e;
    p.dy += (m.dy ?? 0) * e;
    p.rot += (m.rot ?? 0) * 2 * Math.PI * e;
    p.scale *= Math.pow(Math.max(0.02, m.scale ?? 1), e);
    p.lift += (m.lift ?? 0) * e;
  }
  return p;
}

/** Les couches dans leur pose à l'instant courant (le même tableau si rien ne bouge). */
export function posed(layers: Layer[], f: Format, t = now): Layer[] {
  if (!layers.some((l) => l.motion?.length || (l.anim && !l.cut))) return layers;
  const m = Math.min(f.width, f.height);
  return layers.map((l) => {
    const p = l.kind === 'surface' ? null : poseOf(l, t);
    if (!p) return l;
    const [w, h] = [l.w * p.scale, l.h * p.scale];
    return {
      ...l,
      // l'objet grandit depuis son centre, même accroché par un coin
      dx: l.dx + p.dx + ((l.grip?.x ?? 0) * (w - l.w) * m) / f.width,
      dy: l.dy + p.dy + ((l.grip?.y ?? 0) * (h - l.h) * m) / f.height,
      w,
      h,
      rot: (l.rot ?? 0) + p.rot || undefined,
      height: Math.max(0, Math.min(1, l.height + p.lift)),
    };
  });
}

/** Une nouvelle consigne posée à l'instant courant : une période, sans effet tant qu'on ne la règle pas. */
export function newMove(tm: Timing, t = now): Move {
  const at = Math.min(tm.count - 1, Math.floor(t / tm.period + 1e-6));
  return { id: Math.random().toString(36).slice(2, 9), at, len: Math.min(1, tm.count - at), accel: 'soft', brake: 'damped' };
}
/** Résumé d'une consigne, pour son bloc sur la frise. */
export function moveName(m: Move): string {
  const out: string[] = [];
  if (m.dx || m.dy) out.push('déplacement');
  if (m.rot) out.push(`${Math.round(m.rot * 100) / 100} tr`);
  if (m.scale !== undefined && m.scale !== 1) out.push(`× ${Math.round(m.scale * 100) / 100}`);
  if (m.lift) out.push('hauteur');
  return out.join(' · ') || 'à régler';
}
