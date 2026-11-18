import type { CharView, Layer } from './model';
import { newRig, jointsText, rigJoints } from './stickers';

/**
 * Personnage en plusieurs angles : la même illustration vue de face, de trois-quarts, de profil et de dos. Chaque vue
 * garde son image, ses proportions et son squelette ; changer de vue échange l'image montrée sans toucher au reste
 * (place, taille, gestes, réglages).
 */
export const VIEWS = ['face', 'trois-quarts', 'profil', 'dos'] as const;
/**
 * Les vues de base, dans l'ordre d'un demi-tour : les quatre de la planche de rotation, plus le trois-quarts dos
 * (tourné vers le fond, de biais) entre le profil et le dos.
 */
export const BASES = ['face', 'trois-quarts', 'profil', 'dos-trois-quarts', 'dos'] as const;
export type ViewKind = (typeof BASES)[number];
/**
 * Toutes les vues qu'un objet peut garder : les quatre, plus le trois-quarts et le profil tournés vers la gauche
 * (dessinés, ou la vue de droite en miroir). Sans sens, une vue tournée regarde vers la droite de l'image.
 */
export const KEYS = ['face', 'trois-quarts', 'profil', 'dos-trois-quarts', 'dos', 'trois-quarts-gauche', 'profil-gauche', 'dos-trois-quarts-gauche'] as const;
export const VIEW_NAMES: Record<string, string> = {
  face: 'Face',
  'trois-quarts': 'Trois-quarts',
  profil: 'Profil',
  'dos-trois-quarts': 'Trois-quarts dos',
  dos: 'Dos',
  'trois-quarts-gauche': 'Trois-quarts (gauche)',
  'profil-gauche': 'Profil (gauche)',
  'dos-trois-quarts-gauche': 'Trois-quarts dos (gauche)',
};
/** Vue tournée (elle a un sens) ? */
export const turned = (v: string) => v.startsWith('profil') || v.startsWith('trois-quarts') || v.startsWith('dos-trois-quarts');
/** La vue de base d'une vue (sans son sens). */
export const baseOf = (v: string) => v.replace(/-gauche$/, '');
/** La vue à montrer pour une vue de base et un sens. */
export const keyFor = (base: string, facing?: string) => (facing === 'gauche' && turned(base) ? `${baseOf(base)}-gauche` : baseOf(base));
const rank = (v: string) => {
  const i = KEYS.indexOf(v as (typeof KEYS)[number]);
  return i < 0 ? 99 : i;
};

/** La vue que désigne un nom de fichier (face.png, 3-4.png, side.png, back.png…), ou null. */
export function viewOfName(name: string): ViewKind | null {
  const n = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\.[a-z0-9]+$/, '');
  const back = /(dos|back|arriere|rear)/.test(n);
  if (/(trois|three|3[-_ ]?4|quart)/.test(n)) return back ? 'dos-trois-quarts' : 'trois-quarts';
  if (/(profil|profile|side|cote)/.test(n)) return 'profil';
  if (/(dos|back|arriere|rear)/.test(n)) return 'dos';
  if (/(face|front|avant|devant)/.test(n)) return 'face';
  return null;
}

const TOKENS: Record<string, ViewKind> = {
  face: 'face', front: 'face', avant: 'face', devant: 'face',
  'trois-quarts': 'trois-quarts', 'trois-quart': 'trois-quarts', '3-4': 'trois-quarts', '34': 'trois-quarts', '3q': 'trois-quarts', 'three-quarter': 'trois-quarts', 'three-quarters': 'trois-quarts', quart: 'trois-quarts',
  profil: 'profil', profile: 'profil', side: 'profil', cote: 'profil',
  dos: 'dos', back: 'dos', arriere: 'dos', rear: 'dos',
  'dos-trois-quarts': 'dos-trois-quarts', 'trois-quarts-dos': 'dos-trois-quarts', 'dos-3-4': 'dos-trois-quarts', '3-4-dos': 'dos-trois-quarts', 'dos-34': 'dos-trois-quarts', 'back-three-quarter': 'dos-trois-quarts', 'back-three-quarters': 'dos-trois-quarts', 'three-quarter-back': 'dos-trois-quarts', 'back-3-4': 'dos-trois-quarts', 'back-34': 'dos-trois-quarts',
};
/** La vue d'un mot de la convention (« profil », « profil-gauche », « side-left »…), sans deviner : null sinon. */
export function viewOfToken(tok: string): ViewKind | null {
  const t = tok.toLowerCase().replace(/_/g, '-').replace(/-(gauche|droite|left|right)$/, '');
  return TOKENS[t] ?? null;
}

/** Range des images dans les vues : d'après leur nom, puis les autres dans l'ordre face, trois-quarts, profil, dos. */
export function assignViews<T extends { name: string }>(files: T[]): Array<{ view: ViewKind; file: T }> {
  const out: Array<{ view: ViewKind; file: T }> = [];
  const rest: T[] = [];
  for (const f of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    const v = viewOfName(f.name);
    if (v && !out.some((o) => o.view === v)) out.push({ view: v, file: f });
    else rest.push(f);
  }
  for (const f of rest) {
    const v = VIEWS.find((k) => !out.some((o) => o.view === k));
    if (!v) break;
    out.push({ view: v, file: f });
  }
  return out.sort((a, b) => BASES.indexOf(a.view) - BASES.indexOf(b.view));
}

const IMG = /\.(png|jpe?g|webp|gif)$/i;

/** Les images d'une archive .zip (sans bibliothèque : l'en-tête central se lit à la main, la décompression passe par le navigateur). */
export async function readZip(blob: Blob): Promise<Array<{ name: string; path: string; blob: Blob }>> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // fin de l'annuaire central : signature 0x06054b50, cherchée depuis la fin (le commentaire fait au plus 65 535 octets)
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--)
    if (dv.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error('Archive .zip illisible');
  const count = dv.getUint16(end + 10, true);
  let p = dv.getUint32(end + 16, true);
  const out: Array<{ name: string; path: string; blob: Blob }> = [];
  const dec = new TextDecoder();
  for (let k = 0; k < count && p + 46 <= buf.length; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const [nl, xl, cl] = [dv.getUint16(p + 28, true), dv.getUint16(p + 30, true), dv.getUint16(p + 32, true)];
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + xl + cl;
    const base = name.split('/').pop() ?? '';
    // dossiers, fichiers cachés de macOS (__MACOSX/, ._x) et tout ce qui n'est pas une image : ignorés
    if (!IMG.test(base) || base.startsWith('.') || name.includes('__MACOSX')) continue;
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const raw = buf.slice(start, start + size);
    const type = /png$/i.test(base) ? 'image/png' : /webp$/i.test(base) ? 'image/webp' : /gif$/i.test(base) ? 'image/gif' : 'image/jpeg';
    if (method === 0) out.push({ name: base, path: name, blob: new Blob([raw], { type }) });
    else if (method === 8) {
      const data = await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
      out.push({ name: base, path: name, blob: new Blob([data], { type }) });
    }
  }
  return out;
}

/**
 * Une image lue et réduite à `max` pixels de côté : une image détourée (des pixels transparents) reste en PNG,
 * une image pleine passe en JPEG, plus léger.
 */
export async function loadImage(blob: Blob, max = 2400): Promise<{ src: string; ratio: number }> {
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  const cx = c.getContext('2d')!;
  cx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  let clear = false;
  if (!/jpe?g|heic|heif/i.test(blob.type)) {
    const px = cx.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < px.length; i += 4)
      if (px[i]! < 255) {
        clear = true;
        break;
      }
  }
  return { src: clear ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.9), ratio: c.width / c.height };
}

/** Les vues d'un personnage, la vue montrée comprise (avec son image et son squelette actuels). */
export function viewsOf(l: Layer): CharView[] {
  if (!l.views?.length) return [];
  return l.views.map((v) => (v.view === l.view ? { ...v, src: l.src ?? '', ratio: l.w / l.h, j: typeof l.anim?.j === 'string' ? l.anim.j : v.j, cut: l.cut, molded: l.molded } : v));
}

/**
 * Montre une autre vue : l'image, les proportions, le squelette et la découpe de cette vue remplacent ceux de la vue
 * montrée, qui sont rangés dans la liste. La hauteur, la place et les gestes restent.
 */
export function showView(l: Layer, view: string): Partial<Layer> {
  const all = viewsOf(l);
  const to = all.find((v) => v.view === view);
  if (!to || view === l.view) return {};
  const anim = l.anim?.kind === 'rig' ? { ...l.anim, ratio: to.ratio, view, j: to.j ?? jointsText(rigJoints({ ...l.anim, ratio: to.ratio, view, j: undefined })) } : l.anim;
  return {
    // une forme n'a pas d'image : seul son contour change
    src: to.src || undefined,
    view,
    views: all.map((v) => (v.view === view ? { ...v, src: '' } : v)),
    w: l.h * to.ratio,
    cut: to.cut,
    molded: to.molded,
    anim,
  };
}

/**
 * Ajoute (ou remplace) une vue : l'image d'une illustration, ou le contour d'une forme (`cut`, avec `ownCut` le contour
 * actuel de la forme, qu'elle garde pour sa propre vue). La vue montrée est remplacée sur place.
 */
export function setView(l: Layer, view: string, img: { src: string; ratio: number; cut?: string }, ownCut?: string): Partial<Layer> {
  const all = viewsOf(l);
  const base: CharView = { view, src: img.src, ratio: img.ratio, cut: img.cut };
  const order = (a: CharView, b: CharView) => rank(a.view) - rank(b.view);
  if (!all.length) {
    // un objet seul devient un objet à plusieurs vues : ce qu'il montre est la vue de face (ou celle qu'on n'ajoute pas)
    const own: CharView = { view: view === 'face' ? 'trois-quarts' : 'face', src: l.src ?? '', ratio: l.w / l.h, cut: l.cut ?? ownCut, molded: l.molded };
    const views = [own, base].sort(order).map((v) => (v.view === own.view ? { ...v, src: '' } : v));
    return { ...(l.kind === 'photo' ? rigged(l, own) : {}), cut: own.cut, views, view: own.view };
  }
  const views = [...all.filter((v) => v.view !== view), base].sort(order).map((v) => (v.view === l.view ? { ...v, src: '' } : v));
  if (view !== l.view) return { views };
  // la vue montrée change : on la montre telle qu'ajoutée (squelette de départ)
  return { src: img.src || l.src, w: l.h * img.ratio, cut: img.cut, molded: undefined, views, anim: l.anim?.kind === 'rig' ? { ...l.anim, ratio: img.ratio, j: undefined } : l.anim };
}

/** Un personnage tout juste importé, ou une photo qui devient personnage, reçoit un squelette s'il n'a pas d'animation. */
function rigged(l: Layer, v: CharView): Partial<Layer> {
  if (l.anim) return l.anim.kind === 'rig' ? { anim: { ...l.anim, view: v.view } } : {};
  return { anim: { ...newRig(v.ratio), view: v.view } };
}

/** Le calque d'un personnage importé : la première vue est montrée, toutes ont un squelette posé sur leur gabarit. */
export function characterOf(imgs: Array<{ view: string; src: string; ratio: number }>): Pick<Layer, 'src' | 'views' | 'view' | 'anim'> & { ratio: number } {
  const first = imgs[0]!;
  return {
    src: first.src,
    ratio: first.ratio,
    view: first.view,
    views: [...imgs].sort((a, b) => rank(a.view) - rank(b.view)).map((v) => ({ view: v.view, src: v.view === first.view ? '' : v.src, ratio: v.ratio })),
    anim: { ...newRig(first.ratio), view: first.view },
  };
}

/**
 * Ce que dit le chemin d'un fichier d'après la convention de nommage (conventions-nommage.md) :
 * « personnage__vue[-sens][__élément].png », ou « personnage/vue[-sens][__élément].png ».
 * `sheet` : une planche de rotation entière (« __planche »). `view` null : un nom libre, rangé ensuite dans l'ordre.
 */
export function parseName(path: string): { who: string; view: string | null; part: string; sheet: boolean } {
  const clean = (x: string) =>
    x
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  const segs = path.split('/').filter(Boolean);
  const file = clean(segs.pop() ?? '').replace(/\.[a-z0-9]+$/, '');
  const folder = segs.length ? clean(segs[segs.length - 1]!) : '';
  let parts = file.split('__');
  let who = folder;
  if (parts.length >= 2 && (!who || !viewOfToken(parts[0]!))) [who, parts] = [who || parts[0]!, parts.slice(1)];
  const [tok = '', part = ''] = parts;
  if (/^(planche|sheet|turnaround|rotation)/.test(tok)) return { who, view: null, part: '', sheet: true };
  // un nom en « __ » suit la convention à la lettre ; un nom libre (« Lama-FACE.png ») est lu plus largement
  const base = parts.length > 1 || folder ? viewOfToken(tok) : (viewOfToken(tok) ?? viewOfName(tok));
  const left = /[-_ ](gauche|left)$/.test(tok);
  return { who, view: base ? (left && turned(base) ? `${base}-gauche` : base) : null, part, sheet: false };
}

/** Les fichiers d'une importation, rangés par personnage : ses vues, ses éléments détachés (par vue), ses planches, ses noms libres. */
export function groupCharacters<T extends { name: string; path?: string }>(files: T[]) {
  const out = new Map<string, { views: Map<string, T>; parts: Map<string, Map<string, T>>; sheets: T[]; loose: T[] }>();
  for (const f of files) {
    const n = parseName(f.path ?? f.name);
    let c = out.get(n.who);
    if (!c) out.set(n.who, (c = { views: new Map(), parts: new Map(), sheets: [], loose: [] }));
    if (n.sheet) c.sheets.push(f);
    else if (!n.view) c.loose.push(f);
    else if (n.part) {
      if (!c.parts.has(n.part)) c.parts.set(n.part, new Map());
      c.parts.get(n.part)!.set(n.view, f);
    } else if (!c.views.has(n.view)) c.views.set(n.view, f);
    else c.loose.push(f);
  }
  return out;
}

/** Un contour (chemin SVG en coordonnées 0..1 de la boîte) retourné de gauche à droite. */
export function mirrorPath(d: string): string {
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const out: string[] = [];
  let cmd = '';
  let i = 0;
  // nombre de valeurs par commande, et lesquelles sont des x
  const shape: Record<string, { n: number; xs: number[]; arc?: boolean }> = { M: { n: 2, xs: [0] }, L: { n: 2, xs: [0] }, T: { n: 2, xs: [0] }, H: { n: 1, xs: [0] }, V: { n: 1, xs: [] }, C: { n: 6, xs: [0, 2, 4] }, S: { n: 4, xs: [0, 2] }, Q: { n: 4, xs: [0, 2] }, A: { n: 7, xs: [5], arc: true }, Z: { n: 0, xs: [] } };
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i]!)) {
      cmd = toks[i++]!;
      out.push(cmd);
      if (cmd.toUpperCase() === 'Z') continue;
    }
    const sp = shape[cmd.toUpperCase()];
    if (!sp || !sp.n) {
      i++;
      continue;
    }
    const rel = cmd === cmd.toLowerCase();
    const vals = toks.slice(i, i + sp.n).map(Number);
    i += sp.n;
    sp.xs.forEach((k) => (vals[k] = rel ? -vals[k]! : 1 - vals[k]!));
    // un arc retourné tourne dans l'autre sens
    if (sp.arc) vals[4] = vals[4] ? 0 : 1;
    out.push(vals.map((v) => String(Math.round(v * 1e5) / 1e5)).join(' '));
  }
  return out.join(' ');
}

/** Articulations retournées : chaque point de l'autre côté, et la gauche de l'image (L) échangée avec la droite (R). */
export function mirrorJoints(j: string | undefined): string | undefined {
  if (!j) return undefined;
  const P = j.split(';').map((s) => s.split(',').map(Number));
  // ordre des articulations (RIG_JOINTS) : tête, cou, bassin, puis épaule/coude/main L, R, hanche/genou/pied L, R
  const swap = [0, 1, 2, 6, 7, 8, 3, 4, 5, 12, 13, 14, 9, 10, 11];
  return swap.map((k) => P[k] ?? [0.5, 0.5]).map(([x, y]) => `${Math.round((1 - x!) * 1e4) / 1e4},${y}`).join(';');
}

/** Une vue retournée en miroir (image, contour, articulations), pour regarder de l'autre côté. */
export async function mirrorView(v: CharView, key: string): Promise<CharView> {
  let src = v.src;
  if (src) {
    const im = new Image();
    im.src = src;
    await im.decode();
    const c = document.createElement('canvas');
    [c.width, c.height] = [im.naturalWidth, im.naturalHeight];
    const cx = c.getContext('2d')!;
    cx.translate(c.width, 0);
    cx.scale(-1, 1);
    cx.drawImage(im, 0, 0);
    src = src.startsWith('data:image/jpeg') ? c.toDataURL('image/jpeg', 0.9) : c.toDataURL('image/png');
  }
  return { view: key, src, ratio: v.ratio, cut: v.cut && mirrorPath(v.cut), j: mirrorJoints(v.j), mirror: 1 };
}

/** Les vues tournées vers la gauche qui manquent, tirées de celles de droite en miroir. */
export async function leftViews(all: CharView[]): Promise<CharView[]> {
  const out: CharView[] = [];
  for (const base of ['trois-quarts', 'profil', 'dos-trois-quarts']) {
    const left = `${base}-gauche`;
    const right = all.find((v) => v.view === base);
    if (right && !all.some((v) => v.view === left)) out.push(await mirrorView(right, left));
  }
  return out;
}

/** Place de chaque vue sur l'anneau, en degrés : 0 devant (face), 90 tourné vers la droite, 180 dos, 270 vers la gauche. */
export const RING: Record<string, number> = { face: 0, 'trois-quarts': 45, profil: 90, 'dos-trois-quarts': 135, dos: 180, 'dos-trois-quarts-gauche': 225, 'profil-gauche': 270, 'trois-quarts-gauche': 315 };

/** Les vues qu'on peut montrer : celles qui existent, plus celles de gauche qu'un miroir peut tirer de celles de droite. */
export function ringViews(l: Layer): string[] {
  const has = new Set(viewsOf(l).map((v) => v.view));
  return Object.keys(RING).filter((k) => has.has(k) || (k.endsWith('-gauche') && has.has(baseOf(k))));
}

/** La vue de l'anneau la plus proche d'un angle (degrés), parmi celles qu'on peut montrer. */
export function nearestView(keys: string[], deg: number): string | null {
  let best: string | null = null;
  let gap = Infinity;
  for (const k of keys) {
    const d = Math.abs((((deg - RING[k]!) % 360) + 540) % 360 - 180);
    if (d < gap) [best, gap] = [k, d];
  }
  return best;
}

/**
 * Tourne l'objet vers une vue de l'anneau : une vue de gauche qui manque est tirée en miroir de celle de droite,
 * et le sens où il regarde suit (gauche, droite ; face et dos le gardent).
 */
export async function turnTo(l: Layer, key: string): Promise<Partial<Layer>> {
  if (key === l.view) return {};
  let all = viewsOf(l);
  if (!all.some((v) => v.view === key)) {
    const right = all.find((v) => v.view === baseOf(key));
    if (!key.endsWith('-gauche') || !right) return {};
    all = [...all, await mirrorView(right, key)];
  }
  const facing = turned(key) ? (key.endsWith('-gauche') ? 'gauche' : undefined) : l.facing;
  const views = all.map((x) => (x.view === l.view ? { ...x, src: '' } : x));
  const next = { ...l, views, facing } as Layer;
  return { views, facing, ...showView(next, key) };
}
