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
    // le reste du bord ne bouge pas, jusqu'aux bouts du tracé
    for (const i of [0, 10, 90, 160, 199]) expect(out[i]).toEqual(pts[i]);
  });

  it('ramène aussi les dents d’un bord en biais (cercle, à toutes les orientations)', () => {
    const pts = circle(100, 400);
    const teeth = [25, 50, 51, 120, 200, 320, 375];
    for (const i of teeth) pts[i] = { x: pts[i]!.x * 1.05, y: pts[i]!.y * 1.05 };
    const out = steadyPath(pts, 30, 2.5, true);
    for (const i of teeth) expect(radius(out[i]!) - 100).toBeLessThanOrEqual(2.5 + 0.2);
    // les points sains autour restent sur le cercle
    for (const i of [10, 100, 250]) expect(Math.abs(radius(out[i]!) - 100)).toBeLessThan(0.2);
  });

  it('les points d’un tracé ouvert ne glissent pas vers l’intérieur près des bouts', () => {
    // un arc ouvert : le début et la fin restent en place, le tracé n'est pas raccourci
    const pts = circle(100, 400).slice(0, 120);
    const out = steadyPath(pts, 30, 2.5, false);
    for (let i = 0; i < pts.length; i++) expect(Math.hypot(out[i]!.x - pts[i]!.x, out[i]!.y - pts[i]!.y)).toBeLessThan(0.2);
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
    // les deux bouts du tracé ouvert ne bougent pas
    expect(out[0]).toEqual(pts[0]);
    expect(out[out.length - 1]).toEqual(pts[pts.length - 1]);
  });

  it('ne touche pas un tracé trop court ou sans portée', () => {
    const few = circle(10, 4);
    expect(steadyPath(few, 30, 2.5, true)).toBe(few);
    const pts = circle(10, 40);
    expect(steadyPath(pts, 0, 2.5, true)).toBe(pts);
  });
});
