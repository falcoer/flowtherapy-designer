import type { Format } from '@ftd/core';
import { applyPalette, GIFEncoder, quantize } from 'gifenc';
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { animTime, setAnimTime, setAnimTiming, timingOf, totalOf } from './anim';
import { docIn, renderDoc } from './export';
import { exportSize, type Doc } from './model';
import { drawLampTint, drawLayers, forgetPaint } from './scene';

/**
 * Export animé : la page est rendue image par image en faisant avancer l'horloge des formes animées,
 * puis encodée. MP4 (H.264, WebCodecs) pour les réseaux et la vidéo, à la durée prévue pour le média
 * (la boucle de la page se répète) ; GIF transparent pour un sticker, sur une seule boucle.
 */
export interface VideoJob {
  doc: Doc;
  f: Format;
  /** Durée de la vidéo (s). */
  seconds: number;
  fps: number;
  /** Côté le plus long, en pixels. */
  maxSide: number;
  width?: number;
  onProgress?: (done: number) => void;
}

/** Le navigateur sait-il encoder du MP4 ? (WebCodecs : Safari 16.4+, Chrome, Edge) */
export const canMp4 = () => typeof window !== 'undefined' && 'VideoEncoder' in window;

/** Prépare un rendu image par image : photos chargées une fois, puis chaque image dessinée sans attente. */
async function framer(job: VideoJob, opaque: boolean) {
  const { w, h } = exportSize(job.f, job.width);
  const k0 = Math.min(1, job.maxSide / Math.max(w, h));
  // H.264 veut des côtés pairs
  const W = Math.max(2, Math.round((w * k0) / 2) * 2);
  const H = Math.max(2, Math.round((h * k0) / 2) * 2);
  // un premier rendu complet charge les photos et les polices
  await renderDoc(job.doc, job.f, Math.max(W, H), job.width);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: !opaque })!;
  const mask = document.createElement('canvas');
  mask.width = W;
  mask.height = H;
  const k = W / job.f.width;
  const d = docIn(job.doc, job.f);
  const tm = timingOf(job.doc.timing);
  const total = totalOf(tm);
  const draw = (t: number) => {
    setAnimTiming(tm);
    setAnimTime(t % total);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // une vidéo n'a pas de transparence : la page blanche, comme à l'écran
    if (opaque) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.setTransform(k, 0, 0, k, 0, 0);
    drawLayers(ctx, d, job.f, { scale: k, onImage: () => {} });
    if (opaque) drawLampTint(ctx, d, job.f);
    else {
      // la teinte de la lampe couvre toute la page : sur un sticker, on la remet dans la silhouette des objets
      mask.getContext('2d')!.clearRect(0, 0, W, H);
      mask.getContext('2d')!.drawImage(c, 0, 0);
      drawLampTint(ctx, d, job.f);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(mask, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
    }
  };
  return { c, ctx, W, H, draw, total };
}

const CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'avc1.42e01f'];

export async function renderMp4(job: VideoJob): Promise<Blob> {
  if (!canMp4()) throw new Error('ce navigateur ne sait pas encoder de vidéo (Safari 16.4 ou plus récent, Chrome)');
  const keep = animTime();
  const { c, W, H, draw } = await framer(job, true);
  let codec = '';
  for (const x of CODECS) {
    const ok = await VideoEncoder.isConfigSupported({ codec: x, width: W, height: H, bitrate: 8e6, framerate: job.fps }).catch(() => null);
    if (ok?.supported) {
      codec = x;
      break;
    }
  }
  if (!codec) throw new Error(`format vidéo non pris en charge à ${W} × ${H}`);
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H, frameRate: job.fps }, fastStart: 'in-memory' });
  let failed: Error | null = null;
  const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => void (failed = e as Error) });
  // assez de débit pour les grains et les lueurs, sans fichier énorme
  enc.configure({ codec, width: W, height: H, bitrate: Math.min(12e6, Math.max(3e6, W * H * job.fps * 0.12)), framerate: job.fps });
  const n = Math.max(1, Math.round(job.seconds * job.fps));
  const us = 1e6 / job.fps;
  forgetPaint();
  try {
    for (let i = 0; i < n; i++) {
      if (failed) throw failed;
      draw(i / job.fps);
      const frame = new VideoFrame(c, { timestamp: Math.round(i * us), duration: Math.round(us) });
      enc.encode(frame, { keyFrame: i % (job.fps * 2) === 0 });
      frame.close();
      // le rendu va plus vite que l'encodeur : on lui laisse rattraper son retard
      while (enc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4));
      if (i % 5 === 0) {
        job.onProgress?.(i / n);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    await enc.flush();
    if (failed) throw failed;
  } finally {
    if (enc.state !== 'closed') enc.close();
    forgetPaint();
    setAnimTime(keep);
  }
  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

/** GIF animé à fond transparent (sticker) : une boucle de la page, répétée sans fin. */
export async function renderGif(job: VideoJob): Promise<Blob> {
  const keep = animTime();
  const { ctx, W, H, draw, total } = await framer(job, false);
  const n = Math.max(1, Math.round(Math.min(job.seconds, total) * job.fps));
  const gif = GIFEncoder();
  const delay = Math.round(1000 / job.fps);
  forgetPaint();
  try {
    for (let i = 0; i < n; i++) {
      draw(i / job.fps);
      const { data } = ctx.getImageData(0, 0, W, H);
      const palette = quantize(data, 256, { format: 'rgba4444', oneBitAlpha: true });
      const index = applyPalette(data, palette, 'rgba4444');
      const ti = palette.findIndex((p) => p[3] === 0);
      gif.writeFrame(index, W, H, { palette, delay, repeat: 0, ...(ti >= 0 ? { transparent: true, transparentIndex: ti } : {}), dispose: 2 });
      if (i % 3 === 0) {
        job.onProgress?.(i / n);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  } finally {
    forgetPaint();
    setAnimTime(keep);
  }
  gif.finish();
  return new Blob([gif.bytes() as Uint8Array<ArrayBuffer>], { type: 'image/gif' });
}
