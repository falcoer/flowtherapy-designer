import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping';
import type { Pt } from './model';

/**
 * Découpe : un tracé SVG (attribut `d`) en coordonnées de la couche (0..1 sur
 * sa boîte), rempli selon la règle pair-impair pour permettre les trous et les
 * morceaux séparés. Les courbes passent par les points du tracé (Catmull-Rom
 * converti en Bézier cubiques) et les angles vifs sont conservés.
 */

export type Ring = Pt[];

/** Ramer-Douglas-Peucker sur un contour fermé : garde les points qui comptent. */
export function simplifyRing(pts: Ring, eps: number): Ring {
  if (pts.length < 4) return pts.slice();
  // on coupe le contour au point le plus éloigné du premier pour le traiter ouvert
  let far = 0;
  let best = -1;
  pts.forEach((p, i) => {
    const d = Math.hypot(p.x - pts[0]!.x, p.y - pts[0]!.y);
    if (d > best) [best, far] = [d, i];
  });
  const a = rdp(pts.slice(0, far + 1), eps);
  const b = rdp([...pts.slice(far), pts[0]!], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

function rdp(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts.slice();
  const a = pts[0]!;
  const b = pts[pts.length - 1]!;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1e-12;
  let idx = 0;
  let max = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const d = Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
    if (d > max) [max, idx] = [d, i];
  }
  if (max <= eps) return [a, b];
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

/**
 * Contours → tracé SVG lissé. Un point est un angle vif quand le tracé y
 * tourne de plus de `corner` degrés : il reste pointu, le reste devient courbe.
 */
export function ringsToPath(rings: Ring[], eps = 0.002, corner = 48): string {
  const out: string[] = [];
  for (const raw of rings) {
    const pts = despike(simplifyRing(dedupe(raw), eps));
    const n = pts.length;
    if (n < 3 || polyArea(pts) < eps * eps * 4) continue;
    const P = (i: number) => pts[((i % n) + n) % n]!;
    const sharp = pts.map((_, i) => turn(P(i - 1), P(i), P(i + 1)) > corner);
    out.push(`M${r4(P(0).x)} ${r4(P(0).y)}`);
    for (let i = 0; i < n; i++) {
      const a = P(i);
      const b = P(i + 1);
      if (sharp[i] && sharp[(i + 1) % n]) {
        out.push(`L${r4(b.x)} ${r4(b.y)}`);
        continue;
      }
      // un angle vif sert de voisin à lui-même : la tangente part droit vers le segment
      const p0 = sharp[i] ? a : P(i - 1);
      const p3 = sharp[(i + 1) % n] ? b : P(i + 2);
      const c1 = { x: a.x + (b.x - p0.x) / 6, y: a.y + (b.y - p0.y) / 6 };
      const c2 = { x: b.x - (p3.x - a.x) / 6, y: b.y - (p3.y - a.y) / 6 };
      out.push(`C${r4(c1.x)} ${r4(c1.y)} ${r4(c2.x)} ${r4(c2.y)} ${r4(b.x)} ${r4(b.y)}`);
    }
    out.push('Z');
  }
  return out.join('');
}

/** Retire les aiguilles : un point où le contour fait presque demi-tour. */
function despike(pts: Ring): Ring {
  const o = pts.slice();
  for (let guard = 0; guard < 3 && o.length > 3; guard++) {
    let removed = false;
    for (let i = 0; i < o.length && o.length > 3; i++) {
      const a = o[(i - 1 + o.length) % o.length]!;
      const c = o[(i + 1) % o.length]!;
      if (turn(a, o[i]!, c) > 165) {
        o.splice(i, 1);
        removed = true;
        i--;
      }
    }
    if (!removed) break;
  }
  return o;
}

function polyArea(r: Ring): number {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j]!.x + r[i]!.x) * (r[j]!.y - r[i]!.y);
  return Math.abs(s / 2);
}

function dedupe(pts: Ring): Ring {
  const o: Ring = [];
  for (const p of pts) {
    const q = o[o.length - 1];
    if (!q || Math.abs(p.x - q.x) > 1e-7 || Math.abs(p.y - q.y) > 1e-7) o.push({ x: p.x, y: p.y });
  }
  if (o.length > 1 && Math.abs(o[0]!.x - o[o.length - 1]!.x) < 1e-7 && Math.abs(o[0]!.y - o[o.length - 1]!.y) < 1e-7) o.pop();
  return o;
}

/** Angle de virage en un point, en degrés (0 = tout droit). */
function turn(a: Pt, b: Pt, c: Pt): number {
  const u = Math.atan2(b.y - a.y, b.x - a.x);
  const v = Math.atan2(c.y - b.y, c.x - b.x);
  let d = Math.abs(v - u);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return (d * 180) / Math.PI;
}

const flatCache = new Map<string, Ring[]>();
/** Tracé SVG (M, L, C, Z) → contours polygonaux, pour les calculs. */
export function pathToRings(d: string, steps = 10): Ring[] {
  const hit = flatCache.get(d);
  if (hit) return hit;
  const rings: Ring[] = [];
  let cur: Ring = [];
  const tok = d.match(/[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  let i = 0;
  const num = () => Number(tok[i++]);
  while (i < tok.length) {
    const c = tok[i++]!.toUpperCase();
    if (c === 'M') {
      if (cur.length) rings.push(cur);
      cur = [{ x: num(), y: num() }];
    } else if (c === 'L') cur.push({ x: num(), y: num() });
    else if (c === 'C') {
      const a = cur[cur.length - 1]!;
      const [x1, y1, x2, y2, x, y] = [num(), num(), num(), num(), num(), num()];
      for (let k = 1; k <= steps; k++) {
        const t = k / steps;
        const m = 1 - t;
        cur.push({
          x: m * m * m * a.x + 3 * m * m * t * x1 + 3 * m * t * t * x2 + t * t * t * x,
          y: m * m * m * a.y + 3 * m * m * t * y1 + 3 * m * t * t * y2 + t * t * t * y,
        });
      }
    } else if (c === 'Z') {
      if (cur.length) rings.push(dedupe(cur));
      cur = [];
    }
  }
  if (cur.length) rings.push(cur);
  if (flatCache.size > 400) flatCache.clear();
  flatCache.set(d, rings);
  return rings;
}

/** Contours pair-impair → géométrie propre (contours extérieurs et trous). */
function geom(rings: Ring[]): MultiPolygon {
  const polys: Polygon[] = rings.filter((r) => r.length >= 3).map((r) => [r.map((p) => [p.x, p.y] as [number, number])]);
  if (!polys.length) return [];
  const [first, ...rest] = polys;
  return rest.length ? polygonClipping.xor(first!, ...rest) : polygonClipping.union(first!);
}

export function intersect(a: Ring[], b: Ring[]): MultiPolygon {
  return polygonClipping.intersection(geom(a), geom(b));
}
export function subtract(a: Ring[], b: Ring[]): MultiPolygon {
  return polygonClipping.difference(geom(a), geom(b));
}

export function ringsOfGeom(g: MultiPolygon): Ring[] {
  return g.flatMap((poly) => poly.map((ring) => ring.map(([x, y]) => ({ x, y }))));
}

function ringArea(r: Array<[number, number]>): number {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j]![0] + r[i]![0]) * (r[j]![1] - r[i]![1]);
  return Math.abs(s / 2);
}
export function geomArea(g: MultiPolygon): number {
  return g.reduce((s, poly) => s + ringArea(poly[0]!) - poly.slice(1).reduce((h, r) => h + ringArea(r), 0), 0);
}

/** Point dans des contours (règle pair-impair). */
export function insideRings(rings: Ring[], x: number, y: number): boolean {
  let c = false;
  for (const pts of rings)
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i]!;
      const b = pts[j]!;
      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
  return c;
}

/** Point le plus proche sur un ensemble de segments. */
export function nearestOnSegments(segs: Array<[Pt, Pt]>, p: Pt): { p: Pt; d: number } | null {
  let best: { p: Pt; d: number } | null = null;
  for (const [a, b] of segs) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
    const q = { x: a.x + dx * t, y: a.y + dy * t };
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (!best || d < best.d) best = { p: q, d };
  }
  return best;
}
