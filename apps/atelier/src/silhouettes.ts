import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping';
import type { Pt } from './model';

/** Silhouettes figuratives : unions de pièces simples moins leurs ouvertures, ramenées à une boîte 0..1. */
const LEGACY = { house: 1, building: 0.55, fir: 0.72, mountain: 1.6, palm: 0.8, flower: 0.62, car: 1.35 } as const;
const NEW = [
  'hexagon',
  'pentagon',
  'octagon',
  'diamond',
  'oval',
  'cross',
  'heart',
  'drop',
  'semicircle',
  'parallelogram',
  'ring',
  'arrow',
  'moon',
  'sun',
  'cloud',
  'leaf',
  'wave',
  'lightning',
  'tree',
  'cactus',
  'note',
  'notes',
  'guitar',
  'mic',
  'vinyl',
  'speaker',
  'van',
  'truck',
  'moto',
  'scooter',
  'trafficlight',
  'signround',
  'signsquare',
  'signhex',
  'signtriangle',
  'signyield',
  'road',
  'bin',
  'bench',
  'stage',
  'spotlight',
  'trebleclef',
  'bassclef',
  'telecaster',
  'stratocaster',
  'lespaul',
  'bass',
  'doublebass',
  'drums',
  'cymbal',
  'piano',
  'synth',
  'speech',
  'ticket',
  'banner',
  'seal',
  'balloon',
  'pennant',
] as const;
export type SilhouetteKind = keyof typeof LEGACY | (typeof NEW)[number];

/** Rayon Formes, par familles : [forme, nom]. Les formes de base (étoile, arche…) restent dans model.ts. */
export const SHAPE_FAMILIES: Array<[string, Array<[string, string]>]> = [
  [
    'Essentiels',
    [
      ['rounded', 'Rectangle arrondi'],
      ['circle', 'Rond'],
      ['triangle', 'Triangle'],
      ['star', 'Étoile'],
      ['arch', 'Arche'],
      ['blob', 'Tache'],
    ],
  ],
  [
    'Géométrie',
    [
      ['hexagon', 'Hexagone'],
      ['pentagon', 'Pentagone'],
      ['octagon', 'Octogone'],
      ['diamond', 'Losange'],
      ['oval', 'Ovale'],
      ['semicircle', 'Demi-cercle'],
      ['parallelogram', 'Parallélogramme'],
      ['ring', 'Anneau'],
      ['cross', 'Croix'],
      ['heart', 'Cœur'],
      ['drop', 'Goutte'],
      ['arrow', 'Flèche'],
    ],
  ],
  [
    'Nature',
    [
      ['sun', 'Soleil'],
      ['moon', 'Lune'],
      ['cloud', 'Nuage'],
      ['lightning', 'Éclair'],
      ['wave', 'Vague'],
      ['leaf', 'Feuille'],
      ['flower', 'Fleur'],
      ['tree', 'Arbre'],
      ['fir', 'Sapin'],
      ['palm', 'Palmier'],
      ['cactus', 'Cactus'],
      ['mountain', 'Montagne'],
    ],
  ],
  [
    'Ville',
    [
      ['house', 'Maison'],
      ['building', 'Immeuble'],
      ['car', 'Voiture'],
      ['van', 'Fourgon'],
      ['truck', 'Camion'],
      ['moto', 'Moto'],
      ['scooter', 'Scooter'],
      ['trafficlight', 'Feu tricolore'],
      ['signround', 'Panneau rond'],
      ['signsquare', 'Panneau carré'],
      ['signhex', 'Panneau hexagonal'],
      ['signtriangle', 'Panneau triangle'],
      ['signyield', 'Triangle inversé'],
      ['road', 'Route'],
      ['bin', 'Poubelle'],
      ['bench', 'Banc'],
      ['stage', 'Scène'],
      ['spotlight', 'Projecteur'],
    ],
  ],
  [
    'Musique',
    [
      ['note', 'Note'],
      ['notes', 'Double croche'],
      ['trebleclef', 'Clé de sol'],
      ['bassclef', 'Clé de fa'],
      ['mic', 'Micro'],
      ['vinyl', 'Vinyle'],
      ['speaker', 'Enceinte'],
      ['guitar', 'Guitare'],
      ['telecaster', 'Telecaster'],
      ['stratocaster', 'Stratocaster'],
      ['lespaul', 'Les Paul'],
      ['bass', 'Basse'],
      ['doublebass', 'Contrebasse'],
      ['drums', 'Batterie'],
      ['cymbal', 'Cymbale'],
      ['piano', 'Piano'],
      ['synth', 'Synthé'],
    ],
  ],
  [
    'Fête',
    [
      ['speech', 'Bulle'],
      ['ticket', 'Billet'],
      ['banner', 'Ruban'],
      ['seal', 'Sceau'],
      ['balloon', 'Ballon'],
      ['pennant', 'Fanion'],
    ],
  ],
];

type P = [number, number];
const ring = (pts: P[]): Polygon => [[...pts, pts[0]!]];
const rect = (x0: number, y0: number, x1: number, y1: number) =>
  ring([
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ]);
const ellipse = (cx: number, cy: number, rx: number, ry: number, rot = 0, n = 36) =>
  ring(
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      const [u, v] = [Math.cos(a) * rx, Math.sin(a) * ry];
      return [cx + u * Math.cos(rot) - v * Math.sin(rot), cy + u * Math.sin(rot) + v * Math.cos(rot)] as P;
    }),
  );
/** Bande le long d'une courbe de Bézier quadratique, de largeur w(t). */
const band = (a: P, c: P, b: P, w: (t: number) => number, n = 24): Polygon => {
  const left: P[] = [];
  const right: P[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0];
    const y = (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1];
    const dx = 2 * (1 - t) * (c[0] - a[0]) + 2 * t * (b[0] - c[0]);
    const dy = 2 * (1 - t) * (c[1] - a[1]) + 2 * t * (b[1] - c[1]);
    const d = Math.hypot(dx, dy) || 1;
    const k = w(t) / 2;
    left.push([x - (dy / d) * k, y + (dx / d) * k]);
    right.push([x + (dy / d) * k, y - (dx / d) * k]);
  }
  return ring([...left, ...right.reverse()]);
};

type G = Polygon | MultiPolygon;
const union = (...p: G[]): MultiPolygon => polygonClipping.union(p[0]!, ...p.slice(1));
const minus = (g: G, ...holes: G[]): MultiPolygon => (holes.length ? polygonClipping.difference(g, ...holes) : polygonClipping.union(g));
/** Polygone régulier à n côtés. */
const reg = (n: number, r = 1, rot = -Math.PI / 2) => ring(Array.from({ length: n }, (_, i) => [Math.cos(rot + (i * 2 * Math.PI) / n) * r, Math.sin(rot + (i * 2 * Math.PI) / n) * r] as P));
/** Étoile à n branches. */
const starN = (n: number, r1: number, r0: number) =>
  ring(
    Array.from({ length: n * 2 }, (_, i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / n;
      const r = i % 2 ? r0 : r1;
      return [Math.cos(a) * r, Math.sin(a) * r] as P;
    }),
  );
/** Rectangle aux coins arrondis, tracé d'un seul contour (plus robuste qu'une union de pièces). */
const roundRect = (x0: number, y0: number, x1: number, y1: number, r: number): MultiPolygon => {
  const pts: P[] = [];
  const corner = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= 8; i++) {
      const a = a0 + (i / 8) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  corner(x1 - r, y0 + r, -Math.PI / 2);
  corner(x1 - r, y1 - r, 0);
  corner(x0 + r, y1 - r, Math.PI / 2);
  corner(x0 + r, y0 + r, Math.PI);
  return [ring(pts)];
};
const annulus = (r1: number, r0: number, cx = 0, cy = 0) => minus(ellipse(cx, cy, r1, r1, 0, 64), ellipse(cx, cy, r0, r0, 0, 64));

/** Catmull-Rom : points de passage → courbe lisse (ouverte ou fermée). */
function spline(pts: P[], closed: boolean, n = 8): P[] {
  const out: P[] = [];
  const m = pts.length;
  const at = (i: number) => (closed ? pts[(i + m) % m]! : pts[Math.max(0, Math.min(m - 1, i))]!);
  const last = closed ? m : m - 1;
  for (let i = 0; i < last; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let j = 0; j < n; j++) {
      const t = j / n;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!closed) out.push(pts[m - 1]!);
  return out;
}
/** Contour fermé lissé passant par les points donnés. */
const smooth = (pts: P[]) => ring(spline(pts, true));
/** Trait épais le long d'une courbe lisse, de largeur w(t) ; découpé en tronçons pour supporter les boucles. */
function stroke(pts: P[], w: (t: number) => number): MultiPolygon {
  const c = spline(pts, false, 10);
  const parts: Polygon[] = [];
  for (let i = 0; i < c.length - 1; i++) {
    const [a, b] = [c[i]!, c[i + 1]!];
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const d = Math.hypot(dx, dy) || 1;
    const [ka, kb] = [w(i / (c.length - 1)) / 2, w((i + 1) / (c.length - 1)) / 2];
    const [nx, ny] = [-dy / d, dx / d];
    parts.push(
      ring([
        [a[0] + nx * ka, a[1] + ny * ka],
        [b[0] + nx * kb, b[1] + ny * kb],
        [b[0] - nx * kb, b[1] - ny * kb],
        [a[0] - nx * ka, a[1] - ny * ka],
      ]),
    );
    parts.push(ellipse(b[0], b[1], kb, kb, 0, 12));
  }
  return union(...parts);
}
/** Symétrie gauche-droite d'une demi-silhouette décrite de haut en bas côté droit. */
const mirror = (half: P[]): P[] => [
  ...half,
  ...half
    .slice()
    .reverse()
    .map(([x, y]) => [-x, y] as P),
];

/** Rotation d'une géométrie autour d'un point. */
const turn = (g: G, a: number, cx = 0, cy = 0): MultiPolygon => {
  const [c, s] = [Math.cos(a), Math.sin(a)];
  const mp = (typeof g[0]![0]![0] === 'number' ? [g as Polygon] : (g as MultiPolygon)) as MultiPolygon;
  return mp.map((poly) => poly.map((r) => r.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c] as P)));
};
/** Panneau routier : plaque bordée d'un liseré évidé, sur son poteau. */
const sign = (plate: (k: number) => G, cy: number) => union(minus(plate(1), minus(plate(0.86), plate(0.74))), rect(-0.05, cy, 0.05, 1));
/** Roue vue de côté : pneu plein et moyeu évidé. */
const wheel = (cx: number, cy: number, r: number) => minus(ellipse(cx, cy, r, r, 0, 40), ellipse(cx, cy, r * 0.38, r * 0.38, 0, 24));

function build(k: SilhouetteKind): MultiPolygon {
  switch (k) {
    case 'house':
      return minus(
        union(
          ring([
            [0.5, 0.02],
            [0.98, 0.46],
            [0.02, 0.46],
          ]),
          rect(0.12, 0.42, 0.88, 1),
          rect(0.68, 0.1, 0.8, 0.34),
        ),
        rect(0.42, 0.66, 0.58, 1.01),
        rect(0.2, 0.56, 0.34, 0.7),
        rect(0.66, 0.56, 0.8, 0.7),
      );
    case 'building': {
      const holes: Polygon[] = [rect(0.42, 0.89, 0.58, 1.01)];
      for (let r = 0; r < 6; r++) for (let c = 0; c < 3; c++) holes.push(rect(0.2 + c * 0.24, 0.2 + r * 0.115, 0.32 + c * 0.24, 0.27 + r * 0.115));
      return minus(union(rect(0.1, 0.12, 0.9, 1), rect(0.3, 0.05, 0.7, 0.13), rect(0.485, 0, 0.515, 0.06)), ...holes);
    }
    case 'fir':
      return union(
        ring([
          [0.5, 0],
          [0.78, 0.32],
          [0.22, 0.32],
        ]),
        ring([
          [0.5, 0.14],
          [0.9, 0.6],
          [0.1, 0.6],
        ]),
        ring([
          [0.5, 0.36],
          [1, 0.87],
          [0, 0.87],
        ]),
        rect(0.42, 0.85, 0.58, 1),
      );
    case 'mountain':
      // deux sommets, et un sentier de neige ajouré sous le plus haut
      return minus(
        union(
          ring([
            [0, 1],
            [0.3, 0.26],
            [0.42, 0.42],
            [0.62, 0.02],
            [1, 1],
          ]),
        ),
        ring([
          [0.5, 0.3],
          [0.56, 0.36],
          [0.62, 0.3],
          [0.68, 0.37],
          [0.74, 0.3],
          [0.71, 0.27],
          [0.68, 0.32],
          [0.62, 0.25],
          [0.56, 0.31],
          [0.53, 0.27],
        ]),
      );
    case 'palm': {
      const crown: P = [0.47, 0.3];
      const leaf = (tip: P, ctrl: P, w = 0.11) => band(crown, ctrl, tip, (t) => w * Math.sin(Math.PI * Math.min(1, t * 1.05)) + 0.004);
      return union(
        band([0.55, 1], [0.58, 0.62], crown, (t) => 0.085 - 0.035 * t),
        leaf([0.02, 0.5], [0.12, 0.12]),
        leaf([0.12, 0.2], [0.25, 0.06], 0.1),
        leaf([0.5, 0.0], [0.4, 0.04], 0.09),
        leaf([0.86, 0.14], [0.72, 0.04], 0.1),
        leaf([0.98, 0.48], [0.86, 0.12]),
        ellipse(0.43, 0.36, 0.04, 0.04),
        ellipse(0.52, 0.37, 0.04, 0.04),
      );
    }
    case 'flower': {
      const c: P = [0.5, 0.28];
      const petals = Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        return ellipse(c[0] + Math.cos(a) * 0.17, c[1] + Math.sin(a) * 0.12, 0.13, 0.085, a);
      });
      return minus(
        union(
          ...petals,
          ellipse(c[0], c[1], 0.12, 0.09),
          band([0.5, 1], [0.46, 0.7], [0.5, 0.36], () => 0.035),
          band([0.49, 0.78], [0.62, 0.66], [0.8, 0.64], (t) => 0.1 * Math.sin(Math.PI * t) + 0.004),
          band([0.48, 0.86], [0.34, 0.76], [0.18, 0.76], (t) => 0.09 * Math.sin(Math.PI * t) + 0.004),
        ),
        // cœur ajouré
        ellipse(c[0], c[1], 0.055, 0.04),
      );
    }
    case 'car':
      return minus(
        union(
          ring([
            [0.2, 0.44],
            [0.29, 0.12],
            [0.71, 0.12],
            [0.8, 0.44],
          ]),
          rect(0.04, 0.42, 0.96, 0.84),
          rect(0.1, 0.8, 0.27, 1),
          rect(0.73, 0.8, 0.9, 1),
          rect(0.01, 0.34, 0.12, 0.44),
          rect(0.88, 0.34, 0.99, 0.44),
        ),
        ring([
          [0.27, 0.4],
          [0.34, 0.18],
          [0.66, 0.18],
          [0.73, 0.4],
        ]),
        ellipse(0.2, 0.6, 0.075, 0.065),
        ellipse(0.8, 0.6, 0.075, 0.065),
        rect(0.36, 0.6, 0.64, 0.72),
      );
    // --- géométrie ---
    case 'hexagon':
      return union(reg(6, 1, 0));
    case 'pentagon':
      return union(reg(5));
    case 'octagon':
      return union(reg(8, 1, Math.PI / 8));
    case 'diamond':
      return union(
        ring([
          [0, -1],
          [0.7, 0],
          [0, 1],
          [-0.7, 0],
        ]),
      );
    case 'oval':
      return union(ellipse(0, 0, 1, 0.62, 0, 64));
    case 'semicircle':
      return union(ring(Array.from({ length: 33 }, (_, i) => [Math.cos(Math.PI + (i / 32) * Math.PI), Math.sin(Math.PI + (i / 32) * Math.PI)] as P)));
    case 'parallelogram':
      return union(
        ring([
          [0.35, 0],
          [1.35, 0],
          [1, 0.62],
          [0, 0.62],
        ]),
      );
    case 'ring':
      return annulus(1, 0.56);
    case 'cross':
      return union(rect(-0.3, -1, 0.3, 1), rect(-1, -0.3, 1, 0.3));
    case 'heart':
      return union(
        ring(
          Array.from({ length: 96 }, (_, i) => {
            const t = (i / 96) * Math.PI * 2;
            return [16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))] as P;
          }),
        ),
      );
    case 'drop':
      return union(
        ellipse(0, 0.35, 0.62, 0.62, 0, 48),
        ring([
          [0, -1],
          [0.57, 0.12],
          [-0.57, 0.12],
        ]),
      );
    case 'arrow':
      return union(
        ring([
          [0, 0.3],
          [0.6, 0.3],
          [0.6, 0],
          [1.05, 0.5],
          [0.6, 1],
          [0.6, 0.7],
          [0, 0.7],
        ]),
      );
    // --- nature ---
    case 'moon':
      return minus(ellipse(0, 0, 1, 1, 0, 64), ellipse(0.48, -0.22, 0.86, 0.86, 0, 64));
    case 'sun':
      return union(
        ellipse(0, 0, 0.56, 0.56, 0, 48),
        ...Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          const d = 0.13;
          return ring([
            [Math.cos(a - d) * 0.68, Math.sin(a - d) * 0.68],
            [Math.cos(a) * 1, Math.sin(a) * 1],
            [Math.cos(a + d) * 0.68, Math.sin(a + d) * 0.68],
          ]);
        }),
      );
    case 'cloud':
      return union(ellipse(-0.58, 0.14, 0.44, 0.36), ellipse(0, -0.12, 0.56, 0.5), ellipse(0.58, 0.12, 0.42, 0.38), roundRect(-0.98, 0.05, 0.98, 0.5, 0.22));
    case 'lightning':
      return union(
        ring([
          [0.58, 0],
          [0.1, 0.56],
          [0.42, 0.56],
          [0.24, 1],
          [0.86, 0.38],
          [0.53, 0.38],
          [0.78, 0],
        ]),
      );
    case 'wave': {
      const top: P[] = Array.from({ length: 61 }, (_, i) => {
        const x = (i / 60) * 2.6;
        return [x, 0.32 - 0.22 * Math.sin((x / 1.3) * Math.PI * 2 + 0.4) - 0.06 * Math.sin((x / 0.65) * Math.PI * 2)] as P;
      });
      return union(ring([...top, [2.6, 1], [0, 1]]));
    }
    case 'leaf':
      return minus(
        union(
          band([0, 1], [0.05, 0], [0, -1], (t) => 1.05 * Math.sin(Math.PI * t) + 0.01, 40),
          band([0, 0.95], [0.02, 1.12], [0.1, 1.3], () => 0.07),
        ),
        band([0, 0.8], [0.03, 0], [0, -0.7], () => 0.04),
      );
    case 'tree':
      return union(ellipse(0, -0.42, 0.62, 0.56), ellipse(-0.38, -0.08, 0.4, 0.36), ellipse(0.38, -0.08, 0.4, 0.36), rect(-0.09, 0.1, 0.09, 0.95));
    case 'cactus':
      return union(roundRect(-0.17, -1, 0.17, 1, 0.17), roundRect(-0.62, -0.45, -0.38, 0.12, 0.12), roundRect(-0.62, -0.06, 0, 0.14, 0.1), roundRect(0.38, -0.7, 0.62, -0.08, 0.12), roundRect(0, -0.28, 0.62, -0.08, 0.1));
    // --- ville : véhicules de profil, mobilier, panneaux ---
    case 'van':
      return union(
        minus(
          ring([
            [-1, 0.36],
            [-1, -0.4],
            [-0.95, -0.46],
            [0.38, -0.46],
            [0.46, -0.42],
            [0.74, -0.08],
            [0.96, -0.02],
            [1, 0.04],
            [1, 0.36],
          ]),
          ellipse(-0.6, 0.38, 0.25, 0.25),
          ellipse(0.6, 0.38, 0.25, 0.25),
          ring([
            [0.4, -0.38],
            [0.48, -0.36],
            [0.68, -0.08],
            [0.4, -0.08],
          ]),
          rect(-0.06, -0.38, 0.32, -0.08),
        ),
        wheel(-0.6, 0.38, 0.2),
        wheel(0.6, 0.38, 0.2),
      );
    case 'truck':
      return union(
        roundRect(-1, -0.66, 0.36, 0.2, 0.03),
        minus(
          ring([
            [0.42, -0.42],
            [0.74, -0.42],
            [0.98, -0.04],
            [1, 0.3],
            [0.42, 0.3],
          ]),
          ring([
            [0.5, -0.34],
            [0.7, -0.34],
            [0.86, -0.08],
            [0.5, -0.08],
          ]),
          ellipse(0.72, 0.34, 0.2, 0.2),
        ),
        minus(rect(-1, 0.18, 0.44, 0.3), ellipse(-0.72, 0.34, 0.2, 0.2), ellipse(-0.3, 0.34, 0.2, 0.2)),
        wheel(-0.72, 0.34, 0.16),
        wheel(-0.3, 0.34, 0.16),
        wheel(0.72, 0.34, 0.16),
      );
    case 'moto':
      return union(
        minus(ellipse(-0.66, 0.3, 0.32, 0.32, 0, 40), ellipse(-0.66, 0.3, 0.22, 0.22, 0, 40)),
        minus(ellipse(0.66, 0.3, 0.32, 0.32, 0, 40), ellipse(0.66, 0.3, 0.22, 0.22, 0, 40)),
        ellipse(-0.66, 0.3, 0.07, 0.07),
        ellipse(0.66, 0.3, 0.07, 0.07),
        // réservoir, selle et moteur
        smooth([
          [-0.58, -0.14],
          [-0.2, -0.16],
          [0.02, -0.3],
          [0.3, -0.3],
          [0.4, -0.16],
          [0.2, 0.0],
          [0.12, 0.26],
          [-0.18, 0.28],
          [-0.3, 0.06],
          [-0.6, 0.02],
        ]),
        band([-0.66, 0.3], [-0.4, 0.2], [-0.12, 0.14], () => 0.07),
        band([0.66, 0.3], [0.52, -0.05], [0.4, -0.42], () => 0.06),
        rect(0.28, -0.48, 0.52, -0.42),
        band([-0.1, 0.24], [-0.4, 0.3], [-0.78, 0.12], () => 0.05),
      );
    case 'scooter':
      return union(
        wheel(-0.62, 0.42, 0.22),
        wheel(0.6, 0.42, 0.22),
        smooth([
          [-0.9, 0.12],
          [-0.86, -0.16],
          [-0.56, -0.24],
          [-0.24, -0.16],
          [-0.16, 0.12],
          [0.3, 0.14],
          [0.42, 0.24],
          [0.2, 0.3],
          [-0.36, 0.32],
          [-0.84, 0.3],
        ]),
        roundRect(-0.72, -0.34, -0.22, -0.2, 0.06),
        ring([
          [0.26, 0.2],
          [0.5, -0.46],
          [0.6, -0.44],
          [0.46, 0.24],
        ]),
        band([0.6, 0.42], [0.58, 0.1], [0.5, -0.2], () => 0.07),
        rect(0.36, -0.6, 0.7, -0.53),
        ellipse(0.74, -0.38, 0.06, 0.05),
      );
    case 'trafficlight':
      return union(
        minus(roundRect(-0.3, -1, 0.3, 0.32, 0.12), ...[-0.76, -0.34, 0.08].map((y) => ellipse(0, y, 0.16, 0.16))),
        ...[-0.76, -0.34, 0.08].map((y) => ellipse(0, y, 0.1, 0.1)),
        rect(-0.06, 0.3, 0.06, 1),
        rect(-0.22, 0.94, 0.22, 1),
      );
    case 'signround':
      return sign((k) => ellipse(0, -0.5, 0.5 * k, 0.5 * k, 0, 48), 0);
    case 'signsquare':
      return sign((k) => roundRect(-0.48 * k, -0.5 - 0.48 * k, 0.48 * k, -0.5 + 0.48 * k, 0.12 * k), 0);
    case 'signhex':
      return sign((k) => turn(reg(6, 0.52 * k), Math.PI / 6).map((p) => p.map((r) => r.map(([x, y]) => [x, y - 0.5] as P))), 0);
    case 'signtriangle':
      return sign((k) => reg(3, 0.6 * k).map((r) => r.map(([x, y]) => [x, y - 0.42 + 0.15 * (1 - k)] as P)), 0);
    case 'signyield':
      return sign((k) => reg(3, 0.6 * k, Math.PI / 2).map((r) => r.map(([x, y]) => [x, y - 0.6 - 0.15 * (1 - k)] as P)), -0.3);
    case 'road': {
      const at = (t: number, s: number): P => [s * (0.08 + 0.92 * t), -1 + 2 * t];
      const dashes: G[] = [];
      for (const [a, b] of [
        [0.02, 0.1],
        [0.18, 0.3],
        [0.4, 0.56],
        [0.68, 0.9],
      ])
        dashes.push(ring([at(a!, 0.06), at(b!, 0.06), at(b!, -0.06), at(a!, -0.06)]));
      return minus(ring([at(0, -1), at(0, 1), at(1, 1), at(1, -1)]), ...dashes);
    }
    case 'bin':
      return minus(
        union(
          roundRect(-0.6, -0.86, 0.6, -0.68, 0.04),
          roundRect(-0.16, -1, 0.16, -0.82, 0.05),
          ring([
            [-0.52, -0.62],
            [0.52, -0.62],
            [0.44, 1],
            [-0.44, 1],
          ]),
        ),
        rect(-0.08, -0.94, 0.08, -0.86),
        ...[-0.24, 0, 0.24].map((x) => roundRect(x - 0.045, -0.44, x + 0.045, 0.8, 0.04)),
      );
    case 'bench':
      return union(
        ...[-0.62, -0.42].map((y) => rect(-1, y, 1, y + 0.14)),
        rect(-1, 0.02, 1, 0.16),
        rect(-0.96, 0.2, 1, 0.3).map((r) => r.map(([x, y]) => [x * 0.98, y] as P)),
        rect(-0.86, -0.7, -0.76, 0.7),
        rect(0.76, -0.7, 0.86, 0.7),
        rect(-0.86, 0.6, -0.6, 0.7),
        rect(0.6, 0.6, 0.86, 0.7),
      );
    case 'stage': {
      const scallops = Array.from({ length: 7 }, (_, i) => ellipse(-0.6 + i * 0.2, -0.62, 0.1, 0.08));
      return union(
        minus(rect(-1, -0.9, 1, 0.8), rect(-0.8, -0.66, 0.8, 0.44)),
        ...scallops,
        // rideaux noués de chaque côté
        smooth([
          [-0.8, -0.66],
          [-0.52, -0.66],
          [-0.6, -0.2],
          [-0.66, 0.0],
          [-0.58, 0.44],
          [-0.8, 0.44],
        ]),
        smooth([
          [0.8, -0.66],
          [0.52, -0.66],
          [0.6, -0.2],
          [0.66, 0.0],
          [0.58, 0.44],
          [0.8, 0.44],
        ]),
        rect(-1.08, 0.44, 1.08, 0.56),
      );
    }
    case 'spotlight':
      return union(
        turn(union(roundRect(-0.42, -0.24, 0.36, 0.24, 0.08), rect(0.32, -0.32, 0.48, 0.32), rect(-0.54, -0.14, -0.4, 0.14)), 0.45, 0, 0),
        // lyre et pied
        band([-0.42, 0.04], [0.0, 0.86], [0.42, 0.04], () => 0.08),
        rect(-0.04, 0.44, 0.04, 0.9),
        roundRect(-0.36, 0.88, 0.36, 0.98, 0.04),
        // faisceau
        turn(
          ring([
            [0.56, -0.26],
            [1.3, -0.6],
            [1.3, 0.6],
            [0.56, 0.26],
          ]),
          0.45,
          0,
          0,
        ),
      );
    // --- musique ---
    case 'note':
      return union(
        ellipse(0, 0.74, 0.34, 0.24, -0.35),
        rect(0.24, -0.92, 0.33, 0.7),
        band([0.285, -0.92], [0.62, -0.62], [0.6, -0.12], (t) => 0.24 * (1 - t) + 0.05),
      );
    case 'notes':
      return union(
        ellipse(-0.42, 0.8, 0.3, 0.21, -0.35),
        ellipse(0.5, 0.64, 0.3, 0.21, -0.35),
        rect(-0.21, -0.78, -0.13, 0.76),
        rect(0.71, -0.95, 0.79, 0.6),
        ring([
          [-0.21, -0.78],
          [0.79, -0.95],
          [0.79, -0.74],
          [-0.21, -0.57],
        ]),
      );
    case 'guitar':
      return minus(union(ellipse(0, 0.55, 0.56, 0.46), ellipse(0, -0.02, 0.42, 0.36), rect(-0.07, -1.45, 0.07, 0), roundRect(-0.14, -1.72, 0.14, -1.38, 0.05)), ellipse(0, 0.18, 0.15, 0.15), rect(-0.2, 0.62, 0.2, 0.68));
    case 'mic':
      return minus(
        union(
          ellipse(0, -0.55, 0.38, 0.42),
          ring([
            [-0.24, -0.18],
            [0.24, -0.18],
            [0.12, 0.95],
            [-0.12, 0.95],
          ]),
        ),
        rect(-0.4, -0.5, 0.4, -0.44),
        rect(-0.4, -0.68, 0.4, -0.62),
      );
    case 'vinyl':
      return minus(ellipse(0, 0, 1, 1, 0, 72), annulus(0.84, 0.8), annulus(0.68, 0.64), ellipse(0, 0, 0.06, 0.06));
    case 'speaker':
      return union(minus(roundRect(-0.62, -1, 0.62, 1, 0.12), ellipse(0, 0.34, 0.4, 0.4, 0, 48), ellipse(0, -0.56, 0.18, 0.18)), ellipse(0, 0.34, 0.16, 0.16), ellipse(0, -0.56, 0.06, 0.06));
    case 'trebleclef':
      return union(
        stroke(
          [
            [0.06, 0.42],
            [0.16, 0.28],
            [0.04, 0.14],
            [-0.2, 0.22],
            [-0.32, 0.48],
            [-0.16, 0.76],
            [0.14, 0.8],
            [0.36, 0.56],
            [0.33, 0.22],
            [0.12, -0.04],
            [-0.14, -0.3],
            [-0.26, -0.62],
            [-0.16, -0.98],
            [0.04, -1.22],
            [0.13, -1.02],
            [0.05, -0.68],
            [-0.02, -0.28],
            [0.02, 0.24],
            [0.06, 0.72],
            [0.07, 1.02],
            [-0.02, 1.2],
            [-0.18, 1.16],
          ],
          (t) => 0.06 + 0.11 * Math.exp(-(((t - 0.24) / 0.12) ** 2)) + 0.06 * Math.exp(-(((t - 0.52) / 0.08) ** 2)),
        ),
        ellipse(-0.18, 1.06, 0.11, 0.11),
      );
    case 'bassclef':
      return union(
        ellipse(-0.42, -0.28, 0.17, 0.17),
        stroke(
          [
            [-0.52, -0.34],
            [-0.34, -0.6],
            [0.02, -0.66],
            [0.3, -0.44],
            [0.32, -0.04],
            [0.1, 0.4],
            [-0.24, 0.74],
            [-0.56, 0.92],
          ],
          (t) => 0.05 + 0.13 * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (1 - 0.6 * t),
        ),
        ellipse(0.58, -0.42, 0.08, 0.08),
        ellipse(0.58, 0.04, 0.08, 0.08),
      );
    case 'telecaster':
      return minus(
        union(
          smooth([
            [-0.08, -0.02],
            [-0.3, -0.08],
            [-0.44, 0.04],
            [-0.42, 0.28],
            [-0.56, 0.56],
            [-0.46, 0.86],
            [0, 0.96],
            [0.46, 0.86],
            [0.56, 0.56],
            [0.44, 0.32],
            [0.4, 0.16],
            [0.26, 0.12],
            [0.1, 0.06],
          ]),
          rect(-0.075, -1.02, 0.075, 0.2),
          smooth([
            [0.06, -1.008],
            [0.07, -1.318],
            [0.0, -1.368],
            [-0.12, -1.343],
            [-0.17, -1.269],
            [-0.13, -1.17],
            [-0.06, -1.033],
          ]),
        ),
        rect(-0.13, 0.62, 0.15, 0.7),
        rect(-0.1, 0.24, 0.1, 0.3),
      );
    case 'stratocaster':
      return minus(
        union(
          smooth([
            [-0.08, 0.02],
            [-0.2, -0.06],
            [-0.3, -0.36],
            [-0.4, -0.32],
            [-0.45, 0.0],
            [-0.42, 0.26],
            [-0.57, 0.56],
            [-0.46, 0.86],
            [0, 0.96],
            [0.46, 0.86],
            [0.57, 0.56],
            [0.44, 0.26],
            [0.45, 0.04],
            [0.32, -0.2],
            [0.22, -0.16],
            [0.1, 0.04],
          ]),
          rect(-0.075, -1.03, 0.075, 0.2),
          smooth([
            [0.06, -1.021],
            [0.1, -1.095],
            [0.03, -1.182],
            [0.05, -1.306],
            [-0.06, -1.38],
            [-0.19, -1.331],
            [-0.21, -1.194],
            [-0.11, -1.095],
            [-0.06, -1.021],
          ]),
        ),
        rect(-0.1, 0.22, 0.1, 0.27),
        rect(-0.1, 0.38, 0.1, 0.43),
        rect(-0.12, 0.54, 0.1, 0.59),
      );
    case 'lespaul':
      return minus(
        union(
          smooth([
            [-0.07, 0.0],
            [-0.3, -0.04],
            [-0.44, 0.12],
            [-0.4, 0.32],
            [-0.56, 0.58],
            [-0.46, 0.88],
            [0, 0.98],
            [0.46, 0.88],
            [0.56, 0.58],
            [0.42, 0.36],
            [0.36, 0.16],
            [0.24, -0.02],
            [0.17, 0.0],
            [0.1, 0.08],
          ]),
          rect(-0.075, -1.0, 0.075, 0.2),
          ring([
            [0.075, -0.996],
            [0.17, -1.269],
            [0.12, -1.331],
            [0.0, -1.294],
            [-0.12, -1.331],
            [-0.17, -1.269],
            [-0.075, -0.996],
          ]),
        ),
        rect(-0.13, 0.22, 0.13, 0.32),
        rect(-0.13, 0.48, 0.13, 0.58),
      );
    case 'bass': {
      const pegs = [0, 1, 2, 3].map((i) => ellipse(-0.24, -1.48 + i * 0.085, 0.04, 0.04));
      return minus(
        union(
          smooth([
            [-0.08, 0.02],
            [-0.2, -0.08],
            [-0.28, -0.46],
            [-0.4, -0.42],
            [-0.46, 0.0],
            [-0.42, 0.26],
            [-0.58, 0.56],
            [-0.46, 0.88],
            [0, 0.98],
            [0.46, 0.88],
            [0.58, 0.56],
            [0.44, 0.28],
            [0.46, 0.06],
            [0.34, -0.2],
            [0.22, -0.16],
            [0.1, 0.04],
          ]),
          rect(-0.07, -1.25, 0.07, 0.2),
          smooth([
            [0.065, -1.244],
            [0.08, -1.343],
            [0.02, -1.43],
            [0.04, -1.529],
            [-0.06, -1.591],
            [-0.19, -1.542],
            [-0.2, -1.368],
            [-0.1, -1.306],
            [-0.065, -1.244],
          ]),
          ...pegs,
          ...[0, 1, 2, 3].map((i) => rect(-0.24, -1.5 + i * 0.085, -0.15, -1.46 + i * 0.085)),
        ),
        rect(-0.12, 0.34, 0.12, 0.42),
        rect(-0.11, 0.62, 0.11, 0.68),
      );
    }
    case 'doublebass':
      return minus(
        union(
          smooth(
            mirror([
              [0.08, -0.52],
              [0.3, -0.42],
              [0.4, -0.16],
              [0.28, 0.1],
              [0.28, 0.26],
              [0.5, 0.5],
              [0.52, 0.84],
              [0.3, 1.04],
              [0.02, 1.08],
            ]),
          ),
          rect(-0.05, -1.42, 0.05, -0.44),
          roundRect(-0.07, -1.62, 0.07, -1.38, 0.05),
          ellipse(0.03, -1.66, 0.09, 0.1),
          rect(-0.015, 1.04, 0.015, 1.3),
          ...[0, 1].flatMap((i) => [rect(-0.15, -1.58 + i * 0.12, 0.15, -1.55 + i * 0.12)]),
        ),
        band([0.2, 0.18], [0.12, 0.4], [0.2, 0.64], () => 0.035),
        band([-0.2, 0.18], [-0.12, 0.4], [-0.2, 0.64], () => 0.035),
        ellipse(0.03, -1.66, 0.035, 0.035),
      );
    case 'drums':
      return union(
        // grosse caisse et son cercle
        minus(ellipse(0, 0.42, 0.44, 0.44, 0, 56), annulus(0.37, 0.33, 0, 0.42), ellipse(0, 0.42, 0.1, 0.1)),
        // toms sur la grosse caisse
        roundRect(-0.42, -0.24, -0.06, 0.02, 0.04),
        roundRect(0.06, -0.24, 0.42, 0.02, 0.04),
        rect(-0.03, -0.05, 0.03, 0.1),
        // caisse claire à gauche, tom basse à droite
        roundRect(-0.9, 0.04, -0.5, 0.22, 0.03),
        rect(-0.72, 0.2, -0.68, 0.86),
        roundRect(0.52, 0.14, 0.92, 0.6, 0.04),
        rect(0.55, 0.58, 0.59, 0.86),
        rect(0.85, 0.58, 0.89, 0.86),
        // cymbales sur pied
        ellipse(-0.84, -0.42, 0.3, 0.045, -0.12),
        rect(-0.86, -0.42, -0.82, 0.86),
        ellipse(0.8, -0.6, 0.32, 0.05, 0.14),
        rect(0.78, -0.6, 0.82, 0.14),
        // sol
        roundRect(-1.0, 0.84, 1.0, 0.9, 0.03),
      );
    case 'cymbal':
      return union(
        ellipse(0, -0.42, 0.95, 0.12, -0.1, 48),
        ellipse(-0.01, -0.53, 0.18, 0.1),
        rect(-0.025, -0.6, 0.025, 0.72),
        rect(-0.045, 0.1, 0.045, 0.18),
        band([0, 0.66], [-0.2, 0.74], [-0.5, 0.98], () => 0.04),
        band([0, 0.66], [0.2, 0.74], [0.5, 0.98], () => 0.04),
        rect(-0.02, 0.66, 0.02, 0.98),
      );
    case 'piano':
      return union(
        // caisse vue de côté, couvercle ouvert sur sa béquille
        roundRect(-0.95, -0.06, 0.94, 0.22, 0.07),
        ring([
          [-0.78, -0.12],
          [0.92, -0.12],
          [0.8, -0.78],
        ]),
        rect(0.3, -0.4, 0.33, -0.06),
        rect(-1.06, -0.02, -0.9, 0.1),
        rect(-0.88, 0.2, -0.78, 0.82),
        rect(0.72, 0.18, 0.82, 0.82),
        rect(-0.12, 0.2, -0.08, 0.66),
        roundRect(-0.2, 0.62, 0.0, 0.7, 0.02),
      );
    case 'synth': {
      const keys: G[] = [];
      const n = 14;
      const [x0, x1, y0, y1] = [-0.92, 0.92, -0.02, 0.36];
      const kw = (x1 - x0) / n;
      for (let i = 1; i < n; i++) keys.push(rect(x0 + i * kw - 0.008, y0, x0 + i * kw + 0.008, y1));
      // touches noires : motif 2 + 3 sur deux octaves
      [1, 2, 4, 5, 6, 8, 9, 11, 12, 13].forEach((i) => keys.push(rect(x0 + i * kw - kw * 0.3, y0, x0 + i * kw + kw * 0.3, y0 + (y1 - y0) * 0.6)));
      return union(minus(roundRect(-1, -0.42, 1, 0.44, 0.08), rect(x0, y0, x1, y1), ...[-0.72, -0.52, -0.32].map((x) => ellipse(x, -0.22, 0.07, 0.07)), roundRect(0.18, -0.32, 0.86, -0.12, 0.03)), ...keys);
    }
    // --- fête ---
    case 'speech':
      return union(
        roundRect(-1, -0.7, 1, 0.48, 0.32),
        ring([
          [-0.55, 0.3],
          [-0.12, 0.3],
          [-0.72, 0.95],
        ]),
      );
    case 'ticket': {
      const holes: G[] = [ellipse(-1, 0, 0.17, 0.17), ellipse(1, 0, 0.17, 0.17)];
      for (let y = -0.42; y < 0.4; y += 0.15) holes.push(rect(0.42, y, 0.47, y + 0.08));
      return minus(rect(-1, -0.5, 1, 0.5), ...holes);
    }
    case 'banner':
      return union(
        rect(-0.72, -0.26, 0.72, 0.24),
        ring([
          [-1, -0.08],
          [-0.62, -0.08],
          [-0.62, 0.42],
          [-1, 0.42],
          [-0.86, 0.17],
        ]),
        ring([
          [1, -0.08],
          [0.62, -0.08],
          [0.62, 0.42],
          [1, 0.42],
          [0.86, 0.17],
        ]),
      );
    case 'seal':
      return union(starN(24, 1, 0.86));
    case 'balloon':
      return union(
        ellipse(0, -0.3, 0.6, 0.72, 0, 48),
        ring([
          [-0.08, 0.4],
          [0.08, 0.4],
          [0.13, 0.52],
          [-0.13, 0.52],
        ]),
        band([0, 0.5], [0.18, 0.8], [-0.04, 1.15], () => 0.035),
      );
    case 'pennant':
      return union(
        rect(-0.05, -1, 0.04, 1),
        ring([
          [0.04, -1],
          [0.95, -0.74],
          [0.04, -0.44],
        ]),
      );
  }
}

const cache = new Map<SilhouetteKind, { rings: Pt[][]; ratio: number }>();
/** Silhouette ramenée à sa boîte : contours en 0..1 et proportions (largeur / hauteur). */
function shapeOf(k: SilhouetteKind) {
  let c = cache.get(k);
  if (!c) {
    // les premières silhouettes sont dessinées dans un carré : on leur rend leurs proportions
    const sx = k in LEGACY ? LEGACY[k as keyof typeof LEGACY] : 1;
    const raw = build(k).flatMap((poly) => poly.map((r) => r.slice(0, -1).map(([x, y]) => [x * sx, y] as P)));
    const xs = raw.flat().map((p) => p[0]);
    const ys = raw.flat().map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const [w, h] = [x1 - x0 || 1, y1 - y0 || 1];
    c = { rings: raw.map((r) => r.map(([x, y]) => ({ x: (x - x0) / w, y: (y - y0) / h }))), ratio: w / h };
    cache.set(k, c);
  }
  return c;
}

/** Contours de la silhouette (extérieurs et ouvertures), à remplir en pair-impair. */
export const silhouetteRings = (k: SilhouetteKind): Pt[][] => shapeOf(k).rings;
/** Proportions de la boîte à la pose. */
export const silhouetteRatio = (k: SilhouetteKind): number => shapeOf(k).ratio;

export const isSilhouette = (k: string): k is SilhouetteKind => k in LEGACY || (NEW as readonly string[]).includes(k);
