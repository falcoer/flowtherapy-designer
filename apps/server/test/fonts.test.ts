import { cp, mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { googleSource, parseMetadata, publicUrl } from '../src/fonts.js';

const repoLibrary = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/library');
const TTF = Buffer.concat([Buffer.from([0, 1, 0, 0]), Buffer.alloc(60)]);
const META = `name: "Lora"
designer: "Cyreal"
license: "OFL"
category: "SERIF"
fonts {
  name: "Lora"
  style: "normal"
  weight: 400
  filename: "Lora[wght].ttf"
}
fonts {
  name: "Lora"
  style: "italic"
  weight: 400
  filename: "Lora-Italic[wght].ttf"
}
axes {
  tag: "wght"
  min_value: 400.0
  max_value: 700.0
}
`;

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ftd-fonts-'));
  const lib = path.join(root, 'library');
  await cp(repoLibrary, lib, { recursive: true });
  const asked: string[] = [];
  const fakeFetch = (async (u: string) => {
    asked.push(String(u));
    const url = String(u);
    if (url.endsWith('/ofl/lora/METADATA.pb')) return new Response(META);
    if (url.includes('/ofl/lora/') && url.includes('.ttf')) return new Response(TTF);
    if (url.endsWith('/ofl/lora/OFL.txt')) return new Response('SIL Open Font License');
    if (url === 'https://example.org/ma-police.woff2') return new Response(Buffer.from('wOF2xxxxxxxx'));
    if (url === 'https://example.org/page.html') return new Response('<html>');
    if (url === 'https://example.org/detour.ttf') return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:8069/secret' } });
    return new Response('', { status: 404 });
  }) as unknown as typeof fetch;
  const app = await buildApp({ libraryRoot: lib, cacheRoot: path.join(root, 'cache'), ateliersRoot: path.join(root, 'ateliers'), webFonts: false, fetch: fakeFetch });
  return { app, lib, asked };
}

describe('polices de la configuration globale', () => {
  it('lit le METADATA.pb de google/fonts', () => {
    const m = parseMetadata(META);
    expect(m.family).toBe('Lora');
    expect(m.license).toBe('ofl');
    expect(m.kind).toBe('serif');
    expect(m.files).toEqual([
      { filename: 'Lora[wght].ttf', style: 'normal', weight: 400, weightMax: 700 },
      { filename: 'Lora-Italic[wght].ttf', style: 'italic', weight: 400, weightMax: 700 },
    ]);
  });

  it('reconnaît les adresses de Google Fonts et refuse le réseau local', () => {
    expect(googleSource(new URL('https://fonts.google.com/specimen/Bebas+Neue'))).toEqual({ family: 'Bebas Neue' });
    expect(googleSource(new URL('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;1,700&display=swap'))).toEqual({ family: 'Lora' });
    expect(googleSource(new URL('https://github.com/google/fonts/tree/main/ofl/lora'))).toEqual({ dir: 'ofl/lora' });
    expect(() => publicUrl('http://example.org/a.ttf')).toThrow();
    expect(() => publicUrl('https://127.0.0.1/a.ttf')).toThrow();
    expect(() => publicUrl('https://192.168.1.4/a.ttf')).toThrow();
    expect(() => publicUrl('https://[::ffff:127.0.0.1]/a.ttf')).toThrow();
  });

  it('installe une police libre avec sa licence, la sert, puis la retire', async () => {
    const { app, lib } = await setup();
    const r = await app.inject({ method: 'POST', url: '/api/fonts', payload: { name: '', url: 'https://fonts.google.com/specimen/Lora' } });
    expect(r.statusCode).toBe(200);
    const font = r.json().font;
    expect(font).toMatchObject({ id: 'lora', family: 'Lora', license: 'OFL-1.1' });
    expect(font.files).toHaveLength(2);
    expect(font.files[0]).toMatchObject({ weight: 400, weightMax: 700, style: 'normal', src: '/files/fonts/lora/Lora-wght.ttf' });
    expect(await readFile(path.join(lib, 'fonts/lora/OFL.txt'), 'utf8')).toContain('Open Font');
    expect((await app.inject(font.files[0].src)).statusCode).toBe(200);
    expect((await app.inject('/api/fonts')).json().fonts.map((f: { id: string }) => f.id)).toEqual(['lora']);

    // usage coupé puis police retirée : le réglage part avec elle
    await app.inject({ method: 'PUT', url: '/api/catalog', payload: { formats: [], media: [], fonts: { lora: { compositions: false, branding: true } } } });
    expect((await app.inject('/api/catalog')).json().fonts).toEqual({ lora: { compositions: false } });
    expect((await app.inject({ method: 'DELETE', url: '/api/fonts/lora' })).statusCode).toBe(200);
    expect((await app.inject('/api/fonts')).json().fonts).toEqual([]);
    expect((await app.inject('/api/catalog')).json().fonts).toEqual({});
  });

  it('installe un fichier de police donné par son adresse, refuse le reste', async () => {
    const { app, asked } = await setup();
    const ok = await app.inject({ method: 'POST', url: '/api/fonts', payload: { name: 'Ma Police', url: 'https://example.org/ma-police.woff2' } });
    expect(ok.json().font).toMatchObject({ id: 'ma-police', family: 'Ma Police', files: [{ weight: 400, style: 'normal', src: '/files/fonts/ma-police/ma-police.woff2' }] });
    expect(ok.json().font.license).toBeUndefined();
    expect((await app.inject({ method: 'POST', url: '/api/fonts', payload: { name: 'X', url: 'https://example.org/page.html' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/fonts', payload: { name: 'X', url: 'https://fonts.google.com/specimen/Inexistante' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'DELETE', url: '/api/fonts/inter' })).statusCode).toBe(404);
    // une redirection vers le réseau local est refusée avant d'être suivie
    const detour = await app.inject({ method: 'POST', url: '/api/fonts', payload: { name: 'X', url: 'https://example.org/detour.ttf' } });
    expect(detour.statusCode).toBe(400);
    expect(asked).not.toContain('http://127.0.0.1:8069/secret');
  });
});
