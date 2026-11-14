import { describe, expect, it } from 'vitest';
import type { Doc, Layer } from '../src/model';
import { addPage, copyPage, hasPages, packDoc, pageDoc, removePage, switchPage, unpackDoc, withPages, type PubViews } from '../src/pubs';

const L = (id: string, x = 0, extra: Partial<Layer> = {}) => ({ id, name: id, x, ...extra }) as unknown as Layer;
const doc = (layers: Layer[], formats: string[], target = 0): Doc =>
  ({ formatId: formats[target], frame: 'repartition', guides: [], light: 0, layers, targets: formats.map((format) => ({ format })), target }) as unknown as Doc;
// « recaler » : chaque objet prend la position x = rang du format (on voit d'où vient la copie)
const views: PubViews = {
  look: (d, i) => ({ ...d, formatId: d.targets![i]!.format, target: i }),
  at: (d, i) => ({ ...d, formatId: d.targets![i]!.format, target: i, layers: d.layers.map((l) => ({ ...l, x: i * 10 }) as Layer) }),
};
const xs = (ls: Layer[]) => ls.map((l) => (l as unknown as { x: number }).x);

describe('publications autonomes', () => {
  it('un document d’avant donne à chaque publication une copie recalée, avec de nouveaux identifiants', () => {
    const d = doc([L('a'), L('b')], ['carre', 'story', 'a4']);
    expect(hasPages(d)).toBe(false);
    const w = withPages(d, views);
    expect(hasPages(w)).toBe(true);
    expect(w.pubs![0]).toBeNull();
    expect(xs(w.pubs![1]!.layers)).toEqual([10, 10]);
    expect(xs(w.pubs![2]!.layers)).toEqual([20, 20]);
    expect(w.pubs![1]!.layers.map((l) => l.id)).not.toContain('a');
  });

  it('changer de publication range les objets de celle qu’on quitte et reprend les siens', () => {
    const d = doc([L('a', 1)], ['carre', 'story']);
    const s = switchPage(d, 1, views);
    expect(s.target).toBe(1);
    expect(s.formatId).toBe('story');
    expect(xs(s.layers)).toEqual([10]);
    expect(s.pubs![0]!.layers[0]!.id).toBe('a');
    // retouche sur la story : le carré ne bouge pas
    const edited = { ...s, layers: [L('z', 99)] };
    const back = switchPage(edited, 0, views);
    expect(back.layers.map((l) => l.id)).toEqual(['a']);
    expect(xs(back.pubs![1]!.layers)).toEqual([99]);
    expect(xs(pageDoc(back, 1, views).layers)).toEqual([99]);
  });

  it('ajoute une publication avec ses objets puis l’affiche ; la retirer montre sa voisine', () => {
    const d = doc([L('a')], ['carre']);
    const a = addPage(d, { format: 'carre' }, { format: 'story', channel: 'ig' }, copyPage([L('n', 5)]), views);
    expect(a.targets!.map((t) => t.format)).toEqual(['carre', 'story']);
    expect(a.target).toBe(1);
    expect(xs(a.layers)).toEqual([5]);
    expect(a.pubs![0]!.layers[0]!.id).toBe('a');
    const r = removePage(a, 1, views);
    expect(r.targets!.length).toBe(1);
    expect(r.target).toBe(0);
    expect(r.layers[0]!.id).toBe('a');
    expect(r.pubs).toEqual([null]);
  });

  it('copyPage suit la mise au point et sépare les groupes', () => {
    const p = copyPage([L('a', 0, { link: 'g' }), L('b', 0, { link: 'g' })], { camera: { focus: 'b', aperture: 0.5 } });
    expect(p.layers[0]!.link).toBe(p.layers[1]!.link);
    expect(p.layers[0]!.link).not.toBe('g');
    expect(p.scene!.camera!.focus).toBe(p.layers[1]!.id);
  });

  it('une photo présente dans plusieurs publications n’est enregistrée qu’une fois', () => {
    const img = 'data:image/jpeg;base64,' + 'A'.repeat(1000);
    const d = withPages(doc([L('a', 0, { src: img })], ['carre', 'story', 'a4']), views);
    const packed = packDoc(d);
    const json = JSON.stringify(packed);
    expect(json.split('AAAA').length).toBeLessThan(400);
    expect(json.match(/data:image/g)!.length).toBe(1);
    const back = unpackDoc(JSON.parse(json));
    expect(back.layers[0]!.src).toBe(img);
    expect(back.pubs![2]!.layers[0]!.src).toBe(img);
    expect((back as { images?: unknown }).images).toBeUndefined();
  });
});
