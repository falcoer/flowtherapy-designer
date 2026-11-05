import type { Doc } from './model';

/** Compositions enregistrées sur le serveur du groupe (designer.flowtherapymusic.com). */
export interface AtelierMeta {
  id: string;
  title: string;
  updated: string;
  by?: string;
  formatId?: string;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin', ...init });
  if (!r.ok) {
    let msg = `${r.status}`;
    try {
      msg = ((await r.json()) as { error?: string }).error ?? msg;
    } catch {
      /* réponse sans détail */
    }
    throw new Error(msg);
  }
  return (await r.json()) as T;
}

/** Le serveur répond-il ? Hors ligne (démo, fichier local), tout reste dans le navigateur. */
export async function serverOnline(): Promise<boolean> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch('/api/health', { signal: ctl.signal, credentials: 'same-origin' });
    clearTimeout(t);
    return r.ok && ((await r.json()) as { ok?: boolean }).ok === true;
  } catch {
    return false;
  }
}

export const listAteliers = () => call<AtelierMeta[]>('/api/ateliers');
export const readAtelier = (id: string) => call<AtelierMeta & { doc: Doc }>(`/api/ateliers/${id}`);
export const saveAtelier = (id: string, title: string, doc: Doc, thumb?: string) =>
  call<{ meta: AtelierMeta }>(`/api/ateliers/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, doc, thumb }) }).then((r) => r.meta);
export const removeAtelier = (id: string) => call<{ ok: boolean }>(`/api/ateliers/${id}`, { method: 'DELETE' });
export const thumbUrl = (m: AtelierMeta) => `/api/ateliers/${m.id}/thumb.png?v=${encodeURIComponent(m.updated)}`;

/** Identifiant tiré du titre, avec un suffixe pour ne pas écraser une autre composition. */
export function newAtelierId(title: string) {
  const base =
    title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'composition';
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}
