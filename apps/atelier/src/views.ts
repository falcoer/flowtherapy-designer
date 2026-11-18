import type { CharView, Layer } from './model';
import { newRig, jointsText, rigJoints } from './stickers';

/**
 * Personnage en plusieurs angles : la même illustration vue de face, de trois-quarts, de profil et de dos. Chaque vue
 * garde son image, ses proportions et son squelette ; changer de vue échange l'image montrée sans toucher au reste
 * (place, taille, gestes, réglages).
 */
export const VIEWS = ['face', 'trois-quarts', 'profil', 'dos'] as const;
export type ViewKind = (typeof VIEWS)[number];
export const VIEW_NAMES: Record<ViewKind, string> = { face: 'Face', 'trois-quarts': 'Trois-quarts', profil: 'Profil', dos: 'Dos' };

/** La vue que désigne un nom de fichier (face.png, 3-4.png, side.png, back.png…), ou null. */
export function viewOfName(name: string): ViewKind | null {
  const n = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\.[a-z0-9]+$/, '');
  if (/(trois|three|3[-_ ]?4|quart)/.test(n)) return 'trois-quarts';
  if (/(profil|profile|side|cote)/.test(n)) return 'profil';
  if (/(dos|back|arriere|rear)/.test(n)) return 'dos';
  if (/(face|front|avant|devant)/.test(n)) return 'face';
  return null;
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
  return out.sort((a, b) => VIEWS.indexOf(a.view) - VIEWS.indexOf(b.view));
}

const IMG = /\.(png|jpe?g|webp|gif)$/i;

/** Les images d'une archive .zip (sans bibliothèque : l'en-tête central se lit à la main, la décompression passe par le navigateur). */
export async function readZip(blob: Blob): Promise<Array<{ name: string; blob: Blob }>> {
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
  const out: Array<{ name: string; blob: Blob }> = [];
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
    if (method === 0) out.push({ name: base, blob: new Blob([raw], { type }) });
    else if (method === 8) {
      const data = await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
      out.push({ name: base, blob: new Blob([data], { type }) });
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
export function setView(l: Layer, view: ViewKind, img: { src: string; ratio: number; cut?: string }, ownCut?: string): Partial<Layer> {
  const all = viewsOf(l);
  const base: CharView = { view, src: img.src, ratio: img.ratio, cut: img.cut };
  const order = (a: CharView, b: CharView) => VIEWS.indexOf(a.view as ViewKind) - VIEWS.indexOf(b.view as ViewKind);
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
export function characterOf(imgs: Array<{ view: ViewKind; src: string; ratio: number }>): Pick<Layer, 'src' | 'views' | 'view' | 'anim'> & { ratio: number } {
  const first = imgs[0]!;
  return {
    src: first.src,
    ratio: first.ratio,
    view: first.view,
    views: imgs.map((v) => ({ view: v.view, src: v.view === first.view ? '' : v.src, ratio: v.ratio })),
    anim: { ...newRig(first.ratio), view: first.view },
  };
}
