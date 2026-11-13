import type { Format } from '@ftd/core';
import { applyPixelFx, fxOf } from './fx';
import type { Doc, SceneLook } from './model';
import { lightAt } from './scene';

/**
 * Rendu de la scène : ce que l'appareil photo fait de la page entière, après la lumière.
 * Une transformation (cartoon, trame, risographie…) posée sur toute la scène,
 * puis l'objectif : distorsion (barillet ↔ coussinet), vignettage, franges colorées.
 */

export const lookOn = (doc: Doc): SceneLook | undefined => {
  const s = doc.scene;
  if (!s) return undefined;
  const lens = s.lens;
  const lensOn = !!lens && (Math.abs(lens.warp) > 0.005 || lens.vignette > 0.005 || lens.fringe > 0.005);
  return s.fx || lensOn ? s : undefined;
};

export const lensOn = (s: SceneLook) => !!s.lens && (Math.abs(s.lens.warp) > 0.005 || s.lens.vignette > 0.005 || s.lens.fringe > 0.005);

/**
 * Applique le rendu de la scène à un canevas qui contient la page entière (0,0 → f.width,f.height).
 * `quick` : l'objectif seul, sans la transformation (pendant un geste).
 */
export function applySceneLook(c: HTMLCanvasElement, doc: Doc, f: Format, quick = false) {
  const s = lookOn(doc);
  if (!s || c.width < 2 || c.height < 2) return;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const pixelFx = !!(s.fx && !quick && fxOf(s.fx.id)?.pixel);
  const withLens = lensOn(s);
  // l'objectif passe par la carte graphique quand elle est là (quelques millisecondes au lieu d'une demi-seconde)
  if (!pixelFx && withLens && lensGL(c, ctx, s.lens!)) return void ctx.restore();
  const img = ctx.getImageData(0, 0, c.width, c.height);
  if (pixelFx) {
    const li = lightAt(doc, f, f.width / 2, f.height / 2);
    const n = doc.guides.length;
    // les teintes de la transformation restent dans la palette, même raccourcie
    const fx = { ...s.fx!, guides: n ? s.fx!.guides.map((g) => Math.min(Math.max(0, g), n - 1)) : [] };
    applyPixelFx(img, [fx], doc.guides, Math.min(c.width, c.height), li.lx, li.ly);
    if (withLens) {
      ctx.putImageData(img, 0, 0);
      if (lensGL(c, ctx, s.lens!)) return void ctx.restore();
    }
  }
  const out = withLens ? lens(img, s.lens!, quick) : img;
  ctx.putImageData(out, 0, 0);
  ctx.restore();
}

/** Contexte WebGL partagé pour l'objectif ; `false` une fois qu'on sait qu'il manque (repli sur le calcul en JavaScript). */
let gl: { c: HTMLCanvasElement; g: WebGLRenderingContext; prog: WebGLProgram; tex: WebGLTexture; u: Record<string, WebGLUniformLocation | null> } | false | null = null;

const VERT = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';
// même calcul que lens() ci-dessous, pixel par pixel ; coordonnées en pixels de l'image (0 = centre du premier pixel, en haut)
const FRAG = `precision highp float;
uniform sampler2D img;
uniform vec2 size;
uniform float k, fill, fr, vig;
vec4 at(vec2 q) { return texture2D(img, (clamp(q, vec2(0.0), size - 1.0) + 0.5) / size); }
void main() {
  vec2 px = vec2(gl_FragCoord.x - 0.5, size.y - 0.5 - gl_FragCoord.y);
  vec2 c = (size - 1.0) * 0.5;
  float R = max(length(c), 1.0);
  vec2 uv = (px - c) / R;
  float r2 = dot(uv, uv);
  vec2 g = c + uv * (1.0 + k * r2) * fill * R;
  vec4 m = at(g);
  vec4 o = m;
  if (fr > 0.0) {
    float rr = sqrt(r2);
    float d = fr * R * (0.25 + rr * rr * rr);
    vec2 dv = uv / max(rr, 0.12) * d;
    o.r = at(g + dv).r;
    o.b = at(g - dv).b;
  }
  if (vig > 0.0) {
    float t = clamp((sqrt(r2) - 0.35) / 0.7, 0.0, 1.0);
    float dark = 1.0 - vig * 0.8 * t * t * (3.0 - 2.0 * t);
    o.rgb *= dark;
    if (o.a < 1.0) o.a = o.a + (1.0 - o.a) * (1.0 - dark) * 0.6;
  }
  gl_FragColor = o;
}`;

function setupGL() {
  if (gl !== null) return gl;
  gl = false;
  try {
    const c = document.createElement('canvas');
    const g = c.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
    if (!g) return gl;
    const sh = (type: number, src: string) => {
      const x = g.createShader(type)!;
      g.shaderSource(x, src);
      g.compileShader(x);
      if (!g.getShaderParameter(x, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(x) ?? 'shader');
      return x;
    };
    const prog = g.createProgram()!;
    g.attachShader(prog, sh(g.VERTEX_SHADER, VERT));
    g.attachShader(prog, sh(g.FRAGMENT_SHADER, FRAG));
    g.linkProgram(prog);
    if (!g.getProgramParameter(prog, g.LINK_STATUS)) throw new Error('link');
    g.useProgram(prog);
    const buf = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, buf);
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW);
    const loc = g.getAttribLocation(prog, 'p');
    g.enableVertexAttribArray(loc);
    g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);
    const tex = g.createTexture()!;
    g.bindTexture(g.TEXTURE_2D, tex);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false);
    const u = Object.fromEntries(['img', 'size', 'k', 'fill', 'fr', 'vig'].map((n) => [n, g.getUniformLocation(prog, n)]));
    // contexte perdu (mémoire de l'iPad) : on retentera à la prochaine demande
    c.addEventListener('webglcontextlost', () => (gl = null));
    gl = { c, g, prog, tex, u };
  } catch {
    gl = false;
  }
  return gl;
}

/** L'objectif sur la carte graphique, posé à la place du contenu de `c` ; `false` si WebGL manque ou si l'image est trop grande. */
function lensGL(c: HTMLCanvasElement, ctx: CanvasRenderingContext2D, L: NonNullable<SceneLook['lens']>): boolean {
  const G = setupGL();
  if (!G) return false;
  const { g, u } = G;
  if (g.isContextLost()) return false;
  const w = c.width;
  const h = c.height;
  const max = g.getParameter(g.MAX_TEXTURE_SIZE) as number;
  if (w > max || h > max) return false;
  try {
    if (G.c.width !== w || G.c.height !== h) {
      G.c.width = w;
      G.c.height = h;
    }
    g.viewport(0, 0, w, h);
    g.bindTexture(g.TEXTURE_2D, G.tex);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, c);
    const k = L.warp * 0.32;
    g.uniform1i(u.img!, 0);
    g.uniform2f(u.size!, w, h);
    g.uniform1f(u.k!, k);
    g.uniform1f(u.fill!, k > 0 ? 1 / (1 + k) : 1);
    g.uniform1f(u.fr!, L.fringe * 0.03);
    g.uniform1f(u.vig!, L.vignette);
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
    if (g.getError() !== g.NO_ERROR) return false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(G.c, 0, 0);
    // la texture d'une grande page pèse lourd : on la vide une fois le rendu posé
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, 1, 1, 0, g.RGBA, g.UNSIGNED_BYTE, null);
    return true;
  } catch {
    return false;
  }
}

/** L'objectif : chaque pixel va chercher sa couleur un peu plus loin (barillet) ou plus près (coussinet) du centre. */
function lens(img: ImageData, L: NonNullable<SceneLook['lens']>, quick: boolean): ImageData {
  const { width: w, height: h, data: src } = img;
  const out = new ImageData(w, h);
  const dst = out.data;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const R = Math.hypot(cx, cy) || 1;
  const k = L.warp * 0.32;
  // barillet : on resserre pour que les coins restent pleins
  const fill = k > 0 ? 1 / (1 + k) : 1;
  // franges colorées : le rouge s'écarte vers les bords, le bleu se resserre (un peu au centre, jusqu'à ~3 % du rayon au bord)
  const fr = L.fringe * 0.03;
  const vig = L.vignette;
  const sample = (x: number, y: number, ch: number): number => {
    if (x < 0) x = 0;
    else if (x > w - 1) x = w - 1;
    if (y < 0) y = 0;
    else if (y > h - 1) y = h - 1;
    if (quick) return src[((Math.round(y) * w + Math.round(x)) << 2) + ch]!;
    const x0 = x | 0;
    const y0 = y | 0;
    const x1 = x0 < w - 1 ? x0 + 1 : x0;
    const y1 = y0 < h - 1 ? y0 + 1 : y0;
    const tx = x - x0;
    const ty = y - y0;
    const a = src[((y0 * w + x0) << 2) + ch]!;
    const b = src[((y0 * w + x1) << 2) + ch]!;
    const c = src[((y1 * w + x0) << 2) + ch]!;
    const d = src[((y1 * w + x1) << 2) + ch]!;
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  };
  for (let y = 0; y < h; y++) {
    const v = (y - cy) / R;
    for (let x = 0; x < w; x++) {
      const u = (x - cx) / R;
      const r2 = u * u + v * v;
      const m = (1 + k * r2) * fill;
      const o = (y * w + x) << 2;
      const gx = cx + u * m * R;
      const gy = cy + v * m * R;
      let r: number, g: number, b: number;
      if (fr > 0) {
        // décalage le long du rayon, en pixels : déjà visible près du centre, plus fort vers les bords
        const rr = Math.sqrt(r2);
        const d = fr * R * (0.25 + rr * rr * rr);
        const n = Math.max(rr, 0.12);
        const dx = (u / n) * d;
        const dy = (v / n) * d;
        r = sample(gx + dx, gy + dy, 0);
        g = sample(gx, gy, 1);
        b = sample(gx - dx, gy - dy, 2);
      } else {
        r = sample(gx, gy, 0);
        g = sample(gx, gy, 1);
        b = sample(gx, gy, 2);
      }
      let a = sample(gx, gy, 3);
      if (vig > 0) {
        // assombri vers les bords, doucement
        const t = Math.min(1, Math.max(0, (Math.sqrt(r2) - 0.35) / 0.7));
        const dark = 1 - vig * 0.8 * t * t * (3 - 2 * t);
        r *= dark;
        g *= dark;
        b *= dark;
        if (a < 255) a = a + (255 - a) * (1 - dark) * 0.6;
      }
      dst[o] = r;
      dst[o + 1] = g;
      dst[o + 2] = b;
      dst[o + 3] = a;
    }
  }
  return out;
}
