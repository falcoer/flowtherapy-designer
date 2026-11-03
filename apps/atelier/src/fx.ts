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
  | 'posterize'
  | 'gradmap'
  | 'grain'
  | 'kraft'
  | 'watercolor'
  | 'corrugated'
  | 'newsprint'
  | 'gloss'
  | 'canvas'
  | 'wood'
  | 'metal'
  | 'felt'
  | 'cartoon'
  | 'manga'
  | 'sketch'
  | 'pencil';

export type FxGroup = 'dessin' | 'effet' | 'materiau' | 'lumiere';

export interface Fx {
  id: FxId;
  /** Index des guides utilisés, dans l'ordre des rôles de l'effet. */
  guides: number[];
  /** Intensité (0..1). */
  amount: number;
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
}

export interface FxDef {
  id: FxId;
  name: string;
  group: FxGroup;
  slots: Array<{ label: string; def: number }>;
  amount: number;
  /** Calcul par pixel (matière) ; absent = effet dessiné par la scène. */
  pixel?: (d: Uint8ClampedArray, k: PixelCtx, a: number) => void;
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
    group: 'dessin',
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
    group: 'dessin',
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
    group: 'dessin',
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
    group: 'dessin',
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
    group: 'materiau',
    slots: [],
    amount: 0.6,
    pixel: (d, k, a) => {
      const P = k.pxPerMin;
      const ring = (x: number, y: number) => {
        // veines : des cernes déformés par un bruit lent, étirés dans le sens du fil
        const warp = fbm(x / (P * 0.25), y / (P * 0.06), 71) * P * 0.05;
        const v = Math.sin(((y + warp) / (P * 0.008)) * Math.PI * 2);
        return 0.5 + 0.5 * v * (0.6 + 0.4 * vnoise(x / (P * 0.1), y / (P * 0.02), 72));
      };
      relief(d, k, (x, y) => ring(x, y) * 0.6 + 0.4 * vnoise(x / (P * 0.03), y / 1.5, 73), a * 0.18 * P * 0.008, (c, x, y) => {
        const r = ring(x, y);
        const wood: RGB = [0.62 - 0.12 * r, 0.42 - 0.1 * r, 0.24 - 0.07 * r];
        return mixRGB(c, [c[0] * wood[0] * 1.5, c[1] * wood[1] * 1.6, c[2] * wood[2] * 1.7], 0.65 * a);
      });
    },
  },
  {
    id: 'metal',
    name: 'Métal brossé',
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
    group: 'materiau',
    slots: [],
    amount: 0.6,
    pixel: (d, k, a) => {
      const P = k.pxPerMin;
      const fs = Math.max(1, P * 0.0025);
      // fibres emmêlées : un bruit fin dans toutes les directions, couleur douce et mate
      relief(d, k, (x, y) => fbm(x / fs, y / fs, 91, 4), a * 0.35 * fs, (c, x, y) => {
        const l = lum(...c);
        const fuzz = 1 - 0.12 * a * fbm(x / (fs * 0.6), y / (fs * 0.6), 92);
        const soft = mixRGB(c, [l, l, l], 0.12 * a);
        return [soft[0] * fuzz + 0.03 * a, soft[1] * fuzz + 0.03 * a, soft[2] * fuzz + 0.03 * a];
      });
    },
  },
  {
    id: 'gloss',
    name: 'Reflet brillant',
    group: 'lumiere',
    slots: [],
    amount: 0.5,
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
  ['effet', 'Effets'],
  ['lumiere', 'Lumière'],
];

/** Matières : une seule par couche, choisie dans l'outil Matière. */
export const MATERIALS = () => FX.filter((x) => x.group === 'materiau');
export const isMaterial = (id: string) => fxOf(id as FxId)?.group === 'materiau';

export const fxOf = (id: FxId | undefined) => FX.find((x) => x.id === id);

export function fxGuides(def: FxDef, s: Fx | undefined): number[] {
  return def.slots.map((sl, i) => s?.guides[i] ?? sl.def);
}

export function newFx(id: FxId): Fx {
  const d = fxOf(id)!;
  return { id, guides: d.slots.map((s) => s.def), amount: d.amount };
}

export const hasPixelFx = (fx: Fx[] | undefined) => !!fx?.some((x) => fxOf(x.id)?.pixel);

/** Toutes les teintes de la palette : couleurs, et chaque arrêt des dégradés. */
export function paletteRGB(guides: Guide[]): RGB[] {
  return guides.flatMap((g) => (g.type === 'color' ? [hexRGB(g.color)] : g.stops.map(hexRGB)));
}

/** Applique les effets de matière, dans l'ordre, sur une image. */
export function applyPixelFx(img: ImageData, fx: Fx[], guides: Guide[], pxPerMin: number, lx: number, ly: number) {
  const palette = paletteRGB(guides);
  for (const e of fx) {
    const def = fxOf(e.id);
    if (!def?.pixel) continue;
    const gs = fxGuides(def, e).map((i) => guides[i]);
    gradGuide = gs[0];
    const cols = gs.map((g) => hexRGB(guideColor(g, 0.5)));
    def.pixel(img.data, { w: img.width, h: img.height, pxPerMin, cols, palette, lx, ly }, Math.max(0, Math.min(1, e.amount)));
  }
}
