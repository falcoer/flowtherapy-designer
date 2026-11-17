import { describe, expect, it } from 'vitest';
import { generatorOf, newAnim, type Anim } from '../src/anim';
import { pathToRings } from '../src/cut';
import { meshOf, piecesOf, rewarp, unwarp } from '../src/warp';

const bird = generatorOf('bird')!;
const at = (k: number) => () => k;
const dist = (ring: { x: number; y: number }[], x: number, y: number) => {
  let d = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [a, b] = [ring[i]!, ring[(i + 1) % ring.length]!];
    const [vx, vy] = [b.x - a.x, b.y - a.y];
    const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / Math.max(1e-12, vx * vx + vy * vy)));
    d = Math.min(d, Math.hypot(a.x + t * vx - x, a.y + t * vy - y));
  }
  return d;
};

describe("surface déformée de l'oiseau", () => {
  for (const preset of bird.presets!) {
    it(`le contour au repos va sur le contour de l'instant (${preset.name})`, () => {
      const a: Anim = { ...newAnim(bird), ...preset.set };
      for (const ph of [0.1, 0.3, 0.55, 0.8]) {
        const w = bird.warp!(a, ph, at(ph), { each: () => [] })!;
        const rest = pathToRings(bird.cut({ ...a, amp: 0 }, ph, at(ph), { each: () => [] }))[0]!;
        const now = pathToRings(bird.cut(a, ph, at(ph), { each: () => [] }))[0]!;
        let worst = 0;
        // la forme au repos tient dans la boîte : toute sa surface est rendue
        for (const p of rest) expect(Math.min(p.x, p.y, 1 - p.x, 1 - p.y)).toBeGreaterThan(-0.002);
        for (const p of rest) {
          const [x, y] = w.map(p.x, p.y);
          worst = Math.max(worst, dist(now, x, y));
        }
        // contour et surface passent par la même déformation : la peinture reste sur l’aile (à la simplification du tracé près)
        expect(worst).toBeLessThan(0.006);
      }
    });
  }

  it('le maillage se pose en peu de pièces, et se relit à l’envers', () => {
    const a = newAnim(bird);
    const w = bird.warp!(a, 0.3, at(0.3), { each: () => [] })!;
    const m = meshOf(w);
    const pieces = piecesOf(m, 0.5 / 800);
    expect(pieces.length).toBeLessThan(400);
    for (const [u, v] of [[0.2, 0.4], [0.5, 0.5], [0.85, 0.45]] as const) {
      const [x, y] = w.map(u, v);
      const back = unwarp(m, x, y);
      expect(Math.hypot(back.x - u, back.y - v)).toBeLessThan(0.01);
    }
  });
});

describe('forme figée dans sa pose', () => {
  it('rewarp et unwarp sont réciproques', () => {
    const a = newAnim(bird);
    const w = bird.warp!(a, 0.3, at(0.3), { each: () => [] })!;
    const m = meshOf(w);
    for (const [u, v] of [[0.15, 0.45], [0.5, 0.6], [0.8, 0.4]] as const) {
      const q = rewarp(m, u, v);
      const back = unwarp(m, q.x, q.y);
      expect(Math.hypot(back.x - u, back.y - v)).toBeLessThan(1e-6);
    }
  });
});

describe('oiseau sculpté', () => {
  it('une découpe tracée sur l’oiseau de l’instant revient sur l’oiseau au repos, puis se replie à l’identique', async () => {
    const { restCut, bentCut, surfaceWarp } = await import('../src/warp');
    const { animCut, setAnimTime, setAnimTiming, withActs } = await import('../src/anim');
    // la découpe montrée, comme scene.cutOf : celle du générateur, ou la forme sculptée pliée
    const cutOf = (x: import('../src/model').Layer) => (x.cut ? bentCut(x.cut, surfaceWarp(x)!) : animCut(x.anim!));
    setAnimTiming({ period: 1, count: 4 });
    const a = withActs(newAnim(bird));
    const l = { id: 'b', name: 'b', kind: 'shape', anchor: { frame: 'page', point: 'c' }, dx: 0, dy: 0, w: 0.5, h: 0.25, guide: 0, height: 0, visible: true, strokes: [], anim: a } as never as import('../src/model').Layer;
    setAnimTime(0.1);
    const shown = cutOf(l);
    const rest = restCut(l, shown);
    const carved = { ...l, cut: rest, anim: { ...a, carved: 1 } };
    // même instant : la forme sculptée (sans rien enlever) se montre comme l'oiseau d'origine
    const again = pathToRings(cutOf(carved))[0]!;
    let worst = 0;
    for (const p of pathToRings(shown)[0]!) worst = Math.max(worst, dist(again, p.x, p.y));
    expect(worst).toBeLessThan(0.006);
    // un autre instant : elle bat des ailes comme l'oiseau
    setAnimTime(0.3);
    const later = pathToRings(cutOf(l))[0]!;
    let w2 = 0;
    for (const p of pathToRings(cutOf(carved))[0]!) w2 = Math.max(w2, dist(later, p.x, p.y));
    expect(w2).toBeLessThan(0.01);
  });
});
