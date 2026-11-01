/**
 * Génère apps/web/src/demo-data.json : la bibliothèque d'exemple intégrée
 * à la démo sans serveur (formats, éléments, projets, fichiers en data URI).
 * Usage : npm run build:demo
 */
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Library } from '../src/library.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const root = process.env.FTD_LIBRARY ?? path.join(repo, 'library');
const out = path.join(repo, 'apps/web/src/demo-data.json');

const cache = await mkdtemp(path.join(os.tmpdir(), 'ftd-demo-'));
const lib = new Library(root, cache);
await lib.reindex();

const files: Record<string, string> = {};
const dataUri = (type: string, buf: Buffer) => `data:${type};base64,${buf.toString('base64')}`;
for (const el of lib.all()) {
  if (el.type === 'image') {
    if (el.source.endsWith('.svg')) files[el.source] = dataUri('image/svg+xml', await readFile(path.join(root, el.source)));
    else {
      const r = await lib.render(el.id, 'web');
      files[el.source] = dataUri(r.type, await readFile(r.file));
    }
  }
  if (el.type === 'font') for (const f of el.files) files[f.path] = dataUri('font/' + path.extname(f.path).slice(1), await readFile(path.join(root, f.path)));
}

const projectDir = path.join(root, 'projects');
const projects = [];
for (const name of (await readdir(projectDir)).filter((n) => n.endsWith('.yaml')).sort())
  projects.push({ id: path.basename(name, '.yaml'), yaml: await readFile(path.join(projectDir, name), 'utf8') });

await writeFile(out, JSON.stringify({ formats: await lib.formats(), elements: lib.all(), projects, files }));
lib.index.close();
await rm(cache, { recursive: true, force: true });
console.log(`${path.relative(repo, out)} : ${lib.all().length} éléments, ${projects.length} projet(s)`);
