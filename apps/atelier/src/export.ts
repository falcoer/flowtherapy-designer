import type { Format } from '@ftd/core';
import { type Doc } from './model';
import { drawLampTint, drawLayers, forgetPaint, holdPins } from './scene';

/** Taille de l'image exportée : 300 dpi pour l'imprimé, la taille native pour les écrans. */
export function exportSize(f: Format): { w: number; h: number } {
  if (f.unit === 'mm') {
    const dpi = f.dpi ?? 300;
    return { w: Math.round((f.width / 25.4) * dpi), h: Math.round((f.height / 25.4) * dpi) };
  }
  return { w: Math.round(f.width), h: Math.round(f.height) };
}

/** Le document décliné dans un autre format : les ancrages et les bords tenus suivent. */
export const docIn = (doc: Doc, f: Format): Doc => (doc.formatId === f.id ? doc : holdPins({ ...doc, formatId: f.id }, f));

/**
 * Rendu final d'un format, à sa taille d'export. Les photos se chargent en différé :
 * on redessine tant qu'il en arrive, jusqu'à ce que tout soit là.
 */
export async function renderDoc(doc: Doc, f: Format, maxSide = 6000): Promise<HTMLCanvasElement> {
  const { w, h } = exportSize(f);
  const k0 = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k0);
  c.height = Math.round(h * k0);
  const k = c.width / f.width;
  const d = docIn(doc, f);
  let late = 0;
  const draw = () => {
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    forgetPaint();
    drawLayers(ctx, d, f, { scale: k, onImage: () => late++ });
    drawLampTint(ctx, d, f);
  };
  draw();
  for (let i = 0; i < 20; i++) {
    const before = late;
    await new Promise((r) => setTimeout(r, 250));
    if (late === before && i > 0) break;
    if (late !== before) draw();
  }
  forgetPaint();
  return c;
}

const blobOf = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Image vide'))), type, q));

export const pngOf = (c: HTMLCanvasElement) => blobOf(c, 'image/png');

/** PDF d'une page à la taille du format, l'image en JPEG haute qualité. */
export async function pdfOf(c: HTMLCanvasElement, f: Format): Promise<Blob> {
  const jpg = new Uint8Array(await (await blobOf(c, 'image/jpeg', 0.94)).arrayBuffer());
  // points PDF : 72 par pouce ; les formats écran comptent 96 px par pouce
  const pw = f.unit === 'mm' ? (f.width / 25.4) * 72 : f.width * 0.75;
  const ph = f.unit === 'mm' ? (f.height / 25.4) * 72 : f.height * 0.75;
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const push = (x: string | Uint8Array) => {
    const b = typeof x === 'string' ? enc.encode(x) : x;
    parts.push(b);
    size += b.length;
  };
  const obj = (n: number, body: string | (() => void)) => {
    offsets[n] = size;
    push(`${n} 0 obj\n`);
    if (typeof body === 'string') push(body);
    else body();
    push('\nendobj\n');
  };
  const content = `q ${pw.toFixed(2)} 0 0 ${ph.toFixed(2)} 0 0 cm /Im0 Do Q`;
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw.toFixed(2)} ${ph.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, () => {
    push(`<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`);
    push(jpg);
    push('\nendstream');
  });
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = size;
  push(
    `xref\n0 6\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)
      .join('')}`,
  );
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}

/** Téléchargement d'un fichier (sur iPad : ouvre la feuille de partage ou l'aperçu). */
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Nom de fichier lisible : « affiche-concert-a4.png ». */
export const fileName = (title: string, f: Format, ext: string) =>
  `${
    title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'composition'
  }-${f.id}.${ext}`;
