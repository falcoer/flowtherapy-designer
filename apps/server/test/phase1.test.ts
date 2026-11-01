import { cp, mkdtemp, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { toFtsQuery } from '../src/search-index.js';

const repoLibrary = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../library');
let app: Awaited<ReturnType<typeof buildApp>>;
let root: string;
let cacheRoot: string;

function multipart(files: Array<{ name: string; data: Buffer }>, fields: Record<string, string> = {}) {
  const boundary = '----ftd' + Math.random().toString(16).slice(2);
  const chunks: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  for (const f of files) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${f.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`));
    chunks.push(f.data, Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'ftd-p1-'));
  await cp(repoLibrary, root, { recursive: true });
  cacheRoot = await mkdtemp(path.join(os.tmpdir(), 'ftd-p1-cache-'));
  app = await buildApp({ libraryRoot: root, cacheRoot, webFonts: false });
});
afterAll(() => app.close());

describe('recherche (SQLite FTS5)', () => {
  it('cherche par préfixe en ignorant les accents', async () => {
    const res = (await app.inject('/api/library?q=scene viol')).json();
    expect(res.map((e: { id: string }) => e.id)).toEqual(['trio-concert']);
  });
  it('filtre par type et par tags', async () => {
    expect((await app.inject('/api/library?type=text')).json().every((e: { type: string }) => e.type === 'text')).toBe(true);
    const tagged = (await app.inject('/api/library?tags=logo')).json();
    expect(tagged.map((e: { id: string }) => e.id)).toEqual(['logo-ft']);
  });
  it('échappe les guillemets de la requête', () => {
    expect(toFtsQuery('a"b')).toBe('"a"* AND "b"*');
    expect(toFtsQuery('  ')).toBeNull();
  });
});

describe('import dans la bibliothèque', () => {
  it('importe une image, extrait sa palette et l’indexe', async () => {
    // image moitié rouge, moitié bleue
    const png = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#d02020' } })
      .composite([{ input: await sharp({ create: { width: 100, height: 100, channels: 3, background: '#2040c0' } }).png().toBuffer(), left: 100, top: 0 }])
      .png()
      .toBuffer();
    const { payload, headers } = multipart([{ name: 'Affiche Été.png', data: png }], { tags: 'test,affiche' });
    const res = await app.inject({ method: 'POST', url: '/api/library/upload', payload, headers });
    expect(res.statusCode).toBe(200);
    const [image, palette] = res.json().created;
    expect(image).toMatchObject({ id: 'affiche-ete', type: 'image', meta: { width: 200, height: 100 }, palette: 'affiche-ete' });
    expect(palette.colors.length).toBeGreaterThanOrEqual(2);
    const hexes = palette.colors.map((c: { hex: string }) => c.hex);
    expect(hexes).toContain('#d02020');
    expect(hexes).toContain('#2040c0');
    expect((await app.inject('/api/library?tags=affiche')).json()).toHaveLength(2);
    // le YAML est bien écrit sur disque
    expect(await readFile(path.join(root, 'images/affiche-ete/element.yaml'), 'utf8')).toContain('source: source.png');
  });

  it('importe une police', async () => {
    const ttf = await readFile('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf').catch(() => null);
    if (!ttf) return;
    const { payload, headers } = multipart([{ name: 'DejaVuSerif-Bold.ttf', data: ttf }], { title: 'DejaVu Serif', weight: '700' });
    const res = await app.inject({ method: 'POST', url: '/api/library/upload', payload, headers });
    expect(res.json().created[0]).toMatchObject({ type: 'font', id: 'dejavu-serif', family: 'DejaVu Serif' });
  });

  it('refuse un type de fichier inconnu', async () => {
    const { payload, headers } = multipart([{ name: 'notes.txt', data: Buffer.from('x') }]);
    expect((await app.inject({ method: 'POST', url: '/api/library/upload', payload, headers })).statusCode).toBe(400);
  });
});

describe('cache de rendus', () => {
  it('génère une vignette WebP à la demande, une seule fois', async () => {
    const res = await app.inject('/cache/images/trio-concert/thumb');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/webp');
    const meta = await sharp(res.rawPayload).metadata();
    expect(meta.width).toBe(320);
    const file = path.join(cacheRoot, 'images/trio-concert/thumb.webp');
    const first = (await stat(file)).mtimeMs;
    await app.inject('/cache/images/trio-concert/thumb');
    expect((await stat(file)).mtimeMs).toBe(first);
  });
});

describe('export', () => {
  it('produit un SVG autonome avec images intégrées et balises remplacées', async () => {
    const res = await app.inject('/api/projects/concert-exemple/export?format=insta-carre&type=svg');
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('data:image/webp;base64');
    expect(res.body).toContain('En concert le 14 novembre');
    expect(res.body).not.toContain('{{');
  });

  it('rend un PNG à la taille du format', async () => {
    const res = await app.inject('/api/projects/concert-exemple/export?format=insta-carre&type=png');
    expect(res.statusCode).toBe(200);
    const meta = await sharp(res.rawPayload).metadata();
    expect([meta.width, meta.height]).toEqual([1080, 1080]);
  }, 60_000);

  it('rend un PDF A4', async () => {
    const res = await app.inject('/api/projects/concert-exemple/export?format=a4-portrait&type=pdf');
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect(res.headers['content-disposition']).toContain('concert-exemple-a4-portrait.pdf');
  }, 60_000);

  it('signale une ligne de mailing inexistante', async () => {
    const res = await app.inject('/api/projects/concert-exemple/export?type=svg&record=5');
    expect(res.statusCode).toBe(400);
  });
});
