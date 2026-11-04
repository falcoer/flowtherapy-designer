import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping';
import type { Pt } from './model';

/** Silhouettes figuratives : unions de pièces simples moins leurs ouvertures, en coordonnées 0..1 de la boîte. */
export type SilhouetteKind = 'house' | 'building' | 'fir' | 'mountain' | 'palm' | 'flower' | 'car';

/** Proportions de la boîte (largeur / hauteur) à la pose. */
export const SILHOUETTE_RATIO: Record<SilhouetteKind, number> = {
  house: 1,
  building: 0.55,
  fir: 0.72,
  mountain: 1.6,
  palm: 0.8,
  flower: 0.62,
  car: 1.35,
};

type P = [number, number];
const ring = (pts: P[]): Polygon => [[...pts, pts[0]!]];
const rect = (x0: number, y0: number, x1: number, y1: number) => ring([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
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

const union = (...p: Polygon[]): MultiPolygon => polygonClipping.union(p[0]!, ...p.slice(1));
const minus = (g: MultiPolygon, ...holes: Polygon[]): MultiPolygon => (holes.length ? polygonClipping.difference(g, ...holes) : g);

function build(k: SilhouetteKind): MultiPolygon {
  switch (k) {
    case 'house':
      return minus(
        union(ring([[0.5, 0.02], [0.98, 0.46], [0.02, 0.46]]), rect(0.12, 0.42, 0.88, 1), rect(0.68, 0.1, 0.8, 0.34)),
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
        ring([[0.5, 0], [0.78, 0.32], [0.22, 0.32]]),
        ring([[0.5, 0.14], [0.9, 0.6], [0.1, 0.6]]),
        ring([[0.5, 0.36], [1, 0.87], [0, 0.87]]),
        rect(0.42, 0.85, 0.58, 1),
      );
    case 'mountain':
      // deux sommets, et un sentier de neige ajouré sous le plus haut
      return minus(
        union(ring([[0, 1], [0.3, 0.26], [0.42, 0.42], [0.62, 0.02], [1, 1]])),
        ring([[0.5, 0.3], [0.56, 0.36], [0.62, 0.3], [0.68, 0.37], [0.74, 0.3], [0.71, 0.27], [0.68, 0.32], [0.62, 0.25], [0.56, 0.31], [0.53, 0.27]]),
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
          ring([[0.2, 0.44], [0.29, 0.12], [0.71, 0.12], [0.8, 0.44]]),
          rect(0.04, 0.42, 0.96, 0.84),
          rect(0.1, 0.8, 0.27, 1),
          rect(0.73, 0.8, 0.9, 1),
          rect(0.01, 0.34, 0.12, 0.44),
          rect(0.88, 0.34, 0.99, 0.44),
        ),
        ring([[0.27, 0.4], [0.34, 0.18], [0.66, 0.18], [0.73, 0.4]]),
        ellipse(0.2, 0.6, 0.075, 0.065),
        ellipse(0.8, 0.6, 0.075, 0.065),
        rect(0.36, 0.6, 0.64, 0.72),
      );
  }
}

const cache = new Map<SilhouetteKind, Pt[][]>();
/** Contours de la silhouette (extérieurs et ouvertures), à remplir en pair-impair. */
export function silhouetteRings(k: SilhouetteKind): Pt[][] {
  let r = cache.get(k);
  if (!r) {
    r = build(k).flatMap((poly) => poly.map((ring) => ring.slice(0, -1).map(([x, y]) => ({ x, y }))));
    cache.set(k, r);
  }
  return r;
}

export const isSilhouette = (k: string): k is SilhouetteKind => k in SILHOUETTE_RATIO;
