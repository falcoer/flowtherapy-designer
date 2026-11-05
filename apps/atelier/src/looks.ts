import { guideColor, type Guide } from './model';
import type { Fx } from './fx';

/**
 * Styles photographiques. Chaque style est une fonction par pixel (couleurs
 * 0..1), suivie d'effets d'ensemble facultatifs : vignettage, grain, halo.
 * Certains styles prennent leurs teintes dans les guides de la palette.
 */

export type LookId =
  | 'mono'
  | 'bw'
  | 'vintage'
  | 'polaroid'
  | 'sepia'
  | 'kodachrome'
  | 'chrome'
  | 'cross'
  | 'bleach'
  | 'matte'
  | 'pastel'
  | 'highkey'
  | 'lowkey'
  | 'hdr'
  | 'duotone'
  | 'tritone'
  | 'cyber'
  | 'synth'
  | 'cold'
  | 'warm'
  | 'golden'
  | 'moody';

type RGB = [number, number, number];
interface Ctx {
  /** Teintes des guides choisis. */
  cols: RGB[];
  /** Guides eux-mêmes (pour suivre un dégradé selon la luminosité). */
  guides: Array<Guide | undefined>;
  /** Image floutée (HDR, halo), mêmes dimensions. */
  blur?: RGB;
}

export interface LookDef {
  id: LookId;
  name: string;
  /** Rôles des guides demandés, avec l'index proposé par défaut. */
  slots: Array<{ label: string; def: number }>;
  px: (c: RGB, x: number, y: number, k: Ctx) => RGB;
  vignette?: number;
  grain?: number;
  glow?: number;
  needsBlur?: boolean;
}

const cl = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lum = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sat = (c: RGB, k: number): RGB => {
  const l = lum(c);
  return [l + (c[0] - l) * k, l + (c[1] - l) * k, l + (c[2] - l) * k];
};
const contrast = (c: RGB, k: number, p = 0.5): RGB => [p + (c[0] - p) * k, p + (c[1] - p) * k, p + (c[2] - p) * k];
const scurve = (v: number, k: number) => {
  const x = cl(v);
  const s = x < 0.5 ? 0.5 * Math.pow(2 * x, k) : 1 - 0.5 * Math.pow(2 * (1 - x), k);
  return s;
};
const lift = (c: RGB, black: number, white = 1): RGB => [black + c[0] * (white - black), black + c[1] * (white - black), black + c[2] * (white - black)];
const gain = (c: RGB, r: number, g: number, b: number): RGB => [c[0] * r, c[1] * g, c[2] * b];
/** Virage partagé : une teinte dans les ombres, une autre dans les hautes lumières. */
const split = (c: RGB, sh: RGB, hi: RGB, amt: number): RGB => {
  const l = lum(c);
  const t = mix(sh, hi, l);
  return mix(c, [c[0] * (0.5 + t[0]), c[1] * (0.5 + t[1]), c[2] * (0.5 + t[2])], amt);
};
/** Carte de luminosité : noir → teinte(s) → blanc. */
const ramp = (l: number, stops: RGB[]): RGB => {
  const x = cl(l) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  return mix(stops[i]!, stops[i + 1]!, x - i);
};
const BLACK: RGB = [0.04, 0.03, 0.06];
const WHITE: RGB = [0.98, 0.97, 0.95];
const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
/** Couleur d'un guide le long de sa propre plage (dégradé) ou unie. */
const along = (g: Guide | undefined, t: number): RGB => hex(guideColor(g, t));

export const LOOKS: LookDef[] = [
  {
    id: 'mono',
    name: 'Monochrome coloré',
    slots: [{ label: 'Teinte', def: 3 }],
    px: (c, _x, _y, k) => ramp(scurve(lum(c), 1.3), [BLACK, mix(BLACK, k.cols[0]!, 0.55), k.cols[0]!, mix(k.cols[0]!, WHITE, 0.75)]),
  },
  {
    id: 'bw',
    name: 'Noir et blanc contrasté',
    slots: [],
    px: (c) => {
      const l = scurve(lum(sat(c, 1.2)), 2.2);
      return [l, l, l];
    },
    grain: 0.05,
    vignette: 0.25,
  },
  {
    id: 'vintage',
    name: 'Vintage années 1970',
    slots: [],
    px: (c) => {
      let o = sat(c, 0.7);
      o = [scurve(o[0], 1.15), o[1], o[2] * 0.85 + 0.05];
      o = gain(o, 1.08, 1.0, 0.86);
      return lift(o, 0.1, 0.93);
    },
    vignette: 0.35,
    grain: 0.06,
  },
  {
    id: 'sepia',
    name: 'Sépia',
    slots: [],
    px: (c) => {
      // virage sépia des tirages anciens : brun chaud dans les ombres, crème dans les blancs, noirs levés
      const l = scurve(lum(c), 1.1);
      const o = ramp(l, [
        [0.13, 0.08, 0.05],
        [0.44, 0.3, 0.19],
        [0.76, 0.62, 0.45],
        [0.96, 0.91, 0.8],
      ]);
      return lift(o, 0.05, 0.97);
    },
    vignette: 0.3,
    grain: 0.05,
  },
  {
    id: 'polaroid',
    name: 'Polaroid',
    slots: [],
    px: (c) => {
      let o = contrast(sat(c, 0.85), 0.85);
      o = split(o, [0.35, 0.55, 0.6], [0.62, 0.55, 0.42], 0.45);
      return lift(o, 0.08, 0.95);
    },
    vignette: 0.2,
    grain: 0.03,
  },
  {
    id: 'kodachrome',
    name: 'Kodachrome',
    slots: [],
    px: (c) => {
      let o = sat(c, 1.35);
      o = [scurve(o[0], 1.35), scurve(o[1], 1.25), scurve(o[2], 1.3)];
      return gain(o, 1.05, 1.0, 0.94);
    },
    vignette: 0.15,
  },
  {
    id: 'chrome',
    name: 'Fujifilm Classic Chrome',
    slots: [],
    px: (c) => {
      let o = sat(c, 0.65);
      o = [o[0] * 0.96, o[1], o[2]];
      o = [scurve(o[0], 1.2), scurve(o[1], 1.2), scurve(o[2], 1.15)];
      return split(o, [0.42, 0.52, 0.55], [0.55, 0.52, 0.47], 0.35);
    },
  },
  {
    id: 'cross',
    name: 'Cross-processing',
    slots: [],
    px: (c) => {
      const o: RGB = [scurve(c[0], 1.6), scurve(c[1] * 1.04, 1.3), 0.18 + c[2] * 0.62];
      return sat(o, 1.2);
    },
    vignette: 0.2,
  },
  {
    id: 'bleach',
    name: 'Bleach bypass',
    slots: [],
    px: (c) => {
      const l = lum(c);
      const o = mix(c, [l, l, l], 0.6);
      return [scurve(o[0], 1.8), scurve(o[1], 1.8), scurve(o[2], 1.8)];
    },
    grain: 0.04,
  },
  {
    id: 'matte',
    name: 'Matte / Fade',
    slots: [],
    px: (c) => lift(contrast(sat(c, 0.88), 0.9), 0.13, 0.92),
  },
  {
    id: 'pastel',
    name: 'Pastel',
    slots: [],
    px: (c) => gain(lift(sat(c, 0.55), 0.32, 1), 1.02, 0.98, 1.0),
    glow: 0.2,
  },
  {
    id: 'highkey',
    name: 'High-key',
    slots: [],
    px: (c) => {
      const o = lift(contrast(c, 0.75, 0.2), 0.18, 1);
      return sat([o[0] * 1.12, o[1] * 1.12, o[2] * 1.12], 0.85);
    },
    glow: 0.3,
  },
  {
    id: 'lowkey',
    name: 'Low-key',
    slots: [],
    px: (c) => {
      const o = gain(c, 0.72, 0.72, 0.75);
      return [scurve(o[0], 1.7), scurve(o[1], 1.7), scurve(o[2], 1.7)];
    },
    vignette: 0.6,
  },
  {
    id: 'hdr',
    name: 'HDR artistique',
    slots: [],
    needsBlur: true,
    px: (c, _x, _y, k) => {
      const b = k.blur!;
      // contraste local : on renforce l'écart à la moyenne du voisinage
      const o: RGB = [c[0] + (c[0] - b[0]) * 1.3, c[1] + (c[1] - b[1]) * 1.3, c[2] + (c[2] - b[2]) * 1.3];
      return sat(lift(o, 0.04, 1), 1.35);
    },
    vignette: 0.25,
  },
  {
    id: 'duotone',
    name: 'Duotone',
    slots: [
      { label: 'Ombres', def: 1 },
      { label: 'Lumières', def: 4 },
    ],
    px: (c, _x, _y, k) => ramp(scurve(lum(c), 1.2), [k.cols[0]!, k.cols[1]!]),
  },
  {
    id: 'tritone',
    name: 'Tritone',
    slots: [
      { label: 'Ombres', def: 1 },
      { label: 'Tons moyens', def: 2 },
      { label: 'Lumières', def: 0 },
    ],
    px: (c, _x, _y, k) => ramp(scurve(lum(c), 1.2), [k.cols[0]!, k.cols[1]!, k.cols[2]!]),
  },
  {
    id: 'cyber',
    name: 'Cyberpunk / Néon',
    slots: [
      { label: 'Néon 1', def: 2 },
      { label: 'Néon 2', def: 3 },
    ],
    px: (c, _x, _y, k) => {
      const l = lum(c);
      // ombres bleu nuit, lumières partagées entre les deux néons selon la teinte
      const n = mix(k.cols[1]!, k.cols[0]!, cl((c[0] - c[2]) * 1.5 + 0.5));
      const o = mix([0.05, 0.03, 0.16], n, scurve(l, 1.4));
      return sat(mix(o, [o[0] * 1.3, o[1] * 1.3, o[2] * 1.3], l * l), 1.3);
    },
    glow: 0.45,
    vignette: 0.35,
  },
  {
    id: 'synth',
    name: 'Synthwave / Vaporwave',
    slots: [{ label: 'Dégradé', def: 5 }],
    px: (c, _x, y, k) => {
      const l = scurve(lum(c), 1.25);
      // la lumière suit le dégradé du guide ; le ciel (haut de l'image) tire vers son début
      const g = along(k.guides[0], cl(1 - l * 0.85 - (1 - y) * 0.15));
      return mix(mix([0.08, 0.02, 0.15], g, l), WHITE, l * l * 0.35);
    },
    glow: 0.4,
    grain: 0.03,
  },
  {
    id: 'cold',
    name: 'Ambiance froide',
    slots: [],
    px: (c) => split(sat(gain(c, 0.9, 0.98, 1.1), 0.9), [0.4, 0.5, 0.65], [0.48, 0.52, 0.58], 0.4),
  },
  {
    id: 'warm',
    name: 'Ambiance chaude',
    slots: [],
    px: (c) => split(sat(gain(c, 1.1, 1.02, 0.86), 1.05), [0.55, 0.47, 0.4], [0.6, 0.52, 0.4], 0.35),
  },
  {
    id: 'golden',
    name: 'Golden Hour',
    slots: [],
    px: (c) => {
      const l = lum(c);
      const o = gain(c, 1.15, 1.0, 0.75);
      return lift(sat(mix(o, [1, 0.72, 0.35], l * 0.35), 1.1), 0.05, 1);
    },
    glow: 0.35,
    vignette: 0.25,
  },
  {
    id: 'moody',
    name: 'Moody / Dark',
    slots: [],
    px: (c) => {
      let o = sat(gain(c, 0.85, 0.85, 0.85), 0.7);
      o = [scurve(o[0], 1.3), scurve(o[1], 1.3), scurve(o[2], 1.3)];
      return split(o, [0.38, 0.5, 0.5], [0.52, 0.5, 0.46], 0.4);
    },
    vignette: 0.55,
    grain: 0.03,
  },
];

export const lookOf = (id: LookId | undefined) => LOOKS.find((x) => x.id === id);

export interface LookSettings {
  /** Style photographique ; absent = photo d'origine (un filtre dessin peut rester seul). */
  style?: LookId;
  /** Filtre dessin, posé après le style. */
  draw?: Fx;
  /** Index des guides utilisés, dans l'ordre des rôles du style. */
  guides: number[];
  /** Mélange avec l'original (0 = original, 1 = transformée). */
  mix: number;
}

export function lookGuides(def: LookDef, s: LookSettings | undefined): number[] {
  return def.slots.map((sl, i) => s?.guides[i] ?? sl.def);
}

const cache = new Map<string, HTMLCanvasElement>();

/** Image transformée (mise en cache), à au plus `max` px de côté. */
export function applyLook(im: CanvasImageSource & { width: number; height: number }, key: string, def: LookDef, guides: Array<Guide | undefined>, max = 1400): HTMLCanvasElement {
  const ck = `${key}|${def.id}|${JSON.stringify(guides)}|${max}`;
  const hit = cache.get(ck);
  if (hit) return hit;
  const sw = (im as HTMLImageElement).naturalWidth || im.width;
  const sh = (im as HTMLImageElement).naturalHeight || im.height;
  const k = Math.min(1, max / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * k));
  const h = Math.max(1, Math.round(sh * k));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(im, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let blur: Uint8ClampedArray | null = null;
  if (def.needsBlur || def.glow) {
    const b = document.createElement('canvas');
    b.width = w;
    b.height = h;
    const bx = b.getContext('2d', { willReadFrequently: true })!;
    bx.filter = `blur(${Math.max(2, Math.round(Math.max(w, h) * 0.02))}px)`;
    bx.drawImage(c, 0, 0);
    blur = bx.getImageData(0, 0, w, h).data;
  }
  const cols = guides.map((g) => hex(guideColor(g, 0.5)));
  const kx: Ctx = { cols, guides };
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const src: RGB = [d[i]! / 255, d[i + 1]! / 255, d[i + 2]! / 255];
      if (blur) kx.blur = [blur[i]! / 255, blur[i + 1]! / 255, blur[i + 2]! / 255];
      const u = x / w;
      const v = y / h;
      let o = def.px(src, u, v, kx);
      if (def.glow && blur) {
        // halo : les hautes lumières floutées s'ajoutent en « écran »
        const bl = kx.blur!;
        const gl = Math.max(0, lum(bl) - 0.55) * 2 * def.glow;
        o = [1 - (1 - o[0]) * (1 - bl[0] * gl), 1 - (1 - o[1]) * (1 - bl[1] * gl), 1 - (1 - o[2]) * (1 - bl[2] * gl)];
      }
      if (def.vignette) {
        const r = Math.hypot(u - 0.5, v - 0.5) / 0.7071;
        const f = 1 - def.vignette * Math.pow(r, 2.2);
        o = [o[0] * f, o[1] * f, o[2] * f];
      }
      if (def.grain) {
        const n = (rnd() - 0.5) * def.grain * 2;
        o = [o[0] + n, o[1] + n, o[2] + n];
      }
      d[i] = cl(o[0]) * 255;
      d[i + 1] = cl(o[1]) * 255;
      d[i + 2] = cl(o[2]) * 255;
    }
  ctx.putImageData(img, 0, 0);
  if (cache.size > 40) cache.clear();
  cache.set(ck, c);
  return c;
}
