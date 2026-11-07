import type { MultiPolygon } from 'polygon-clipping';
import wasmLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_module_internal.js?url&no-inline';
import wasmBinaryUrl from '@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url&no-inline';
import { intersect, type Ring } from './cut';
import type { Pt } from './model';
import { contours } from './text';

/**
 * Détourer le sujet : comme « isoler le sujet » sur iPhone. On touche le sujet
 * (ou on glisse dessus) et le modèle MediaPipe Magic Touch v2 en trouve le
 * contour ; un trait en mode Retirer enlève ce qui déborde. Tout se passe dans
 * le navigateur, dans un worker : rien n'est envoyé au serveur.
 */

/**
 * Modèle Magic Touch v2 (int8, 30 Mo, Apache 2.0), gardé dans le cache du navigateur après le premier usage.
 * VITE_SUBJECT_MODEL le remplace (par exemple servi par le VPS, ou en morceaux « a|b|c » pour la démo).
 */
export const SUBJECT_MODEL: string =
  import.meta.env.VITE_SUBJECT_MODEL || 'https://storage.googleapis.com/mediapipe-models/interactive_segmenter_v2/magic_touch/int8/1/interactive_segmentation.task';

/** Côté le plus long de l'image analysée, en pixels. */
export const SUBJECT_SIZE = 1024;

/** Un geste sur le sujet, en coordonnées de la couche (0..1) : ajouter, retirer, ou entourer une zone. */
export interface SubjectStroke {
  mode: 'add' | 'remove' | 'zone';
  pts: Pt[];
}

/** Partie de la couche analysée (coordonnées de la couche) : toute l'image, ou autour de la zone tracée. */
export interface SubjectCrop {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface SubjectMask {
  w: number;
  h: number;
  /** Confiance 0..1 par pixel, ligne par ligne. */
  data: Float32Array;
}

type Reply = {
  id: number;
  ok: boolean;
  error?: string;
  w?: number;
  h?: number;
  data?: Float32Array;
};

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, (r: Reply) => void>();

function call(msg: Record<string, unknown>, transfer: Transferable[] = []): Promise<Reply> {
  if (!worker) {
    worker = new Worker(new URL('./subject.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e: MessageEvent<Reply>) => {
      waiting.get(e.data.id)?.(e.data);
      waiting.delete(e.data.id);
    };
    worker.onerror = (e) => {
      for (const [, done] of waiting) done({ id: 0, ok: false, error: e.message || 'le détourage a échoué' });
      waiting.clear();
      worker?.terminate();
      worker = null;
    };
  }
  const id = ++seq;
  return new Promise((done) => {
    waiting.set(id, done);
    worker!.postMessage({ ...msg, id }, transfer);
  });
}

const abs = (u: string) => new URL(u, location.href).href;

/** Analyse une image (la couche rendue à plat, cadrée sur sa boîte). À refaire quand l'image change. */
export async function setSubjectImage(src: HTMLCanvasElement): Promise<void> {
  const bitmap = await createImageBitmap(src);
  const r = await call(
    {
      type: 'image',
      bitmap,
      wasmLoaderPath: abs(wasmLoaderUrl),
      wasmBinaryPath: abs(wasmBinaryUrl),
      model: SUBJECT_MODEL.split('|').map(abs).join('|'),
    },
    [bitmap],
  );
  if (!r.ok) throw new Error(r.error);
}

/** Masque du sujet pour ces traits, sur la dernière image analysée. */
export async function segmentSubject(strokes: SubjectStroke[]): Promise<SubjectMask | null> {
  if (!strokes.length) return null;
  const r = await call({
    type: 'segment',
    strokes: strokes.map((s) => ({
      brushMode: s.mode === 'add' ? 1 : s.mode === 'remove' ? 2 : 3,
      // un simple toucher : un point suffit au modèle
      point: s.pts.map((p) => ({
        x: Math.min(1, Math.max(0, p.x)),
        y: Math.min(1, Math.max(0, p.y)),
      })),
      isCompleted: true,
    })),
  });
  if (!r.ok) throw new Error(r.error);
  return { w: r.w!, h: r.h!, data: r.data! };
}

/** Masque → image teintée pour l'aperçu (le sujet en couleur, le reste transparent). */
export function maskImage(m: SubjectMask, rgb: [number, number, number]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = m.w;
  c.height = m.h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(m.w, m.h);
  for (let i = 0; i < m.data.length; i++) {
    const a = m.data[i]! >= 0.5 ? 255 : 0;
    img.data[i * 4] = rgb[0];
    img.data[i * 4 + 1] = rgb[1];
    img.data[i * 4 + 2] = rgb[2];
    img.data[i * 4 + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * Masque (sur le recadrage) → géométrie du sujet en coordonnées de la couche, gardée
 * dans `shape` (la découpe, ou la découpe ∩ la zone tracée). Les miettes (petits îlots, petits trous) sont écartées.
 */
export function subjectGeom(m: SubjectMask, shape: Ring[], crop: SubjectCrop = { u0: 0, v0: 0, u1: 1, v1: 1 }): MultiPolygon {
  const px = new Uint8ClampedArray(m.w * m.h * 4);
  for (let i = 0; i < m.data.length; i++) px[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, m.data[i]!)) * 255);
  const rings = contours(px, m.w, m.h, 128).map((r) => r.map((p) => ({ x: crop.u0 + (p.x / m.w) * (crop.u1 - crop.u0), y: crop.v0 + (p.y / m.h) * (crop.v1 - crop.v0) })));
  if (!rings.length) return [];
  const g = intersect(shape, rings);
  const area = (r: Array<[number, number]>) => {
    let s = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j]![0] + r[i]![0]) * (r[j]![1] - r[i]![1]);
    return Math.abs(s / 2);
  };
  const biggest = Math.max(0, ...g.map((p) => area(p[0]!)));
  const crumb = (4 / (m.w * m.h)) * 64;
  return g.filter((p) => area(p[0]!) >= Math.max(crumb, biggest * 0.02)).map((p) => [p[0]!, ...p.slice(1).filter((h) => area(h) >= crumb)]);
}
