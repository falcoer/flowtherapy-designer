import type { Pt } from './model';

/**
 * Tracé redressé : chaque point est comparé à la médiane de ses voisins sur `reach` (longueur
 * de tracé de part et d'autre) ; s'il s'en écarte de plus de `tol`, il y est ramené. Trois passes :
 * les dents et crochets qu'un aimant prend sur les contours voisins disparaissent, les vraies
 * courbes restent.
 */
export function steadyPath(pts: Pt[], reach: number, tol: number, closed: boolean): Pt[] {
  const n = pts.length;
  if (n < 5 || reach <= 0) return pts;
  // abscisse curviligne (prise sur le tracé d'origine)
  const at = new Float64Array(n);
  for (let i = 1; i < n; i++) at[i] = at[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  const total = at[n - 1]! + (closed ? Math.hypot(pts[0]!.x - pts[n - 1]!.x, pts[0]!.y - pts[n - 1]!.y) : 0);
  const median = (v: number[]) => {
    v.sort((a, b) => a - b);
    const h = v.length >> 1;
    return v.length % 2 ? v[h]! : (v[h - 1]! + v[h]!) / 2;
  };
  let cur = pts;
  for (let pass = 0; pass < 3; pass++) {
    const out: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const xs = [cur[i]!.x];
      const ys = [cur[i]!.y];
      for (const dir of [-1, 1]) {
        for (let k = 1; k < n; k++) {
          let j = i + dir * k;
          if (!closed && (j < 0 || j >= n)) break;
          j = ((j % n) + n) % n;
          let d = Math.abs(at[j]! - at[i]!);
          if (closed) d = Math.min(d, total - d);
          if (d > reach) break;
          xs.push(cur[j]!.x);
          ys.push(cur[j]!.y);
        }
      }
      const p = cur[i]!;
      const m = { x: median(xs), y: median(ys) };
      const dev = Math.hypot(p.x - m.x, p.y - m.y);
      out.push(dev > tol ? { x: m.x + ((p.x - m.x) * tol) / dev, y: m.y + ((p.y - m.y) * tol) / dev } : p);
    }
    cur = out;
  }
  return cur;
}
