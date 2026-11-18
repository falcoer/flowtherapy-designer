import { describe, expect, it } from 'vitest';
import { zipStore } from '../src/charkit';
import type { Layer } from '../src/model';
import { assignViews, characterOf, readZip, setView, showView, viewOfName, viewsOf } from '../src/views';
import { animOf, animSkeleton, posed, rigJoints, RIG_JOINTS, setAnimTiming, templateJoints } from '../src/anim';

const L = (extra: Partial<Layer>): Layer => ({ id: 'p', name: 'p', kind: 'photo', anchor: { frame: 'repartition', point: 'h1/2 v1/2' }, dx: 0, dy: 0, w: 0.3, h: 0.6, guide: 0, height: 0, visible: true, strokes: [], ...extra }) as Layer;

describe('personnage en plusieurs angles', () => {
  it('reconnaît les vues d’après le nom des fichiers, et range les autres dans l’ordre', () => {
    expect(viewOfName('Lama-FACE.png')).toBe('face');
    expect(viewOfName('lama_3-4.png')).toBe('trois-quarts');
    expect(viewOfName('Profil.webp')).toBe('profil');
    expect(viewOfName('back.jpg')).toBe('dos');
    expect(viewOfName('image1.png')).toBeNull();
    const a = assignViews([{ name: 'z.png' }, { name: 'dos.png' }, { name: 'a.png' }]);
    expect(a.map((x) => [x.view, x.file.name])).toEqual([
      ['face', 'a.png'],
      ['trois-quarts', 'z.png'],
      ['dos', 'dos.png'],
    ]);
  });

  it('change de vue : image, proportions et squelette de la vue, la hauteur reste', () => {
    const c = characterOf([
      { view: 'face', src: 'F', ratio: 0.5 },
      { view: 'profil', src: 'P', ratio: 0.4 },
    ]);
    const l = L({ src: c.src, views: c.views, view: c.view, anim: c.anim, w: 0.3, h: 0.6 });
    const moved = { ...l, anim: { ...l.anim!, j: '0.1,0.1' } };
    const p = showView(moved, 'profil');
    expect(p.src).toBe('P');
    expect(p.w).toBeCloseTo(0.24);
    expect(p.anim?.view).toBe('profil');
    // le squelette de départ du profil est celui de son gabarit
    expect(rigJoints(p.anim!)[RIG_JOINTS.indexOf('footL')]![0]).toBeCloseTo(templateJoints(0.4, 'profil')[RIG_JOINTS.indexOf('footL')]![0], 3);
    // la face garde ce qui y était calé, et revient telle quelle
    const back = showView({ ...moved, ...p } as Layer, 'face');
    expect(back.src).toBe('F');
    expect(back.anim?.j).toBe('0.1,0.1');
    expect(viewsOf({ ...moved, ...p } as Layer).map((v) => v.view)).toEqual(['face', 'profil']);
  });

  it('une photo seule devient un personnage quand on lui ajoute une vue', () => {
    const l = L({ src: 'F', w: 0.3, h: 0.6 });
    const p = setView(l, 'dos', { src: 'D', ratio: 0.45 });
    expect(p.view).toBe('face');
    expect(p.anim?.kind).toBe('rig');
    expect(p.views?.map((v) => [v.view, v.src])).toEqual([
      ['face', ''],
      ['dos', 'D'],
    ]);
  });

  it('les gabarits de profil gardent les quatre membres écartés', () => {
    const J = templateJoints(0.5, 'profil');
    const at = (k: string) => J[RIG_JOINTS.indexOf(k as never)]!;
    expect(Math.abs(at('handL')[0] - at('handR')[0])).toBeGreaterThan(0.2);
    expect(Math.abs(at('footL')[0] - at('footR')[0])).toBeGreaterThan(0.2);
  });

  it('une archive écrite par le kit se relit', async () => {
    const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const z = zipStore([
      { name: 'face.png', data: png },
      { name: 'prompt.txt', data: new TextEncoder().encode('x') },
    ]);
    const out = await readZip(z);
    expect(out.map((f) => f.name)).toEqual(['face.png']);
    expect(new Uint8Array(await out[0]!.blob.arrayBuffer())).toEqual(png);
  });

  const f = { width: 1000, height: 1000 } as Parameters<typeof posed>[1];
  const tm = { period: 1, count: 4 };

  it('se retourner passe par les vues, s’amincit au changement et revient', () => {
    setAnimTiming(tm);
    const c = characterOf([
      { view: 'face', src: 'F', ratio: 0.5 },
      { view: 'profil', src: 'P', ratio: 0.4 },
      { view: 'dos', src: 'D', ratio: 0.5 },
    ]);
    const l = L({ src: c.src, views: c.views, view: c.view, anim: { ...c.anim, acts: [{ id: 't', g: 'turn', at: 0, len: 2 }] }, w: 0.3, h: 0.6 });
    const at = (t: number) => posed([l], f, t)[0]!;
    expect(at(0).src).toBe('F');
    // au quart : la vue du milieu ; à mi-geste : le dos ; à la fin : la face
    expect(at(0.5).src).toBe('P');
    expect(at(1).src).toBe('D');
    expect(at(2).src).toBe('F');
    // au changement de vue, l'objet s'amincit
    const mids = [0.2, 0.25, 0.3, 0.35].map((t) => at(t).w);
    expect(Math.min(...mids)).toBeLessThan(0.3 * 0.75);
  });

  it('une forme à plusieurs vues se retourne aussi, chaque vue avec son contour', () => {
    setAnimTiming(tm);
    const shape = L({ kind: 'shape', cut: 'M0 0L1 0L1 1Z' } as Partial<Layer>);
    const p = setView(shape, 'dos', { src: '', ratio: 0.5, cut: 'M0 0L1 1L0 1Z' }, shape.cut);
    const l = { ...shape, ...p } as Layer;
    expect(l.anim).toBeUndefined();
    expect(animOf(l)?.kind).toBe('views');
    const turning = { ...l, anim: { ...animOf(l)!, acts: [{ id: 't', g: 'turn', at: 0, len: 2 }] } };
    const mid = posed([turning], f, 1)[0]!;
    expect(mid.cut).toBe('M0 0L1 1L0 1Z');
    expect(mid.src).toBeUndefined();
  });

  it('la marche de côté montre le profil et balance les jambes d’avant en arrière', () => {
    setAnimTiming(tm);
    const c = characterOf([
      { view: 'face', src: 'F', ratio: 0.5 },
      { view: 'profil', src: 'P', ratio: 0.4 },
    ]);
    const l = L({ src: c.src, views: c.views, view: c.view, anim: { ...c.anim, acts: [{ id: 'w', g: 'sidewalk', at: 0, len: 4, cycle: 1 }] }, w: 0.3, h: 0.6 });
    const p = posed([l], f, 0.25)[0]!;
    expect(p.src).toBe('P');
    const a = p.anim!;
    const sk = (t: number) => animSkeleton(a, t)!;
    // os 11 : genou → pied gauche ; os 13 : genou → pied droit
    const [l1, r1] = [sk(0.25)[11]![1][0], sk(0.25)[13]![1][0]];
    const [l2, r2] = [sk(0.75)[11]![1][0], sk(0.75)[13]![1][0]];
    expect(Math.sign(l1 - r1)).not.toBe(Math.sign(l2 - r2));
  });
});
