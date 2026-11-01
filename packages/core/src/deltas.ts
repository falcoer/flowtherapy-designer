/**
 * Deltas : chaque attribut d'un élément peut dévier de sa valeur de base via
 * un curseur centré sur 0. Le projet n'enregistre que l'écart.
 */

export interface DeltaSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  /** Affichage de la valeur résultante pour l'utilisateur. */
  describe: (v: number) => string;
}

const pct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)} %`;

export const DELTA_SPECS: DeltaSpec[] = [
  { key: 'size', label: 'Taille', min: -1, max: 1, step: 0.01, describe: (v) => `×${(2 ** v).toFixed(2)}` },
  { key: 'dx', label: 'Décalage horizontal', min: -0.25, max: 0.25, step: 0.005, describe: pct },
  { key: 'dy', label: 'Décalage vertical', min: -0.25, max: 0.25, step: 0.005, describe: pct },
  { key: 'rotation', label: 'Rotation', min: -45, max: 45, step: 1, unit: '°', describe: (v) => `${v > 0 ? '+' : ''}${v}°` },
  { key: 'opacity', label: 'Opacité', min: -1, max: 0, step: 0.01, describe: pct },
  { key: 'color.hue', label: 'Teinte', min: -180, max: 180, step: 1, unit: '°', describe: (v) => `${v > 0 ? '+' : ''}${v}°` },
  { key: 'color.lightness', label: 'Clarté', min: -0.5, max: 0.5, step: 0.01, describe: pct },
  { key: 'color.chroma', label: 'Saturation', min: -0.5, max: 0.5, step: 0.01, describe: pct },
];

export function deltaSpec(key: string): DeltaSpec | undefined {
  return DELTA_SPECS.find((s) => s.key === key);
}

export function clampDelta(key: string, value: number): number {
  const spec = deltaSpec(key);
  if (!spec) return value;
  return Math.max(spec.min, Math.min(spec.max, value));
}

/** Facteur multiplicatif de taille : échelle logarithmique symétrique (×0,5 à ×2). */
export const sizeFactor = (delta = 0) => 2 ** clampDelta('size', delta);
