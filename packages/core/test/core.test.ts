import { describe, expect, it } from 'vitest';
import {
  computeLayout,
  contrastRatio,
  expandRecords,
  formatFraction,
  harmonies,
  hexToOklch,
  nearestAnchor,
  oklchToHex,
  parseFraction,
  parseProject,
  repartitionAnchors,
  resolveAnchor,
  substitute,
  type Format,
  type LibraryElement,
} from '../src/index.js';

const a4: Format = { id: 'a4', title: 'A4', width: 210, height: 297, unit: 'mm', target: 'print' };
const square: Format = { id: 'sq', title: 'Carré', width: 1080, height: 1080, unit: 'px', target: 'social' };

describe('fractions', () => {
  it('lit et écrit des fractions', () => {
    expect(parseFraction('2/3')).toBeCloseTo(2 / 3);
    expect(parseFraction('1')).toBe(1);
    expect(formatFraction(0.75)).toBe('3/4');
    expect(formatFraction(4 / 6)).toBe('2/3');
    expect(formatFraction(0)).toBe('0');
  });
});

describe('ancrages par répartition', () => {
  it('contient les intersections axiales et radiales, sans doublon', () => {
    const pts = repartitionAnchors();
    const ids = pts.map((p) => p.id);
    expect(ids).toContain('h1/2 v1/4');
    expect(ids).toContain('h1/3 v2/3');
    expect(new Set(ids).size).toBe(ids.length);
    expect(pts.some((p) => p.kind === 'radial')).toBe(true);
    const keys = pts.map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('résout le même ancrage proportionnellement sur deux formats', () => {
    expect(resolveAnchor('repartition', 'h1/2 v2/3', a4)).toEqual({ x: 0.5, y: 2 / 3 });
    expect(resolveAnchor('repartition', 'h1/2 v2/3', square)).toEqual({ x: 0.5, y: 2 / 3 });
  });

  it('résout un point radial', () => {
    const p = resolveAnchor('repartition', 'ray h1/4 v0 @1/2', a4);
    expect(p.x).toBeCloseTo(0.375);
    expect(p.y).toBeCloseTo(0.25);
  });

  it('trouve l’ancrage le plus proche', () => {
    const p = nearestAnchor(repartitionAnchors(), 0.49, 0.26, a4);
    expect(p.id).toBe('h1/2 v1/4');
  });
});

describe('grille', () => {
  it('résout centre et coins de cellule', () => {
    const f: Format = { ...a4, grid: { cols: 2, rows: 2, margin: 10, gutter: 10 } };
    const c = resolveAnchor('grid', 'c1 r1 nw', f);
    expect(c.x * 210).toBeCloseTo(10);
    expect(c.y * 297).toBeCloseTo(10);
    const e = resolveAnchor('grid', 'c2 r1 ne', f);
    expect(e.x * 210).toBeCloseTo(200);
  });
});

describe('couleurs', () => {
  it('fait l’aller-retour hex ↔ OKLCH', () => {
    for (const hex of ['#e9a7c3', '#8ed9d0', '#1a1a2e', '#ffffff']) {
      expect(oklchToHex(hexToOklch(hex))).toBe(hex);
    }
  });
  it('propose des harmonies', () => {
    const h = harmonies('#e9a7c3');
    expect(h.complementary).toHaveLength(1);
    expect(h.triadic).toHaveLength(2);
  });
  it('calcule un contraste', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21);
  });
});

describe('balises', () => {
  it('substitue et déroule les listes', () => {
    expect(substitute('le {{date}} à {{lieu}}', { date: '14 nov.' })).toBe('le 14 nov. à {{lieu}}');
    const rows = expandRecords({ date: 'x' }, [{ lieu: 'Aix' }, { lieu: 'Toulon' }]);
    expect(rows).toEqual([
      { date: 'x', lieu: 'Aix' },
      { date: 'x', lieu: 'Toulon' },
    ]);
  });
});

describe('mise en page', () => {
  const library = new Map<string, LibraryElement>([
    ['image/logo', { id: 'logo', type: 'image', source: 'logo.svg', tags: [], cache: {}, meta: { width: 200, height: 100 } }],
    ['text/titre', { id: 'titre', type: 'text', body: 'Bonjour {{nom}}', tags: [], slots: {} }],
    ['palette/p', { id: 'p', type: 'palette', tags: [], colors: [{ hex: '#ff0000' }, { hex: '#00ff00', role: 'texte' }] }],
  ]);
  const project = parseProject(`
id: demo
formats: [a4, sq]
palette: p
elements:
  - id: logo
    ref: image/logo
    anchor: { point: "h1/2 v1/4" }
    size: { w: 0.5 }
    deltas: { size: 1 }
  - id: titre
    ref: text/titre
    anchor: { point: "h1/2 v2/3" }
    style: { color: palette.texte }
values: { nom: Lauris }
overrides:
  sq:
    titre: { anchor: { point: "h1/2 v3/4" } }
`);

  it('place un élément centré sur son ancrage, avec delta de taille', () => {
    const [logo] = computeLayout(project, 'a4', { formats: [a4, square], library });
    expect(logo!.w).toBeCloseTo(210); // 0.5 × 210 × 2
    expect(logo!.h).toBeCloseTo(105);
    expect(logo!.x + logo!.w / 2).toBeCloseTo(105);
    expect(logo!.y + logo!.h / 2).toBeCloseTo(297 / 4);
  });

  it('substitue les balises, résout la palette et applique les overrides', () => {
    const items = computeLayout(project, 'sq', { formats: [a4, square], library });
    const titre = items[1]!;
    expect(titre.text).toBe('Bonjour Lauris');
    expect(titre.color).toBe('#00ff00');
    expect(titre.anchor.y).toBeCloseTo(0.75);
  });
});
