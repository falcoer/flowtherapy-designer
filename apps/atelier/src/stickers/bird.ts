import { ringsToPath } from '../cut';
import { cached, frac, numOf, type Anim, type Generator, type Param, type Preset, type Progress } from './kit';

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
}

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
function half(m: Morph): P[] {
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
  const out: P[] = [];
  // tête et bec
  const hr = 0.03 + 0.05 * m.head;
  const yh = -bodyLen / 2 - hr * 0.55;
  if (m.beak === 'short') out.push({ x: 0, y: yh - hr - 0.03, t: 0.8 }, { x: hr * 0.35, y: yh - hr * 0.92, t: 0.2 });
  else if (m.beak === 'hook') out.push({ x: 0, y: yh - hr - 0.055, t: 1 }, { x: hr * 0.22, y: yh - hr - 0.012, t: 0.6 }, { x: hr * 0.55, y: yh - hr * 0.82, t: 0.2 });
  else if (m.beak === 'long') out.push({ x: 0, y: yh - hr - 0.15, t: 1 }, { x: hr * 0.2, y: yh - hr * 0.95, t: 0.5 });
  else out.push({ x: 0, y: yh - hr * 0.95, t: 0.2 }, { x: hr * 0.45, y: yh - hr * 1.05, t: 0.3 }, { x: hr * 0.8, y: yh - hr * 2, t: 1 }, { x: hr * 1.08, y: yh - hr * 0.55, t: 0.4 });
  if (m.beak !== 'snout') out.push({ x: hr, y: yh, t: 0 });
  out.push({ x: Math.max(bw * 0.8, hr * 0.6), y: -bodyLen / 2 + 0.01, t: 0.3 });
  // aile
  const W = WING_SHAPES[m.wing];
  for (const [s, f, t] of W.pts) out.push({ x: x0 + s * Lw, y: le(s) + f * c0 * (1 - W.taper * Math.min(1, s)), t, s });
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
  for (const [x, dy, t] of T[m.tailT]) out.push({ x, y: yt + dy, t });
  return out;
}

/** Silhouette entière à une image du battement : points à l'écran avec leur raideur. */
function pose(m: Morph, amp: number, k: number): P[] {
  const R = half(m);
  const ring = [...R, ...R.slice(1, -1).reverse().map((p) => ({ ...p, x: -p.x }))];
  const ph = (k / FRAMES) * 2 * Math.PI;
  const tilt = ((20 + 50 * m.view) * Math.PI) / 180;
  const [ct, st] = [Math.cos(tilt), Math.sin(tilt)];
  const bw = 0.03 + 0.045 * m.body;
  const x0 = bw * 0.9;
  const re = 0.45 * (0.32 + 0.78 * m.span);
  // l'épaule mène, le bout suit avec du retard ; le corps descend quand les ailes montent
  const f1 = amp * 0.7 * Math.sin(ph);
  const f2 = amp * 0.55 * Math.sin(ph - 0.8);
  const bob = -0.035 * amp * Math.sin(ph);
  return ring.map((p) => {
    let X = p.x;
    let H = bob;
    if (p.s !== undefined) {
      const sx = Math.sign(p.x) || 1;
      const r = Math.abs(p.x) - x0;
      if (r <= re) {
        X = sx * (x0 + r * Math.cos(f1));
        H += r * Math.sin(f1);
      } else {
        X = sx * (x0 + re * Math.cos(f1) + (r - re) * Math.cos(f1 + f2));
        H += re * Math.sin(f1) + (r - re) * Math.sin(f1 + f2);
      }
    }
    return { x: X, y: p.y * ct - H * st, t: p.t };
  });
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
      for (const p of spline(pose(m, 1, k), m.sharp, 4)) {
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

function cut(a: Anim, _phase: number, g: Progress): string {
  const m = morphOf(a);
  const amp = Math.max(0, Math.min(1, numOf(a, 'amp', 0.8)));
  // hors du battement, l'oiseau plane, ailes à plat
  const k = Math.floor(frac(g('flap')) * FRAMES);
  return cached(`b2|${keyOf(m)}|${amp}|${k}`, () => {
    const f = frameOf(m);
    const pts = spline(pose(m, amp, k), m.sharp).map((p) => ({ x: (p.x - f.x0) / f.w, y: (p.y - f.y0) / f.h }));
    return ringsToPath([pts], 0.0004, 30, false);
  });
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
  ratio: (a) => {
    const f = frameOf(morphOf(a));
    return f.w / f.h;
  },
  glyphPhase: 0.1,
};
