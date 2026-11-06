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
  const key = `${b.w}x${b.h}:${hsh >>> 0}:${lightKey(L)}`;
  const hit = !live && shaded.get(key);
  if (hit) return hit;
  // pente : une bosse pleine sur une vingtaine de pixels penche d'environ 45°
  const c = shadeField(b.w, b.h, H, L, 12);
  if (!live) {
    if (shaded.size > 30) shaded.clear();
    shaded.set(key, c);
  }
  return c;
}

export const lightKey = (L: BumpLight) => `${L.lx.toFixed(2)},${L.ly.toFixed(2)},${L.elev.toFixed(2)},${L.shine},${L.spec},${L.color.join(',')}`;

/**
 * Cœur de l'éclairage, commun au relief sculpté et au biseau : hauteurs H (multipliées par A
 * pour la pente, en pixels), masque facultatif (0..1) qui efface l'image hors de l'objet.
 */
export function shadeField(w: number, h: number, H: Float32Array, L: BumpLight, A: number, mask?: Float32Array, gain = 1): HTMLCanvasElement {
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
  const lit = [255 * (0.6 + 0.4 * L.color[0]), 255 * (0.6 + 0.4 * L.color[1]), 255 * (0.6 + 0.4 * L.color[2])];
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const n = j * w + i;
      const m = mask ? mask[n]! : 1;
      if (m <= 0) continue;
      const hx = (H[j * w + Math.min(w - 1, i + 1)]! - H[j * w + Math.max(0, i - 1)]!) * 0.5 * A;
      const hy = (H[Math.min(h - 1, j + 1) * w + i]! - H[Math.max(0, j - 1) * w + i]!) * 0.5 * A;
      const nn = Math.hypot(hx, hy, 1);
      const [nx, ny, nz] = [-hx / nn, -hy / nn, 1 / nn];
      const diff = Math.max(0, nx * Lx + ny * Ly + nz * Lz) - Lz;
      const spec = L.shine ? (Math.pow(Math.max(0, nx * Hx + ny * Hy + nz * Hz), L.shine) - flatSpec) * L.spec : 0;
      const v = (diff * 1.3 + spec) * m * gain;
      const o = n * 4;
      if (v >= 0) {
        d[o] = lit[0]!;
        d[o + 1] = lit[1]!;
        d[o + 2] = lit[2]!;
        d[o + 3] = Math.min(255, v * 255);
      } else d[o + 3] = Math.min(255, -v * 255 * 0.9);
    }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * Profil du biseau : à partir d'un masque (0..1), la distance au bord en pixels, puis une hauteur
 * qui monte sur `width` pixels (arrondi : quart de rond ; chanfrein : pente droite).
 */
/** Distance au bord du masque, en pixels (exacte, euclidienne). */
export function distField(w: number, h: number, mask: Float32Array): Float32Array {
  // distance euclidienne exacte (Felzenszwalb), en deux passes séparées
  const INF = 1e12;
  const G = new Float64Array(w * h);
  for (let n = 0; n < G.length; n++) G[n] = mask[n]! >= 0.5 ? INF : 0;
  const N = Math.max(w, h);
  const f = new Float64Array(N + 2);
  const v = new Int32Array(N + 2);
  const z = new Float64Array(N + 3);
  const dt = (len: number, get: (i: number) => number, set: (i: number, x: number) => void) => {
    for (let i = 0; i < len; i++) f[i] = get(i);
    // bords de la carte : au-delà, c'est l'extérieur
    let k = 0;
    v[0] = -1;
    f[len] = 0;
    z[0] = -Infinity;
    z[1] = Infinity;
    const F = (q: number) => (q < 0 || q >= len ? 0 : f[q]!);
    for (let q = 0; q <= len; q++) {
      const fq = q === len ? 0 : F(q);
      let sp = (fq + q * q - (F(v[k]!) + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
      while (sp <= z[k]!) {
        k--;
        sp = (fq + q * q - (F(v[k]!) + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
      }
      k++;
      v[k] = q;
      z[k] = sp;
      z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1]! < q) k++;
      set(q, (q - v[k]!) ** 2 + F(v[k]!));
    }
  };
  for (let i = 0; i < w; i++)
    dt(
      h,
      (j) => G[j * w + i]!,
      (j, x) => (G[j * w + i] = x),
    );
  for (let j = 0; j < h; j++)
    dt(
      w,
      (i) => G[j * w + i]!,
      (i, x) => (G[j * w + i] = x),
    );
  const D = new Float32Array(w * h);
  // le bord doux du masque prolonge la distance d'une fraction de pixel
  for (let n = 0; n < D.length; n++) D[n] = G[n] ? Math.max(0, Math.sqrt(G[n]!) - 0.5 + mask[n]!) : 0;
  return D;
}

/** Lissage 3×3, répété : efface les marches de la distance (rayons en éventail). */
export function soften(H: Float32Array, w: number, h: number, passes: number): Float32Array {
  let cur = H;
  for (let pass = 0; pass < passes; pass++) {
    const sm = new Float32Array(w * h);
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        let a = 0;
        let k = 0;
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            const [x, y] = [i + di, j + dj];
            if (x < 0 || y < 0 || x >= w || y >= h) continue;
            a += cur[y * w + x]!;
            k++;
          }
        sm[j * w + i] = a / k;
      }
    cur = sm;
  }
  return cur;
}

/**
 * Profil du biseau : à partir de la distance au bord, une hauteur qui monte sur `width` pixels
 * (arrondi : quart de rond ; chanfrein : pente droite).
 */
export function bevelField(w: number, h: number, D: Float32Array, width: number, profile: 'round' | 'chamfer'): Float32Array {
  const W = Math.max(1, width);
  const out = new Float32Array(w * h);
  for (let n = 0; n < D.length; n++) {
    const t = Math.min(1, D[n]! / W);
    if (t <= 0) continue;
    out[n] = W * (profile === 'chamfer' ? t * 0.8 : 1 - (1 - t) * (1 - t));
  }
  return out;
}

/**
 * Volume tiré du contour (hauteurs en pixels) : dôme et coussin depuis la distance au bord,
 * cône en pente droite, cylindre arrondi en travers de son axe.
 */
export function volumeField(w: number, h: number, mask: Float32Array, D: Float32Array, v: { kind: string; amount: number; axis?: number }): Float32Array {
  const out = new Float32Array(w * h);
  let R = 1;
  for (let n = 0; n < D.length; n++) if (D[n]! > R) R = D[n]!;
  const a = v.amount;
  if (v.kind === 'cylinder') {
    // en travers de l'axe : on cherche les deux bords de la tranche, puis un demi-cercle
    const ax = v.axis ?? 0;
    const [px, py] = [Math.cos(ax), Math.sin(ax)];
    const inside = (x: number, y: number) => {
      const [i, j] = [Math.round(x), Math.round(y)];
      return i >= 0 && j >= 0 && i < w && j < h && mask[j * w + i]! >= 0.5;
    };
    const step = 1;
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const n = j * w + i;
        if (mask[n]! < 0.5) continue;
        let l = 0;
        while (inside(i - px * (l + step), j - py * (l + step))) l += step;
        let r = 0;
        while (inside(i + px * (r + step), j + py * (r + step))) r += step;
        const half = (l + r + 1) / 2;
        const t = (r - l) / 2 / half;
        out[n] = a * half * Math.sqrt(Math.max(0, 1 - t * t));
      }
    return out;
  }
  for (let n = 0; n < D.length; n++) {
    const d = D[n]!;
    if (d <= 0) continue;
    const t = d / R;
    if (v.kind === 'dome') out[n] = a * R * Math.sqrt(1 - (1 - t) * (1 - t));
    else if (v.kind === 'cone') out[n] = a * d;
    else {
      // coussin : arrondi sur le premier tiers, plat au milieu
      const u = Math.min(1, t / 0.35);
      out[n] = a * 0.35 * R * Math.sqrt(1 - (1 - u) * (1 - u));
    }
  }
  return out;
}
