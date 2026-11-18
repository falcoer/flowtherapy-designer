import { humanoid } from './humanoid';
import { numOf, skinWarp, type Anim, type Bone, type Context, type Generator, type Progress } from './kit';

/**
 * Squelette posé dans un objet existant (une photo détourée, une forme) : on l'habille. Les os de l'humanoïde sont calés
 * à la main sur l'objet (épaules, coudes, hanches…) ; chaque geste de l'humanoïde (salut, marche, saut, danse) tourne
 * ses os, et l'objet suit : son contour et sa surface (l'image, la teinte, la peinture) sont pliés par la peau (skinWarp),
 * chaque point avec l'os dont la chair (le gras) est la plus proche.
 *
 * Les articulations se gardent dans l'animation de l'objet (`j`), au repos, en coordonnées 0..1 de sa boîte d'origine.
 * Le geste n'est pas recopié tel quel : seule la rotation de chaque os (et l'allongement) passe de l'humanoïde à l'objet,
 * chaque os partant du bout de son parent. Un lama aux bras courts lève ses bras courts.
 */

/** Les articulations, dans l'ordre où elles se gardent. */
export const RIG_JOINTS = ['head', 'neck', 'pelvis', 'shL', 'elL', 'handL', 'shR', 'elR', 'handR', 'hipL', 'kneeL', 'footL', 'hipR', 'kneeR', 'footR'] as const;
export type RigJoint = (typeof RIG_JOINTS)[number];
/** Noms montrés sur les poignées. */
export const RIG_NAMES: Record<RigJoint, string> = {
  head: 'Tête',
  neck: 'Cou',
  pelvis: 'Bassin',
  shL: 'Épaule',
  elL: 'Coude',
  handL: 'Main',
  shR: 'Épaule',
  elR: 'Coude',
  handR: 'Main',
  hipL: 'Hanche',
  kneeL: 'Genou',
  footL: 'Pied',
  hipR: 'Hanche',
  kneeR: 'Genou',
  footR: 'Pied',
};
/** Les os, dans l'ordre du squelette de l'humanoïde : chacun de son attache (articulation parente) à son bout. */
export const RIG_BONES: Array<[RigJoint, RigJoint]> = [
  ['neck', 'head'],
  ['pelvis', 'neck'],
  ['neck', 'shL'],
  ['neck', 'shR'],
  ['pelvis', 'hipL'],
  ['pelvis', 'hipR'],
  ['shL', 'elL'],
  ['elL', 'handL'],
  ['shR', 'elR'],
  ['elR', 'handR'],
  ['hipL', 'kneeL'],
  ['kneeL', 'footL'],
  ['hipR', 'kneeR'],
  ['kneeR', 'footR'],
];
/** Ordre de pose : les parents d'abord (bassin → colonne → tête, épaules, bras ; bassin → hanches → jambes). */
const CHAIN = [1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const IX = Object.fromEntries(RIG_JOINTS.map((k, i) => [k, i])) as Record<RigJoint, number>;

type Pt = [number, number];
const HUM_RATIO = humanoid.ratio({ kind: 'humanoid' });
const HUM_BASE: Anim = (() => {
  const a: Anim = { kind: 'humanoid', cycle: humanoid.cycle };
  for (const p of humanoid.params) a[p.key] = p.def;
  return a;
})();
/** Réglages de gestes que l'objet habillé reprend de l'humanoïde (amplitude, énergie…). */
const GESTURE_KEYS = [...new Set(humanoid.gestures(HUM_BASE).flatMap((g) => g.params ?? []))];
/** L'humanoïde de référence, avec les réglages de gestes de l'objet. */
const humOf = (a: Anim): Anim => {
  const h: Anim = { ...HUM_BASE };
  for (const k of GESTURE_KEYS) if (a[k] !== undefined) h[k] = a[k];
  return h;
};
/** Les articulations de l'humanoïde lues sur ses os (coordonnées de sa boîte). */
function humJoints(bones: Bone[]): Pt[] {
  const J: Pt[] = RIG_JOINTS.map(() => [0.5, 0.5]);
  RIG_BONES.forEach(([p, c], i) => {
    const b = bones[i];
    if (!b) return;
    J[IX[p]] = b[0];
    J[IX[c]] = b[1];
  });
  return J;
}
const REST_HUM = humJoints(humanoid.skeleton!(HUM_BASE, 0, () => 0, { each: () => [] }));

/** Proportions de la boîte de l'objet (largeur / hauteur), gardées à la pose du squelette. */
const ratioOf = (a: Anim) => Math.max(0.05, numOf(a, 'ratio', 1));

/**
 * Articulations de départ, pour une boîte de proportions `ratio` : celles de l'humanoïde au repos, à la même échelle
 * de hauteur, centrées. Sur une photo de personnage, il reste à les caler à la main.
 */
export function defaultJoints(ratio: number): Pt[] {
  return REST_HUM.map(([u, v]) => [0.5 + ((u - 0.5) * HUM_RATIO) / ratio, v]);
}
/** Articulations au repos d'un objet habillé (celles calées à la main, sinon celles de départ). */
export function rigJoints(a: Anim): Pt[] {
  const def = defaultJoints(ratioOf(a));
  const s = typeof a.j === 'string' ? a.j.split(';') : [];
  return def.map((d, i) => {
    const [x, y] = (s[i] ?? '').split(',').map(Number);
    return Number.isFinite(x) && Number.isFinite(y) ? [x!, y!] : d;
  });
}
/** Les articulations écrites dans l'animation (au dix-millième). */
export const jointsText = (J: Pt[]) => J.map(([x, y]) => `${Math.round(x * 1e4) / 1e4},${Math.round(y * 1e4) / 1e4}`).join(';');

const bonesOf = (J: Pt[]): Bone[] => RIG_BONES.map(([p, c]) => [J[IX[p]]!, J[IX[c]]!]);

/** Angle ramené entre −π et π. */
const wrap = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));
const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** Rotation (radians) à partir de laquelle un os suit la direction de l'humanoïde plutôt que sa rotation. */
const BIG_TURN = 1.2;

/**
 * Le squelette de l'objet à un instant : chaque os prend la rotation (et l'allongement) de l'os de l'humanoïde,
 * en partant du bout de son parent ; le bassin se déplace comme celui de l'humanoïde, à l'échelle de l'objet.
 * Les angles se mesurent à unités égales (la boîte n'est pas carrée).
 */
function skeleton(a: Anim, phase: number, g: Progress, ctx: Context): Bone[] {
  const r = ratioOf(a);
  const rest = rigJoints(a);
  const h = humOf(a);
  const hCur = humJoints(humanoid.skeleton!(h, phase, g, ctx));
  const hRest = REST_HUM;
  const eq = (p: Pt, k: number): Pt => [p[0] * k, p[1]];
  // échelle : la colonne de l'objet contre celle de l'humanoïde
  const len = (p: Pt, q: Pt, k: number) => Math.hypot((q[0] - p[0]) * k, q[1] - p[1]);
  const s = len(rest[IX.pelvis]!, rest[IX.neck]!, r) / Math.max(1e-6, len(hRest[IX.pelvis]!, hRest[IX.neck]!, HUM_RATIO));
  const out: Pt[] = rest.map((p) => eq(p, r));
  const [pr, pc] = [eq(hRest[IX.pelvis]!, HUM_RATIO), eq(hCur[IX.pelvis]!, HUM_RATIO)];
  out[IX.pelvis] = [out[IX.pelvis]![0] + (pc[0] - pr[0]) * s, out[IX.pelvis]![1] + (pc[1] - pr[1]) * s];
  for (const i of CHAIN) {
    const [p, c] = RIG_BONES[i]!;
    const [hr0, hr1, hc0, hc1] = [eq(hRest[IX[p]]!, HUM_RATIO), eq(hRest[IX[c]]!, HUM_RATIO), eq(hCur[IX[p]]!, HUM_RATIO), eq(hCur[IX[c]]!, HUM_RATIO)];
    const v0: Pt = [hr1[0] - hr0[0], hr1[1] - hr0[1]];
    const v1: Pt = [hc1[0] - hc0[0], hc1[1] - hc0[1]];
    const [a0, a1] = [eq(rest[IX[p]]!, r), eq(rest[IX[c]]!, r)];
    // petit mouvement : l'os tourne d'autant que celui de l'humanoïde (un bras plié reste plié) ;
    // grand mouvement (lever le bras) : l'os prend la direction de celui de l'humanoïde, d'où qu'il parte
    const turn = wrap(Math.atan2(v1[1], v1[0]) - Math.atan2(v0[1], v0[0]));
    const toward = wrap(Math.atan2(v1[1], v1[0]) - Math.atan2(a1[1] - a0[1], a1[0] - a0[0]));
    const t = smooth(Math.abs(turn) / BIG_TURN);
    const rot = turn + (toward - turn) * t;
    const k = Math.hypot(...v1) / Math.max(1e-9, Math.hypot(...v0));
    const [dx, dy] = [(a1[0] - a0[0]) * k, (a1[1] - a0[1]) * k];
    const [cs, sn] = [Math.cos(rot), Math.sin(rot)];
    const P = out[IX[p]]!;
    out[IX[c]] = [P[0] + dx * cs - dy * sn, P[1] + dx * sn + dy * cs];
  }
  return bonesOf(out.map(([x, y]) => [x / r, y]));
}

/**
 * Chair de chaque os (Generator.flesh) : celle de l'humanoïde, à l'échelle de l'objet, multipliée par le réglage « Gras ».
 * Plus de gras : un os emmène une part plus large de l'image autour de lui.
 */
function flesh(a: Anim): number[] {
  const r = ratioOf(a);
  const J = rigJoints(a);
  const s = Math.hypot((J[IX.neck]![0] - J[IX.pelvis]![0]) * r, J[IX.neck]![1] - J[IX.pelvis]![1]) / Math.max(1e-6, Math.hypot((REST_HUM[IX.neck]![0] - REST_HUM[IX.pelvis]![0]) * HUM_RATIO, REST_HUM[IX.neck]![1] - REST_HUM[IX.pelvis]![1]));
  const fat = Math.max(0.1, numOf(a, 'fat', 2));
  return (humanoid.flesh?.(HUM_BASE) ?? []).map((x) => x * s * fat);
}

function warp(a: Anim, phase: number, g: Progress, ctx: Context) {
  const rest = bonesOf(rigJoints(a));
  const cur = skeleton(a, phase, g, ctx);
  return skinWarp(`rig|${typeof a.j === 'string' ? a.j : ''}|${ratioOf(a)}|${numOf(a, 'fat', 2)}`, rest, cur, ratioOf(a), undefined, 0.035, flesh(a));
}

export const rig: Generator = {
  kind: 'rig',
  name: 'Squelette',
  cycle: humanoid.cycle,
  cycleName: humanoid.cycleName,
  cycleWhat: humanoid.cycleWhat,
  params: [
    { key: 'fat', name: 'Gras', title: 'Épaisseur de chair autour des os : plus il y en a, plus chaque os emmène une large part de l’image', type: 'range', min: 0.3, max: 4, def: 2 },
    ...humanoid.params.filter((p) => GESTURE_KEYS.includes(p.key)),
  ],
  gestures: (a) => humanoid.gestures(humOf(a)),
  // l'objet garde sa découpe (posée avec le squelette) : celle-ci ne sert qu'à une vignette
  cut: () => 'M0 0H1V1H0Z',
  skeleton,
  flesh,
  warp,
  ratio: ratioOf,
  order: (a, phase, g, ctx) => humanoid.order!(humOf(a), phase, g, ctx),
  glyphText: 'Os',
};
