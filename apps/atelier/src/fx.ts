import { guideColor, type Guide } from './model';

/**
 * Effets de l'outil Transformer, pour toutes les couches (photos, formes,
 * supports). Ils se cumulent dans l'ordre de la liste.
 *
 * - Matière : calcul par pixel sur la matière de la couche (photo ou aplat,
 *   peinture comprise), avant la découpe.
 * - Lumière : dessinée dans la découpe par la scène.
 * Les effets de cadre (bords, biseau, ombre intérieure, lueurs) sont dans l'outil Bords.
 */

export type FxId =
  | 'halftone'
  | 'riso'
  | 'aging'
  | 'posterize'
  | 'gradmap'
  | 'grain'
  | 'kraft'
  | 'watercolor'
  | 'corrugated'
  | 'newsprint'
  | 'gloss'
  | 'satin'
  | 'matte-varnish'
  | 'liquid'
  | 'glazed'
  | 'glacis'
  | 'canvas'
  | 'wood'
  | 'metal'
  | 'felt'
  | 'glass'
  | 'plexi'
  | 'ice'
  | 'smoke'
  | 'hologram'
  | 'greyboard'
  | 'bristol'
  | 'tracing'
  | 'frosted'
  | 'mirror'
  | 'aluminium'
  | 'concrete'
  | 'slate'
  | 'cork'
  | 'carbon'
  | 'leather'
  | 'soft-leather'
  | 'suede'
  | 'denim'
  | 'cartoon'
  | 'manga'
  | 'sketch'
  | 'pencil';

export type FxGroup = 'dessin' | 'effet' | 'materiau' | 'lumiere';

/** Familles des supports, dans l'ordre où on les propose. */
export const MATERIAL_FAMILIES = ['Papiers et cartons', 'Textiles et cuirs', 'Naturels', 'Métaux et techniques', 'Transparents'] as const;
export type MaterialFamily = (typeof MATERIAL_FAMILIES)[number];

export interface Fx {
  id: FxId;
  /** Index des guides utilisés, dans l'ordre des rôles de l'effet. */
  guides: number[];
  /** Intensité (0..1). */
  amount: number;
  /** Réglages propres à la matière (0..1), par clé : orientation du fil, nœuds… */
  knobs?: Record<string, number>;
  /** Teinte naturelle d'une matière réelle (assistant) : remplace la couleur de l'objet sous la matière. */
  tone?: string;
  /** Nom de la matière réelle choisie dans l'assistant (Chêne, Laiton…). */
  preset?: string;
}

type RGB = [number, number, number];

export interface PixelCtx {
  w: number;
  h: number;
  /** Pixels par petit côté du format : les tailles suivent la page, pas l'écran. */
  pxPerMin: number;
  cols: RGB[];
  /** Toutes les teintes de la palette (postérisation). */
  palette: RGB[];
  /** Direction vers la lumière, dans le repère de la couche. */
  lx: number;
  ly: number;
  /** Réglages propres à la matière (valeurs par défaut comprises). */
  knobs: Record<string, number>;
}

export interface FxDef {
  id: FxId;
  name: string;
  group: FxGroup;
  slots: Array<{ label: string; def: number }>;
  amount: number;
  /** Nom du curseur principal (Intensité par défaut). */
  amountLabel?: string;
  /** Unité affichée après la valeur (0..100). */
  amountUnit?: string;
  /** Famille de la matière, pour ranger les supports. */
  family?: MaterialFamily;
  /** Matière qui laisse voir à travers : l'objet gagne alors un réglage d'opacité (valeur de départ). */
  transparent?: number;
  /** Calcul par pixel (matière) ; absent = effet dessiné par la scène. */
  pixel?: (d: Uint8ClampedArray, k: PixelCtx, a: number) => void;
  /** Réglages propres à la matière, en plus de l'intensité ; `def` : valeur d'une matière posée avant ce réglage, `fresh` : celle d'une matière neuve ; `angle` : affiché en degrés (0..180°). */
  knobs?: Array<{ key: string; label: string; def: number; fresh?: number; angle?: boolean }>;
}

const cl = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export function hexRGB(c: string): RGB {
  const s = c.startsWith('#') ? c.slice(1) : c;
  const n = parseInt(s.length === 3 ? s.replace(/./g, (x) => x + x) : s.slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function hash(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s);
  const b = hash(xi + 1, yi, s);
  const c = hash(xi, yi + 1, s);
  const d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, s: number, oct = 3): number {
  let t = 0;
  let amp = 1;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    t += vnoise(x, y, s + i * 17) * amp;
    norm += amp;
    amp *= 0.5;
    x *= 2.03;
    y *= 2.03;
  }
  return t / norm;
}

/** Cellules (Worley) : distance au germe le plus proche, 0 au centre d'une cellule, ~1 à sa bordure. */
function cells(x: number, y: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let d1 = 9;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const px = xi + i + hash(xi + i, yi + j, s);
      const py = yi + j + hash(xi + i, yi + j, s + 1);
      const dd = (px - x) ** 2 + (py - y) ** 2;
      if (dd < d1) d1 = dd;
    }
  return 1 - Math.min(1, d1);
}

/** Relief : champ de hauteur éclairé par la lumière unique, appliqué en ombrage. */
function relief(d: Uint8ClampedArray, k: PixelCtx, height: (x: number, y: number) => number, strength: number, tint?: (c: RGB, x: number, y: number) => RGB) {
  const { w, h } = k;
  const H = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) H[y * w + x] = height(x, y);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const hx = H[y * w + Math.min(w - 1, x + 1)]! - H[y * w + Math.max(0, x - 1)]!;
      const hy = H[Math.min(h - 1, y + 1) * w + x]! - H[Math.max(0, y - 1) * w + x]!;
      // la face tournée vers la lumière s'éclaire, l'autre s'assombrit
      const s = 1 - strength * (hx * k.lx + hy * k.ly);
      let c: RGB = [d[i * 4]! / 255, d[i * 4 + 1]! / 255, d[i * 4 + 2]! / 255];
      if (tint) c = tint(c, x, y);
      d[i * 4] = cl(c[0] * s) * 255;
      d[i * 4 + 1] = cl(c[1] * s) * 255;
      d[i * 4 + 2] = cl(c[2] * s) * 255;
    }
}

/** Flou de boîte séparable (deux passes ≈ flou doux), rayon en pixels. */
function boxBlur(v: Float32Array, w: number, h: number, r: number, passes = 2): Float32Array {
  r = Math.max(1, Math.round(r));
  let a = v.slice();
  const t = new Float32Array(v.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      let s = 0;
      const row = y * w;
      for (let x = -r; x <= r; x++) s += a[row + Math.min(w - 1, Math.max(0, x))]!;
      for (let x = 0; x < w; x++) {
        t[row + x] = s / (2 * r + 1);
        s += a[row + Math.min(w - 1, x + r + 1)]! - a[row + Math.max(0, x - r)]!;
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x]!;
      for (let y = 0; y < h; y++) {
        a[y * w + x] = s / (2 * r + 1);
        s += t[Math.min(h - 1, y + r + 1) * w + x]! - t[Math.max(0, y - r) * w + x]!;
      }
    }
  }
  return a;
}

/** Niveaux automatiques : 2e et 98e centiles de la luminosité, pour que les seuils tiennent sur une image sombre ou claire. */
function levels(d: Uint8ClampedArray): (l: number) => number {
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < d.length; i += 16) {
    hist[Math.round(lum(d[i]! / 255, d[i + 1]! / 255, d[i + 2]! / 255) * 255)]!++;
    n++;
  }
  const at = (q: number) => {
    let c = 0;
    for (let v = 0; v < 256; v++) if ((c += hist[v]!) >= q * n) return v / 255;
    return 1;
  };
  const lo = at(0.02);
  const hi = Math.max(lo + 0.08, at(0.98));
  // aplat (forme) ou image déjà étendue : rien à corriger
  if (hi - lo > 0.85 || hi - lo < 0.3) return (l) => l;
  return (l) => cl((l - lo) / (hi - lo));
}

function channels(d: Uint8ClampedArray) {
  const lv = levels(d);
  const n = d.length / 4;
  const R = new Float32Array(n);
  const G = new Float32Array(n);
  const B = new Float32Array(n);
  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = d[i * 4]! / 255;
    const g = d[i * 4 + 1]! / 255;
    const b = d[i * 4 + 2]! / 255;
    const l0 = lum(r, g, b);
    // on étend la luminosité seule : les teintes restent les mêmes
    const l1 = lv(l0);
    const k = l0 > 0.004 ? l1 / l0 : 0;
    R[i] = cl(r * k + (l0 <= 0.004 ? l1 : 0));
    G[i] = cl(g * k + (l0 <= 0.004 ? l1 : 0));
    B[i] = cl(b * k + (l0 <= 0.004 ? l1 : 0));
    L[i] = l1;
  }
  return { R, G, B, L };
}

/** Traits d'encre : différence de deux flous (contours nets, peu de bruit), 0..1. */
function inkLines(L: Float32Array, w: number, h: number, r: number, k: number): Float32Array {
  const a = boxBlur(L, w, h, r * 0.6, 1);
  const b = boxBlur(L, w, h, r * 1.6, 2);
  const o = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) {
    const dog = b[i]! - a[i]!;
    // le trait apparaît là où le pixel est plus sombre que son voisinage
    o[i] = cl((dog - 0.012) * k);
  }
  return o;
}

/** Hachures : traits fins le long d'une direction, plus serrés dans les ombres. */
function hatch(x: number, y: number, cell: number, angle: number, dark: number, seed: number): number {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const u = (x * c + y * s) / cell;
  const v = (-x * s + y * c) / (cell * 6);
  // chaque trait a sa pression, qui varie le long du trait
  const press = 0.55 + 0.45 * vnoise(Math.floor(u) * 3.1, v, seed);
  const line = 1 - Math.abs((u - Math.floor(u)) * 2 - 1);
  const width = cl(dark * 1.15) * press;
  return cl((width - (1 - line)) * 3);
}

const mixRGB = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export const FX: FxDef[] = [
  {
    id: 'cartoon',
    name: 'Cartoon',
    group: 'effet',
    slots: [{ label: 'Trait', def: 1 }],
    amount: 0.5,
    pixel: (d, k, a) => {
      const { w, h } = k;
      const { R, G, B, L } = channels(d);
      const r = Math.max(1, k.pxPerMin * 0.004);
      // aplats : couleurs adoucies puis réduites à quelques niveaux
      const Rs = boxBlur(R, w, h, r);
      const Gs = boxBlur(G, w, h, r);
      const Bs = boxBlur(B, w, h, r);
      const lines = inkLines(L, w, h, r * (0.8 + a), 30 + a * 40);
      const ink = k.cols[0]!;
      const q = 5;
      for (let i = 0; i < L.length; i++) {
        let c: RGB = [Rs[i]!, Gs[i]!, Bs[i]!];
        const l = lum(...c);
        const lq = (Math.round(l * q) + 0.35) / (q + 0.35);
        const kk = l > 0.001 ? lq / l : 0;
        c = [cl(c[0] * kk), cl(c[1] * kk), cl(c[2] * kk)];
        // couleurs franches, comme à l'encre
        const m = lum(...c);
        c = [cl(m + (c[0] - m) * 1.35), cl(m + (c[1] - m) * 1.35), cl(m + (c[2] - m) * 1.35)];
        const t = lines[i]!;
        d[i * 4] = (c[0] + (ink[0] - c[0]) * t) * 255;
        d[i * 4 + 1] = (c[1] + (ink[1] - c[1]) * t) * 255;
        d[i * 4 + 2] = (c[2] + (ink[2] - c[2]) * t) * 255;
      }
    },
  },
  {
    id: 'manga',
    name: 'Manga noir et blanc',
    group: 'effet',
    slots: [],
    amount: 0.5,
    pixel: (d, k, a) => {
      const { w, h } = k;
      const { L } = channels(d);
      const r = Math.max(1, k.pxPerMin * 0.0035);
      const Ls = boxBlur(L, w, h, r * 0.7, 1);
      const lines = inkLines(L, w, h, r, 45);
      const cell = Math.max(3, k.pxPerMin * (0.006 + a * 0.006));
      const c = Math.SQRT1_2;
      const darkCut = 0.16 + a * 0.12;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const l = Ls[i]!;
          let v: number;
          if (l < darkCut) v = 0;
          else if (l > 0.72) v = 1;
          else {
            // trame mécanique (screentone) pour les tons moyens
            const u = (x * c + y * c) / cell;
            const vv = (-x * c + y * c) / cell;
            const dist = Math.hypot(u - Math.floor(u) - 0.5, vv - Math.floor(vv) - 0.5);
            const rad = l < 0.45 ? 0.42 : 0.26;
            v = cl((dist - rad) * cell * 0.9 + 0.5);
          }
          v = Math.min(v, 1 - lines[i]!);
          d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v * 245 + 6;
        }
    },
  },
  {
    id: 'sketch',
    name: 'Crayonné',
    group: 'effet',
    slots: [],
    amount: 0.5,
    pixel: (d, k, a) => {
      const { w, h } = k;
      const { L } = channels(d);
      // densité de graphite : « densité » inverse floutée, puis éclaircie par division (dodge)
      const inv = new Float32Array(L.length);
      for (let i = 0; i < L.length; i++) inv[i] = 1 - L[i]!;
      const bl = boxBlur(inv, w, h, Math.max(2, k.pxPerMin * (0.004 + a * 0.008)));
      const cell = Math.max(2, k.pxPerMin * 0.004);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          let v = cl(L[i]! / Math.max(0.02, 1 - bl[i]!));
          v = Math.pow(v, 1.6 + a * 2);
          // ombres légèrement hachurées, grain du papier
          const dark = cl(0.75 - L[i]!) * (0.4 + a * 0.6);
          v = Math.min(v, 1 - 0.55 * hatch(x, y, cell, -0.9, dark, 5));
          v *= 1 - 0.06 * fbm(x / (cell * 0.7), y / (cell * 0.7), 13);
          const g = 0.12 + 0.86 * v;
          d[i * 4] = g * 255;
          d[i * 4 + 1] = g * 252;
          d[i * 4 + 2] = g * 246;
        }
    },
  },
  {
    id: 'pencil',
    name: 'Crayon et dégradés',
    group: 'effet',
    slots: [],
    amount: 0.5,
    pixel: (d, k, a) => {
      const { w, h } = k;
      const { R, G, B, L } = channels(d);
      const inv = new Float32Array(L.length);
      for (let i = 0; i < L.length; i++) inv[i] = 1 - L[i]!;
      const bl = boxBlur(inv, w, h, Math.max(2, k.pxPerMin * 0.006));
      const Ls = boxBlur(L, w, h, Math.max(1, k.pxPerMin * 0.003), 1);
      const cell = Math.max(2, k.pxPerMin * (0.004 + a * 0.004));
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const outline = Math.pow(cl(L[i]! / Math.max(0.02, 1 - bl[i]!)), 2.2);
          // les dégradés se font en hachures croisées : une, deux, puis trois directions
          const dark = 1 - Ls[i]!;
          let cov = hatch(x, y, cell, 0.8, dark * 1.2, 1);
          if (dark > 0.4) cov = Math.max(cov, hatch(x, y, cell, -0.75, (dark - 0.4) * 1.8, 2));
          if (dark > 0.7) cov = Math.max(cov, hatch(x, y, cell * 0.8, 0.05, (dark - 0.7) * 2.5, 3));
          // couleur du crayon : celle de l'image, un peu foncée, posée par hachures sur papier blanc
          const paper = (1 - 0.05 * fbm(x / (cell * 0.6), y / (cell * 0.6), 17)) * outline;
          const t = cov * 0.92;
          d[i * 4] = cl((1 - t * (1 - R[i]! * 0.8)) * paper) * 255;
          d[i * 4 + 1] = cl((1 - t * (1 - G[i]! * 0.8)) * paper) * 255;
          d[i * 4 + 2] = cl((1 - t * (1 - B[i]! * 0.8)) * paper) * 250;
        }
    },
  },
  {
    id: 'halftone',
    name: 'Trame',
    group: 'effet',
    slots: [
      { label: 'Encre', def: 1 },
      { label: 'Fond', def: 6 },
    ],
    amount: 0.35,
    pixel: (d, k, a) => {
      const { w, h } = k;
      const src = d.slice();
      const lv = levels(d);
      const cell = Math.max(3, (0.006 + a * 0.03) * k.pxPerMin);
      const ink = k.cols[0]!;
      const paper = k.cols[1]!;
      const c = Math.SQRT1_2;
      const aa = 1 / cell;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          // trame inclinée à 45°, comme en offset
          const u = (x * c + y * c) / cell;
          const v = (-x * c + y * c) / cell;
          const cu = Math.floor(u) + 0.5;
          const cv = Math.floor(v) + 0.5;
          const sx = Math.min(w - 1, Math.max(0, Math.round((cu * c - cv * c) * cell)));
          const sy = Math.min(h - 1, Math.max(0, Math.round((cu * c + cv * c) * cell)));
          const j = (sy * w + sx) * 4;
          const l = lv(lum(src[j]! / 255, src[j + 1]! / 255, src[j + 2]! / 255));
          const r = Math.sqrt(1 - l) * 0.74;
          const dist = Math.hypot(u - cu, v - cv);
          const cov = cl((r - dist) / aa + 0.5);
          const i = (y * w + x) * 4;
          d[i] = (paper[0] + (ink[0] - paper[0]) * cov) * 255;
          d[i + 1] = (paper[1] + (ink[1] - paper[1]) * cov) * 255;
          d[i + 2] = (paper[2] + (ink[2] - paper[2]) * cov) * 255;
        }
    },
  },
  {
    id: 'aging',
    name: 'Usure',
    group: 'effet',
    slots: [],
    amount: 0.4,
    amountLabel: 'Âge',
    amountUnit: 'ans',
    pixel: (d, k, a) => {
      const { w, h } = k;
      const P = k.pxPerMin;
      // bruits lents calculés sur une grille grossière puis interpolés : dix fois moins de calcul
      const field = (step: number, fn: (x: number, y: number) => number) => {
        const gw = Math.ceil(w / step) + 2;
        const gh = Math.ceil(h / step) + 2;
        const g = new Float32Array(gw * gh);
        for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) g[j * gw + i] = fn(i * step, j * step);
        return (x: number, y: number) => {
          const fx = x / step;
          const fy = y / step;
          const i = fx | 0;
          const j = fy | 0;
          const u = fx - i;
          const v = fy - j;
          const o = j * gw + i;
          return (g[o]! * (1 - u) + g[o + 1]! * u) * (1 - v) + (g[o + gw]! * (1 - u) + g[o + gw + 1]! * u) * v;
        };
      };
      const step = Math.max(2, Math.round(P * 0.006));
      const yellowing = field(step, (x, y) => fbm(x / (P * 0.18), y / (P * 0.18), 143, 4));
      const mottle = field(step, (x, y) => fbm(x / (P * 0.3), y / (P * 0.3), 148, 3) - 0.5);
      const wobble = field(step, (x, y) => vnoise(x / (P * 0.025), y / (P * 0.025), 149) - 0.5);
      const wearN = field(step, (x, y) => vnoise(x / (P * 0.01), y / (P * 0.01), 146));
      // rayures : quelques traits fins et discrets, presque verticaux, toujours les mêmes
      const scratches = Array.from({ length: Math.round(1 + a * 7) }, (_, i) => ({
        x: hash(i, 1, 141) * w,
        tilt: (hash(i, 2, 141) - 0.5) * 0.08,
        y0: hash(i, 3, 141) * h * 0.6,
        len: (0.3 + 0.7 * hash(i, 4, 141)) * h,
        dark: hash(i, 5, 141) > 0.5,
      }));
      // taches de café : auréoles larges, plus foncées sur leur bord
      const stains = Array.from({ length: a < 0.15 ? 0 : Math.round(1 + a * 4) }, (_, i) => ({
        x: (0.1 + 0.8 * hash(i, 1, 147)) * w,
        y: (0.1 + 0.8 * hash(i, 2, 147)) * h,
        r: P * (0.06 + 0.16 * hash(i, 3, 147)),
      }));
      // plis francs qui traversent l'image : un vers 30 ans, deux vers 60, trois vers 85
      const folds = [
        { on: 0.3, x0: hash(1, 1, 142) * w, y0: 0, x1: hash(1, 2, 142) * w, y1: h },
        { on: 0.6, x0: 0, y0: hash(2, 1, 142) * h, x1: w, y1: hash(2, 2, 142) * h },
        { on: 0.85, x0: hash(3, 1, 142) * w, y0: 0, x1: hash(3, 2, 142) * w, y1: h },
      ].filter((f) => a > f.on);
      const sw = Math.max(0.6, P * 0.001);
      const fs = P * 0.004;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          let c: RGB = [d[i]! / 255, d[i + 1]! / 255, d[i + 2]! / 255];
          // l'image pâlit, perd son contraste et brunit
          const l = lum(...c);
          c = mixRGB(c, [l, l, l], 0.55 * a);
          c = mixRGB(c, [0.5 + (c[0] - 0.5) * 0.65, 0.5 + (c[1] - 0.5) * 0.65, 0.5 + (c[2] - 0.5) * 0.65], a * 0.75);
          // jaunissement inégal, plus fort vers les bords
          const ex = Math.min(x, w - 1 - x) / w;
          const ey = Math.min(y, h - 1 - y) / h;
          const edge = 1 - cl(Math.min(ex, ey) * 5);
          c = mixRGB(c, [c[0] * 0.97 + 0.07, c[1] * 0.86 + 0.05, c[2] * 0.58], cl(a * (0.35 + 0.5 * yellowing(x, y) + 0.5 * edge)));
          // zones larges plus claires ou plus sombres, sans piqué
          const m = mottle(x, y) * 0.5 * a - 0.12 * a * edge;
          c = [c[0] * (1 + m), c[1] * (1 + m), c[2] * (1 + m * 1.2)];
          for (const t of stains) {
            const r0 = Math.hypot(x - t.x, y - t.y) / t.r;
            if (r0 > 1.4) continue;
            const q = r0 + wobble(x, y) * 0.25;
            const inside = q < 1 ? 0.16 * a : 0;
            const ring = Math.exp(-(((q - 1) / 0.06) ** 2)) * 0.5 * a;
            c = mixRGB(c, [c[0] * 0.75, c[1] * 0.56, c[2] * 0.36], Math.min(0.8, inside + ring));
          }
          // rayures discrètes
          for (const s of scratches) {
            if (y < s.y0 || y > s.y0 + s.len) continue;
            const dx = Math.abs(x - (s.x + (y - s.y0) * s.tilt));
            if (dx < sw) c = mixRGB(c, s.dark ? [c[0] * 0.6, c[1] * 0.55, c[2] * 0.5] : [c[0] * 0.7 + 0.25, c[1] * 0.7 + 0.24, c[2] * 0.7 + 0.2], (1 - dx / sw) * 0.35 * a);
          }
          // plis : une arête claire et une ombre
          for (const f of folds) {
            const fx = f.x1 - f.x0;
            const fy = f.y1 - f.y0;
            const dd = ((x - f.x0) * fy - (y - f.y0) * fx) / Math.hypot(fx, fy);
            if (Math.abs(dd) < fs * 3) {
              const t = dd / fs;
              c = mixRGB(c, t > 0 ? [1, 0.97, 0.9] : [0.2, 0.16, 0.12], Math.exp(-t * t) * 0.45 * a);
            }
          }
          d[i] = cl(c[0]) * 255;
          d[i + 1] = cl(c[1]) * 255;
          d[i + 2] = cl(c[2]) * 255;
          // coins et bords usés : le papier s'effrite
          const near = Math.min(x, w - 1 - x, y, h - 1 - y) / P;
          if (near < 0.07 * a) {
            const corner = Math.hypot(Math.min(x, w - 1 - x) / P, Math.min(y, h - 1 - y) / P);
            const wear = a * 0.06 * (0.5 + wearN(x, y));
            if (near < wear * 0.3 || corner < wear) d[i + 3] = 0;
          }
        }
      // froissé : des plis courts dans tous les sens, chacun une arête entre deux facettes, posés seulement autour d'eux
      if (a > 0.1) {
        const H = new Float32Array(w * h);
        const D = P * 0.035;
        const nf = Math.round(8 + 30 * a);
        for (let n = 0; n < nf; n++) {
          const ang = hash(n, 1, 151) * Math.PI;
          const cx = hash(n, 2, 151) * w;
          const cy = hash(n, 3, 151) * h;
          const ux = Math.cos(ang);
          const uy = Math.sin(ang);
          const half = P * (0.06 + 0.22 * hash(n, 4, 151));
          const sg = hash(n, 5, 151) > 0.5 ? 1 : -1;
          const x0 = Math.max(0, Math.floor(cx - Math.abs(ux) * half - D));
          const x1 = Math.min(w - 1, Math.ceil(cx + Math.abs(ux) * half + D));
          const y0 = Math.max(0, Math.floor(cy - Math.abs(uy) * half - D));
          const y1 = Math.min(h - 1, Math.ceil(cy + Math.abs(uy) * half + D));
          for (let y = y0; y <= y1; y++)
            for (let x = x0; x <= x1; x++) {
              const rx = x - cx;
              const ry = y - cy;
              const t = Math.abs(rx * ux + ry * uy) / half;
              if (t > 1) continue;
              const dn = Math.abs(rx * uy - ry * ux);
              if (dn > D) continue;
              H[y * w + x] += (sg * (D - dn) * (1 - t * t)) / D;
            }
        }
        relief(d, k, (x, y) => H[y * w + x]!, a * 0.5);
      }
    },
  },
  {
    id: 'riso',
    name: 'Risographie',
    group: 'effet',
    slots: [
      { label: 'Encre 1', def: 2 },
      { label: 'Encre 2', def: 3 },
    ],
    amount: 0.4,
    pixel: (d, k, a) => {
      const { w, h } = k;
      const src = d.slice();
      const A = k.cols[0]!;
      const B = k.cols[1]!;
      const lv = levels(d);
      // repérage raté : la seconde encre est décalée
      const off = Math.round((0.002 + a * 0.01) * k.pxPerMin);
      const g = 0.15 + a * 0.35;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const j = (Math.min(h - 1, y + Math.round(off * 0.6)) * w + Math.min(w - 1, x + off)) * 4;
          const li = lum(src[i]! / 255, src[i + 1]! / 255, src[i + 2]! / 255);
          const lj = lum(src[j]! / 255, src[j + 1]! / 255, src[j + 2]! / 255);
          const ki = li > 0.004 ? lv(li) / li : 1;
          const kj = lj > 0.004 ? lv(lj) / lj : 1;
          const r = cl((src[i]! / 255) * ki);
          const gg = cl((src[i + 1]! / 255) * ki);
          const bb = cl((src[j + 2]! / 255) * kj);
          const g2 = cl((src[j + 1]! / 255) * kj);
          // séparation en deux encres, puis grain du tambour
          let dA = cl(1 - (r * 0.65 + gg * 0.35));
          let dB = cl(1 - (bb * 0.65 + g2 * 0.35));
          dA = cl(dA + (hash(x, y, 3) - 0.5) * g);
          dB = cl(dB + (hash(x, y, 7) - 0.5) * g);
          d[i] = (1 - dA * (1 - A[0])) * (1 - dB * (1 - B[0])) * 255;
          d[i + 1] = (1 - dA * (1 - A[1])) * (1 - dB * (1 - B[1])) * 255;
          d[i + 2] = (1 - dA * (1 - A[2])) * (1 - dB * (1 - B[2])) * 255;
        }
    },
  },
  {
    id: 'posterize',
    name: 'Postérisation',
    group: 'effet',
    slots: [],
    amount: 0.34,
    pixel: (d, k, a) => {
      const pal = k.palette.slice().sort((p, q) => lum(...p) - lum(...q));
      const n = Math.max(2, Math.min(pal.length, 3 + Math.round(a * 3)));
      // n aplats répartis du plus sombre au plus clair de la palette
      const tones = Array.from({ length: n }, (_, i) => pal[Math.round((i * (pal.length - 1)) / (n - 1))]!);
      const lv = levels(d);
      for (let i = 0; i < d.length; i += 4) {
        const l = lv(lum(d[i]! / 255, d[i + 1]! / 255, d[i + 2]! / 255));
        const t = tones[Math.min(n - 1, Math.floor(l * n))]!;
        d[i] = t[0] * 255;
        d[i + 1] = t[1] * 255;
        d[i + 2] = t[2] * 255;
      }
    },
  },
  {
    id: 'gradmap',
    name: 'Dégradé de palette',
    group: 'effet',
    slots: [{ label: 'Dégradé', def: 5 }],
    amount: 1,
    pixel: () => {},
  },
  {
    id: 'grain',
    name: 'Grain',
    family: 'Papiers et cartons',
    group: 'materiau',
    slots: [],
    amount: 0.4,
    pixel: (d, k, a) => {
      const { w, h } = k;
      const s = Math.max(1, k.pxPerMin * 0.0012);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const l = lum(d[i]! / 255, d[i + 1]! / 255, d[i + 2]! / 255);
          // plus visible dans les tons moyens, comme un film
          const n = (vnoise(x / s, y / s, 11) - 0.5) * a * 0.5 * (0.4 + 2.4 * l * (1 - l));
          d[i] = cl(d[i]! / 255 + n) * 255;
          d[i + 1] = cl(d[i + 1]! / 255 + n) * 255;
          d[i + 2] = cl(d[i + 2]! / 255 + n) * 255;
        }
    },
  },
  {
    id: 'kraft',
    name: 'Papier kraft',
    family: 'Papiers et cartons',
    group: 'materiau',
    slots: [],
    amount: 0.6,
    pixel: (d, k, a) => {
      const P = k.pxPerMin;
      const fx = 0.006 * P;
      relief(
        d,
        k,
        (x, y) => 0.7 * fbm(x / (fx * 0.5), y / (fx * 2.5), 21) + 0.3 * vnoise(x / (fx * 0.25), y / (fx * 0.25), 5),
        a * 0.45 * fx,
        (c) => mixRGB(c, [c[0] * 0.82, c[1] * 0.67, c[2] * 0.48], 0.55 * a),
      );
    },
  },
  {
    id: 'watercolor',
    name: 'Papier aquarelle',
    family: 'Papiers et cartons',
    group: 'materiau',
    slots: [],
    amount: 0.6,
    pixel: (d, k, a) => {
      const P = k.pxPerMin;
      const fs = 0.007 * P;
      relief(
        d,
        k,
        (x, y) => fbm(x / fs, y / fs, 31),
        a * 0.5 * fs,
        (c, x, y) => {
          const m = 1 - 0.1 * a * vnoise(x / (P * 0.06), y / (P * 0.06), 9);
          return [c[0] * m + 0.04 * a, c[1] * m + 0.04 * a, c[2] * m + 0.03 * a];
        },
      );
    },
  },
  {
    id: 'corrugated',
    name: 'Carton ondulé',
    family: 'Papiers et cartons',
    group: 'materiau',
    slots: [],
    amount: 0.6,
    pixel: (d, k, a) => {
      const period = Math.max(4, 0.03 * k.pxPerMin);
      relief(
        d,
        k,
        (x, y) => 0.5 + 0.5 * Math.sin((2 * Math.PI * x) / period) + 0.08 * vnoise(x / 2, y / 2, 4),
        a * 0.5 * (period / Math.PI),
        (c) => mixRGB(c, [c[0] * 0.85, c[1] * 0.74, c[2] * 0.58], 0.3 * a),
      );
    },
  },
  {
    id: 'newsprint',
    name: 'Papier journal',
    family: 'Papiers et cartons',
    group: 'materiau',
    slots: [],
    amount: 0.6,
    pixel: (d, k, a) => {
      const { w, h } = k;
      const P = k.pxPerMin;
      const fs = Math.max(1, 0.002 * P);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          let c: RGB = [d[i]! / 255, d[i + 1]! / 255, d[i + 2]! / 255];
          // encre grise sur papier jauni : couleurs éteintes, contraste plus court
          const l = lum(...c);
          c = mixRGB(c, [l, l, l], 0.45 * a);
          c = [0.08 + c[0] * 0.86, 0.08 + c[1] * 0.85, 0.07 + c[2] * 0.82];
          const fiber = 1 - a * (0.12 * fbm(x / (fs * 6), y / fs, 41) + (hash(x, y, 2) > 0.997 ? 0.25 : 0));
          const tint = mixRGB([1, 1, 1], [0.96, 0.92, 0.8], a);
          d[i] = cl(c[0] * tint[0] * fiber) * 255;
          d[i + 1] = cl(c[1] * tint[1] * fiber) * 255;
          d[i + 2] = cl(c[2] * tint[2] * fiber) * 255;
        }
    },
  },
  {
    id: 'canvas',
    name: 'Toile de lin',
    family: 'Textiles et cuirs',
    group: 'materiau',
    slots: [],
    amount: 0.6,
    pixel: (d, k, a) => {
      const p = Math.max(3, 0.006 * k.pxPerMin);
      // armure toile : fils de trame et de chaîne qui passent dessus, dessous
      relief(
        d,
        k,
        (x, y) => {
          const u = x / p;
          const v = y / p;
          const over = (Math.floor(u) + Math.floor(v)) % 2 === 0;
          const wx = Math.sin(Math.PI * (u - Math.floor(u)));
          const wy = Math.sin(Math.PI * (v - Math.floor(v)));
          return (over ? wy : wx) * 0.8 + 0.2 * vnoise(x / (p * 0.4), y / (p * 0.4), 61);
        },
        a * 0.45 * p,
        (c, x, y) => {
          const m = 1 - 0.08 * a * vnoise(x / (p * 6), y / (p * 0.7), 62);
          return mixRGB(c, [c[0] * 0.95 * m, c[1] * 0.92 * m, c[2] * 0.84 * m], 0.6 * a);
        },
      );
    },
  },
  {
    id: 'wood',
    name: 'Bois',
    family: 'Naturels',
    group: 'materiau',
    slots: [],
    amount: 0.6,
    knobs: [
      { key: 'angle', label: 'Orientation', def: 0, angle: true },
      { key: 'knots', label: 'Nœuds', def: 0, fresh: 0.2 },
      { key: 'size', label: 'Taille', def: 0.4 },
    ],
    pixel: (d, k, a) => {
      const { w, h } = k;
      const P = k.pxPerMin;
      // fil dans le sens de l'orientation (0 = fil couché) ; Taille : cernes fins (hêtre, érable) → larges (pin, chêne)
      const th = (k.knobs.angle ?? 0) * Math.PI;
      const [ca, sa] = [Math.cos(th), Math.sin(th)];
      const t = k.knobs.size ?? 0.4;
      const per = P * (0.003 + 0.025 * Math.pow(t, 1.5));
      const sc = per / (P * 0.008); // échelle du dessin par rapport au bois d'origine
      // nœuds : un par case de la grille au plus (longue dans le sens du fil), tirés selon la densité
      const dens = k.knobs.knots ?? 0.2;
      const R = per * 3.2;
      const [cu, cv] = [R * 7.5, R * 6];
      const knot = (u: number, v: number) => {
        // déviation du fil autour des nœuds proches, et le cœur sombre
        let [dv, wk, core, ph] = [0, 0, 0, 0];
        if (dens <= 0.001) return [0, 0, 0, 0] as const;
        const [gi, gj] = [Math.floor(u / cu), Math.floor(v / cv)];
        for (let j = gj - 1; j <= gj + 1; j++)
          for (let i = gi - 1; i <= gi + 1; i++) {
            if (hash(i, j, 91) > dens) continue;
            const r = R * (0.6 + 0.8 * hash(i, j, 92));
            const ku = (i + 0.15 + 0.7 * hash(i, j, 93)) * cu;
            const kv = (j + 0.2 + 0.6 * hash(i, j, 94)) * cv;
            const [du, dd] = [(u - ku) / 2.2, v - kv];
            const dist = Math.hypot(du, dd);
            // le fil s'écarte du nœud (les cernes le contournent et s'y resserrent), tout s'efface en deux ou trois rayons
            const fall = Math.exp(-(((u - ku) / (2.5 * r)) ** 2));
            dv -= 0.97 * dd * Math.exp(-(dd * dd) / (2.25 * r * r)) * fall;
            const g = Math.exp(-((dist / (r * 0.75)) ** 2));
            if (g > wk) {
              wk = g;
              ph = dist / (per * 1.6);
            }
            core = Math.max(core, (1 - Math.min(1, dist / (r * 0.5))) ** 0.7);
          }
        return [dv, wk, core, ph] as const;
      };
      const ring = new Float32Array(w * h);
      const fine = new Float32Array(w * h);
      const dark = new Float32Array(w * h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const u = x * ca + y * sa;
          const v = -x * sa + y * ca;
          const [dv, wk, core, ph] = knot(u, v);
          // veines : des cernes déformés par un bruit lent, étirés dans le sens du fil
          const warp = fbm(u / (P * 0.25 * sc), v / (P * 0.06 * sc), 71) * P * 0.05 * sc;
          const straight = (v + warp + dv) / per;
          const phase = straight * (1 - wk) + ph * wk;
          const s0 = Math.sin(phase * Math.PI * 2);
          const n = y * w + x;
          ring[n] = 0.5 + 0.5 * s0 * (0.6 + 0.4 * vnoise(u / (P * 0.1 * sc), v / (P * 0.02 * sc), 72));
          fine[n] = vnoise(u / (P * 0.03 * sc), (v + dv) / (1.5 * Math.max(1, sc)), 73);
          dark[n] = core;
        }
      relief(
        d,
        k,
        (x, y) => ring[y * w + x]! * 0.6 + 0.4 * fine[y * w + x]! - dark[y * w + x]! * 0.8,
        a * 0.18 * per,
        (c, x, y) => {
          const n = y * w + x;
          const r = Math.min(1, ring[n]! + dark[n]! * 0.9);
          const wood: RGB = [0.62 - 0.12 * r - 0.12 * dark[n]!, 0.42 - 0.1 * r - 0.1 * dark[n]!, 0.24 - 0.07 * r - 0.06 * dark[n]!];
          const m = 1 - 0.55 * dark[n]!; // cœur du nœud : bois plus sombre
          return mixRGB(c, [c[0] * wood[0] * 1.5 * m, c[1] * wood[1] * 1.6 * m, c[2] * wood[2] * 1.7 * m], 0.65 * a);
        },
      );
    },
  },
  {
    id: 'metal',
    name: 'Métal brossé',
    family: 'Métaux et techniques',
    group: 'materiau',
    slots: [],
    amount: 0.6,
    pixel: (d, k, a) => {
      const { w, h } = k;
      const P = k.pxPerMin;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          let c: RGB = [d[i]! / 255, d[i + 1]! / 255, d[i + 2]! / 255];
          const l = lum(...c);
          // métal : teinte gardée mais éteinte, rayures fines dans un seul sens, reflet large
          c = mixRGB(c, [l, l, l], 0.45 * a);
          const brush = vnoise(x / (P * 0.2), y / 0.9, 81) * 0.6 + vnoise(x / (P * 0.05), y / 0.6, 82) * 0.4;
          const sheen = 0.5 + 0.5 * Math.cos(((x * k.lx + y * k.ly) / (P * 0.35)) * Math.PI);
          const m = 0.82 + 0.22 * brush + 0.25 * sheen * a;
          d[i] = cl(c[0] * (1 - a + a * m)) * 255;
          d[i + 1] = cl(c[1] * (1 - a + a * m)) * 255;
          d[i + 2] = cl(c[2] * (1 - a + a * m) * 1.02) * 255;
        }
    },
  },
  {
    id: 'felt',
    name: 'Feutrine',
    family: 'Textiles et cuirs',
    group: 'materiau',
    slots: [],
    amount: 0.6,
    pixel: (d, k, a) => {
      const P = k.pxPerMin;
      const fs = Math.max(1, P * 0.0025);
      // fibres emmêlées : un bruit fin dans toutes les directions, couleur douce et mate
      relief(
        d,
        k,
        (x, y) => fbm(x / fs, y / fs, 91, 4),
        a * 0.35 * fs,
        (c, x, y) => {
          const l = lum(...c);
          const fuzz = 1 - 0.12 * a * fbm(x / (fs * 0.6), y / (fs * 0.6), 92);
          const soft = mixRGB(c, [l, l, l], 0.12 * a);
          return [soft[0] * fuzz + 0.03 * a, soft[1] * fuzz + 0.03 * a, soft[2] * fuzz + 0.03 * a];
        },
      );
    },
  },
  {
    id: 'glass',
    name: 'Verre',
    family: 'Transparents',
    group: 'materiau',
    transparent: 0.45,
    slots: [],
    amount: 0.6,
    pixel: (d, k, a) => {
      const { w, h } = k;
      const P = k.pxPerMin;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const c: RGB = [d[i]! / 255, d[i + 1]! / 255, d[i + 2]! / 255];
          // verre : teinte gardée, légèrement bleutée ; deux reflets en biais, côté lampe
          const t = (x * k.ly - y * k.lx) / P;
          const s1 = Math.max(0, 1 - Math.abs(((((t * 3.2) % 1) + 1) % 1) - 0.5) * 9);
          const s2 = Math.max(0, 1 - Math.abs(((((t * 3.2 + 0.18) % 1) + 1) % 1) - 0.5) * 22);
          const lit = 0.5 + 0.5 * ((x * k.lx + y * k.ly) / P) * -1.2;
          const hi = Math.min(1, (1.1 * s1 + 1.4 * s2) * a * cl(lit + 0.7));
          const g = mixRGB(mixRGB(c, [c[0] * 0.92, c[1] * 0.98, c[2] * 1.06], 0.6 * a), [1, 1, 1], hi * 0.85);
          d[i] = cl(g[0]) * 255;
          d[i + 1] = cl(g[1]) * 255;
          d[i + 2] = cl(g[2]) * 255;
          d[i + 3] = d[i + 3]! * Math.min(1, 1 - 0.25 * a + hi * 1.5);
        }
    },
  },
  {
    id: 'plexi',
    name: 'Plexi',
    family: 'Transparents',
    group: 'materiau',
    transparent: 0.7,
    slots: [],
    amount: 0.6,
    pixel: (d, k, a) => {
      const { w, h } = k;
      const P = k.pxPerMin;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          let c: RGB = [d[i]! / 255, d[i + 1]! / 255, d[i + 2]! / 255];
          // plexi : couleur franche et lisse, reflet large et doux, plus dense dans l'ombre
          const l = lum(...c);
          c = mixRGB(c, [c[0] + (c[0] - l) * 0.4, c[1] + (c[1] - l) * 0.4, c[2] + (c[2] - l) * 0.4], a);
          const sheen = cl(0.5 - ((x * k.lx + y * k.ly) / P) * 0.9);
          const g = mixRGB(c, [1, 1, 1], 0.35 * a * sheen * sheen);
          d[i] = cl(g[0]) * 255;
          d[i + 1] = cl(g[1]) * 255;
          d[i + 2] = cl(g[2]) * 255;
          d[i + 3] = d[i + 3]! * (1 - 0.3 * a * sheen + 0.15 * a * (1 - sheen));
        }
    },
  },
  {
    id: 'ice',
    name: 'Glace',
    family: 'Transparents',
    group: 'materiau',
    transparent: 0.65,
    slots: [],
    amount: 0.6,
    pixel: (d, k, a) => {
      const P = k.pxPerMin;
      const { w, h } = k;
      // glace : givre blanchi par endroits, fêlures fines, plus claire là où elle est épaisse
      const frost = (x: number, y: number) => fbm(x / (P * 0.06), y / (P * 0.06), 111, 4);
      const crack = (x: number, y: number) => {
        const v = Math.abs(fbm(x / (P * 0.12), y / (P * 0.12), 112, 3) - 0.5);
        return cl(1 - v * 40);
      };
      relief(
        d,
        k,
        (x, y) => frost(x, y) - crack(x, y) * 0.4,
        a * 0.25 * P * 0.004,
        (c, x, y) => {
          const f = frost(x, y);
          const cold = mixRGB(c, [c[0] * 0.85 + 0.12, c[1] * 0.92 + 0.1, c[2] + 0.12], 0.6 * a);
          return mixRGB(cold, [1, 1, 1], a * (0.45 * f * f + 0.5 * crack(x, y)));
        },
      );
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          d[i + 3] = d[i + 3]! * Math.min(1, 1 - 0.35 * a + a * (0.6 * frost(x, y) + 0.4 * crack(x, y)));
        }
    },
  },
  {
    id: 'smoke',
    name: 'Fumée',
    family: 'Transparents',
    group: 'materiau',
    transparent: 0.6,
    slots: [],
    amount: 0.7,
    pixel: (d, k, a) => {
      const { w, h } = k;
      const P = k.pxPerMin;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const c: RGB = [d[i]! / 255, d[i + 1]! / 255, d[i + 2]! / 255];
          // fumée : volutes qui montent, couleur éteinte, des trous où l'on voit à travers
          const warp = fbm(x / (P * 0.2), y / (P * 0.3), 121) * 2.5;
          const v = fbm(x / (P * 0.09) + warp, y / (P * 0.16) - warp * 0.6, 122, 4);
          const dens = cl((v - 0.38) * 3.6);
          const l = lum(...c);
          const g = mixRGB(c, [l * 0.9 + 0.05, l * 0.9 + 0.05, l * 0.92 + 0.06], 0.55 * a);
          d[i] = cl(g[0] * (0.85 + 0.3 * dens)) * 255;
          d[i + 1] = cl(g[1] * (0.85 + 0.3 * dens)) * 255;
          d[i + 2] = cl(g[2] * (0.85 + 0.3 * dens)) * 255;
          d[i + 3] = d[i + 3]! * (1 - a + a * dens);
        }
    },
  },
  {
    id: 'hologram',
    name: 'Hologramme',
    family: 'Transparents',
    group: 'materiau',
    transparent: 0.75,
    slots: [],
    amount: 0.7,
    pixel: (d, k, a) => {
      const { w, h } = k;
      const P = k.pxPerMin;
      const line = Math.max(2, P * 0.006);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const c: RGB = [d[i]! / 255, d[i + 1]! / 255, d[i + 2]! / 255];
          // hologramme : irisation qui tourne avec la lumière, lignes de balayage, léger tremblé
          const t = ((x * k.lx + y * k.ly) / P) * 2.2 + 0.25 * fbm(x / (P * 0.1), y / (P * 0.1), 131);
          const ir: RGB = [0.5 + 0.5 * Math.cos(6.283 * t), 0.5 + 0.5 * Math.cos(6.283 * (t + 0.33)), 0.5 + 0.5 * Math.cos(6.283 * (t + 0.67))];
          const l = lum(...c);
          const g = mixRGB(c, [ir[0] * (0.4 + 0.8 * l) + 0.1, ir[1] * (0.4 + 0.8 * l) + 0.15, ir[2] * (0.4 + 0.8 * l) + 0.2], 0.6 * a);
          const scan = 0.5 + 0.5 * Math.cos((y / line) * Math.PI);
          d[i] = cl(g[0] + 0.08 * a * scan) * 255;
          d[i + 1] = cl(g[1] + 0.1 * a * scan) * 255;
          d[i + 2] = cl(g[2] + 0.14 * a * scan) * 255;
          d[i + 3] = d[i + 3]! * (1 - 0.45 * a * (1 - scan));
        }
    },
  },
  {
    id: 'greyboard',
    name: 'Carton gris',
    family: 'Papiers et cartons',
    group: 'materiau',
    slots: [],
    amount: 0.6,
    pixel: (d, k, a) => {
      const P = k.pxPerMin;
      const fs = Math.max(1, 0.003 * P);
      // carton compressé : fibres courtes en tous sens, teinte gris-brun, quelques paillettes plus sombres
      relief(
        d,
        k,
        (x, y) => 0.7 * fbm(x / fs, y / fs, 141, 3) + 0.3 * vnoise(x / (fs * 5), y / (fs * 5), 142),
        a * 0.3 * fs,
        (c, x, y) => {
          const l = lum(...c);
          const grey: RGB = [l * 0.78 + 0.08, l * 0.74 + 0.07, l * 0.66 + 0.06];
          const fleck = hash(x >> 1, y >> 1, 143) > 0.985 ? 1 - 0.3 * a : 1;
          const m = (1 - 0.08 * a * fbm(x / (P * 0.05), y / (P * 0.05), 144)) * fleck;
          const g = mixRGB(c, grey, 0.55 * a);
          return [g[0] * m, g[1] * m, g[2] * m];
        },
      );
    },
  },
  {
    id: 'bristol',
    name: 'Papier blanc',
    family: 'Papiers et cartons',
    group: 'materiau',
    slots: [],
    amount: 0.5,
    pixel: (d, k, a) => {
      const fs = Math.max(1, 0.0018 * k.pxPerMin);
      // bristol : surface lisse et claire, grain à peine sensible, les couleurs s'éclaircissent un peu
      relief(
        d,
        k,
        (x, y) => fbm(x / fs, y / fs, 151, 2),
        a * 0.12 * fs,
        (c) => [c[0] * (1 - 0.12 * a) + 0.12 * a, c[1] * (1 - 0.12 * a) + 0.12 * a, c[2] * (1 - 0.1 * a) + 0.1 * a],
      );
    },
  },
  {
    id: 'tracing',
    name: 'Papier calque',
    family: 'Transparents',
    group: 'materiau',
    transparent: 0.65,
    slots: [],
    amount: 0.6,
    pixel: (d, k, a) => {
      const { w, h } = k;
      const P = k.pxPerMin;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const c: RGB = [d[i]! / 255, d[i + 1]! / 255, d[i + 2]! / 255];
          // calque : voile laiteux, nuages de fibres plus opaques, on devine ce qui est dessous
          const cloud = fbm(x / (P * 0.04), y / (P * 0.04), 161, 4);
          const milk = 0.3 * a + 0.15 * a * cloud;
          const g = mixRGB(c, [0.97, 0.97, 0.95], milk);
          d[i] = cl(g[0]) * 255;
          d[i + 1] = cl(g[1]) * 255;
          d[i + 2] = cl(g[2]) * 255;
          d[i + 3] = d[i + 3]! * (1 - 0.3 * a + 0.3 * a * cloud);
        }
    },
  },
  {
    id: 'frosted',
    name: 'Plexi dépoli',
    family: 'Transparents',
    group: 'materiau',
    transparent: 0.8,
    slots: [],
    amount: 0.6,
    pixel: (d, k, a) => {
      const { w, h } = k;
      const P = k.pxPerMin;
      if (a <= 0) return;
      const n = w * h;
      // couleurs pondérées par l'alpha : le vide autour d'une photo détourée ne noircit pas ses bords
      const R = new Float32Array(n);
      const G = new Float32Array(n);
      const B = new Float32Array(n);
      const A = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const al = d[i * 4 + 3]! / 255;
        R[i] = (d[i * 4]! / 255) * al;
        G[i] = (d[i * 4 + 1]! / 255) * al;
        B[i] = (d[i * 4 + 2]! / 255) * al;
        A[i] = al;
      }
      // dépoli : la lumière se diffuse, les détails s'adoucissent, voile clair et grain très fin
      const r = Math.max(1, P * 0.006 * a);
      const Rb = boxBlur(R, w, h, r);
      const Gb = boxBlur(G, w, h, r);
      const Bb = boxBlur(B, w, h, r);
      const Ab = boxBlur(A, w, h, r);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (d[i * 4 + 3] === 0) continue;
          const al = Math.max(1e-4, Ab[i]!);
          const o: RGB = [d[i * 4]! / 255, d[i * 4 + 1]! / 255, d[i * 4 + 2]! / 255];
          const blur: RGB = [Rb[i]! / al, Gb[i]! / al, Bb[i]! / al];
          const sat = (hash(x, y, 171) - 0.5) * 0.05 * a;
          const g = mixRGB(mixRGB(o, blur, cl(a * 1.5)), [1, 1, 1], 0.18 * a);
          d[i * 4] = cl(g[0] + sat) * 255;
          d[i * 4 + 1] = cl(g[1] + sat) * 255;
          d[i * 4 + 2] = cl(g[2] + sat) * 255;
        }
    },
  },
  {
    id: 'mirror',
    name: 'Plexi miroir',
    family: 'Métaux et techniques',
    group: 'materiau',
    slots: [],
    amount: 0.6,
    pixel: (d, k, a) => {
      const { w, h } = k;
      const P = k.pxPerMin;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          let c: RGB = [d[i]! / 255, d[i + 1]! / 255, d[i + 2]! / 255];
          // miroir : reflet d'une pièce en dégradé, une bande vive en biais, la couleur reste en teinte
          const s = ((x * k.lx + y * k.ly) / P) * -1;
          const env = 0.35 + 0.5 * cl(0.5 + s * 0.8) + 0.15 * fbm(x / (P * 0.3), y / (P * 0.3), 181, 2);
          const t = (x * k.ly - y * k.lx) / P;
          const band = Math.max(0, 1 - Math.abs(((((t * 1.6) % 1) + 1) % 1) - 0.5) * 4);
          const l = lum(...c);
          c = mixRGB(c, [c[0] * 0.35 + env * 0.65, c[1] * 0.35 + env * 0.65, c[2] * 0.35 + env * 0.7], 0.85 * a);
          c = mixRGB(c, [l * 0.2, l * 0.2, l * 0.22], 0.15 * a * (1 - env));
          const g = mixRGB(c, [1, 1, 1], 0.7 * a * band * band);
          d[i] = cl(g[0]) * 255;
          d[i + 1] = cl(g[1]) * 255;
          d[i + 2] = cl(g[2]) * 255;
        }
    },
  },
  {
    id: 'aluminium',
    name: 'Aluminium',
    family: 'Métaux et techniques',
    group: 'materiau',
    slots: [],
    amount: 0.6,
    pixel: (d, k, a) => {
      const { w, h } = k;
      const P = k.pxPerMin;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          let c: RGB = [d[i]! / 255, d[i + 1]! / 255, d[i + 2]! / 255];
          // panneau alu (Dibond) : lisse et satiné, teinte un peu éteinte, lueur large sans rayures
          const l = lum(...c);
          c = mixRGB(c, [l, l, l * 1.03], 0.3 * a);
          const sheen = cl(0.5 - ((x * k.lx + y * k.ly) / P) * 0.7);
          const m = 0.88 + 0.35 * sheen * sheen * a + 0.02 * (vnoise(x / (P * 0.02), y / (P * 0.02), 191) - 0.5);
          d[i] = cl(c[0] * (1 - a + a * m)) * 255;
          d[i + 1] = cl(c[1] * (1 - a + a * m)) * 255;
          d[i + 2] = cl(c[2] * (1 - a + a * m)) * 255;
        }
    },
  },
  {
    id: 'concrete',
    name: 'Béton',
    family: 'Naturels',
    group: 'materiau',
    slots: [],
    amount: 0.6,
    pixel: (d, k, a) => {
      const P = k.pxPerMin;
      const fs = Math.max(1, 0.004 * P);
      // béton : taches de laitance, petits bullages creusés, teinte grise
      const pore = (x: number, y: number) => {
        const v = vnoise(x / (fs * 0.8), y / (fs * 0.8), 201);
        return v > 0.86 ? (v - 0.86) * 7 : 0;
      };
      relief(
        d,
        k,
        (x, y) => 0.6 * fbm(x / fs, y / fs, 202, 3) - pore(x, y),
        a * 0.3 * fs,
        (c, x, y) => {
          const l = lum(...c);
          const mottle = fbm(x / (P * 0.08), y / (P * 0.08), 203, 3);
          const grey = l * 0.7 + 0.12 + 0.12 * (mottle - 0.5);
          const g = mixRGB(c, [grey, grey * 0.99, grey * 0.96], 0.6 * a);
          const p = 1 - 0.5 * a * cl(pore(x, y));
          return [g[0] * p, g[1] * p, g[2] * p];
        },
      );
    },
  },
  {
    id: 'slate',
    name: 'Ardoise',
    family: 'Naturels',
    group: 'materiau',
    slots: [],
    amount: 0.6,
    pixel: (d, k, a) => {
      const P = k.pxPerMin;
      // ardoise : feuillets en couches presque horizontales, gris-bleu sombre et mat
      const strata = (x: number, y: number) => {
        const warp = fbm(x / (P * 0.3), y / (P * 0.05), 211) * P * 0.03;
        return fbm(x / (P * 0.2), (y + warp) / (P * 0.01), 212, 3);
      };
      relief(
        d,
        k,
        (x, y) => strata(x, y),
        a * 0.25 * P * 0.01,
        (c, x, y) => {
          const l = lum(...c);
          const s = strata(x, y);
          const dark: RGB = [c[0] * 0.45 + l * 0.12 + 0.05, c[1] * 0.45 + l * 0.13 + 0.06, c[2] * 0.45 + l * 0.15 + 0.08];
          const g = mixRGB(c, dark, 0.7 * a);
          const m = 1 + a * (0.33 * s - 0.17);
          return [g[0] * m, g[1] * m, g[2] * m];
        },
      );
    },
  },
  {
    id: 'cork',
    name: 'Liège',
    family: 'Naturels',
    group: 'materiau',
    slots: [],
    amount: 0.6,
    pixel: (d, k, a) => {
      const P = k.pxPerMin;
      const g0 = Math.max(2, 0.008 * P);
      // liège aggloméré : granules bruns de tailles variées, creux sombres entre eux
      const gran = (x: number, y: number) => {
        const v = vnoise(x / g0, y / g0, 221) * 0.65 + vnoise(x / (g0 * 0.4), y / (g0 * 0.4), 222) * 0.35;
        return v;
      };
      relief(
        d,
        k,
        (x, y) => gran(x, y),
        a * 0.5 * g0,
        (c, x, y) => {
          const v = gran(x, y);
          const tone = 0.75 + 0.5 * v;
          const cork: RGB = [c[0] * 0.75 * tone + 0.1, c[1] * 0.58 * tone + 0.06, c[2] * 0.4 * tone + 0.03];
          const hole = v < 0.32 ? 1 - 0.5 * a : 1;
          const g = mixRGB(c, cork, 0.7 * a);
          return [g[0] * hole, g[1] * hole, g[2] * hole];
        },
      );
    },
  },
  {
    id: 'carbon',
    name: 'Carbone',
    family: 'Métaux et techniques',
    group: 'materiau',
    slots: [],
    amount: 0.7,
    pixel: (d, k, a) => {
      const { w, h } = k;
      const P = k.pxPerMin;
      const p = Math.max(3, 0.012 * P);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          let c: RGB = [d[i]! / 255, d[i + 1]! / 255, d[i + 2]! / 255];
          // fibre de carbone : sergé 2/2, mèches qui changent de sens à chaque case, sombre et verni
          const u = x / p;
          const v = y / p;
          const along = (Math.floor(u) + Math.floor(v / 2) * 2 + 4096) % 4 < 2;
          const f = along ? u - Math.floor(u) : v / 2 - Math.floor(v / 2);
          const tow = Math.sin(Math.PI * f);
          const strands = 0.85 + 0.15 * Math.sin((along ? v : u) * Math.PI * 7);
          const lit = along ? 0.5 + 0.5 * k.lx * -1 : 0.5 + 0.5 * k.ly * -1;
          const shine = (0.25 + 0.75 * lit) * tow * strands;
          const l = lum(...c);
          const dark: RGB = [c[0] * 0.25 + l * 0.05, c[1] * 0.25 + l * 0.05, c[2] * 0.25 + l * 0.06];
          c = mixRGB(c, dark, 0.85 * a);
          const sheen = cl(0.5 - ((x * k.lx + y * k.ly) / P) * 0.8);
          const g = mixRGB(c, [0.85, 0.87, 0.9], a * (0.35 * shine + 0.12 * sheen));
          d[i] = cl(g[0]) * 255;
          d[i + 1] = cl(g[1]) * 255;
          d[i + 2] = cl(g[2]) * 255;
        }
    },
  },
  {
    id: 'leather',
    name: 'Cuir',
    family: 'Textiles et cuirs',
    group: 'materiau',
    slots: [],
    amount: 0.6,
    pixel: (d, k, a) => {
      const P = k.pxPerMin;
      const s = Math.max(2, 0.006 * P);
      // cuir grainé : petits bombés irréguliers séparés de plis creux, teinte brunie, lustre discret
      relief(
        d,
        k,
        (x, y) => {
          const c = cells(x / s + fbm(x / (s * 3), y / (s * 3), 231) * 0.8, y / s, 232);
          return Math.sqrt(c) * 0.85 + 0.15 * vnoise(x / (s * 0.3), y / (s * 0.3), 233);
        },
        a * 0.6 * s,
        (c, x, y) => {
          const l = lum(...c);
          const tan: RGB = [c[0] * 0.8 + l * 0.08, c[1] * 0.68 + l * 0.05, c[2] * 0.55 + l * 0.03];
          const m = 1 + a * (0.2 * fbm(x / (P * 0.1), y / (P * 0.1), 234) - 0.13);
          const g = mixRGB(c, tan, 0.5 * a);
          return [g[0] * m, g[1] * m, g[2] * m];
        },
      );
    },
  },
  {
    id: 'soft-leather',
    name: 'Cuir souple',
    family: 'Textiles et cuirs',
    group: 'materiau',
    slots: [],
    amount: 0.6,
    pixel: (d, k, a) => {
      const P = k.pxPerMin;
      const s = Math.max(2, 0.004 * P);
      // cuir souple : grain fin à peine marqué, grandes ondulations du cuir qui plie, reflet satiné
      relief(
        d,
        k,
        (x, y) => 0.35 * Math.sqrt(cells(x / s, y / s, 241)) + 0.65 * fbm(x / (P * 0.12), y / (P * 0.06), 242, 3) * (P * 0.012) / s,
        a * 0.35 * s,
        (c, x, y) => {
          const sheen = cl(0.5 - ((x * k.lx + y * k.ly) / P) * 0.7);
          const fold = fbm(x / (P * 0.12), y / (P * 0.06), 242, 3);
          const g = mixRGB(c, [c[0] * 0.88, c[1] * 0.8, c[2] * 0.72], 0.4 * a);
          return mixRGB(g, [1, 0.97, 0.93], a * (0.12 * sheen * sheen + 0.1 * cl((fold - 0.55) * 4)));
        },
      );
    },
  },
  {
    id: 'suede',
    name: 'Daim',
    family: 'Textiles et cuirs',
    group: 'materiau',
    slots: [],
    amount: 0.6,
    pixel: (d, k, a) => {
      const { w, h } = k;
      const P = k.pxPerMin;
      const fs = Math.max(1, 0.0015 * P);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const c: RGB = [d[i]! / 255, d[i + 1]! / 255, d[i + 2]! / 255];
          // daim : velours très mat, poils couchés dans un sens ou l'autre (plages claires et sombres)
          const nap = fbm(x / (P * 0.07), y / (P * 0.05), 251, 3);
          const brushed = cl((nap - 0.5) * 3 + 0.5);
          const fuzz = vnoise(x / fs, y / fs, 252) * 0.6 + vnoise(x / (fs * 0.5), y / (fs * 0.5), 253) * 0.4;
          const l = lum(...c);
          const soft = mixRGB(c, [l, l, l], 0.15 * a);
          const m = 1 - a * (0.18 * (1 - brushed) + 0.1 * fuzz) + 0.08 * a * brushed;
          d[i] = cl(soft[0] * m + 0.02 * a) * 255;
          d[i + 1] = cl(soft[1] * m + 0.02 * a) * 255;
          d[i + 2] = cl(soft[2] * m + 0.02 * a) * 255;
        }
    },
  },
  {
    id: 'denim',
    name: 'Jean',
    family: 'Textiles et cuirs',
    group: 'materiau',
    slots: [],
    amount: 0.6,
    pixel: (d, k, a) => {
      const P = k.pxPerMin;
      const p = Math.max(2.5, 0.004 * P);
      // denim : sergé en diagonale, chaîne indigo, trame blanche qui affleure, délavé par endroits
      const twill = (x: number, y: number) => {
        const t = (x + y) / p;
        return 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
      };
      relief(
        d,
        k,
        (x, y) => twill(x, y) * 0.8 + 0.2 * vnoise(x / (p * 0.5), y / (p * 4), 261),
        a * 0.4 * p,
        (c, x, y) => {
          const l = lum(...c);
          const indigo: RGB = [c[0] * 0.35 + l * 0.12 + 0.03, c[1] * 0.4 + l * 0.18 + 0.06, c[2] * 0.5 + l * 0.3 + 0.18];
          const fade = fbm(x / (P * 0.15), y / (P * 0.15), 262, 3);
          const weft = (1 - twill(x, y)) * (0.5 + 0.5 * vnoise(x / (p * 0.4), y / (p * 6), 263));
          const g = mixRGB(c, indigo, 0.9 * a);
          return mixRGB(g, [0.92, 0.92, 0.95], a * (0.12 * weft + 0.18 * cl((fade - 0.5) * 3)));
        },
      );
    },
  },
  {
    id: 'gloss',
    name: 'Reflet brillant',
    group: 'lumiere',
    slots: [],
    amount: 0.5,
  },
  {
    id: 'satin',
    name: 'Satiné',
    group: 'lumiere',
    slots: [],
    amount: 0.5,
    pixel: (d, k, a) => {
      const { w, h } = k;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          // lueur large et douce côté lampe, sans éclat net
          const t = 0.5 + (x / w - 0.5) * k.lx + (y / h - 0.5) * k.ly;
          const sheen = Math.exp(-((t - 0.76) ** 2) / 0.08) * 0.34 * a;
          for (let c = 0; c < 3; c++) d[i + c] = cl((d[i + c]! / 255) * (1 - 0.04 * a) + 0.02 * a + sheen) * 255;
        }
    },
  },
  {
    id: 'matte-varnish',
    name: 'Mat',
    group: 'lumiere',
    slots: [],
    amount: 0.5,
    pixel: (d, k, a) => {
      const { w, h } = k;
      const P = k.pxPerMin;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const c: RGB = [d[i]! / 255, d[i + 1]! / 255, d[i + 2]! / 255];
          const l = lum(...c);
          // voile mat : noirs levés, blancs éteints, couleurs un peu poudrées, grain très fin
          const g = (hash(Math.floor(x / Math.max(1, P * 0.0012)), Math.floor(y / Math.max(1, P * 0.0012)), 5) - 0.5) * 0.03 * a;
          for (let j = 0; j < 3; j++) d[i + j] = cl(0.07 * a + (c[j]! + (l - c[j]!) * 0.12 * a) * (1 - 0.13 * a) + g) * 255;
        }
    },
  },
  {
    id: 'liquid',
    name: 'Vernis liquide',
    group: 'lumiere',
    slots: [],
    amount: 0.6,
    amountLabel: 'Épaisseur',
    pixel: (d, k, a) => {
      const { w, h } = k;
      const P = k.pxPerMin;
      // couche épaisse encore fraîche : la surface ondule, les couleurs foncent et saturent comme mouillées
      const s = P * 0.07;
      const H = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) H[y * w + x] = fbm(x / s, y / s, 41, 3) * P * 0.06 * a;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const hx = H[y * w + Math.min(w - 1, x + 1)]! - H[y * w + Math.max(0, x - 1)]!;
          const hy = H[Math.min(h - 1, y + 1) * w + x]! - H[Math.max(0, y - 1) * w + x]!;
          const nl = Math.hypot(hx, hy, 2);
          const ndl = Math.max(0, (-hx * k.lx - hy * k.ly + 0.6) / nl);
          const spec = Math.pow(ndl, 14) * 1.1 * a;
          const c: RGB = [d[i * 4]! / 255, d[i * 4 + 1]! / 255, d[i * 4 + 2]! / 255];
          const l = lum(...c);
          for (let j = 0; j < 3; j++) {
            const wet = Math.pow(cl(l + (c[j]! - l) * (1 + 0.35 * a)), 1 + 0.25 * a);
            d[i * 4 + j] = cl(c[j]! + (wet - c[j]!) * a + spec) * 255;
          }
        }
    },
  },
  {
    id: 'glazed',
    name: 'Glacé miroir',
    group: 'lumiere',
    slots: [],
    amount: 0.6,
    pixel: (d, k, a) => {
      const { w, h } = k;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          // surface lisse comme un glaçage : couleurs profondes, deux reflets nets et parallèles
          const t = 0.5 + (x / w - 0.5) * k.lx + (y / h - 0.5) * k.ly;
          const u = (x / w - 0.5) * -k.ly + (y / h - 0.5) * k.lx;
          const band = (c0: number, wd: number) => Math.max(0, 1 - Math.abs(t + u * 0.35 - c0) / wd);
          const flare = (Math.pow(band(0.72, 0.05), 2) * 0.85 + Math.pow(band(0.62, 0.015), 2) * 0.6) * a;
          const c: RGB = [d[i]! / 255, d[i + 1]! / 255, d[i + 2]! / 255];
          const l = lum(...c);
          for (let j = 0; j < 3; j++) {
            const deep = cl(0.5 + (l + (c[j]! - l) * 1.25 - 0.5) * 1.18);
            d[i + j] = cl(c[j]! + (deep - c[j]!) * a + flare) * 255;
          }
        }
    },
  },
  {
    id: 'glacis',
    name: 'Glacis teinté',
    group: 'lumiere',
    slots: [{ label: 'Teinte', def: 4 }],
    amount: 0.4,
    amountLabel: 'Densité',
    pixel: (d, k, a) => {
      const { w, h } = k;
      const t = k.cols[0] ?? [0.9, 0.65, 0.25];
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          // couche transparente colorée : plus elle est dense, plus la teinte l'emporte,
          // sans jamais couvrir les ombres ; un léger lustre côté lampe
          const s = 0.5 + (x / w - 0.5) * k.lx + (y / h - 0.5) * k.ly;
          const lustre = Math.exp(-((s - 0.8) ** 2) / 0.03) * 0.1 * Math.min(1, a * 1.5);
          for (let j = 0; j < 3; j++) {
            const c = d[i + j]! / 255;
            const glazed = c * (0.15 + 0.95 * t[j]!) + t[j]! * 0.1;
            d[i + j] = cl(c + (glazed - c) * Math.min(1, a * 1.7) + lustre) * 255;
          }
        }
    },
  },
];

// le dégradé a besoin du guide lui-même (couleur selon la luminosité)
let gradGuide: Guide | undefined;
FX.find((x) => x.id === 'gradmap')!.pixel = (d, _k, a) => {
  const g = gradGuide;
  const lut: RGB[] = Array.from({ length: 256 }, (_, i) => hexRGB(guideColor(g, i / 255)));
  for (let i = 0; i < d.length; i += 4) {
    const l = Math.round(lum(d[i]! / 255, d[i + 1]! / 255, d[i + 2]! / 255) * 255);
    const t = lut[l]!;
    d[i] = (d[i]! / 255 + (t[0] - d[i]! / 255) * a) * 255;
    d[i + 1] = (d[i + 1]! / 255 + (t[1] - d[i + 1]! / 255) * a) * 255;
    d[i + 2] = (d[i + 2]! / 255 + (t[2] - d[i + 2]! / 255) * a) * 255;
  }
};

/** Filtres dessin : proposés avec les styles photo, pas dans les effets. */
export const DRAW_FX = ['cartoon', 'manga', 'sketch', 'pencil'] as const;

export const FX_GROUPS: Array<[FxGroup, string]> = [
  ['effet', 'Transformations'],
  ['lumiere', 'Revêtement'],
];

/** Matières : une seule par couche, choisie dans l'outil Matière. */
export const MATERIALS = () =>
  FX.filter((x) => x.group === 'materiau')
    .map((x, i) => ({ x, i }))
    .sort((a, b) => MATERIAL_FAMILIES.indexOf(a.x.family!) - MATERIAL_FAMILIES.indexOf(b.x.family!) || a.i - b.i)
    .map(({ x }) => x);
export const isMaterial = (id: string) => fxOf(id as FxId)?.group === 'materiau';

export const fxOf = (id: FxId | undefined) => FX.find((x) => x.id === id);

export function fxGuides(def: FxDef, s: Fx | undefined): number[] {
  return def.slots.map((sl, i) => s?.guides[i] ?? sl.def);
}

export function newFx(id: FxId): Fx {
  const d = fxOf(id)!;
  return { id, guides: d.slots.map((s) => s.def), amount: d.amount, ...(d.knobs ? { knobs: Object.fromEntries(d.knobs.map((x) => [x.key, x.fresh ?? x.def])) } : {}) };
}

/** Réglages propres de la matière, ceux qui manquent (matière posée avant leur arrivée) à leur valeur par défaut. */
export const fxKnobs = (def: FxDef, e: Fx): Record<string, number> => Object.fromEntries((def.knobs ?? []).map((x) => [x.key, e.knobs?.[x.key] ?? x.def]));

/** Opacité de l'objet : seule une matière transparente laisse voir à travers. */
export const opacityOf = (l: { material?: Fx; opacity?: number }) => (l.material && fxOf(l.material.id)?.transparent ? (l.opacity ?? 1) : 1);

export const hasPixelFx = (fx: Fx[] | undefined) => !!fx?.some((x) => fxOf(x.id)?.pixel);

/** Toutes les teintes de la palette : couleurs, et chaque arrêt des dégradés. */
export function paletteRGB(guides: Guide[]): RGB[] {
  return guides.flatMap((g) => (g.type === 'color' ? [hexRGB(g.color)] : g.stops.map(hexRGB)));
}

/**
 * Teinte naturelle : chaque pixel prend la teinte, en gardant ses écarts de clarté par rapport à la moyenne
 * (la peinture et les ombres posées sur l'objet restent lisibles).
 */
function toneImage(d: Uint8ClampedArray, t: RGB) {
  let [sum, n] = [0, 0];
  for (let i = 0; i < d.length; i += 4)
    if (d[i + 3]! > 8) {
      sum += lum(d[i]!, d[i + 1]!, d[i + 2]!);
      n++;
    }
  if (!n) return;
  const ref = Math.max(8, sum / n);
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const k = Math.min(1.6, lum(d[i]!, d[i + 1]!, d[i + 2]!) / ref);
    d[i] = cl(t[0] * k) * 255;
    d[i + 1] = cl(t[1] * k) * 255;
    d[i + 2] = cl(t[2] * k) * 255;
  }
}

/** Applique les effets de matière, dans l'ordre, sur une image. */
export function applyPixelFx(img: ImageData, fx: Fx[], guides: Guide[], pxPerMin: number, lx: number, ly: number) {
  const palette = paletteRGB(guides);
  for (const e of fx) {
    const def = fxOf(e.id);
    if (!def?.pixel) continue;
    if (e.tone) toneImage(img.data, hexRGB(e.tone));
    const gs = fxGuides(def, e).map((i) => guides[i]);
    gradGuide = gs[0];
    const cols = gs.map((g) => hexRGB(guideColor(g, 0.5)));
    def.pixel(img.data, { w: img.width, h: img.height, pxPerMin, cols, palette, lx, ly, knobs: fxKnobs(def, e) }, Math.max(0, Math.min(1, e.amount)));
  }
}
