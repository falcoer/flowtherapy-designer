import type { Pt } from './model';

/** Forme reconnue dans un tracé fermé à main levée : son nom et son contour net. */
export interface Recognized {
  name: string;
  pts: Pt[];
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Le tracé revient-il près de son départ ? (assez pour être lu comme une forme fermée) */
export function isClosed(pts: Pt[]): boolean {
  if (pts.length < 8) return false;
  const b = bounds(pts);
  return dist(pts[0]!, pts[pts.length - 1]!) < 0.3 * Math.hypot(b.x1 - b.x0, b.y1 - b.y0);
}

function bounds(pts: Pt[]) {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
}

/** Douglas-Peucker sur une ligne ouverte. */
function rdp(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts.slice();
  const a = pts[0]!;
  const b = pts[pts.length - 1]!;
  const L = dist(a, b) || 1e-9;
  let best = -1;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const d = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / L;
    if (d > best) [best, idx] = [d, i];
  }
  if (best <= eps) return [a, b];
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
}

/** Sommets d'un contour fermé : on part du point le plus loin du centre pour ne pas créer de coin au départ du tracé. */
function corners(pts: Pt[], diag: number): Pt[] {
  const c = centroid(pts);
  let far = 0;
  pts.forEach((p, i) => dist(p, c) > dist(pts[far]!, c) && (far = i));
  const ring = [...pts.slice(far), ...pts.slice(0, far)];
  // contour fermé : coupé en deux au point le plus éloigné du départ, chaque moitié simplifiée
  let opp = 0;
  ring.forEach((p, i) => dist(p, ring[0]!) > dist(ring[opp]!, ring[0]!) && (opp = i));
  const eps = 0.07 * diag;
  const v = [...rdp(ring.slice(0, opp + 1), eps).slice(0, -1), ...rdp([...ring.slice(opp), ring[0]!], eps).slice(0, -1)];
  // on retire les sommets presque alignés
  for (let changed = true; changed && v.length > 3; ) {
    changed = false;
    for (let i = 0; i < v.length && v.length > 3; i++) {
      const p = v[(i + v.length - 1) % v.length]!;
      const q = v[i]!;
      const r = v[(i + 1) % v.length]!;
      const t = Math.abs(Math.atan2((q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x), (q.x - p.x) * (r.x - q.x) + (q.y - p.y) * (r.y - q.y)));
      if (t < (28 * Math.PI) / 180) {
        v.splice(i, 1);
        changed = true;
      }
    }
  }
  return v;
}

function centroid(pts: Pt[]): Pt {
  let x = 0,
    y = 0;
  for (const p of pts) [x, y] = [x + p.x, y + p.y];
  return { x: x / pts.length, y: y / pts.length };
}

/** Écart moyen du tracé au contour proposé, rapporté à la taille de la forme. */
function fitError(pts: Pt[], poly: Pt[], diag: number): number {
  let sum = 0;
  for (const p of pts) {
    let best = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1e-9)));
      best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
    }
    sum += best;
  }
  return sum / pts.length / diag;
}

function ellipse(pts: Pt[], diag: number): (Recognized & { err: number }) | null {
  const c = centroid(pts);
  let sxx = 0,
    syy = 0,
    sxy = 0;
  for (const p of pts) {
    const [x, y] = [p.x - c.x, p.y - c.y];
    [sxx, syy, sxy] = [sxx + x * x, syy + y * y, sxy + x * y];
  }
  [sxx, syy, sxy] = [sxx / pts.length, syy / pts.length, sxy / pts.length];
  const tr = (sxx + syy) / 2;
  const det = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy);
  const l1 = tr + det;
  const l2 = Math.max(1e-9, tr - det);
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let a = Math.sqrt(2 * l1);
  let b = Math.sqrt(2 * l2);
  const round = b / a > 0.82;
  if (round) a = b = pts.reduce((s, p) => s + dist(p, c), 0) / pts.length;
  const out: Pt[] = [];
  for (let i = 0; i < 72; i++) {
    const t = (i / 72) * Math.PI * 2;
    const u = Math.cos(t) * a;
    const v = Math.sin(t) * b;
    out.push({ x: c.x + u * Math.cos(th) - v * Math.sin(th), y: c.y + u * Math.sin(th) + v * Math.cos(th) });
  }
  const err = fitError(pts, out, diag);
  if (err > 0.045) return null;
  return { name: round ? 'Rond' : 'Ovale', pts: out, err };
}

/** Rectangle (ou carré) ajusté sur un quadrilatère aux angles presque droits. */
function rectangle(pts: Pt[], v: Pt[]): Recognized | null {
  const ang: number[] = [];
  for (let i = 0; i < 4; i++) {
    const p = v[(i + 3) % 4]!;
    const q = v[i]!;
    const r = v[(i + 1) % 4]!;
    const d = Math.abs(Math.atan2((q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x), (q.x - p.x) * (r.x - q.x) + (q.y - p.y) * (r.y - q.y)));
    ang.push(d);
  }
  if (ang.some((d) => Math.abs(d - Math.PI / 2) > (22 * Math.PI) / 180)) return null;
  // orientation moyenne des côtés, ramenée sur un quart de tour
  let sx = 0,
    sy = 0;
  for (let i = 0; i < 4; i++) {
    const a = v[i]!;
    const b = v[(i + 1) % 4]!;
    const t = Math.atan2(b.y - a.y, b.x - a.x) * 4;
    const w = dist(a, b);
    [sx, sy] = [sx + Math.cos(t) * w, sy + Math.sin(t) * w];
  }
  let th = Math.atan2(sy, sx) / 4;
  // presque droit : on le redresse
  if (Math.abs(th) < (6 * Math.PI) / 180) th = 0;
  const [cs, sn] = [Math.cos(th), Math.sin(th)];
  let u0 = Infinity,
    u1 = -Infinity,
    w0 = Infinity,
    w1 = -Infinity;
  for (const p of v) {
    const u = p.x * cs + p.y * sn;
    const w = -p.x * sn + p.y * cs;
    [u0, u1, w0, w1] = [Math.min(u0, u), Math.max(u1, u), Math.min(w0, w), Math.max(w1, w)];
  }
  let [W, H] = [u1 - u0, w1 - w0];
  const square = Math.min(W, H) / Math.max(W, H) > 0.85;
  const [cu, cw] = [(u0 + u1) / 2, (w0 + w1) / 2];
  if (square) W = H = (W + H) / 2;
  const back = (u: number, w: number) => ({ x: u * cs - w * sn, y: u * sn + w * cs });
  void pts;
  return {
    name: square ? 'Carré' : 'Rectangle',
    pts: [back(cu - W / 2, cw - H / 2), back(cu + W / 2, cw - H / 2), back(cu + W / 2, cw + H / 2), back(cu - W / 2, cw + H / 2)],
  };
}

/** Reconnaît rond, ovale, triangle, carré, rectangle ou polygone dans un tracé fermé ; null si rien de net. */
export function recognize(pts: Pt[]): Recognized | null {
  if (!isClosed(pts)) return null;
  const bb = bounds(pts);
  const diag = Math.hypot(bb.x1 - bb.x0, bb.y1 - bb.y0);
  if (diag < 1e-6) return null;
  const v = corners(pts, diag);
  const polyErr = fitError(pts, v, diag);
  if (v.length === 3 && polyErr < 0.04) return { name: 'Triangle', pts: v };
  if (v.length === 4 && polyErr < 0.04) return rectangle(pts, v) ?? { name: 'Quadrilatère', pts: v };
  const e = ellipse(pts, diag);
  const poly = v.length >= 5 && v.length <= 8 && polyErr < 0.035 ? { name: `Polygone à ${v.length} côtés`, pts: v } : null;
  // un polygone aux coins marqués colle mieux au tracé qu'un rond
  if (poly && (!e || polyErr < e.err * 0.8)) return poly;
  if (e) return { name: e.name, pts: e.pts };
  return null;
}
