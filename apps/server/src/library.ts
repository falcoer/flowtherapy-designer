import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import YAML from 'yaml';
import path from 'node:path';
import {
  FormatsDocSchema,
  LibraryElementSchema,
  ProjectSchema,
  parseYaml,
  type Format,
  type LibraryElement,
  type Project,
  toYaml,
} from '@ftd/core';
import { cachedRender, FONT_EXT, IMAGE_EXT, imageMeta, imagePalette, type CacheProfile } from './media.js';
import { SearchIndex } from './search-index.js';

/**
 * Accès à la bibliothèque sur disque : les YAML sont la source de vérité,
 * l'index SQLite et le cache de rendus se reconstruisent depuis eux.
 */
export class Library {
  readonly index: SearchIndex;
  private byKey = new Map<string, LibraryElement>();

  constructor(
    readonly root: string,
    readonly cacheRoot: string,
  ) {
    this.index = new SearchIndex(path.join(cacheRoot, 'index.sqlite'));
  }

  /** Relit les YAML et reconstruit l'index. */
  async reindex(): Promise<number> {
    const els = await this.elements();
    this.byKey = new Map(els.map((e) => [`${e.type}/${e.id}`, e]));
    this.index.rebuild(els);
    return els.length;
  }

  get(key: string): LibraryElement | undefined {
    return this.byKey.get(key);
  }

  all(): LibraryElement[] {
    return [...this.byKey.values()];
  }

  async formats(): Promise<Format[]> {
    const text = await readFile(path.join(this.root, 'formats.yaml'), 'utf8');
    return parseYaml(FormatsDocSchema, text).formats;
  }

  async elements(): Promise<LibraryElement[]> {
    const files = await findYaml(this.root, ['projects', 'templates']);
    const out: LibraryElement[] = [];
    for (const file of files) {
      if (path.basename(file) === 'formats.yaml') continue;
      try {
        const el = parseYaml(LibraryElementSchema, await readFile(file, 'utf8'));
        // les chemins source sont relatifs au dossier de l'élément
        const rel = (p: string) => path.relative(this.root, path.resolve(path.dirname(file), p));
        if (el.type === 'image') el.source = rel(el.source);
        if (el.type === 'font') el.files = el.files.map((f) => ({ ...f, path: rel(f.path) }));
        out.push(el);
      } catch (err) {
        console.warn(`Élément ignoré (${path.relative(this.root, file)}) : ${(err as Error).message}`);
      }
    }
    return out;
  }

  async search(q: { type?: string; tags?: string[]; text?: string }): Promise<LibraryElement[]> {
    return this.index.search(q);
  }

  /** Rendu optimisé d'une image de la bibliothèque pour un support. */
  async render(id: string, profile: CacheProfile) {
    const el = this.byKey.get(`image/${id}`);
    if (el?.type !== 'image') throw new Error(`Image inconnue : ${id}`);
    return cachedRender(path.join(this.root, el.source), path.join(this.cacheRoot, 'images', id), profile);
  }

  /**
   * Importe un fichier (image, logo, police) : copie l'original, écrit son
   * YAML, extrait une palette pour les images bitmap, puis réindexe.
   */
  async importFile(data: Buffer, filename: string, opts: { title?: string; tags?: string[]; weight?: number } = {}) {
    const ext = path.extname(filename).toLowerCase();
    const base = slugify(opts.title || path.basename(filename, ext)) || 'element';
    const tags = (opts.tags ?? []).map((t) => t.trim()).filter(Boolean);
    const created: LibraryElement[] = [];

    if (IMAGE_EXT.includes(ext)) {
      const id = await this.uniqueId('images', base);
      const dir = path.join(this.root, 'images', id);
      await mkdir(dir, { recursive: true });
      const source = `source${ext === '.jpg' ? '.jpeg' : ext}`;
      await writeFile(path.join(dir, source), data);
      const meta = await imageMeta(path.join(dir, source));
      const image: Record<string, unknown> = { id, type: 'image', title: opts.title || id, source, meta, tags };
      if (ext !== '.svg') {
        const colors = await imagePalette(path.join(dir, source));
        if (colors.length) {
          const paletteId = await this.uniqueId('palettes', id, '.yaml');
          await mkdir(path.join(this.root, 'palettes'), { recursive: true });
          const palette = {
            id: paletteId,
            type: 'palette',
            title: `${opts.title || id} (extraite)`,
            from: `image/${id}`,
            tags: [...tags, 'extraite'],
            colors: colors.map((c) => ({ hex: c.hex })),
          };
          await writeFile(path.join(this.root, 'palettes', `${paletteId}.yaml`), toYaml(palette));
          image.palette = paletteId;
          created.push(palette as LibraryElement);
        }
      }
      await writeFile(path.join(dir, 'element.yaml'), toYaml(image));
      created.unshift(image as LibraryElement);
    } else if (FONT_EXT.includes(ext)) {
      const id = await this.uniqueId('fonts', base);
      const dir = path.join(this.root, 'fonts', id);
      await mkdir(dir, { recursive: true });
      const file = `${id}${ext}`;
      await writeFile(path.join(dir, file), data);
      const font = {
        id,
        type: 'font',
        title: opts.title || id,
        family: opts.title || path.basename(filename, ext),
        files: [{ weight: opts.weight ?? 400, style: 'normal', path: file }],
        tags,
      };
      await writeFile(path.join(dir, 'element.yaml'), toYaml(font));
      created.push(font as LibraryElement);
    } else {
      throw new Error(`Type de fichier non pris en charge : ${ext || filename}`);
    }
    await this.reindex();
    return created.map((c) => this.byKey.get(`${c.type}/${c.id}`) ?? c);
  }

  /** Enregistre une palette (couleurs choisies ou dégradé tracé) dans palettes/. */
  async createPalette(opts: { title: string; colors: Array<{ hex: string; name?: string; role?: string }>; tags?: string[] }) {
    const parsed = LibraryElementSchema.parse({
      id: 'tmp',
      type: 'palette',
      title: opts.title,
      tags: opts.tags ?? [],
      colors: opts.colors,
    });
    if (parsed.type !== 'palette' || parsed.colors.length < 1) throw new Error('Palette vide');
    const id = await this.uniqueId('palettes', slugify(opts.title) || 'palette', '.yaml');
    await mkdir(path.join(this.root, 'palettes'), { recursive: true });
    await writeFile(path.join(this.root, 'palettes', `${id}.yaml`), toYaml({ ...parsed, id }));
    await this.reindex();
    return this.byKey.get(`palette/${id}`)!;
  }

  private async uniqueId(dir: string, base: string, suffix = ''): Promise<string> {
    let id = base;
    for (let n = 2; ; n++) {
      const exists = await stat(path.join(this.root, dir, id + suffix)).then(() => true, () => false);
      if (!exists) return id;
      id = `${base}-${n}`;
    }
  }

  projectPath(id: string): string {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error('Identifiant de projet invalide');
    return path.join(this.root, 'projects', `${id}.yaml`);
  }

  async listProjects(): Promise<Array<{ id: string; title?: string }>> {
    const dir = path.join(this.root, 'projects');
    const names = (await readdir(dir)).filter((n) => n.endsWith('.yaml'));
    const out = [];
    for (const n of names) {
      const p = parseYaml(ProjectSchema, await readFile(path.join(dir, n), 'utf8'));
      out.push({ id: p.id, title: p.title ?? p.axis?.title });
    }
    return out;
  }

  async readProject(id: string): Promise<{ yaml: string; project: Project }> {
    const yaml = await readFile(this.projectPath(id), 'utf8');
    return { yaml, project: parseYaml(ProjectSchema, yaml) };
  }

  /** Valide puis écrit le YAML (commentaires conservés), en notant qui l'a modifié. */
  async writeProject(id: string, yaml: string, author?: string): Promise<Project> {
    const project = parseYaml(ProjectSchema, yaml);
    if (project.id !== id) throw new Error(`L'id du YAML (${project.id}) ne correspond pas à l'URL (${id})`);
    const doc = YAML.parseDocument(yaml);
    if (author) doc.setIn(['meta', 'updatedBy'], author);
    doc.setIn(['meta', 'updatedAt'], new Date().toISOString());
    await writeFile(this.projectPath(id), doc.toString({ lineWidth: 0 }), 'utf8');
    return project;
  }
}

async function findYaml(dir: string, skip: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir)) {
    const full = path.join(dir, entry);
    const s = await stat(full);
    if (s.isDirectory()) {
      if (!skip.includes(entry)) out.push(...(await findYaml(full, skip)));
    } else if (entry.endsWith('.yaml')) {
      out.push(full);
    }
  }
  return out;
}

export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}
