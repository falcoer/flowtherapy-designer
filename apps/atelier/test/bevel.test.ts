import { describe, expect, it } from 'vitest';
import { axisDist, bevelProfile } from '../src/bump';
import { bevelSoftOf } from '../src/model';

describe('biseau', () => {
  it('passe du chanfrein au très doux', () => {
    expect(bevelProfile(0.5, 0)).toBeCloseTo(0.4);
    expect(bevelProfile(0.5, 0.5)).toBeCloseTo(0.75);
    // très doux : plat au bord et en haut
    expect(bevelProfile(0.05, 1)).toBeLessThan(0.01);
    expect(bevelProfile(1, 1)).toBeCloseTo(1);
  });
  it("garde l'ancien profil des compositions d'avant", () => {
    expect(bevelSoftOf({ bevelProfile: 'chamfer' })).toBe(0);
    expect(bevelSoftOf({})).toBe(0.5);
    expect(bevelSoftOf({ bevelSoft: 0.9, bevelProfile: 'chamfer' })).toBe(0.9);
  });
  it('mesure la distance au bord dans une seule direction', () => {
    // un rectangle 6×3 plein dans une grille 8×5
    const [w, h] = [8, 5];
    const mask = new Float32Array(w * h);
    for (let y = 1; y <= 3; y++) for (let x = 1; x <= 6; x++) mask[y * w + x] = 1;
    const H = axisDist(w, h, mask, 'h');
    const V = axisDist(w, h, mask, 'v');
    // au milieu de la ligne du haut : loin des côtés, mais au bord en vertical
    expect(H[1 * w + 3]).toBeCloseTo(3.5);
    expect(V[1 * w + 3]).toBeCloseTo(1.5);
    expect(H[0]).toBe(0);
  });
});
