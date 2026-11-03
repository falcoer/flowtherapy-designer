/**
 * Détection des contours dans l'image d'une couche, pour aimanter les ciseaux.
 *
 * 1. L'image de la couche (photo, matière, peinture) est rendue seule, au plus
 *    ANALYSIS px de côté, puis adoucie (flou 3 × 3) pour ignorer le grain.
 * 2. Deux gradients de Sobel : la luminance (contraste) et deux canaux
 *    opposés rouge-vert / jaune-bleu (couleur). Chacun est normalisé par son
 *    99e centile, pour que le seuil se comporte pareil d'une image à l'autre.
 * 3. Suppression des non-maxima le long du gradient : un bord fait un pixel
 *    d'épaisseur. On garde les pixels au-dessus du seuil, avec au moins un
 *    voisin retenu (les points isolés sont du bruit).
 */

export type EdgeMode = 'contrast' | 'color' | 'both';

const ANALYSIS = 640;

interface Analysis {
  w: number;
  h: number;
  magL: Float32Array;
  magC: Float32Array;
  dirL: Uint8Array;
  dirC: Uint8Array;
}

export interface EdgeMap {
  w: number;
  h: number;
  /** Points de contour en coordonnées de la couche (0..1), x puis y. */
  pts: Float32Array;
  /** Points des pointillés (sous-ensemble régulier des contours), coordonnées de la couche. */
  dots: Float32Array;
}

export function analysisSize(bw: number, bh: number) {
  const k = ANALYSIS / Math.max(bw, bh);
  return { w: Math.max(8, Math.round(bw * k)), h: Math.max(8, Math.round(bh * k)) };
}

/** Gradients d'une image déjà rendue (alpha nul = hors découpe). */
export function analyse(src: HTMLCanvasElement): Analysis {
  const w = src.width;
  const h = src.height;
  const data = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  const n = w * h;
  const L = new Float32Array(n);
  const A = new Float32Array(n);
  const B = new Float32Array(n);
  const inside = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = data[i * 4]!;
    const g = data[i * 4 + 1]!;
    const b = data[i * 4 + 2]!;
    inside[i] = data[i * 4 + 3]! > 250 ? 1 : 0;
    L[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    A[i] = r - g;
    B[i] = (r + g) / 2 - b;
  }
  const Ls = blur(L, w, h);
  const As = blur(A, w, h);
  const Bs = blur(B, w, h);
  const magL = new Float32Array(n);
  const magC = new Float32Array(n);
  const dirL = new Uint8Array(n);
  const dirC = new Uint8Array(n);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      // près du bord de la découpe, le gradient serait celui du vide
      if (!inside[i] || !inside[i - 1] || !inside[i + 1] || !inside[i - w] || !inside[i + w] || !inside[i - w - 1] || !inside[i + w + 1]) continue;
      const [lx, ly] = sobel(Ls, i, w);
      magL[i] = Math.hypot(lx, ly);
      dirL[i] = quant(lx, ly);
      const [ax, ay] = sobel(As, i, w);
      const [bx, by] = sobel(Bs, i, w);
      const cx = Math.abs(ax) > Math.abs(bx) ? ax : bx;
      const cy = Math.abs(ay) > Math.abs(by) ? ay : by;
      magC[i] = Math.hypot(ax, ay, bx, by);
      dirC[i] = quant(cx, cy);
    }
  normalize(magL);
  normalize(magC);
  return { w, h, magL, magC, dirL, dirC };
}

function blur(v: Float32Array, w: number, h: number): Float32Array {
  const o = new Float32Array(v.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      let c = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const k = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1;
          s += v[yy * w + xx]! * k;
          c += k;
        }
      o[y * w + x] = s / c;
    }
  return o;
}

function sobel(v: Float32Array, i: number, w: number): [number, number] {
  const gx = v[i - w + 1]! + 2 * v[i + 1]! + v[i + w + 1]! - v[i - w - 1]! - 2 * v[i - 1]! - v[i + w - 1]!;
  const gy = v[i + w - 1]! + 2 * v[i + w]! + v[i + w + 1]! - v[i - w - 1]! - 2 * v[i - w]! - v[i - w + 1]!;
  return [gx, gy];
}

/** Direction du gradient en 4 secteurs : 0 horizontal, 1 diagonale /, 2 vertical, 3 diagonale \. */
function quant(gx: number, gy: number): number {
  let a = (Math.atan2(gy, gx) * 180) / Math.PI;
  if (a < 0) a += 180;
  return a < 22.5 || a >= 157.5 ? 0 : a < 67.5 ? 1 : a < 112.5 ? 2 : 3;
}

function normalize(m: Float32Array) {
  const sample: number[] = [];
  for (let i = 0; i < m.length; i += 7) if (m[i]! > 0) sample.push(m[i]!);
  if (!sample.length) return;
  sample.sort((a, b) => a - b);
  const p = sample[Math.floor(sample.length * 0.99)] || 1;
  for (let i = 0; i < m.length; i++) m[i] = Math.min(1, m[i]! / p);
}

const NB = [
  [1, 0],
  [1, -1],
  [0, 1],
  [1, 1],
] as const;

/** Contours retenus pour un mode et un seuil (0..1 : plus haut = moins de contours). */
export function edgeMap(a: Analysis, mode: EdgeMode, threshold: number): EdgeMap {
  const { w, h } = a;
  const n = w * h;
  const keep = new Uint8Array(n);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const useC = mode === 'color' || (mode === 'both' && a.magC[i]! > a.magL[i]!);
      const mag = useC ? a.magC : a.magL;
      const m = mag[i]!;
      if (m < threshold) continue;
      const [dx, dy] = NB[(useC ? a.dirC : a.dirL)[i]!]!;
      const off = dy * w + dx;
      if (m >= mag[i + off]! && m >= mag[i - off]!) keep[i] = 1;
    }
  const pts: number[] = [];
  const dots: number[] = [];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!keep[i]) continue;
      if (!(keep[i - 1] || keep[i + 1] || keep[i - w] || keep[i + w] || keep[i - w - 1] || keep[i - w + 1] || keep[i + w - 1] || keep[i + w + 1])) continue;
      pts.push((x + 0.5) / w, (y + 0.5) / h);
      // pointillés : un groupe de quatre pixels sur deux, quelle que soit l'orientation
      if (Math.floor((x + 2 * y) / 4) % 2 === 0) dots.push((x + 0.5) / w, (y + 0.5) / h);
    }
  return { w, h, pts: Float32Array.from(pts), dots: Float32Array.from(dots) };
}

/** Grille de recherche des points de contour, en unités du format. */
export class EdgeGrid {
  private cells = new Map<number, number[]>();
  constructor(
    private xs: Float32Array,
    private ys: Float32Array,
    private cell: number,
  ) {
    for (let i = 0; i < xs.length; i++) {
      const k = this.key(Math.floor(xs[i]! / cell), Math.floor(ys[i]! / cell));
      let c = this.cells.get(k);
      if (!c) this.cells.set(k, (c = []));
      c.push(i);
    }
  }
  private key(cx: number, cy: number) {
    return (cx + 32768) * 65536 + (cy + 32768);
  }
  /** Point de contour le plus proche dans le rayon (une cellule), ou null. */
  nearest(x: number, y: number, r: number): { x: number; y: number } | null {
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    let best = -1;
    let bd = r * r;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.cells.get(this.key(cx + dx, cy + dy));
        if (!c) continue;
        for (const i of c) {
          const d = (this.xs[i]! - x) ** 2 + (this.ys[i]! - y) ** 2;
          if (d < bd) [bd, best] = [d, i];
        }
      }
    return best < 0 ? null : { x: this.xs[best]!, y: this.ys[best]! };
  }
}
