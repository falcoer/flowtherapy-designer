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
}

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
}
const cache = new Map<string, TextCut>();

/** Découpe des lettres en coordonnées 0..1 de leur boîte. */
export function textCut(t: TextStyle): TextCut {
  const key = JSON.stringify([t.content, t.font, t.weight, t.italic, t.align, t.tracking ?? 0, t.leading ?? 1.1, fontEpoch]);
  let c = cache.get(key);
  if (!c) {
    c = trace(t);
    if (cache.size > 200) cache.clear();
    cache.set(key, c);
  }
  return c;
}

function trace(t: TextStyle): TextCut {
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
  // un très long texte est rendu plus petit, pour rester dans un canevas raisonnable
  const k = Math.min(1, MAX_SIDE / (widest + size), MAX_SIDE / (lines.length * lead * size + size));
  size = Math.max(24, Math.floor(size * k));
  setup(probe, size);
  widest = Math.max(1, ...lines.map((l) => probe.measureText(l).width));
  // graisse hors de la plage de la police : on épaissit (ou amincit) le trait
  const extra = ((t.weight - real) / 500) * size * 0.05;
  const pad = Math.ceil(size * 0.5 + Math.abs(extra));
  const W = Math.ceil(widest + 2 * pad + size * 0.3);
  const H = Math.ceil(lines.length * lead * size + 2 * pad);
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
  lines.forEach((line, i) => {
    const w = ctx.measureText(line).width;
    const x = pad + (t.align === 'left' ? 0 : t.align === 'right' ? widest - w : (widest - w) / 2);
    const y = pad + (i + 0.8) * lead * size;
    ctx.fillText(line, x, y);
    if (extra > 0.3) {
      ctx.lineWidth = extra * 2;
      ctx.strokeText(line, x, y);
    }
  });
  if (extra < -0.3) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = -extra * 2;
    lines.forEach((line, i) => {
      const w = ctx.measureText(line).width;
      const x = pad + (t.align === 'left' ? 0 : t.align === 'right' ? widest - w : (widest - w) / 2);
      ctx.strokeText(line, x, pad + (i + 0.8) * lead * size);
    });
  }
  const alpha = ctx.getImageData(0, 0, W, H).data;
  const rings = contours(alpha, W, H, 128);
  // boîte de l'encre
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings)
    for (const p of r) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  if (!rings.length) {
    // texte vide : une boîte pleine, pour qu'on puisse encore toucher l'objet
    return { d: 'M0 0L1 0L1 1L0 1Z', ratio: Math.max(0.2, (size * 0.6) / (lead * size)), bw: size * 0.6, bh: lead * size };
  }
  const [bw, bh] = [x1 - x0 || 1, y1 - y0 || 1];
  const norm = rings.map((r) => simplifyRing(r, 0.35).map((p) => ({ x: (p.x - x0) / bw, y: (p.y - y0) / bh })));
  return { d: ringsToPath(norm, 1e-6, 55), ratio: bw / bh, bw: (bw * BODY) / size, bh: (bh * BODY) / size };
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
  { name: 'Rétro', sample: 'Disco', style: { font: 'lobster', weight: 400, italic: false, align: 'center' } },
  { name: 'Titre', sample: 'Programme', style: { font: 'fraunces', weight: 800, italic: false, align: 'center' } },
  { name: 'Condensé', sample: 'SAMEDI 12', style: { font: 'oswald', weight: 600, italic: false, align: 'center' } },
  { name: 'Texte', sample: 'Infos pratiques', style: { font: 'inter', weight: 500, italic: false, align: 'left' } },
];

/** Version des polices chargées : à mettre dans les clés de cache qui dépendent des lettres. */
export const textEpoch = () => fontEpoch;
