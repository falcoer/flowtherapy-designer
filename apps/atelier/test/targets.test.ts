import { describe, expect, it } from 'vitest';
import { blankDoc } from '../src/blank';
import type { ActivityProfile } from '../src/server';
import { colorGuide, DEFAULT_OPERATIONS, docForTarget, formatsFor, guidePaletteColor, operationsOf, paletteFor, paletteGuides, recolor, borderDefaults, roleIndex, slotColor, targetLabel } from '../src/targets';
import { SITE_VARIANTS } from '../src/brand-presets';
import { docMargins, edgeLines, formatOf, setAnchorMargin } from '../src/model';

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
    expect(docMargins(d)).toEqual({ top: 0.07, right: 0.07, bottom: 0.07, left: 0.07 });
    expect(d.guides[0]).toMatchObject({ color: '#1b1530' });
    // une publication garde ses propres marges, côté par côté (zones mortes d'un réseau)
    const own = { top: 0.12, right: 0.05, bottom: 0.2, left: 0.05 };
    expect(docMargins(docForTarget(blankDoc(), { channel: 'affiche', format: 'a4', margins: own }, profile))).toEqual(own);
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

describe('pastilles des variantes', () => {
  it('un dégradé de variante devient un guide dégradé, et recolore le même rôle', () => {
    const [clair, sombre] = SITE_VARIANTS;
    const g = paletteGuides(clair!);
    expect(g[0]).toMatchObject({ role: 'fond', type: 'color', color: '#fbf8f2' });
    expect(g.find((x) => x.role === 'principale')).toMatchObject({ type: 'gradient', stops: ['#168ad5', '#7130c8', '#ffc425'] });
    const nuit = recolor(g, sombre);
    expect(nuit.find((x) => x.role === 'principale')).toMatchObject({ type: 'gradient', stops: ['#19a7ef', '#9a48f0', '#ffc425'] });
    expect(nuit.find((x) => x.role === 'fond')).toMatchObject({ color: '#07101d' });
  });

  it('les rôles absents du document arrivent à la suite, l’ancien accent tient la couleur principale', () => {
    const jour = paletteGuides(profile.branding!.palettes![0]!);
    const out = recolor(jour, SITE_VARIANTS[0]);
    expect(out.slice(0, 3).map((g) => g.role)).toEqual(['fond', 'texte', 'principale']);
    expect(out[2]).toMatchObject({ type: 'gradient' });
    expect(out.slice(3).map((g) => g.role)).toEqual(['bordure', 'sujet1', 'sujet2', 'sujet3']);
    expect(slotColor(profile.branding!.palettes![0]!, 'principale')?.hex).toBe('#e9a7c3');
  });

  it('un ancien document sans rôles prend le dégradé à sa place, sans doublon', () => {
    const out = recolor(blankDoc().guides, SITE_VARIANTS[1]);
    expect(out[0]).toMatchObject({ role: 'fond', color: '#07101d' });
    const p = out.findIndex((g) => g.role === 'principale');
    expect(p).toBeLessThan(blankDoc().guides.length);
    expect(out[p]).toMatchObject({ type: 'gradient' });
    expect(out.filter((g) => g.role === 'principale')).toHaveLength(1);
  });

  it('le texte et les bords prennent leur rôle quand le document l’a', () => {
    const g = paletteGuides(SITE_VARIANTS[0]!);
    expect(g[roleIndex(g, 'texte')!]).toMatchObject({ color: '#17171b' });
    expect(g[roleIndex(g, 'bordure')!]).toMatchObject({ color: '#ffffff' });
    const old = paletteGuides(profile.branding!.palettes![0]!);
    expect(old[roleIndex(old, 'principale')!]).toMatchObject({ role: 'accent' });
    expect(roleIndex(blankDoc().guides, 'bordure')).toBeUndefined();
    const b = roleIndex(g, 'bordure')!;
    const m = roleIndex(g, 'principale')!;
    expect(borderDefaults('round', undefined, g).guide).toBe(b);
    // double : guide2 peint l'extérieur
    expect(borderDefaults('double', undefined, g)).toEqual({ guide: m, guide2: b });
    expect(borderDefaults('double', { guide: 5, guide2: 6 }, g)).toEqual({ guide: 5, guide2: 6 });
  });

  it('une couleur éditée garde son premier arrêt dans hex', () => {
    const c = guidePaletteColor({ name: 'Flow', type: 'gradient', stops: ['#111111', '#222222'] }, 'principale');
    expect(c).toEqual({ hex: '#111111', stops: ['#111111', '#222222'], role: 'principale' });
    expect(colorGuide(c)).toMatchObject({ type: 'gradient', role: 'principale', name: 'Couleur principale' });
  });

  it('les marges côté par côté placent les lignes de marge de chaque bord', () => {
    const f = formatOf('story');
    setAnchorMargin({ top: 0.1, right: 0.05, bottom: 0.2, left: 0 });
    expect(edgeLines(f).margin).toEqual({ left: 0, right: 1080 - 54, top: 108, bottom: 1920 - 216 });
    setAnchorMargin(0);
    expect(edgeLines(f).margin).toBeNull();
  });
});
