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
  anchorsFor,
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
  it('contient les intersections axiales, sans doublon', () => {
    const pts = anchorsFor('repartition', a4);
    const ids = pts.map((p) => p.id);
    expect(ids).toContain('h1/2 v1/4');
    expect(ids).toContain('h1/3 v2/3');
    expect(ids).toContain('h0 v0');
    expect(new Set(ids).size).toBe(ids.length);
    expect(pts).toHaveLength(25 + 8);
  });

  it('résout le même ancrage proportionnellement sur deux formats', () => {
    expect(resolveAnchor('repartition', 'h1/2 v2/3', a4)).toEqual({ x: 0.5, y: 2 / 3 });
    expect(resolveAnchor('repartition', 'h1/2 v2/3', square)).toEqual({ x: 0.5, y: 2 / 3 });
  });

  it('trouve l’ancrage le plus proche', () => {
    const p = nearestAnchor(anchorsFor('repartition', a4), 0.49, 0.26, a4);
    expect(p.id).toBe('h1/2 v1/4');
  });
});

describe('nombre d’or', () => {
  it('croise les sections dorées', () => {
    const p = resolveAnchor('or', 'h-or-a × v-or-b', a4);
    expect(p.x).toBeCloseTo(0.382, 3);
    expect(p.y).toBeCloseTo(0.618, 3);
    expect(anchorsFor('or', a4)).toHaveLength(4);
  });
});

describe('armature harmonique', () => {
  it('place l’œil de la réciproque au pied de la perpendiculaire', () => {
    // sur un carré, la réciproque se confond avec l'autre diagonale : croisement au centre
    const c = resolveAnchor('armature', 'd1 × mh', square);
    expect(c).toEqual({ x: 0.5, y: 0.5 });
    // sur l'A4, le pied de la perpendiculaire depuis le coin haut-droit tombe sur la diagonale
    const p = resolveAnchor('armature', 'd1 × r1', a4);
    const W = 210, H = 297;
    const dot = (p.x * W - W) * W + (p.y * H) * H; // (P - coin) · direction de d1
    expect(Math.abs(dot)).toBeLessThan(1e-6);
  });

  it('dépend du rapport largeur/hauteur, contrairement à la répartition', () => {
    const onA4 = resolveAnchor('armature', 'd1 × r1', a4);
    const onBanner = resolveAnchor('armature', 'd1 × r1', { ...a4, width: 1640, height: 624, unit: 'px' });
    expect(onA4.x).not.toBeCloseTo(onBanner.x, 2);
  });

  it('nomme chaque ancrage de façon résoluble', () => {
    for (const f of [a4, square]) {
      for (const pt of anchorsFor('armature', f)) {
        const r = resolveAnchor('armature', pt.id, f);
        expect(r.x).toBeCloseTo(pt.x, 9);
        expect(r.y).toBeCloseTo(pt.y, 9);
      }
    }
  });

  it('ajoute les rabattements du petit côté sur un format allongé', () => {
    const ids = anchorsFor('armature', a4).map((p) => p.id);
    expect(ids.some((id) => id.includes('rb1'))).toBe(true);
  });
});

describe('grille', () => {
  it('résout centre et coins de cellule', () => {
    const g = { cols: 2, rows: 2, margin: 10 / 210, gutter: 10 / 210 };
    const c = resolveAnchor('grid', 'c1 r1 nw', a4, g);
    expect(c.x * 210).toBeCloseTo(10);
    expect(c.y * 297).toBeCloseTo(10);
    const e = resolveAnchor('grid', 'c2 r1 ne', a4, g);
    expect(e.x * 210).toBeCloseTo(200);
  });
  it('garde le même découpage sur tous les formats', () => {
    const g = { cols: 4, rows: 6, margin: 0.05, gutter: 0 };
    const story = { ...a4, width: 1080, height: 1920, unit: 'px' as const };
    for (const f of [a4, story]) {
      const ids = anchorsFor('grid', f, g).map((p) => p.id);
      expect(ids).toHaveLength(4 * 6 + 5 * 7);
      expect(ids).toContain('x4 y6');
      // marge identique en haut et à gauche (fraction du petit côté)
      const p = resolveAnchor('grid', 'x0 y0', f, g);
      expect(p.x * f.width).toBeCloseTo(p.y * f.height);
    }
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

import { snapBox, alignPoint } from '../src/snap.js';
describe('aimantation', () => {
  const format = { id: 'f', title: 'f', unit: 'px', width: 1000, height: 1000 } as never;
  const anchors = [
    { id: 'a', frame: 'repartition', x: 0.5, y: 0.5 },
    { id: 'b', frame: 'repartition', x: 0.25, y: 0.25 },
  ] as never;
  it('attire le coin le plus proche dans le rayon', () => {
    const s = snapBox({ x: 255, y: 262, w: 100, h: 50 }, anchors, format, 30);
    expect(s?.anchor.id).toBe('b');
    expect(s?.align).toBe('top-left');
    expect(s?.dx).toBeCloseTo(-5);
    expect(s?.dy).toBeCloseTo(-12);
  });
  it('préfère le centre à distance égale', () => {
    const s = snapBox({ x: 450, y: 475, w: 100, h: 50 }, anchors, format, 30);
    expect(s?.align).toBe('center');
  });
  it("ne s'accroche pas hors du rayon", () => {
    expect(snapBox({ x: 600, y: 700, w: 10, h: 10 }, anchors, format, 30)).toBeNull();
    expect(alignPoint({ x: 0, y: 0, w: 10, h: 20 }, 'bottom-right')).toEqual({ x: 10, y: 20 });
  });
});
