import { describe, expect, it } from 'vitest';
import { newFx } from '../src/fx';
import type { Doc, Layer } from '../src/model';
import { addEntry, applyPatch, removeEntry, renameEntry, syncRefs, varnishOf } from '../src/palettes';

const layer = (id: string, extra: Partial<Layer> = {}) => ({ id, name: id, kind: 'shape', guide: 0, strokes: [], ...extra }) as unknown as Layer;
const doc = (layers: Layer[]) => ({ guides: [], layers }) as unknown as Doc;

describe('palettes de matières et de vernis', () => {
  it('ajoute la matière de l’objet à la palette et l’y lie', () => {
    const d = addEntry(doc([layer('a', { material: { ...newFx('wood'), preset: 'Noyer' } })]), 'a', 'material', 'Noyer');
    expect(d.materials).toHaveLength(1);
    expect(d.layers[0]!.material!.ref).toBe(d.materials![0]!.id);
    expect(d.materials![0]!.fx.ref).toBeUndefined();
  });
  it('une retouche sur un objet lié change l’entrée et les autres objets liés, pas leur couleur', () => {
    let d = addEntry(doc([layer('a', { material: newFx('wood') }), layer('b', { guide: 2 })]), 'a', 'material', 'Chêne');
    const e = d.materials![0]!;
    d = { ...d, layers: d.layers.map((l) => (l.id === 'b' ? { ...l, ...applyPatch(l, 'material', e) } : l)) };
    d = { ...d, layers: d.layers.map((l) => (l.id === 'a' ? { ...l, material: { ...l.material!, amount: 0.2 } } : l)) };
    d = syncRefs(d, 'a');
    expect(d.materials![0]!.fx.amount).toBe(0.2);
    expect(d.layers[1]!.material!.amount).toBe(0.2);
    expect(d.layers[1]!.guide).toBe(2);
  });
  it('un seul vernis : en poser un remplace l’ancien', () => {
    let d = addEntry(doc([layer('a', { fx: [newFx('gloss')] })]), 'a', 'varnish', 'Brillant');
    const l = { ...d.layers[0]!, fx: [newFx('grain'), newFx('satin')] } as Layer;
    const p = applyPatch(l, 'varnish', d.varnishes![0]!);
    expect(p.fx!.map((x) => x.id)).toEqual(['grain', 'gloss']);
    d = renameEntry(d, 'varnish', d.varnishes![0]!.id, 'Laqué');
    expect(varnishOf(d.layers[0]!)!.preset).toBe('Laqué');
    d = removeEntry(d, 'varnish', d.varnishes![0]!.id);
    expect(varnishOf(d.layers[0]!)!.ref).toBeUndefined();
  });
});
