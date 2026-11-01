/**
 * Effets : opacité, dilution, flou, saturation, teinte, contraste. Ils sont
 * enregistrés comme deltas (« fx.* ») et rendus en filtre SVG, identique à
 * l'écran et à l'export. D'autres effets (shaders GLSL) viendront s'y ajouter.
 */

export interface EffectSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Valeur neutre (pas d'effet). */
  neutral: number;
  describe: (v: number) => string;
}

const pct = (v: number) => `${Math.round(v * 100)} %`;
const signed = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)} %`;

/** Effets réglables. L'opacité garde sa clé historique « opacity » (0 à -1). */
export const EFFECT_SPECS: EffectSpec[] = [
  { key: 'opacity', label: 'Opacité', min: -1, max: 0, step: 0.01, neutral: 0, describe: (v) => pct(1 + v) },
  { key: 'fx.dilution', label: 'Dilution', min: 0, max: 1, step: 0.01, neutral: 0, describe: pct },
  { key: 'fx.blur', label: 'Flou', min: 0, max: 1, step: 0.01, neutral: 0, describe: pct },
  { key: 'fx.saturation', label: 'Saturation', min: -1, max: 1, step: 0.01, neutral: 0, describe: signed },
  { key: 'fx.hue', label: 'Teinte', min: -180, max: 180, step: 1, neutral: 0, describe: (v) => `${v > 0 ? '+' : ''}${v}°` },
  { key: 'fx.contrast', label: 'Contraste', min: -1, max: 1, step: 0.01, neutral: 0, describe: signed },
];

export interface Effects {
  dilution: number;
  blur: number;
  saturation: number;
  hue: number;
  contrast: number;
}

const clamp = (key: string, v: number | undefined) => {
  const s = EFFECT_SPECS.find((e) => e.key === key)!;
  return Math.max(s.min, Math.min(s.max, v ?? s.neutral));
};

/** Effets d'un jeu de deltas, ou undefined s'il n'y en a aucun (hors opacité). */
export function effectsOf(deltas: Record<string, number> = {}): Effects | undefined {
  const fx: Effects = {
    dilution: clamp('fx.dilution', deltas['fx.dilution']),
    blur: clamp('fx.blur', deltas['fx.blur']),
    saturation: clamp('fx.saturation', deltas['fx.saturation']),
    hue: clamp('fx.hue', deltas['fx.hue']),
    contrast: clamp('fx.contrast', deltas['fx.contrast']),
  };
  return Object.values(fx).some((v) => Math.abs(v) > 1e-4) ? fx : undefined;
}

/** Écart-type du flou en unités du format : 100 % = 2 % du petit côté. */
export const blurRadius = (fx: Effects | undefined, minSide: number) => (fx ? fx.blur * 0.02 * minSide : 0);

export interface FilterPrimitive {
  tag: 'feColorMatrix' | 'feComponentTransfer' | 'feGaussianBlur';
  attrs: Record<string, string | number>;
  /** Fonctions de transfert R, G, B (feComponentTransfer). */
  linear?: { slope: number; intercept: number };
}

const r = (v: number) => Number(v.toFixed(4));

/** Chaîne de primitives du filtre, dans l'ordre : couleur, puis dilution, puis flou. */
export function effectPrimitives(fx: Effects, minSide: number): FilterPrimitive[] {
  const out: FilterPrimitive[] = [];
  if (fx.saturation) out.push({ tag: 'feColorMatrix', attrs: { type: 'saturate', values: r(1 + fx.saturation) } });
  if (fx.hue) out.push({ tag: 'feColorMatrix', attrs: { type: 'hueRotate', values: r(fx.hue) } });
  if (fx.contrast) {
    // -1 → gris uniforme, +1 → contraste ×3
    const slope = fx.contrast >= 0 ? 1 + 2 * fx.contrast : 1 + fx.contrast;
    out.push({ tag: 'feComponentTransfer', attrs: {}, linear: { slope: r(slope), intercept: r(0.5 - 0.5 * slope) } });
  }
  // dilution : la couleur se lave vers le blanc du papier, comme une encre diluée
  if (fx.dilution) out.push({ tag: 'feComponentTransfer', attrs: {}, linear: { slope: r(1 - fx.dilution), intercept: r(fx.dilution) } });
  const std = blurRadius(fx, minSide);
  if (std > 0) out.push({ tag: 'feGaussianBlur', attrs: { stdDeviation: r(std) } });
  return out;
}

/** Zone du filtre : relative à l'élément, ou en unités du format (fond). */
export function filterRegion(region?: { x: number; y: number; w: number; h: number }): Record<string, string | number> {
  return region
    ? { filterUnits: 'userSpaceOnUse', x: r(region.x), y: r(region.y), width: r(region.w), height: r(region.h) }
    : { x: '-50%', y: '-50%', width: '200%', height: '200%' };
}

/** Filtre SVG complet (chaîne), pour l'export. */
export function effectFilterSvg(id: string, fx: Effects, minSide: number, region?: { x: number; y: number; w: number; h: number }): string {
  const body = effectPrimitives(fx, minSide)
    .map((p) => {
      const attrs = Object.entries(p.attrs)
        .map(([k, v]) => ` ${k}="${v}"`)
        .join('');
      if (!p.linear) return `<${p.tag}${attrs}/>`;
      const f = `type="linear" slope="${p.linear.slope}" intercept="${p.linear.intercept}"`;
      return `<${p.tag}${attrs}><feFuncR ${f}/><feFuncG ${f}/><feFuncB ${f}/></${p.tag}>`;
    })
    .join('');
  const zone = Object.entries(filterRegion(region))
    .map(([k, v]) => ` ${k}="${v}"`)
    .join('');
  return `<filter id="${id}"${zone} color-interpolation-filters="sRGB">${body}</filter>`;
}
