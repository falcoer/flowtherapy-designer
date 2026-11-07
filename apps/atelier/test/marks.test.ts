import { describe, expect, it } from 'vitest';
import { anchorsFor } from '@ftd/core';
import { anchorKind, pinKind } from '../src/marks';
import { anchorsOf, FORMATS, setAnchorDensity } from '../src/model';

describe('couleurs des repères', () => {
  it('un point de la répartition prend la couleur de sa ligne la plus fine', () => {
    expect(anchorKind('repartition', 'h1/2 v1/2')).toBe('half');
    expect(anchorKind('repartition', 'h1/3 v1/2')).toBe('third');
    expect(anchorKind('repartition', 'h1/4 v2/3')).toBe('quarter');
    expect(anchorKind('repartition', 'h5/6 v1/2')).toBe('sixth');
    expect(anchorKind('repartition', 'h1/12 v1/2')).toBe('fine');
  });
  it('chaque point de chaque référentiel a une sorte connue', () => {
    setAnchorDensity(6);
    for (const f of FORMATS) {
      for (const a of anchorsOf('repartition', f)) expect(anchorKind('repartition', a.id)).not.toBe('margin');
      for (const a of anchorsFor('or', f)) expect(anchorKind('or', a.id)).toBe('golden');
      const arm = new Set(anchorsFor('armature', f).map((a) => anchorKind('armature', a.id)));
      expect(arm.has('half')).toBe(true);
      // le carré n'a que le centre : ses diagonales et réciproques se confondent
      if (f.width === f.height) continue;
      expect(arm.has('diagonal')).toBe(true);
      expect(arm.has('reciprocal')).toBe(true);
    }
  });
  it('un bord tenu à la marge prend la couleur de la marge, sauf sans marge', () => {
    expect(pinKind('margin', true)).toBe('margin');
    expect(pinKind('margin', false)).toBe('page');
    expect(pinKind(true, true)).toBe('page');
  });
});
