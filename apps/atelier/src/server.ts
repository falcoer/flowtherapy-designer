import { compact, type Doc } from './model';

/** Compositions enregistrées sur le serveur du groupe (designer.flowtherapymusic.com). */
export interface AtelierMeta {
  id: string;
  title: string;
  updated: string;
  by?: string;
  formatId?: string;
  /** Circuit de validation : proposée aux responsables, validée, ou à revoir. */
  review?: {
    status: 'proposed' | 'approved' | 'changes';
    proposedBy: string;
    proposedAt: string;
    note?: string;
    reviewedBy?: string;
    reviewedAt?: string;
    reviewNote?: string;
  };
}

export const REVIEW_LABELS = { proposed: 'Proposée', approved: 'Validée', changes: 'À revoir' } as const;

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
  call<{ meta: AtelierMeta }>(`/api/ateliers/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, doc, thumb }, compact) }).then((r) => r.meta);
export const proposeAtelier = (id: string, note?: string) =>
  call<{ meta: AtelierMeta; mailed: boolean; notified: number }>(`/api/ateliers/${id}/propose`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ note }),
  });
export const reviewAtelier = (id: string, approved: boolean, note?: string) =>
  call<{ meta: AtelierMeta; mailed: boolean }>(`/api/ateliers/${id}/review`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ approved, note }),
  });
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

/** Ajoute une image (PNG) à la bibliothèque du groupe. */
export async function addToLibrary(png: Blob, title: string, tags: string[]): Promise<void> {
  const fd = new FormData();
  fd.append('title', title);
  fd.append('tags', tags.join(','));
  fd.append('file', png, `${title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'objet'}.png`);
  await call<unknown>('/api/library/upload', { method: 'POST', body: fd });
}

/** Rôle dans une équipe : responsable (gère les membres), peut modifier, lecture seule. */
export type Role = 'owner' | 'editor' | 'viewer';
export const ROLE_LABELS: Record<Role, string> = { owner: 'Responsable', editor: 'Peut modifier', viewer: 'Lecture seule' };
export interface TeamRef {
  id: string;
  name: string;
  role: Role;
}

/** Qui est connecté : compte (Google, Apple), accès partagé par mot de passe, ou poste local. */
export interface Me {
  email?: string;
  name?: string;
  admin: boolean;
  mode: 'compte' | 'mot-de-passe' | 'local';
  /** Équipe active : ses compositions et ses objets. */
  team?: TeamRef;
  teams?: TeamRef[];
  /** Le serveur envoie-t-il des e-mails (invitations, propositions) ? */
  mail?: boolean;
}
export const fetchMe = () => call<Me | null>('/api/me');

/* ---------- équipes ---------- */

export interface Member {
  email: string;
  name?: string;
  role: Role;
  /** Absente tant que l'invité ne s'est pas connecté. */
  joined?: string;
  lastSeen?: string;
}
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const enc = encodeURIComponent;
export const switchTeam = (team: string) => call<{ ok: boolean }>('/api/me/team', json('POST', { team }));
export const fetchMembers = (team: string) => call<Member[]>(`/api/teams/${enc(team)}/members`);
export const inviteMember = (team: string, email: string, role: Role) => call<{ member: Member; mailed?: boolean }>(`/api/teams/${enc(team)}/members`, json('POST', { email, role }));
export const setMemberRole = (team: string, email: string, role: Role) => call<{ ok: boolean }>(`/api/teams/${enc(team)}/members/${enc(email)}`, json('PATCH', { role }));
export const removeMember = (team: string, email: string) => call<{ ok: boolean }>(`/api/teams/${enc(team)}/members/${enc(email)}`, { method: 'DELETE' });
export const renameTeam = (team: string, name: string) => call<{ ok: boolean }>(`/api/teams/${enc(team)}`, json('PATCH', { name }));
export const createTeam = (name: string) => call<{ team: { id: string; name: string } }>('/api/teams', json('POST', { name }));

/** État du serveur, pour les administrateurs. */
export interface SystemInfo {
  version: string;
  commit?: string;
  node: string;
  startedAt: string;
  uptime: number;
  memory: { rss: number; heap: number };
  library: number;
  ateliers: number;
  teams?: number;
  auth: Me['mode'];
  restartable: boolean;
}
export const fetchSystem = () => call<SystemInfo>('/api/system');
export const restartServer = () => call<{ ok: boolean }>('/api/system/restart', { method: 'POST' });
export const reindexLibrary = () => call<{ count: number }>('/api/library/reindex', { method: 'POST' });
