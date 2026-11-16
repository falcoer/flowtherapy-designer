import { describe, expect, it } from 'vitest';
import { animCut, animOrder, animRatio, cycleOf, ease, GENERATORS, generatorOf, gesturesOf, newAnim, poseOf, setAnimTiming, valueOf } from '../src/anim';
import type { Layer } from '../src/model';

const layer = (p: Partial<Layer>): Layer => ({ id: 'a', name: 'a', kind: 'shape', anchor: { frame: 'page', point: 'c' } as Layer['anchor'], dx: 0, dy: 0, w: 0.5, h: 0.5, guide: 0, height: 0, visible: true, strokes: [], ...p }) as Layer;

describe('catalogue des stickers', () => {
  it('chaque générateur se décrit entièrement', () => {
    expect(GENERATORS.map((g) => g.kind)).toEqual(['countdown', 'bird', 'propeller']);
    for (const g of GENERATORS) {
      const a = newAnim(g);
      expect(a.cycle).toBe(g.cycle);
      for (const p of g.params) expect(valueOf(p, a)).toBe(p.def);
      expect(gesturesOf(a).length).toBeGreaterThan(0);
      // les paramètres cités par un geste existent
      for (const ge of gesturesOf(a)) for (const k of ge.params ?? []) expect(g.params.some((p) => p.key === k)).toBe(true);
    }
  });

  it('un sticker inconnu ne casse rien', () => {
    const a = { kind: 'futur' };
    expect(generatorOf(a)).toBeUndefined();
    expect(animCut(a, 0)).toBe('M0 0H1V1H0Z');
    expect(animRatio(a)).toBe(1);
    expect(gesturesOf(a)).toEqual([]);
    expect(animOrder(a, 0)).toBeNull();
  });

  it("l'hélice garde sa découpe et tourne par une consigne", () => {
    setAnimTiming({ period: 1, count: 4 });
    const a = newAnim(generatorOf('propeller')!);
    expect(animCut(a, 0)).toBe(animCut(a, 0.37));
    expect(animOrder(a, 0.25)?.rot).toBeCloseTo(Math.PI / 2);
    expect(animOrder({ ...a, dir: -1 }, 0.25)?.rot).toBeCloseTo(-Math.PI / 2);
    // ancien document : le sens était dans le signe de la vitesse
    expect(animOrder({ kind: 'propeller', speed: -1 }, 0.25)?.rot).toBeCloseTo(-Math.PI / 2);
  });

  it("l'oiseau change de découpe dans son cycle et boucle", () => {
    setAnimTiming({ period: 1, count: 4 });
    const a = newAnim(generatorOf('bird')!);
    expect(animCut(a, 0)).not.toBe(animCut(a, 0.12));
    expect(animCut(a, 0.11)).toBe(animCut(a, 0.61));
  });

  it('les anciennes vitesses donnent un cycle en périodes', () => {
    expect(cycleOf({ kind: 'bird', speed: 2 }, { period: 1, count: 4 })).toBeCloseTo(0.5);
    expect(cycleOf({ kind: 'countdown', speed: 1, from: 3, step: 1 }, { period: 1, count: 4 })).toBeCloseTo(4);
  });
});

describe('mouvement général', () => {
  it('les modèles vont de 0 à 1', () => {
    for (const acc of ['linear', 'soft', 'fast'] as const)
      for (const br of ['sharp', 'damped', 'bounce', 'fast', 'slow'] as const) {
        expect(ease(0, acc, br)).toBeCloseTo(0);
        expect(ease(1, acc, br)).toBeCloseTo(1);
      }
  });

  it('les consignes s’ajoutent entre elles et à celle du sticker', () => {
    const tm = { period: 1, count: 4 };
    setAnimTiming(tm);
    const l = layer({
      anim: newAnim(generatorOf('propeller')!),
      motion: [
        { id: '1', at: 0, len: 2, dx: 0.2, rot: 0.5 },
        { id: '2', at: 2, len: 2, dx: 0.1, scale: 2, back: true },
      ],
    });
    const p = poseOf(l, 3, tm)!;
    expect(p.dx).toBeCloseTo(0.3);
    expect(p.scale).toBeCloseTo(2);
    // un demi-tour de consigne, l'hélice elle-même revenue à un tour entier
    expect(p.rot).toBeCloseTo(Math.PI);
    // l'aller-retour revient à son départ, la première consigne garde son effet
    const end = poseOf(l, 3.999, tm)!;
    expect(end.dx).toBeCloseTo(0.2, 2);
    expect(end.scale).toBeCloseTo(1, 2);
  });
});
