import polygonClipping, { type Polygon } from 'polygon-clipping';
import { ringsToPath } from '../cut';
import type { Pt } from '../model';
import { cached, frac, numOf, type Anim, type Generator, type Param, type Preset, type Context, type Progress } from './kit';

/**
 * Humanoïde vu de face : un squelette (tête, épaules, coudes, mains, hanches, genoux, pieds) habillé de chair,
 * prédécoupé en pièces solidaires (tête, torse, deux bras, deux jambes), chacune avec sa surface.
 * La morphologie se règle (modèles tout prêts, types de pièces, proportions) ; les gestes plient le squelette.
 *
 * Repère de la silhouette : hauteur 1 de la tête aux pieds, x = 0 sur l'axe du corps. La boîte laisse de la place
 * au-dessus et sur les côtés pour les bras levés ou écartés.
 */
const BOX_W = 1.1;
const TOP = 0.2;
const BOX_H = 1 + TOP + 0.02;

/** Les pièces, de dessous à dessus : les bras passent devant le torse, la tête devant tout. */
const PARTS = [
  { id: 'legL', name: 'Jambe gauche', tint: 2 },
  { id: 'legR', name: 'Jambe droite', tint: 2 },
  { id: 'torso', name: 'Torse', tint: 0 },
  { id: 'armL', name: 'Bras gauche', tint: 1 },
  { id: 'armR', name: 'Bras droit', tint: 1 },
  { id: 'head', name: 'Tête', tint: 1 },
];

const DEF = { heads: 7.5, build: 0.4, shoulders: 0.5, legs: 0.5, arms: 0.5, sex: 'm', headT: 'round', torsoT: 'trapeze', limbT: 'taper' } as const;
const unit = (a: Anim, key: string, def: number) => Math.max(0, Math.min(1, numOf(a, key, def)));
const pick = <T extends string>(a: Anim, key: string, def: T, all: readonly T[]): T => (all.includes(a[key] as T) ? (a[key] as T) : def);
const rad = (deg: number) => (deg * Math.PI) / 180;
const smooth = (x: number) => {
  const u = Math.max(0, Math.min(1, x));
  return u * u * (3 - 2 * u);
};

// images par boucle ou par geste : les découpes sont gardées en cache
const WALK_FRAMES = 24;
const DANCE_FRAMES = 32;
const WAVE_FRAMES = 60;
const JUMP_FRAMES = 40;

/** Avancée du saut : accroupi avant l'envol (0..0,3), en l'air (0,3..0,8), réception (0,8..1). */
function jumpOf(u: number): { crouch: number; air: number } {
  if (u <= 0 || u >= 1) return { crouch: 0, air: 0 };
  if (u < 0.3) return { crouch: Math.sin((Math.PI * u) / 0.3) ** 0.8 * (u < 0.2 ? 1 : (0.3 - u) / 0.1), air: 0 };
  if (u < 0.8) return { crouch: 0, air: Math.sin((Math.PI * (u - 0.3)) / 0.5) };
  return { crouch: Math.sin((Math.PI * (u - 0.8)) / 0.2) * 0.8, air: 0 };
}

/** Un membre : angles depuis la verticale vers le bas, positifs vers l'extérieur du corps (en degrés), et raccourcis de perspective. */
interface Limb {
  up: number;
  low: number;
  upK: number;
  lowK: number;
}
interface Pose {
  armL: Limb;
  armR: Limb;
  legL: Limb;
  legR: Limb;
  /** Balancement du bassin et inclinaison du haut du corps (unités de la silhouette). */
  sway: number;
  lean: number;
}

/** La pose à un instant : chaque geste ajoute sa part à la pose de repos. */
function poseOf(a: Anim, f: Frames): Pose {
  const limb = (up: number, low: number): Limb => ({ up, low, upK: 1, lowK: 1 });
  const p: Pose = { armL: limb(10, 6), armR: limb(10, 6), legL: limb(3, 1), legR: limb(3, 1), sway: 0, lean: 0 };
  // marche sur place : un genou monte (cuisse vue en raccourci), le bras opposé avance, le corps passe sur la jambe d'appui
  if (f.walkOn) {
    const amp = unit(a, 'stride', 0.6) * f.walkOn;
    const s = Math.sin(2 * Math.PI * f.walk);
    const [liftL, liftR] = [Math.max(0, s), Math.max(0, -s)];
    p.legL.upK *= 1 - 0.75 * amp * liftL;
    p.legL.lowK *= 1 - 0.3 * amp * liftL;
    p.legR.upK *= 1 - 0.75 * amp * liftR;
    p.legR.lowK *= 1 - 0.3 * amp * liftR;
    p.legL.up += 9 * amp * liftL;
    p.legR.up += 9 * amp * liftR;
    p.legL.low -= 7 * amp * liftL;
    p.legR.low -= 7 * amp * liftR;
    p.armL.up += 14 * amp * -s;
    p.armR.up += 14 * amp * s;
    p.armL.low += 34 * amp * liftR;
    p.armR.low += 34 * amp * liftL;
    p.armL.lowK *= 1 - 0.35 * amp * liftR;
    p.armR.lowK *= 1 - 0.35 * amp * liftL;
    p.sway += 0.03 * amp * s;
  }
  // danse : les bras levés basculent d'un côté à l'autre, le bassin suit, les genoux plient en mesure
  if (f.danceOn) {
    const amp = unit(a, 'swing', 0.6) * f.danceOn;
    const s = Math.sin(2 * Math.PI * f.dance);
    const beat = 0.5 - 0.5 * Math.cos(4 * Math.PI * f.dance);
    const lift = (0.6 + 0.4 * unit(a, 'swing', 0.6)) * f.danceOn;
    p.armL.up += lift * (95 - 40 * s);
    p.armR.up += lift * (95 + 40 * s);
    p.armL.low += lift * (150 - 30 * s);
    p.armR.low += lift * (150 + 30 * s);
    p.legL.up += 14 * amp * beat;
    p.legR.up += 14 * amp * beat;
    p.legL.low -= 16 * amp * beat;
    p.legR.low -= 16 * amp * beat;
    p.sway += 0.035 * amp * s;
    p.lean += 0.03 * amp * s;
  }
  // salut : le bras droit se lève, l'avant-bras s'agite, puis redescend
  if (f.wave > 0 && f.wave < 1) {
    const e = smooth(f.wave / 0.2) * smooth((1 - f.wave) / 0.2);
    const n = Math.max(1, Math.round(numOf(a, 'waves', 3)));
    p.armR.up += e * 120;
    p.armR.low += e * (160 + 26 * Math.sin(2 * Math.PI * n * f.wave));
    p.lean += 0.01 * e;
  }
  // saut : genoux pliés vers l'extérieur avant l'envol et à la réception, bras jetés en l'air pendant le vol
  if (f.jump > 0 && f.jump < 1) {
    const { crouch, air } = jumpOf(f.jump);
    for (const leg of [p.legL, p.legR]) {
      leg.up += 30 * crouch;
      leg.low -= 32 * crouch;
    }
    for (const arm of [p.armL, p.armR]) {
      arm.up += 135 * air - 6 * crouch;
      arm.low += 150 * air + 25 * crouch;
    }
  }
  return p;
}

interface Body {
  rH: number;
  headT: 'round' | 'oval' | 'square';
  torsoT: 'trapeze' | 'straight' | 'round';
  limbT: 'taper' | 'straight' | 'bulk';
  build: number;
  /** Morphologie féminine : épaules plus étroites, taille haute et marquée, bassin plus large, membres plus fins. */
  fem: boolean;
  /** Corps trapu des petits canons (0 chez l'adulte, 1 pour un personnage de BD). */
  chunk: number;
  /** Demi-largeurs des épaules et du bassin, hauteur des épaules, longueur des jambes et des bras. */
  sw: number;
  hw: number;
  sY: number;
  leg: number;
  arm: number;
  /** Rayons de chair du bras et de la jambe, à leur attache. */
  ra: number;
  rl: number;
}
function bodyOf(a: Anim): Body {
  const build = unit(a, 'build', DEF.build);
  const fem = pick(a, 'sex', DEF.sex, ['m', 'f'] as const) === 'f';
  // canon : la hauteur du corps comptée en têtes (7,5 pour le gabarit commun, 8 idéal, 9 héroïque, 5 enfant, 3,5 BD)
  const n = Math.max(3, Math.min(9, numOf(a, 'heads', DEF.heads)));
  const rH = 0.5 / n;
  const sY = 2 * rH + 0.034 * Math.max(0, Math.min(1, (n - 2) / 5.5));
  // les jambes prennent la moitié de la hauteur chez l'adulte, bien moins quand la tête est grosse
  const canon = n < 5 ? 0.33 + ((n - 3.5) * 0.07) / 1.5 : n < 7.5 ? 0.4 + ((n - 5) * 0.07) / 2.5 : 0.47 + ((n - 7.5) * 0.03) / 1.5;
  const leg = Math.min((1 - sY) * 0.68, canon + 0.14 * (unit(a, 'legs', DEF.legs) - 0.5) + (fem ? 0.012 : 0));
  // petit canon : corps plus trapu (membres épais, mains et pieds plus gros, épaules moins larges)
  const chunk = Math.max(0, Math.min(1, (7.5 - n) / 4));
  return {
    fem,
    chunk,
    rH,
    headT: pick(a, 'headT', DEF.headT, ['round', 'oval', 'square'] as const),
    torsoT: pick(a, 'torsoT', DEF.torsoT, ['trapeze', 'straight', 'round'] as const),
    limbT: pick(a, 'limbT', DEF.limbT, ['taper', 'straight', 'bulk'] as const),
    build,
    sw: ((0.095 + 0.055 * unit(a, 'shoulders', DEF.shoulders)) * (1 - 0.2 * chunk) + 0.01 * Math.max(0, n - 8)) * (fem ? 0.84 : 1),
    hw: (0.038 + 0.03 * build) * (fem ? 1.22 : 1),
    sY,
    leg,
    // au repos, le poignet arrive à hauteur de l'entrejambe
    arm: ((0.97 - leg - sY) * 0.95 + 0.015) * (1 - 0.2 * chunk) + 0.12 * (unit(a, 'arms', DEF.arms) - 0.5),
    ra: (0.019 + 0.018 * build) * (fem ? 0.84 : 1) * (1 + 0.3 * chunk),
    rl: (0.03 + 0.03 * build) * (1 + 0.25 * chunk),
  };
}

/** Les articulations à un instant, dans le repère de la silhouette (y vers le bas, sol à y = 1). */
interface Joints {
  head: Pt;
  shoulderL: Pt;
  shoulderR: Pt;
  elbowL: Pt;
  elbowR: Pt;
  handL: Pt;
  handR: Pt;
  hipL: Pt;
  hipR: Pt;
  kneeL: Pt;
  kneeR: Pt;
  footL: Pt;
  footR: Pt;
}
function jointsOf(b: Body, p: Pose): Joints {
  const dir = (side: number, deg: number, len: number): Pt => ({ x: side * Math.sin(rad(deg)) * len, y: Math.cos(rad(deg)) * len });
  const chain = (from: Pt, side: number, l: Limb, len: number): [Pt, Pt] => {
    const d1 = dir(side, l.up, (len / 2) * l.upK);
    const mid = { x: from.x + d1.x, y: from.y + d1.y };
    const d2 = dir(side, l.low, (len / 2) * l.lowK);
    return [mid, { x: mid.x + d2.x, y: mid.y + d2.y }];
  };
  // le corps repose sur la jambe la plus longue à cet instant : c'est elle qui fixe la hauteur du bassin
  const reach = (l: Limb) => (b.leg / 2) * (l.upK * Math.cos(rad(l.up)) + l.lowK * Math.cos(rad(l.low)));
  const hipY = 1 - b.rl * 0.62 - Math.max(reach(p.legL), reach(p.legR));
  const drop = hipY - (1 - b.rl * 0.62 - b.leg * 0.5 * (Math.cos(rad(3)) + Math.cos(rad(1))));
  const hipL = { x: p.sway - b.hw, y: hipY };
  const hipR = { x: p.sway + b.hw, y: hipY };
  const top = p.sway * 0.5 + p.lean;
  const shoulderL = { x: top - b.sw, y: b.sY + drop + b.ra };
  const shoulderR = { x: top + b.sw, y: b.sY + drop + b.ra };
  const [elbowL, handL] = chain(shoulderL, -1, p.armL, b.arm);
  const [elbowR, handR] = chain(shoulderR, 1, p.armR, b.arm);
  const [kneeL, footL] = chain(hipL, -1, p.legL, b.leg);
  const [kneeR, footR] = chain(hipR, 1, p.legR, b.leg);
  return { head: { x: top + p.lean * 0.6, y: b.rH + drop }, shoulderL, shoulderR, elbowL, elbowR, handL, handR, hipL, hipR, kneeL, kneeR, footL, footR };
}

// --- chair : des disques autour des articulations, réunis ---

type Disc = [Pt, number];
function circle(c: Pt, r: number, n = 20): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) out.push({ x: c.x + r * Math.cos((2 * Math.PI * i) / n), y: c.y + r * Math.sin((2 * Math.PI * i) / n) });
  return out;
}
/** Enveloppe convexe (chaîne monotone). */
function hull(pts: Pt[]): Pt[] {
  const P = [...pts].sort((p, q) => p.x - q.x || p.y - q.y);
  const cross = (o: Pt, p: Pt, q: Pt) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const half = (list: Pt[]) => {
    const h: Pt[] = [];
    for (const p of list) {
      while (h.length >= 2 && cross(h[h.length - 2]!, h[h.length - 1]!, p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return [...half(P), ...half(P.reverse())];
}
/** Un segment de chair : l'enveloppe de deux disques. */
const capsule = (a: Disc, b: Disc): Pt[] => hull([...circle(a[0], a[1]), ...circle(b[0], b[1])]);
const poly = (ring: Pt[]): Polygon => [ring.map((p) => [p.x, p.y] as [number, number])];
/** Réunit des formes en contours simples (les trous compris). */
function unite(shapes: Pt[][]): Pt[][] {
  const first = shapes[0];
  if (!first) return [];
  const u = polygonClipping.union(poly(first), ...shapes.slice(1).map(poly));
  return u.flatMap((pg) => pg.map((ring) => ring.slice(0, -1).map(([x, y]) => ({ x, y }))));
}

function headShape(b: Body, c: Pt): Pt[] {
  const n = 40;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const th = (2 * Math.PI * i) / n;
    const [cx, sy] = [Math.cos(th), Math.sin(th)];
    if (b.headT === 'square') {
      // carré aux coins arrondis (superellipse)
      const k = Math.pow(Math.abs(cx) ** 4 + Math.abs(sy) ** 4, -1 / 4);
      out.push({ x: c.x + b.rH * 0.95 * k * cx, y: c.y + b.rH * k * sy });
    } else out.push({ x: c.x + b.rH * (b.headT === 'oval' ? 0.74 : 0.9) * cx, y: c.y + b.rH * sy });
  }
  return out;
}
const lerp = (p: Pt, q: Pt, t: number): Pt => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
/** Un tube de chair passant par une suite de disques. */
const tube = (discs: Disc[]): Pt[][] => discs.slice(1).map((d, i) => capsule(discs[i]!, d));
/** Galbe d'un membre, en parts du rayon : attache, milieu du haut, articulation, renflement du bas, bout (poignet ou cheville). */
function galbe(b: Body, leg: boolean): [number, number, number, number, number] {
  if (b.limbT === 'straight') return [0.82, 0.82, 0.82, 0.82, 0.82];
  if (b.limbT === 'bulk') return leg ? [1.15, 1.12, 0.7, 0.92, 0.46] : [1.3, 1.28, 0.8, 1.02, 0.58];
  return leg ? [1, 0.9, 0.6, 0.72, 0.4] : [1.05, 0.95, 0.7, 0.8, 0.5];
}

function shapesOf(b: Body, j: Joints): Record<string, Pt[][]> {
  const tubes = b.limbT === 'straight';
  // bras : deltoïde, biceps, coude, avant-bras, poignet, puis la main dans le prolongement de l'avant-bras
  const arm = (s: Pt, e: Pt, w: Pt) => {
    const g = galbe(b, false);
    const len = Math.hypot(w.x - e.x, w.y - e.y) || 1;
    const along = (d: number): Pt => ({ x: w.x + ((w.x - e.x) / len) * d, y: w.y + ((w.y - e.y) / len) * d });
    const hand = tubes ? [circle(along(b.ra * 0.5), b.ra * 1.15)] : [capsule([along(b.ra * 0.4), b.ra * 0.78], [along(0.034 * (1 + 0.4 * b.chunk) + b.ra * 0.35), b.ra * 0.6])];
    return unite([...tube([[s, b.ra * g[0]], [lerp(s, e, 0.45), b.ra * g[1]], [e, b.ra * g[2]], [lerp(e, w, 0.28), b.ra * g[3]], [w, b.ra * g[4]]]), ...hand]);
  };
  // jambe : cuisse, genou, mollet, cheville, puis le pied posé au sol, tourné vers l'extérieur
  const leg = (h: Pt, k: Pt, f: Pt, side: number) => {
    const g = galbe(b, true);
    const sole = f.y + b.rl * 0.3;
    const foot = capsule([{ x: f.x, y: sole }, b.rl * (tubes ? 0.5 : 0.36)], [{ x: f.x + side * (0.03 * (1 + 0.4 * b.chunk) + b.rl * 0.35), y: sole + b.rl * 0.04 }, b.rl * (tubes ? 0.46 : 0.3)]);
    return unite([...tube([[h, b.rl * g[0]], [lerp(h, k, 0.5), b.rl * g[1]], [k, b.rl * g[2]], [lerp(k, f, 0.3), b.rl * g[3]], [f, b.rl * g[4]]]), foot]);
  };
  // torse : épaules tombantes depuis le cou, cage thoracique qui se resserre à la taille, bassin
  const sMid = lerp(j.shoulderL, j.shoulderR, 0.5);
  const hMid = lerp(j.hipL, j.hipR, 0.5);
  const cr = b.ra * 0.9 + (b.fem ? 0.014 : 0.012);
  const chestK = b.torsoT === 'straight' ? 0.72 : b.torsoT === 'round' ? 0.78 : 0.86;
  const chest = (p: Pt): Disc => [{ x: sMid.x + (p.x - sMid.x) * chestK, y: p.y + cr - b.ra * 0.9 }, cr];
  const wMid = lerp(sMid, hMid, b.fem ? 0.5 : 0.62);
  const ww = b.torsoT === 'trapeze' ? b.hw * (b.fem ? 0.52 : 0.9) + 0.012 * b.build : b.hw + b.rl * 0.5;
  const wr = 0.024 + 0.012 * b.build;
  const waist = (side: number): Disc => [{ x: wMid.x + side * ww, y: wMid.y }, wr];
  const hip = (p: Pt): Disc => [p, b.rl * (tubes ? 0.95 : b.fem ? 1.12 : 1.02)];
  const round = (d: Disc) => circle(d[0], d[1]);
  const neckR = b.rH * 0.4;
  const neckBase: Disc = [{ x: sMid.x, y: sMid.y - b.ra * 0.6 }, neckR * 1.15];
  const torso = [
    capsule([{ x: j.head.x, y: j.head.y + b.rH * 0.6 }, neckR], neckBase),
    ...(tubes ? [] : [hull([...round(neckBase), ...round(chest(j.shoulderL)), ...round(chest(j.shoulderR))])]),
    // la ligne d'épaules va jusqu'aux articulations : les bras restent attachés même sur un torse étroit
    capsule([j.shoulderL, b.ra * 0.8], [j.shoulderR, b.ra * 0.8]),
    hull([...round(chest(j.shoulderL)), ...round(chest(j.shoulderR)), ...round(waist(-1)), ...round(waist(1))]),
    hull([...round(waist(-1)), ...round(waist(1)), ...round(hip(j.hipL)), ...round(hip(j.hipR))]),
    ...(b.torsoT === 'round' ? [circle({ x: wMid.x, y: wMid.y - 0.01 }, (b.sw + b.hw) / 2 + b.rl * 0.75, 28)] : []),
  ];
  return {
    legL: leg(j.hipL, j.kneeL, j.footL, -1),
    legR: leg(j.hipR, j.kneeR, j.footR, 1),
    torso: unite(torso),
    armL: arm(j.shoulderL, j.elbowL, j.handL),
    armR: arm(j.shoulderR, j.elbowR, j.handR),
    head: [headShape(b, j.head)],
  };
}

/** Avancées des gestes, ramenées à leurs images. Une boucle (marche, danse) part du repos et y revient sur un quart de boucle. */
interface Frames {
  walk: number;
  walkOn: number;
  dance: number;
  danceOn: number;
  wave: number;
  jump: number;
}
function framesOf(g: Progress, ctx?: Context): Frames {
  const once = (v: number, n: number) => Math.round(Math.max(0, Math.min(1, v)) * n) / n;
  const loop = (id: string, n: number): [number, number] => {
    const on = ctx?.each?.(id).filter((x) => x.u > 0 && x.u < 1).pop();
    if (!on) return [0, 0];
    const env = Math.max(0, Math.min(1, on.turns / 0.25, (on.of - on.turns) / 0.25));
    return [Math.floor(frac(on.turns) * n) / n, Math.round(env * 8) / 8];
  };
  const [walk, walkOn] = loop('walk', WALK_FRAMES);
  const [dance, danceOn] = loop('dance', DANCE_FRAMES);
  return { walk, walkOn, dance, danceOn, wave: once(g('wave'), WAVE_FRAMES), jump: once(g('jump'), JUMP_FRAMES) };
}

const KEYS = ['sex', 'heads', 'build', 'shoulders', 'legs', 'arms', 'headT', 'torsoT', 'limbT', 'stride', 'swing', 'waves'];

function cut(a: Anim, _phase: number, g: Progress, ctx?: Context): string {
  const f = framesOf(g, ctx);
  const part = typeof a.part === 'string' ? a.part : '';
  return cached(`h5|${part}|${KEYS.map((k) => a[k] ?? '').join('|')}|${f.walk}|${f.walkOn}|${f.dance}|${f.danceOn}|${f.wave}|${f.jump}`, () => {
    const b = bodyOf(a);
    const shapes = shapesOf(b, jointsOf(b, poseOf(a, f)));
    // une pièce : sa surface ; sans pièce (vignette, aperçus des réglages), la silhouette entière réunie
    const rings = part && shapes[part] ? shapes[part]! : unite(Object.values(shapes).flat());
    return ringsToPath(
      rings.map((ring) => ring.map((p) => ({ x: (p.x + BOX_W / 2) / BOX_W, y: (p.y + TOP) / BOX_H }))),
      0.0006,
      50,
    );
  });
}

const shape = (key: string, name: string, title: string, def: number): Param => ({ key, name, title, type: 'range', min: 0, max: 1, def });

// les gabarits : canons classiques du dessin, puis quelques carrures ; la morphologie (masculine, féminine) se choisit à part
const BASE = { heads: 7.5, build: 0.4, shoulders: 0.5, legs: 0.5, arms: 0.5, headT: 'round', torsoT: 'trapeze', limbT: 'taper' };
const PRESETS: Preset[] = [
  { id: 'common', name: 'Commun', set: { ...BASE } },
  { id: 'ideal', name: 'Idéal', set: { ...BASE, heads: 8, build: 0.35, shoulders: 0.6, headT: 'oval' } },
  { id: 'heroic', name: 'Héroïque', set: { ...BASE, heads: 9, build: 0.5, shoulders: 0.9, headT: 'oval' } },
  { id: 'child', name: 'Enfant', set: { ...BASE, heads: 5, shoulders: 0.3 } },
  { id: 'comic', name: 'BD', set: { ...BASE, heads: 3.5, build: 0.5, shoulders: 0.3 } },
  { id: 'athlete', name: 'Athlète', set: { ...BASE, heads: 8, build: 0.7, shoulders: 1, headT: 'oval', limbT: 'bulk' } },
  { id: 'round', name: 'Rond', set: { ...BASE, heads: 7, build: 1, torsoT: 'round' } },
  { id: 'robot', name: 'Robot', set: { ...BASE, heads: 6, build: 0.6, shoulders: 0.8, headT: 'square', torsoT: 'straight', limbT: 'straight' } },
];

/** Partie de la silhouette qu'un réglage change, pour que ses bulles zooment dessus. */
function focus(a: Anim, key: string) {
  const b = bodyOf(a);
  const box = (x0: number, y0: number, x1: number, y1: number) => ({ x: (x0 + BOX_W / 2) / BOX_W, y: (y0 + TOP) / BOX_H, w: (x1 - x0) / BOX_W, h: (y1 - y0) / BOX_H });
  if (key === 'headT') return box(-0.16, -0.03, 0.16, 2 * b.rH + 0.09);
  if (key === 'torsoT') return box(-0.3, b.sY - 0.05, 0.3, 1 - b.leg + 0.1);
  return box(-0.4, -0.02, 0.4, 1.02);
}

export const humanoid: Generator = {
  kind: 'humanoid',
  name: 'Humanoïde',
  cycle: 4,
  cycleName: 'Pas',
  cycleWhat: 'Deux pas (ou une mesure de danse)',
  presetName: 'Gabarit',
  presets: PRESETS,
  params: [
    {
      key: 'sex',
      name: 'Morphologie',
      type: 'choice',
      def: DEF.sex,
      options: [
        { id: 'm', name: 'Masculine' },
        { id: 'f', name: 'Féminine' },
      ],
    },
    {
      key: 'headT',
      name: 'Tête',
      type: 'choice',
      def: DEF.headT,
      options: [
        { id: 'round', name: 'Ronde' },
        { id: 'oval', name: 'Ovale' },
        { id: 'square', name: 'Carrée' },
      ],
    },
    {
      key: 'torsoT',
      name: 'Torse',
      type: 'choice',
      def: DEF.torsoT,
      options: [
        { id: 'trapeze', name: 'Épaulé' },
        { id: 'straight', name: 'Droit' },
        { id: 'round', name: 'Rond' },
      ],
    },
    {
      key: 'limbT',
      name: 'Membres',
      type: 'choice',
      def: DEF.limbT,
      options: [
        { id: 'taper', name: 'Fuselés' },
        { id: 'straight', name: 'Droits' },
        { id: 'bulk', name: 'Massifs' },
      ],
    },
    { key: 'heads', name: 'Têtes', title: 'Canon : hauteur du corps en nombre de têtes (7,5 commun, 8 idéal, 9 héroïque, 5 enfant, 3,5 BD)', type: 'steps', min: 3, max: 9, step: 0.5, def: DEF.heads },
    shape('build', 'Corpulence', 'Épaisseur du corps et des membres', DEF.build),
    shape('shoulders', 'Carrure', 'Largeur des épaules', DEF.shoulders),
    shape('legs', 'Jambes', 'Longueur des jambes par rapport au buste', DEF.legs),
    shape('arms', 'Bras', 'Longueur des bras', DEF.arms),
    { key: 'stride', name: 'Amplitude', title: 'Hauteur des genoux et balancement des bras', type: 'range', min: 0, max: 1, def: 0.6 },
    { key: 'swing', name: 'Énergie', title: 'Ampleur de la danse', type: 'range', min: 0, max: 1, def: 0.6 },
    { key: 'waves', name: 'Va-et-vient', title: 'Nombre de va-et-vient de la main', type: 'steps', min: 1, max: 6, def: 3 },
    { key: 'leap', name: 'Hauteur', title: 'Hauteur du saut', type: 'range', min: 0, max: 1, def: 0.5 },
  ],
  // au départ : il salue ; marche, saut et danse se posent depuis « ＋ Animation »
  gestures: () => [
    { id: 'wave', name: 'Salut', note: 'lève le bras et salue', params: ['waves'], at: 0.125, len: 0.5 },
    { id: 'walk', name: 'Marche', note: 'marche sur place', loop: true, cycle: 1, params: ['stride'], start: false },
    { id: 'jump', name: 'Saut', note: 's’accroupit, saute, retombe', order: true, params: ['leap'], len: 0.375, start: false },
    { id: 'dance', name: 'Danse', note: 'danse', loop: true, cycle: 2, params: ['swing'], start: false },
  ],
  parts: PARTS,
  cut,
  ratio: () => BOX_W / BOX_H,
  // le saut soulève l'objet entier : toutes les pièces montent ensemble
  order: (a, _phase, g) => ({ dy: -0.22 * (0.3 + 0.7 * unit(a, 'leap', 0.5)) * jumpOf(Math.round(Math.max(0, Math.min(1, g('jump'))) * JUMP_FRAMES) / JUMP_FRAMES).air }),
  focus,
  size: 0.8,
};
