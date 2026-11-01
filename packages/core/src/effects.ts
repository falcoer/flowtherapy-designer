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

/** Effets de volume : ombre portée, relief (bouton), direction de la lumière. */
export const DEPTH_SPECS: EffectSpec[] = [
  { key: 'fx.shadow', label: 'Ombre portée', min: 0, max: 1, step: 0.01, neutral: 0, describe: pct },
  { key: 'fx.shadowSoft', label: 'Douceur de l’ombre', min: 0, max: 1, step: 0.01, neutral: 0, describe: pct },
  { key: 'fx.relief', label: 'Relief', min: 0, max: 1, step: 0.01, neutral: 0, describe: pct },
  { key: 'fx.light', label: 'Lumière', min: -180, max: 180, step: 5, neutral: 0, describe: (v) => `${v > 0 ? '+' : ''}${v}°` },
];

export interface Effects {
  dilution: number;
  blur: number;
  saturation: number;
  hue: number;
  contrast: number;
  shadow: number;
  shadowSoft: number;
  relief: number;
  /** Décalage de la lumière ; 0 = lumière venant du haut à gauche. */
  light: number;
  shadowColor: string;
}

const ALL = [...EFFECT_SPECS, ...DEPTH_SPECS];
const clamp = (key: string, v: number | undefined) => {
  const s = ALL.find((e) => e.key === key)!;
  return Math.max(s.min, Math.min(s.max, v ?? s.neutral));
};

/** Effets d'un jeu de deltas, ou undefined s'il n'y en a aucun (hors opacité). */
export function effectsOf(deltas: Record<string, number> = {}, shadowColor = '#000000'): Effects | undefined {
  const fx: Effects = {
    dilution: clamp('fx.dilution', deltas['fx.dilution']),
    blur: clamp('fx.blur', deltas['fx.blur']),
    saturation: clamp('fx.saturation', deltas['fx.saturation']),
    hue: clamp('fx.hue', deltas['fx.hue']),
    contrast: clamp('fx.contrast', deltas['fx.contrast']),
    shadow: clamp('fx.shadow', deltas['fx.shadow']),
    shadowSoft: clamp('fx.shadowSoft', deltas['fx.shadowSoft']),
    relief: clamp('fx.relief', deltas['fx.relief']),
    light: clamp('fx.light', deltas['fx.light']),
    shadowColor,
  };
  const active = [fx.dilution, fx.blur, fx.saturation, fx.hue, fx.contrast, fx.shadow, fx.relief].some((v) => Math.abs(v) > 1e-4);
  return active ? fx : undefined;
}

/** Écart-type du flou en unités du format : 100 % = 2 % du petit côté. */
export const blurRadius = (fx: Effects | undefined, minSide: number) => (fx ? fx.blur * 0.02 * minSide : 0);

export interface FilterPrimitive {
  tag: string;
  attrs: Record<string, string | number>;
  children?: FilterPrimitive[];
}

const r = (v: number) => Number(v.toFixed(4));
const linear = (tag: string, attrs: Record<string, string | number>, slope: number, intercept: number): FilterPrimitive => {
  const f = { type: 'linear', slope: r(slope), intercept: r(intercept) };
  return { tag, attrs, children: [{ tag: 'feFuncR', attrs: f }, { tag: 'feFuncG', attrs: f }, { tag: 'feFuncB', attrs: f }] };
};

/** Élévation de la lumière du relief (degrés). */
const ELEVATION = 50;

/**
 * Chaîne de primitives : couleur, dilution, flou, relief, puis ombre portée
 * glissée dessous. `rotation` est celle de l'élément : la lumière reste fixe
 * sur la page quand on tourne l'objet. `depthBase` règle l'échelle de l'ombre
 * et du relief, pour qu'un petit texte ne reçoive pas l'ombre d'une grande photo.
 */
export function effectPrimitives(fx: Effects, minSide: number, rotation = 0, depthBase = minSide): FilterPrimitive[] {
  const out: FilterPrimitive[] = [];
  let cur = 'SourceGraphic';
  let n = 0;
  const push = (p: FilterPrimitive, input: string | null = cur) => {
    const result = `r${n++}`;
    out.push({ ...p, attrs: { ...(input ? { in: input } : {}), ...p.attrs, result } });
    return result;
  };
  if (fx.saturation) cur = push({ tag: 'feColorMatrix', attrs: { type: 'saturate', values: r(1 + fx.saturation) } });
  if (fx.hue) cur = push({ tag: 'feColorMatrix', attrs: { type: 'hueRotate', values: r(fx.hue) } });
  if (fx.contrast) {
    // -1 → gris uniforme, +1 → contraste ×3
    const slope = fx.contrast >= 0 ? 1 + 2 * fx.contrast : 1 + fx.contrast;
    cur = push(linear('feComponentTransfer', {}, slope, 0.5 - 0.5 * slope));
  }
  // dilution : la couleur se lave vers le blanc du papier, comme une encre diluée
  if (fx.dilution) cur = push(linear('feComponentTransfer', {}, 1 - fx.dilution, fx.dilution));
  const std = blurRadius(fx, minSide);
  if (std > 0) cur = push({ tag: 'feGaussianBlur', attrs: { stdDeviation: r(std) } });

  // direction de la lumière dans le repère de l'élément (azimut SVG : 225° = haut gauche)
  const azimuth = (((225 + fx.light - rotation) % 360) + 360) % 360;
  if (fx.relief > 0) {
    const light = [{ tag: 'feDistantLight', attrs: { azimuth: r(azimuth), elevation: ELEVATION } }];
    const bevel = push({ tag: 'feGaussianBlur', attrs: { stdDeviation: r((0.002 + 0.01 * fx.relief) * depthBase) } }, 'SourceAlpha');
    const scale = r(2 + 6 * fx.relief);
    const diff = push({ tag: 'feDiffuseLighting', attrs: { surfaceScale: scale, diffuseConstant: 1, 'lighting-color': '#ffffff' }, children: light }, bevel);
    const spec = push(
      { tag: 'feSpecularLighting', attrs: { surfaceScale: scale, specularConstant: r(0.3 + 0.7 * fx.relief), specularExponent: 18, 'lighting-color': '#ffffff' }, children: light },
      bevel,
    );
    // ombrage : la face plane garde sa couleur (1 / sin élévation), les pentes s'éclairent ou s'assombrissent
    const shade = push({ tag: 'feComposite', attrs: { in2: diff, operator: 'arithmetic', k1: r(1 / Math.sin((ELEVATION * Math.PI) / 180)), k2: 0, k3: 0, k4: 0 } });
    const shine = push({ tag: 'feComposite', attrs: { in2: 'SourceAlpha', operator: 'in' } }, spec);
    const lit = push({ tag: 'feComposite', attrs: { in2: shine, operator: 'arithmetic', k1: 0, k2: 1, k3: 1, k4: 0 } }, shade);
    cur = push({ tag: 'feComposite', attrs: { in2: cur, operator: 'in' } }, lit);
  }
  if (fx.shadow > 0) {
    const dist = fx.shadow * 0.04 * depthBase;
    const a = ((azimuth + 180) * Math.PI) / 180;
    const blurred = push({ tag: 'feGaussianBlur', attrs: { stdDeviation: r((0.002 + 0.03 * fx.shadowSoft) * depthBase + dist * 0.15) } }, 'SourceAlpha');
    const moved = push({ tag: 'feOffset', attrs: { dx: r(Math.cos(a) * dist), dy: r(Math.sin(a) * dist) } }, blurred);
    const flood = push({ tag: 'feFlood', attrs: { 'flood-color': fx.shadowColor, 'flood-opacity': 0.55 } }, null);
    const shadow = push({ tag: 'feComposite', attrs: { in2: moved, operator: 'in' } }, flood);
    cur = push({ tag: 'feMerge', attrs: {}, children: [{ tag: 'feMergeNode', attrs: { in: shadow } }, { tag: 'feMergeNode', attrs: { in: cur } }] }, null);
  }
  return out;
}

/** Zone du filtre : relative à l'élément, ou en unités du format (fond). */
export function filterRegion(region?: { x: number; y: number; w: number; h: number }): Record<string, string | number> {
  return region
    ? { filterUnits: 'userSpaceOnUse', x: r(region.x), y: r(region.y), width: r(region.w), height: r(region.h) }
    : { x: '-50%', y: '-50%', width: '200%', height: '200%' };
}

const esc = (v: string | number) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
function primitiveSvg(p: FilterPrimitive): string {
  const attrs = Object.entries(p.attrs)
    .map(([k, v]) => ` ${k}="${esc(v)}"`)
    .join('');
  return p.children?.length ? `<${p.tag}${attrs}>${p.children.map(primitiveSvg).join('')}</${p.tag}>` : `<${p.tag}${attrs}/>`;
}

/** Échelle du volume d'un élément : moyenne géométrique de sa taille et du format. */
export const depthBaseOf = (w: number, h: number, minSide: number) => Math.sqrt(Math.max(1e-6, Math.min(w, h)) * minSide);

/** Filtre SVG complet (chaîne), pour l'export. */
export function effectFilterSvg(id: string, fx: Effects, minSide: number, region?: { x: number; y: number; w: number; h: number }, rotation = 0, depthBase = minSide): string {
  const zone = Object.entries(filterRegion(region))
    .map(([k, v]) => ` ${k}="${v}"`)
    .join('');
  return `<filter id="${id}"${zone} color-interpolation-filters="sRGB">${effectPrimitives(fx, minSide, rotation, depthBase).map(primitiveSvg).join('')}</filter>`;
}
