import { describe, expect, it } from 'vitest';
import { actsOf, forPart, newAct, spanOf, withActs } from '../src/anim';
import { animCut, animFollow, animOrder, posed, animRatio, cycleOf, ease, GENERATORS, generatorOf, gesturesOf, newAnim, poseOf, setAnimTiming, valueOf } from '../src/anim';
import type { Layer } from '../src/model';

const layer = (p: Partial<Layer>): Layer => ({ id: 'a', name: 'a', kind: 'shape', anchor: { frame: 'page', point: 'c' } as Layer['anchor'], dx: 0, dy: 0, w: 0.5, h: 0.5, guide: 0, height: 0, visible: true, strokes: [], ...p }) as Layer;

describe('catalogue des stickers', () => {
  it('chaque générateur se décrit entièrement', () => {
    expect(GENERATORS.map((g) => g.kind)).toEqual(['countdown', 'bird', 'propeller', 'eye', 'humanoid']);
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
    // d'un cycle au suivant, les tours s'ajoutent : l'hélice ne revient pas en arrière
    setAnimTiming({ period: 1, count: 8 });
    expect(animOrder(a, 6)?.rot).toBeCloseTo(3 * Math.PI);
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
    expect(((p.rot % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)).toBeCloseTo(Math.PI);
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

describe('gestes posés à la demande', () => {
  const tm = { period: 1, count: 4 };
  const eye = generatorOf('eye')!;
  const [look, blink] = eye.gestures({ kind: 'eye' }) as [ReturnType<typeof eye.gestures>[number], ReturnType<typeof eye.gestures>[number]];
  it('un sticker d’avant garde ses gestes, un par cycle', () => {
    setAnimTiming(tm);
    const a = newAnim(eye);
    expect(actsOf(a, tm).map((x) => [x.g, x.at, x.len])).toEqual([
      ['look', 0.4, 2],
      ['blink', 3, 0.4],
    ]);
    // inscrits dans les données, ils se dessinent pareil
    const full = withActs(a, tm);
    for (const t of [0, 0.9, 2.7, 3.2, 3.7]) expect(animCut(full, t)).toBe(animCut(a, t));
    expect(actsOf({ ...newAnim(generatorOf('bird')!) }, tm)).toHaveLength(1);
  });
  it('sans geste posé, le sticker reste au repos', () => {
    setAnimTiming(tm);
    const a = { ...newAnim(eye), acts: [] };
    expect(new Set([0, 0.9, 2, 3.2].map((t) => animCut(a, t))).size).toBe(1);
    expect(animOrder({ ...newAnim(generatorOf('propeller')!), acts: [] }, 2)?.rot).toBeCloseTo(0);
  });
  it('un geste se pose plusieurs fois', () => {
    setAnimTiming(tm);
    const base = { ...newAnim(eye), acts: [] };
    const a = { ...base, acts: [newAct(base, blink, 0.5, tm), newAct(base, blink, 2.5, tm)] };
    const rest = animCut(a, 0);
    expect(animCut(a, 0.7)).not.toBe(rest);
    expect(animCut(a, 1.5)).toBe(rest);
    expect(animCut(a, 2.7)).toBe(animCut(a, 0.7));
  });
  it('chaque geste posé a ses réglages', () => {
    setAnimTiming(tm);
    const base = { ...newAnim(eye), acts: [] };
    const wide = { ...newAct(base, look, 0, tm), len: 1, gaze: 1 };
    const none = { ...newAct(base, look, 2, tm), len: 1, gaze: 0 };
    const a = { ...base, acts: [wide, none] };
    expect(animCut(a, 0.25)).not.toBe(animCut(a, 0));
    // regard à zéro : l'iris ne quitte pas le centre
    expect(animCut(a, 2.25)).toBe(animCut(a, 2));
  });
  it('une boucle tourne à son rythme tant qu’elle dure, puis garde sa pose', () => {
    setAnimTiming(tm);
    const prop = generatorOf('propeller')!;
    const base = { ...newAnim(prop), acts: [] };
    const a = { ...base, acts: [{ ...newAct(base, prop.gestures(base)[0]!, 1, tm), len: 1, cycle: 0.5 }] };
    expect(animOrder(a, 0.5)?.rot).toBeCloseTo(0);
    expect(animOrder(a, 1.25)?.rot).toBeCloseTo(Math.PI);
    expect(animOrder(a, 3)?.rot).toBeCloseTo(4 * Math.PI);
  });
});

describe('humanoïde', () => {
  const tm = { period: 1, count: 8 };
  const man = generatorOf('humanoid')!;
  const ges = (id: string) => man.gestures({ kind: 'humanoid' }).find((g) => g.id === id)!;
  const empty = (over: Record<string, number | string> = {}) => ({ ...newAnim(man, over), acts: [] });
  it('six pièces prédécoupées, chacune avec sa surface', () => {
    setAnimTiming(tm);
    const cuts = man.parts!.map((p) => animCut(empty({ part: p.id }), 0));
    expect(cuts).toHaveLength(6);
    expect(new Set(cuts).size).toBe(6);
    for (const c of cuts) {
      expect(c).not.toContain('NaN');
      // une pièce = un seul contour simple
      expect(c.match(/M/g)).toHaveLength(1);
    }
    expect(animCut(empty(), 0)).not.toContain('NaN');
  });
  it('les modèles et les types de pièces changent la silhouette', () => {
    setAnimTiming(tm);
    const all = man.presets!.map((p) => animCut(empty(p.set as Record<string, number | string>), 0));
    expect(new Set(all).size).toBe(man.presets!.length);
    for (const c of all) expect(c).not.toContain('NaN');
    for (const p of man.params.filter((x) => x.type === 'choice')) {
      const cuts = p.options!.map((o) => animCut(empty({ [p.key]: o.id }), 0));
      expect(new Set(cuts).size).toBe(p.options!.length);
    }
  });
  it('la morphologie masculine ou féminine change le torse et les membres, pas la tête', () => {
    setAnimTiming(tm);
    for (const part of ['torso', 'armL', 'legL']) expect(animCut(empty({ part, sex: 'f' }), 0)).not.toBe(animCut(empty({ part }), 0));
    expect(animCut(empty({ part: 'head', sex: 'f' }), 0)).toBe(animCut(empty({ part: 'head' }), 0));
    // la morphologie reste quand on change de gabarit
    for (const p of man.presets!) expect('sex' in p.set).toBe(false);
  });
  it('le canon se compte en têtes : la tête occupe 1/n de la hauteur', () => {
    setAnimTiming(tm);
    const headH = (n: number) => {
      const ys = [...animCut(empty({ part: 'head', heads: n }), 0).matchAll(/-?\d*\.?\d+/g)].map(Number).filter((_, i) => i % 2 === 1);
      return (Math.max(...ys) - Math.min(...ys)) * 1.22;
    };
    for (const n of [3.5, 5, 7.5, 9]) expect(headH(n)).toBeCloseTo(1 / n, 2);
    expect(man.presets!.slice(0, 5).map((p) => p.set.heads)).toEqual([7.5, 8, 9, 5, 3.5]);
  });
  it('au départ il salue seulement ; marche, saut et danse se posent à la demande', () => {
    setAnimTiming(tm);
    expect(new Set(actsOf(newAnim(man), tm).map((x) => x.g))).toEqual(new Set(['wave']));
    const a = newAnim(man, { part: 'armR' });
    const rest = animCut({ ...a, acts: [] }, 0);
    expect(animCut(a, 0)).toBe(rest);
    expect(animCut(a, 1.5)).not.toBe(rest);
    expect(animCut(a, 3.5)).toBe(rest);
    // les jambes ne saluent pas
    const left = newAnim(man, { part: 'legL' });
    expect(animCut(left, 1.5)).toBe(animCut(left, 0));
  });
  it('marche et danse partent du repos et y reviennent', () => {
    setAnimTiming(tm);
    for (const [id, part] of [['walk', 'legL'], ['dance', 'armL']] as const) {
      const base = empty({ part });
      const a = { ...base, acts: [{ ...newAct(base, ges(id), 1, tm), len: 4 }] };
      const rest = animCut(a, 0);
      expect(animCut(a, 1)).toBe(rest);
      const mid = [2.1, 2.3, 2.6, 3.4].map((t) => animCut(a, t));
      expect(mid.some((c) => c !== rest)).toBe(true);
      for (const c of mid) expect(c).not.toContain('NaN');
      expect(animCut(a, 5.5)).toBe(rest);
    }
  });
  it('le saut plie les jambes puis soulève l’objet', () => {
    setAnimTiming(tm);
    const base = empty({ part: 'legL' });
    const a = { ...base, acts: [{ ...newAct(base, ges('jump'), 1, tm), len: 1 }] };
    expect(animOrder(a, 0.5)?.by ?? 0).toBeCloseTo(0);
    expect(animCut(a, 1.15)).not.toBe(animCut(a, 0));
    expect(animOrder(a, 1.55)!.by!).toBeLessThan(-0.05);
    expect(animOrder(a, 2.5)?.by ?? 0).toBeCloseTo(0);
    expect(animCut(a, 2.5)).toBe(animCut(a, 0));
  });
});

describe('objets attachés à un sticker', () => {
  const tm = { period: 1, count: 8 };
  const man = generatorOf('humanoid')!;
  const f = { width: 1000, height: 1000 } as Parameters<typeof posed>[1];
  const ges = (id: string) => man.gestures({ kind: 'humanoid' }).find((g) => g.id === id)!;
  const base = { ...newAnim(man), acts: [] as ReturnType<typeof newAct>[], set: 's' };
  const scene = (acts: ReturnType<typeof newAct>[]) => {
    const anim = { ...base, acts };
    const head = layer({ id: 'head', anim: { ...anim, part: 'head' }, link: 'g', w: 0.55, h: 0.61 });
    const leg = layer({ id: 'leg', anim: { ...anim, part: 'legL' }, link: 'g', w: 0.55, h: 0.61 });
    // un chapeau posé sur la tête, une montre au poignet droit, un objet libre hors du groupe
    const hat = layer({ id: 'hat', link: 'g', w: 0.08, h: 0.04, dy: -0.2 });
    const watch = layer({ id: 'watch', link: 'g', w: 0.02, h: 0.02, dx: 0.085, dy: -0.01 });
    const free = layer({ id: 'free', w: 0.08, h: 0.04, dy: -0.2 });
    return [head, leg, hat, watch, free];
  };
  const at = (ls: Layer[], t: number, id: string) => posed(ls, f, t).find((l) => l.id === id)!;
  it('au repos, rien ne bouge', () => {
    setAnimTiming(tm);
    const ls = scene([]);
    for (const id of ['hat', 'watch', 'free']) expect(at(ls, 1, id)).toMatchObject({ dx: ls.find((l) => l.id === id)!.dx, dy: ls.find((l) => l.id === id)!.dy });
  });
  it('le chapeau monte avec le saut, comme les pièces ; un objet hors du groupe reste', () => {
    setAnimTiming(tm);
    const ls = scene([{ ...newAct(base, ges('jump'), 1, tm), len: 1 }]);
    const lift = at(ls, 1.55, 'head').dy - ls[0]!.dy;
    expect(lift).toBeLessThan(-0.03);
    expect(at(ls, 1.55, 'hat').dy - ls[2]!.dy).toBeCloseTo(lift, 2);
    expect(at(ls, 1.55, 'free').dy).toBe(ls[4]!.dy);
    // accroupi avant l'envol : la tête descend, le chapeau aussi
    expect(at(ls, 1.15, 'hat').dy).toBeGreaterThan(ls[2]!.dy + 0.005);
  });
  it('la montre suit le bras qui salue et tourne avec lui, le chapeau reste sur la tête', () => {
    setAnimTiming(tm);
    const ls = scene([{ ...newAct(base, ges('wave'), 1, tm), len: 2 }]);
    const w = at(ls, 2, 'watch');
    expect(w.dy).toBeLessThan(ls[3]!.dy - 0.1);
    expect(Math.abs(w.rot ?? 0)).toBeGreaterThan(1);
    expect(Math.abs(at(ls, 2, 'hat').dy - ls[2]!.dy)).toBeLessThan(0.02);
    expect(at(ls, 3.5, 'watch').dy).toBeCloseTo(ls[3]!.dy, 5);
  });
  it('un mouvement posé sur l’ensemble emmène l’objet attaché, une seule fois s’il le porte aussi', () => {
    setAnimTiming(tm);
    const move = { id: 'm1', at: 0, len: 1, dx: 0.2, accel: 'linear', brake: 'sharp' } as NonNullable<Layer['motion']>[number];
    const ls = scene([]).map((l) => (l.anim ? { ...l, motion: [move] } : l));
    const shift = at(ls, 1, 'head').dx - ls[0]!.dx;
    expect(shift).toBeGreaterThan(0.1);
    expect(at(ls, 1, 'hat').dx - ls[2]!.dx).toBeCloseTo(shift, 5);
    expect(at(ls, 1, 'free').dx).toBe(ls[4]!.dx);
    const both = ls.map((l) => (l.id === 'hat' ? { ...l, motion: [move] } : l));
    expect(at(both, 1, 'hat').dx - ls[2]!.dx).toBeCloseTo(shift, 5);
  });
  it('sans squelette, le point reste en place', () => {
    setAnimTiming(tm);
    expect(animFollow({ ...newAnim(generatorOf('eye')!), acts: [] }, 0.5, 0.5, 1)).toBeNull();
  });
});
