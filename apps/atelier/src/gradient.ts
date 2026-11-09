import { blendStops, guideColor, shapeOf, type Blend, type GradPlace, type GradShape, type Guide } from './model';

/**
 * Dégradés en quatre modes (linéaire, radial, conique, diamant), avec centre, angle, étendue et répétitions.
 * Le dégradé est calculé point par point dans un petit canevas qui couvre la boîte de l'objet (plus une marge,
 * pour les bords qui débordent), puis posé comme motif : tous les modes se peignent de la même façon.
 */

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));

/**
 * Position (0..1) le long du dégradé au point (u, v) de la boîte (0..1), pour une boîte de proportions `ar` (largeur / hauteur).
 */
export function gradT(s: GradShape, u: number, v: number, ar: number): number {
  // repère orthonormé : l'unité est le plus grand côté
  const wx = ar >= 1 ? 1 : ar;
  const hy = ar >= 1 ? 1 / ar : 1;
  const X = (u - s.cx) * wx;
  const Y = (v - s.cy) * hy;
  const a = (s.angle * Math.PI) / 180;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const sp = Math.max(0.05, s.spread);
  let t: number;
  if (s.mode === 'linear') {
    const half = (Math.abs(wx * ca) + Math.abs(hy * sa)) / 2;
    t = 0.5 + (X * ca + Y * sa) / (2 * half * sp);
  } else if (s.mode === 'radial') {
    t = s.ellipse ? Math.hypot((u - s.cx) / 0.5, (v - s.cy) / 0.5) / (Math.SQRT2 * sp) : Math.hypot(X, Y) / ((Math.hypot(wx, hy) / 2) * sp);
  } else if (s.mode === 'conic') {
    t = ((((Math.atan2(Y, X) - a) / (2 * Math.PI)) % 1) + 1) % 1;
  } else {
    const xr = X * ca + Y * sa;
    const yr = -X * sa + Y * ca;
    t = (Math.abs(xr) + Math.abs(yr)) / (((wx + hy) / 2) * sp);
  }
  if (s.mode !== 'conic') t = clamp(t);
  const n = Math.max(1, Math.round(s.repeat));
  if (n === 1) return t;
  const k = Math.min(n - 1e-9, t * n);
  const f = k - Math.floor(k);
  return s.mirror && Math.floor(k) % 2 === 1 ? 1 - f : f;
}

/** Teintes du dégradé en table (256 valeurs) : la transition (douce, faible, sans) comprise. */
function lut(g: Extract<Guide, { type: 'gradient' }>): Uint8ClampedArray {
  const out = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const c = guideColor(g, i / 255);
    const n = parseInt(c.slice(1), 16);
    out.set([(n >> 16) & 255, (n >> 8) & 255, n & 255], i * 3);
  }
  return out;
}

/** Marge peinte autour de la boîte, en fraction de ses côtés. */
const PAD = 0.3;
const cache = new Map<string, HTMLCanvasElement | OffscreenCanvas>();

/** Position dans le dégradé de chaque point (0..255) : ne dépend que de la forme, gardée d'une couleur à l'autre. */
const fields = new Map<string, { W: number; H: number; t: Uint8Array }>();
function gradField(s: GradShape, ar: number) {
  const key = JSON.stringify([s, Math.round(ar * 50) / 50]);
  const hit = fields.get(key);
  if (hit) return hit;
  const R = 256;
  const W = Math.max(8, Math.round(ar >= 1 ? R : R * ar));
  const H = Math.max(8, Math.round(ar >= 1 ? R / ar : R));
  const t = new Uint8Array(W * H);
  const span = 1 + 2 * PAD;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) t[y * W + x] = Math.round(gradT(s, -PAD + ((x + 0.5) / W) * span, -PAD + ((y + 0.5) / H) * span, ar) * 255);
  if (fields.size > 40) fields.clear();
  const f = { W, H, t };
  fields.set(key, f);
  return f;
}

function gradCanvas(g: Extract<Guide, { type: 'gradient' }>, s: GradShape, ar: number) {
  const key = JSON.stringify([g.stops, g.blend, s, Math.round(ar * 50) / 50]);
  const hit = cache.get(key);
  if (hit) return hit;
  const { W, H, t } = gradField(s, ar);
  const c =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(W, H)
      : Object.assign(document.createElement('canvas'), {
          width: W,
          height: H,
        });
  const ctx = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  const img = ctx.createImageData(W, H);
  const tab = lut(g);
  const d = img.data;
  for (let k = 0, n = W * H; k < n; k++) {
    const j = t[k]! * 3;
    const o = k * 4;
    d[o] = tab[j]!;
    d[o + 1] = tab[j + 1]!;
    d[o + 2] = tab[j + 2]!;
    d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  if (cache.size > 80) cache.clear();
  cache.set(key, c);
  return c;
}

type Box = { x0: number; y0: number; x1: number; y1: number };

/** Remplissage d'un dégradé mis en forme sur une boîte (style de la palette, repère de l'objet) ; null sans forme (ancien dégradé). */
export function shapedFill(ctx: CanvasRenderingContext2D, g: Guide | undefined, box: Box, place?: GradPlace): CanvasPattern | null {
  const shape = shapeOf(g, place);
  if (g?.type !== 'gradient' || !shape) return null;
  const w = Math.max(1e-6, box.x1 - box.x0);
  const h = Math.max(1e-6, box.y1 - box.y0);
  const c = gradCanvas(g, shape, w / h);
  const pat = ctx.createPattern(c as CanvasImageSource, 'no-repeat');
  if (!pat) return null;
  const span = 1 + 2 * PAD;
  pat.setTransform(new DOMMatrix().translate(box.x0 - PAD * w, box.y0 - PAD * h).scale((w * span) / c.width, (h * span) / c.height));
  return pat;
}

/** Le dégradé en CSS pour les pastilles et aperçus (le diamant y est approché par un radial). */
export function cssShaped(stops: string[], blend: Blend | undefined, s?: GradShape, fallbackAngle = '135deg'): string {
  if (stops.length < 2) return stops[0] ?? '#888888';
  if (!s) return `linear-gradient(${fallbackAngle}, ${list(stops, blend, 1, false)})`;
  const at = `at ${(s.cx * 100).toFixed(1)}% ${(s.cy * 100).toFixed(1)}%`;
  const n = Math.max(1, Math.round(s.repeat));
  const l = list(stops, blend, n, !!s.mirror);
  if (s.mode === 'linear') return `linear-gradient(${s.angle + 90}deg, ${l})`;
  if (s.mode === 'conic') return `conic-gradient(from ${s.angle + 90}deg ${at}, ${l})`;
  return `radial-gradient(${s.mode === 'radial' && s.ellipse ? 'ellipse' : 'circle'} ${s.mode === 'diamond' ? 'closest-side' : 'farthest-corner'} ${at}, ${l})`;
}
function list(stops: string[], blend: Blend | undefined, n: number, mirror: boolean) {
  const base = blendStops(stops, blend);
  const out: string[] = [];
  for (let k = 0; k < n; k++) {
    const seq = mirror && k % 2 === 1 ? [...base].reverse().map(([p, c]) => [1 - p, c] as const) : base;
    seq.forEach(([p, c]) => out.push(`${c} ${(((k + p) / n) * 100).toFixed(2)}%`));
  }
  return out.join(', ');
}
