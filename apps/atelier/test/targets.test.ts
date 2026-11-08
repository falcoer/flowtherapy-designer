import { describe, expect, it } from 'vitest';
import { blankDoc } from '../src/blank';
import type { ActivityProfile } from '../src/server';
import { DEFAULT_OPERATIONS, docForTarget, formatsFor, operationsOf, paletteFor, paletteGuides, recolor, targetLabel } from '../src/targets';

const profile: ActivityProfile = {
  id: 'ft',
  name: 'Flow Therapy',
  branding: {
    palettes: [
      { id: 'jour', name: 'Jour', colors: [{ hex: '#e9a7c3', role: 'accent' }, { hex: '#f8f4ec', role: 'fond' }, { hex: '#1b1530', role: 'texte' }] },
      { id: 'nuit', name: 'Nuit', colors: [{ hex: '#1b1530', role: 'fond' }, { hex: '#f8f4ec', role: 'texte' }, { hex: '#6c4fa1', role: 'accent' }] },
    ],
  },
  channels: [
    { id: 'affiche', name: 'Affiche', kind: 'affichage', formats: ['a4'], margin: 0.07, palette: 'nuit' },
    { id: 'instagram', name: 'Instagram', kind: 'social', formats: ['carre', 'story'] },
  ],
};

describe('cibles et variantes', () => {
  it('les guides d’une variante mettent le fond en premier', () => {
    expect(paletteGuides(profile.branding!.palettes![0]!).map((g) => g.role)).toEqual(['fond', 'texte', 'accent']);
  });

  it('changer de variante remplace chaque couleur par celle du même rôle', () => {
    const jour = paletteGuides(profile.branding!.palettes![0]!);
    const nuit = recolor(jour, profile.branding!.palettes![1]);
    expect(nuit.map((g) => (g.type === 'color' ? g.color : ''))).toEqual(['#1b1530', '#f8f4ec', '#6c4fa1']);
    // des guides sans rôle (anciennes compositions) suivent le rang
    const old = recolor(blankDoc().guides, profile.branding!.palettes![1]);
    expect(old[0]).toMatchObject({ color: '#1b1530', role: 'fond' });
    expect(old[4]).toEqual(blankDoc().guides[4]);
  });

  it('une cible prend la variante de son média, sinon la sienne, et la marge du média', () => {
    expect(paletteFor({ channel: 'affiche', format: 'a4' }, profile)?.id).toBe('nuit');
    expect(paletteFor({ channel: 'affiche', format: 'a4', palette: 'jour' }, profile)?.id).toBe('jour');
    expect(paletteFor({ channel: 'instagram', format: 'carre' }, profile)?.id).toBe('jour');
    const d = docForTarget(blankDoc(), { channel: 'affiche', format: 'a4' }, profile);
    expect(d.margin).toBe(0.07);
    expect(d.guides[0]).toMatchObject({ color: '#1b1530' });
  });

  it('les occasions par défaut ne gardent que les cibles dont le média existe', () => {
    const ops = operationsOf(profile);
    expect(ops.find((o) => o.id === 'concert')?.targets).toEqual([
      { channel: 'affiche', format: 'a4' },
      { channel: 'instagram', format: 'story' },
    ]);
    expect(ops.some((o) => o.id === 'bannieres')).toBe(false);
    expect(operationsOf(null)).toEqual(DEFAULT_OPERATIONS);
    expect(formatsFor(profile.channels![1]).map((f) => f.id)).toEqual(['carre', 'story']);
    expect(targetLabel({ channel: 'instagram', format: 'story' }, profile)).toBe('Instagram · Story');
  });
});
