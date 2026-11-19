import { cp, mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { Library } from '../src/library.js';

const repoLibrary = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/library');

describe('illustration orientée', () => {
  it('range une image par vue et les retrouve dans la bibliothèque', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ftd-'));
    await cp(repoLibrary, root, { recursive: true });
    const lib = new Library(root, await mkdtemp(path.join(os.tmpdir(), 'ftd-cache-')));
    await lib.reindex();
    const png = (w: number) => sharp({ create: { width: w, height: 30, channels: 4, background: { r: 200, g: 100, b: 50, alpha: 0 } } }).png().toBuffer();
    const el = await lib.importOriented({ title: 'Lama Betty', views: [
      { view: 'profil', data: await png(12), ext: '.png' },
      { view: 'face', data: await png(20), ext: '.png' },
      { view: 'n-importe', data: await png(20), ext: '.png' },
    ] });
    expect(el.id).toBe('lama-betty');
    if (el.type !== 'image') throw new Error('pas une image');
    expect(el.source).toBe('images/lama-betty/face.png');
    expect(el.tags).toContain('personnage');
    expect(el.views).toEqual({ profil: { file: 'images/lama-betty/profil.png', width: 12, height: 30 }, face: { file: 'images/lama-betty/face.png', width: 20, height: 30 } });
    expect(await readFile(path.join(root, 'images/lama-betty/element.yaml'), 'utf8')).toContain('views:');
    expect((await lib.search({ type: 'image', tags: ['personnage'] })).map((e) => e.id)).toEqual(['lama-betty']);
  });

  it('range une image sous une autre vue, ou échange deux vues', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ftd-'));
    await cp(repoLibrary, root, { recursive: true });
    const lib = new Library(root, await mkdtemp(path.join(os.tmpdir(), 'ftd-cache-')));
    await lib.reindex();
    const png = (w: number) => sharp({ create: { width: w, height: 30, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    await lib.importOriented({ title: 'Lama', views: [
      { view: 'face', data: await png(20), ext: '.png' },
      { view: 'trois-quarts', data: await png(16), ext: '.png' },
      { view: 'profil', data: await png(12), ext: '.png' },
    ] });
    // l'image de dos de biais rangée par erreur en trois-quarts de face
    const moved = await lib.relabelOriented('lama', { 'trois-quarts': 'dos-trois-quarts' });
    if (moved.type !== 'image') throw new Error('pas une image');
    expect(Object.keys(moved.views!)).toEqual(['face', 'profil', 'dos-trois-quarts']);
    expect(moved.views!['dos-trois-quarts']).toEqual({ file: 'images/lama/trois-quarts.png', width: 16, height: 30 });
    // un échange avec la face : l'image principale suit
    const swapped = await lib.relabelOriented('lama', { face: 'profil', profil: 'face' });
    if (swapped.type !== 'image') throw new Error('pas une image');
    expect(swapped.source).toBe('images/lama/profil.png');
    expect(swapped.meta).toEqual({ width: 12, height: 30 });
    await expect(lib.relabelOriented('lama', { face: 'dos-trois-quarts' })).rejects.toThrow('Deux images');
    await expect(lib.relabelOriented('lama', { dos: 'face' })).rejects.toThrow('Pas d’image');
    await expect(lib.relabelOriented('lama', { face: 'dessus' })).rejects.toThrow('Vue inconnue');
  });
});
