import type { Fx, FxId } from './fx';

/**
 * Matières réelles proposées par l'assistant (baguette magique du Support) : chacune est une matière
 * de l'atelier avec ses réglages et sa teinte naturelle (sans teinte : la couleur de l'objet reste).
 */
export interface MaterialPreset {
  name: string;
  /** Une ligne pour reconnaître la matière. */
  hint: string;
  fx: FxId;
  amount: number;
  knobs?: Record<string, number>;
  tone?: string;
}
export interface MaterialType {
  id: string;
  name: string;
  presets: MaterialPreset[];
}

const wood = (name: string, hint: string, tone: string, size: number, knots: number, angle = 0): MaterialPreset => ({ name, hint, fx: 'wood', amount: 0.65, knobs: { angle, knots, size }, tone });

export const MATERIAL_TYPES: MaterialType[] = [
  {
    id: 'bois',
    name: 'Bois',
    presets: [
      wood('Chêne', 'cernes marqués, brun doré', '#c99a5e', 0.62, 0.12),
      wood('Chêne clair', 'chêne blanchi, scandinave', '#e2c9a0', 0.6, 0.08),
      wood('Pin', 'blond, larges cernes, nombreux nœuds', '#e8c48a', 0.85, 0.55),
      wood('Sapin', 'clair, cernes larges et réguliers', '#efd6a8', 0.75, 0.3),
      wood('Hêtre', 'rosé, fil très fin', '#e6b98e', 0.12, 0),
      wood('Érable', 'presque blanc, fil serré', '#f2deb8', 0.08, 0.04),
      wood('Bouleau', 'pâle et doux', '#f0dfbd', 0.2, 0.06),
      wood('Merisier', 'brun rouge, fil fin', '#c5714a', 0.3, 0.08),
      wood('Noyer', 'brun chocolat, veinage ondoyant', '#8a6040', 0.5, 0.1),
      wood('Teck', 'brun miel, huilé', '#b98048', 0.45, 0.04),
      wood('Acajou', 'rouge profond', '#9a4a2e', 0.35, 0.02),
      wood('Wengé', 'presque noir, fil marqué', '#5a4030', 0.6, 0),
      wood('Olivier', 'blond veiné, noueux', '#d8bb84', 0.4, 0.45),
      wood('Bois flotté', 'gris argenté, lavé', '#c9c2b4', 0.7, 0.3),
      wood('Planche de scène', 'parquet noirci de plateau', '#4a4038', 0.5, 0.15),
    ],
  },
  {
    id: 'metaux',
    name: 'Métaux',
    presets: [
      { name: 'Acier brossé', hint: 'gris froid, rayures fines', fx: 'metal', amount: 0.7, tone: '#a3a8ad' },
      { name: 'Inox', hint: 'gris clair, brillant', fx: 'metal', amount: 0.55, tone: '#c8ccd1' },
      { name: 'Aluminium', hint: 'gris mat, léger', fx: 'aluminium', amount: 0.6, tone: '#c9ccd0' },
      { name: 'Laiton', hint: 'jaune doré', fx: 'metal', amount: 0.65, tone: '#cfae55' },
      { name: 'Or', hint: 'jaune chaud, éclatant', fx: 'metal', amount: 0.5, tone: '#e0bb45' },
      { name: 'Cuivre', hint: 'orange rosé', fx: 'metal', amount: 0.65, tone: '#c47a4a' },
      { name: 'Bronze', hint: 'brun doré, patiné', fx: 'metal', amount: 0.7, tone: '#9c7442' },
      { name: 'Fer noir', hint: 'acier sombre, forgé', fx: 'metal', amount: 0.75, tone: '#4a4c50' },
      { name: 'Miroir', hint: 'chromé, reflète la lumière', fx: 'mirror', amount: 0.7, tone: '#d6dade' },
      { name: 'Fibre de carbone', hint: 'tissage noir, technique', fx: 'carbon', amount: 0.7, tone: '#2c2e33' },
    ],
  },
  {
    id: 'pierres',
    name: 'Pierres et bétons',
    presets: [
      { name: 'Béton brut', hint: 'gris, bullé', fx: 'concrete', amount: 0.7, tone: '#a8a49c' },
      { name: 'Béton ciré', hint: 'clair et lisse', fx: 'concrete', amount: 0.35, tone: '#cfcac1' },
      { name: 'Béton anthracite', hint: 'gris très sombre', fx: 'concrete', amount: 0.6, tone: '#55575a' },
      { name: 'Ardoise', hint: 'gris bleu, feuilletée', fx: 'slate', amount: 0.7, tone: '#454b52' },
      { name: 'Tableau noir', hint: 'ardoise d’école', fx: 'slate', amount: 0.45, tone: '#2e3431' },
      { name: 'Liège', hint: 'brun clair, grumeleux', fx: 'cork', amount: 0.7, tone: '#c09060' },
    ],
  },
  {
    id: 'papiers',
    name: 'Papiers et cartons',
    presets: [
      { name: 'Kraft', hint: 'papier brun d’emballage', fx: 'kraft', amount: 0.7, tone: '#c49a68' },
      { name: 'Carton ondulé', hint: 'carton de déménagement', fx: 'corrugated', amount: 0.7, tone: '#c29766' },
      { name: 'Carton gris', hint: 'carton recyclé, maquette', fx: 'greyboard', amount: 0.7, tone: '#97938d' },
      { name: 'Bristol', hint: 'blanc cassé, épais', fx: 'bristol', amount: 0.6, tone: '#f5f1e8' },
      { name: 'Papier aquarelle', hint: 'grain marqué', fx: 'watercolor', amount: 0.7, tone: '#f6f2e8' },
      { name: 'Papier journal', hint: 'gris jaune, fibreux', fx: 'newsprint', amount: 0.7, tone: '#e4ddcc' },
      { name: 'Papier calque', hint: 'translucide', fx: 'tracing', amount: 0.6 },
    ],
  },
  {
    id: 'textiles',
    name: 'Textiles et cuirs',
    presets: [
      { name: 'Velours de scène', hint: 'rideau rouge de théâtre', fx: 'felt', amount: 0.75, tone: '#8e1424' },
      { name: 'Feutre gris', hint: 'feutre de laine', fx: 'felt', amount: 0.7, tone: '#7f8184' },
      { name: 'Toile de lin', hint: 'écru, tissage visible', fx: 'canvas', amount: 0.7, tone: '#cfc2a3' },
      { name: 'Toile de coton', hint: 'blanc naturel', fx: 'canvas', amount: 0.6, tone: '#ece6d8' },
      { name: 'Jean brut', hint: 'indigo foncé', fx: 'denim', amount: 0.7, tone: '#2e4268' },
      { name: 'Jean délavé', hint: 'bleu clair usé', fx: 'denim', amount: 0.7, tone: '#7189b0' },
      { name: 'Cuir naturel', hint: 'brun tanné', fx: 'leather', amount: 0.7, tone: '#8f5c30' },
      { name: 'Cuir noir', hint: 'noir grainé', fx: 'leather', amount: 0.65, tone: '#25211f' },
      { name: 'Cuir cognac', hint: 'souple, brun orangé', fx: 'soft-leather', amount: 0.7, tone: '#a2602f' },
      { name: 'Daim', hint: 'velouté, beige brun', fx: 'suede', amount: 0.7, tone: '#a77d55' },
    ],
  },
  {
    id: 'transparents',
    name: 'Transparents',
    presets: [
      { name: 'Verre', hint: 'clair, reflets', fx: 'glass', amount: 0.6 },
      { name: 'Verre dépoli', hint: 'laiteux', fx: 'frosted', amount: 0.6 },
      { name: 'Plexiglas', hint: 'acrylique coloré', fx: 'plexi', amount: 0.6 },
      { name: 'Glace', hint: 'givrée, fissurée', fx: 'ice', amount: 0.6 },
      { name: 'Verre fumé', hint: 'teinté sombre', fx: 'smoke', amount: 0.6 },
      { name: 'Hologramme', hint: 'irisé', fx: 'hologram', amount: 0.6 },
    ],
  },
];

/** Le réglage d'une matière réelle, prêt à poser sur l'objet. */
export function presetFx(p: MaterialPreset, base: Fx): Fx {
  return { ...base, amount: p.amount, ...(p.knobs ? { knobs: { ...base.knobs, ...p.knobs } } : {}), ...(p.tone ? { tone: p.tone } : {}), preset: p.name };
}
