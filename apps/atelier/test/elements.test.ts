import { describe, expect, it } from 'vitest';
import { cleanElementStore } from '@ftd/core';
import { elementFrom, elementList, elementOf, extraStrokes, knobRange, paramsOf, startParams, strokeParams } from '../src/elements';
import type { Stroke } from '../src/model';

describe('fiches des éléments', () => {
  const store = cleanElementStore({
    hidden: ['burn'],
    sheets: [
      {
        id: 'feu-doux',
        base: 'fire',
        name: 'Feu doux',
        family: 'Mes feux',
        icon: 'matter-fire',
        hint: 'petites flammes',
        knobs: [
          { key: 'flame', label: 'Flammèches', lo: 0, hi: 0.4 },
          { key: 'hole', fixed: 0 },
        ],
        presets: [{ name: 'Doux', values: { flame: 0.2, char: 0.4, inconnu: 1 } }],
      },
      { id: 'aquarelle', base: 'water', name: 'Usurpe une fiche d’origine', knobs: [], presets: [] },
      { id: 'perdue', base: 'disparu', name: 'Sans fiche d’origine', knobs: [], presets: [] },
    ],
  });

  it('une copie garde le moteur de sa fiche d’origine et règle ses potards', () => {
    const d = elementFrom(store.sheets[0]!)!;
    expect(d).toMatchObject({ id: 'feu-doux', base: 'fire', brush: 'burn', copy: true, name: 'Feu doux', family: 'Mes feux', fixed: { hole: 0 } });
    expect(d.knobs.map((k) => k.key)).toEqual(['flame', 'char']);
    expect(d.knobs[0]).toMatchObject({ label: 'Flammèches', lo: 0, hi: 0.4 });
    expect(knobRange(d.knobs[1]!)).toEqual([0, 1]);
    expect(d.presets).toEqual([{ name: 'Doux', values: { flame: 0.2, char: 0.4 } }]);
  });

  it('la valeur figée l’emporte et le feu d’une copie porte ses flammes', () => {
    const d = elementOf('feu-doux', elementList(store));
    expect(strokeParams(d, { flame: 0.3, char: 0.5, hole: 1 })).toMatchObject({ flame: 0.3, char: 0.5, hole: false });
  });

  it('une copie ne remplace pas une fiche d’origine, une fiche sans origine est ignorée', () => {
    const list = elementList(store);
    expect(list.filter((d) => d.id === 'aquarelle')).toHaveLength(1);
    expect(list.find((d) => d.id === 'aquarelle')!.copy).toBeUndefined();
    expect(list.some((d) => d.id === 'perdue')).toBe(false);
    // une copie retirée entre-temps revient à l'aquarelle
    expect(elementOf('retiree', list).id).toBe('aquarelle');
  });

  it('les jeux et les réglages restent dans les bornes de la copie', () => {
    const d = elementOf('feu-doux', elementList(store));
    const big = elementFrom({ ...store.sheets[0]!, presets: [{ name: 'Brasier', values: { flame: 1, char: 0.5 } }] })!;
    expect(big.presets[0]!.values).toEqual({ flame: 0.4, char: 0.5 });
    expect(strokeParams(d, { flame: 0.9, char: 0.5 }).flame).toBe(0.4);
    expect(paramsOf({ 'feu-doux': { flame: 0.8 } }, d)).toEqual({ flame: 0.4 });
  });

  it('une copie part de son premier jeu de paramètres', () => {
    const d = elementOf('feu-doux', elementList(store));
    expect(paramsOf(startParams(), d)).toEqual({ flame: 0.2, char: 0.4 });
  });

  it('un second moteur pose son trait sur le même geste, dosé au-delà du seuil', () => {
    const sh = cleanElementStore({ sheets: [{ id: 'feu-vif', base: 'fire', name: 'Feu vif', knobs: [], presets: [], extra: { element: 'spark', preset: 'Traits', size: 0.5, dose: 'flame', from: 0.5 } }] }).sheets[0]!;
    expect(sh.extra).toEqual({ element: 'spark', preset: 'Traits', size: 0.5, dose: 'flame', from: 0.5 });
    const d = elementFrom(sh)!;
    const s: Stroke = { brush: 'burn', guide: 2, size: 0.1, opacity: 1, seed: 7, pts: [{ x: 0.5, y: 0.5, p: 0.7 }], ...strokeParams(d, { flame: 0.75 }) };
    expect(extraStrokes(d, s, { flame: 0.4 })).toEqual([]);
    const [e] = extraStrokes(d, s, { flame: 0.75 });
    expect(e).toMatchObject({ brush: 'glitter', matter: 'spark', guide: 2, size: 0.05, opacity: 0.5, focus: 1 });
    // une brûlure ne peut pas servir de second moteur : elle ne peint pas
    expect(elementFrom({ ...sh, extra: { element: 'burn', size: 1 } })!.extra).toBeUndefined();
  });
});
