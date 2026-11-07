import { guideColor, type Guide, type Pt, type Stroke } from './model';
import { stampOf, stampPaths, type StampDef } from './stamps';

/**
 * Pinceau aquarelle. Un trait se rend en trois passes :
 * 1. une silhouette aux bords irréguliers (tampons ronds le long du trait,
 *    rayon modulé par la pression et un bruit doux) ;
 * 2. un lavis transparent de cette silhouette ;
 * 3. un liseré plus foncé sur les bords, là où le pigment s'accumule en séchant.
 * Le grain du papier creuse ensuite le lavis. Les traits se superposent en
 * mode « produit » : deux passages foncent, comme de vraies couches d'eau.
 */

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let grain: HTMLCanvasElement | null = null;
/** Grain de papier : bruit doux répété. */
function paperGrain(): HTMLCanvasElement {
  if (grain) return grain;
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(160, 160);
  const r = rng(7);
  for (let i = 0; i < 160 * 160; i++) {
    const v = r();
    img.data[i * 4 + 3] = v > 0.55 ? Math.round((v - 0.55) * 300) : 0;
  }
  ctx.putImageData(img, 0, 0);
  // adoucit le grain
  const s = document.createElement('canvas');
  s.width = s.height = 160;
  const sx = s.getContext('2d')!;
  sx.filter = 'blur(0.7px)';
  sx.drawImage(c, 0, 0);
  grain = s;
  return s;
}

const scratch = { a: null as HTMLCanvasElement | null, b: null as HTMLCanvasElement | null, c: null as HTMLCanvasElement | null, d: null as HTMLCanvasElement | null };
let canFilter: boolean | null = null;
/** Le flou des canevas (ctx.filter) : absent de Safari, donc de l'iPad. */
function filterOK() {
  if ((globalThis as { __ftdNoFilter?: boolean }).__ftdNoFilter) return false;
  if (canFilter === null) {
    const x = document.createElement('canvas').getContext('2d')!;
    x.filter = 'blur(2px)';
    canFilter = x.filter === 'blur(2px)';
  }
  return canFilter;
}
const shrink: { a: HTMLCanvasElement | null; b: HTMLCanvasElement | null } = { a: null, b: null };
/**
 * Dessine src flouté d'environ r px, avec l'opacité et le mode de fusion du contexte.
 * Sans ctx.filter (Safari) : réduction, moyenne des voisins, puis agrandissement lissé.
 */
export function drawBlurred(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, r: number) {
  if (r < 0.4) {
    ctx.drawImage(src, 0, 0);
    return;
  }
  if (filterOK()) {
    const f = ctx.filter;
    ctx.filter = `blur(${r}px)`;
    ctx.drawImage(src, 0, 0);
    ctx.filter = f;
    return;
  }
  const k = Math.max(1, r / 1.6);
  const P = 3; // marge : le flou déborde de la forme
  const sw = Math.max(1, Math.ceil(src.width / k)) + 2 * P;
  const sh = Math.max(1, Math.ceil(src.height / k)) + 2 * P;
  const grab = (key: 'a' | 'b') => {
    const c = (shrink[key] ??= document.createElement('canvas'));
    if (c.width !== sw || c.height !== sh) {
      c.width = sw;
      c.height = sh;
    }
    const x = c.getContext('2d')!;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.clearRect(0, 0, sw, sh);
    return { c, x };
  };
  const A = grab('a');
  A.x.drawImage(src, P, P, src.width / k, src.height / k);
  // deux passes de moyenne 3×3 : un flou presque gaussien
  const B = grab('b');
  const box = (from: HTMLCanvasElement, to: CanvasRenderingContext2D) => {
    to.globalCompositeOperation = 'lighter';
    to.globalAlpha = 1 / 9;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) to.drawImage(from, dx, dy);
    to.globalCompositeOperation = 'source-over';
    to.globalAlpha = 1;
  };
  box(A.c, B.x);
  A.x.clearRect(0, 0, sw, sh);
  box(B.c, A.x);
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(A.c, -P * k, -P * k, sw * k, sh * k);
  ctx.imageSmoothingEnabled = smooth;
}

function buffer(key: 'a' | 'b' | 'c' | 'd', w: number, h: number) {
  let c = scratch[key];
  if (!c) c = scratch[key] = document.createElement('canvas');
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const ctx = c.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.clearRect(0, 0, w, h);
  return { c, ctx };
}

export interface Target {
  /** Taille du canevas de peinture de la couche, en pixels. */
  pw: number;
  ph: number;
  /** Pixels par unité du petit côté du format (pour convertir le rayon). */
  pxPerMin: number;
}

/** Allongement de la touche d'un pinceau couché, à inclinaison maximale (0.9) : presque deux fois plus longue. */
export const LEAN = 1.2;
/** Étire un décalage (dx, dy) dans la direction d, du facteur 1 + K. */
function stretch(dx: number, dy: number, K: number, d: number): [number, number] {
  if (!K) return [dx, dy];
  const c = Math.cos(d);
  const s = Math.sin(d);
  const along = (dx * c + dy * s) * K;
  return [dx + along * c, dy + along * s];
}

/** Tampons d'un trait : position en pixels, rayon, position relative le long du trait, et pinceau penché (K, d). */
function stamps(s: Stroke, t: Target) {
  const r = rng(s.seed);
  const out: Array<{ x: number; y: number; r: number; t: number; a: number; K: number; d: number }> = [];
  const pts = s.pts.map((p) => ({ x: p.x * t.pw, y: p.y * t.ph, p: p.p ?? 0.6, a: p.r ?? 0, K: s.brush === 'stamp' ? 0 : (p.k ?? 0) * LEAN, d: p.d ?? 0 }));
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  let along = 0;
  const base = s.size * t.pxPerMin;
  let phase = r() * 10;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[i + 1] ?? a;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const rad0 = base * (0.35 + 0.65 * a.p);
    const step = Math.max(1, rad0 * 0.22);
    const n = Math.max(1, Math.ceil(d / step));
    for (let k = 0; k < n; k++) {
      const f = k / n;
      phase += 0.21;
      const wobble = 1 + 0.16 * Math.sin(phase) + 0.1 * Math.sin(phase * 2.7 + 1) + (r() - 0.5) * 0.14;
      const p = a.p + (b.p - a.p) * f;
      out.push({
        x: a.x + (b.x - a.x) * f + (r() - 0.5) * rad0 * 0.25,
        y: a.y + (b.y - a.y) * f + (r() - 0.5) * rad0 * 0.25,
        r: base * (0.35 + 0.65 * p) * wobble,
        t: total ? (along + d * f) / total : 0,
        a: a.a + (b.a - a.a) * f,
        K: a.K + (b.K - a.K) * f,
        d: a.d,
      });
      if (d === 0) break;
    }
    along += d;
  }
  return out;
}

/** Empreinte de la brosse : ronde, plate (lame fine) ou triangle, tournée de `a` ; penchée, elle s'allonge vers `d`. */
function tipShape(ctx: CanvasRenderingContext2D, tip: Stroke['tip'], x: number, y: number, r: number, a: number, K = 0, d = 0) {
  ctx.beginPath();
  if (!tip || tip === 'round') {
    if (K) ctx.ellipse(x, y, r * (1 + K), r, d, 0, Math.PI * 2);
    else ctx.arc(x, y, r, 0, Math.PI * 2);
    return;
  }
  const c = Math.cos(a);
  const s = Math.sin(a);
  const pts =
    tip === 'flat'
      ? [
          [-r, -r * 0.16],
          [r, -r * 0.16],
          [r, r * 0.16],
          [-r, r * 0.16],
        ]
      : [0, 1, 2].map((k) => [Math.cos(-Math.PI / 2 + (k * 2 * Math.PI) / 3) * r, Math.sin(-Math.PI / 2 + (k * 2 * Math.PI) / 3) * r]);
  pts.forEach(([px, py], i) => {
    const [ox, oy] = stretch(px! * c - py! * s, px! * s + py! * c, K, d);
    if (i) ctx.lineTo(x + ox, y + oy);
    else ctx.moveTo(x + ox, y + oy);
  });
  ctx.closePath();
}

/** Rend un trait dans le canevas de peinture d'une couche, selon son mode de projection. */
export function paintStroke(dst: CanvasRenderingContext2D, s: Stroke, guides: Guide[], t: Target) {
  switch (s.brush) {
    case 'acrylic':
      return acrylic(dst, s, guides, t);
    case 'roller':
      return roller(dst, s, guides, t);
    case 'spray':
      return spray(dst, s, guides, t);
    case 'glitter':
      return glitter(dst, s, guides, t);
    case 'hair':
      return hair(dst, s, guides, t);
    case 'stamp':
      return stampInk(dst, s, guides, t);
    case 'branch':
      return branchInk(dst, s, guides, t);
    case 'burn':
      // la brûlure ne peint pas : elle consume la couche (voir burnFor)
      return;
    default:
      return aquarelle(dst, s, guides, t);
  }
}

function aquarelle(dst: CanvasRenderingContext2D, s: Stroke, guides: Guide[], t: Target) {
  paintWash(dst, [s], guides, t);
}

/**
 * Une passe d'aquarelle sur papier mouillé : tous ses traits se déposent dans la même eau.
 * Les pigments fusent l'un dans l'autre (les couleurs se mêlent en dégradé), les recouvrements ne
 * foncent pas, et un seul liseré borde l'ensemble. Seule, elle rend un trait d'aquarelle ordinaire.
 */
export function paintWash(dst: CanvasRenderingContext2D, list: Stroke[], guides: Guide[], t: Target) {
  const s = list[list.length - 1]!;
  const wet = list.length > 1;
  const { c: sil, ctx: sx } = buffer('a', t.pw, t.ph);
  const Rw = Math.max(...list.map((w) => w.size)) * t.pxPerMin;
  list.forEach((w, i) => {
    const g = guides[w.guide];
    // chaque trait dans sa propre eau, puis versé dans la tache commune
    const one = wet ? buffer('d', t.pw, t.ph) : { c: sil, ctx: sx };
    for (const st of stamps(w, t)) {
      one.ctx.fillStyle = guideColor(g, st.t);
      tipShape(one.ctx, w.tip, st.x, st.y, Math.max(0.5, st.r), st.a, st.K, st.d);
      one.ctx.fill();
    }
    if (!wet) return;
    if (i === 0) {
      sx.drawImage(one.c, 0, 0);
      return;
    }
    // là où l'eau est déjà colorée, les deux pigments se partagent la place (moyenne, pas recouvrement) ;
    // ailleurs le nouveau trait se pose tel quel
    sx.save();
    sx.globalCompositeOperation = 'source-atop';
    sx.globalAlpha = 1 / (1 + Math.min(i, 1));
    sx.drawImage(one.c, 0, 0);
    sx.globalCompositeOperation = 'destination-over';
    sx.globalAlpha = 1;
    sx.drawImage(one.c, 0, 0);
    sx.restore();
  });
  if (wet) {
    // les pigments migrent dans l'eau : la couleur se brouille à l'intérieur de la tache (sa forme ne bouge pas)
    const { c: mix, ctx: mx } = buffer('c', t.pw, t.ph);
    drawBlurred(mx, sil, Math.max(3, Rw * 0.9));
    // le flou dilue la couleur vers les bords : on la renforce pour garder la teinte pleine
    mx.globalCompositeOperation = 'source-over';
    mx.drawImage(mix, 0, 0);
    sx.save();
    sx.globalCompositeOperation = 'source-atop';
    sx.drawImage(mix, 0, 0);
    sx.restore();
  }
  // grain : le pigment se dépose moins dans les creux du papier
  sx.globalCompositeOperation = 'destination-out';
  sx.globalAlpha = 0.35;
  sx.fillStyle = sx.createPattern(paperGrain(), 'repeat')!;
  sx.fillRect(0, 0, t.pw, t.ph);

  // peu d'intensité : plus d'eau, le pigment s'étale et se concentre sur les bords (comme la dilution des tampons)
  const opacity = list.reduce((a, w) => a + w.opacity, 0) / list.length;
  const water = Math.max(0, Math.min(1, 1 - opacity + (wet ? 0.15 : 0)));
  const R = Math.max(...list.map((w) => w.size)) * t.pxPerMin;
  // liseré : silhouette moins sa version floutée
  const { c: edge, ctx: ex } = buffer('b', t.pw, t.ph);
  ex.drawImage(sil, 0, 0);
  ex.globalCompositeOperation = 'destination-out';
  drawBlurred(ex, sil, Math.max(1, R * (0.18 + 0.22 * water)));

  dst.save();
  dst.globalCompositeOperation = 'multiply';
  dst.globalAlpha = 0.42 * opacity;
  drawBlurred(dst, sil, water > 0.05 ? R * 0.12 * water : 0);
  dst.globalAlpha = 0.75 * Math.min(1, opacity + 0.3 * water);
  dst.drawImage(edge, 0, 0);
  dst.restore();
}

let tmpStamp: HTMLCanvasElement | null = null;
/** Petit canevas de travail d'une empreinte, vidé. */
function stampTmp(S: number) {
  const c = (tmpStamp ??= document.createElement('canvas'));
  if (c.width < S || c.height < S || c.width > S * 2) {
    c.width = S;
    c.height = S;
  }
  const x = c.getContext('2d')!;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalCompositeOperation = 'source-over';
  x.globalAlpha = 1;
  x.clearRect(0, 0, c.width, c.height);
  return c;
}

/**
 * Semis : des copies du motif éparpillées autour du geste, à intervalles irréguliers.
 * Chacune suit le sens du pinceau, varie un peu en taille et en angle, et penche au hasard
 * comme si elle était posée sur une surface qui fuit.
 */
function sowPrints(s: Stroke, t: Target, r: () => number, def: StampDef) {
  const o = s.sow!;
  const base = s.size * t.pxPerMin * 2;
  const out: Array<Pt & { R: number; flip?: boolean }> = [];
  const rot0 = s.pts[0]?.r ?? 0;
  const ahead = def.ahead ?? 0;
  let foot = 0;
  // pas entre deux copies : serré à forte densité
  const gap = base * (1.6 - 1.4 * o.density);
  let next = 0;
  let L = 0;
  const pts = s.pts;
  const put = (x: number, y: number, dir: number, p: number) => {
    // traces de pas : en file, gauche puis droite, à peine irrégulières
    const pair = !!def.pair;
    const side = pair ? (foot++ % 2 ? 1 : -1) : 0;
    const R = base * (0.75 + 0.35 * p) * (pair ? 0.95 + 0.1 * r() : 0.6 + 0.6 * r());
    const off = pair ? side * (0.25 + o.spread) * base * 0.8 + (r() - 0.5) * base * 0.1 : (r() - 0.5) * 2 * o.spread * base * 1.6;
    const along = (r() - 0.5) * gap * (pair ? 0.1 : 0.6);
    const px = x + Math.cos(dir) * along - Math.sin(dir) * off;
    const py = y + Math.sin(dir) * along + Math.cos(dir) * off;
    const k = o.persp * (0.25 + 0.75 * r());
    out.push({ x: px / t.pw, y: py / t.ph, p, R, r: dir - ahead + rot0 + (r() - 0.5) * (pair ? 0.25 : 0.5), k: k > 0.02 ? Math.min(0.9, k) : undefined, d: r() * Math.PI * 2, flip: side > 0 });
  };
  if (pts.length === 1) {
    put(pts[0]!.x * t.pw, pts[0]!.y * t.ph, 0, pts[0]!.p ?? 0.7);
    return out;
  }
  for (let j = 1; j < pts.length; j++) {
    const a = pts[j - 1]!;
    const b = pts[j]!;
    const ax = a.x * t.pw;
    const ay = a.y * t.ph;
    const dx = b.x * t.pw - ax;
    const dy = b.y * t.ph - ay;
    const seg = Math.hypot(dx, dy);
    if (seg < 1e-6) continue;
    const dir = Math.atan2(dy, dx);
    while (next <= L + seg) {
      const u = (next - L) / seg;
      put(ax + dx * u, ay + dy * u, dir, (a.p ?? 0.7) + ((b.p ?? 0.7) - (a.p ?? 0.7)) * u);
      next += def.pair ? gap * (0.95 + 0.1 * r()) : gap * (0.6 + 0.8 * r());
    }
    L += seg;
  }
  return out;
}

const warpA = document.createElement('canvas');
const warpB = document.createElement('canvas');
/** Déforme l'empreinte (carré S×S au coin de c) en perspective vers la direction d, de force k (0..1). */
function perspective(c: HTMLCanvasElement, S: number, d: number, k: number) {
  for (const w of [warpA, warpB]) {
    if (w.width !== S || w.height !== S) {
      w.width = S;
      w.height = S;
    }
  }
  const a = warpA.getContext('2d')!;
  a.setTransform(1, 0, 0, 1, 0, 0);
  a.clearRect(0, 0, S, S);
  a.translate(S / 2, S / 2);
  a.rotate(-d);
  a.translate(-S / 2, -S / 2);
  a.drawImage(c, 0, 0, S, S, 0, 0, S, S);
  const b = warpB.getContext('2d')!;
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.clearRect(0, 0, S, S);
  const squash = 1 - 0.55 * k;
  const taper = 0.45 * k;
  const h = S / 2;
  const col = Math.max(1, Math.round(S / 64));
  for (let x = 0; x < S; x += col) {
    const u = (x + col / 2 - h) / h; // -1 côté proche, +1 côté qui fuit
    const v = 1 - taper * u;
    const nx = h + (x - h) * squash * (1 - taper * 0.5 * u);
    b.drawImage(warpA, x, 0, col, S, nx, h - h * v, col * squash + 0.6, S * v);
  }
  const x = c.getContext('2d')!;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.clearRect(0, 0, S, S);
  x.translate(S / 2, S / 2);
  x.rotate(d);
  x.translate(-S / 2, -S / 2);
  x.drawImage(warpB, 0, 0);
  x.setTransform(1, 0, 0, 1, 0, 0);
}

/**
 * Tampon encré : le motif est posé à chaque point du geste, à la couleur courante.
 * Diluée, l'encre s'étale et s'éclaircit, le grain du papier la boit et
 * le pigment se dépose sur les bords en séchant.
 */
function stampInk(dst: CanvasRenderingContext2D, s: Stroke, guides: Guide[], t: Target) {
  const def = stampOf(s.stamp);
  const ps = stampPaths(def);
  const g = guides[s.guide];
  const dil = Math.max(0, Math.min(1, s.dilution ?? 0));
  const r = rng(s.seed);
  const { c: sil, ctx: sx } = buffer('a', t.pw, t.ph);
  const sow = s.sow;
  const wipe = s.wipe && !sow;
  const prints: Array<Pt & { R: number; flip?: boolean }> = sow ? sowPrints(s, t, r, def) : (wipe ? s.pts.slice(0, 1) : s.pts).map((p) => ({ ...p, R: s.size * t.pxPerMin * 2 * (0.75 + 0.35 * (p.p ?? 0.7)) }));
  const n = prints.length;
  let big = 0;
  prints.forEach((p, i) => {
    const R = p.R;
    big = Math.max(big, R);
    const k = R / Math.max(def.w, def.h);
    // la rotation du stylet oriente le tampon ; sans elle, un léger hasard
    const jitter = (r() - 0.5) * 0.35;
    const ang = p.r ?? jitter;
    // chaque empreinte se forme à part : penché, le tampon n'imprime franchement que d'un côté
    const S = Math.ceil(R * 1.6) + 2;
    const tmp = stampTmp(S);
    const sx0 = sx;
    {
      const sx = tmp.getContext('2d')!;
      sx.save();
      sx.translate(S / 2, S / 2);
      sx.rotate(ang);
      sx.scale(p.flip ? -k : k, k);
      sx.translate(-def.w / 2, -def.h / 2);
      // un dégradé traverse le motif ; le long d'une traînée, chaque tampon prend sa teinte
      let style: string | CanvasGradient = guideColor(g, n > 1 ? i / (n - 1) : 0);
      if (g?.type === 'gradient' && (n === 1 || s.filled)) {
        const lg = sx.createLinearGradient(0, 0, def.w, 0);
        for (let q = 0; q <= 8; q++) lg.addColorStop(q / 8, guideColor(g, q / 8));
        style = lg;
      }
      def.parts.forEach((part, j) => {
        sx.globalAlpha = (part.alpha ?? 1) * (0.92 + 0.08 * r());
        if (part.fill) {
          sx.fillStyle = style;
          sx.fill(ps[j]!);
        } else {
          // rempli : le trait referme sa forme et la peint
          if (s.filled) {
            sx.fillStyle = style;
            sx.globalAlpha *= 0.85;
            sx.fill(ps[j]!, 'evenodd');
            sx.globalAlpha /= 0.85;
          }
          sx.strokeStyle = style;
          sx.lineWidth = part.width ?? 4;
          sx.lineCap = 'round';
          sx.lineJoin = 'round';
          sx.stroke(ps[j]!);
        }
      });
      sx.restore();
      // penché, le tampon se met en perspective : écrasé dans le sens où le crayon penche,
      // et plus petit de ce côté-là, comme un motif posé sur une surface qui fuit (un bras, une joue)
      if (p.k) perspective(tmp, S, p.d ?? 0, p.k);
    }
    sx0.drawImage(tmp, 0, 0, S, S, p.x * t.pw - S / 2, p.y * t.ph - S / 2, S, S);
    // essuyé : le tampon glisse sans quitter le papier, l'encre s'étire et s'épuise le long du geste
    if (wipe && s.pts.length > 1) {
      const x0 = p.x * t.pw;
      const y0 = p.y * t.ph;
      const step = Math.max(1, R * 0.035);
      let L = 0;
      let carry = 0;
      for (let j = 1; j < s.pts.length; j++) {
        const a = s.pts[j - 1]!;
        const b = s.pts[j]!;
        const ax = a.x * t.pw;
        const ay = a.y * t.ph;
        const seg = Math.hypot(b.x * t.pw - ax, b.y * t.ph - ay);
        for (let d = carry; d < seg; d += step) {
          const u = d / seg;
          const cx = ax + (b.x * t.pw - ax) * u;
          const cy = ay + (b.y * t.ph - ay) * u;
          const ink = Math.exp(-(L + d) / (R * 1.1));
          if (ink < 0.02) break;
          sx0.globalAlpha = 0.16 * ink * (0.8 + 0.4 * r());
          sx0.drawImage(tmp, 0, 0, S, S, cx - S / 2 + (cx - x0) * 0.04, cy - S / 2 + (cy - y0) * 0.04, S, S);
        }
        carry = Math.max(0, carry + Math.ceil((seg - carry) / step) * step - seg);
        L += seg;
      }
      sx0.globalAlpha = 1;
    }
  });
  sx.globalAlpha = 1;
  // encre pressée : le papier ne prend pas tout, même pleine
  sx.globalCompositeOperation = 'destination-out';
  sx.globalAlpha = 0.18 + 0.6 * dil;
  sx.fillStyle = sx.createPattern(paperGrain(), 'repeat')!;
  sx.fillRect(0, 0, t.pw, t.ph);
  sx.globalCompositeOperation = 'source-over';
  sx.globalAlpha = 1;
  dst.save();
  if (dil > 0.02) {
    // l'eau étale l'encre : un lavis flou plus clair, et un liseré sur les bords
    const { c: wash, ctx: wx } = buffer('b', t.pw, t.ph);
    drawBlurred(wx, sil, Math.max(0.5, big * (0.04 * dil + 0.16 * dil * dil)));
    dst.globalAlpha = s.opacity * (1 - 0.8 * dil);
    dst.drawImage(wash, 0, 0);
    // liseré : la silhouette moins sa version floutée
    const { c: edge, ctx: ex } = buffer('b', t.pw, t.ph);
    ex.drawImage(sil, 0, 0);
    ex.globalCompositeOperation = 'destination-out';
    drawBlurred(ex, sil, Math.max(1, big * (0.03 + 0.05 * dil)));
    dst.globalAlpha = s.opacity * Math.min(1, 0.9 * dil);
    dst.drawImage(edge, 0, 0);
    // peu diluée, l'empreinte reste nette
    dst.globalAlpha = s.opacity * Math.pow(1 - dil, 1.5) * 0.7;
    dst.drawImage(sil, 0, 0);
  } else {
    dst.globalAlpha = s.opacity;
    dst.drawImage(sil, 0, 0);
  }
  dst.restore();
}

/**
 * Ramures : la couleur se concentre au point touché puis se propage en ramifications
 * (veines, racines, fissures). Chaque branche avance en hésitant, s'amincit, se divise ;
 * vers les bords, le pigment s'égrène en points épars. Tracé, le geste devient un tronc
 * d'où partent les ramifications. La couleur suit le guide du cœur vers les extrémités.
 */
function branchInk(dst: CanvasRenderingContext2D, s: Stroke, guides: Guide[], t: Target) {
  const r = rng(s.seed);
  const g = guides[s.guide];
  const grow = Math.max(0.05, Math.min(1, s.grow ?? 1));
  const R = s.size * t.pxPerMin * 4;
  const w0 = Math.max(0.8, s.size * t.pxPerMin * 0.2);
  const nb = Math.max(1, Math.round(s.branches ?? 6));
  const conv = s.converge ?? 0.3;
  const { c: buf, ctx: bx } = buffer('a', t.pw, t.ph);
  bx.lineCap = 'round';
  bx.lineJoin = 'round';
  // grille d'occupation : une branche qui en touche une autre s'y arrête, sauf si elles peuvent se croiser
  const cell = Math.max(2, w0 * 1.2);
  const gw = Math.ceil(t.pw / cell) + 1;
  const occ = new Int32Array(gw * (Math.ceil(t.ph / cell) + 1));
  const pts = s.pts.map((p) => ({ x: p.x * t.pw, y: p.y * t.ph, p: p.p ?? 0.7 }));
  // tronc : le geste lui-même
  if (pts.length > 2) {
    bx.strokeStyle = guideColor(g, 0);
    bx.lineWidth = w0 * 1.3;
    bx.beginPath();
    pts.forEach((q, i) => (i ? bx.lineTo(q.x, q.y) : bx.moveTo(q.x, q.y)));
    bx.stroke();
  }
  // départs : le point touché, puis le long du tronc
  const seeds: Array<{ x: number; y: number; p: number }> = [pts[0]!];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
    if (acc > R * 0.45) {
      seeds.push(pts[i]!);
      acc = 0;
    }
  }
  let id = 0;
  type Br = { x: number; y: number; a: number; w: number; len: number; d0: number; id: number; depth: number; ox: number; oy: number };
  const queue: Br[] = [];
  for (const sd of seeds) {
    // cœur : couleur très concentrée
    const core = R * (0.12 + 0.08 * sd.p) * Math.max(0, Math.min(1, s.core ?? 1));
    if (core > 0.5) {
      const rg = bx.createRadialGradient(sd.x, sd.y, 0, sd.x, sd.y, core);
      rg.addColorStop(0, guideColor(g, 0));
      rg.addColorStop(0.55, guideColor(g, 0.05));
      rg.addColorStop(1, guideColor(g, 0.1).slice(0, 7) + '00');
      bx.fillStyle = rg;
      bx.beginPath();
      bx.arc(sd.x, sd.y, core, 0, Math.PI * 2);
      bx.fill();
    }
    const a0 = r() * Math.PI * 2;
    for (let k = 0; k < nb; k++)
      queue.push({
        x: sd.x,
        y: sd.y,
        a: a0 + (k / nb) * Math.PI * 2 + (r() - 0.5) * 0.8,
        w: w0 * (0.7 + 0.5 * sd.p),
        len: R * (0.55 + 0.45 * r()) * grow * (1 + 0.6 * conv),
        d0: 0,
        id: ++id,
        depth: 0,
        ox: sd.x,
        oy: sd.y,
      });
  }
  const step = Math.max(1, w0 * 0.8);
  let guard = 0;
  while (queue.length && guard++ < 4000) {
    const b = queue.pop()!;
    let { x, y, a, w } = b;
    let travelled = 0;
    let turn = (r() - 0.5) * 0.1;
    while (travelled < b.len && w > 0.25) {
      // hésitation : la direction dérive doucement, avec des coudes francs de temps en temps
      // chaos : 0 = les branches filent droit vers l'extérieur, 1 = elles errent et reviennent sur leurs pas
      turn += (r() - 0.5) * (0.05 + 0.35 * conv);
      turn *= 0.85;
      a += turn + (r() < 0.02 + 0.04 * conv ? (r() - 0.5) * (0.8 + 1.6 * conv) : 0);
      // rappel vers la direction qui s'éloigne du cœur, d'autant plus fort que le chaos est faible
      const out = Math.atan2(y - b.oy, x - b.ox);
      if (Math.hypot(x - b.ox, y - b.oy) > step * 2) a += Math.atan2(Math.sin(out - a), Math.cos(out - a)) * (1 - conv) * 0.12;
      // retours de racines : au chaos fort, une branche fait parfois demi-tour
      if (r() < 0.012 * conv * conv) a += Math.PI * (0.6 + 0.4 * r()) * (r() < 0.5 ? -1 : 1);
      const nx = x + Math.cos(a) * step;
      const ny = y + Math.sin(a) * step;
      if (nx < 0 || ny < 0 || nx >= t.pw || ny >= t.ph) break;
      const ci = Math.floor(ny / cell) * gw + Math.floor(nx / cell);
      const other = occ[ci]!;
      const f = (b.d0 + travelled) / (R * grow);
      bx.strokeStyle = guideColor(g, Math.min(1, f));
      bx.lineWidth = w;
      bx.beginPath();
      bx.moveTo(x, y);
      bx.lineTo(nx, ny);
      bx.stroke();
      x = nx;
      y = ny;
      travelled += step;
      if (other && other !== b.id && travelled > step * 3 && r() > conv) break;
      occ[ci] = b.id;
      w *= 0.975 - 0.012 * r();
      // division : une branche fille part de côté, plus fine et plus courte
      if (b.depth < 6 && r() < 0.05 + 0.04 * (nb / 12)) {
        const side = r() < 0.5 ? -1 : 1;
        queue.push({ x, y, a: a + side * (0.3 + (0.5 + conv) * r()), w: w * 0.75, len: (b.len - travelled) * (0.5 + 0.4 * r()), d0: b.d0 + travelled, id: ++id, depth: b.depth + 1, ox: b.ox, oy: b.oy });
      }
      // vers les extrémités, le pigment s'égrène
      if (f > 0.45 && r() < 0.25 * f) {
        const dr = w * 2 + r() * R * 0.05;
        const da = r() * Math.PI * 2;
        bx.fillStyle = guideColor(g, Math.min(1, f));
        bx.globalAlpha = 0.3 + 0.4 * r();
        bx.beginPath();
        bx.arc(x + Math.cos(da) * dr, y + Math.sin(da) * dr, Math.max(0.4, w * (0.3 + 0.5 * r())), 0, Math.PI * 2);
        bx.fill();
        bx.globalAlpha = 1;
      }
    }
  }
  bx.globalAlpha = 1;
  dst.save();
  dst.globalAlpha = s.opacity;
  dst.drawImage(buf, 0, 0);
  dst.restore();
}

/**
 * Brûlure : la couche se consume là où la pointe appuie. Renvoie trois calques dans le
 * repère de la peinture : le trou, la zone roussie et carbonisée autour, et la lisière
 * de braise (couleur du guide). Le bord est irrégulier et le feu avance avec `grow`.
 */
function burnGroup(strokes: Stroke[], guides: Guide[], t: Target) {
  // contours du feu : un polygone irrégulier par point, centré sur le départ
  type Shape = { cx: number; cy: number; rr: number; m: Float32Array };
  const shapes: Shape[] = [];
  const n = 120;
  let big = 0;
  for (const s of strokes) {
    const r = rng(s.seed);
    const grow = Math.max(0.05, Math.min(1, s.grow ?? 1));
    const R = s.size * t.pxPerMin * 2.2 * grow;
    big = Math.max(big, R);
    // le feu avance par à-coups : rayon modulé par un bruit sur l'angle, propre à chaque point
    const ph = Array.from({ length: 5 }, () => r() * 6.28);
    s.pts.forEach((p, i) => {
      if (i % 2 && i !== s.pts.length - 1) return;
      const m = new Float32Array(n + 1);
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI * 2;
        m[k] = 1 + 0.12 * Math.sin(a * 3 + ph[0]!) + 0.06 * Math.sin(a * 7 + ph[1]!) + 0.03 * Math.sin(a * 17 + ph[2]! + i) + 0.025 * (r() - 0.5);
      }
      m[n] = m[0]!;
      shapes.push({ cx: p.x * t.pw, cy: p.y * t.ph, rr: R * (0.75 + 0.35 * (p.p ?? 0.7)) * (0.85 + 0.3 * r()), m });
    });
  }
  const fillAll = (x: CanvasRenderingContext2D, scale: number) => {
    x.beginPath();
    for (const sh of shapes) {
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI * 2;
        const rad = sh.rr * scale * sh.m[k]!;
        const px = sh.cx + Math.cos(a) * rad;
        const py = sh.cy + Math.sin(a) * rad;
        if (k) x.lineTo(px, py);
        else x.moveTo(px, py);
      }
      x.closePath();
    }
    x.fill('nonzero');
  };
  const hole = document.createElement('canvas');
  hole.width = t.pw;
  hole.height = t.ph;
  const hx = hole.getContext('2d')!;
  hx.fillStyle = '#000';
  fillAll(hx, 1);

  const last = strokes[strokes.length - 1];
  const c = Math.max(0.02, Math.min(1, last?.char ?? 0.3));
  const holed = last?.hole !== false;
  const g = guides[last?.guide ?? 0];
  const op = last?.opacity ?? 0.85;
  // largeur de la marge, en proportion du rayon du feu
  const mw = 0.12 + 0.9 * c;
  const out = document.createElement('canvas');
  out.width = t.pw;
  out.height = t.ph;
  const ox = out.getContext('2d')!;
  // bandes concentriques, de la plus large à la plus serrée : chacune prend sa couleur dans le dégradé.
  // Sans trou, le dégradé part du point de départ et finit au bord de la marge ;
  // avec trou, il part du bord brûlé, et la marge s'assombrit en approchant du trou.
  const N = 24;
  const inner = holed ? 1 : 0;
  const T = 1 + mw;
  const step = (T - inner) / N;
  // couleurs : bandes opaques, la plus serrée par-dessus ; l'opacité vient ensuite d'un masque doux
  ox.filter = `blur(${Math.max(1, big * step * 1.4)}px)`;
  for (let j = N; j >= 1; j--) {
    const sc = inner + step * j;
    const f = (sc - inner) / (T - inner);
    const beyond = Math.max(0, (sc - 1) / mw); // 0 au bord du feu, 1 au bout de la marge
    let col = guideColor(g, f);
    if (holed) col = mixHex(col, '#1e130b', 0.85 * Math.pow(1 - beyond, 1.4));
    ox.fillStyle = col;
    fillAll(ox, sc);
  }
  // masque : plein dans le feu, puis s'efface progressivement jusqu'au bout de la marge
  const mask = document.createElement('canvas');
  mask.width = t.pw;
  mask.height = t.ph;
  const mx = mask.getContext('2d')!;
  mx.filter = `blur(${Math.max(1, big * mw * 0.42)}px)`;
  mx.fillStyle = '#000';
  fillAll(mx, 1 + mw * 0.45);
  mx.filter = 'none';
  fillAll(mx, 1);
  ox.filter = 'none';
  ox.globalCompositeOperation = 'destination-in';
  ox.drawImage(mask, 0, 0);
  ox.globalCompositeOperation = 'source-over';
  // l'opacité du pinceau dose toute la marge
  if (op < 1) {
    ox.globalCompositeOperation = 'destination-in';
    ox.fillStyle = `rgba(0,0,0,${op})`;
    ox.fillRect(0, 0, t.pw, t.ph);
    ox.globalCompositeOperation = 'source-over';
  }
  if (holed) {
    // braise : un liseré fin à la couleur de départ du guide, contre le trou
    ox.filter = `blur(${Math.max(1, big * 0.012)}px)`;
    ox.globalAlpha = Math.min(1, op * 1.1);
    ox.fillStyle = guideColor(g, 0);
    fillAll(ox, 1.03);
    ox.filter = 'none';
    ox.globalAlpha = 1;
  }
  return { hole, edge: out };
}

function mixHex(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1, 7), 16);
  const pb = parseInt(b.slice(1, 7), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** Les brûlures d'une couche : chaque réglage de roussi garde sa propre marge. */
export function burnLayers(strokes: Stroke[], guides: Guide[], t: Target) {
  const groups = new Map<string, Stroke[]>();
  for (const s of strokes) {
    const k = `${s.char ?? 0.3}|${s.hole !== false}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  const hole = document.createElement('canvas');
  hole.width = t.pw;
  hole.height = t.ph;
  const edge = document.createElement('canvas');
  edge.width = t.pw;
  edge.height = t.ph;
  const ex = edge.getContext('2d')!;
  const hx = hole.getContext('2d')!;
  for (const list of groups.values()) {
    const r = burnGroup(list, guides, t);
    ex.drawImage(r.edge, 0, 0);
    // sans trou, la brûlure ne fait que teinter : la couche reste entière
    if (list[0]!.hole !== false) hx.drawImage(r.hole, 0, 0);
  }
  return { hole, edge };
}

/** Aperçu en direct pendant le geste : tampons translucides, sans liseré. */
export function previewStamps(ctx: CanvasRenderingContext2D, s: Stroke, guides: Guide[], t: Target, from: number) {
  const g = guides[s.guide];
  const all = stamps(s, t);
  ctx.save();
  const water = s.brush === 'aquarelle' || !s.brush;
  ctx.globalCompositeOperation = water ? 'multiply' : 'source-over';
  ctx.globalAlpha = (water ? 0.05 : s.brush === 'spray' || s.brush === 'glitter' ? 0.03 : 0.12) * s.opacity;
  for (let i = from; i < all.length; i++) {
    const st = all[i]!;
    ctx.fillStyle = guideColor(g, st.t);
    tipShape(ctx, s.brush === 'aquarelle' || !s.brush || s.brush === 'acrylic' || s.brush === 'roller' ? s.tip : 'round', st.x, st.y, Math.max(0.5, st.r), st.a, st.K, st.d);
    ctx.fill();
  }
  ctx.restore();
  return all.length;
}

type RGB = [number, number, number];
function rgbOf(c: string): RGB {
  const n = parseInt(c.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Variation d'une teinte : k > 0 éclaircit, k < 0 fonce. */
function shade(c: string, k: number, a = 1): string {
  const [r, g, b] = rgbOf(c);
  const f = (v: number) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k));
  return `rgba(${f(r)},${f(g)},${f(b)},${a})`;
}

/** Direction locale du trait en chaque tampon (unitaire). */
function tangents(st: Array<{ x: number; y: number }>) {
  return st.map((_, i) => {
    const a = st[Math.max(0, i - 3)]!;
    const b = st[Math.min(st.length - 1, i + 3)]!;
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
  });
}

/** Bruit de valeur 2D, doux. */
function vn(x: number, y: number, seed: number): number {
  const h = (i: number, j: number) => {
    let v = Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(seed | 0, 982451653);
    v = Math.imul(v ^ (v >>> 13), 1274126177);
    return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
  };
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = x - xi;
  const v = y - yi;
  const su = u * u * (3 - 2 * u);
  const sv = v * v * (3 - 2 * v);
  const a = h(xi, yi);
  const b = h(xi + 1, yi);
  const c = h(xi, yi + 1);
  const d = h(xi + 1, yi + 1);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
}

/** Le trait rééchantillonné à pas régulier : position, normale lissée, pression, abscisse. */
function track(s: Stroke, t: Target, step: number) {
  const raw = s.pts.map((p) => ({ x: p.x * t.pw, y: p.y * t.ph, p: p.p ?? 0.6, a: p.r ?? 0, K: (p.k ?? 0) * LEAN, d: p.d ?? 0 }));
  const out: Array<{ x: number; y: number; nx: number; ny: number; p: number; s: number; a: number; K: number; d: number }> = [];
  let carry = 0;
  let along = 0;
  for (let i = 0; i + 1 < raw.length; i++) {
    const a = raw[i]!;
    const b = raw[i + 1]!;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    let u = carry;
    while (u < d) {
      const f = u / d;
      out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, nx: 0, ny: 0, p: a.p + (b.p - a.p) * f, s: along + u, a: a.a + (b.a - a.a) * f, K: a.K + (b.K - a.K) * f, d: a.d });
      u += step;
    }
    carry = u - d;
    along += d;
  }
  if (!out.length && raw[0]) out.push({ ...raw[0], nx: 0, ny: -1, s: 0 });
  // normales lissées sur une dizaine de pas : les poils restent parallèles dans les virages
  const K = 6;
  out.forEach((q, i) => {
    const a = out[Math.max(0, i - K)]!;
    const b = out[Math.min(out.length - 1, i + K)]!;
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    q.nx = -(b.y - a.y) / d;
    q.ny = (b.x - a.x) / d;
    if (d === 1 && out.length === 1) [q.nx, q.ny] = [0, -1];
  });
  return { pts: out, length: along };
}

/**
 * Peinture en traînées : la largeur du trait est faite de pistes parallèles
 * (poils, fibres du manchon) qui suivent le geste. Chaque piste est posée par
 * petits tronçons dont la couverture varie : c'est ce qui donne le sens du
 * coloriage, les manques et les bords irréguliers.
 */
function streaks(
  dst: CanvasRenderingContext2D,
  s: Stroke,
  t: Target,
  o: {
    half: (p: number) => number;
    lanes: number;
    step: number;
    cover: (lane: number, o: number, along: number, rel: number) => number;
    color: (lane: number, o: number, along: number) => string;
    width: number;
  },
) {
  const { pts, length } = track(s, t, o.step);
  if (!pts.length) return;
  // zone touchée par le trait
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const q of pts) {
    const h = o.half(q.p) * (1 + q.K) + 4;
    x0 = Math.min(x0, q.x - h);
    y0 = Math.min(y0, q.y - h);
    x1 = Math.max(x1, q.x + h);
    y1 = Math.max(y1, q.y + h);
  }
  x0 = Math.max(0, Math.floor(x0));
  y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(t.pw, Math.ceil(x1));
  y1 = Math.min(t.ph, Math.ceil(y1));
  const W = x1 - x0;
  const H = y1 - y0;
  if (W <= 0 || H <= 0) return;
  // deux tampons : la teinte (opaque) et la couverture (niveaux de gris, on garde le maximum,
  // pour que les pistes qui se chevauchent ne foncent pas)
  const { c: colC, ctx: cx } = buffer('a', W, H);
  const { ctx: mx } = buffer('b', W, H);
  mx.fillStyle = '#000';
  mx.fillRect(0, 0, W, H);
  mx.globalCompositeOperation = 'lighten';
  for (const c of [cx, mx]) {
    c.translate(-x0, -y0);
    // bouts carrés : les tronçons se recouvrent, pas de jour entre eux
    c.lineCap = 'square';
  }
  for (let k = 0; k < o.lanes; k++) {
    const off = (k / Math.max(1, o.lanes - 1)) * 2 - 1;
    let prev: { x: number; y: number } | null = null;
    for (const q of pts) {
      let h = o.half(q.p);
      // brosse plate : les poils sont alignés sur la lame, le trait s'affine quand on la glisse dans son sens ;
      // triangle : la largeur suit l'ombre portée du triangle sur la normale du geste
      let ax = q.nx;
      let ay = q.ny;
      if (s.tip === 'flat') {
        ax = Math.cos(q.a);
        ay = Math.sin(q.a);
      } else if (s.tip === 'triangle') {
        let lo = Infinity;
        let hi = -Infinity;
        for (let v = 0; v < 3; v++) {
          const va = q.a - Math.PI / 2 + (v * 2 * Math.PI) / 3;
          const dd = Math.cos(va) * q.nx + Math.sin(va) * q.ny;
          lo = Math.min(lo, dd);
          hi = Math.max(hi, dd);
        }
        h *= (hi - lo) / 2;
      }
      // pinceau penché : la touche s'allonge dans le sens où il penche
      const [ox, oy] = stretch(ax * off * h, ay * off * h, q.K, q.d);
      const x = q.x + ox;
      const y = q.y + oy;
      if (prev) {
        const c = Math.min(1, o.cover(k, off, q.s, length ? q.s / length : 0));
        if (c > 0.02) {
          cx.strokeStyle = o.color(k, off, q.s);
          cx.lineWidth = o.width * 1.8;
          cx.beginPath();
          cx.moveTo(prev.x, prev.y);
          cx.lineTo(x, y);
          cx.stroke();
          const v = Math.round(c * 255);
          mx.strokeStyle = `rgb(${v},${v},${v})`;
          mx.lineWidth = o.width;
          mx.beginPath();
          mx.moveTo(prev.x, prev.y);
          mx.lineTo(x, y);
          mx.stroke();
        }
      }
      prev = { x, y };
    }
  }
  const ci = cx.getImageData(0, 0, W, H);
  const mi = mx.getImageData(0, 0, W, H);
  for (let i = 0; i < ci.data.length; i += 4) ci.data[i + 3] = Math.min(ci.data[i + 3]!, mi.data[i]!);
  cx.setTransform(1, 0, 0, 1, 0, 0);
  cx.putImageData(ci, 0, 0);
  dst.save();
  // peinture couvrante : l'opacité du réglage pèse moins que pour un lavis
  dst.globalAlpha = Math.min(1, 0.35 + 0.65 * s.opacity);
  dst.drawImage(colC, 0, 0, W, H, x0, y0, W, H);
  dst.restore();
}

/** Acrylique au pinceau : des poils chargés inégalement, qui se vident le long du geste et laissent des manques. */
function acrylic(dst: CanvasRenderingContext2D, s: Stroke, guides: Guide[], t: Target) {
  const g = guides[s.guide];
  const base = s.size * t.pxPerMin;
  const r = rng(s.seed ^ 0x51);
  const lanes = Math.max(10, Math.round(base * 1.4));
  // charge et teinte propres à chaque poil
  const load = Array.from({ length: lanes }, () => 0.55 + r() * 0.6);
  const tone = Array.from({ length: lanes }, () => (r() - 0.5) * 0.22);
  const seed = s.seed % 9973;
  streaks(dst, s, t, {
    half: (p) => base * (0.55 + 0.45 * p),
    lanes,
    step: Math.max(1.2, base * 0.06),
    width: Math.max(1, ((base * 2) / lanes) * 1.35),
    cover: (k, off, along, rel) => {
      // le pinceau se vide : d'abord sur les bords, puis partout, avec des sauts
      const dry = rel * rel * 0.9 + Math.abs(off) ** 3 * 0.35;
      const n = vn(k * 0.7, along / (base * 0.5), seed);
      const v = load[k]! - dry + (n - 0.5) * 0.7;
      return v > 0.35 ? 0.92 : v > 0.2 ? (v - 0.2) * 6 : 0;
    },
    color: (k, _o, along) => shade(guideColor(g, along ? Math.min(1, along / (base * 20)) : 0), tone[k]!, 1),
  });
}

/** Acrylique au rouleau : une bande large de largeur constante, fibres du manchon dans le sens du geste, bords effrangés. */
function roller(dst: CanvasRenderingContext2D, s: Stroke, guides: Guide[], t: Target) {
  const g = guides[s.guide];
  const half = s.size * t.pxPerMin * 1.1;
  const lanes = Math.max(16, Math.round(half * 1.2));
  const seed = s.seed % 9973;
  const col = guideColor(g, 0.5);
  const edgeCol = shade(col, -0.2, 1);
  const circ = half * 2.6;
  streaks(dst, s, t, {
    half: () => half,
    lanes,
    step: Math.max(1.5, half * 0.05),
    width: Math.max(1, ((half * 2) / lanes) * 1.3),
    cover: (k, off, along, rel) => {
      // bords effrangés : la limite de la bande bouge lentement le long du geste
      const edge = 0.8 + 0.14 * vn(along / (half * 0.45), off > 0 ? 3 : 7, seed) + 0.06 * vn(along / (half * 0.07), off > 0 ? 5 : 9, seed);
      if (Math.abs(off) > edge) return 0;
      // fibres du manchon (traînées dans le sens du geste) et charge du rouleau qui varie lentement
      const fiber = vn(k * 0.9, along / (half * 1.6), seed + 1);
      const turn = vn(k * 0.35, along / circ, seed + 2);
      const fade = rel > 0.75 ? 1 - (rel - 0.75) * 2.2 * vn(k * 0.5, along * 0.05, seed + 3) : 1;
      return (0.72 + 0.3 * fiber + 0.22 * (turn - 0.5)) * fade;
    },
    // la peinture s'accumule en bourrelet le long des deux bords
    color: (_k, off) => (Math.abs(off) > 0.74 ? edgeCol : col),
  });
}

/** Pistolet : un nuage de fines gouttelettes, dense au centre, qui s'éclaircit vers les bords. */
function spray(dst: CanvasRenderingContext2D, s: Stroke, guides: Guide[], t: Target) {
  const g = guides[s.guide];
  const st = stamps(s, t);
  const r = rng(s.seed ^ 0x77);
  dst.save();
  for (let i = 0; i < st.length; i += 1) {
    const q = st[i]!;
    const R = q.r * 1.4;
    const n = Math.round(10 + R * 0.9);
    dst.fillStyle = guideColor(g, q.t);
    for (let k = 0; k < n; k++) {
      // répartition gaussienne autour de la buse
      const u = Math.max(1e-6, r());
      const rad = Math.sqrt(-2 * Math.log(u)) * R * 0.38;
      const a = r() * Math.PI * 2;
      const d = 0.3 + r() * Math.max(0.6, R * 0.025);
      dst.globalAlpha = s.opacity * (0.25 + 0.5 * r());
      dst.beginPath();
      const [ox, oy] = stretch(Math.cos(a) * rad, Math.sin(a) * rad, q.K, q.d);
      dst.arc(q.x + ox, q.y + oy, d, 0, Math.PI * 2);
      dst.fill();
    }
  }
  dst.restore();
}

/** Paillettes : petits éclats plats de tailles et d'angles variés, quelques-uns scintillent. */
function glitter(dst: CanvasRenderingContext2D, s: Stroke, guides: Guide[], t: Target) {
  const g = guides[s.guide];
  const st = stamps(s, t);
  const r = rng(s.seed ^ 0x99);
  dst.save();
  for (let i = 0; i < st.length; i += 2) {
    const q = st[i]!;
    const n = Math.round(3 + q.r * 0.25);
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2;
      const rad = Math.sqrt(r()) * q.r;
      const [ox, oy] = stretch(Math.cos(a) * rad, Math.sin(a) * rad, q.K, q.d);
      const x = q.x + ox;
      const y = q.y + oy;
      const sz = Math.max(1, q.r * (0.06 + r() * 0.1));
      const base = guideColor(g, q.t);
      // chaque éclat accroche la lumière différemment
      const lit = r();
      dst.fillStyle = lit > 0.85 ? shade(base, 0.75, 1) : lit < 0.3 ? shade(base, -0.35, 1) : shade(base, (lit - 0.5) * 0.5, 1);
      dst.globalAlpha = Math.min(1, 0.5 + 0.5 * s.opacity);
      dst.save();
      dst.translate(x, y);
      dst.rotate(r() * Math.PI);
      if (r() < 0.5) dst.fillRect(-sz / 2, -sz / 2, sz, sz);
      else {
        dst.beginPath();
        for (let h = 0; h < 6; h++) dst.lineTo(Math.cos((h * Math.PI) / 3) * sz * 0.6, Math.sin((h * Math.PI) / 3) * sz * 0.6);
        dst.fill();
      }
      dst.restore();
      // scintillement : une petite croix de lumière
      if (lit > 0.965) {
        const L = sz * 2.6;
        dst.strokeStyle = 'rgba(255,255,255,0.9)';
        dst.lineWidth = Math.max(0.6, sz * 0.18);
        dst.beginPath();
        dst.moveTo(x - L, y);
        dst.lineTo(x + L, y);
        dst.moveTo(x, y - L);
        dst.lineTo(x, y + L);
        dst.stroke();
      }
    }
  }
  dst.restore();
}

/** Poils : des brins fins et effilés qui suivent le geste, avec des teintes voisines. */
function hair(dst: CanvasRenderingContext2D, s: Stroke, guides: Guide[], t: Target) {
  const g = guides[s.guide];
  const st = stamps(s, t);
  const tg = tangents(st);
  const r = rng(s.seed ^ 0x33);
  const lenK = (s.hairLen ?? 0.3) / 0.3;
  const curl = Math.max(0, Math.min(1, s.curl ?? 0));
  dst.save();
  dst.lineCap = 'round';
  dst.lineJoin = 'round';
  for (let i = 0; i < st.length; i++) {
    const q = st[i]!;
    // la laine est plus fournie que le poil raide
    const n = Math.round((2 + q.r * 0.12) * (1 + curl * 0.8));
    for (let k = 0; k < n; k++) {
      const o = (r() * 2 - 1) * q.r;
      const [ox, oy] = stretch(-tg[i]!.y * o, tg[i]!.x * o, q.K, q.d);
      const x = q.x + ox;
      const y = q.y + oy;
      // le brin part dans le sens du geste, un peu dévié (la laine part dans tous les sens), et se courbe
      const ang = Math.atan2(tg[i]!.y, tg[i]!.x) + (r() - 0.5) * (0.5 + curl * 2.2);
      const len = q.r * (0.8 + r() * 1.4) * lenK;
      const base = guideColor(g, q.t);
      dst.strokeStyle = shade(base, (r() - 0.5) * 0.6 + curl * 0.08, 0.35 + 0.5 * s.opacity);
      dst.lineWidth = Math.max(0.5, q.r * (0.035 + curl * 0.02));
      dst.beginPath();
      dst.moveTo(x, y);
      if (curl < 0.02) {
        const bend = (r() - 0.5) * len * 0.5;
        const ex = x + Math.cos(ang) * len;
        const ey = y + Math.sin(ang) * len;
        dst.quadraticCurveTo((x + ex) / 2 - Math.sin(ang) * bend, (y + ey) / 2 + Math.cos(ang) * bend, ex, ey);
      } else {
        // frisure : ondulation (alpaga), puis vraies boucles qui s'enroulent (mouton)
        const waves = 1 + curl * 5 + r() * 1.5;
        const amp = Math.min(1, curl * 1.6) * 1.1;
        const spin = Math.max(0, (curl - 0.55) / 0.45) * Math.PI * 2 * (2 + r() * 2) * (r() < 0.5 ? -1 : 1);
        const phase = r() * Math.PI * 2;
        const segs = Math.round(10 + curl * 26);
        const dl = len / segs;
        let px = x;
        let py = y;
        for (let j = 1; j <= segs; j++) {
          const u = j / segs;
          const a = ang + amp * Math.sin(phase + u * waves * Math.PI * 2) + spin * u;
          px += Math.cos(a) * dl;
          py += Math.sin(a) * dl;
          dst.lineTo(px, py);
        }
      }
      dst.stroke();
    }
  }
  dst.restore();
}
