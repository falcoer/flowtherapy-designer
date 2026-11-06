import { InteractiveSegmenter, type Stroke } from '@mediapipe/tasks-vision';

/**
 * Détourage du sujet, hors du fil principal : le modèle MediaPipe (Magic Touch v2)
 * analyse l'image une fois (setImage, quelques secondes), puis chaque touche ou
 * trait sur le sujet ne demande qu'un décodage rapide (segment).
 */

type In =
  | {
      id: number;
      type: 'image';
      bitmap: ImageBitmap;
      wasmLoaderPath: string;
      wasmBinaryPath: string;
      model: string;
    }
  | { id: number; type: 'segment'; strokes: Stroke[] };

let seg: Promise<InteractiveSegmenter> | null = null;
/** Portée du worker (les types du DOM décrivent la fenêtre). */
const ctx = self as unknown as {
  postMessage(m: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<In>) => void) | null;
};

/** Le modèle (30 Mo) est gardé dans le cache du navigateur : téléchargé une seule fois. */
async function modelBytes(url: string): Promise<Uint8Array> {
  let res: Response | undefined;
  const cache = 'caches' in self ? await caches.open('ftd-models').catch(() => undefined) : undefined;
  res = await cache?.match(url);
  if (!res) {
    res = await fetch(url);
    if (!res.ok) throw new Error(`modèle introuvable (${res.status})`);
    await cache?.put(url, res.clone()).catch(() => undefined);
  }
  return new Uint8Array(await res.arrayBuffer());
}

function segmenter(m: Extract<In, { type: 'image' }>) {
  seg ??= (async () => {
    const files = {
      wasmLoaderPath: m.wasmLoaderPath,
      wasmBinaryPath: m.wasmBinaryPath,
    };
    return InteractiveSegmenter.createFromOptions(files, {
      baseOptions: { modelAssetBuffer: await modelBytes(m.model) },
      canvas: new OffscreenCanvas(1, 1),
    });
  })().catch((e) => {
    seg = null;
    throw e;
  });
  return seg;
}

ctx.onmessage = async (e: MessageEvent<In>) => {
  const m = e.data;
  try {
    if (m.type === 'image') {
      const s = await segmenter(m);
      s.setImage(m.bitmap);
      m.bitmap.close();
      ctx.postMessage({ id: m.id, ok: true });
    } else {
      const s = await seg;
      if (!s) throw new Error('aucune image analysée');
      const mask = s.segment(m.strokes);
      const data = mask.getAsFloat32Array().slice();
      const out = { id: m.id, ok: true, w: mask.width, h: mask.height, data };
      mask.close();
      ctx.postMessage(out, [data.buffer]);
    }
  } catch (err) {
    ctx.postMessage({
      id: m.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
