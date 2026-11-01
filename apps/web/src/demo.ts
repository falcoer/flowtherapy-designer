import {
  extractPalette,
  parseProject,
  toYaml,
  type Format,
  type LibraryElement,
  type Project,
} from '@ftd/core';

/**
 * Mode démo : l'app tourne sans serveur. La bibliothèque d'exemple est
 * intégrée au fichier, les imports restent dans le navigateur, et les
 * requêtes /api sont servies ici.
 */

export interface DemoData {
  formats: Format[];
  elements: LibraryElement[];
  projects: Array<{ id: string; yaml: string }>;
  /** chemin de bibliothèque → data URI */
  files: Record<string, string>;
}

export const DEMO = import.meta.env.VITE_DEMO === '1';

let data: DemoData | null = null;
const projects = new Map<string, string>();

export function demoFile(path: string): string | undefined {
  return data?.files[path];
}

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function search(url: URL): LibraryElement[] {
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const type = url.searchParams.get('type');
  const tags = (url.searchParams.get('tags') ?? '').split(',').filter(Boolean);
  const words = fold(url.searchParams.get('q') ?? '').split(/[^a-z0-9]+/).filter(Boolean);
  return data!.elements.filter((el) => {
    if (type && el.type !== type) return false;
    if (tags.some((t) => !el.tags.includes(t))) return false;
    const hay = fold([el.id, el.title ?? '', ...el.tags, el.type === 'text' ? el.body : ''].join(' ')).split(/[^a-z0-9]+/);
    return words.every((w) => hay.some((h) => h.startsWith(w)));
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

async function importImage(file: File, tags: string[]): Promise<LibraryElement[]> {
  const uri = await readAsDataUrl(file);
  const img = new Image();
  img.src = uri;
  await img.decode();
  const base = file.name.replace(/\.[^.]+$/, '');
  const id = uniqueId(slug(base));
  const source = `images/${id}/${file.name}`;
  data!.files[source] = uri;
  const image: LibraryElement = {
    id,
    type: 'image',
    title: base,
    source,
    meta: { width: img.naturalWidth || 1, height: img.naturalHeight || 1 },
    tags,
    cache: {},
  };
  const out: LibraryElement[] = [image];
  if (!file.type.includes('svg')) {
    const canvas = document.createElement('canvas');
    const k = 64 / Math.max(img.naturalWidth, img.naturalHeight);
    canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const colors = extractPalette(ctx.getImageData(0, 0, canvas.width, canvas.height).data, 4, 5);
    if (colors.length) {
      image.palette = id;
      out.push({ id, type: 'palette', title: `${base} (extraite)`, from: `image/${id}`, tags: [...tags, 'extraite'], colors: colors.map((c) => ({ hex: c.hex })) });
    }
  }
  return out;
}

async function importFont(file: File, tags: string[]): Promise<LibraryElement> {
  const base = file.name.replace(/\.[^.]+$/, '');
  const id = uniqueId(slug(base));
  const path = `fonts/${id}/${file.name}`;
  data!.files[path] = await readAsDataUrl(file);
  return { id, type: 'font', title: base, family: base, files: [{ weight: 400, style: 'normal', path }], tags };
}

const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'element';

function uniqueId(base: string) {
  let id = base;
  for (let n = 2; data!.elements.some((e) => e.id === id); n++) id = `${base}-${n}`;
  return id;
}

export async function installDemo(load: () => Promise<DemoData>) {
  data = await load();
  for (const p of data.projects) projects.set(p.id, p.yaml);
  const realFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    const path = url.pathname.replace(/^.*?\/api\//, '/api/');
    if (!path.startsWith('/api/')) return realFetch(input, init);
    const method = (init?.method ?? 'GET').toUpperCase();

    if (path === '/api/me') return reply(null);
    if (path === '/api/formats') return reply(data!.formats);
    if (path === '/api/library') return reply(search(url));
    if (path === '/api/library/tags') {
      const counts = new Map<string, number>();
      for (const el of data!.elements) for (const t of el.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
      return reply([...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)));
    }
    if (path === '/api/library/upload' && method === 'POST') {
      const form = init?.body as FormData;
      const tags = String(form.get('tags') ?? '').split(',').filter(Boolean);
      const created: LibraryElement[] = [];
      for (const f of form.getAll('file') as File[]) {
        if (/^image\//.test(f.type) || /\.svg$/i.test(f.name)) created.push(...(await importImage(f, tags)));
        else if (/\.(ttf|otf|woff2?)$/i.test(f.name)) created.push(await importFont(f, tags));
        else return reply({ error: `Type de fichier non pris en charge : ${f.name}` }, 400);
      }
      data!.elements.push(...created);
      return reply({ created });
    }
    if (path === '/api/projects') {
      return reply([...projects].map(([id, yaml]) => ({ id, title: parseProject(yaml).title })));
    }
    const m = /^\/api\/projects\/([a-z0-9-]+)(\/export)?$/.exec(path);
    if (m && m[2]) return reply({ error: "L'export PNG/PDF fonctionne sur le serveur ; la démo ne télécharge pas de fichier." }, 400);
    if (m && method === 'PUT') {
      try {
        const project: Project = parseProject(String(init?.body));
        projects.set(m[1]!, toYaml(project));
        return reply({ ok: true, project });
      } catch (e) {
        return reply({ error: (e as Error).message }, 400);
      }
    }
    if (m) {
      const yaml = projects.get(m[1]!);
      return yaml ? reply({ yaml, project: parseProject(yaml) }) : reply({ error: 'Projet introuvable' }, 404);
    }
    return reply({ error: 'Introuvable' }, 404);
  };
}
