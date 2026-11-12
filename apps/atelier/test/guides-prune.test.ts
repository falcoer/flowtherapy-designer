import { describe, expect, it } from 'vitest';
import { newFx } from '../src/fx';
import { pruneImported } from '../src/guides-prune';
import type { Doc, Guide, Layer } from '../src/model';

const c = (name: string, extra: Partial<Guide> = {}) => ({ name, type: 'color', color: '#808080', ...extra }) as Guide;
const layer = (id: string, extra: Partial<Layer> = {}) => ({ id, name: id, kind: 'shape', guide: 0, strokes: [], ...extra }) as unknown as Layer;

describe('couleurs importées', () => {
  it('rien à retirer sans couleur importée inutilisée', () => {
    const d = { guides: [c('a'), c('k', { from: 'Kit' })], layers: [layer('x', { guide: 1 })] } as unknown as Doc;
    expect(pruneImported(d)).toBeNull();
  });
  it('retire une couleur importée inutilisée et renumérote tout ce qui suit', () => {
    const wood = { ...newFx('wood'), guides: [3] };
    const d = {
      guides: [c('a'), c('k1', { from: 'Kit' }), c('k2', { from: 'Kit' }), c('b')],
      layers: [layer('x', { guide: 2, strokes: [{ guide: 3 }] as never, border: { style: 'solid', guide: 3, width: 0.01, guide2: 0 } as never, material: wood })],
      materials: [{ id: 'm', name: 'M', fx: { ...newFx('wood'), guides: [2] } }],
    } as unknown as Doc;
    const r = pruneImported(d)!;
    expect(r.doc.guides.map((g) => g.name)).toEqual(['a', 'k2', 'b']);
    const l = r.doc.layers[0]!;
    expect(l.guide).toBe(1);
    expect(l.strokes[0]!.guide).toBe(2);
    expect(l.border!.guide).toBe(2);
    expect(l.border!.guide2).toBe(0);
    expect(l.material!.guides).toEqual([2]);
    expect(r.doc.materials![0]!.fx.guides).toEqual([1]);
    expect(r.map(3)).toBe(2);
  });
  it('les bords de la palette gardent leurs couleurs et suivent la renumérotation', () => {
    const d = {
      guides: [c('a'), c('k1', { from: 'Kit' }), c('k2', { from: 'Kit' }), c('k3', { from: 'Kit' })],
      layers: [],
      edges: [
        { id: 'e1', name: 'Bord', border: { style: 'double', guide: 2, guide2: 3, width: 0.01 } },
        { id: 'e2', name: 'Lueur', glow: { style: 'neon', guide: 3, distance: 0.1, width: 0.4 } },
      ],
    } as unknown as Doc;
    const r = pruneImported(d)!;
    expect(r.doc.guides.map((g) => g.name)).toEqual(['a', 'k2', 'k3']);
    expect(r.doc.edges![0]!.border).toMatchObject({ guide: 1, guide2: 2 });
    expect(r.doc.edges![1]!.glow!.guide).toBe(2);
  });
  it('garde la couleur du pinceau et les couleurs de la variante', () => {
    const d = { guides: [c('v', { role: 'principale', from: 'X' } as never), c('k', { from: 'Kit' })], layers: [] } as unknown as Doc;
    expect(pruneImported(d, [1])).toBeNull();
  });
});
