import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
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
} from '@ftd/core';

/**
 * Accès à la bibliothèque sur disque. Phase 0 : lecture directe des YAML.
 * Phase 1 : index SQLite (FTS5) reconstruit depuis ces mêmes fichiers.
 */
export class Library {
  constructor(readonly root: string) {}

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
        if (el.type === 'image') el.source = path.relative(this.root, path.resolve(path.dirname(file), el.source));
        out.push(el);
      } catch (err) {
        console.warn(`Élément ignoré (${path.relative(this.root, file)}) : ${(err as Error).message}`);
      }
    }
    return out;
  }

  async search(q: { type?: string; tags?: string[]; text?: string }): Promise<LibraryElement[]> {
    const text = q.text?.toLowerCase().trim();
    return (await this.elements()).filter((el) => {
      if (q.type && el.type !== q.type) return false;
      if (q.tags?.length && !q.tags.every((t) => el.tags.includes(t))) return false;
      if (text) {
        const hay = [el.id, el.title ?? '', ...el.tags, el.type === 'text' ? el.body : ''].join(' ').toLowerCase();
        if (!hay.includes(text)) return false;
      }
      return true;
    });
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
