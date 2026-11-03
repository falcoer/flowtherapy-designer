import { cp, mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const repoLibrary = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../library');

async function setup(password?: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ftd-'));
  await cp(repoLibrary, root, { recursive: true });
  const cacheRoot = await mkdtemp(path.join(os.tmpdir(), 'ftd-cache-'));
  return { root, app: await buildApp({ libraryRoot: root, cacheRoot, password, webFonts: false }) };
}

describe('API', () => {
  it('liste formats, bibliothèque et projets', async () => {
    const { app } = await setup();
    const formats = (await app.inject('/api/formats')).json();
    expect(formats.length).toBeGreaterThan(3);
    const images = (await app.inject('/api/library?type=image')).json();
    expect(images.every((e: { type: string }) => e.type === 'image')).toBe(true);
    const projects = (await app.inject('/api/projects')).json();
    expect(projects.map((p: { id: string }) => p.id)).toContain('concert-exemple');
  });

  it('valide le YAML avant d’enregistrer', async () => {
    const { app, root } = await setup();
    const bad = await app.inject({ method: 'PUT', url: '/api/projects/concert-exemple', headers: { 'content-type': 'text/yaml' }, payload: 'id: concert-exemple\nformats: []\n' });
    expect(bad.statusCode).toBe(400);
    const { yaml } = (await app.inject('/api/projects/concert-exemple')).json();
    const edited = yaml.replace('title:', '# modifié\ntitle:');
    const ok = await app.inject({ method: 'PUT', url: '/api/projects/concert-exemple', headers: { 'content-type': 'text/yaml' }, payload: edited });
    expect(ok.statusCode).toBe(200);
    expect(await readFile(path.join(root, 'projects/concert-exemple.yaml'), 'utf8')).toContain('# modifié');
  });

  it('refuse les accès sans mot de passe quand il est configuré', async () => {
    const { app } = await setup('secret');
    expect((await app.inject('/api/formats')).statusCode).toBe(401);
    const auth = 'Basic ' + Buffer.from('ft:secret').toString('base64');
    expect((await app.inject({ url: '/api/formats', headers: { authorization: auth } })).statusCode).toBe(200);
  });
});
