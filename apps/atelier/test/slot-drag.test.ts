import { describe, expect, it } from 'vitest';
import { newFx } from '../src/fx';
import type { Doc, Layer } from '../src/model';
import { varnishOf } from '../src/palettes';
import { slotFilled, slotOnto, slotToPalette } from '../src/slot-drag';

const layer = (id: string, extra: Partial<Layer> = {}) => ({ id, name: id, kind: 'shape', guide: 0, strokes: [], ...extra }) as unknown as Layer;
const doc = (layers: Layer[], extra: Partial<Doc> = {}) => ({ guides: [{ name: 'Nuit' }, { name: 'Rose' }], layers, ...extra }) as unknown as Doc;
const border = { style: 'round' as const, guide: 1, width: 0.02 };

describe('pastille tirée d’un emplacement des attributs', () => {
  it('lâchée sur un autre objet : il en reçoit une copie, sans toucher au premier', () => {
    const a = layer('a', { border, guide: 1, material: { ...newFx('glass'), amount: 0.3, off: true }, opacity: 0.5, fx: [newFx('grain'), newFx('gloss')] });
    const b = layer('b', { fx: [newFx('satin')] });
    const edge = slotOnto(a, b, { kind: 'edge', k: 'border' });
    expect(edge.patch).toEqual({ border });
    expect(edge.patch!.border).not.toBe(a.border);
    expect(edge.msg).toBe('« b » prend le bord de « a »');
    // un seul vernis : celui de l'objet visé est remplacé, ses autres effets restent
    const v = slotOnto(a, layer('c', { fx: [newFx('satin'), newFx('grain')] }), { kind: 'varnish' });
    expect(v.patch!.fx!.map((x) => x.id)).toEqual(['grain', 'gloss']);
    // la matière arrive active, avec la transparence de l'objet d'origine
    const m = slotOnto(a, b, { kind: 'material' });
    expect(m.patch).toMatchObject({ material: { id: 'glass', amount: 0.3 }, opacity: 0.5 });
    expect(m.patch!.material!.off).toBeUndefined();
    expect(slotOnto(a, b, { kind: 'tint' }).patch).toEqual({ guide: 1 });
  });
  it('refuse ce qui n’a pas de sens, et ne tire rien d’un emplacement vide', () => {
    const a = layer('a', { border });
    expect(slotOnto(a, layer('fond', { kind: 'surface' }), { kind: 'edge', k: 'border' })).toEqual({ msg: 'La surface de fond n’a pas de bord' });
    expect(slotOnto(a, layer('p', { kind: 'photo' }), { kind: 'tint' }).patch).toBeUndefined();
    expect(slotFilled(a, { kind: 'edge', k: 'glow' })).toBe(false);
    expect(slotFilled(a, { kind: 'material' })).toBe(false);
    expect(slotOnto(a, layer('b'), { kind: 'varnish' })).toEqual({ msg: '' });
  });
  it('lâchée sur la palette : une entrée à soi, une seule fois', () => {
    const a = layer('a', { border, material: newFx('wood'), fx: [{ ...newFx('gloss'), amount: 0.8 }] });
    let d = doc([a]);
    const e = slotToPalette(d, a, { kind: 'edge', k: 'border' }, 'Arrondi');
    expect(e.tab).toBe('edge');
    expect(e.doc!.edges).toMatchObject([{ name: 'Arrondi', border }]);
    d = e.doc!;
    expect(slotToPalette(d, a, { kind: 'edge', k: 'border' }, 'Arrondi')).toMatchObject({ msg: '« Arrondi » est déjà dans Mes bords', tab: 'edge' });
    expect(slotToPalette(d, a, { kind: 'edge', k: 'border' }, 'Arrondi').doc).toBeUndefined();
    // un vernis : rangé dans Mes vernis, l'objet y est lié
    const v = slotToPalette(d, a, { kind: 'varnish' }, 'Brillant');
    expect(v.doc!.varnishes).toMatchObject([{ name: 'Brillant', fx: { id: 'gloss', amount: 0.8 } }]);
    const linked = v.doc!.layers[0]!;
    expect(varnishOf(linked)!.ref).toBe(v.doc!.varnishes![0]!.id);
    expect(slotToPalette(v.doc!, linked, { kind: 'varnish' }, 'Brillant').doc).toBeUndefined();
    // une matière identique déjà rangée (sans lien) n'est pas doublée
    const m = slotToPalette(d, a, { kind: 'material' }, 'Chêne');
    expect(m.tab).toBe('material');
    const twin = layer('b', { material: newFx('wood') });
    expect(slotToPalette({ ...m.doc!, layers: [...m.doc!.layers, twin] }, twin, { kind: 'material' }, 'Chêne')).toMatchObject({ msg: '« Chêne » est déjà dans Mes matières' });
    expect(slotToPalette(d, a, { kind: 'tint' }, '')).toMatchObject({ tab: 'color', msg: '« Nuit » est déjà une couleur de la palette' });
  });
});
