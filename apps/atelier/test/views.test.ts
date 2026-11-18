import { describe, expect, it } from 'vitest';
import { zipStore } from '../src/charkit';
import type { Layer } from '../src/model';
import { assignViews, characterOf, groupCharacters, mirrorJoints, mirrorPath, nearestView, parseName, readZip, ringViews, setView, showView, turnTo, viewOfName, viewsOf } from '../src/views';
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

  it('lit la convention de nommage : personnage, vue, sens, élément, dossier, planche', () => {
    expect(parseName('lama-betty__face.png')).toEqual({ who: 'lama-betty', view: 'face', part: '', sheet: false });
    expect(parseName('Lama-Betty__Profil-Gauche.PNG')).toEqual({ who: 'lama-betty', view: 'profil-gauche', part: '', sheet: false });
    expect(parseName('lama-betty__profil-droite.png').view).toBe('profil');
    expect(parseName('lama-betty__3-4__micro.png')).toEqual({ who: 'lama-betty', view: 'trois-quarts', part: 'micro', sheet: false });
    expect(parseName('lama-jenni/side.png')).toEqual({ who: 'lama-jenni', view: 'profil', part: '', sheet: false });
    expect(parseName('lama-jenni/lama-jenni__back__guitare.png')).toEqual({ who: 'lama-jenni', view: 'dos', part: 'guitare', sheet: false });
    expect(parseName('lama-betty__planche.png').sheet).toBe(true);
    // un nom de personnage qui contient un mot de vue n'est pas pris pour une vue
    expect(parseName('lama-dosette__face.png')).toEqual({ who: 'lama-dosette', view: 'face', part: '', sheet: false });
    expect(parseName('image1.png').view).toBeNull();
    const g = groupCharacters([{ name: 'lama-betty__face.png' }, { name: 'lama-betty__face__micro.png' }, { name: 'lama-betty__profil__micro.png' }, { name: 'lama-jenni__dos.png' }, { name: 'x.png' }]);
    expect([...g.keys()].sort()).toEqual(['', 'lama-betty', 'lama-jenni']);
    expect([...g.get('lama-betty')!.parts.get('micro')!.keys()]).toEqual(['face', 'profil']);
  });

  it('le miroir retourne le contour et échange les côtés du squelette', () => {
    expect(mirrorPath('M0 0L0.2 0.5H0.9V1Z')).toBe('M 1 0 L 0.8 0.5 H 0.1 V 1 Z');
    expect(mirrorPath('M0.1 0C0.2 0.3 0.4 0.5 0.6 0.7Z')).toBe('M 0.9 0 C 0.8 0.3 0.6 0.5 0.4 0.7 Z');
    const j = Array.from({ length: 15 }, (_, i) => `${(i / 20).toFixed(2)},${i}`).join(';');
    const m = mirrorJoints(j)!.split(';');
    // la main de gauche (5) prend la place retournée de la main de droite (8)
    expect(m[5]).toBe('0.6,8');
    expect(m[0]).toBe('1,0');
  });

  it('un élément détaché prend la vue de son personnage, et se cache sans elle', () => {
    setAnimTiming(tm);
    const c = characterOf([
      { view: 'face', src: 'F', ratio: 0.5 },
      { view: 'profil', src: 'P', ratio: 0.4 },
      { view: 'dos', src: 'D', ratio: 0.5 },
    ]);
    const host = L({ id: 'h', src: c.src, views: c.views, view: c.view, anim: { ...c.anim, acts: [{ id: 't', g: 'turn', at: 0, len: 2 }] }, link: 'g' });
    const mic = L({ id: 'm', src: 'mF', views: [{ view: 'face', src: '', ratio: 0.5 }, { view: 'profil', src: 'mP', ratio: 0.4 }], view: 'face', link: 'g' });
    const at = (t: number) => posed([host, mic], f, t)[1]!;
    expect(at(0).src).toBe('mF');
    expect(at(0.5).src).toBe('mP');
    expect(at(1).opacity).toBe(0);
  });

  it('tourné vers la gauche, la marche de côté montre le profil de gauche et avance vers la gauche', () => {
    setAnimTiming(tm);
    const c = characterOf([
      { view: 'face', src: 'F', ratio: 0.5 },
      { view: 'profil', src: 'P', ratio: 0.4 },
      { view: 'profil-gauche', src: 'PG', ratio: 0.4 },
    ]);
    const acts = [{ id: 'w', g: 'sidewalk', at: 0, len: 4, cycle: 1 }];
    const right = L({ src: c.src, views: c.views, view: c.view, anim: { ...c.anim, acts } });
    const left = { ...right, facing: 'gauche' };
    const pl = posed([left], f, 0.25)[0]!;
    expect(pl.src).toBe('PG');
    const pr = posed([right], f, 0.25)[0]!;
    // au quart de pas, le pied gauche de l'image (os 11) part vers l'avant : à droite pour l'un, à gauche pour l'autre
    const dx = (l: Layer) => animSkeleton(l.anim!, 0.25)![11]![1][0] - animSkeleton(l.anim!, 0)![11]![1][0];
    expect(Math.sign(dx(pr))).not.toBe(Math.sign(dx(pl)));
  });

  it('l’anneau tourne l’objet vers la vue la plus proche, et tire la gauche en miroir', async () => {
    // une forme en trois vues : face, profil, dos (pas d'image, seulement des contours)
    const l = L({ kind: 'shape', cut: 'M0 0H0.4V1H0Z', view: 'face', views: [{ view: 'face', src: '', ratio: 0.5 }, { view: 'profil', src: '', ratio: 0.4, cut: 'M0 0H0.2V1H0Z' }, { view: 'dos', src: '', ratio: 0.5 }] });
    const keys = ringViews(l);
    expect(keys).toEqual(['face', 'profil', 'dos', 'profil-gauche']);
    expect(nearestView(keys, 30)).toBe('face');
    expect(nearestView(keys, 60)).toBe('profil');
    expect(nearestView(keys, 200)).toBe('dos');
    expect(nearestView(keys, 300)).toBe('profil-gauche');
    const p = await turnTo(l, 'profil-gauche');
    expect(p.view).toBe('profil-gauche');
    expect(p.facing).toBe('gauche');
    expect(p.cut).toBe('M 1 0 H 0.8 V 1 H 1 Z');
    // retour vers le profil de droite : il regarde de nouveau à droite, la vue miroir reste rangée
    const q = await turnTo({ ...l, ...p } as Layer, 'profil');
    expect(q.facing).toBeUndefined();
    expect(q.views?.map((v) => v.view)).toEqual(['face', 'profil', 'dos', 'profil-gauche']);
    // le dos garde le sens
    expect((await turnTo({ ...l, ...p } as Layer, 'dos')).facing).toBe('gauche');
  });

  it('le trois-quarts dos complète l’anneau, à droite et à gauche', async () => {
    expect(parseName('lama__dos-trois-quarts.png').view).toBe('dos-trois-quarts');
    expect(parseName('lama__trois-quarts-dos-gauche.png').view).toBe('dos-trois-quarts-gauche');
    expect(viewOfName('Lama back 3-4.png')).toBe('dos-trois-quarts');
    expect(viewOfName('Lama 3-4.png')).toBe('trois-quarts');
    const l = L({ kind: 'shape', cut: 'M0 0H0.4V1H0Z', view: 'face', views: [{ view: 'face', src: '', ratio: 0.5 }, { view: 'dos-trois-quarts', src: '', ratio: 0.45, cut: 'M0 0H0.3V1H0Z' }, { view: 'dos', src: '', ratio: 0.5 }] });
    const keys = ringViews(l);
    expect(keys).toEqual(['face', 'dos-trois-quarts', 'dos', 'dos-trois-quarts-gauche']);
    expect(nearestView(keys, 140)).toBe('dos-trois-quarts');
    expect(nearestView(keys, 230)).toBe('dos-trois-quarts-gauche');
    const p = await turnTo(l, 'dos-trois-quarts-gauche');
    expect(p.facing).toBe('gauche');
    expect(p.view).toBe('dos-trois-quarts-gauche');
  });
});
