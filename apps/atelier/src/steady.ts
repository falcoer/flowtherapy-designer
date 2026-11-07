import type { Pt } from './model';

/**
 * Tracé redressé. Autour de chaque point, on prend ses voisins sur `reach` (longueur de tracé de
 * part et d'autre) et on y ajuste une courbe douce (une parabole dans le repère de leur corde),
 * en écartant les points qui s'en éloignent trop. Si le point s'écarte de cette courbe de plus de
 * `tol`, il y est ramené, perpendiculairement au tracé : les dents et crochets qu'un aimant prend
 * sur les contours voisins disparaissent, quelle que soit l'orientation du bord ; les vraies
 * courbes restent, et les points ne glissent pas le long du tracé (les bouts d'un tracé ouvert
 * restent où ils sont). Trois passes.
 */
export function steadyPath(pts: Pt[], reach: number, tol: number, closed: boolean): Pt[] {
  const n = pts.length;
  if (n < 5 || reach <= 0) return pts;
  // abscisse curviligne (prise sur le tracé d'origine)
  const at = new Float64Array(n);
  for (let i = 1; i < n; i++) at[i] = at[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  const total = at[n - 1]! + (closed ? Math.hypot(pts[0]!.x - pts[n - 1]!.x, pts[0]!.y - pts[n - 1]!.y) : 0);
  // voisins de chaque point : indices, du plus loin en arrière au plus loin en avant
  const around: number[][] = [];
  for (let i = 0; i < n; i++) {
    const back: number[] = [];
    const ahead: number[] = [];
    for (const [dir, out] of [
      [-1, back],
      [1, ahead],
    ] as const) {
      for (let k = 1; k < n; k++) {
        let j = i + dir * k;
        if (!closed && (j < 0 || j >= n)) break;
        j = ((j % n) + n) % n;
        let d = Math.abs(at[j]! - at[i]!);
        if (closed) d = Math.min(d, total - d);
        if (d > reach || j === i) break;
        out.push(j);
      }
    }
    around.push([...back.reverse(), ...ahead]);
  }
  let cur = pts;
  for (let pass = 0; pass < 3; pass++) {
    const out: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const p = cur[i]!;
      const nb = around[i]!;
      if (nb.length < 4) {
        out.push(p);
        continue;
      }
      // repère de la corde des voisins : u le long, v en travers, origine sur le point
      const a = cur[nb[0]!]!;
      const b = cur[nb[nb.length - 1]!]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1e-9) {
        out.push(p);
        continue;
      }
      const [tx, ty] = [(b.x - a.x) / len, (b.y - a.y) / len];
      const uv = nb.map((j) => {
        const q = cur[j]!;
        const [dx, dy] = [q.x - p.x, q.y - p.y];
        return [dx * tx + dy * ty, -dx * ty + dy * tx] as const;
      });
      // parabole ajustée, puis réajustée sans les voisins qui s'en écartent (les autres dents)
      let fit = fitParabola(uv, null);
      if (!fit) {
        out.push(p);
        continue;
      }
      const keep = uv.map(([u, v]) => Math.abs(v - (fit![0] + fit![1] * u + fit![2] * u * u)) <= tol);
      if (keep.filter(Boolean).length >= 4) fit = fitParabola(uv, keep) ?? fit;
      // écart du point (en u = 0) à la courbe des voisins, ramené à la tolérance, en travers seulement
      const dev = -fit[0];
      if (Math.abs(dev) <= tol) {
        out.push(p);
        continue;
      }
      const move = dev - Math.sign(dev) * tol;
      out.push({ ...p, x: p.x + ty * move, y: p.y - tx * move });
    }
    cur = out;
  }
  return cur;
}

/** Moindres carrés v ≈ c0 + c1·u + c2·u² sur les points gardés ; null si le système est dégénéré. */
function fitParabola(uv: ReadonlyArray<readonly [number, number]>, keep: boolean[] | null): [number, number, number] | null {
  // sommes des puissances de u (centrées et réduites pour la précision)
  let scale = 0;
  for (const [u] of uv) scale = Math.max(scale, Math.abs(u));
  if (scale < 1e-12) return null;
  const S = new Float64Array(5);
  const T = new Float64Array(3);
  uv.forEach(([u0, v], k) => {
    if (keep && !keep[k]) return;
    const u = u0 / scale;
    let pw = 1;
    for (let e = 0; e < 5; e++) {
      S[e] += pw;
      if (e < 3) T[e] += v * pw;
      pw *= u;
    }
  });
  // système 3×3 (Cramer)
  const m = [
    [S[0]!, S[1]!, S[2]!],
    [S[1]!, S[2]!, S[3]!],
    [S[2]!, S[3]!, S[4]!],
  ];
  const det3 = (q: number[][]) => q[0]![0]! * (q[1]![1]! * q[2]![2]! - q[1]![2]! * q[2]![1]!) - q[0]![1]! * (q[1]![0]! * q[2]![2]! - q[1]![2]! * q[2]![0]!) + q[0]![2]! * (q[1]![0]! * q[2]![1]! - q[1]![1]! * q[2]![0]!);
  const D = det3(m);
  if (Math.abs(D) < 1e-12) return null;
  const col = (c: number) => m.map((row, r) => row.map((x, k) => (k === c ? T[r]! : x)));
  const c0 = det3(col(0)) / D;
  const c1 = det3(col(1)) / D / scale;
  const c2 = det3(col(2)) / D / (scale * scale);
  return [c0, c1, c2];
}
