import type { Fx, FxId } from './fx';

/**
 * Matières réelles proposées par l'assistant (baguette magique du Support) : chacune est une matière
 * de l'atelier avec ses réglages et sa teinte naturelle (sans teinte : la couleur de l'objet reste).
 */
export interface MaterialPreset {
  name: string;
  /** Une ligne pour reconnaître la matière (sa structure : la couleur reste celle de l'objet). */
  hint: string;
  fx: FxId;
  amount: number;
  knobs?: Record<string, number>;
}
export interface MaterialType {
  id: string;
  name: string;
  presets: MaterialPreset[];
}

const wood = (name: string, hint: string, size: number, knots: number, angle = 0): MaterialPreset => ({ name, hint, fx: 'wood', amount: 0.65, knobs: { angle, knots, size } });
const m = (name: string, hint: string, fx: FxId, amount: number): MaterialPreset => ({ name, hint, fx, amount });

/**
 * Matières réelles proposées par l'assistant : une matière de l'atelier et ses réglages. Elles ne portent
 * aucune couleur : la teinte reste celle de l'objet, choisie dans la palette.
 */
export const MATERIAL_TYPES: MaterialType[] = [
  {
    id: 'bois',
    name: 'Bois',
    presets: [
      wood('Chêne', 'cernes marqués, quelques nœuds', 0.62, 0.12),
      wood('Pin', 'larges cernes, nombreux nœuds', 0.85, 0.55),
      wood('Sapin', 'cernes larges et réguliers', 0.75, 0.3),
      wood('Hêtre', 'fil très fin, sans nœud', 0.12, 0),
      wood('Érable', 'fil serré, lisse', 0.08, 0.04),
      wood('Merisier', 'fil fin, quelques nœuds', 0.3, 0.08),
      wood('Noyer', 'veinage ondoyant', 0.5, 0.1),
      wood('Teck', 'veinage moyen, régulier', 0.45, 0.04),
      wood('Olivier', 'veiné et noueux', 0.4, 0.45),
      wood('Panneau debout', 'fil vertical, comme une porte', 0.5, 0.15, 0.5),
    ],
  },
  {
    id: 'metaux',
    name: 'Métaux',
    presets: [m('Acier brossé', 'rayures fines', 'metal', 0.7), m('Métal poli', 'brossage léger', 'metal', 0.35), m('Aluminium', 'mat, léger', 'aluminium', 0.6), m('Miroir', 'chromé, reflète la lumière', 'mirror', 0.7), m('Fibre de carbone', 'tissage technique', 'carbon', 0.7)],
  },
  {
    id: 'pierres',
    name: 'Pierres et bétons',
    presets: [m('Béton brut', 'bullé, rugueux', 'concrete', 0.7), m('Béton ciré', 'lisse', 'concrete', 0.35), m('Ardoise', 'feuilletée', 'slate', 0.7), m('Tableau noir', 'ardoise d’école, douce', 'slate', 0.45), m('Liège', 'grumeleux', 'cork', 0.7)],
  },
  {
    id: 'papiers',
    name: 'Papiers et cartons',
    presets: [
      m('Kraft', 'papier d’emballage fibreux', 'kraft', 0.7),
      m('Carton ondulé', 'cannelures', 'corrugated', 0.7),
      m('Carton gris', 'recyclé, maquette', 'greyboard', 0.7),
      m('Bristol', 'épais, lisse', 'bristol', 0.6),
      m('Papier aquarelle', 'grain marqué', 'watercolor', 0.7),
      m('Papier journal', 'fibreux, trame', 'newsprint', 0.7),
      m('Papier calque', 'translucide', 'tracing', 0.6),
    ],
  },
  {
    id: 'textiles',
    name: 'Textiles et cuirs',
    presets: [
      m('Velours de scène', 'rideau de théâtre, épais', 'felt', 0.75),
      m('Feutre', 'laine pressée', 'felt', 0.55),
      m('Toile de lin', 'tissage visible', 'canvas', 0.75),
      m('Toile fine', 'coton serré', 'canvas', 0.45),
      m('Jean', 'sergé, délavé', 'denim', 0.7),
      m('Cuir', 'grainé, tanné', 'leather', 0.7),
      m('Cuir souple', 'plis doux', 'soft-leather', 0.7),
      m('Daim', 'velouté', 'suede', 0.7),
    ],
  },
  {
    id: 'transparents',
    name: 'Transparents',
    presets: [m('Verre', 'clair, reflets', 'glass', 0.6), m('Verre dépoli', 'laiteux', 'frosted', 0.6), m('Plexiglas', 'acrylique', 'plexi', 0.6), m('Glace', 'givrée, fissurée', 'ice', 0.6), m('Verre fumé', 'teinté sombre', 'smoke', 0.6), m('Hologramme', 'irisé', 'hologram', 0.6)],
  },
];

/** Le réglage d'une matière réelle, prêt à poser sur l'objet (sans lien à la palette : c'est une nouvelle matière). */
export function presetFx(p: MaterialPreset, base: Fx): Fx {
  const { ref: _r, ...rest } = base;
  return { ...rest, amount: p.amount, ...(p.knobs ? { knobs: { ...base.knobs, ...p.knobs } } : {}), preset: p.name };
}
