import { RIG_BONES, RIG_JOINTS, TEMPLATE_WIDTH, templateJoints } from './anim';
import { VIEWS, VIEW_NAMES, type ViewKind } from './views';

/**
 * Le kit pour générer un personnage en plusieurs angles avec un générateur d'images (GPT…) : les gabarits de chaque vue,
 * la planche de rotation (les quatre vues côte à côte) et le prompt, dans une archive .zip téléchargée depuis l'atelier.
 * Les gabarits sont dessinés ici, d'après les mêmes poses que le squelette : une image qui les suit se cale d'elle-même.
 */

/** Dessine le gabarit d'une vue dans un rectangle (x, y, w, h) : silhouette grise, os et articulations. */
function drawTemplate(cx: CanvasRenderingContext2D, view: ViewKind, x: number, y: number, w: number, h: number, label = true) {
  // à pleine hauteur, mais assez petit pour que les mains (±0,3 de la hauteur) restent dans leur case
  const tall = Math.min(h * 0.86, (w * 0.8) / 0.66);
  const top = y + (h - tall) / 2 - (label ? h * 0.03 : 0);
  const J = templateJoints(1, view).map(([u, v]) => [x + w / 2 + (u - 0.5) * tall, top + v * tall] as const);
  const at = (k: string) => J[RIG_JOINTS.indexOf(k as never)]!;
  cx.save();
  cx.lineCap = 'round';
  cx.fillStyle = cx.strokeStyle = '#c8c8ce';
  // de profil et de trois-quarts (tourné vers la droite), les membres du fond (côté droit de l'image) sont plus sombres et passent derrière
  const turned = view === 'profil' || view === 'trois-quarts';
  const far = (k: string) => turned && k.endsWith('R') && k !== 'shR' && k !== 'hipR';
  const order = RIG_BONES.map((b, i) => [b, i] as const).sort(([b1], [b2]) => Number(far(b2[1])) - Number(far(b1[1])));
  order.forEach(([[p, c], i]) => {
    const [A, B] = [at(p), at(c)];
    // de profil, le tronc se voit sur son épaisseur, plus étroite que sa largeur
    const r = TEMPLATE_WIDTH[i]! * tall * (view === 'profil' && i >= 1 && i <= 5 ? 0.72 : 1);
    cx.fillStyle = cx.strokeStyle = far(c) ? '#a9a9b2' : '#c8c8ce';
    if (i === 0) {
      cx.beginPath();
      cx.arc(B[0], B[1], r, 0, 2 * Math.PI);
      cx.fill();
      // le nez montre où regarde le personnage (aucun sur la face et le dos)
      if (view === 'profil' || view === 'trois-quarts') {
        const dx = view === 'profil' ? r * 0.95 : r * 0.55;
        cx.beginPath();
        cx.moveTo(B[0] + dx - r * 0.1, B[1] - r * 0.25);
        cx.lineTo(B[0] + dx + r * 0.32, B[1] + r * 0.12);
        cx.lineTo(B[0] + dx - r * 0.1, B[1] + r * 0.3);
        cx.fill();
      }
      return;
    }
    cx.lineWidth = 2 * r;
    cx.beginPath();
    cx.moveTo(A[0], A[1]);
    cx.lineTo(B[0], B[1]);
    cx.stroke();
  });
  // le dos se reconnaît à sa colonne marquée ; la face, à ses yeux
  const head = at('head');
  const hr = TEMPLATE_WIDTH[0]! * tall;
  cx.fillStyle = '#9a9aa4';
  if (view === 'face') for (const s of [-1, 1]) (cx.beginPath(), cx.arc(head[0] + s * hr * 0.35, head[1] - hr * 0.05, hr * 0.1, 0, 2 * Math.PI), cx.fill());
  if (view === 'trois-quarts') for (const s of [0.05, 0.55]) (cx.beginPath(), cx.arc(head[0] + s * hr, head[1] - hr * 0.05, hr * 0.09, 0, 2 * Math.PI), cx.fill());
  if (view === 'profil') (cx.beginPath(), cx.arc(head[0] + hr * 0.55, head[1] - hr * 0.05, hr * 0.09, 0, 2 * Math.PI), cx.fill());
  cx.lineWidth = Math.max(1, tall * 0.004);
  cx.strokeStyle = '#7a5cff';
  for (const [p, c] of RIG_BONES) {
    cx.beginPath();
    cx.moveTo(...at(p));
    cx.lineTo(...at(c));
    cx.stroke();
  }
  for (const P of J) {
    cx.beginPath();
    cx.arc(P[0], P[1], tall * 0.008, 0, 2 * Math.PI);
    cx.fillStyle = '#fff';
    cx.fill();
    cx.stroke();
  }
  // la ligne du sol, commune à toutes les vues
  cx.strokeStyle = '#d8d8de';
  cx.beginPath();
  cx.moveTo(x + w * 0.08, top + tall * 0.975);
  cx.lineTo(x + w * 0.92, top + tall * 0.975);
  cx.stroke();
  if (label) {
    cx.fillStyle = '#8a8a94';
    cx.font = `600 ${Math.round(h * 0.03)}px system-ui, sans-serif`;
    cx.textAlign = 'center';
    cx.fillText(VIEW_NAMES[view], x + w / 2, y + h * 0.985);
  }
  cx.restore();
}

const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const cx = c.getContext('2d')!;
  cx.fillStyle = '#fff';
  cx.fillRect(0, 0, w, h);
  return [c, cx] as const;
};
const png = (c: HTMLCanvasElement) => new Promise<Uint8Array>((ok, ko) => c.toBlob((b) => (b ? b.arrayBuffer().then((a) => ok(new Uint8Array(a))) : ko(new Error('png'))), 'image/png'));

/** Le prompt à donner au générateur, avec la planche et (si on l'a) une image du personnage. */
export const KIT_PROMPT = `KIT PERSONNAGE MULTI-ANGLE — Flow Therapy Designer
====================================================

1. Dans GPT, joins « planche-rotation.png » (et une image de ton personnage si tu en as une), puis colle ce prompt :

---
Character turnaround sheet of [DÉCRIS TON PERSONNAGE ICI, ou : the character in the attached reference image].
Exactly 4 full-body views side by side, from left to right: front view, three-quarter view (turned toward the right), side profile view (facing right), back view.
Follow the attached template exactly for the pose, the proportions and the placement of each view.
Same character, same outfit, same colors and same scale in all 4 views; the tops of the heads aligned, all feet standing on the same ground line.
A-pose: arms held away from the body at about 30 degrees, elbows almost straight, hands open and empty, nothing held in the hands; legs slightly apart, feet flat.
In the three-quarter and side views both arms and both legs stay clearly visible: the far arm swings slightly back, the near arm slightly forward, the legs in a small stride (the darker limbs of the template are the far ones).
Hair, ears and accessories stay behind the shoulders, never over the arms. Clothes fit close to the body at the elbows and knees.
Plain flat pure white background, no shadow, no text, no frame, no extra objects, generous empty space between the views.
---

2. Les objets tenus (micro, guitare…) se génèrent à part, puis s'attachent à la main dans l'atelier.

3. Une vue à la fois, si la planche n'est pas fidèle : joins le gabarit de la vue (gabarit-face.png, gabarit-trois-quarts.png,
   gabarit-profil.png, gabarit-dos.png) et la planche déjà obtenue, puis :

---
Same character as in the attached sheet, only the [front / three-quarter / side profile / back] view, full body,
in exactly the pose of the attached template, plain pure white background, no shadow, no text.
---

4. Dans l'atelier : ＋ › Illustrations › « Importer un personnage (plusieurs vues) ».
   - la planche entière (les 4 vues sont découpées et détourées toutes seules), ou
   - les images une à une, ou un .zip, nommées face.png, trois-quarts.png, profil.png, dos.png.
   Chaque vue reçoit son squelette posé sur son gabarit ; « Caler sur le gabarit » le remet en place, les articulations se glissent au doigt.
`;

/** L'archive du kit : gabarits des 4 vues, planche de rotation, prompt. */
export async function kitZip(): Promise<Blob> {
  const files: Array<{ name: string; data: Uint8Array }> = [];
  const [sheet, sx] = canvas(3200, 1200);
  VIEWS.forEach((v, i) => drawTemplate(sx, v, i * 800, 0, 800, 1200));
  files.push({ name: 'planche-rotation.png', data: await png(sheet) });
  for (const v of VIEWS) {
    const [c, cx] = canvas(1024, 1536);
    drawTemplate(cx, v, 0, 0, 1024, 1536, false);
    files.push({ name: `gabarit-${v}.png`, data: await png(c) });
  }
  files.push({ name: 'prompt.txt', data: new TextEncoder().encode(KIT_PROMPT) });
  return zipStore(files);
}

/** Archive .zip sans compression (les PNG sont déjà compressés) : en-têtes locaux, annuaire central, fin. */
export function zipStore(files: Array<{ name: string; data: Uint8Array }>): Blob {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const enc = new TextEncoder();
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true);
    head.setUint16(4, 20, true);
    head.setUint16(6, 0x0800, true); // noms en UTF-8
    head.setUint16(12, DOS_DATE, true);
    head.setUint32(14, crc, true);
    head.setUint32(18, f.data.length, true);
    head.setUint32(22, f.data.length, true);
    head.setUint16(26, name.length, true);
    parts.push(new Uint8Array(head.buffer), name, f.data);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(14, DOS_DATE, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, f.data.length, true);
    dir.setUint32(24, f.data.length, true);
    dir.setUint16(28, name.length, true);
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], { type: 'application/zip' });
}

/** Date des fichiers de l'archive (format DOS) : 1er janvier 2026. */
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

let CRC: Uint32Array | null = null;
function crc32(d: Uint8Array): number {
  if (!CRC) {
    CRC = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Découpe une planche de rotation (les vues côte à côte sur un fond uni) : le fond est rendu transparent depuis les bords,
 * puis chaque bande de colonnes non vide devient une vue, recadrée au plus près, toutes à la même échelle.
 * Rend null quand l'image ne ressemble pas à une planche (moins de deux bandes).
 */
export async function splitSheet(blob: Blob): Promise<Array<{ name: string; blob: Blob }> | null> {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, 4800 / bmp.width);
  const [W, H] = [Math.round(bmp.width * k), Math.round(bmp.height * k)];
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const cx = c.getContext('2d', { willReadFrequently: true })!;
  cx.drawImage(bmp, 0, 0, W, H);
  bmp.close();
  const img = cx.getImageData(0, 0, W, H);
  const px = img.data;
  // fond : la couleur des coins ; il s'efface par remplissage depuis les bords (le blanc d'un œil reste)
  const bg = [0, 1, 2].map((i) => (px[i]! + px[(W - 1) * 4 + i]! + px[(H - 1) * W * 4 + i]! + px[(H * W - 1) * 4 + i]!) / 4);
  const near = (p: number) => px[p * 4 + 3]! < 16 || Math.abs(px[p * 4]! - bg[0]!) + Math.abs(px[p * 4 + 1]! - bg[1]!) + Math.abs(px[p * 4 + 2]! - bg[2]!) < 60;
  const seen = new Uint8Array(W * H);
  const stack: number[] = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const p = stack.pop()!;
    if (seen[p] || !near(p)) continue;
    seen[p] = 1;
    px[p * 4 + 3] = 0;
    const [x, y] = [p % W, (p / W) | 0];
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - W);
    if (y < H - 1) stack.push(p + W);
  }
  // bandes de colonnes qui portent du dessin
  const col = new Uint32Array(W);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (px[(y * W + x) * 4 + 3]! > 32) col[x]++;
  const runs: Array<[number, number]> = [];
  const min = Math.max(2, H * 0.004);
  for (let x = 0, s = -1; x <= W; x++) {
    const on = x < W && col[x]! > min;
    if (on && s < 0) s = x;
    if (!on && s >= 0) {
      runs.push([s, x]);
      s = -1;
    }
  }
  // de petites bandes voisines (une main écartée, une mèche) rejoignent la plus proche
  const big = runs.filter(([a, b]) => b - a > W * 0.03);
  if (big.length < 2) return null;
  const parts = big.slice(0, 4).map(([a, b]) => [a, b] as [number, number]);
  for (const [a, b] of runs) {
    if (b - a > W * 0.03) continue;
    let best = 0;
    parts.forEach(([pa, pb], i) => {
      if (Math.min(Math.abs(a - pb), Math.abs(pa - b)) < Math.min(Math.abs(a - parts[best]![1]), Math.abs(parts[best]![0] - b))) best = i;
    });
    parts[best] = [Math.min(parts[best]![0], a), Math.max(parts[best]![1], b)];
  }
  cx.putImageData(img, 0, 0);
  const out: Array<{ name: string; blob: Blob }> = [];
  for (let i = 0; i < parts.length; i++) {
    const [a, b] = parts[i]!;
    let [t, bo] = [H, 0];
    for (let y = 0; y < H; y++)
      for (let x = a; x < b; x++)
        if (px[(y * W + x) * 4 + 3]! > 32) {
          t = Math.min(t, y);
          bo = Math.max(bo, y);
          break;
        }
    const pad = Math.round(H * 0.01);
    const [x0, y0] = [Math.max(0, a - pad), Math.max(0, t - pad)];
    const [w, h] = [Math.min(W, b + pad) - x0, Math.min(H, bo + pad) - y0];
    const o = document.createElement('canvas');
    o.width = w;
    o.height = h;
    o.getContext('2d')!.drawImage(c, x0, y0, w, h, 0, 0, w, h);
    const piece = await new Promise<Blob>((ok, ko) => o.toBlob((bb) => (bb ? ok(bb) : ko(new Error('png'))), 'image/png'));
    out.push({ name: `${VIEWS[i]}.png`, blob: piece });
  }
  return out;
}
