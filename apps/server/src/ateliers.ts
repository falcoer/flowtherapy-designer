import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Compositions de l'atelier : un fichier JSON par composition (le document complet, couches,
 * coups de pinceau et photos comprises) et une vignette PNG à côté.
 */
export interface AtelierMeta {
  id: string;
  title: string;
  updated: string;
  by?: string;
  formatId?: string;
}

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export class Ateliers {
  constructor(readonly root: string) {}

  private file(id: string, ext: 'json' | 'png') {
    if (!ID.test(id)) throw new Error(`Identifiant invalide : ${id}`);
    return path.join(this.root, `${id}.${ext}`);
  }

  async list(): Promise<AtelierMeta[]> {
    await mkdir(this.root, { recursive: true });
    const out: AtelierMeta[] = [];
    for (const name of await readdir(this.root)) {
      if (!name.endsWith('.json')) continue;
      try {
        const { doc: _doc, ...meta } = JSON.parse(await readFile(path.join(this.root, name), 'utf8')) as AtelierMeta & { doc?: unknown };
        out.push(meta);
      } catch {
        /* fichier abîmé : ignoré dans la liste */
      }
    }
    return out.sort((a, b) => b.updated.localeCompare(a.updated));
  }

  async read(id: string): Promise<AtelierMeta & { doc: unknown }> {
    return JSON.parse(await readFile(this.file(id, 'json'), 'utf8'));
  }

  async write(id: string, input: { title?: string; doc?: unknown; thumb?: string }, by?: string): Promise<AtelierMeta> {
    const doc = input.doc as { formatId?: unknown; layers?: unknown } | undefined;
    if (!doc || typeof doc !== 'object' || !Array.isArray(doc.layers)) throw new Error('Document d’atelier attendu (couches manquantes)');
    await mkdir(this.root, { recursive: true });
    const meta: AtelierMeta = {
      id,
      title: (input.title ?? '').trim().slice(0, 120) || 'Sans titre',
      updated: new Date().toISOString(),
      ...(by ? { by } : {}),
      ...(typeof doc.formatId === 'string' ? { formatId: doc.formatId } : {}),
    };
    // écriture atomique : un fichier temporaire puis renommage
    const target = this.file(id, 'json');
    await writeFile(target + '.tmp', JSON.stringify({ ...meta, doc }));
    await rename(target + '.tmp', target);
    const m = input.thumb?.match(/^data:image\/png;base64,(.+)$/);
    if (m) await writeFile(this.file(id, 'png'), Buffer.from(m[1]!, 'base64'));
    return meta;
  }

  async remove(id: string) {
    await rm(this.file(id, 'json'), { force: true });
    await rm(this.file(id, 'png'), { force: true });
  }

  async thumb(id: string): Promise<string | null> {
    const f = this.file(id, 'png');
    try {
      await stat(f);
      return f;
    } catch {
      return null;
    }
  }
}
