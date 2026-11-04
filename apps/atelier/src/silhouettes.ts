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
    ],
  ],
  [
    'Musique',
    [
      ['note', 'Note'],
      ['notes', 'Double croche'],
      ['guitar', 'Guitare'],
      ['mic', 'Micro'],
      ['vinyl', 'Vinyle'],
      ['speaker', 'Enceinte'],
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
const roundRect = (x0: number, y0: number, x1: number, y1: number, r: number) =>
  union(rect(x0 + r, y0, x1 - r, y1), rect(x0, y0 + r, x1, y1 - r), ellipse(x0 + r, y0 + r, r, r), ellipse(x1 - r, y0 + r, r, r), ellipse(x1 - r, y1 - r, r, r), ellipse(x0 + r, y1 - r, r, r));
const annulus = (r1: number, r0: number, cx = 0, cy = 0) => minus(ellipse(cx, cy, r1, r1, 0, 64), ellipse(cx, cy, r0, r0, 0, 64));

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
