import { describe, expect, it } from 'vitest';
import { steadyPath } from '../src/steady';

/** Cercle de rayon r échantillonné en n points. */
const circle = (r: number, n: number) => Array.from({ length: n }, (_, i) => ({ x: r * Math.cos((2 * Math.PI * i) / n), y: r * Math.sin((2 * Math.PI * i) / n) }));
const radius = (p: { x: number; y: number }) => Math.hypot(p.x, p.y);

describe('lissage du ciseau aimanté (steadyPath)', () => {
  it('ramène les dents prises sur un contour voisin', () => {
    // un bord droit (un point par unité) avec des dents de 5 unités (le double de la tolérance), sur un ou deux points
    const pts = Array.from({ length: 200 }, (_, i) => ({ x: i, y: 0 }));
    for (const i of [50, 51, 120]) pts[i] = { x: i, y: i === 120 ? -5 : 5 };
    const out = steadyPath(pts, 30, 2.5, false);
    expect(out).toHaveLength(pts.length);
    // chaque dent est ramenée à la tolérance au plus
    for (const i of [50, 51, 120]) expect(Math.abs(out[i]!.y)).toBeLessThanOrEqual(2.5 + 1e-9);
    // le reste du bord ne bouge pas (loin des bouts du tracé)
    for (const i of [90, 160]) expect(out[i]).toEqual(pts[i]);
  });

  it('laisse les vraies courbes en place', () => {
    const pts = circle(100, 400);
    const out = steadyPath(pts, 30, 2.5, true);
    for (const p of out) expect(Math.abs(radius(p) - 100)).toBeLessThan(0.5);
  });

  it('garde un angle franc de la forme (deux côtés droits)', () => {
    // un L : 60 points sur x, puis 60 sur y ; le coin reste à moins de la tolérance
    const pts = [...Array.from({ length: 60 }, (_, i) => ({ x: i, y: 0 })), ...Array.from({ length: 60 }, (_, i) => ({ x: 60, y: i }))];
    const out = steadyPath(pts, 10, 2.5, false);
    const corner = out[60]!;
    expect(Math.hypot(corner.x - 60, corner.y)).toBeLessThanOrEqual(2.5 + 1e-9);
    // les deux bouts du tracé ouvert restent sur leur ligne, à moins de la tolérance
    expect(out[0]!.y).toBe(0);
    expect(Math.abs(out[0]!.x)).toBeLessThanOrEqual(2.5 + 1e-9);
    expect(out[out.length - 1]!.x).toBe(60);
  });

  it('ne touche pas un tracé trop court ou sans portée', () => {
    const few = circle(10, 4);
    expect(steadyPath(few, 30, 2.5, true)).toBe(few);
    const pts = circle(10, 40);
    expect(steadyPath(pts, 0, 2.5, true)).toBe(pts);
  });
});
