/**
 * Relief sculpté (bump mapping) : une carte de hauteurs par objet, éclairée par la lampe.
 *
 * Le document ne garde que les hauteurs (octets, 128 = à plat) : l'éclairage est calculé ici,
 * dans `shadeBump` seule, pour pouvoir le remplacer tel quel par un shader au passage à WebGL.
 */

export interface Bump {
  /** Taille de la carte, en pixels (le grand côté fait BUMP_RES). */
  w: number;
  h: number;
  /** Hauteurs en base64 : un octet par pixel, 128 = à plat, 0 = creux, 255 = bosse. */
  data: string;
}

export const BUMP_RES = 200;

/** Carte à plat, aux proportions de la boîte de l'objet. */
export function blankBump(boxW: number, boxH: number): { w: number; h: number; H: Float32Array } {
  const r = boxW / Math.max(1e-6, boxH);
  const w = r >= 1 ? BUMP_RES : Math.max(8, Math.round(BUMP_RES * r));
  const h = r >= 1 ? Math.max(8, Math.round(BUMP_RES / r)) : BUMP_RES;
  return { w, h, H: new Float32Array(w * h) };
}

const decoded = new Map<string, Float32Array>();
/** Hauteurs (-1..1) d'une carte enregistrée ; gardées en mémoire. */
export function bumpHeights(b: Bump): Float32Array {
  let H = decoded.get(b.data);
  if (H) return H;
  const s = atob(b.data);
  H = new Float32Array(b.w * b.h);
  for (let i = 0; i < H.length; i++) H[i] = (s.charCodeAt(i) - 128) / 127;
  if (decoded.size > 40) decoded.clear();
  decoded.set(b.data, H);
  return H;
}

export function encodeBump(w: number, h: number, H: Float32Array): Bump {
  let s = '';
  const chunk: number[] = [];
  for (let i = 0; i < H.length; i++) {
    chunk.push(Math.max(0, Math.min(255, Math.round(128 + H[i]! * 127))));
    if (chunk.length === 4096) {
      s += String.fromCharCode(...chunk);
      chunk.length = 0;
    }
  }
  s += String.fromCharCode(...chunk);
  const data = btoa(s);
  decoded.set(data, H.slice());
  return { w, h, data };
}

/** Une touche de sculpteur : bosse douce (ou creux si k < 0) de rayon r pixels, autour de (x, y). */
export function dab(H: Float32Array, w: number, h: number, x: number, y: number, r: number, k: number) {
  const R = Math.max(1, r);
  const [x0, x1] = [Math.max(0, Math.floor(x - R)), Math.min(w - 1, Math.ceil(x + R))];
  const [y0, y1] = [Math.max(0, Math.floor(y - R)), Math.min(h - 1, Math.ceil(y + R))];
  for (let j = y0; j <= y1; j++)
    for (let i = x0; i <= x1; i++) {
      const d2 = ((i - x) ** 2 + (j - y) ** 2) / (R * R);
      if (d2 >= 1) continue;
      const n = j * w + i;
      // profil en cloche : le centre monte, le bord s'adoucit jusqu'à zéro
      H[n] = Math.max(-1, Math.min(1, H[n]! + k * (1 - d2) ** 2));
    }
}

/** Adoucit tout le relief (moyenne des voisins). */
export function smoothBump(H: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(H.length);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      let s = 0;
      let n = 0;
      for (let dj = -2; dj <= 2; dj++)
        for (let di = -2; di <= 2; di++) {
          const [a, b] = [i + di, j + dj];
          if (a < 0 || b < 0 || a >= w || b >= h) continue;
          s += H[b * w + a]!;
          n++;
        }
      out[j * w + i] = s / n;
    }
  return out;
}

export interface BumpLight {
  /** Direction vers la lampe, dans le repère de l'objet. */
  lx: number;
  ly: number;
  /** Hauteur de la lampe au-dessus de la page (radians). */
  elev: number;
  /** Couleur de la lampe (0..1). */
  color: [number, number, number];
  /** Brillance du vernis : exposant du reflet (0 : pas de reflet) et sa force. */
  shine: number;
  spec: number;
}

const shaded = new Map<string, HTMLCanvasElement>();
/**
 * Éclairage du relief : une image à poser sur l'objet, blanche là où la pente regarde la lampe,
 * noire à l'opposé, transparente à plat. Lambert + reflet de Blinn-Phong (le futur shader).
 */
export function shadeBump(b: Bump, L: BumpLight, H = bumpHeights(b), live = false): HTMLCanvasElement {
  let hsh = 2166136261;
  for (let i = 0; i < b.data.length; i++) hsh = Math.imul(hsh ^ b.data.charCodeAt(i), 16777619);
  const key = `${b.w}x${b.h}:${hsh >>> 0}:${L.lx.toFixed(2)},${L.ly.toFixed(2)},${L.elev.toFixed(2)},${L.shine},${L.spec},${L.color.join(',')}`;
  const hit = !live && shaded.get(key);
  if (hit) return hit;
  const { w, h } = b;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const ce = Math.cos(L.elev);
  const [Lx, Ly, Lz] = [L.lx * ce, L.ly * ce, Math.sin(L.elev)];
  // demi-vecteur entre la lampe et l'œil (vu de face)
  const hn = Math.hypot(Lx, Ly, Lz + 1);
  const [Hx, Hy, Hz] = [Lx / hn, Ly / hn, (Lz + 1) / hn];
  const flatSpec = L.shine ? Math.pow(Hz, L.shine) : 0;
  // pente : une bosse pleine sur une vingtaine de pixels penche d'environ 45°
  const A = 12;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const hx = (H[j * w + Math.min(w - 1, i + 1)]! - H[j * w + Math.max(0, i - 1)]!) * 0.5 * A;
      const hy = (H[Math.min(h - 1, j + 1) * w + i]! - H[Math.max(0, j - 1) * w + i]!) * 0.5 * A;
      const nn = Math.hypot(hx, hy, 1);
      const [nx, ny, nz] = [-hx / nn, -hy / nn, 1 / nn];
      const diff = Math.max(0, nx * Lx + ny * Ly + nz * Lz) - Lz;
      const spec = L.shine ? (Math.pow(Math.max(0, nx * Hx + ny * Hy + nz * Hz), L.shine) - flatSpec) * L.spec : 0;
      const v = diff * 1.3 + spec;
      const o = (j * w + i) * 4;
      if (v >= 0) {
        d[o] = 255 * (0.6 + 0.4 * L.color[0]);
        d[o + 1] = 255 * (0.6 + 0.4 * L.color[1]);
        d[o + 2] = 255 * (0.6 + 0.4 * L.color[2]);
        d[o + 3] = Math.min(255, v * 255);
      } else {
        d[o] = d[o + 1] = d[o + 2] = 0;
        d[o + 3] = Math.min(255, -v * 255 * 0.9);
      }
    }
  ctx.putImageData(img, 0, 0);
  if (!live) {
    if (shaded.size > 30) shaded.clear();
    shaded.set(key, c);
  }
  return c;
}
