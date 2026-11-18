import { describe, expect, it } from 'vitest';
import type { Layer } from '../src/model';
import { pickStep, spreadPatch } from '../src/pick';

describe('choisir des éléments', () => {
  const whole = { main: 'a', picks: null };
  it('un toucher prend l’élément et son ensemble', () => {
    expect(pickStep({ main: null, picks: null }, [], 'a', false)).toEqual({ now: { main: 'a', picks: null } });
    // toucher une autre pièce du même ensemble : l'ensemble reste choisi, ses attributs s'affichent
    expect(pickStep(whole, ['a', 'b', 'c'], 'b', false)).toEqual({ now: { main: 'b', picks: null } });
  });

  it('Maj dans un ensemble choisi : la pièce seule', () => {
    expect(pickStep(whole, ['a', 'b', 'c'], 'b', true)).toEqual({ now: { main: 'b', picks: ['b'] }, say: 'piece' });
  });

  it('Maj ajoute des éléments et des pièces, puis un toucher en retire', () => {
    const s1 = pickStep({ main: 'b', picks: ['b'] }, ['b'], 'x', true);
    expect(s1.now).toEqual({ main: 'x', picks: ['b', 'x'] });
    expect(s1.say).toBe('many');
    // ensemble choisi par un toucher, puis un autre élément avec Maj : l'ensemble garde toutes ses pièces
    expect(pickStep(whole, ['a', 'b', 'c'], 'x', true).now).toEqual({ main: 'x', picks: ['a', 'b', 'c', 'x'] });
    // Maj sur un élément déjà choisi : un glisser emporte tout, un simple toucher le retire
    const s2 = pickStep({ main: 'x', picks: ['b', 'x'] }, ['x', 'b'], 'b', true);
    expect(s2.now).toEqual({ main: 'b', picks: ['x', 'b'] });
    expect(s2.tap).toEqual({ main: 'x', picks: ['x'] });
    // le dernier retiré : plus rien de choisi
    expect(pickStep({ main: 'b', picks: ['b'] }, ['b'], 'b', true).tap).toEqual({ main: null, picks: null });
  });

  it('sans Maj sur un élément d’un choix multiple : glisser emporte tout, toucher revient à son ensemble', () => {
    const s = pickStep({ main: 'x', picks: ['b', 'x'] }, ['x', 'b'], 'b', false);
    expect(s.now).toEqual({ main: 'b', picks: ['x', 'b'] });
    expect(s.tap).toEqual({ main: 'b', picks: null });
  });
});

describe('réglage appliqué à chaque élément choisi', () => {
  const base = { id: 'a', name: 'A', kind: 'shape', anchor: { frame: 'thirds', point: 'c' }, dx: 0, dy: 0, w: 1, h: 1, guide: 0, height: 0, visible: true, strokes: [] } as unknown as Layer;
  const main: Layer = { ...base, border: { style: 'round', guide: 1, width: 0.01 } } as Layer;
  const other: Layer = { ...base, id: 'b', guide: 4, dx: 0.3, border: { style: 'stamp', guide: 6, width: 0.02 } } as Layer;

  it('seule la valeur changée passe aux autres', () => {
    expect(spreadPatch(main, other, { border: { style: 'round', guide: 1, width: 0.05 } })).toEqual({ border: { style: 'stamp', guide: 6, width: 0.05 } });
    expect(spreadPatch(main, other, { guide: 2 })).toEqual({ guide: 2 });
  });

  it('un réglage absent de l’autre élément arrive en entier, un réglage retiré part', () => {
    const glow = { style: 'neon', guide: 3, distance: 0, width: 0.2 } as Layer['glow'];
    expect(spreadPatch(main, { ...other, glow: undefined }, { glow })).toEqual({ glow });
    expect(spreadPatch(main, other, { border: undefined })).toEqual({ border: undefined });
  });

  it('la place, la taille et la découpe restent à chacun', () => {
    expect(spreadPatch(main, other, { dx: 0.5, w: 2, cut: 'M0 0', name: 'Z' })).toEqual({});
  });
});
