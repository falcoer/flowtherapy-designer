/**
 * Vue 3D en WebGL 2 : chaque couche est une plaque découpée posée à sa hauteur, avec une vraie
 * épaisseur (des tranches empilées dont le bord s'éclaire selon son orientation), éclairée par la
 * lampe du document, qui porte de vraies ombres sur les plaques du dessous (carte d'ombre).
 * Les plaques et leurs images viennent de parallax.tsx ; ce module ne fait que les montrer.
 */

/** Une plaque à montrer : son image recadrée, sa place sur la page (unités du format), sa hauteur. */
export interface GlPlate {
  img: HTMLCanvasElement;
  /** Coin et taille sur la page, en unités du format. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Hauteur au-dessus de la feuille (0..1) et épaisseur (même unité). */
  z: number;
  t: number;
  /** La feuille : pas d'épaisseur, elle reçoit les ombres. */
  page?: boolean;
  id?: string;
}

export interface GlView {
  /** Inclinaison en degrés : [autour de l'axe vertical, autour de l'axe horizontal]. */
  tilt: [number, number];
  zoom: number;
  /** Hauteur d'une plaque à 1, en unités du format (l'écartement). */
  lift: number;
  selected?: string | null;
}

export interface GlLight {
  /** Lampe : position sur la page (0..1), hauteur (0..1), couleur. */
  x: number;
  y: number;
  z: number;
  color: [number, number, number];
}

type M4 = Float32Array;
const m4 = () => {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
};
function mul(a: M4, b: M4): M4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r]! * b[c * 4]! + a[4 + r]! * b[c * 4 + 1]! + a[8 + r]! * b[c * 4 + 2]! + a[12 + r]! * b[c * 4 + 3]!;
  return o;
}
function perspective(fovy: number, aspect: number, near: number, far: number): M4 {
  const f = 1 / Math.tan(fovy / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}
function ortho(l: number, r: number, b: number, t: number, n: number, f: number): M4 {
  const m = m4();
  m[0] = 2 / (r - l);
  m[5] = 2 / (t - b);
  m[10] = -2 / (f - n);
  m[12] = -(r + l) / (r - l);
  m[13] = -(t + b) / (t - b);
  m[14] = -(f + n) / (f - n);
  return m;
}
function translate(x: number, y: number, z: number): M4 {
  const m = m4();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}
function scale(x: number, y: number, z: number): M4 {
  const m = m4();
  m[0] = x;
  m[5] = y;
  m[10] = z;
  return m;
}
function rotX(a: number): M4 {
  const m = m4();
  const [c, s] = [Math.cos(a), Math.sin(a)];
  m[5] = c;
  m[6] = s;
  m[9] = -s;
  m[10] = c;
  return m;
}
function rotY(a: number): M4 {
  const m = m4();
  const [c, s] = [Math.cos(a), Math.sin(a)];
  m[0] = c;
  m[2] = -s;
  m[8] = s;
  m[10] = c;
  return m;
}
function lookAt(eye: [number, number, number], at: [number, number, number], up: [number, number, number]): M4 {
  const sub = (a: number[], b: number[]) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
  const norm = (a: number[]) => {
    const l = Math.hypot(a[0]!, a[1]!, a[2]!) || 1;
    return [a[0]! / l, a[1]! / l, a[2]! / l];
  };
  const cross = (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
  const z = norm(sub(eye, at));
  const x = norm(cross(up, z));
  const y = cross(z, x);
  const m = m4();
  m[0] = x[0]!;
  m[4] = x[1]!;
  m[8] = x[2]!;
  m[1] = y[0]!;
  m[5] = y[1]!;
  m[9] = y[2]!;
  m[2] = z[0]!;
  m[6] = z[1]!;
  m[10] = z[2]!;
  m[12] = -(x[0]! * eye[0] + x[1]! * eye[1] + x[2]! * eye[2]);
  m[13] = -(y[0]! * eye[0] + y[1]! * eye[1] + y[2]! * eye[2]);
  m[14] = -(z[0]! * eye[0] + z[1]! * eye[1] + z[2]! * eye[2]);
  return m;
}

/* Repère du monde : x vers la droite, y vers le haut de la page, z vers l'œil ; la feuille en z = 0. */

const VS = `#version 300 es
layout(location=0) in vec2 aUv;
uniform mat4 uProj, uView;
uniform vec4 uRect;   // x, y, w, h sur la page (y vers le bas)
uniform vec2 uPage;   // largeur, hauteur de la page
uniform float uZ;
out vec2 vUv;
out vec3 vPos;
void main() {
  vUv = aUv;
  vec2 p = uRect.xy + aUv * uRect.zw;
  vPos = vec3(p.x - uPage.x * 0.5, uPage.y * 0.5 - p.y, uZ);
  gl_Position = uProj * uView * vec4(vPos, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vUv;
in vec3 vPos;
uniform sampler2D uTex;
uniform highp sampler2DShadow uShadow;
uniform mat4 uLightMat;
uniform vec3 uLightPos;
uniform vec3 uLightColor;
uniform vec2 uTexel;
// 0 : dessus de la plaque ; 1 : tranche (sa profondeur 0..1 dans uDepth)
uniform float uWall, uDepth, uSel, uShadowOn, uPageMode;
out vec4 outColor;

float alphaAt(vec2 uv) { return texture(uTex, uv).a; }

float shadowAt(vec3 p) {
  if (uShadowOn < 0.5) return 1.0;
  vec4 q = uLightMat * vec4(p, 1.0);
  vec3 s = q.xyz / q.w * 0.5 + 0.5;
  if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0) return 1.0;
  // pénombre : plus l'objet est loin au-dessus, plus l'ombre est floue (filtrage 5×5)
  vec2 ts = vec2(1.0) / vec2(textureSize(uShadow, 0));
  float sum = 0.0;
  for (int j = -2; j <= 2; j++)
    for (int i = -2; i <= 2; i++)
      sum += texture(uShadow, vec3(s.xy + vec2(i, j) * ts * 1.6, s.z - 0.0025));
  return sum / 25.0;
}

void main() {
  vec4 c = texture(uTex, vUv);
  vec3 L = normalize(uLightPos - vPos);
  if (uWall > 0.5) {
    if (c.a < 0.5) discard;
    // orientation du bord : la pente de l'opacité, mesurée quelques pixels autour
    float r = 3.0;
    float gx = alphaAt(vUv + vec2(uTexel.x * r, 0.0)) - alphaAt(vUv - vec2(uTexel.x * r, 0.0));
    float gy = alphaAt(vUv + vec2(0.0, uTexel.y * r)) - alphaAt(vUv - vec2(0.0, uTexel.y * r));
    vec2 g = vec2(-gx, gy);
    float gl = length(g);
    vec3 n = gl > 0.001 ? normalize(vec3(g / gl, 0.0)) : vec3(0.0, 0.0, 1.0);
    float diff = max(dot(n, L), 0.0);
    // carton découpé : la couleur de la couche, assombrie vers le bas de la tranche
    vec3 base = c.rgb / max(c.a, 0.001);
    vec3 col = base * (0.42 + 0.5 * diff * shadowAt(vPos)) * (0.8 + 0.2 * uDepth) * uLightColor;
    outColor = vec4(col, 1.0);
    return;
  }
  if (c.a < 0.004) discard;
  vec3 base = c.rgb / max(c.a, 0.001);
  // dessus : l'image porte déjà son relief éclairé ; la lumière y ajoute l'ombre portée
  float sh = shadowAt(vPos);
  vec3 col = base * mix(0.6, 1.0, sh);
  if (uSel > 0.5) {
    // objet choisi : un liseré couleur d'accent sur son contour
    float r = 2.5;
    float edge = 0.0;
    edge += abs(alphaAt(vUv + vec2(uTexel.x * r, 0.0)) - c.a);
    edge += abs(alphaAt(vUv - vec2(uTexel.x * r, 0.0)) - c.a);
    edge += abs(alphaAt(vUv + vec2(0.0, uTexel.y * r)) - c.a);
    edge += abs(alphaAt(vUv - vec2(0.0, uTexel.y * r)) - c.a);
    col = mix(col, vec3(0.49, 0.36, 1.0), clamp(edge * 1.5, 0.0, 0.9));
  }
  outColor = vec4(col * c.a, c.a);
}`;

const SVS = `#version 300 es
layout(location=0) in vec2 aUv;
uniform mat4 uLightMat;
uniform vec4 uRect;
uniform vec2 uPage;
uniform float uZ;
out vec2 vUv;
void main() {
  vUv = aUv;
  vec2 p = uRect.xy + aUv * uRect.zw;
  gl_Position = uLightMat * vec4(p.x - uPage.x * 0.5, uPage.y * 0.5 - p.y, uZ, 1.0);
}`;
const SFS = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uTex;
out vec4 o;
void main() { if (texture(uTex, vUv).a < 0.5) discard; o = vec4(1.0); }`;

const PVS = SVS.replace('uLightMat', 'uMat').replace('uLightMat', 'uMat');
const PFS = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec4 uId;
out vec4 o;
void main() { if (texture(uTex, vUv).a < 0.1) discard; o = uId; }`;

function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const p = gl.createProgram()!;
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ] as const) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  const u = new Map<string, WebGLUniformLocation | null>();
  return { p, u: (n: string) => (u.has(n) ? u.get(n)! : (u.set(n, gl.getUniformLocation(p, n)), u.get(n)!)) };
}

/** Tranches d'une plaque : assez pour que le bord paraisse plein, même très incliné. */
const WALL = 18;
const SHADOW = 2048;

export function hasWebGL2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

export class Gl3d {
  private gl: WebGL2RenderingContext;
  private main;
  private shadow;
  private pick;
  private vao: WebGLVertexArrayObject;
  private shadowTex: WebGLTexture;
  private shadowFb: WebGLFramebuffer;
  private plates: Array<GlPlate & { tex: WebGLTexture }> = [];
  private page: [number, number] = [1, 1];
  light: GlLight = { x: 0.2, y: 0.1, z: 0.5, color: [1, 1, 1] };

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true, premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL 2 indisponible');
    this.gl = gl;
    this.main = compile(gl, VS, FS);
    this.shadow = compile(gl, SVS, SFS);
    this.pick = compile(gl, PVS, PFS);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    // carte d'ombre : la profondeur vue depuis la lampe
    this.shadowTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SHADOW, SHADOW);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.shadowFb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  setPlates(page: [number, number], plates: GlPlate[]) {
    const gl = this.gl;
    for (const p of this.plates) gl.deleteTexture(p.tex);
    this.page = page;
    this.plates = plates.map((p) => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, p.img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return { ...p, tex };
    });
  }

  /** Hauteur et épaisseur d'une plaque (réglage en direct). */
  setLevel(id: string, z: number, t: number) {
    for (const p of this.plates) if (p.id === id) Object.assign(p, { z, t });
  }

  private matrices(v: GlView) {
    const { width: W, height: H } = this.canvas;
    const [pw, ph] = this.page;
    const fit = Math.min((W * 0.72) / pw, (H * 0.7) / ph);
    // même perspective que la vue CSS : l'œil à 1800 px de l'écran
    const D = 1800 * (window.devicePixelRatio || 1);
    const proj = perspective(2 * Math.atan(H / 2 / D), W / H, D * 0.05, D * 4);
    const view = mul(translate(0, 0, -D), mul(scale(fit * v.zoom, fit * v.zoom, fit * v.zoom), mul(rotX((-v.tilt[1] * Math.PI) / 180), rotY((v.tilt[0] * Math.PI) / 180))));
    return { proj, view };
  }

  private lightMatrix(lift: number) {
    const [pw, ph] = this.page;
    const m = Math.min(pw, ph);
    const L = this.light;
    // lampe : au-dessus de la page, d'autant plus haute que z est grand
    const pos: [number, number, number] = [(L.x - 0.5) * pw, (0.5 - L.y) * ph, (0.15 + L.z * 1.6) * m];
    const dir = [-pos[0], -pos[1], -pos[2]];
    const len = Math.hypot(dir[0]!, dir[1]!, dir[2]!);
    const R = Math.hypot(pw, ph) * 0.75 + lift;
    const eye: [number, number, number] = [(-dir[0]! / len) * R * 2, (-dir[1]! / len) * R * 2, (-dir[2]! / len) * R * 2];
    const view = lookAt(eye, [0, 0, 0], Math.abs(dir[2]! / len) > 0.99 ? [0, 1, 0] : [0, 0, 1]);
    return { mat: mul(ortho(-R, R, -R, R, R * 0.5, R * 3.5), view), pos };
  }

  private drawQuad(prog: { u: (n: string) => WebGLUniformLocation | null }, p: GlPlate, z: number) {
    const gl = this.gl;
    gl.uniform4f(prog.u('uRect'), p.x, p.y, p.w, p.h);
    gl.uniform1f(prog.u('uZ'), z);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  render(v: GlView) {
    const gl = this.gl;
    const { width: W, height: H } = this.canvas;
    const lm = this.lightMatrix(v.lift);
    gl.bindVertexArray(this.vao);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    // 1. carte d'ombre : chaque plaque (dessus et tranches) vue depuis la lampe
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFb);
    gl.viewport(0, 0, SHADOW, SHADOW);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.colorMask(false, false, false, false);
    gl.useProgram(this.shadow.p);
    gl.uniformMatrix4fv(this.shadow.u('uLightMat'), false, lm.mat);
    gl.uniform2f(this.shadow.u('uPage'), this.page[0], this.page[1]);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.shadow.u('uTex'), 0);
    for (const p of this.plates) {
      if (p.page) continue;
      gl.bindTexture(gl.TEXTURE_2D, p.tex);
      this.drawQuad(this.shadow, p, p.z * v.lift);
      this.drawQuad(this.shadow, p, Math.max(0.0005, p.z - p.t) * v.lift);
    }
    gl.colorMask(true, true, true, true);

    // 2. la scène
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const { proj, view } = this.matrices(v);
    const P = this.main;
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.u('uProj'), false, proj);
    gl.uniformMatrix4fv(P.u('uView'), false, view);
    gl.uniformMatrix4fv(P.u('uLightMat'), false, lm.mat);
    gl.uniform3f(P.u('uLightPos'), ...lm.pos);
    gl.uniform3f(P.u('uLightColor'), ...this.light.color);
    gl.uniform2f(P.u('uPage'), this.page[0], this.page[1]);
    gl.uniform1i(P.u('uTex'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.uniform1i(P.u('uShadow'), 1);
    gl.activeTexture(gl.TEXTURE0);
    // les tranches d'abord (pleines), puis les dessus du plus bas au plus haut (bords adoucis)
    gl.disable(gl.BLEND);
    gl.uniform1f(P.u('uWall'), 1);
    gl.uniform1f(P.u('uSel'), 0);
    for (const p of this.plates) {
      if (p.page || p.t <= 0) continue;
      gl.bindTexture(gl.TEXTURE_2D, p.tex);
      gl.uniform2f(P.u('uTexel'), 1 / p.img.width, 1 / p.img.height);
      const z1 = p.z * v.lift;
      const z0 = Math.max(0.0005, p.z - p.t) * v.lift;
      // la tranche ne se fait pas d'ombre à elle-même : seule l'orientation de son bord compte
      gl.uniform1f(P.u('uShadowOn'), 0);
      for (let j = 0; j < WALL; j++) {
        const u = j / WALL;
        gl.uniform1f(P.u('uDepth'), u);
        this.drawQuad(P, p, z0 + (z1 - z0) * u);
      }
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1f(P.u('uWall'), 0);
    const order = [...this.plates].sort((a, b) => a.z - b.z);
    order.forEach((p, i) => {
      gl.bindTexture(gl.TEXTURE_2D, p.tex);
      gl.uniform2f(P.u('uTexel'), 1 / p.img.width, 1 / p.img.height);
      gl.uniform1f(P.u('uSel'), p.id && p.id === v.selected ? 1 : 0);
      gl.uniform1f(P.u('uShadowOn'), 1);
      // à hauteur égale, l'ordre des couches départage (un soupçon de hauteur)
      this.drawQuad(P, p, p.z * v.lift + i * 0.0004 * Math.min(...this.page));
    });
    gl.disable(gl.BLEND);
  }

  /** L'objet sous un point du canevas (pixels du canevas) : on rend les plaques en couleurs d'identité. */
  pickAt(x: number, y: number, v: GlView): string | null {
    const gl = this.gl;
    const { width: W, height: H } = this.canvas;
    const fb = gl.createFramebuffer()!;
    const col = gl.createRenderbuffer()!;
    const dep = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, col);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, W, H);
    gl.bindRenderbuffer(gl.RENDERBUFFER, dep);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, col);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, dep);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    const { proj, view } = this.matrices(v);
    const P = this.pick;
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.u('uMat'), false, mul(proj, view));
    gl.uniform2f(P.u('uPage'), this.page[0], this.page[1]);
    gl.uniform1i(P.u('uTex'), 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(this.vao);
    const order = [...this.plates].sort((a, b) => a.z - b.z);
    order.forEach((p, i) => {
      if (p.page) return;
      gl.bindTexture(gl.TEXTURE_2D, p.tex);
      const k = this.plates.indexOf(p) + 1;
      gl.uniform4f(P.u('uId'), (k & 255) / 255, ((k >> 8) & 255) / 255, 0, 1);
      // le dessus et la tranche comptent tous les deux
      this.drawQuad(P, p, p.z * v.lift + i * 0.0004 * Math.min(...this.page));
      this.drawQuad(P, p, Math.max(0.0005, p.z - p.t) * v.lift);
    });
    const px = new Uint8Array(4);
    gl.readPixels(Math.round(x), Math.round(H - y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    gl.deleteRenderbuffer(col);
    gl.deleteRenderbuffer(dep);
    const k = px[0]! + px[1]! * 256;
    return k ? (this.plates[k - 1]?.id ?? null) : null;
  }

  dispose() {
    const gl = this.gl;
    for (const p of this.plates) gl.deleteTexture(p.tex);
    gl.deleteTexture(this.shadowTex);
    gl.deleteFramebuffer(this.shadowFb);
    this.plates = [];
  }
}
