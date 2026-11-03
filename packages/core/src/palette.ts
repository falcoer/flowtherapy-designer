import { rgbToHex } from './color.js';

/**
 * Extraction d'une palette depuis des pixels RGB : k-means dans l'espace
 * OKLab (perçu de façon régulière), initialisation déterministe pour que
 * la même image donne toujours la même palette.
 */

type Lab = [number, number, number];

const toLinear = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

function rgbToLab(r: number, g: number, b: number): Lab {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function labToHex([L, A, B]: Lab): string {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const c = (v: number) => fromLinear(Math.max(0, Math.min(1, v)));
  return rgbToHex([
    c(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    c(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    c(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]);
}

const dist2 = (a: Lab, b: Lab) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

export interface ExtractedColor {
  hex: string;
  /** Part des pixels représentés par cette couleur (0..1). */
  share: number;
}

/**
 * @param pixels  RGB ou RGBA entrelacés (8 bits)
 * @param channels 3 ou 4 ; les pixels presque transparents sont ignorés
 */
export function extractPalette(pixels: Uint8Array | Uint8ClampedArray, channels: 3 | 4, k = 6, iterations = 12): ExtractedColor[] {
  const points: Lab[] = [];
  for (let i = 0; i + channels - 1 < pixels.length; i += channels) {
    if (channels === 4 && pixels[i + 3]! < 128) continue;
    points.push(rgbToLab(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!));
  }
  if (points.length === 0) return [];
  k = Math.min(k, points.length);

  // k-means++ déterministe : on part du point le plus proche de la moyenne, puis du plus éloigné des centres
  const mean: Lab = [0, 1, 2].map((d) => points.reduce((s, p) => s + p[d]!, 0) / points.length) as Lab;
  const centers: Lab[] = [points.reduce((best, p) => (dist2(p, mean) < dist2(best, mean) ? p : best))];
  while (centers.length < k) {
    let far = points[0]!;
    let farD = -1;
    for (const p of points) {
      const d = Math.min(...centers.map((c) => dist2(p, c)));
      if (d > farD) [farD, far] = [d, p];
    }
    centers.push(far);
  }

  const assign = new Array<number>(points.length).fill(0);
  for (let it = 0; it < iterations; it++) {
    points.forEach((p, i) => {
      let best = 0;
      let bestD = Infinity;
      centers.forEach((c, j) => {
        const d = dist2(p, c);
        if (d < bestD) [bestD, best] = [d, j];
      });
      assign[i] = best;
    });
    centers.forEach((_, j) => {
      const members = points.filter((_, i) => assign[i] === j);
      if (members.length) centers[j] = [0, 1, 2].map((d) => members.reduce((s, p) => s + p[d]!, 0) / members.length) as Lab;
    });
  }

  const counts = centers.map((_, j) => assign.filter((a) => a === j).length);
  return centers
    .map((c, j) => ({ hex: labToHex(c), share: counts[j]! / points.length }))
    .filter((c) => c.share > 0)
    .sort((a, b) => b.share - a.share);
}
