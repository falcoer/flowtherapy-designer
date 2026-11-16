import type { Warp } from './stickers';

/**
 * Surface déformée (étape 3 des stickers animés) : la surface d'une forme animée (teinte, dégradé, peinture, relief,
 * effets de matière) est rendue une fois, à plat, sur la forme au repos ; puis elle est posée sur un maillage
 * dont chaque nœud suit la forme qui bouge (Generator.warp). Chaque maille est tirée à plat (transformation affine),
 * et les mailles voisines qui subissent la même transformation sont posées d'un seul tenant : sur une aile qui bat,
 * il reste une poignée de pièces par image, ce que le canevas 2D d'un iPad dessine sans peine.
 */

export interface Mesh {
  key: string;
  us: number[];
  vs: number[];
  /** Nœuds déplacés (coordonnées 0..1 de la boîte), rangée par rangée : x puis y. */
  P: Float64Array;
}

const meshes = new Map<string, Mesh>();
/** Le maillage d'une déformation, calculé une fois (les images d'un battement reviennent en boucle). */
export function meshOf(w: Warp): Mesh {
  let m = meshes.get(w.key);
  if (!m) {
    const nu = w.us.length;
    const P = new Float64Array(nu * w.vs.length * 2);
    w.vs.forEach((v, j) =>
      w.us.forEach((u, i) => {
        const [x, y] = w.map(u, v);
        P[(j * nu + i) * 2] = x;
        P[(j * nu + i) * 2 + 1] = y;
      }),
    );
    if (meshes.size > 400) meshes.clear();
    meshes.set(w.key, (m = { key: w.key, us: w.us, vs: w.vs, P }));
  }
  return m;
}

type Pt2 = [number, number];
type Affine = [number, number, number, number, number, number];

/** Transformation affine qui envoie s0, s1, s2 sur d0, d1, d2 (null si les sources sont alignées). */
export function affine(s0: Pt2, s1: Pt2, s2: Pt2, d0: Pt2, d1: Pt2, d2: Pt2): Affine | null {
  const [S1x, S1y, S2x, S2y] = [s1[0] - s0[0], s1[1] - s0[1], s2[0] - s0[0], s2[1] - s0[1]];
  const [D1x, D1y, D2x, D2y] = [d1[0] - d0[0], d1[1] - d0[1], d2[0] - d0[0], d2[1] - d0[1]];
  const det = S1x * S2y - S2x * S1y;
  if (Math.abs(det) < 1e-12) return null;
  const a = (D1x * S2y - D2x * S1y) / det;
  const c = (D2x * S1x - D1x * S2x) / det;
  const b = (D1y * S2y - D2y * S1y) / det;
  const d = (D2y * S1x - D1y * S2x) / det;
  return [a, b, c, d, d0[0] - a * s0[0] - c * s0[1], d0[1] - b * s0[0] - d * s0[1]];
}
const apply = (A: Affine, p: Pt2): Pt2 => [A[0] * p[0] + A[2] * p[1] + A[4], A[1] * p[0] + A[3] * p[1] + A[5]];

/** Une pièce à poser : un polygone (dans la boîte au repos) et la transformation qui l'emmène à sa place. */
export interface Piece {
  src: Pt2[];
  A: Affine;
}

/**
 * Les pièces d'un maillage, dans les coordonnées 0..1 de la boîte. `tol` : écart toléré (en unités de la boîte)
 * pour qu'une maille passe d'un seul tenant, et pour que deux mailles voisines se fondent en une pièce.
 */
export function piecesOf(m: Mesh, tol: number): Piece[] {
  const { us, vs, P } = m;
  const nu = us.length;
  const at = (i: number, j: number): Pt2 => [P[(j * nu + i) * 2]!, P[(j * nu + i) * 2 + 1]!];
  const src = (i: number, j: number): Pt2 => [us[i]!, vs[j]!];
  const near = (p: Pt2, q: Pt2) => Math.abs(p[0] - q[0]) <= tol && Math.abs(p[1] - q[1]) <= tol;
  const out: Piece[] = [];
  for (let j = 0; j + 1 < vs.length; j++) {
    let i = 0;
    while (i + 1 < nu) {
      const A = affine(src(i, j), src(i + 1, j), src(i, j + 1), at(i, j), at(i + 1, j), at(i, j + 1));
      if (A && near(apply(A, src(i + 1, j + 1)), at(i + 1, j + 1))) {
        // maille plate : on l'étend tant que les suivantes suivent la même transformation
        let e = i + 1;
        while (e + 1 < nu && near(apply(A, src(e + 1, j)), at(e + 1, j)) && near(apply(A, src(e + 1, j + 1)), at(e + 1, j + 1))) e++;
        out.push({ src: [src(i, j), src(e, j), src(e, j + 1), src(i, j + 1)], A });
        i = e;
        continue;
      }
      // maille gauchie : deux triangles
      const T1 = affine(src(i, j), src(i + 1, j), src(i + 1, j + 1), at(i, j), at(i + 1, j), at(i + 1, j + 1));
      const T2 = affine(src(i, j), src(i + 1, j + 1), src(i, j + 1), at(i, j), at(i + 1, j + 1), at(i, j + 1));
      if (T1) out.push({ src: [src(i, j), src(i + 1, j), src(i + 1, j + 1)], A: T1 });
      if (T2) out.push({ src: [src(i, j), src(i + 1, j + 1), src(i, j + 1)], A: T2 });
      i++;
    }
  }
  return out;
}

const piecesCache = new Map<string, Piece[]>();
function cachedPieces(m: Mesh, tol: number): Piece[] {
  const key = `${m.key}|${tol.toPrecision(2)}`;
  let p = piecesCache.get(key);
  if (!p) {
    if (piecesCache.size > 400) piecesCache.clear();
    piecesCache.set(key, (p = piecesOf(m, tol)));
  }
  return p;
}

/**
 * Pose l'image `img` (la surface au repos, couvrant la boîte : iw × ih pixels) déformée selon le maillage,
 * dans le repère courant du canevas où la boîte occupe (x0, y0, bw, bh). `px` : pixels de l'écran par unité du repère,
 * pour la tolérance des pièces et le léger chevauchement qui évite les fils de jour entre elles.
 */
export function drawWarped(ctx: CanvasRenderingContext2D, img: CanvasImageSource, iw: number, ih: number, m: Mesh, x0: number, y0: number, bw: number, bh: number, px: number) {
  // un demi-pixel d'écart ne se voit pas
  const tol = 0.5 / Math.max(1e-6, px * Math.max(bw, bh));
  const pieces = cachedPieces(m, tol);
  // chevauchement des pièces : environ un pixel d'écran, en unités de la boîte
  const [gu, gv] = [0.7 / Math.max(1e-6, px * bw), 0.7 / Math.max(1e-6, px * bh)];
  for (const pc of pieces) {
    const [a, b, c, d, e, f] = pc.A;
    // boîte → image : (u·iw, v·ih) ; boîte → repère : (x0 + u·bw, y0 + v·bh)
    ctx.save();
    ctx.transform(bw, 0, 0, bh, x0, y0);
    ctx.transform(a, b, c, d, e, f);
    // le polygone, élargi d'un pixel autour de son centre, découpé dans la boîte au repos
    let [cx, cy] = [0, 0];
    for (const p of pc.src) {
      cx += p[0] / pc.src.length;
      cy += p[1] / pc.src.length;
    }
    ctx.beginPath();
    let [u0, v0, u1, v1] = [1, 1, 0, 0];
    pc.src.forEach((p, k) => {
      const x = p[0] + Math.sign(p[0] - cx) * gu;
      const y = p[1] + Math.sign(p[1] - cy) * gv;
      u0 = Math.min(u0, x);
      v0 = Math.min(v0, y);
      u1 = Math.max(u1, x);
      v1 = Math.max(v1, y);
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.clip();
    // seulement le morceau de l'image sous la pièce (deux pixels de marge)
    const sx = Math.max(0, Math.floor(u0 * iw) - 2);
    const sy = Math.max(0, Math.floor(v0 * ih) - 2);
    const sw = Math.min(iw, Math.ceil(u1 * iw) + 2) - sx;
    const sh = Math.min(ih, Math.ceil(v1 * ih) + 2) - sy;
    if (sw > 0 && sh > 0) ctx.drawImage(img, sx, sy, sw, sh, sx / iw, sy / ih, sw / iw, sh / ih);
    ctx.restore();
  }
}

/**
 * Point de la surface au repos sous un point de la forme déformée (coordonnées 0..1 de la boîte) :
 * la peinture posée sur une aile qui bat s'inscrit là où elle restera, sur l'aile.
 * Un point hors du maillage déformé reste tel quel.
 */
export function unwarp(m: Mesh, u: number, v: number): { x: number; y: number } {
  const { us, vs, P } = m;
  const nu = us.length;
  const at = (i: number, j: number): Pt2 => [P[(j * nu + i) * 2]!, P[(j * nu + i) * 2 + 1]!];
  const src = (i: number, j: number): Pt2 => [us[i]!, vs[j]!];
  let best: { x: number; y: number } | null = null;
  for (let j = 0; j + 1 < vs.length && !best; j++)
    for (let i = 0; i + 1 < nu && !best; i++)
      for (const tri of [
        [
          [i, j],
          [i + 1, j],
          [i + 1, j + 1],
        ],
        [
          [i, j],
          [i + 1, j + 1],
          [i, j + 1],
        ],
      ] as Array<Array<[number, number]>>) {
        const [A, B, C] = tri.map(([x, y]) => at(x, y)) as [Pt2, Pt2, Pt2];
        const det = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
        if (Math.abs(det) < 1e-14) continue;
        const l1 = ((B[1] - C[1]) * (u - C[0]) + (C[0] - B[0]) * (v - C[1])) / det;
        const l2 = ((C[1] - A[1]) * (u - C[0]) + (A[0] - C[0]) * (v - C[1])) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
        const [sA, sB, sC] = tri.map(([x, y]) => src(x, y)) as [Pt2, Pt2, Pt2];
        best = { x: l1 * sA[0] + l2 * sB[0] + l3 * sC[0], y: l1 * sA[1] + l2 * sB[1] + l3 * sC[1] };
        break;
      }
  return best ?? { x: u, y: v };
}
