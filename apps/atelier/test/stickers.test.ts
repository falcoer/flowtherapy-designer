import { describe, expect, it } from 'vitest';
import { forPart, spanOf } from '../src/anim';
import { animCut, animOrder, animRatio, cycleOf, ease, GENERATORS, generatorOf, gesturesOf, newAnim, poseOf, setAnimTiming, valueOf } from '../src/anim';
import type { Layer } from '../src/model';

const layer = (p: Partial<Layer>): Layer => ({ id: 'a', name: 'a', kind: 'shape', anchor: { frame: 'page', point: 'c' } as Layer['anchor'], dx: 0, dy: 0, w: 0.5, h: 0.5, guide: 0, height: 0, visible: true, strokes: [], ...p }) as Layer;

describe('catalogue des stickers', () => {
  it('chaque générateur se décrit entièrement', () => {
    expect(GENERATORS.map((g) => g.kind)).toEqual(['countdown', 'bird', 'propeller', 'eye']);
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

describe('phases : la plage de chaque geste dans le cycle', () => {
  it("l'œil regarde puis cligne, chacun dans sa plage", () => {
    setAnimTiming({ period: 1, count: 4 });
    const a = newAnim(generatorOf('eye')!);
    const rest = animCut(a, 0);
    // cycle de 4 s : regard de 0,4 s à 2,4 s, clignement de 3 s à 3,4 s
    expect(animCut(a, 0.9)).not.toBe(rest);
    expect(animCut(a, 2.7)).toBe(rest);
    expect(animCut(a, 3.2)).not.toBe(rest);
    expect(animCut(a, 3.7)).toBe(rest);
  });

  it('une plage déplacée sur la frise déplace le geste', () => {
    setAnimTiming({ period: 1, count: 4 });
    const g = generatorOf('eye')!;
    const a = { ...newAnim(g), 'blink.at': 0.2, 'blink.len': 0.1, 'look.at': 0.5, 'look.len': 0.4 };
    expect(spanOf(a, g.gestures(a)[1]!)).toEqual({ at: 0.2, len: 0.1 });
    const rest = animCut(a, 0);
    expect(animCut(a, 1)).not.toBe(rest);
    expect(animCut(a, 3.2)).not.toBe(animCut(newAnim(g), 3.2));
  });

  it("l'hélice ne tourne que pendant la plage de sa rotation", () => {
    setAnimTiming({ period: 1, count: 4 });
    const a = { ...newAnim(generatorOf('propeller')!), cycle: 4, 'spin.at': 0.25, 'spin.len': 0.5 };
    expect(animOrder(a, 0.5)?.rot).toBeCloseTo(0);
    expect(animOrder(a, 2)?.rot).toBeCloseTo(Math.PI);
    expect(animOrder(a, 3.5)?.rot).toBeCloseTo(2 * Math.PI);
  });

  it('une plage reste dans le cycle', () => {
    const g = generatorOf('eye')!;
    const sp = spanOf({ kind: 'eye', 'blink.at': 0.9, 'blink.len': 0.8 }, g.gestures({ kind: 'eye' })[1]!);
    expect(sp.at + sp.len).toBeLessThanOrEqual(1 + 1e-9);
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

describe('œil en pièces', () => {
  const eye = generatorOf('eye')!;
  const at = (over: Record<string, number | string>, phase = 0.02) => {
    const a = newAnim(eye, over);
    return eye.cut(a, phase, (id) => {
      const g = eye.gestures(a).find((x) => x.id === id)!;
      const s = spanOf(a, g);
      return Math.max(0, Math.min(1, (phase - s.at) / s.len));
    });
  };
  it('chaque pièce a sa surface, différente des autres', () => {
    const cuts = eye.parts!.map((p) => at({ part: p.id }));
    expect(new Set(cuts).size).toBe(3);
    for (const c of cuts) expect(c).not.toContain('NaN');
  });
  it('la forme se règle : ronde, bridée, en miroir', () => {
    const base = at({ part: 'white' });
    const shapes = [at({ part: 'white', round: 1 }), at({ part: 'white', slant: 1 }), at({ part: 'white', slant: 1, mirror: 1 })];
    expect(new Set([base, ...shapes]).size).toBe(4);
    for (const c of shapes) expect(c).not.toContain('NaN');
    // sans inclinaison, le miroir ne change rien
    expect(at({ part: 'white', mirror: 1 })).toBe(base);
  });
  it('les réglages passent aux autres pièces, la pièce reste', () => {
    const next = forPart({ kind: 'eye', part: 'white', round: 0.5, 'blink.at': 0.2 }, { kind: 'eye', part: 'iris' });
    expect(next).toEqual({ kind: 'eye', part: 'iris', round: 0.5, 'blink.at': 0.2 });
  });
  it('un œil d’avant, sans pièce, garde sa découpe entière', () => {
    expect(at({})).not.toBe(at({ part: 'white' }));
  });
});
