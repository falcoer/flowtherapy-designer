import { cp, mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const repoLibrary = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/library');

async function setup(password?: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ftd-'));
  await cp(repoLibrary, root, { recursive: true });
  const cacheRoot = await mkdtemp(path.join(os.tmpdir(), 'ftd-cache-'));
  const ateliersRoot = path.join(await mkdtemp(path.join(os.tmpdir(), 'ftd-ateliers-')), 'ateliers');
  return { root, app: await buildApp({ libraryRoot: root, cacheRoot, ateliersRoot, password, webFonts: false }) };
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

  it('enregistre, liste, relit et supprime une composition de l’atelier', async () => {
    const { app } = await setup();
    const doc = { formatId: 'a4', layers: [{ id: 'x', kind: 'shape' }] };
    const thumb = 'data:image/png;base64,' + Buffer.from('png').toString('base64');
    const put = await app.inject({ method: 'PUT', url: '/api/ateliers/affiche-1', payload: { title: 'Affiche', doc, thumb } });
    expect(put.statusCode).toBe(200);
    expect(put.json().meta).toMatchObject({ id: 'affiche-1', title: 'Affiche', formatId: 'a4' });
    const list = (await app.inject('/api/ateliers')).json();
    expect(list).toHaveLength(1);
    expect(list[0].doc).toBeUndefined();
    expect((await app.inject('/api/ateliers/affiche-1')).json().doc).toEqual(doc);
    expect((await app.inject('/api/ateliers/affiche-1/thumb.png')).statusCode).toBe(200);
    expect((await app.inject({ method: 'PUT', url: '/api/ateliers/affiche-1', payload: { title: 'x' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url: '/api/ateliers/..%2Fetc', payload: { doc } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'DELETE', url: '/api/ateliers/affiche-1' })).statusCode).toBe(200);
    expect((await app.inject('/api/ateliers/affiche-1')).statusCode).toBe(404);
  });

  it('garde une vignette par publication, et les oublie quand elles ne viennent plus', async () => {
    const { app } = await setup();
    const doc = { formatId: 'a4', layers: [], targets: [{ format: 'a4' }, { channel: 'facebook', format: 'fb-square' }] };
    const png = (s: string) => 'data:image/png;base64,' + Buffer.from(s).toString('base64');
    const put = await app.inject({ method: 'PUT', url: '/api/ateliers/affiche-2', payload: { title: 'Affiche', doc, thumb: png('g'), thumbs: [png('a4'), png('carre')] } });
    expect(put.json().meta.thumbs).toBe(2);
    expect((await app.inject('/api/ateliers/affiche-2/thumb.png?t=1')).body).toBe('carre');
    expect((await app.inject('/api/ateliers/affiche-2/thumb.png?t=0')).body).toBe('a4');
    expect((await app.inject('/api/ateliers/affiche-2/thumb.png?t=2')).statusCode).toBe(404);
    expect((await app.inject('/api/ateliers/affiche-2/thumb.png?t=-1')).statusCode).toBe(404);
    // une vignette invalide : aucune n'est gardée, la vignette générale sert partout
    const again = await app.inject({ method: 'PUT', url: '/api/ateliers/affiche-2', payload: { title: 'Affiche', doc, thumb: png('g'), thumbs: [png('a4'), 'x'] } });
    expect(again.json().meta.thumbs).toBeUndefined();
    expect((await app.inject('/api/ateliers/affiche-2/thumb.png?t=0')).statusCode).toBe(404);
    expect((await app.inject('/api/ateliers/affiche-2/thumb.png')).body).toBe('g');
  });

  it('range un objet préparé (ses pièces) dans la bibliothèque', async () => {
    const { app } = await setup();
    const doc = { layers: [{ id: 'a', kind: 'shape', link: 'k' }, { id: 'b', kind: 'shape', link: 'k' }] };
    expect((await app.inject({ method: 'PUT', url: '/api/objets/maison-1', payload: { title: 'Maison', doc } })).statusCode).toBe(200);
    expect((await app.inject('/api/objets')).json()).toHaveLength(1);
    expect((await app.inject('/api/objets/maison-1')).json().doc).toEqual(doc);
    expect((await app.inject('/api/ateliers')).json()).toHaveLength(0);
  });

  it('donne le profil et l’état du système', async () => {
    const { app } = await setup();
    expect((await app.inject('/api/me')).json()).toMatchObject({ admin: true, mode: 'local' });
    const sys = (await app.inject('/api/system')).json();
    expect(sys).toMatchObject({ ateliers: 0, auth: 'local' });
    expect(sys.library).toBeGreaterThan(0);
    expect(typeof sys.uptime).toBe('number');
  });

  it('refuse les accès sans mot de passe quand il est configuré', async () => {
    const { app } = await setup('secret');
    expect((await app.inject('/api/formats')).statusCode).toBe(401);
    const auth = 'Basic ' + Buffer.from('ft:secret').toString('base64');
    expect((await app.inject({ url: '/api/formats', headers: { authorization: auth } })).statusCode).toBe(200);
  });
});
