import type { Palette, PaletteColor } from './server';

/**
 * Première version des variantes Flow Therapy, reprise du site (flowtherapy-bio-website, styles.css et docs/brand) :
 * une variante claire et une sombre. Les sujets sont les trois alpagas de l'affiche du concert
 * (Betty au clavier, Jenni au micro, Lauris à la basse), en dégradé de leur fourrure à leur tenue.
 */
const grad = (role: PaletteColor['role'], name: string, stops: string[], extra: Partial<PaletteColor> = {}): PaletteColor => ({ hex: stops[0]!, role, name, stops, blend: 'smooth', ...extra });
const solid = (role: PaletteColor['role'], name: string, hex: string): PaletteColor => ({ hex, role, name });

// le dégradé du flow : bleu, violet, jaune (le jaune des icônes Flow Therapy)
const FLOW_YELLOW = '#ffc425';

const SUBJECTS: PaletteColor[] = [
  grad('sujet1', 'Alpaga Betty', ['#f9b353', '#ed7100', '#c73047']),
  grad('sujet2', 'Alpaga Jenni', ['#ff8a3d', '#e72f88', '#7d2554']),
  grad('sujet3', 'Alpaga Lauris', ['#19a7ef', '#1f5583', '#7130c8']),
];

export const SITE_VARIANTS: Palette[] = [
  {
    id: 'site-clair',
    name: 'Site clair',
    colors: [
      grad('principale', 'Flow', ['#168ad5', '#7130c8', FLOW_YELLOW], { shape: { mode: 'linear', repeat: 1 } }),
      solid('texte', 'Encre', '#17171b'),
      solid('bordure', 'Blanc', '#ffffff'),
      solid('fond', 'Crème', '#fbf8f2'),
      ...SUBJECTS,
    ],
  },
  {
    id: 'site-sombre',
    name: 'Site sombre',
    colors: [
      grad('principale', 'Flow', ['#19a7ef', '#9a48f0', FLOW_YELLOW], { shape: { mode: 'linear', repeat: 1 } }),
      solid('texte', 'Crème', '#fffaf1'),
      solid('bordure', 'Nuit', '#101a2b'),
      solid('fond', 'Bleu nuit', '#07101d'),
      ...SUBJECTS,
    ],
  },
];
