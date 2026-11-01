import type { Format, LibraryElement, Project } from '@ftd/core';

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
  library: (q: { type?: string; q?: string } = {}) =>
    fetch(`/api/library?${new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][])}`).then((r) =>
      json<LibraryElement[]>(r),
    ),
  projects: () => fetch('/api/projects').then((r) => json<Array<{ id: string; title?: string }>>(r)),
  project: (id: string) => fetch(`/api/projects/${id}`).then((r) => json<{ yaml: string; project: Project }>(r)),
  saveProject: (id: string, yaml: string) =>
    fetch(`/api/projects/${id}`, { method: 'PUT', headers: { 'content-type': 'text/yaml' }, body: yaml }).then((r) =>
      json<{ ok: true; project: Project }>(r),
    ),
};

export const fileUrl = (p: string) => `/files/${p}`;
