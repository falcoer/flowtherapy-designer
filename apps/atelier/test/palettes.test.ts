import { describe, expect, it } from 'vitest';
import { fxOn, newFx, opacityOf } from '../src/fx';
import { MATERIAL_TYPES, presetFx } from '../src/material-presets';
import type { Doc, Layer } from '../src/model';
import { addEntry, applyPatch, removeEntry, renameEntry, syncRefs, toggleMatter, updateEntry, varnishOf } from '../src/palettes';

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
  it('désactiver un vernis ou une matière garde ses réglages, et l’objet se dessine sans', () => {
    const a = layer('a', { material: { ...newFx('glass'), amount: 0.3 }, opacity: 0.5, fx: [newFx('grain'), { ...newFx('gloss'), amount: 0.8 }] });
    expect(opacityOf(a)).toBe(0.5);
    const off = { ...a, ...toggleMatter(a, 'material') } as Layer;
    expect(off.material).toMatchObject({ id: 'glass', amount: 0.3, off: true });
    expect(fxOn([off.material])).toEqual([]);
    expect(opacityOf(off)).toBe(1);
    const dull = { ...off, ...toggleMatter(off, 'varnish') } as Layer;
    expect(dull.fx!.map((x) => !!x.off)).toEqual([false, true]);
    expect(fxOn(dull.fx).map((x) => x.id)).toEqual(['grain']);
    // rallumés : les réglages sont revenus tels quels
    const back = { ...dull, ...toggleMatter(dull, 'material') } as Layer;
    expect({ ...back, ...toggleMatter(back, 'varnish') }).toEqual(a);
    expect(toggleMatter(layer('b'), 'material')).toEqual({});
  });
  it('un réglage désactivé n’éteint ni l’entrée de la palette ni les autres objets liés', () => {
    let d = addEntry(doc([layer('a', { material: newFx('wood') }), layer('b')]), 'a', 'material', 'Chêne');
    const e = d.materials![0]!;
    d = { ...d, layers: d.layers.map((l) => (l.id === 'b' ? { ...l, ...applyPatch(l, 'material', e) } : l)) };
    d = { ...d, layers: d.layers.map((l) => (l.id === 'a' ? { ...l, ...toggleMatter(l, 'material') } : l)) };
    d = syncRefs(d, 'a');
    expect(d.materials![0]!.fx.off).toBeUndefined();
    expect(d.layers[1]!.material!.off).toBeUndefined();
    // une retouche de l'autre objet suit, sans rallumer celui-ci
    d = { ...d, layers: d.layers.map((l) => (l.id === 'b' ? { ...l, material: { ...l.material!, amount: 0.2 } } : l)) };
    d = syncRefs(d, 'b');
    expect(d.layers[0]!.material).toMatchObject({ amount: 0.2, off: true });
    // l'entrée retouchée ou renommée depuis sa boîte : même chose
    d = updateEntry(d, 'material', e.id, { name: 'Chêne clair', fx: { ...d.materials![0]!.fx, amount: 0.4 } });
    expect(d.layers[0]!.material).toMatchObject({ amount: 0.4, preset: 'Chêne clair', off: true });
    expect(d.layers[1]!.material).toMatchObject({ amount: 0.4, preset: 'Chêne clair' });
    expect(d.layers[1]!.material!.off).toBeUndefined();
    expect(renameEntry(d, 'material', e.id, 'Noyer').layers[0]!.material).toMatchObject({ preset: 'Noyer', off: true });
    // rangé dans la palette alors qu'il est désactivé : il le reste, l'entrée non
    let v = addEntry(doc([layer('a', { fx: [{ ...newFx('gloss'), off: true }] })]), 'a', 'varnish', 'Brillant');
    expect(v.varnishes![0]!.fx.off).toBeUndefined();
    expect(varnishOf(v.layers[0]!)).toMatchObject({ off: true, preset: 'Brillant' });
    // poser un autre réglage rallume l'emplacement
    v = { ...v, layers: v.layers.map((l) => ({ ...l, ...applyPatch(l, 'varnish', v.varnishes![0]!) })) };
    expect(varnishOf(v.layers[0]!)!.off).toBeUndefined();
    const p = MATERIAL_TYPES[0]!.presets[0]!;
    expect(presetFx(p, { ...newFx(p.fx as never), off: true }).off).toBeUndefined();
  });
});
