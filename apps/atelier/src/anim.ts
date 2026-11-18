import type { Format } from '@ftd/core';
import { layerBox, type Layer } from './model';
import { animatorFor, boneCarry, boneFrames, generatorOf, nearestBones, newAnim, spanOf, type Act, type ActState, type Anim, type Bone, type Context, type Generator, type Gesture, type Progress, type Warp } from './stickers';

export { ANIMATORS, GENERATORS, animatorFor, generatorOf, newAnim, forPart, spanOf, valueOf, newRig, jointsText, rigJoints, RIG_BONES, RIG_JOINTS, RIG_NAMES } from './stickers';
export type { Act, Anim, Generator, Gesture, Param, Warp } from './stickers';

/**
 * Formes animées (stickers) : un générateur reçoit l'avancée de son cycle et rend la découpe de l'objet
 * à cet instant. Tout le reste (teinte, bord, lueur, volume, matière) s'applique comme sur une forme fixe.
 * Les générateurs sont décrits dans stickers/ ; ce fichier tient l'horloge, le calage des cycles et le mouvement général.
 */

/** Nom d'un sticker, pour les listes et la frise. */
export const animName = (a: Anim) => generatorOf(a)?.name ?? 'Sticker';

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

/**
 * Animation d'un objet, telle que la frise la montre : son sticker, ou pour un objet qu'un générateur sait animer
 * (un texte) ses gestes posés, vides tant qu'on n'en a posé aucun.
 */
const blanks = new Map<string, Anim>();
export function animOf(l: Layer): Anim | undefined {
  if (l.cut && !carved(l)) return undefined;
  if (l.anim) return l.anim;
  const g = animatorFor(l.kind === 'shape' && l.shape ? `shape:${l.shape}` : l.kind);
  if (!g) return undefined;
  let a = blanks.get(g.kind);
  if (!a) blanks.set(g.kind, (a = newAnim(g, { acts: [] })));
  return a;
}

/**
 * Forme animée sculptée (découpée, modelée) qui garde son animation : son générateur plie la forme (Generator.warp),
 * et sa découpe a été ramenée sur la forme au repos (`anim.carved`). Les formes figées d'avant n'ont pas la marque.
 */
export const carved = (l: Layer) => !!l.cut && !!l.anim && !l.text && !!l.anim.carved && !!generatorOf(l.anim)?.warp && !generatorOf(l.anim)?.on;
/** L'objet bouge-t-il de lui-même (sticker, forme sculptée qui garde son animation) ? */
const lives = (l: Layer) => !!l.anim && (!l.cut || carved(l));

/** Le document a-t-il au moins une forme animée ? */
export const hasAnim = (layers: Layer[]) => layers.some((l) => l.visible !== false && (lives(l) || !!l.motion?.length));

/** Coefficient du cycle, en périodes (les animations d'avant gardent à peu près leur vitesse). */
export function cycleOf(a: Anim, tm = timing): number {
  if (a.cycle) return a.cycle;
  const sp = Math.max(0.05, Math.abs(a.speed ?? 1));
  const sec = (generatorOf(a)?.legacyUnits?.(a) ?? 1) / sp;
  return sec / tm.period;
}
/** Durée d'un cycle (s). */
export const cycleSeconds = (a: Anim, tm = timing) => cycleOf(a, tm) * tm.period;
/** Le cycle tombe-t-il juste dans la durée totale (sinon la boucle saute) ? */
export function cycleFits(a: Anim, tm = timing): boolean {
  const r = tm.count / cycleOf(a, tm);
  return Math.abs(r - Math.round(r)) < 1e-6;
}

// --- gestes posés sur la frise ---

/** Gestes propres d'un sticker, tels que son générateur les déclare : la frise les propose. */
export function gesturesOf(a: Anim): Gesture[] {
  return generatorOf(a)?.gestures(a) ?? [];
}

const uid = () => Math.random().toString(36).slice(2, 9);
const legacyActs = new WeakMap<Anim, { key: string; acts: Act[] }>();
/**
 * Les gestes posés d'un sticker, dans la vidéo. Un sticker d'avant n'en porte pas : ses gestes se répétaient
 * à chaque cycle, sur leur plage ; ils sont repris tels quels, un geste posé par répétition (un seul pour une boucle continue).
 */
export function actsOf(a: Anim, tm = timing): Act[] {
  if (a.acts) return a.acts;
  const key = `${tm.period}|${tm.count}`;
  const hit = legacyActs.get(a);
  if (hit?.key === key) return hit.acts;
  const c = Math.max(0.01, cycleOf(a, tm));
  const reps = Math.min(240, Math.ceil(tm.count / c - 1e-6));
  const acts: Act[] = [];
  for (const g of gesturesOf(a)) {
    if (g.start === false) continue;
    const sp = spanOf(a, g);
    if (g.loop && sp.at === 0 && sp.len === 1) acts.push({ id: `${g.id}0`, g: g.id, at: 0, len: tm.count, cycle: c });
    else for (let i = 0; i < reps; i++) acts.push({ id: `${g.id}${i}`, g: g.id, at: (i + sp.at) * c, len: sp.len * c, ...(g.loop ? { cycle: sp.len * c } : {}) });
  }
  legacyActs.set(a, { key, acts });
  return acts;
}
/** Le sticker avec ses gestes inscrits dans ses données : dès qu'on en pose, déplace ou règle un. */
export const withActs = (a: Anim, tm = timing): Anim => (a.acts ? a : { ...a, acts: actsOf(a, tm).map((x) => ({ ...x })) });
/** Un geste posé à un instant (en périodes) : sa durée de départ vient du générateur. */
export function newAct(a: Anim, g: Gesture, at: number, tm = timing): Act {
  const gen = generatorOf(a);
  const c = gen?.cycle ?? 1;
  const loop = g.cycle ?? c;
  const A = Math.max(0, Math.min(tm.count - 0.05, at));
  const len = Math.max(0.05, Math.min(tm.count - A, g.loop ? Math.max(1, 2 * loop) : (g.len ?? 1) * c));
  return { id: uid(), g: g.id, at: A, len, ...(g.loop ? { cycle: loop } : {}) };
}
/** Le geste posé qui compte à un instant : le dernier commencé, sinon le premier à venir. */
function current(acts: Act[], g: string, T: number): Act | undefined {
  let last: Act | undefined;
  let next: Act | undefined;
  for (const x of acts) {
    if (x.g !== g) continue;
    if (x.at <= T) {
      if (!last || x.at > last.at) last = x;
    } else if (!next || x.at < next.at) next = x;
  }
  return last ?? next;
}
/** Le sticker à l'instant t : les réglages du geste en cours remplacent ceux du sticker, et l'avancée de chaque geste. */
function stateAt(g: Generator, a: Anim, t: number, tm = timing): { a: Anim; phase: number; progress: Progress; each: Context['each'] } {
  const acts = actsOf(a, tm);
  const gestures = g.gestures(a);
  const T = t / tm.period;
  let merged = a;
  for (const ge of gestures) {
    if (!ge.params?.length) continue;
    const act = current(acts, ge.id, T);
    if (!act) continue;
    for (const k of ge.params) if (act[k] !== undefined && act[k] !== a[k]) merged = { ...merged, [k]: act[k] };
  }
  const progress: Progress = (id) => {
    const ge = gestures.find((x) => x.id === id);
    if (ge?.loop) {
      // boucle : les tours s'ajoutent d'un geste posé au suivant, l'hélice garde son angle entre deux
      let n = 0;
      for (const x of acts) if (x.g === id) n += Math.max(0, Math.min(x.len, T - x.at)) / Math.max(0.01, x.cycle ?? g.cycle);
      return n;
    }
    const act = current(acts, id, T);
    return act && act.at <= T ? Math.max(0, Math.min(1, (T - act.at) / Math.max(0.001, act.len))) : 0;
  };
  // chaque geste posé avec ses propres réglages, dans l'ordre de la frise
  const each = (id: string): ActState[] => {
    const ge = gestures.find((x) => x.id === id);
    return acts
      .filter((x) => x.g === id)
      .sort((p, q) => p.at - q.at)
      .map((x) => {
        let own = a;
        for (const k of ge?.params ?? []) if (x[k] !== undefined) own = { ...own, [k]: x[k] };
        const c = Math.max(0.01, x.cycle ?? g.cycle);
        const done = Math.max(0, Math.min(x.len, T - x.at));
        return { act: x, u: Math.max(0, Math.min(1, (T - x.at) / Math.max(0.001, x.len))), turns: done / c, of: x.len / c, a: own };
      });
  };
  return { a: merged, phase: frac(t / Math.max(0.01, totalOf(tm))), progress, each };
}

// --- découpes ---

const frac = (x: number) => x - Math.floor(x);
const SQUARE = 'M0 0H1V1H0Z';

/** Découpe de la forme animée à l'instant t (coordonnées 0..1 de sa boîte). */
export function animCut(a: Anim, t = now, host?: Context['host']): string {
  const g = generatorOf(a);
  if (!g) return SQUARE;
  const s = stateAt(g, a, t);
  return g.cut(s.a, s.phase, s.progress, { each: s.each, host });
}
/** Déformation de la surface de la forme animée à l'instant t, si son générateur en a une (voir Generator.warp). */
export function animWarp(a: Anim, t = now, host?: Context['host']): Warp | null {
  const g = generatorOf(a);
  if (!g?.warp) return null;
  const s = stateAt(g, a, t);
  return g.warp(s.a, s.phase, s.progress, { each: s.each, host });
}
/** Découpe de la vignette d'un générateur, figée à l'avancée qu'il choisit. */
export function glyphCut(a: Anim): string {
  const g = generatorOf(a);
  return g ? g.cut(a, g.glyphPhase ?? 0, () => g.glyphPhase ?? 0, { each: () => [] }) : SQUARE;
}

/** Os du sticker à l'instant t (Generator.skeleton), en coordonnées 0..1 de sa boîte ; null sans squelette. */
export function animSkeleton(a: Anim, t = now): Bone[] | null {
  const g = generatorOf(a);
  if (!g?.skeleton) return null;
  const s = stateAt(g, a, t);
  return g.skeleton(s.a, s.phase, s.progress, { each: s.each });
}

/**
 * Ce que le sticker fait d'un point de sa boîte (0..1, pris au repos) à l'instant t : son déplacement, en parts de la boîte,
 * et sa rotation. Le point suit l'os dont il est le plus proche au repos ; sans squelette, la déformation de la surface.
 */
export function animFollow(a: Anim, u: number, v: number, t = now): { dx: number; dy: number; rot: number } | null {
  const g = generatorOf(a);
  if (!g) return null;
  const s = stateAt(g, a, t);
  // une surface qui se plie (oiseau) : le point suit la surface, prise à plat, plus fidèle que ses os
  if (g.skeleton && !g.surfaceFollow) {
    const rest = g.skeleton(s.a, 0, () => 0, { each: () => [] });
    const cur = g.skeleton(s.a, s.phase, s.progress, { each: s.each });
    // le squelette commun (stickers/kit.ts) : le point suit l'os dont la chair est la plus proche au repos, comme la peau
    const r = g.ratio(s.a) || 1;
    const frames = boneFrames(rest, cur, r, undefined, g.flesh?.(s.a));
    const [x, y] = [u * r, v];
    const { b1, k1 } = nearestBones(frames, x, y);
    const F = frames[b1];
    if (!F) return null;
    const [X, Y] = boneCarry(F, k1, x, y);
    return { dx: X / r - u, dy: Y - v, rot: F.rot };
  }
  const w = g.warp?.(s.a, s.phase, s.progress, { each: s.each });
  if (!w) return null;
  const [mx, my] = w.map(u, v);
  return { dx: mx - u, dy: my - v, rot: 0 };
}

/** Proportions de la boîte (largeur / hauteur) qui conviennent à l'animation. */
export function animRatio(a: Anim): number {
  return generatorOf(a)?.ratio(a) ?? 1;
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
  /** Déplacement en parts de la boîte de l'objet. */
  bx?: number;
  by?: number;
}

/** Consigne propre au sticker : le mouvement d'objet que son générateur ajoute au plan général. */
export function animOrder(a: Anim, t = now): Partial<Pose> | null {
  const g = generatorOf(a);
  if (!g?.order) return null;
  const s = stateAt(g, a, t);
  return g.order(s.a, s.phase, s.progress, { each: s.each });
}

/** Pose d'un objet à l'instant t : la consigne de son sticker, plus toutes ses consignes de la frise. */
export function poseOf(l: Layer, t = now, tm = timing, skip?: Set<string>): Pose | null {
  const own = lives(l) ? animOrder(l.anim!, t) : null;
  if (!own && !l.motion?.some((m) => !skip?.has(m.id))) return null;
  const p: Pose = { dx: own?.dx ?? 0, dy: own?.dy ?? 0, rot: own?.rot ?? 0, scale: own?.scale ?? 1, lift: own?.lift ?? 0, bx: own?.bx ?? 0, by: own?.by ?? 0 };
  const at = t / tm.period;
  for (const m of l.motion ?? []) {
    if (skip?.has(m.id)) continue;
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
  if (!layers.some((l) => l.motion?.length || lives(l))) return layers;
  const m = Math.min(f.width, f.height);
  // objets attachés à un sticker (même groupe solidaire) : ils suivent son animation, comme ses propres pièces
  const hosts = new Map<string, Layer>();
  for (const l of layers) {
    if (!l.link || hosts.has(l.link) || l.kind === 'surface' || l.visible === false || !lives(l)) continue;
    const g = generatorOf(l.anim!);
    if (g?.skeleton || g?.warp || g?.order || l.motion?.length) hosts.set(l.link, l);
  }
  return layers.map((l) => {
    const host = l.link ? hosts.get(l.link) : undefined;
    const tow = host && host !== l && l.kind !== 'surface' && !(host.anim!.set !== undefined && l.anim?.set === host.anim!.set) ? towed(l, host, f, t) : null;
    // l'animation est celle de l'ensemble : un mouvement que l'objet attaché partage avec le sticker ne compte qu'une fois
    const p = l.kind === 'surface' ? null : poseOf(l, t, timing, tow ? new Set(host!.motion?.map((m) => m.id)) : undefined);
    if (!p && !tow) return l;
    const scale = (p?.scale ?? 1) * (tow?.scale ?? 1);
    const [w, h] = [l.w * scale, l.h * scale];
    return {
      ...l,
      // l'objet grandit depuis son centre, même accroché par un coin ; un déplacement en parts de boîte suit sa taille
      dx: l.dx + (p?.dx ?? 0) + ((p?.bx ?? 0) * l.w * m) / f.width + (tow?.dx ?? 0) + ((l.grip?.x ?? 0) * (w - l.w) * m) / f.width,
      dy: l.dy + (p?.dy ?? 0) + ((p?.by ?? 0) * l.h * m) / f.height + (tow?.dy ?? 0) + ((l.grip?.y ?? 0) * (h - l.h) * m) / f.height,
      w,
      h,
      rot: (l.rot ?? 0) + (p?.rot ?? 0) + (tow?.rot ?? 0) || undefined,
      height: Math.max(0, Math.min(1, l.height + (p?.lift ?? 0) + (tow?.lift ?? 0))),
    };
  });
}

/**
 * Ce qu'un objet attaché reçoit du sticker de son groupe à l'instant t : il suit l'os (ou la surface) sous son centre,
 * puis les mouvements du sticker (son saut, sa rotation, ceux posés sur la frise), autour du centre du sticker. dx, dy en parts de la page.
 */
function towed(l: Layer, host: Layer, f: Format, t: number): { dx: number; dy: number; rot: number; scale: number; lift: number } | null {
  const [L, H] = [layerBox(l, f), layerBox(host, f)];
  if (!H.w || !H.h) return null;
  const turn = (x: number, y: number, a: number): [number, number] => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  const r0 = host.rot ?? 0;
  // le centre de l'objet, dans la boîte du sticker au repos
  let [x, y] = turn(L.cx - H.cx, L.cy - H.cy, -r0);
  const fl = animFollow(host.anim!, x / H.w + 0.5, y / H.h + 0.5, t);
  const o = poseOf(host, t);
  if (!fl && !o) return null;
  x += (fl?.dx ?? 0) * H.w;
  y += (fl?.dy ?? 0) * H.h;
  const k = o?.scale ?? 1;
  [x, y] = turn(x * k, y * k, r0 + (o?.rot ?? 0));
  x += (o?.dx ?? 0) * f.width + (o?.bx ?? 0) * H.w;
  y += (o?.dy ?? 0) * f.height + (o?.by ?? 0) * H.h;
  return { dx: (H.cx + x - L.cx) / f.width, dy: (H.cy + y - L.cy) / f.height, rot: (fl?.rot ?? 0) + (o?.rot ?? 0), scale: k, lift: o?.lift ?? 0 };
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
