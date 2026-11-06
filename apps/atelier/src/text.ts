import { ringsToPath, simplifyRing, type Ring } from './cut';
import { loadIndex } from './library';

/**
 * Texte de l'atelier : un objet dont la découpe suit les lettres. Les bords, lueurs,
 * matières et la peinture s'appliquent donc dans les lettres comme sur une forme.
 * Les lettres sont rendues par le navigateur (polices variables, italique, interlettrage)
 * puis leur contour est relevé et lissé : la découpe reste un tracé vectoriel.
 */
export interface TextStyle {
  content: string;
  /** Police de la bibliothèque (identifiant). */
  font: string;
  /** Graisse 100..900 : réelle sur une police variable, épaissie ou amincie sinon. */
  weight: number;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  /** Interlettrage, en fraction du corps. */
  tracking?: number;
  /** Interligne, en fraction du corps (1.1 par défaut). */
  leading?: number;
  /** Paraphes : traits dessinés qui prolongent les lettres et font partie de leur découpe. */
  swashes?: Swash[];
  /** Enveloppe : les lettres se courbent, gonflent ou fuient ensemble. */
  warp?: TextWarp;
  /** Modelages : le contour tiré ou repoussé au stylet, après les paraphes et avant l'enveloppe. */
  molds?: Mold[];
}

/**
 * Un modelage : le contour proche de la pointe suit son mouvement. Parti de l'intérieur, le geste
 * tire la lettre (elle s'étire) ; parti de l'extérieur vers l'intérieur, il la repousse (elle se creuse).
 * Points en corps depuis le coin du bloc de lignes, avant l'enveloppe ; r = rayon d'action en corps.
 */
export interface Mold {
  pts: [number, number][];
  r: number;
  /** Geste en cours : le contour n'est refondu qu'au lâcher. */
  live?: boolean;
  /** Régularisation (sans geste) : force du lissage, en corps. */
  smooth?: number;
}

/** Applique un modelage aux contours (en pixels), en gardant des points assez serrés. */
function mold(rings: Ring[], m: Mold, X0: number, Y0: number, size: number, pristine: Ring[]): Ring[] {
  if (m.smooth) return regularize(rings, m.smooth * size, pristine);
  const R = Math.max(2, m.r * size);
  const pts = m.pts.map(([x, y]) => ({ x: X0 + x * size, y: Y0 + y * size }));
  let out = rings.map((r) => r.map((p) => ({ x: p.x, y: p.y })));
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1]!, pts[i]!];
    const [dx, dy] = [b.x - a.x, b.y - a.y];
    if (!dx && !dy) continue;
    // assez de points sous la pointe pour que le contour se plie en douceur
    if ((i - 1) % 3 === 0) out = out.map((r) => densify(r, 1.6, a, R * 1.5));
    for (const r of out)
      for (const q of r) {
        const d2 = ((q.x - a.x) ** 2 + (q.y - a.y) ** 2) / (R * R);
        if (d2 >= 1) continue;
        const f = (1 - d2) ** 2;
        q.x += dx * f;
        q.y += dy * f;
      }
  }
  return m.live ? out.map((r) => simplifyRing(r, 0.2)) : refuse(out);
}

/**
 * Refonte du contour : on remplit le tracé modelé puis on relève à nouveau son bord.
 * Les replis, les traits qui se chevauchent ou se tassent fusionnent en une forme nette.
 */
/** Cadre en pixels qui contient tous les contours donnés, plus une marge. */
function frameOf(sets: Ring[][], margin: number) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const rings of sets)
    for (const r of rings)
      for (const p of r) {
        x0 = Math.min(x0, p.x);
        y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x);
        y1 = Math.max(y1, p.y);
      }
  if (!isFinite(x0)) return null;
  const ox = Math.floor(x0) - margin;
  const oy = Math.floor(y0) - margin;
  const W = Math.ceil(x1) - ox + margin + 1;
  const H = Math.ceil(y1) - oy + margin + 1;
  return W * H > 6e7 ? null : { ox, oy, W, H };
}
/** Le tracé rempli, en couverture 0..1, dans le cadre donné. */
function rasterIn(rings: Ring[], f: { ox: number; oy: number; W: number; H: number }): Float32Array {
  const cv = document.createElement('canvas');
  cv.width = f.W;
  cv.height = f.H;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  const path = new Path2D();
  for (const r of rings) {
    r.forEach((p, i) => (i ? path.lineTo(p.x - f.ox, p.y - f.oy) : path.moveTo(p.x - f.ox, p.y - f.oy)));
    path.closePath();
  }
  ctx.fillStyle = '#000';
  ctx.fill(path, 'nonzero');
  const d = ctx.getImageData(0, 0, f.W, f.H).data;
  const a = new Float32Array(f.W * f.H);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3]! / 255;
  return a;
}
/** Flou en boîte séparable, répété : proche d'un flou gaussien. */
function blur(a: Float32Array, W: number, H: number, r: number, passes = 3): Float32Array {
  if (r < 1) return a;
  const src = Float32Array.from(a);
  const tmp = new Float32Array(W * H);
  const pass = (from: Float32Array, to: Float32Array, horiz: boolean) => {
    const n = horiz ? W : H;
    const m = horiz ? H : W;
    const at = (line: number, k: number) => (horiz ? line * W + k : k * W + line);
    for (let line = 0; line < m; line++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += from[at(line, Math.max(0, Math.min(n - 1, k)))]!;
      for (let k = 0; k < n; k++) {
        to[at(line, k)] = acc / (2 * r + 1);
        acc += from[at(line, Math.min(n - 1, k + r + 1))]! - from[at(line, Math.max(0, k - r))]!;
      }
    }
  };
  for (let i = 0; i < passes; i++) {
    pass(src, tmp, true);
    pass(tmp, src, false);
  }
  return src;
}

/**
 * Régulariser : seul ce qui a été ajouté ou modifié (par rapport aux lettres d'origine) est lissé,
 * comme une encre qui se pose. Les accrocs et les miettes disparaissent, les pleins s'égalisent
 * (flou puis seuil), les bords ondulés se redressent dans leur sens. Ailleurs, les lettres
 * reprennent exactement leur dessin d'origine.
 */
function regularize(rings: Ring[], radius: number, pristine: Ring[]): Ring[] {
  const r = Math.max(1, Math.round(radius));
  const f = frameOf([rings, pristine], r * 4 + 4);
  if (!f) return rings;
  const { W, H, ox, oy } = f;
  const cur = rasterIn(rings, f);
  const orig = rasterIn(pristine, f);
  // où le dessin s'écarte des lettres : on ignore le liseré d'un pixel laissé par les retracés
  let diff: Float32Array = new Float32Array(W * H);
  for (let i = 0; i < diff.length; i++) diff[i] = Math.abs(cur[i]! - orig[i]!) > 0.5 ? 1 : 0;
  diff = blur(diff, W, H, 1, 1);
  for (let i = 0; i < diff.length; i++) diff[i] = diff[i]! > 0.99 ? 1 : 0;
  // la zone retouchée, élargie pour couvrir les raccords, puis adoucie
  let mask = blur(diff, W, H, r * 2, 1);
  for (let i = 0; i < mask.length; i++) mask[i] = mask[i]! > 0 ? 1 : 0;
  mask = blur(mask, W, H, Math.max(1, Math.round(r / 2)), 3);
  const soft = blur(cur, W, H, r, 3);
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const m = mask[i]!;
    out[i * 4 + 3] = Math.round((m * soft[i]! + (1 - m) * orig[i]!) * 255);
  }
  const at = (p: { x: number; y: number }) => mask[Math.min(H - 1, Math.max(0, Math.round(p.y))) * W + Math.min(W - 1, Math.max(0, Math.round(p.x)))]!;
  const minArea = (r * 1.5) ** 2;
  return contours(out, W, H, 128)
    .filter((ring) => Math.abs(ringArea(ring)) > minArea || ring.every((p) => at(p) < 0.01))
    .map((ring) => {
      const t = taubin(ring, 6);
      // le redressement ne s'applique que dans la zone retouchée
      return simplifyRing(
        ring.map((p, i) => {
          const m = at(p);
          return { x: ox + p.x + m * (t[i]!.x - p.x), y: oy + p.y + m * (t[i]!.y - p.y) };
        }),
        0.2,
      );
    });
}
const ringArea = (r: Ring) => r.reduce((s, p, i) => s + p.x * r[(i + 1) % r.length]!.y - r[(i + 1) % r.length]!.x * p.y, 0) / 2;
/** Lissage de Taubin : les ondulations s'effacent sans que la forme rétrécisse. */
function taubin(r: Ring, n: number): Ring {
  let p = r;
  const step = (q: Ring, k: number) =>
    q.map((c, i) => {
      const a = q[(i - 1 + q.length) % q.length]!;
      const b = q[(i + 1) % q.length]!;
      return { x: c.x + k * ((a.x + b.x) / 2 - c.x), y: c.y + k * ((a.y + b.y) / 2 - c.y) };
    });
  for (let i = 0; i < n; i++) p = step(step(p, 0.5), -0.53);
  return p;
}

function refuse(rings: Ring[]): Ring[] {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings)
    for (const p of r) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  if (!isFinite(x0)) return rings;
  const ox = Math.floor(x0) - 3;
  const oy = Math.floor(y0) - 3;
  const W = Math.ceil(x1) - ox + 4;
  const H = Math.ceil(y1) - oy + 4;
  if (W * H > 6e7) return rings.map((r) => simplifyRing(r, 0.2));
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  const path = new Path2D();
  for (const r of rings) {
    r.forEach((p, i) => (i ? path.lineTo(p.x - ox, p.y - oy) : path.moveTo(p.x - ox, p.y - oy)));
    path.closePath();
  }
  ctx.fillStyle = '#000';
  // les trous des lettres tournent dans l'autre sens : le remplissage par enroulement les garde
  // et comble les replis du modelage
  ctx.fill(path, 'nonzero');
  return contours(ctx.getImageData(0, 0, W, H).data, W, H, 128)
    .filter((r) => r.length >= 8)
    .map((r) =>
      simplifyRing(
        r.map((p) => ({ x: p.x + ox, y: p.y + oy })),
        0.2,
      ),
    );
}
function densify(r: Ring, gap: number, c: { x: number; y: number }, near: number): Ring {
  const o: Ring = [];
  const n2 = near * near;
  for (let i = 0; i < r.length; i++) {
    const [a, b] = [r[i]!, r[(i + 1) % r.length]!];
    o.push(a);
    // distance du centre au segment
    const [ux, uy] = [b.x - a.x, b.y - a.y];
    const L2 = ux * ux + uy * uy || 1;
    const k = Math.max(0, Math.min(1, ((c.x - a.x) * ux + (c.y - a.y) * uy) / L2));
    if ((a.x + ux * k - c.x) ** 2 + (a.y + uy * k - c.y) ** 2 > n2) continue;
    const n = Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / gap);
    for (let k = 1; k <= n; k++) o.push({ x: a.x + ((b.x - a.x) * k) / (n + 1), y: a.y + ((b.y - a.y) * k) / (n + 1) });
  }
  return o;
}

export type SwashEnd = 'point' | 'ball' | 'flat';
/**
 * Un paraphe : les points [x, y, pression] sont en corps (1 = taille de la police), comptés depuis
 * le coin haut gauche du bloc de lignes, avant l'enveloppe. Il suit donc le texte quand on change
 * la police ou qu'on courbe l'ensemble.
 */
export interface Swash {
  pts: [number, number, number][];
  /** Épaisseur, en corps. */
  w: number;
  end: SwashEnd;
}
export type WarpKind = 'arc' | 'wave' | 'bulge' | 'persp';
export interface TextWarp {
  kind: WarpKind;
  /** -1..1 : le signe inverse la courbure (arche ou sourire, gonflé ou pincé). */
  amount: number;
}
export const WARPS: { id: WarpKind | 'none'; name: string }[] = [
  { id: 'none', name: 'Droit' },
  { id: 'arc', name: 'Arche' },
  { id: 'wave', name: 'Vague' },
  { id: 'bulge', name: 'Gonflé' },
  { id: 'persp', name: 'Fuite' },
];

/**
 * Enveloppe : seule la hauteur bouge, selon la position dans la largeur du bloc de lignes.
 * x, y comptés depuis le coin du bloc (fw × fh). inverse : retrouve le point avant l'enveloppe.
 */
export function warpPoint(w: TextWarp | undefined, fw: number, fh: number, x: number, y: number, inverse = false): [number, number] {
  if (!w || !w.amount) return [x, y];
  const u = Math.max(0, Math.min(1, x / (fw || 1)));
  const bump = 1 - (2 * u - 1) ** 2;
  const A = w.amount;
  const cy = fh / 2;
  if (w.kind === 'arc' || w.kind === 'wave') {
    const dy = w.kind === 'arc' ? -A * fh * 1.1 * bump : -A * fh * 0.45 * Math.sin(2 * Math.PI * u);
    return [x, inverse ? y - dy : y + dy];
  }
  const k = Math.max(0.15, w.kind === 'bulge' ? 1 + A * 1.3 * bump : 1 + A * 0.8 * (2 * u - 1));
  return [x, inverse ? cy + (y - cy) / k : cy + (y - cy) * k];
}

/** Épaisseur de départ d'un paraphe : celle d'un fût de lettre à cette graisse. */
export const swashWidth = (weight: number) => 0.05 + (weight / 900) * 0.16;

export interface FontFile {
  weight: number;
  weightMax?: number;
  style: 'normal' | 'italic';
  src: string;
}
export interface FontInfo {
  id: string;
  family: string;
  tags: string[];
  files: FontFile[];
}

/** Polices toujours proposées, même hors ligne (le navigateur les remplace au besoin). */
const FALLBACK: FontInfo[] = [{ id: 'inter', family: 'Inter', tags: ['police', 'texte'], files: [] }];
let fonts: FontInfo[] = FALLBACK;
let listing: Promise<FontInfo[]> | null = null;
const loading = new Map<string, Promise<void>>();
const ready = new Set<string>();
const listeners = new Set<() => void>();
/** Incrémenté à chaque police chargée : les découpes calculées avant sont recalculées. */
let fontEpoch = 0;

/** Liste des polices de la bibliothèque (chargée une fois). */
export function loadFonts(): Promise<FontInfo[]> {
  listing ??= loadIndex().then((d) => {
    if (d.fonts?.length) fonts = d.fonts;
    return fonts;
  });
  return listing;
}
export const fontList = () => fonts;
export const fontOf = (id: string) => fonts.find((x) => x.id === id) ?? fonts[0]!;
export const fontFamily = (id: string) => `"FTD ${fontOf(id).family}"`;

/** Prévient quand une police vient d'arriver (pour redessiner). */
export function onFontReady(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Charge les fichiers d'une police (toutes ses graisses et styles). */
export function ensureFont(id: string): Promise<void> {
  const fi = fonts.find((x) => x.id === id);
  if (!fi || ready.has(id)) return Promise.resolve();
  let p = loading.get(id);
  if (!p) {
    p = Promise.all(
      fi.files.map((x) => {
        // chargée en données plutôt que par url() : la page publiée n'accepte les polices que de cette façon
        return fetch(x.src)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(x.src))))
          .then((buf) => new FontFace(`FTD ${fi.family}`, buf, { weight: x.weightMax ? `${x.weight} ${x.weightMax}` : String(x.weight), style: x.style }).load())
          .then((f) => void document.fonts.add(f));
      }),
    )
      .then(() => {
        ready.add(id);
        fontEpoch++;
        cache.clear();
        listeners.forEach((fn) => fn());
      })
      .catch(() => undefined);
    loading.set(id, p);
  }
  return p;
}
export const isFontReady = (id: string) => ready.has(id);

/** Ce que la police sait faire en vrai : plage de graisse, italique dessiné. */
function abilities(id: string, italic: boolean) {
  const fi = fontOf(id);
  const files = fi.files.filter((x) => x.style === (italic && fi.files.some((y) => y.style === 'italic') ? 'italic' : 'normal'));
  const lo = Math.min(...files.map((x) => x.weight), 400);
  const hi = Math.max(...files.map((x) => x.weightMax ?? x.weight), 400);
  return { lo: files.length ? lo : 400, hi: files.length ? hi : 400, realItalic: fi.files.some((x) => x.style === 'italic') };
}

/** Corps de rendu, en pixels : assez fin pour une affiche A4 imprimée. */
const BODY = 220;
const MAX_SIDE = 4096;

interface TextCut {
  d: string;
  /** Largeur / hauteur des lettres. */
  ratio: number;
  /** Taille de l'encre au corps de rendu (pour garder le corps quand le texte change). */
  bw: number;
  bh: number;
  /** Coin de l'encre depuis le coin du bloc de lignes, au corps de rendu. */
  ox: number;
  oy: number;
  /** Bloc de lignes (cadre de l'enveloppe), au corps de rendu. */
  fw: number;
  fh: number;
}
const cache = new Map<string, TextCut>();
/** Même objet de style, même découpe : évite de recalculer la clé (paraphes et modelages compris) à chaque image. */
const byStyle = new WeakMap<TextStyle, { epoch: number; c: TextCut }>();

/** Découpe des lettres en coordonnées 0..1 de leur boîte. */
export function textCut(t: TextStyle): TextCut {
  const hit = byStyle.get(t);
  if (hit && hit.epoch === fontEpoch) return hit.c;
  const key = JSON.stringify([baseKey(t), t.warp ?? 0, t.molds ?? 0]);
  let c = cache.get(key);
  if (!c) {
    c = trace(t);
    if (cache.size > 200) cache.clear();
    cache.set(key, c);
  }
  byStyle.set(t, { epoch: fontEpoch, c });
  return c;
}

/** Lettres et paraphes rendus puis relevés en contours (pixels), avant modelage et enveloppe. */
interface Base {
  key: string;
  raw: Ring[];
  X0: number;
  Y0: number;
  size: number;
  widest: number;
  fh: number;
}
const baseKey = (t: TextStyle) => JSON.stringify([t.content, t.font, t.weight, t.italic, t.align, t.tracking ?? 0, t.leading ?? 1.1, t.swashes ?? 0, fontEpoch]);
const bases = new Map<string, Base>();
function baseOf(t: TextStyle): Base {
  const key = baseKey(t);
  let b = bases.get(key);
  if (!b) {
    b = render(t, key);
    if (bases.size > 12) bases.clear();
    bases.set(key, b);
  }
  return b;
}
/** Contours après chaque modelage, gardés par modelage : pendant un geste, seul le dernier est refait. */
const molded = new WeakMap<Mold, { base: string; prev: Mold | null; rings: Ring[] }>();
function moldedRings(t: TextStyle, b: Base): Ring[] {
  const ms = t.molds ?? [];
  let rings = b.raw;
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i]!;
    const prev = ms[i - 1] ?? null;
    const hit = molded.get(m);
    if (hit && hit.base === b.key && hit.prev === prev) {
      rings = hit.rings;
      continue;
    }
    rings = mold(rings, m, b.X0, b.Y0, b.size, b.raw);
    molded.set(m, { base: b.key, prev, rings });
  }
  return rings;
}

function trace(t: TextStyle): TextCut {
  const b = baseOf(t);
  const { X0, Y0, size, widest, fh } = b;
  const lead = t.leading ?? 1.1;
  if (!b.raw.length) {
    // texte vide : une boîte pleine, pour qu'on puisse encore toucher l'objet
    return { d: 'M0 0L1 0L1 1L0 1Z', ratio: Math.max(0.2, 0.6 / lead), bw: BODY * 0.6, bh: lead * BODY, ox: 0, oy: 0, fw: BODY * 0.6, fh: lead * BODY };
  }
  const rings = moldedRings(t, b).map((r) =>
    t.warp?.amount
      ? r.map((p) => {
          const [x, y] = warpPoint(t.warp, widest, fh, p.x - X0, p.y - Y0);
          return { x: x + X0, y: y + Y0 };
        })
      : r,
  );
  const toBody = BODY / size;
  // boîte de l'encre
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings)
    for (const p of r) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  const [bw, bh] = [x1 - x0 || 1, y1 - y0 || 1];
  const norm = rings.map((r) => simplifyRing(r, 0.35).map((p) => ({ x: (p.x - x0) / bw, y: (p.y - y0) / bh })));
  return { d: ringsToPath(norm, 1e-6, 55, false), ratio: bw / bh, bw: bw * toBody, bh: bh * toBody, ox: (x0 - X0) * toBody, oy: (y0 - Y0) * toBody, fw: widest * toBody, fh: fh * toBody };
}

function render(t: TextStyle, key: string): Base {
  const lines = (t.content || ' ').split('\n');
  const ab = abilities(t.font, t.italic);
  const real = Math.max(ab.lo, Math.min(ab.hi, t.weight));
  const probe = document.createElement('canvas').getContext('2d')!;
  let size = BODY;
  const fontCss = (s: number) => `${t.italic && ab.realItalic ? 'italic ' : ''}${Math.round(real)} ${s}px ${fontFamily(t.font)}, "Inter", sans-serif`;
  const setup = (ctx: CanvasRenderingContext2D, s: number) => {
    ctx.font = fontCss(s);
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${(t.tracking ?? 0) * s}px`;
  };
  setup(probe, size);
  let widest = Math.max(1, ...lines.map((l) => probe.measureText(l).width));
  const lead = t.leading ?? 1.1;
  // étendue des paraphes, en corps depuis le coin du bloc de lignes
  const sw = t.swashes ?? [];
  let [sx0, sy0, sx1, sy1] = [0, 0, 0, 0];
  for (const s of sw)
    for (const [x, y] of s.pts) {
      const r = s.w * 1.2;
      [sx0, sy0, sx1, sy1] = [Math.min(sx0, x - r), Math.min(sy0, y - r), Math.max(sx1, x + r), Math.max(sy1, y + r)];
    }
  const emW = Math.max(widest / size + 1.3, sx1 + 0.5) - Math.min(0, sx0 - 0.5);
  const emH = Math.max(lines.length * lead + 1, sy1 + 0.5) - Math.min(0, sy0 - 0.5);
  // un très long texte est rendu plus petit, pour rester dans un canevas raisonnable
  const k = Math.min(1, MAX_SIDE / (emW * size), MAX_SIDE / (emH * size));
  size = Math.max(24, Math.floor(size * k));
  setup(probe, size);
  widest = Math.max(1, ...lines.map((l) => probe.measureText(l).width));
  // graisse hors de la plage de la police : on épaissit (ou amincit) le trait
  const extra = ((t.weight - real) / 500) * size * 0.05;
  const pad = Math.ceil(size * 0.5 + Math.abs(extra));
  // coin du bloc de lignes dans le canevas : de la place à gauche et en haut pour les paraphes
  const X0 = Math.max(pad, Math.ceil(-sx0 * size) + 4);
  const Y0 = Math.max(pad, Math.ceil(-sy0 * size) + 4);
  const W = Math.ceil(Math.max(X0 + widest + pad + size * 0.3, X0 + sx1 * size + 4));
  const H = Math.ceil(Math.max(Y0 + lines.length * lead * size + pad, Y0 + sy1 * size + 4));
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  setup(ctx, size);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  ctx.lineJoin = 'round';
  // italique simulé : on penche les lettres
  if (t.italic && !ab.realItalic) ctx.setTransform(1, 0, -0.2, 1, size * 0.3, 0);
  const lineX = (line: string) => {
    const w = ctx.measureText(line).width;
    return X0 + (t.align === 'left' ? 0 : t.align === 'right' ? widest - w : (widest - w) / 2);
  };
  lines.forEach((line, i) => {
    const x = lineX(line);
    const y = Y0 + (i + 0.8) * lead * size;
    ctx.fillText(line, x, y);
    if (extra > 0.3) {
      ctx.lineWidth = extra * 2;
      ctx.strokeText(line, x, y);
    }
  });
  if (extra < -0.3) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = -extra * 2;
    lines.forEach((line, i) => ctx.strokeText(line, lineX(line), Y0 + (i + 0.8) * lead * size));
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const s of sw) drawSwash(ctx, s, X0, Y0, size);
  const alpha = ctx.getImageData(0, 0, W, H).data;
  // contours allégés dès le départ : moins de points à modeler et à redessiner
  const raw = contours(alpha, W, H, 128).map((r) => simplifyRing(r, 0.2));
  return { key, raw, X0, Y0, size, widest, fh: lines.length * lead * size };
}

/** Point de la boîte des lettres (0..1) vers les coordonnées d'un paraphe (corps, avant l'enveloppe). */
export function swashPoint(t: TextStyle, u: number, v: number): [number, number] {
  const c = textCut(t);
  const [x, y] = warpPoint(t.warp, c.fw, c.fh, c.ox + u * c.bw, c.oy + v * c.bh, true);
  return [x / BODY, y / BODY];
}

/** Un paraphe tracé au pinceau rond : plein au départ (il sort de la lettre), effilé ou arrondi au bout. */
function drawSwash(ctx: CanvasRenderingContext2D, s: Swash, X0: number, Y0: number, size: number) {
  let pts = s.pts.map(([x, y, p]) => ({ x: X0 + x * size, y: Y0 + y * size, p }));
  // lissage (Chaikin) : le trait à main levée devient une courbe souple
  for (let n = 0; n < 2 && pts.length > 2; n++) {
    const out = [pts[0]!];
    for (let i = 0; i < pts.length - 1; i++) {
      const [a, b] = [pts[i]!, pts[i + 1]!];
      out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25, p: a.p * 0.75 + b.p * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75, p: a.p * 0.25 + b.p * 0.75 });
    }
    out.push(pts[pts.length - 1]!);
    pts = out;
  }
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  const total = len[len.length - 1]! || 1;
  const smooth = (x: number) => x * x * (3 - 2 * x);
  const width = (i: number) => {
    const t = len[i]! / total;
    const f = s.end === 'point' ? (t < 0.3 ? 1 : Math.max(0.03, 1 - smooth((t - 0.3) / 0.7))) : s.end === 'ball' ? 1 - 0.5 * smooth(t) : 1;
    return s.w * size * (0.4 + 0.85 * pts[i]!.p) * f;
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 1; i < pts.length; i++) {
    ctx.beginPath();
    ctx.moveTo(pts[i - 1]!.x, pts[i - 1]!.y);
    ctx.lineTo(pts[i]!.x, pts[i]!.y);
    ctx.lineWidth = Math.max(0.5, (width(i - 1) + width(i)) / 2);
    ctx.stroke();
  }
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0]!.x, pts[0]!.y, width(0) / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (s.end === 'ball') {
    const e = pts[pts.length - 1]!;
    ctx.beginPath();
    ctx.arc(e.x, e.y, s.w * size * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Contours de l'encre (marching squares avec interpolation) : anneaux fermés en pixels.
 * Les extérieurs et les trous (o, a, e…) sortent tous : la découpe est remplie en pair-impair.
 */
function contours(px: Uint8ClampedArray, W: number, H: number, th: number): Ring[] {
  const a = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : px[(y * W + x) * 4 + 3]!);
  // arêtes : horizontales (x, y)→(x+1, y) id = 2*(y*(W+1)+x), verticales (x, y)→(x, y+1) id = 2*(...)+1
  const hid = (x: number, y: number) => 2 * ((y + 1) * (W + 2) + (x + 1));
  const vid = (x: number, y: number) => 2 * ((y + 1) * (W + 2) + (x + 1)) + 1;
  const next = new Map<number, number>();
  const pos = new Map<number, [number, number]>();
  const point = (id: number, x0: number, y0: number, x1: number, y1: number) => {
    if (!pos.has(id)) {
      const [v0, v1] = [a(x0, y0), a(x1, y1)];
      const t = v0 === v1 ? 0.5 : (th - v0) / (v1 - v0);
      pos.set(id, [x0 + (x1 - x0) * t + 0.5, y0 + (y1 - y0) * t + 0.5]);
    }
    return id;
  };
  for (let y = -1; y < H; y++) {
    for (let x = -1; x < W; x++) {
      const tl = a(x, y) >= th ? 8 : 0;
      const tr = a(x + 1, y) >= th ? 4 : 0;
      const br = a(x + 1, y + 1) >= th ? 2 : 0;
      const bl = a(x, y + 1) >= th ? 1 : 0;
      const c = tl | tr | br | bl;
      if (c === 0 || c === 15) continue;
      const T = () => point(hid(x, y), x, y, x + 1, y);
      const B = () => point(hid(x, y + 1), x, y + 1, x + 1, y + 1);
      const L = () => point(vid(x, y), x, y, x, y + 1);
      const R = () => point(vid(x + 1, y), x + 1, y, x + 1, y + 1);
      // l'encre reste à droite du sens de parcours
      const seg = (p: number, q: number) => next.set(p, q);
      switch (c) {
        case 1:
          seg(L(), B());
          break;
        case 2:
          seg(B(), R());
          break;
        case 3:
          seg(L(), R());
          break;
        case 4:
          seg(R(), T());
          break;
        case 5: {
          const mid = (a(x, y) + a(x + 1, y) + a(x + 1, y + 1) + a(x, y + 1)) / 4 >= th;
          if (mid) {
            seg(L(), T());
            seg(R(), B());
          } else {
            seg(L(), B());
            seg(R(), T());
          }
          break;
        }
        case 6:
          seg(B(), T());
          break;
        case 7:
          seg(L(), T());
          break;
        case 8:
          seg(T(), L());
          break;
        case 9:
          seg(T(), B());
          break;
        case 10: {
          const mid = (a(x, y) + a(x + 1, y) + a(x + 1, y + 1) + a(x, y + 1)) / 4 >= th;
          if (mid) {
            seg(T(), R());
            seg(B(), L());
          } else {
            seg(T(), L());
            seg(B(), R());
          }
          break;
        }
        case 11:
          seg(T(), R());
          break;
        case 12:
          seg(R(), L());
          break;
        case 13:
          seg(R(), B());
          break;
        case 14:
          seg(B(), L());
          break;
      }
    }
  }
  const rings: Ring[] = [];
  for (const start of next.keys()) {
    if (!next.has(start)) continue;
    const ring: Ring = [];
    let id: number | undefined = start;
    while (id !== undefined && next.has(id)) {
      const p = pos.get(id)!;
      ring.push({ x: p[0], y: p[1] });
      const n: number = next.get(id)!;
      next.delete(id);
      id = n;
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

/** Styles proposés au rayon Textes : de quoi démarrer une affiche d'un geste. */
export interface TextPreset {
  name: string;
  sample: string;
  style: Omit<TextStyle, 'content'>;
  /** Hauteur de départ de la boîte, en fraction du petit côté (0.1 par défaut). */
  size?: number;
  /** Apparence posée avec le texte. */
  extra?: 'neon' | 'sticker' | 'stamp' | 'shadow';
}
export const TEXT_PRESETS: TextPreset[] = [
  { name: 'Affiche', sample: 'CONCERT', style: { font: 'anton', weight: 400, italic: false, align: 'center', tracking: 0.02 } },
  { name: 'BD', sample: 'Flow Therapy !', style: { font: 'bangers', weight: 400, italic: false, align: 'center', tracking: 0.03 }, extra: 'shadow' },
  { name: 'Élégant', sample: 'Soirée', style: { font: 'playfair', weight: 600, italic: true, align: 'center' } },
  { name: 'Néon', sample: 'Live', style: { font: 'pacifico', weight: 400, italic: false, align: 'center' }, extra: 'neon' },
  { name: 'Autocollant', sample: 'Gratuit', style: { font: 'shrikhand', weight: 400, italic: false, align: 'center' }, extra: 'sticker' },
  { name: 'Tampon', sample: 'COMPLET', style: { font: 'bebas', weight: 400, italic: false, align: 'center', tracking: 0.08 }, extra: 'stamp' },
  { name: 'Manuscrit', sample: 'à très vite', style: { font: 'caveat', weight: 600, italic: false, align: 'center' } },
  { name: 'Craie', sample: 'ce soir', style: { font: 'kalam', weight: 400, italic: false, align: 'center' } },
  { name: 'Feutre', sample: 'Entrée libre', style: { font: 'marker', weight: 400, italic: false, align: 'center' } },
  { name: 'Enseigne', sample: 'BAR', style: { font: 'bungee', weight: 400, italic: false, align: 'center' } },
  // le titre de l'affiche : deux lignes serrées, la queue du y file sous « Therapy »
  {
    name: 'Flow Therapy',
    sample: 'Flow\nTherapy',
    style: {
      font: 'shrikhand',
      weight: 400,
      italic: false,
      align: 'center',
      leading: 1,
      swashes: [
        {
          pts: [
            [4.08, 1.86, 0.75],
            [3.85, 2.08, 0.75],
            [3.45, 2.24, 0.75],
            [2.9, 2.31, 0.75],
            [2.2, 2.33, 0.75],
            [1.5, 2.31, 0.75],
            [0.9, 2.25, 0.75],
            [0.45, 2.15, 0.75],
            [0.12, 2.02, 0.75],
          ],
          w: 0.17,
          end: 'point',
        },
      ],
    },
    extra: 'sticker',
    size: 0.42,
  },
  { name: 'Psyché', sample: 'Flow Therapy', style: { font: 'shrikhand', weight: 400, italic: false, align: 'center', warp: { kind: 'bulge', amount: 0.6 } } },
  { name: 'Arche', sample: 'en concert', style: { font: 'bungee', weight: 400, italic: false, align: 'center', tracking: 0.04, warp: { kind: 'arc', amount: 0.5 } } },
  { name: 'Rétro', sample: 'Disco', style: { font: 'lobster', weight: 400, italic: false, align: 'center' } },
  { name: 'Titre', sample: 'Programme', style: { font: 'fraunces', weight: 800, italic: false, align: 'center' } },
  { name: 'Condensé', sample: 'SAMEDI 12', style: { font: 'oswald', weight: 600, italic: false, align: 'center' } },
  { name: 'Texte', sample: 'Infos pratiques', style: { font: 'inter', weight: 500, italic: false, align: 'left' } },
];

/** Version des polices chargées : à mettre dans les clés de cache qui dépendent des lettres. */
export const textEpoch = () => fontEpoch;
