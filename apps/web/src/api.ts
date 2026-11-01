import type { Format, LibraryElement, Project } from '@ftd/core';
import { DEMO, demoFile } from './demo';

async function json<T>(res: Response): Promise<T> {
  if (res.status === 401 && (await res.clone().json().catch(() => ({}))).login) {
    window.location.href = '/auth/login';
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  return res.json() as Promise<T>;
}

export const api = {
  me: () => fetch('/api/me').then((r) => json<{ email: string; name?: string } | null>(r)),
  formats: () => fetch('/api/formats').then((r) => json<Format[]>(r)),
  library: (q: { type?: string; q?: string; tags?: string } = {}) =>
    fetch(`/api/library?${new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][])}`).then((r) =>
      json<LibraryElement[]>(r),
    ),
  tags: () => fetch('/api/library/tags').then((r) => json<Array<{ tag: string; count: number }>>(r)),
  upload: (files: File[], fields: Record<string, string> = {}) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    for (const f of files) fd.append('file', f, f.name);
    return fetch('/api/library/upload', { method: 'POST', body: fd }).then((r) => json<{ created: LibraryElement[] }>(r));
  },
  projects: () => fetch('/api/projects').then((r) => json<Array<{ id: string; title?: string }>>(r)),
  project: (id: string) => fetch(`/api/projects/${id}`).then((r) => json<{ yaml: string; project: Project }>(r)),
  saveProject: (id: string, yaml: string) =>
    fetch(`/api/projects/${id}`, { method: 'PUT', headers: { 'content-type': 'text/yaml' }, body: yaml }).then((r) =>
      json<{ ok: true; project: Project }>(r),
    ),
};

export const fileUrl = (p: string) => (DEMO ? (demoFile(p) ?? p) : `/files/${p}`);

/** Vignette optimisée (cache serveur) ; les SVG restent vectoriels. */
export const thumbUrl = (el: { id: string; source: string }) =>
  DEMO || el.source.toLowerCase().endsWith('.svg') ? fileUrl(el.source) : `/cache/images/${el.id}/thumb`;

export const exportUrl = (projectId: string, format: string, type: 'png' | 'pdf' | 'svg', record = 0) =>
  `/api/projects/${projectId}/export?${new URLSearchParams({ format, type, record: String(record) })}`;
