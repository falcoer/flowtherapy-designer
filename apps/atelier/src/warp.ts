import { animSkeleton, animWarp, carved, generatorOf } from './anim';
import { pathToRings, ringsToPath, simplifyRing, type Ring } from './cut';
import type { Layer } from './model';
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
  /** Morceau de chaque nœud (Warp.part), s'il y en a : les mailles à cheval sur deux morceaux ne se posent pas. */
  parts?: Int32Array;
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
    let parts: Int32Array | undefined;
    if (w.part) {
      const part = w.part;
      parts = new Int32Array(nu * w.vs.length);
      w.vs.forEach((v, j) => w.us.forEach((u, i) => (parts![j * nu + i] = part(u, v))));
    }
    if (meshes.size > 400) meshes.clear();
    meshes.set(w.key, (m = { key: w.key, us: w.us, vs: w.vs, P, parts }));
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
  const G = m.parts;
  const torn = (i: number, j: number) => !!G && !(G[j * nu + i] === G[j * nu + i + 1] && G[j * nu + i] === G[(j + 1) * nu + i] && G[j * nu + i] === G[(j + 1) * nu + i + 1]);
  for (let j = 0; j + 1 < vs.length; j++) {
    let i = 0;
    while (i + 1 < nu) {
      if (torn(i, j)) {
        i++;
        continue;
      }
      const A = affine(src(i, j), src(i + 1, j), src(i, j + 1), at(i, j), at(i + 1, j), at(i, j + 1));
      if (A && near(apply(A, src(i + 1, j + 1)), at(i + 1, j + 1))) {
        // maille plate : on l'étend tant que les suivantes suivent la même transformation
        let e = i + 1;
        while (e + 1 < nu && !torn(e, j) && near(apply(A, src(e + 1, j)), at(e + 1, j)) && near(apply(A, src(e + 1, j + 1)), at(e + 1, j + 1))) e++;
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
  // hors du maillage : la maille la plus proche, prolongée (jamais le point tel quel, qui n'est pas dans le même repère)
  let near: { x: number; y: number } | null = null;
  let nearScore = -Infinity;
  const G = m.parts;
  for (let j = 0; j + 1 < vs.length && !best; j++)
    for (let i = 0; i + 1 < nu && !best; i++) {
      // maille déchirée (entre deux lettres) : elle n'est pas posée, rien n'y est peint
      if (G && !(G[j * nu + i] === G[j * nu + i + 1] && G[j * nu + i] === G[(j + 1) * nu + i] && G[j * nu + i] === G[(j + 1) * nu + i + 1])) continue;
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
        const [sA, sB, sC] = tri.map(([x, y]) => src(x, y)) as [Pt2, Pt2, Pt2];
        const hit = { x: l1 * sA[0] + l2 * sB[0] + l3 * sC[0], y: l1 * sA[1] + l2 * sB[1] + l3 * sC[1] };
        const score = Math.min(l1, l2, l3);
        if (score >= -1e-9) {
          best = hit;
          break;
        }
        if (score > nearScore) {
          nearScore = score;
          near = hit;
        }
      }
    }
  return best ?? near ?? { x: u, y: v };
}

/** Un point de la boîte au repos, porté à sa place de l'instant à travers le maillage (l'inverse d'`unwarp`). */
export function rewarp(m: Mesh, u: number, v: number): { x: number; y: number } {
  const { us, vs, P } = m;
  const nu = us.length;
  const i = Math.max(0, Math.min(nu - 2, lowerIndex(us, u)));
  const j = Math.max(0, Math.min(vs.length - 2, lowerIndex(vs, v)));
  const [a, b] = [us[i]!, us[i + 1]!];
  const [c, d] = [vs[j]!, vs[j + 1]!];
  const s = (u - a) / Math.max(1e-12, b - a);
  const t = (v - c) / Math.max(1e-12, d - c);
  const at = (x: number, y: number, k: number) => P[(y * nu + x) * 2 + k]!;
  // même découpage en triangles que le dessin : diagonale du coin haut-gauche au coin bas-droit
  const pick = (k: number) =>
    s >= t ? at(i, j, k) + s * (at(i + 1, j, k) - at(i, j, k)) + t * (at(i + 1, j + 1, k) - at(i + 1, j, k)) : at(i, j, k) + t * (at(i, j + 1, k) - at(i, j, k)) + s * (at(i + 1, j + 1, k) - at(i, j + 1, k));
  return { x: pick(0), y: pick(1) };
}
function lowerIndex(xs: number[], x: number): number {
  let i = 0;
  while (i + 1 < xs.length && xs[i + 1]! <= x) i++;
  return i;
}

/** Déformation de la surface d'une forme animée à l'instant courant, si son générateur la plie (voir Generator.warp). */
export function surfaceWarp(l: Layer): Warp | null {
  return (!l.cut || carved(l)) && l.anim ? warpFor(l) : null;
}

/**
 * Déformation dans la boîte de la couche, à l'instant t. Le générateur la donne dans la boîte d'origine ;
 * une forme modelée a pu agrandir sa boîte (Layer.molded.frame : la boîte actuelle dans le repère d'origine).
 */
export function warpFor(l: Layer, t?: number): Warp | null {
  const w = l.anim ? animWarp(l.anim, t, l.text ? { text: l.text } : undefined) : null;
  const fr = l.molded?.frame;
  if (!w || !fr || (fr[0] === 0 && fr[1] === 0 && fr[2] === 1 && fr[3] === 1)) return w;
  const [a, b, c, d] = fr;
  const [W, H] = [c - a || 1, d - b || 1];
  const inside = (xs: number[]) => {
    const out = [0];
    for (const x of xs.filter((x) => x > 0 && x < 1).sort((p, q) => p - q)) if (x - out[out.length - 1]! > 0.004) out.push(x);
    if (1 - out[out.length - 1]! < 0.004) out.pop();
    out.push(1);
    return out;
  };
  return {
    key: `${w.key}|${fr.join(',')}`,
    us: inside(w.us.map((u) => (u - a) / W)),
    vs: inside(w.vs.map((v) => (v - b) / H)),
    map: (u, v) => {
      const [x, y] = w.map(a + u * W, b + v * H);
      return [(x - a) / W, (y - b) / H];
    },
    ...(w.part ? { part: (u: number, v: number) => w.part!(a + u * W, b + v * H) } : {}),
  };
}

/**
 * Os d'une forme animée à l'instant courant (vue « os seuls »), en coordonnées 0..1 de sa boîte : ceux que son générateur
 * pose au repos, pliés par la même déformation que sa surface, ou son squelette articulé pris à l'instant. Null pour une forme sans os.
 */
export function bonesOf(l: Layer): Array<Array<[number, number]>> | null {
  if (!l.anim || l.text || (l.cut && !carved(l))) return null;
  const g = generatorOf(l.anim);
  const [a, b, c, d] = l.molded?.frame ?? [0, 0, 1, 1];
  const [W, H] = [c - a || 1, d - b || 1];
  const sk = animSkeleton(l.anim);
  if (sk) return sk.map((bone) => bone.map(([u, v]): [number, number] => [(u - a) / W, (v - b) / H]));
  if (!g?.bones) return null;
  const w = warpFor(l);
  return g.bones(l.anim).map((line) =>
    line.map(([u, v]): [number, number] => {
      const [x, y] = [(u - a) / W, (v - b) / H];
      return w ? w.map(x, y) : [x, y];
    }),
  );
}

/** Contours redécoupés finement (pas de 0,01 de la boîte) : un bord droit au repos se plie avec la forme. */
function fineRings(rings: Ring[]): Ring[] {
  return rings.map((r) =>
    r.flatMap((p, i) => {
      const q = r[(i + 1) % r.length]!;
      const n = Math.min(64, Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 0.01)));
      return Array.from({ length: n }, (_, k) => ({ x: p.x + ((q.x - p.x) * k) / n, y: p.y + ((q.y - p.y) * k) / n }));
    }),
  );
}
const bentCuts = new Map<string, { key: string; d: string }>();
/** Découpe au repos (sculptée) pliée par la déformation de l'instant. */
export function bentCut(rest: string, w: Warp): string {
  const hit = bentCuts.get(rest);
  if (hit?.key === w.key) return hit.d;
  const rings = fineRings(pathToRings(rest)).map((r) =>
    r.map((p) => {
      const [x, y] = w.map(p.x, p.y);
      return { x, y };
    }),
  );
  const d = ringsToPath(rings, 0.0003, 30, false);
  if (bentCuts.size > 300) bentCuts.clear();
  bentCuts.set(rest, { key: w.key, d });
  return d;
}

/**
 * Découpe tracée sur la forme telle qu'elle est à l'instant t (couper, modeler) → la même découpe sur la forme au repos :
 * la forme sculptée garde son animation, le geste suivant la plie à nouveau. `l` porte déjà sa nouvelle boîte.
 */
export function restCut(l: Layer, d: string, t?: number): string {
  const w = warpFor(l, t);
  if (!w) return d;
  // la forme au repos peut déborder de la boîte (taillée sur la forme de l'instant) : le maillage s'étend bien au-delà
  const fr = l.molded?.frame ?? [0, 0, 1, 1];
  const [W, H] = [fr[2] - fr[0] || 1, fr[3] - fr[1] || 1];
  const span = (lo: number, hi: number, xs: number[]) => {
    const out = new Set(xs);
    for (let k = 0; k <= 24; k++) out.add(lo + ((hi - lo) * k) / 24);
    return [...out].sort((p, q) => p - q).filter((x, i, a) => i === 0 || x - a[i - 1]! > 1e-4);
  };
  const us = span(Math.min(0, (-0.4 - fr[0]) / W), Math.max(1, (1.4 - fr[0]) / W), w.us);
  const vs = span(Math.min(0, (-0.4 - fr[1]) / H), Math.max(1, (1.4 - fr[1]) / H), w.vs);
  const m = meshOf({ ...w, key: `${w.key}|large`, us, vs });
  const rings = fineRings(pathToRings(d)).map((r) => simplifyRing(r.map((p) => unwarp(m, p.x, p.y)), 0.0004));
  return ringsToPath(rings, 0.0002, 30, false);
}

/** Grille de la surface d'une forme modelée (Layer.molded.mesh) : MOLD_GRID mailles de côté sur la boîte d'origine. */
export const MOLD_GRID = 20;
const moldLines = Array.from({ length: MOLD_GRID + 1 }, (_, i) => i / MOLD_GRID);
/** Nœuds de la grille au repos, rangée par rangée (x puis y), dans le repère de la boîte d'origine. */
export function restGrid(): number[] {
  return moldLines.flatMap((v) => moldLines.flatMap((u) => [u, v]));
}
let moldMeshes = new WeakMap<number[], Mesh>();
let moldId = 0;
/**
 * Maillage de la surface d'une forme modelée, dans la boîte d'origine (avant tout modelage) : la teinte, le dégradé
 * ou l'image posés sur la forme d'origine suivent la matière tirée. Null si la forme n'a pas de grille (modelée avant).
 */
export function moldMesh(l: Layer): Mesh | null {
  const g = l.molded?.mesh;
  if (!g || g.length !== (MOLD_GRID + 1) ** 2 * 2) return null;
  let m = moldMeshes.get(g);
  if (!m) {
    if (moldId > 1e6) [moldMeshes, moldId] = [new WeakMap(), 0];
    moldMeshes.set(g, (m = { key: `mold|${++moldId}`, us: moldLines, vs: moldLines, P: Float64Array.from(g) }));
  }
  return m;
}
