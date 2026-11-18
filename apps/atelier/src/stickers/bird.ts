import { ringsToPath } from '../cut';
import { cached, frac, numOf, type Anim, type Generator, type Param, type Preset, type Progress, type Warp } from './kit';

/*
 * Volatile paramétrique, vu de dessous en vol (la tête en haut) : de la chauve-souris à l'aigle royal.
 * Sa morphologie se décrit par des réglages continus (envergure, largeur des ailes, flèche, anguleux, tête, corps, traîne)
 * et par des types de pièces (ailes, bec, queue) ; les espèces sont des jeux de ces réglages (Generator.presets).
 * Le contour est un seul anneau : demi-silhouette droite décrite en points (chacun sa raideur), puis son miroir.
 * Le battement fait tourner chaque point de l'aile autour de l'axe du corps (épaule, puis coude en retard),
 * et la vue penchée (Vue) fait voir la hauteur des ailes : le même battement marche pour toutes les formes.
 */

const FRAMES = 40;

type Wing = 'round' | 'point' | 'finger' | 'membrane';
type Beak = 'short' | 'hook' | 'long' | 'snout';
type Tail = 'fan' | 'square' | 'fork' | 'point' | 'membrane';

interface Morph {
  span: number;
  chord: number;
  sweep: number;
  sharp: number;
  head: number;
  body: number;
  tail: number;
  view: number;
  wing: Wing;
  beak: Beak;
  tailT: Tail;
}

const unit = (a: Anim, k: string, d: number) => Math.max(0, Math.min(1, numOf(a, k, d)));
const pick = <T extends string>(a: Anim, k: string, ok: readonly T[], d: T): T => (ok.includes(a[k] as T) ? (a[k] as T) : d);
const WINGS = ['round', 'point', 'finger', 'membrane'] as const;
const BEAKS = ['short', 'hook', 'long', 'snout'] as const;
const TAILS = ['fan', 'square', 'fork', 'point', 'membrane'] as const;

/** Réglages de départ : une mouette. */
const DEF = { span: 0.75, chord: 0.4, sweep: 0.5, sharp: 0.2, head: 0.3, body: 0.4, tail: 0.25, view: 0.35, wing: 'point', beak: 'short', tailT: 'square' } as const;

function morphOf(a: Anim): Morph {
  return {
    span: unit(a, 'span', DEF.span),
    chord: unit(a, 'chord', DEF.chord),
    sweep: unit(a, 'sweep', DEF.sweep),
    sharp: unit(a, 'sharp', DEF.sharp),
    head: unit(a, 'head', DEF.head),
    body: unit(a, 'body', DEF.body),
    tail: unit(a, 'tail', DEF.tail),
    view: unit(a, 'view', DEF.view),
    wing: pick(a, 'wing', WINGS, DEF.wing),
    beak: pick(a, 'beak', BEAKS, DEF.beak),
    tailT: pick(a, 'tailT', TAILS, DEF.tailT),
  };
}
const keyOf = (m: Morph) => `${m.span}|${m.chord}|${m.sweep}|${m.sharp}|${m.head}|${m.body}|${m.tail}|${m.view}|${m.wing}|${m.beak}|${m.tailT}`;

/** Un point de la demi-silhouette : sa place à plat (x vers la droite, y vers l'arrière), sa raideur (1 = coin), et sa place le long de l'aile (s ≥ 0) s'il bat. */
interface P {
  x: number;
  y: number;
  t: number;
  s?: number;
  /** Pièce du contour : la bulle d'un type de pièce zoome sur elle. */
  p?: Part;
}
type Part = 'head' | 'wing' | 'tail';

// ailes : [s le long de l'aile (0 épaule → 1 bout), f à travers (0 bord d'attaque → 1 bord de fuite), raideur]
type W = [number, number, number];
const WING_SHAPES: Record<Wing, { taper: number; pts: W[] }> = {
  // arrondie (moineau, poule) : bout large et rond
  round: { taper: 0.15, pts: [[0, 0, 0], [0.25, 0, 0], [0.48, 0, 0], [0.72, 0, 0], [0.9, 0.05, 0], [1, 0.35, 0], [0.97, 0.66, 0], [0.86, 0.92, 0], [0.6, 1, 0], [0.3, 1, 0], [0, 1, 0.3]] },
  // pointue (faucon, hirondelle, mouette) : le bord de fuite remonte vers une pointe
  point: { taper: 0.55, pts: [[0, 0, 0], [0.3, 0, 0], [0.48, 0, 0], [0.75, 0, 0], [1, 0.02, 1], [0.8, 0.45, 0], [0.55, 0.85, 0], [0.3, 1, 0], [0, 1, 0.3]] },
  // digitée (aigle, vautour, corbeau) : les rémiges écartées en doigts au bout de l'aile
  finger: {
    taper: 0,
    pts: [
      [0, 0, 0], [0.3, 0, 0], [0.48, 0, 0], [0.7, 0, 0], [0.84, 0.02, 0.2],
      [1.0, 0.1, 0.5], [0.92, 0.2, 0.6], [1.03, 0.3, 0.5], [0.94, 0.4, 0.6], [1.01, 0.5, 0.5], [0.92, 0.6, 0.6], [0.96, 0.69, 0.5], [0.87, 0.76, 0.6], [0.89, 0.86, 0.5],
      [0.78, 1.03, 0], [0.55, 1.05, 0], [0.3, 1.02, 0], [0, 1, 0.3],
    ],
  },
  // membrane (chauve-souris, dragon) : pouce au poignet, festons entre les doigts, la membrane rejoint les pattes
  membrane: {
    taper: 0,
    pts: [
      [0, 0, 0], [0.25, -0.04, 0], [0.45, -0.13, 0.9], [0.72, -0.03, 0], [1, 0, 1],
      [0.86, 0.48, 0], [0.74, 0.98, 0.9], [0.62, 0.8, 0], [0.5, 1.25, 0.9], [0.34, 1.05, 0], [0.12, 1.5, 0.8],
    ],
  },
};

/** Demi-silhouette droite, de l'avant (sur l'axe) à l'arrière (sur l'axe), à plat. */
/** Mesures de l'oiseau à plat : corps, épaule, aile (envergure, largeur, bord d'attaque). */
function dims(m: Morph) {
  const bodyLen = 0.3;
  const bw = 0.03 + 0.045 * m.body;
  const x0 = bw * 0.9;
  const Lw = 0.32 + 0.78 * m.span;
  const c0 = 0.09 + 0.22 * m.chord;
  const yr = -bodyLen / 2 + 0.04;
  const sweepK = -0.08 + 0.55 * m.sweep;
  // bord d'attaque : le poignet avance un peu, la flèche repousse le bout vers l'arrière
  const le = (s: number) => {
    const bump = s < 0.45 ? Math.sin((Math.PI / 2) * (s / 0.45)) : 1 - ((s - 0.45) / 0.55) * 0.6;
    return yr - 0.03 * bump + sweepK * Lw * Math.pow(Math.max(0, s), 1.5);
  };
  const hr = 0.03 + 0.05 * m.head;
  const yh = -bodyLen / 2 - hr * 0.55;
  return { bodyLen, bw, x0, Lw, c0, yr, le, hr, yh };
}
function half(m: Morph): P[] {
  const { bodyLen, bw, x0, Lw, c0, le, hr, yh } = dims(m);
  const out: P[] = [];
  const tag = (from: number, p: Part) => {
    for (let i = from; i < out.length; i++) out[i]!.p = p;
  };
  // tête et bec
  if (m.beak === 'short') out.push({ x: 0, y: yh - hr - 0.03, t: 0.8 }, { x: hr * 0.35, y: yh - hr * 0.92, t: 0.2 });
  else if (m.beak === 'hook') out.push({ x: 0, y: yh - hr - 0.055, t: 1 }, { x: hr * 0.22, y: yh - hr - 0.012, t: 0.6 }, { x: hr * 0.55, y: yh - hr * 0.82, t: 0.2 });
  else if (m.beak === 'long') out.push({ x: 0, y: yh - hr - 0.15, t: 1 }, { x: hr * 0.2, y: yh - hr * 0.95, t: 0.5 });
  else out.push({ x: 0, y: yh - hr * 0.95, t: 0.2 }, { x: hr * 0.45, y: yh - hr * 1.05, t: 0.3 }, { x: hr * 0.8, y: yh - hr * 2, t: 1 }, { x: hr * 1.08, y: yh - hr * 0.55, t: 0.4 });
  if (m.beak !== 'snout') out.push({ x: hr, y: yh, t: 0 });
  tag(0, 'head');
  out.push({ x: Math.max(bw * 0.8, hr * 0.6), y: -bodyLen / 2 + 0.01, t: 0.3 });
  const w0 = out.length;
  // aile
  const W = WING_SHAPES[m.wing];
  for (const [s, f, t] of W.pts) out.push({ x: x0 + s * Lw, y: le(s) + f * c0 * (1 - W.taper * Math.min(1, s)), t, s });
  tag(w0, 'wing');
  // queue : sa base suit la fin de l'aile
  const last = out[out.length - 1]!;
  const tw = bw * 0.85;
  const TL = 0.05 + 0.32 * m.tail;
  const yt = Math.max(bodyLen / 2, last.y + 0.01);
  const T: Record<Tail, Array<[number, number, number]>> = {
    fan: [[tw, 0, 0.3], [tw * 2, TL * 0.85, 0.2], [tw * 1.25, TL * 1.02, 0.3], [0, TL * 1.08, 0]],
    square: [[tw, 0, 0.3], [tw * 1.3, TL, 1], [0, TL, 0.5]],
    fork: [[tw, 0, 0.3], [tw * 1.9, TL * 1.4, 1], [tw * 0.6, TL * 0.55, 0.5], [0, TL * 0.42, 0.3]],
    point: [[tw, 0, 0.3], [tw * 0.6, TL * 0.7, 0.2], [0, TL * 1.2, 1]],
    membrane: [[tw * 1.1, 0, 0.3], [tw * 2.4, TL * 0.55, 1], [tw * 1.2, TL * 0.8, 0.2], [0, TL * 0.95, 0.3]],
  };
  const t0 = out.length;
  for (const [x, dy, t] of T[m.tailT]) out.push({ x, y: yt + dy, t });
  tag(t0, 'tail');
  return out;
}

/** Le battement à une image : angles de l'épaule et du coude, descente du corps, et la vue penchée. */
interface Flap {
  f1: number;
  f2: number;
  bob: number;
  /** Épaule (distance à l'axe) et longueur du bras jusqu'au coude. */
  x0: number;
  re: number;
  ct: number;
  st: number;
}
function flapOf(m: Morph, amp: number, k: number): Flap {
  const ph = (k / FRAMES) * 2 * Math.PI;
  const tilt = ((20 + 50 * m.view) * Math.PI) / 180;
  const bw = 0.03 + 0.045 * m.body;
  // l'épaule mène, le bout suit avec du retard ; le corps descend quand les ailes montent
  return {
    f1: amp * 0.7 * Math.sin(ph),
    f2: amp * 0.55 * Math.sin(ph - 0.8),
    bob: -0.035 * amp * Math.sin(ph),
    x0: bw * 0.9,
    re: 0.45 * (0.32 + 0.78 * m.span),
    ct: Math.cos(tilt),
    st: Math.sin(tilt),
  };
}
/** Un point de l'aile (à plat, x signé) tourné autour de l'axe du corps : sa place en travers et sa hauteur. */
function bend(F: Flap, x: number): [number, number] {
  const sx = Math.sign(x) || 1;
  const r = Math.max(0, Math.abs(x) - F.x0);
  if (r <= F.re) return [sx * (F.x0 + r * Math.cos(F.f1)), r * Math.sin(F.f1)];
  return [sx * (F.x0 + F.re * Math.cos(F.f1) + (r - F.re) * Math.cos(F.f1 + F.f2)), F.re * Math.sin(F.f1) + (r - F.re) * Math.sin(F.f1 + F.f2)];
}

/**
 * Le battement comme une déformation du plan : un point de l'oiseau à plat (x signé, y vers l'arrière) va à sa place
 * à l'écran à cette image. Le contour et la surface (étape 3 : teinte, peinture, relief) passent par la même,
 * si bien que le décor reste exactement sur l'aile qui bat.
 * Sur l'aile, chaque point tourne autour de l'axe du corps (épaule, puis coude en retard) et le corps descend avec le battement.
 * La tête et la queue restent avec le corps : la part de l'aile s'efface à leur hauteur (sur une courte rampe),
 * sauf au-delà de leur largeur, où il ne peut y avoir que l'aile.
 */
const RAMP = 0.025;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
interface Bend {
  F: Flap;
  /** Le cou (y du point juste avant l'aile), le début de la queue, et les demi-largeurs de la tête et de la queue. */
  neck: number;
  yt: number;
  xHead: number;
  xTail: number;
  at: (x: number, y: number) => [number, number];
}
function bender(m: Morph, amp: number, k: number, R = half(m)): Bend {
  const F = flapOf(m, amp, k);
  const wi = R.findIndex((p) => p.p === 'wing');
  const neck = R[wi - 1]!.y;
  const tails = R.filter((p) => p.p === 'tail');
  const yt = tails[0]!.y;
  const xHead = Math.max(...R.slice(0, wi).map((p) => p.x));
  const xTail = Math.max(...tails.map((p) => p.x));
  const at = (x: number, y: number): [number, number] => {
    const ax = Math.abs(x);
    let X = x;
    let H = F.bob;
    if (ax > F.x0) {
      const front = Math.max(clamp01((y - neck) / RAMP), clamp01((ax - xHead) / RAMP));
      const back = Math.max(clamp01((yt - y) / RAMP), clamp01((ax - xTail) / RAMP));
      const w = front * back;
      if (w > 0) {
        const [bx, bh] = bend(F, x);
        X = x + (bx - x) * w;
        H += bh * w;
      }
    }
    return [X, y * F.ct - H * F.st];
  };
  return { F, neck, yt, xHead, xTail, at };
}

/** Contour à plat : la demi-silhouette et son miroir, en un anneau. */
function flat(m: Morph): P[] {
  const R = half(m);
  return [...R, ...R.slice(1, -1).reverse().map((p) => ({ ...p, x: -p.x }))];
}
/** Silhouette entière à une image du battement : points de contrôle à l'écran avec leur raideur (pour viser une pièce). */
function pose(m: Morph, amp: number, k: number): P[] {
  const B = bender(m, amp, k);
  return flat(m).map((p) => {
    const [x, y] = B.at(p.x, p.y);
    return { ...p, x, y };
  });
}
/** Contour à l'écran à une image : la courbe tracée à plat, puis pliée par le battement. */
function outline(m: Morph, amp: number, k: number, n = 8): Array<{ x: number; y: number }> {
  const B = bender(m, amp, k);
  return spline(flat(m), m.sharp, n).map((p) => {
    const [x, y] = B.at(p.x, p.y);
    return { x, y };
  });
}

/** Déformation de la surface (Generator.warp) : de l'oiseau au repos (ailes à plat) à l'oiseau de cette image. */
function warp(a: Anim, _phase: number, g: Progress): Warp | null {
  const m = morphOf(a);
  const amp = ampOf(a);
  const k = Math.floor(frac(g('flap')) * FRAMES);
  const fr = frameOf(m);
  const B = bender(m, amp, k);
  const ct = B.F.ct;
  const map = (u: number, v: number): [number, number] => {
    // au repos, ailes à plat : y à l'écran = y à plat × cos(vue)
    const [X, Y] = B.at(fr.x0 + u * fr.w, (fr.y0 + v * fr.h) / ct);
    return [(X - fr.x0) / fr.w, (Y - fr.y0) / fr.h];
  };
  // plis : axe, épaules, coudes, bords de la tête et de la queue (avec leur rampe) ; rangées aux rampes du cou et de la queue
  const xs = [0, B.F.x0, B.F.x0 + B.F.re, B.xHead, B.xHead + RAMP, B.xTail, B.xTail + RAMP];
  const us = lines([...xs.flatMap((x) => [(x - fr.x0) / fr.w, (-x - fr.x0) / fr.w]), ...even(12)]);
  const ys = [B.neck, B.neck + RAMP / 2, B.neck + RAMP, B.yt - RAMP, B.yt - RAMP / 2, B.yt];
  const vs = lines([...ys.map((y) => (y * ct - fr.y0) / fr.h), ...even(6)]);
  return { key: `b|${keyOf(m)}|${amp}|${k}`, us, vs, map };
}
const even = (n: number) => Array.from({ length: n + 1 }, (_, i) => i / n);

/**
 * Os de l'oiseau au repos (Generator.bones) : la colonne de la tête au bout de la queue, et pour chaque aile
 * l'épaule, le coude (là où le battement plie) et le bout, un peu en arrière du bord d'attaque.
 */
function bones(a: Anim): Array<Array<[number, number]>> {
  const m = morphOf(a);
  const D = dims(m);
  const R = half(m);
  const W = WING_SHAPES[m.wing];
  const fr = frameOf(m);
  const ct = flapOf(m, 0, 0).ct;
  const re = 0.45 * D.Lw;
  const tails = R.filter((p) => p.p === 'tail');
  const yt = tails[0]!.y;
  const yEnd = Math.max(...tails.map((p) => p.y));
  const at = (x: number, y: number): [number, number] => [(x - fr.x0) / fr.w, (y * ct - fr.y0) / fr.h];
  const bone = (s: number) => D.le(s) + 0.3 * D.c0 * (1 - W.taper * Math.min(1, s));
  const wing = (sx: number) => [at(sx * D.x0, bone(0)), at(sx * (D.x0 + re), bone(re / D.Lw)), at(sx * (D.x0 + 0.92 * D.Lw), bone(0.92))];
  return [[at(0, D.yh), at(0, -D.bodyLen / 2), at(0, yt), at(0, yt + 0.8 * (yEnd - yt))], wing(1), wing(-1)];
}
/** Os de l'oiseau à un instant (Generator.skeleton), pour la vue des os : ceux du repos, pliés par le battement comme la surface. Un objet attaché suit la surface (warp), pas ces os. */
function skeleton(a: Anim, phase: number, g: Progress): Array<[[number, number], [number, number]]> {
  const w = warp(a, phase, g);
  const out: Array<[[number, number], [number, number]]> = [];
  for (const line of bones(a)) {
    const pts = line.map(([u, v]): [number, number] => (w ? w.map(u, v) : [u, v]));
    for (let i = 1; i < pts.length; i++) out.push([pts[i - 1]!, pts[i]!]);
  }
  return out;
}
/** Lignes du maillage : dans la boîte, triées, sans doublons trop proches. */
function lines(xs: number[]): number[] {
  const out = [0];
  for (const x of xs.filter((x) => x > 0 && x < 1).sort((p, q) => p - q)) if (x - out[out.length - 1]! > 0.004) out.push(x);
  if (1 - out[out.length - 1]! < 0.004) out.pop();
  out.push(1);
  return out;
}

/** Courbe fermée par les points, chaque point sa raideur : 0 = courbe douce, 1 = coin (les segments voisins deviennent droits). */
function spline(P: P[], sharp: number, n = 8): Array<{ x: number; y: number }> {
  const m = P.length;
  const at = (i: number) => P[((i % m) + m) % m]!;
  const tan = (i: number) => {
    const k = 1 - Math.max(sharp, at(i).t);
    return { x: (k * (at(i + 1).x - at(i - 1).x)) / 2, y: (k * (at(i + 1).y - at(i - 1).y)) / 2 };
  };
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < m; i++) {
    const [a, b, ta, tb] = [at(i), at(i + 1), tan(i), tan(i + 1)];
    for (let j = 0; j < n; j++) {
      const u = j / n;
      const [u2, u3] = [u * u, u * u * u];
      const h00 = 2 * u3 - 3 * u2 + 1;
      const h10 = u3 - 2 * u2 + u;
      const h01 = -2 * u3 + 3 * u2;
      const h11 = u3 - u2;
      out.push({ x: h00 * a.x + h10 * ta.x + h01 * b.x + h11 * tb.x, y: h00 * a.y + h10 * ta.y + h01 * b.y + h11 * tb.y });
    }
  }
  return out;
}

/** Cadre de l'oiseau sur tout un battement à pleine amplitude : la boîte ne bouge pas quand il bat des ailes. */
const frames = new Map<string, { x0: number; y0: number; w: number; h: number }>();
function frameOf(m: Morph) {
  const key = keyOf(m);
  let f = frames.get(key);
  if (!f) {
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (let k = 0; k < FRAMES; k += 2)
      for (const p of outline(m, 1, k, 4)) {
        x0 = Math.min(x0, p.x);
        x1 = Math.max(x1, p.x);
        y0 = Math.min(y0, p.y);
        y1 = Math.max(y1, p.y);
      }
    const pad = 0.015;
    const X = Math.max(-x0, x1) + pad;
    f = { x0: -X, y0: y0 - pad, w: 2 * X, h: y1 - y0 + 2 * pad };
    if (frames.size > 200) frames.clear();
    frames.set(key, f);
  }
  return f;
}

const ampOf = (a: Anim) => Math.max(0, Math.min(1, numOf(a, 'amp', 0.8)));
function cut(a: Anim, _phase: number, g: Progress): string {
  const m = morphOf(a);
  const amp = ampOf(a);
  // hors du battement, l'oiseau plane, ailes à plat
  const k = Math.floor(frac(g('flap')) * FRAMES);
  return cached(`b3|${keyOf(m)}|${amp}|${k}`, () => {
    const f = frameOf(m);
    const pts = outline(m, amp, k).map((p) => ({ x: (p.x - f.x0) / f.w, y: (p.y - f.y0) / f.h }));
    return ringsToPath([pts], 0.0004, 30, false);
  });
}

/**
 * Où regarder pour un réglage (coordonnées 0..1 de la boîte), dans la pose de la vignette : la tête pour le bec,
 * le bout de l'aile droite pour le type d'aile, la queue pour la queue. Les bulles de ces choix zooment dessus.
 */
const FOCUS: Record<string, (p: P) => boolean> = {
  beak: (p) => p.p === 'head',
  wing: (p) => p.p === 'wing' && p.x > 0 && (p.s ?? 0) >= 0.4,
  tailT: (p) => p.p === 'tail',
};
function focus(a: Anim, key: string) {
  const keep = FOCUS[key];
  if (!keep) return undefined;
  const m = morphOf(a);
  const f = frameOf(m);
  const k = Math.floor(frac(bird.glyphPhase ?? 0) * FRAMES);
  const pts = pose(m, ampOf(a), k).filter(keep);
  if (!pts.length) return undefined;
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  const pad = 0.25 * Math.max(x1 - x0, y1 - y0, 0.05);
  return { x: (x0 - pad - f.x0) / f.w, y: (y0 - pad - f.y0) / f.h, w: (x1 - x0 + 2 * pad) / f.w, h: (y1 - y0 + 2 * pad) / f.h };
}

const shape = (key: string, name: string, title: string, def: number): Param => ({ key, name, title, type: 'range', min: 0, max: 1, def, reshape: true });

const PRESETS: Preset[] = [
  { id: 'gull', name: 'Mouette', set: { span: 0.75, chord: 0.4, sweep: 0.5, sharp: 0.2, head: 0.3, body: 0.4, tail: 0.25, wing: 'point', beak: 'short', tailT: 'square' } },
  { id: 'eagle', name: 'Aigle royal', set: { span: 0.9, chord: 0.8, sweep: 0.12, sharp: 0.1, head: 0.35, body: 0.75, tail: 0.35, wing: 'finger', beak: 'hook', tailT: 'fan' } },
  { id: 'falcon', name: 'Faucon', set: { span: 0.55, chord: 0.5, sweep: 0.7, sharp: 0.35, head: 0.35, body: 0.5, tail: 0.45, wing: 'point', beak: 'hook', tailT: 'square' } },
  { id: 'swallow', name: 'Hirondelle', set: { span: 0.5, chord: 0.3, sweep: 0.9, sharp: 0.45, head: 0.25, body: 0.25, tail: 0.75, wing: 'point', beak: 'short', tailT: 'fork' } },
  { id: 'albatross', name: 'Albatros', set: { span: 1, chord: 0.12, sweep: 0.3, sharp: 0.15, head: 0.3, body: 0.55, tail: 0.12, wing: 'point', beak: 'long', tailT: 'square' } },
  { id: 'crow', name: 'Corbeau', set: { span: 0.5, chord: 0.6, sweep: 0.2, sharp: 0.2, head: 0.4, body: 0.55, tail: 0.45, wing: 'finger', beak: 'short', tailT: 'fan' } },
  { id: 'sparrow', name: 'Moineau', set: { span: 0.25, chord: 0.65, sweep: 0.2, sharp: 0.05, head: 0.75, body: 0.65, tail: 0.4, wing: 'round', beak: 'short', tailT: 'square' } },
  { id: 'heron', name: 'Héron', set: { span: 0.7, chord: 0.65, sweep: 0.1, sharp: 0.1, head: 0.2, body: 0.35, tail: 0.1, wing: 'round', beak: 'long', tailT: 'square' } },
  { id: 'bat', name: 'Chauve-souris', set: { span: 0.5, chord: 0.75, sweep: 0.1, sharp: 0.3, head: 0.45, body: 0.45, tail: 0.4, wing: 'membrane', beak: 'snout', tailT: 'membrane' } },
  { id: 'dragon', name: 'Dragon', set: { span: 0.85, chord: 0.7, sweep: 0.45, sharp: 0.85, head: 0.4, body: 0.7, tail: 1, wing: 'membrane', beak: 'hook', tailT: 'point' } },
];

export const bird: Generator = {
  kind: 'bird',
  name: 'Vol d’oiseau',
  cycle: 1 / 2,
  cycleName: 'Battement',
  cycleWhat: 'Un battement d’ailes',
  presetName: 'Espèce',
  presets: PRESETS,
  params: [
    {
      key: 'wing',
      name: 'Ailes',
      type: 'choice',
      def: DEF.wing,
      reshape: true,
      options: [
        { id: 'round', name: 'Arrondies' },
        { id: 'point', name: 'Pointues' },
        { id: 'finger', name: 'Digitées' },
        { id: 'membrane', name: 'Membrane' },
      ],
    },
    {
      key: 'beak',
      name: 'Tête',
      type: 'choice',
      def: DEF.beak,
      reshape: true,
      options: [
        { id: 'short', name: 'Bec court' },
        { id: 'hook', name: 'Bec crochu' },
        { id: 'long', name: 'Bec long' },
        { id: 'snout', name: 'Museau' },
      ],
    },
    {
      key: 'tailT',
      name: 'Queue',
      type: 'choice',
      def: DEF.tailT,
      reshape: true,
      options: [
        { id: 'fan', name: 'Éventail' },
        { id: 'square', name: 'Carrée' },
        { id: 'fork', name: 'Fourchue' },
        { id: 'point', name: 'Pointue' },
        { id: 'membrane', name: 'Membrane' },
      ],
    },
    shape('span', 'Envergure', 'Longueur des ailes', DEF.span),
    shape('chord', 'Largeur', 'Largeur des ailes, du bord d’attaque au bord de fuite', DEF.chord),
    shape('sweep', 'Flèche', 'Les ailes partent vers l’arrière', DEF.sweep),
    shape('sharp', 'Anguleux', 'Des courbes douces aux arêtes vives', DEF.sharp),
    shape('head', 'Tête', 'Taille de la tête', DEF.head),
    shape('body', 'Corps', 'Corpulence', DEF.body),
    shape('tail', 'Traîne', 'Longueur de la queue', DEF.tail),
    shape('view', 'Vue', 'De dessous à presque de face : on voit plus ou moins les ailes monter', DEF.view),
    { key: 'amp', name: 'Amplitude', type: 'range', min: 0.1, max: 1, def: 0.8 },
  ],
  gestures: () => [{ id: 'flap', name: 'Battement d’ailes', note: 'bat des ailes', loop: true, params: ['amp'] }],
  cut,
  warp,
  bones,
  skeleton,
  focus,
  ratio: (a) => {
    const f = frameOf(morphOf(a));
    return f.w / f.h;
  },
  glyphPhase: 0.1,
};
