/**
 * Couleurs en OKLCH : un espace perçu de façon régulière, utilisé pour les
 * deltas de teinte/clarté et pour l'assistant d'harmonies.
 */

export interface Oklch {
  l: number; // 0..1
  c: number; // 0..~0.4
  h: number; // degrés 0..360
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Couleur invalide : "${hex}"`);
  let s = m[1]!;
  if (s.length === 3) s = [...s].map((ch) => ch + ch).join('');
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

const toLinear = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number) => {
  const s = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return s * 255;
};

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as [number, number, number];
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const c = Math.sqrt(A * A + B * B);
  const h = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

export function oklchToHex({ l, c, h }: Oklch): string {
  const hr = (h * Math.PI) / 180;
  const A = c * Math.cos(hr);
  const B = c * Math.sin(hr);
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const b = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  return rgbToHex([fromLinear(clamp(r)), fromLinear(clamp(g)), fromLinear(clamp(b))]);
}

/** Décale une couleur : teinte en degrés, clarté et chroma en valeurs relatives (−0.5..0.5). */
export function shiftColor(hex: string, delta: { h?: number; l?: number; c?: number }): string {
  const o = hexToOklch(hex);
  return oklchToHex({
    l: Math.max(0, Math.min(1, o.l * (1 + (delta.l ?? 0)))),
    c: Math.max(0, o.c * (1 + (delta.c ?? 0))),
    h: (o.h + (delta.h ?? 0) + 360) % 360,
  });
}

export type HarmonyKind = 'complementary' | 'split' | 'triadic' | 'tetradic' | 'analogous' | 'tints';

/** Couleurs proposées par l'assistant à partir d'une couleur de base. */
export function harmonies(hex: string): Record<HarmonyKind, string[]> {
  const rot = (deg: number) => shiftColor(hex, { h: deg });
  return {
    complementary: [rot(180)],
    split: [rot(150), rot(210)],
    triadic: [rot(120), rot(240)],
    tetradic: [rot(90), rot(180), rot(270)],
    analogous: [rot(-30), rot(30)],
    tints: [shiftColor(hex, { l: -0.3 }), shiftColor(hex, { l: 0.3 })],
  };
}

/** Contraste WCAG entre deux couleurs (1 à 21). */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = hexToRgb(hex).map(toLinear) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
