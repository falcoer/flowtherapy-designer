import { describe, expect, it } from 'vitest';
import { zipStore } from '../src/charkit';
import type { Layer } from '../src/model';
import { assignViews, characterOf, readZip, setView, showView, viewOfName, viewsOf } from '../src/views';
import { rigJoints, RIG_JOINTS, templateJoints } from '../src/anim';

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
});
