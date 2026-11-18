import { drawWarped, type Mesh } from './warp';

/**
 * Surface déformée posée par la carte graphique. La surface au repos d'une forme qui se plie (teinte, dégradé, image,
 * peinture, relief) est rendue une fois à plat, puis gardée tant que rien ne la change : sur la carte graphique (une
 * texture par couche) quand WebGL est là, sinon dans un canevas. À chaque image, le maillage la pose d'un seul dessin
 * (des triangles texturés) au lieu de centaines de morceaux découpés un à un par le canevas 2D.
 * Sans WebGL, ou pour un rendu trop grand, on retombe sur le dessin par morceaux (drawWarped). Le choix se règle dans les Préférences (setWarpMode).
 */

const TOUCH = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
/** Mémoire gardée pour les surfaces à plat (octets) : une tablette n'a pas de quoi en garder beaucoup. */
const BUDGET = TOUCH ? 64e6 : 320e6;
/** Plus grand côté du rendu WebGL (pixels de l'écran) ; au-delà, le dessin par morceaux. */
const GL_MAX = TOUCH ? 3072 : 4096;

/** Dessine la surface à plat dans `bx` (un canevas de iw × ih, vide, repère identité) ; rend `false` si elle n'est pas entière (image ou peinture en route). */
export type FlatRender = (bx: CanvasRenderingContext2D, iw: number, ih: number) => boolean;

interface GL {
  c: HTMLCanvasElement;
  g: WebGLRenderingContext;
  pos: number;
  uv: number;
  vbo: WebGLBuffer;
  ibo: WebGLBuffer;
  max: number;
  /** Les index 32 bits manquent sur certains appareils : les maillages restent alors sous 65 536 nœuds. */
  big: boolean;
}
let gl: GL | null | false = null;
/**
 * Pose des surfaces déformées, au choix dans les Préférences : automatique (la carte graphique quand elle en est une vraie),
 * toujours la carte graphique (WebGL même logiciel), ou jamais (dessin par morceaux). Gardé sur l'appareil.
 */
export type WarpMode = 'auto' | 'gl' | '2d';
const MODE_KEY = 'ftd-atelier-warp';
let mode: WarpMode = (() => {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === 'gl' || v === '2d' ? v : 'auto';
  } catch {
    return 'auto';
  }
})();
const forced = () => mode;
export const warpMode = () => mode;
export function setWarpMode(m: WarpMode) {
  mode = m;
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    /* stockage indisponible */
  }
  // la carte graphique se redemande au prochain dessin ; les surfaces gardées repartent de zéro
  if (!gl) gl = null;
  for (const id of [...surfaces.keys()]) drop(id);
}
/** Ce que l'appareil offre : WebGL matériel, logiciel (sans carte graphique), ou rien. */
let probed: 'hard' | 'soft' | 'none' | null = null;
export function warpGPU(): 'hard' | 'soft' | 'none' {
  if (probed) return probed;
  probed = 'none';
  try {
    const g = document.createElement('canvas').getContext('webgl');
    if (g) {
      const info = g.getExtension('WEBGL_debug_renderer_info');
      const r = info ? String(g.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
      probed = SOFT.test(r) ? 'soft' : 'hard';
      g.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    /* pas de WebGL */
  }
  return probed;
}
const SOFT = /swiftshader|llvmpipe|softpipe|software|basic render/i;

const VERT = `attribute vec2 pos; attribute vec2 uv; varying vec2 v;
void main() { v = uv; gl_Position = vec4(pos, 0.0, 1.0); }`;
const FRAG = `precision mediump float; varying vec2 v; uniform sampler2D img;
void main() { gl_FragColor = texture2D(img, v); }`;

function setup(): GL | null {
  if (gl !== null) return gl || null;
  gl = false;
  if (typeof document === 'undefined') return null;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    // couleurs prémultipliées des deux côtés : la texture et le canevas 2D où l'on pose le rendu
    const g = c.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
    if (!g) return null;
    // WebGL sans carte graphique (rendu logiciel, Chrome sans accélération) : plus lent que le dessin par morceaux, on n'en veut pas
    const info = g.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? String(g.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    if (forced() !== 'gl' && !testing.force && SOFT.test(renderer)) return null;
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
    g.uniform1i(g.getUniformLocation(prog, 'img'), 0);
    const vbo = g.createBuffer()!;
    const ibo = g.createBuffer()!;
    g.bindBuffer(g.ARRAY_BUFFER, vbo);
    g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, ibo);
    const pos = g.getAttribLocation(prog, 'pos');
    const uv = g.getAttribLocation(prog, 'uv');
    g.enableVertexAttribArray(pos);
    g.enableVertexAttribArray(uv);
    g.vertexAttribPointer(pos, 2, g.FLOAT, false, 16, 0);
    g.vertexAttribPointer(uv, 2, g.FLOAT, false, 16, 8);
    g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false);
    g.disable(g.BLEND);
    g.clearColor(0, 0, 0, 0);
    const vp = g.getParameter(g.MAX_VIEWPORT_DIMS) as Int32Array;
    const max = Math.min(GL_MAX, g.getParameter(g.MAX_TEXTURE_SIZE) as number, vp[0]!, vp[1]!);
    const big = !!g.getExtension('OES_element_index_uint');
    // contexte perdu (mémoire de l'iPad) : les textures sont perdues avec lui, on repart de zéro à la prochaine image
    c.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      gl = null;
      for (const s of surfaces.values()) s.tex = null;
      surfaces.clear();
      used = 0;
    });
    gl = { c, g, pos, uv, vbo, ibo, max, big };
  } catch {
    gl = false;
  }
  return gl || null;
}

/** Une surface à plat gardée : sa clé (ce dont elle dépend), sa texture ou son canevas, sa taille et son dernier usage. */
interface Flat {
  key: string | null;
  tex: WebGLTexture | null;
  canvas: HTMLCanvasElement | null;
  iw: number;
  ih: number;
  bytes: number;
  at: number;
}
const surfaces = new Map<string, Flat>();
let used = 0;

/** Rend la mémoire d'une surface gardée. */
function drop(id: string) {
  const s = surfaces.get(id);
  if (!s) return;
  if (s.tex && gl) gl.g.deleteTexture(s.tex);
  if (s.canvas) s.canvas.width = s.canvas.height = 0;
  used -= s.bytes;
  surfaces.delete(id);
}
/** Tient les surfaces gardées dans leur budget : les moins récemment servies partent d'abord, jamais celle qu'on sert. */
function prune(keep: string) {
  if (used <= BUDGET) return;
  const old = [...surfaces.entries()].filter(([id]) => id !== keep).sort((a, b) => a[1].at - b[1].at);
  for (const [id] of old) {
    if (used <= BUDGET) break;
    drop(id);
  }
}
/** Oublie les surfaces des couches qui ne sont plus là (et de leurs teintes modelées). */
export function pruneWarpSurfaces(ids: Iterable<string>) {
  const live = new Set(ids);
  for (const id of [...surfaces.keys()]) if (!live.has(id.split('|')[0]!)) drop(id);
}

// la surface à plat, rendue à part avant d'être envoyée à la carte graphique ou posée par morceaux (un seul tampon, réutilisé)
let buffer: HTMLCanvasElement | null = null;
function renderFlat(iw: number, ih: number, render: FlatRender, into?: HTMLCanvasElement): { c: HTMLCanvasElement; whole: boolean } {
  const c = into ?? (buffer ??= document.createElement('canvas'));
  if (c.width !== iw || c.height !== ih) {
    c.width = iw;
    c.height = ih;
  }
  const bx = c.getContext('2d')!;
  bx.setTransform(1, 0, 0, 1, 0, 0);
  bx.clearRect(0, 0, iw, ih);
  bx.save();
  const whole = render(bx, iw, ih);
  bx.restore();
  return { c, whole };
}

/**
 * Pose la surface à plat de `id` sur le maillage, dans le repère courant de `ctx` où la boîte occupe (x0, y0, bw, bh).
 * `key` : ce dont la surface dépend (null : à refaire à chaque fois, encre fraîche) ; tant que la clé ne change pas,
 * la surface n'est pas redessinée. `iw` × `ih` : sa taille en pixels. La découpe en cours de `ctx` s'applique.
 */
export function drawFlatOnMesh(ctx: CanvasRenderingContext2D, id: string, key: string | null, iw: number, ih: number, render: FlatRender, mesh: Mesh, x0: number, y0: number, bw: number, bh: number) {
  const T = ctx.getTransform();
  const px = Math.hypot(T.a, T.b);
  if (!testing.cache) key = null;
  const G = testing.gl && forced() !== '2d' ? setup() : null;
  if (G && !G.g.isContextLost() && glDraw(G, ctx, T, id, key, iw, ih, render, mesh, x0, y0, bw, bh)) return;
  // sans carte graphique : la surface gardée dans un canevas, posée par morceaux
  let s = surfaces.get(id);
  if (s && (s.tex || !s.canvas)) {
    drop(id);
    s = undefined;
  }
  let img: HTMLCanvasElement;
  if (s && key !== null && s.key === key && s.iw === iw && s.ih === ih) img = s.canvas!;
  else if (key === null) {
    if (s) drop(id);
    img = renderFlat(iw, ih, render).c;
  } else {
    const r = renderFlat(iw, ih, render, s?.canvas ?? document.createElement('canvas'));
    img = r.c;
    if (s) used -= s.bytes;
    s = { key: r.whole ? key : null, tex: null, canvas: r.c, iw, ih, bytes: iw * ih * 4, at: 0 };
    surfaces.set(id, s);
    used += s.bytes;
  }
  if (s) s.at = performance.now();
  prune(id);
  drawWarped(ctx, img, iw, ih, mesh, x0, y0, bw, bh, px);
}

// nœuds et triangles envoyés à chaque dessin (réutilisés d'un dessin à l'autre)
let verts = new Float32Array(0);
let idx: Uint16Array | Uint32Array = new Uint16Array(0);

function glDraw(G: GL, ctx: CanvasRenderingContext2D, T: DOMMatrix, id: string, key: string | null, iw: number, ih: number, render: FlatRender, mesh: Mesh, x0: number, y0: number, bw: number, bh: number): boolean {
  const { g } = G;
  const { us, vs, P, parts } = mesh;
  const [nu, nv] = [us.length, vs.length];
  const n = nu * nv;
  if (n > 65535 && !G.big) return false;
  if (iw > G.max || ih > G.max) return false;
  // les nœuds à l'écran (pixels du canevas), et leur emprise, bornée au canevas
  if (verts.length < n * 4) verts = new Float32Array(n * 4);
  let [X0, Y0, X1, Y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const k = j * nu + i;
      const x = x0 + P[k * 2]! * bw;
      const y = y0 + P[k * 2 + 1]! * bh;
      const X = T.a * x + T.c * y + T.e;
      const Y = T.b * x + T.d * y + T.f;
      verts[k * 4] = X;
      verts[k * 4 + 1] = Y;
      verts[k * 4 + 2] = us[i]!;
      verts[k * 4 + 3] = vs[j]!;
      if (X < X0) X0 = X;
      if (X > X1) X1 = X;
      if (Y < Y0) Y0 = Y;
      if (Y > Y1) Y1 = Y;
    }
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  const bx0 = Math.max(0, Math.floor(X0) - 1);
  const by0 = Math.max(0, Math.floor(Y0) - 1);
  const W = Math.min(cw, Math.ceil(X1) + 1) - bx0;
  const H = Math.min(ch, Math.ceil(Y1) + 1) - by0;
  // hors du canevas : rien à poser
  if (!(W > 0 && H > 0)) return true;
  if (W > G.max || H > G.max) return false;
  // triangles : chaque maille en deux, même diagonale que rewarp ; une maille à cheval sur deux morceaux (deux lettres) n'est pas posée
  const cells = (nu - 1) * (nv - 1);
  if (idx.length < cells * 6 || (n > 65535 && !(idx instanceof Uint32Array))) idx = n > 65535 ? new Uint32Array(cells * 6) : new Uint16Array(cells * 6);
  let m = 0;
  for (let j = 0; j + 1 < nv; j++)
    for (let i = 0; i + 1 < nu; i++) {
      const a = j * nu + i;
      const [b, c, d] = [a + 1, a + nu + 1, a + nu];
      if (parts && !(parts[a] === parts[b] && parts[a] === parts[c] && parts[a] === parts[d])) continue;
      idx[m++] = a;
      idx[m++] = b;
      idx[m++] = c;
      idx[m++] = a;
      idx[m++] = c;
      idx[m++] = d;
    }
  // pixels du canevas → espace du rendu WebGL (le coin haut-gauche du canevas WebGL couvre l'emprise)
  if (G.c.width < W || G.c.height < H || G.c.width * G.c.height > 4 * W * H) {
    G.c.width = Math.max(W, Math.min(G.max, Math.ceil(W * 1.1)));
    G.c.height = Math.max(H, Math.min(G.max, Math.ceil(H * 1.1)));
  }
  const [GW, GH] = [G.c.width, G.c.height];
  for (let k = 0; k < n; k++) {
    verts[k * 4] = ((verts[k * 4]! - bx0) / GW) * 2 - 1;
    verts[k * 4 + 1] = 1 - ((verts[k * 4 + 1]! - by0) / GH) * 2;
  }
  // la surface à plat : gardée sur la carte graphique tant que sa clé ne change pas
  let s = surfaces.get(id);
  if (s && !s.tex) {
    drop(id);
    s = undefined;
  }
  if (!s || key === null || s.key !== key || s.iw !== iw || s.ih !== ih) {
    const r = renderFlat(iw, ih, render);
    const tex = s?.tex ?? g.createTexture();
    if (!tex) return false;
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, tex);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, r.c);
    if (s) used -= s.bytes;
    s = { key: r.whole ? key : null, tex, canvas: null, iw, ih, bytes: iw * ih * 4, at: 0 };
    surfaces.set(id, s);
    used += s.bytes;
  }
  s.at = performance.now();
  g.activeTexture(g.TEXTURE0);
  g.bindTexture(g.TEXTURE_2D, s.tex);
  // seule l'emprise est rendue : on ne vide qu'elle
  g.enable(g.SCISSOR_TEST);
  g.scissor(0, GH - H, W, H);
  g.clear(g.COLOR_BUFFER_BIT);
  g.disable(g.SCISSOR_TEST);
  // le repère du rendu : le canevas WebGL entier, l'emprise dans son coin haut-gauche
  g.viewport(0, 0, GW, GH);
  g.bindBuffer(g.ARRAY_BUFFER, G.vbo);
  g.bufferData(g.ARRAY_BUFFER, verts.subarray(0, n * 4), g.DYNAMIC_DRAW);
  g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, G.ibo);
  g.bufferData(g.ELEMENT_ARRAY_BUFFER, idx.subarray(0, m), g.DYNAMIC_DRAW);
  g.drawElements(g.TRIANGLES, m, idx instanceof Uint32Array ? g.UNSIGNED_INT : g.UNSIGNED_SHORT, 0);
  if (g.getError() !== g.NO_ERROR) {
    drop(id);
    return false;
  }
  prune(id);
  // posé d'un bloc, pixel pour pixel, dans le repère du canevas : la découpe en cours s'applique
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(G.c, 0, 0, W, H, bx0, by0, W, H);
  ctx.restore();
  return true;
}

const testing = { gl: true, cache: true, force: false };
/** Pour les tests : WebGL est-il pris, et combien de surfaces sont gardées. */
export const warpGLState = () => ({ gl: !!setup(), kept: surfaces.size, bytes: used });
/** Pour les tests et les mesures : sans WebGL (dessin par morceaux), sans surfaces gardées, ou WebGL même logiciel (`force`). */
export function warpGLTest(o: { gl?: boolean; cache?: boolean; force?: boolean }) {
  if (o.force !== undefined && o.force !== testing.force && !gl) gl = null;
  Object.assign(testing, o);
  for (const id of [...surfaces.keys()]) drop(id);
}
