import polygonClipping from 'polygon-clipping';
import { ringsToPath } from '../cut';
import type { Pt } from '../model';
import { cached, numOf, type Anim, type Generator, type Progress } from './kit';

// œil : les paupières (en amande, bridées ou rondes), l'iris, la pupille, la paupière du haut et les cils, en pièces solidaires ; deux gestes, le clignement et le regard
const EYE_H = 0.56;
const BLINK_FRAMES = 14;
const LOOK_FRAMES = 32;

/** Les pièces de l'œil : chacune est un objet solidaire des autres, avec sa teinte, son bord, sa matière. */
const PARTS = [
  { id: 'white', name: 'Blanc', tint: 0 },
  { id: 'iris', name: 'Iris', tint: 1 },
  { id: 'pupil', name: 'Pupille', tint: 2 },
  { id: 'lid', name: 'Paupière', tint: 1 },
  { id: 'lashes', name: 'Cils', tint: 2 },
];

const KEYS = ['open', 'iris', 'gaze', 'round', 'slant', 'mirror', 'lid', 'lashes', 'lashW', 'lashL'];
const unit = (a: Anim, key: string, def: number, min = 0, max = 1) => Math.max(min, Math.min(max, numOf(a, key, def)));

/** Géométrie de l'œil à une image du clignement (kb) et du regard (kl) : paupières, iris. En unités de largeur. */
function geom(a: Anim, kb: number, kl: number) {
  const open = unit(a, 'open', 0.85, 0.3);
  const iris = unit(a, 'iris', 0.7, 0.3, 0.95);
  const gaze = unit(a, 'gaze', 0.6);
  const round = unit(a, 'round', 0);
  const slant = unit(a, 'slant', 0);
  const flip = a.mirror === 1 ? -1 : 1;
  const shut = kb / BLINK_FRAMES;
  const o = open * (1 - 0.96 * shut);
  // en unités de largeur : l'œil en amande va de x = 0,04 à 0,96, l'œil rond se resserre ; son axe est à mi-hauteur de la boîte
  const cy = EYE_H / 2;
  const half = 0.46 * (1 - 0.45 * round);
  const [x0, x1] = [0.5 - half, 0.5 + half];
  /** Position le long de l'œil, de −1 (coin gauche) à 1 (coin droit), gardée dans l'œil. */
  const along = (x: number) => Math.max(-1, Math.min(1, (x - 0.5) / half));
  // profil des paupières : en amande (pointu aux coins), il tend vers l'arc de cercle quand l'œil s'arrondit
  const arc = (u: number, p: number) => Math.pow(Math.cos((Math.PI * u) / 2), p) * (1 - round) + Math.sqrt(Math.max(0, 1 - u * u)) * round;
  // œil bridé : le coin extérieur remonte, la paupière du haut s'aplatit et son sommet part vers le coin intérieur
  const tilt = (u: number) => -0.075 * slant * flip * u;
  const lean = (u: number) => Math.max(-1, Math.min(1, u + 0.3 * slant * flip * (1 - u * u)));
  const [ampUp, ampLo] = [0.25 + (half - 0.25) * round, 0.2 + (half - 0.2) * round];
  const up = (x: number) => {
    const u = along(x);
    return cy + tilt(u) - ampUp * (1 - 0.4 * slant) * o * arc(lean(u), 0.75);
  };
  // la paupière du bas bouge peu : c'est celle du haut qui ferme l'œil
  const lo = (x: number) => {
    const u = along(x);
    return cy + tilt(u) + ampLo * (1 - 0.25 * slant) * open * (1 - 0.8 * shut) * arc(u, 0.85);
  };
  // pli de la paupière du haut : au-dessus du bord de l'œil grand ouvert, il rejoint les coins et reste dans la boîte ; il ne bouge pas quand l'œil se ferme
  const lid = unit(a, 'lid', 0.5);
  const crease = (x: number) => {
    const u = along(x);
    const rest = cy + tilt(u) - ampUp * (1 - 0.4 * slant) * open * arc(lean(u), 0.75);
    return Math.max(0.004, rest - (0.015 + 0.075 * lid) * Math.pow(Math.max(0, 1 - u * u), 0.6));
  };
  const R = Math.min(0.2 * iris, half * 0.8);
  const cx = 0.5 - gaze * Math.max(0, half - R - 0.1 * (1 - 0.8 * round)) * Math.sin(2 * Math.PI * (kl / LOOK_FRAMES));
  return { x0, x1, cy, up, lo, R, cx, crease, shut, flip, half };
}
/** Images du clignement et du regard à une avancée des gestes. */
const framesOf = (g: Progress): [number, number] => [Math.round(Math.sin(Math.PI * g('blink')) * BLINK_FRAMES), Math.round(g('look') * LOOK_FRAMES) % LOOK_FRAMES];

/** Les cils : une frange le long du bord de la paupière, d'où partent les cils en éventail, plus longs vers le coin extérieur ; ils se couchent quand l'œil se ferme. */
function lashRings(a: Anim, G: ReturnType<typeof geom>): Pt[][] {
  const { x0, x1, up, shut, flip, half } = G;
  const n = Math.round(unit(a, 'lashes', 9, 0, 24));
  const w = 0.004 + 0.022 * unit(a, 'lashW', 0.4);
  const len = 0.03 + 0.17 * unit(a, 'lashL', 0.45);
  const N = 40;
  // la frange : un trait le long du bord, effilé aux coins, qui porte les cils
  const liner: Pt[] = [];
  const thick = (x: number) => (0.006 + 0.3 * w) * Math.sqrt(Math.max(0, 1 - ((x - 0.5) / half) ** 2)) + 0.002;
  for (let i = 0; i <= N; i++) {
    const x = x0 + ((x1 - x0) * i) / N;
    liner.push({ x, y: up(x) - thick(x) });
  }
  for (let i = N; i >= 0; i--) {
    const x = x0 + ((x1 - x0) * i) / N;
    liner.push({ x, y: up(x) + 0.003 });
  }
  const shapes: Pt[][] = [liner];
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0.3 * flip : -0.86 + (1.76 * i) / (n - 1);
    const x = 0.5 + u * half;
    const out = (u * flip + 1) / 2;
    // direction : vers le haut au milieu, de plus en plus couchée vers les coins, un peu tirée vers l'extérieur ; l'œil fermé, les cils retombent
    const ang = (u * 58 + flip * 12) * (Math.PI / 180);
    const [dx, dy] = [Math.sin(ang), -Math.cos(ang) * (1 - 1.8 * shut)];
    const L = len * (0.5 + 0.5 * out);
    // le cil se recourbe vers l'extérieur : sa ligne s'écarte de la droite, de côté
    const [nx, ny] = [-dy, dx];
    const bend = 0.28 * L * (u * flip >= -0.2 ? flip : -flip);
    const base = { x, y: up(x) };
    const M = 6;
    const [left, right]: [Pt[], Pt[]] = [[], []];
    for (let k = 0; k <= M; k++) {
      const t = k / M;
      const c = { x: base.x + dx * L * t + nx * bend * t * t, y: base.y + dy * L * t + ny * bend * t * t };
      const r = (w / 2) * (1 - t) ** 0.8;
      left.push({ x: c.x - nx * r, y: c.y - ny * r });
      if (k < M) right.push({ x: c.x + nx * r, y: c.y + ny * r });
    }
    shapes.push([...left, ...right.reverse()]);
  }
  const poly = (ring: Pt[]) => [ring.map((p) => [p.x, p.y] as [number, number])];
  const u = polygonClipping.union(poly(liner), ...shapes.slice(1).map(poly));
  return u.flatMap((pg) => pg.map((ring) => ring.slice(0, -1).map(([x, y]) => ({ x, y }))));
}

function cut(a: Anim, _phase: number, g: Progress): string {
  const part = typeof a.part === 'string' ? a.part : '';
  // clignement : la paupière descend puis remonte sur sa plage ; regard : un aller à gauche, un aller à droite, retour au centre
  const [kb, kl] = framesOf(g);
  return cached(`e|${part}|${KEYS.map((k) => a[k] ?? '').join('|')}|${kb}|${kl}`, () => {
    const G = geom(a, kb, kl);
    const { x0, x1, cy, up, lo, R, cx, crease } = G;
    const N = 48;
    const lids: Pt[] = [];
    for (let i = 0; i <= N; i++) {
      const x = x0 + ((x1 - x0) * i) / N;
      lids.push({ x, y: up(x) });
    }
    for (let i = N - 1; i > 0; i--) {
      const x = x0 + ((x1 - x0) * i) / N;
      lids.push({ x, y: lo(x) });
    }
    // iris et pupille restent sous les paupières : leurs points sont ramenés dans l'œil
    const disc = (r: number, inset: number): Pt[] => {
      const out: Pt[] = [];
      for (let i = 0; i < 40; i++) {
        const th = (i / 40) * 2 * Math.PI;
        const x = Math.max(x0, Math.min(x1, cx + r * Math.cos(th)));
        const [top, bot] = [up(x) + inset, lo(x) - inset];
        out.push({ x, y: top >= bot ? (top + bot) / 2 : Math.max(top, Math.min(bot, cy + r * Math.sin(th))) });
      }
      return out;
    };
    // une pièce : sa surface pleine (le blanc, l'iris posé dessus, la pupille dessus) ; sans pièce, l'œil d'un seul tenant, iris à jour
    // la paupière du haut : du pli (fixe) au bord de l'œil (qui descend) ; elle s'étire quand l'œil se ferme
    const lidRing = (): Pt[] => {
      const out: Pt[] = [];
      for (let i = 0; i <= N; i++) {
        const x = x0 + ((x1 - x0) * i) / N;
        out.push({ x, y: crease(x) });
      }
      for (let i = N - 1; i > 0; i--) {
        const x = x0 + ((x1 - x0) * i) / N;
        out.push({ x, y: Math.max(crease(x) + 0.002, up(x)) });
      }
      return out;
    };
    const rings =
      part === 'white' ? [lids]
      : part === 'iris' ? [disc(R, 0.012)]
      : part === 'pupil' ? [disc(R * 0.45, 0.024)]
      : part === 'lid' ? [lidRing()]
      : part === 'lashes' ? lashRings(a, G)
      : [lids, disc(R, 0.012), disc(R * 0.45, 0.024)];
    return ringsToPath(
      rings.map((ring) => ring.map((p) => ({ x: p.x, y: p.y / EYE_H }))),
      0.0005,
      30,
    );
  });
}

/** Os de l'œil (Generator.skeleton) : le regard (du centre à l'iris), la paupière du haut et celle du bas, depuis l'axe de l'œil. */
function skeleton(a: Anim, _phase: number, g: Progress): Array<[[number, number], [number, number]]> {
  const [kb, kl] = framesOf(g);
  const { cy, up, lo, cx } = geom(a, kb, kl);
  const at = (x: number, y: number): [number, number] => [x, y / EYE_H];
  return [
    [at(cx, cy + 0.06), at(cx, cy)],
    [at(0.5, cy), at(0.5, up(0.5))],
    [at(0.5, cy), at(0.5, lo(0.5))],
  ];
}

export const eye: Generator = {
  kind: 'eye',
  name: 'Œil',
  cycle: 4,
  cycleName: 'Scénario',
  cycleWhat: 'Le scénario entier de l’œil (regard et clignements)',
  params: [
    { key: 'open', name: 'Ouverture', type: 'range', min: 0.3, max: 1, def: 0.85 },
    { key: 'iris', name: 'Iris', type: 'range', min: 0.3, max: 0.95, def: 0.7 },
    { key: 'round', name: 'Rondeur', title: 'De l’amande à l’œil tout rond', type: 'range', min: 0, max: 1, def: 0 },
    { key: 'slant', name: 'Bridé', title: 'Le coin extérieur remonte, la paupière s’aplatit', type: 'range', min: 0, max: 1, def: 0 },
    { key: 'mirror', name: 'Miroir', title: 'Retourne la forme de l’œil, pour faire la paire : le regard garde son sens', type: 'check', on: 1, off: 0, def: 0 },
    { key: 'lid', name: 'Paupière', title: 'Hauteur de la paupière du haut, du bord de l’œil à son pli', type: 'range', min: 0, max: 1, def: 0.5 },
    { key: 'lashes', name: 'Cils', title: 'Densité : le nombre de cils sur la paupière du haut (0 : la frange seule)', type: 'steps', min: 0, max: 24, def: 9 },
    { key: 'lashW', name: 'Largeur cils', title: 'Largeur des cils à leur base', type: 'range', min: 0, max: 1, def: 0.4 },
    { key: 'lashL', name: 'Longueur cils', title: 'Longueur des cils, plus longs vers le coin extérieur', type: 'range', min: 0, max: 1, def: 0.45 },
    { key: 'gaze', name: 'Regard', title: 'Jusqu’où l’iris part sur les côtés', type: 'range', min: 0, max: 1, def: 0.6 },
  ],
  gestures: () => [
    { id: 'look', name: 'Regard', note: 'gauche, droite, centre', params: ['gaze'], at: 0.1, len: 0.5 },
    { id: 'blink', name: 'Clignement', note: 'ferme et rouvre', at: 0.75, len: 0.1 },
  ],
  parts: PARTS,
  cut,
  skeleton,
  // les cils dépassent de la boîte de l'œil
  spill: (a) => a.part === 'lashes',
  ratio: () => 1 / EYE_H,
  size: 0.6,
};
