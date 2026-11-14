import type { Catalog, ElementStore, Insets, MediaKind, UserPresets } from '@ftd/core';
import { compact, type Blend, type Doc, type GradStyle } from './model';

/** Compositions enregistrées sur le serveur du groupe (designer.flowtherapymusic.com). */
export interface AtelierMeta {
  id: string;
  title: string;
  updated: string;
  by?: string;
  formatId?: string;
  /** Rendus du document (média, format, variante), pour l'éventail des publications. */
  targets?: Target[];
  /** Campagne à laquelle elle contribue. */
  campaign?: string;
  /** Adresses des membres qui ont voté pour elle, et si l'on en fait partie. */
  votes?: string[];
  /** création, et qui l'a créée */
  created?: string;
  author?: string;
  /** nombre de messages laissés sur la composition */
  messages?: number;
  voted?: boolean;
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
  /** Vignettes par publication enregistrées (une par rendu, dans l'ordre). */
  thumbs?: number;
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
export const saveAtelier = (id: string, title: string, doc: Doc, thumb?: string, thumbs?: string[]) =>
  call<{ meta: AtelierMeta }>(`/api/ateliers/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, doc, thumb, thumbs }, compact) }).then((r) => r.meta);
/** Campagne : un temps de communication (souvent la promotion d'un évènement) où chacun propose des documents et vote. */
export interface Campaign {
  id: string;
  name: string;
  operation?: string;
  date?: string;
  place?: string;
  /** Heure d'accueil (HH:MM). */
  time?: string;
  /** Type de prestation : concert, DJ set… */
  kind?: string;
  /** Contact réservation. */
  contact?: { name?: string; phone?: string; email?: string };
  note?: string;
  /** Compositions proposées comme modèles de la campagne. */
  templates?: string[];
  /** Plan de publication : ce qu'il faut sortir, quand, avec quelle composition. */
  plan?: PlanItem[];
  created: string;
  by?: string;
  closed?: string;
}
/** Une publication prévue : un rendu (média, format, variante), une date, la composition retenue. */
export interface PlanItem extends Target {
  id: string;
  /** « rappel », « annonce »… */
  label?: string;
  date?: string;
  composition?: string;
  /** publiée : quand, et le lien de la publication */
  published?: string;
  link?: string;
  /** confiée à Postiz (écrit par le serveur) */
  postiz?: { post: string; account: string; at: string; state: 'queue' | 'published' | 'error'; error?: string };
}
export type CampaignInput = Partial<Pick<Campaign, 'name' | 'operation' | 'date' | 'place' | 'time' | 'kind' | 'contact' | 'note' | 'templates' | 'plan'>> & { closed?: boolean };
export const listCampaigns = () => call<Campaign[]>('/api/campaigns');
export const createCampaign = (c: CampaignInput) => call<{ campaign: Campaign }>('/api/campaigns', json('POST', c)).then((r) => r.campaign);
export const updateCampaign = (id: string, c: CampaignInput) => call<{ campaign: Campaign }>(`/api/campaigns/${id}`, json('PATCH', c)).then((r) => r.campaign);
export const copyAtelier = (id: string, to: string, title: string, campaign?: string) =>
  call<{ meta: AtelierMeta }>(`/api/ateliers/${id}/copy`, json('POST', { to, title, campaign })).then((r) => r.meta);
export const voteAtelier = (id: string, on: boolean) => call<{ votes: string[]; voted: boolean }>(`/api/ateliers/${id}/vote`, json('POST', { on }));
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
export interface Reaction {
  emoji: string;
  by: string[];
  mine: boolean;
}
/** Message sur une composition, avec le rendu (cible) qu'on regardait en l'écrivant. */
export interface AtelierMessage {
  id: number;
  by: string;
  name?: string;
  picture?: string;
  text: string;
  target?: Target;
  /** une étape de validation (proposée, validée, à revoir) plutôt qu'un message */
  kind?: 'proposed' | 'approved' | 'changes';
  at: string;
  reactions: Reaction[];
}
type Msgs = { messages: AtelierMessage[] };
/** Une nouveauté du fil de l'activité. */
export interface ActivityEvent {
  type: 'message' | 'proposed' | 'approved' | 'changes' | 'vote' | 'campaign' | 'composition';
  atelier?: string;
  /** titre de la composition, et sa campagne */
  title?: string;
  inCampaign?: string;
  campaign?: string;
  by: string;
  name?: string;
  text?: string;
  target?: Target;
  at: string;
}
/** Fil de l'activité ; avec une campagne (ou '' : hors campagne), seulement ce qui la touche. */
export const fetchActivity = (campaign?: string) => call<ActivityEvent[]>(campaign === undefined ? '/api/activity' : `/api/activity?campaign=${encodeURIComponent(campaign)}`);
export const listMessages = (id: string) => call<AtelierMessage[]>(`/api/ateliers/${id}/messages`);
export const postMessage = (id: string, text: string, target?: Target) => call<Msgs>(`/api/ateliers/${id}/messages`, json('POST', { text, target })).then((r) => r.messages);
export const deleteMessage = (id: string, mid: number) => call<Msgs>(`/api/ateliers/${id}/messages/${mid}`, { method: 'DELETE' }).then((r) => r.messages);
export const reactMessage = (id: string, mid: number, emoji: string, on: boolean) => call<Msgs>(`/api/ateliers/${id}/messages/${mid}/react`, json('POST', { emoji, on })).then((r) => r.messages);
export const removeAtelier = (id: string) => call<{ ok: boolean }>(`/api/ateliers/${id}`, { method: 'DELETE' });
/** Vignette de la composition ; avec t, celle de sa publication n° t quand elle a été enregistrée. */
export const thumbUrl = (m: AtelierMeta, t?: number) => `/api/ateliers/${m.id}/thumb.png?${t !== undefined && t < (m.thumbs ?? 0) ? `t=${t}&` : ''}v=${encodeURIComponent(m.updated)}`;

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
  /** Type d'activité (groupe musical…). */
  kind?: string;
  /** Adresse du logo, s'il y en a un. */
  logo?: string;
}

/** Une source, un compte ou un module relié à l'activité. */
export interface ServiceLink {
  name: string;
  url?: string;
}
/** Rôle d'une couleur de variante : les pastilles prévues de la fiche (principale, texte, bordure, fond, sujets), plus les anciens accent et secondaire. */
export type ColorRole = 'principale' | 'texte' | 'bordure' | 'fond' | 'complementTexte' | 'complementFond' | 'sujet1' | 'sujet2' | 'sujet3' | 'accent' | 'secondaire';
/** Logo principal, anciennes variantes, ou logo d'une variante de couleurs (`pal-<id>`). */
export type LogoVariant = 'main' | 'light' | 'dark' | 'icon' | `pal-${string}`;
export type ChannelKind = MediaKind;
export interface PaletteColor {
  /** Couleur unie, ou premier arrêt d'un dégradé (lu par les anciennes versions). */
  hex: string;
  name?: string;
  role?: ColorRole;
  /** Dégradé : ses arrêts (au moins deux), sa transition et son style. */
  stops?: string[];
  blend?: Blend;
  shape?: GradStyle;
}
export interface Palette {
  id: string;
  name: string;
  colors: PaletteColor[];
}
/** Palettes de la fiche, l'ancienne palette unique comprise. */
export const palettesOf = (p?: ActivityProfile | null): Palette[] =>
  p?.branding?.palettes ?? (p?.branding?.palette?.length ? [{ id: 'principale', name: 'Principale', colors: p.branding.palette }] : []);
/** Canal de communication : où part le support, et ce que cela impose (formats, marge, logo, mentions). */
export interface Channel {
  id: string;
  name: string;
  kind: ChannelKind;
  formats: string[];
  margin?: number;
  /** Marges et zone d'intérêt, côté par côté (du catalogue). */
  margins?: Insets;
  zone?: Insets;
  /** Ancienne description libre de la zone, plus utilisée. */
  focus?: string;
  logo?: LogoVariant;
  /** Palette du canal, sinon la première. */
  palette?: string;
  mentions?: string[];
  url?: string;
  /** Branchements de l'activité sur ce type. */
  connections?: Connection[];
  /** Ancien branchement unique : compte, API (le secret n'est jamais relu, seulement signalé), dossier partagé. */
  account?: string;
  api?: string;
  /** À l'envoi : nouveau secret, ou null pour l'effacer ; absent, il reste. */
  secret?: string | null;
  secretSet?: boolean;
  folder?: string;
}
/** Un branchement de l'activité sur un type de diffusion (plusieurs par type : deux pages Facebook…). */
export interface Connection {
  id: string;
  label?: string;
  account?: string;
  api?: string;
  /** À l'envoi : nouveau secret, ou null pour l'effacer ; absent, il reste. */
  secret?: string | null;
  secretSet?: boolean;
  folder?: string;
}
/** Ce que la fiche garde d'un type de diffusion : le reste vient du catalogue. */
export type ChannelPick = Partial<Channel> & { id: string };
/** Une coordonnée de l'activité. */
export type ContactKind = 'email' | 'tel' | 'site' | 'lien' | 'billetterie' | 'adresse' | 'autre';
export interface Contact {
  kind: ContactKind;
  value: string;
  label?: string;
}
/** Une cible d'un document : un média, un format compatible, une variante de couleurs. */
export interface Target {
  channel?: string;
  format: string;
  palette?: string;
  margins?: { top: number; right: number; bottom: number; left: number };
  width?: number;
}
/** Occasion (concert, nouvelle musique…) et ses cibles. */
export interface Operation {
  id: string;
  name: string;
  /** Icône de l'occasion (occ-concert, occ-music…) ; absente, devinée d'après le nom. */
  icon?: string;
  targets: Target[];
}
/** Fiche de l'activité : identité, branding général, canaux, services. */
export interface ActivityProfile {
  id: string;
  name: string;
  kind?: string;
  services?: { events?: ServiceLink[]; assets?: ServiceLink[] };
  branding?: {
    /** Palettes nommées ; la première sert par défaut. */
    palettes?: Palette[];
    /** Ancienne forme, une seule palette. */
    palette?: PaletteColor[];
    fonts?: { title?: string; body?: string; accent?: string };
    purpose?: string;
    keywords?: string[];
    mentions?: Array<{ name: string; text: string }>;
  };
  contacts?: Contact[];
  /** Types de diffusion retenus : l'identifiant d'un type du catalogue et les accès de l'activité (anciens médias complets lus aussi). */
  channels?: ChannelPick[];
  /** Types de projet : cibles présélectionnées d'un nouveau document. */
  operations?: Operation[];
  /** Adresses des logos présents, par variante. */
  logos?: Partial<Record<LogoVariant, string>>;
}
export const fetchCatalog = () => call<Catalog>('/api/catalog');
export const saveCatalog = (c: Catalog) => call<{ catalog: Catalog }>('/api/catalog', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(c) });
/** Postiz, moteur de diffusion caché : comptes reliés par l'activité, réglage du site (admin). */
export interface PostizAccount {
  id: string;
  name: string;
  identifier: string;
  picture?: string;
  disabled?: boolean;
  profile?: string;
  /** Type de diffusion de l'activité auquel le compte est rattaché. */
  channel: string;
}
export interface PostizAccounts {
  enabled: boolean;
  /** Type de diffusion → fournisseur Postiz. */
  providers: Record<string, string>;
  /** Type dont une connexion est en cours. */
  pending?: string;
  accounts: PostizAccount[];
}
export const fetchPostizAccounts = () => call<PostizAccounts>('/api/postiz/accounts');
export const postizConnect = (channel: string) => call<{ url: string }>('/api/postiz/connect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel }) });
export const postizRemove = (id: string) => call<{ ok: true }>(`/api/postiz/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' });
/** Confie un élément du plan à Postiz : `when` = 'now' ou une date ISO. */
export function postizPublish(p: { campaign: string; item: string; account: string; when: string; caption: string; composition?: string; image?: Blob }) {
  const fd = new FormData();
  for (const k of ['campaign', 'item', 'account', 'when', 'caption', 'composition'] as const) if (p[k] !== undefined) fd.append(k, p[k]!);
  if (p.image) fd.append('image', p.image, p.image.type === 'image/png' ? 'publication.png' : 'publication.jpg');
  return call<{ campaign: Campaign }>('/api/postiz/publish', { method: 'POST', body: fd }).then((r) => r.campaign);
}
export const postizUnschedule = (campaign: string, item: string) =>
  call<{ campaign: Campaign }>(`/api/postiz/publish/${encodeURIComponent(campaign)}/${encodeURIComponent(item)}`, { method: 'DELETE' }).then((r) => r.campaign);
export const postizSync = () => call<{ changed: number; campaigns?: Campaign[] }>('/api/postiz/sync', { method: 'POST' });
export const fetchPostizConfig = () => call<{ url: string; keySet: boolean }>('/api/postiz/config');
export const savePostizConfig = (c: { url?: string; key?: string | null }) =>
  call<{ url: string; keySet: boolean }>('/api/postiz/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(c) });
export const fetchElements = () => call<ElementStore>('/api/elements');
export const saveElements = (e: ElementStore) => call<{ elements: ElementStore }>('/api/elements', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(e) });
export const fetchMyPresets = () => call<UserPresets>('/api/me/presets');
export const saveMyPresets = (p: UserPresets) => call<{ presets: UserPresets }>('/api/me/presets', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(p) });
export const fetchProfile = (team: string) => call<ActivityProfile>(`/api/teams/${encodeURIComponent(team)}/profile`);
export const saveProfile = (team: string, p: Omit<ActivityProfile, 'id' | 'logos'> & { logo?: string | null; logos?: Partial<Record<Exclude<LogoVariant, 'main'>, string | null>> }) =>
  call<{ profile: ActivityProfile }>(`/api/teams/${encodeURIComponent(team)}/profile`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(p),
  });

/** Qui est connecté : compte (Google, Apple), accès partagé par mot de passe, ou poste local. */
export interface Me {
  email?: string;
  name?: string;
  /** Photo du compte Google. */
  picture?: string;
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

/* ---------- polices de la configuration globale ---------- */
export const installFont = (body: { name?: string; url?: string; dir?: string }) =>
  call<{ font: import('./text').FontInfo }>('/api/fonts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
export const removeFont = (id: string) => call<{ ok: true }>(`/api/fonts/${encodeURIComponent(id)}`, { method: 'DELETE' });
