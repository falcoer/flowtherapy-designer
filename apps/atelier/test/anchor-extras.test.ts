import { describe, expect, it } from 'vitest';
import { anchorKind } from '../src/marks';
import { anchorsOf, formatOf, resolvePoint, setAnchorDensity, setAnchorExtras, setAnchorMargin } from '../src/model';

const f = formatOf('a4');
const has = (pts: { x: number; y: number }[], x: number, y: number) => pts.some((p) => Math.abs(p.x - x) < 1e-9 && Math.abs(p.y - y) < 1e-9);

describe('points d’ancrage cochables', () => {
  it('ajoute sommets et milieux des côtés de la page et de la marge', () => {
    setAnchorDensity(2);
    setAnchorMargin(0.05);
    setAnchorExtras(undefined);
    const pts = anchorsOf('or', f);
    const mx = (0.05 * 210) / 210;
    const my = (0.05 * 210) / 297;
    for (const [x, y] of [[0, 0], [1, 1], [0.5, 0], [0, 0.5]] as const) expect(has(pts, x, y)).toBe(true);
    expect(has(pts, mx, my)).toBe(true);
    expect(has(pts, 0.5, my)).toBe(true);
    const side = pts.find((p) => p.id === 'marge h1/2 v0')!;
    expect(resolvePoint('or', side.id, f).y).toBeCloseTo(my);
    expect(anchorKind('or', side.id)).toBe('margin');
    expect(anchorKind('or', 'page h0 v0')).toBe('page');
  });

  it('la répartition prolonge ses lignes jusqu’aux bords extérieurs', () => {
    setAnchorDensity(2);
    setAnchorMargin(0);
    setAnchorExtras({ corners: false, sides: false });
    const pts = anchorsOf('repartition', f);
    expect(has(pts, 1 / 3, 0)).toBe(true);
    expect(has(pts, 1, 2 / 3)).toBe(true);
    expect(has(pts, 0.5, 1)).toBe(true);
    expect(has(pts, 0, 0)).toBe(false);
    expect(anchorKind('repartition', pts.find((p) => has([p], 1 / 3, 0))!.id)).toBe('third');
  });

  it('décochés, il ne reste que les points du référentiel', () => {
    setAnchorDensity(1);
    setAnchorMargin(0);
    setAnchorExtras({ corners: false, sides: false, edges: false });
    expect(anchorsOf('repartition', f).map((p) => p.id)).toEqual(['h1/2 v1/2']);
  });
});
