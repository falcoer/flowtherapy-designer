import { describe, expect, it } from 'vitest';
import { animWarp, newRig, RIG_JOINTS, rigJoints, setAnimTiming } from '../src/anim';
import { fitJoints } from '../src/stickers';
import { boneAffine, boneCarry, boneFrames, boneNear, type Bone } from '../src/stickers/kit';
import { pathToRings, ringsOfGeom, ringsToPath, unionAll, type Ring } from '../src/cut';
import { bentCut } from '../src/warp';

const rect = (x0: number, y0: number, x1: number, y1: number): Ring => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
/** Personnage en blocs, bras le long du corps (collés au tronc) : tête, tronc, bras, jambes, de 0,1 à 0,9 de haut. */
const BLOCKS: Ring[] = ringsOfGeom(
  unionAll([
    [rect(0.42, 0.1, 0.58, 0.24)],
    [rect(0.47, 0.23, 0.53, 0.27)],
    [rect(0.36, 0.26, 0.64, 0.56)],
    [rect(0.3, 0.27, 0.37, 0.56)],
    [rect(0.63, 0.27, 0.7, 0.56)],
    [rect(0.38, 0.55, 0.48, 0.9)],
    [rect(0.52, 0.55, 0.62, 0.9)],
  ]),
);
const at = (J: string, k: string) => J.split(';')[RIG_JOINTS.indexOf(k as never)]!.split(',').map(Number) as [number, number];
const inside = (rings: Ring[], x: number, y: number) =>
  rings.reduce((c, r) => r.reduce((cc, p, i) => {
    const q = r[(i + 1) % r.length]!;
    return p.y > y !== q.y > y && x < p.x + ((y - p.y) * (q.x - p.x)) / (q.y - p.y) ? !cc : cc;
  }, c), false);

describe('squelette calé sur la silhouette d’une image détourée', () => {
  it('le gabarit prend la hauteur de la silhouette, du haut de la tête à la semelle', () => {
    const J = fitJoints(BLOCKS, 1)!;
    expect(J).toBeTruthy();
    // le gabarit met la tête à 0,07 et les pieds à 0,95 de sa hauteur : ici de 0,1 à 0,9
    expect(at(J, 'head')[1]).toBeCloseTo(0.1 + 0.07 * 0.8, 3);
    expect(at(J, 'footL')[1]).toBeCloseTo(0.1 + 0.95 * 0.8, 3);
    expect(at(J, 'pelvis')[0]).toBeCloseTo(0.5, 2);
  });
  it('les bras le long du corps : épaules dans la silhouette, mains dans les manches', () => {
    const J = fitJoints(BLOCKS, 1)!;
    for (const k of ['shL', 'shR', 'elL', 'elR', 'handL', 'handR']) expect(inside(BLOCKS, ...at(J, k))).toBe(true);
    // les mains descendent le long des bras, pas écartées comme sur le gabarit en A
    expect(at(J, 'handL')[0]).toBeGreaterThan(0.29);
    expect(at(J, 'handL')[0]).toBeLessThan(0.37);
    expect(at(J, 'handR')[0]).toBeGreaterThan(0.63);
    expect(at(J, 'handL')[1]).toBeGreaterThan(0.45);
  });
  it('sans silhouette, rien n’est calé', () => {
    expect(fitJoints([], 1)).toBeUndefined();
  });
});

describe('marionnette : l’image détourée bouge par pièces', () => {
  it('une pièce suit son os comme un point emmené par lui', () => {
    const rest: Bone[] = [[[0.4, 0.3], [0.4, 0.6]]];
    const cur: Bone[] = [[[0.45, 0.3], [0.7, 0.4]]];
    const r = 0.7;
    const F = boneFrames(rest, cur, r)[0]!;
    const A = boneAffine(F, r);
    for (const [u, v] of [[0.4, 0.35], [0.43, 0.5], [0.38, 0.58]]) {
      const [x, y] = [u * r, v];
      const [X, Y] = boneCarry(F, boneNear(F, x, y).k, x, y);
      expect(A[0] * u + A[2] * v + A[4]).toBeCloseTo(X / r, 9);
      expect(A[1] * u + A[3] * v + A[5]).toBeCloseTo(Y, 9);
    }
  });
  it('en dansant, le bras levé emporte sa manche sans étirer le tronc', () => {
    setAnimTiming({ period: 1, count: 8 });
    const cut = ringsToPath(BLOCKS, 0.0005, 30, false);
    const J = fitJoints(BLOCKS, 1)!;
    const a = { ...newRig(1), j: J, acts: [{ id: 'd', g: 'dance', at: 0, len: 8, cycle: 2 }] };
    const w = animWarp(a, 0.5, { cut })!;
    expect(w.pieces?.length).toBeGreaterThan(8);
    // chaque pièce est posée telle quelle (rotation, sans cisaillement)
    for (const p of w.pieces!) {
      const [a0, b0, c0, d0] = p.A;
      expect(Math.abs(a0 * d0 - b0 * c0)).toBeGreaterThan(0.2);
    }
    // la silhouette de l'instant réunit les pièces ; le bas du tronc n'a pas bougé
    const now = pathToRings(bentCut(cut, w));
    expect(inside(now, 0.5, 0.45)).toBe(true);
    // au repos, pas de déformation : l'image est dessinée telle quelle
    expect(animWarp({ ...a, acts: [] }, 0.5, { cut })).toBeNull();
    expect(rigJoints(a)[RIG_JOINTS.indexOf('head')]![1]).toBeCloseTo(0.1 + 0.07 * 0.8, 3);
  });
});
