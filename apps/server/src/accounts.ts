import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { PlanPostiz, PostizConfig, PostizTeamState } from './postiz.js';
import { cleanCatalog, cleanElementStore, cleanUserPresets, type Catalog, type ElementStore, type UserPresets } from '@ftd/core';

/**
 * Comptes et équipes : qui peut entrer, dans quelles équipes, avec quel rôle.
 *
 * Une équipe (un groupe, une structure cliente…) partage ses compositions et ses objets.
 * Un membre est désigné par son adresse : l'inviter, c'est l'ajouter à l'équipe ; il entre
 * ensuite avec le compte Google (ou Apple) de cette adresse.
 *
 * Contrairement à l'index de recherche, cette base n'est pas reconstructible : à sauvegarder.
 */

export type Role = 'owner' | 'editor' | 'viewer';
export const ROLES: readonly Role[] = ['owner', 'editor', 'viewer'];

export interface Team {
  id: string;
  name: string;
  created: string;
}

export interface TeamOfUser extends Team {
  role: Role;
}

export interface Member {
  email: string;
  name?: string;
  role: Role;
  /** Première connexion à l'équipe ; absente tant que l'invitation n'a pas servi. */
  joined?: string;
  lastSeen?: string;
  invitedBy?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEAM_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

export const normEmail = (e: string) => e.trim().toLowerCase();

export function teamIdFrom(name: string) {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'equipe'
  );
}

type Row = Record<string, string | number | null>;

/** Une source, un compte ou un module relié à l'activité : un nom et, si besoin, une adresse. */
export interface ServiceLink {
  name: string;
  url?: string;
}

/** Fiche de l'activité : ce pour quoi l'outil existe. */
export interface ActivityProfile {
  /** Groupe musical, association, lieu… */
  kind?: string;
  services?: {
    /** Sources d'évènements (agenda, billetterie…). */
    events?: ServiceLink[];
    /** Comptes qui fournissent des visuels (photos, banques d'images…). */
    assets?: ServiceLink[];
  };
  branding?: {
    /** Palettes nommées (principale, nuit, été…) ; la première sert par défaut. */
    palettes?: Palette[];
    /** Ancienne forme : une seule palette (lue, puis rangée dans palettes). */
    palette?: PaletteColor[];
    /** Polices de la bibliothèque, par usage. */
    fonts?: { title?: string; body?: string; accent?: string };
    /** Raison d'être. */
    purpose?: string;
    keywords?: string[];
    /** Anciens textes récurrents (partenaires, réseaux, hashtags…) : lus, plus édités. */
    mentions?: Array<{ name: string; text: string }>;
  };
  /** Coordonnées : tout ce qui ramène à l'activité (e-mails, téléphones, liens…). */
  contacts?: Contact[];
  /** Canaux de communication (médias) : chacun fixe ses formats, sa marge, son logo et ses mentions. */
  channels?: Channel[];
  /** Occasions (concert, nouvelle musique…) : les cibles présélectionnées d'un nouveau document. */
  operations?: Operation[];
}

/** Une cible d'un document : un média, un format compatible, une variante de couleurs. */
export interface Target {
  channel?: string;
  format: string;
  palette?: string;
}
export interface Operation {
  id: string;
  name: string;
  targets: Target[];
}

export interface PaletteColor {
  hex: string;
  name?: string;
  role?: ColorRole;
  /** Dégradé : arrêts, transition, style (mode, répétitions, miroir, ellipse). */
  stops?: string[];
  blend?: string;
  shape?: { mode: string; repeat: number; mirror?: boolean; ellipse?: boolean };
}
/** Couleurs, chacune avec son rôle (fond, texte, accent, secondaire). */
export interface Palette {
  id: string;
  name: string;
  colors: PaletteColor[];
}

export const COLOR_ROLES = ['principale', 'texte', 'bordure', 'fond', 'complementTexte', 'complementFond', 'sujet1', 'sujet2', 'sujet3', 'accent', 'secondaire'] as const;
export type ColorRole = (typeof COLOR_ROLES)[number];
export const CHANNEL_KINDS = ['social', 'affichage', 'impression', 'email', 'site', 'streaming', 'video'] as const;
export const LOGO_VARIANTS = ['main', 'light', 'dark', 'icon'] as const;
/** Logo principal, anciennes variantes, ou logo d'une variante de couleurs (`pal-<id>`). */
export type LogoVariant = (typeof LOGO_VARIANTS)[number] | `pal-${string}`;
export const isLogoKey = (k: string): k is LogoVariant => (LOGO_VARIANTS as readonly string[]).includes(k) || /^pal-[a-z0-9-]{1,40}$/.test(k);

export const CONTACT_KINDS = ['email', 'tel', 'site', 'lien', 'billetterie', 'adresse', 'autre'] as const;
export interface Contact {
  kind: (typeof CONTACT_KINDS)[number];
  value: string;
  /** Précision : « booking », « presse »… */
  label?: string;
}

/**
 * Un type de diffusion retenu par l'activité. Ses formats, sa marge et sa zone viennent du catalogue du site ;
 * l'activité y range ses accès (compte, API, dossier). Les anciens médias décrits en entier restent lus.
 */
/** Un branchement de l'activité sur un type de diffusion : un compte, son accès d'API, son dossier. Plusieurs par type (deux pages Facebook…). */
export interface Connection {
  id: string;
  /** Nom donné au branchement (« Page du groupe »…). */
  label?: string;
  account?: string;
  api?: string;
  /** Jamais renvoyé au navigateur. */
  secret?: string;
  secretSet?: boolean;
  folder?: string;
}

export interface Channel {
  id: string;
  /** Branchements de l'activité sur ce type (remplacent account/api/secret/folder ci-dessous). */
  connections?: Connection[];
  name?: string;
  kind?: (typeof CHANNEL_KINDS)[number];
  /** Formats de l'atelier (identifiants), le premier par défaut. */
  formats?: string[];
  /** Marge des repères, en fraction du petit côté. */
  margin?: number;
  /** Zone d'intérêt (à venir) : description libre pour l'instant. */
  focus?: string;
  logo?: LogoVariant;
  /** Palette du canal (identifiant), sinon la première. */
  palette?: string;
  /** Noms des mentions à poser. */
  mentions?: string[];
  /** Compte où publier (ancien nom : url). */
  url?: string;
  account?: string;
  /** Délégation d'accès : adresse de l'API et secret (jamais renvoyé au navigateur). */
  api?: string;
  secret?: string;
  /** Le secret est enregistré (seule information renvoyée). */
  secretSet?: boolean;
  /** Dossier cloud partagé. */
  folder?: string;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function cleanLinks(v: unknown): ServiceLink[] {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, 30)
    .map((x) => {
      const name = str((x as ServiceLink)?.name, 80);
      const url = str((x as ServiceLink)?.url, 500);
      return { name, ...(url ? { url } : {}) };
    })
    .filter((x) => x.name || x.url);
}

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function cleanConnections(c: Partial<Channel>): Connection[] {
  const seen = new Set<string>();
  // ancienne fiche : un seul branchement rangé à même le type
  const raw = Array.isArray(c.connections) ? c.connections : c.account || c.api || c.secret || c.folder ? [{ id: 'c1', account: c.account, api: c.api, secret: c.secret, folder: c.folder }] : [];
  return raw
    .slice(0, 10)
    .map((x, i) => {
      let id = str(x?.id, 20).replace(/[^a-z0-9-]/gi, '') || `c${i + 1}`;
      for (let n = 2; seen.has(id); n++) id = `c${i + n}`;
      seen.add(id);
      const t = (k: 'label' | 'account' | 'api' | 'folder' | 'secret', max: number) => (str(x?.[k], max) ? { [k]: str(x?.[k], max) } : {});
      return { id, ...t('label', 60), ...t('account', 200), ...t('api', 500), ...t('secret', 2000), ...t('folder', 500) } as Connection;
    });
}

function cleanChannel(c: Partial<Channel>, i: number): Channel | null {
  const name = str(c?.name, 60);
  const given = str(c?.id, 40).replace(/[^a-z0-9-]/g, '');
  // un type du catalogue n'a besoin que de son identifiant
  if (!name && !given) return null;
  const kind = (CHANNEL_KINDS as readonly string[]).includes(c.kind as string) ? (c.kind as Channel['kind']) : undefined;
  const id = given || `canal-${i + 1}`;
  const margin = typeof c.margin === 'number' && Number.isFinite(c.margin) ? Math.max(-0.25, Math.min(0.25, c.margin)) : undefined;
  const logo = (LOGO_VARIANTS as readonly string[]).includes(c.logo as string) ? c.logo : undefined;
  const formats = arr<string>(c.formats).map((f) => str(f, 40)).filter(Boolean).slice(0, 12);
  return {
    id,
    ...(name ? { name } : {}),
    ...(kind ? { kind } : {}),
    ...(formats.length ? { formats } : {}),
    ...(margin !== undefined ? { margin } : {}),
    ...(str(c.focus, 300) ? { focus: str(c.focus, 300) } : {}),
    ...(logo ? { logo } : {}),
    ...(str(c.palette, 40) ? { palette: str(c.palette, 40) } : {}),
    mentions: arr<string>(c.mentions).map((m) => str(m, 60)).filter(Boolean).slice(0, 20),
    ...(str(c.url, 500) ? { url: str(c.url, 500) } : {}),
    ...(cleanConnections(c).length ? { connections: cleanConnections(c) } : {}),
  };
}

function cleanContacts(v: unknown): Contact[] {
  return arr<Partial<Contact>>(v)
    .slice(0, 40)
    .map((c) => ({
      kind: (CONTACT_KINDS as readonly string[]).includes(c?.kind as string) ? (c!.kind as Contact['kind']) : 'autre',
      value: str(c?.value, 300),
      ...(str(c?.label, 60) ? { label: str(c?.label, 60) } : {}),
    }))
    .filter((c) => c.value);
}

const HEX = /^#[0-9a-fA-F]{6}$/;
/** Dégradé d'une couleur de variante : 2 à 8 arrêts, transition et style connus. */
function gradientOf(c: PaletteColor): Pick<PaletteColor, 'stops' | 'blend' | 'shape'> {
  const stops = Array.isArray(c.stops) ? c.stops.filter((x) => typeof x === 'string' && HEX.test(x)).slice(0, 8).map((x) => x.toLowerCase()) : [];
  if (stops.length < 2) return {};
  const sh = c.shape;
  const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined);
  const shape =
    sh && ['linear', 'radial', 'conic', 'diamond'].includes(sh.mode)
      ? { mode: sh.mode, repeat: num(sh.repeat, 1, 12) ?? 1, ...(sh.mirror ? { mirror: true } : {}), ...(sh.ellipse ? { ellipse: true } : {}) }
      : undefined;
  return { stops, ...(['smooth', 'soft', 'hard'].includes(c.blend as string) ? { blend: c.blend } : {}), ...(shape ? { shape } : {}) };
}

/** Garde ce qui est attendu, à des tailles raisonnables. */
export function cleanProfile(p: ActivityProfile): ActivityProfile {
  const colorsOf = (v: unknown): PaletteColor[] =>
    arr<PaletteColor>(v)
      .slice(0, 24)
      .filter((c) => typeof c?.hex === 'string' && HEX.test(c.hex))
      .map((c) => ({
        hex: c.hex.toLowerCase(),
        ...(str(c.name, 40) ? { name: str(c.name, 40) } : {}),
        ...((COLOR_ROLES as readonly string[]).includes(c.role as string) ? { role: c.role } : {}),
        ...gradientOf(c),
      }));
  const rawPalettes = Array.isArray(p.branding?.palettes)
    ? p.branding!.palettes
    : Array.isArray(p.branding?.palette) && p.branding!.palette.length
      ? [{ id: 'principale', name: 'Principale', colors: p.branding!.palette }]
      : [];
  const seenPal = new Set<string>();
  const palettes = arr<Partial<Palette>>(rawPalettes)
    .slice(0, 12)
    .map((q, i) => {
      const name = str(q?.name, 40) || `Palette ${i + 1}`;
      const base = str(q?.id, 40).replace(/[^a-z0-9-]/g, '') || `palette-${i + 1}`;
      let id = base;
      for (let n = 2; seenPal.has(id); n++) id = `${base}-${n}`;
      seenPal.add(id);
      return { id, name, colors: colorsOf(q?.colors) };
    })
    .filter((q) => q.colors.length);
  const f = p.branding?.fonts ?? {};
  const fonts = Object.fromEntries((['title', 'body', 'accent'] as const).filter((k) => str(f[k], 40)).map((k) => [k, str(f[k], 40)]));
  const mentions = arr<{ name: string; text: string }>(p.branding?.mentions)
    .map((m) => ({ name: str(m?.name, 60), text: str(m?.text, 1000) }))
    .filter((m) => m.name && m.text)
    .slice(0, 30);
  const seen = new Set<string>();
  const channels = arr<Partial<Channel>>(p.channels)
    .slice(0, 30)
    .map(cleanChannel)
    .filter((c): c is Channel => !!c)
    .map((c) => {
      // identifiants uniques : ils servent de lien depuis les compositions
      let id = c.id;
      for (let n = 2; seen.has(id); n++) id = `${c.id}-${n}`;
      seen.add(id);
      const { palette, ...rest } = c;
      return { ...rest, id, ...(palette && seenPal.has(palette) ? { palette } : {}) };
    });
  const seenOp = new Set<string>();
  const operations = arr<Partial<Operation>>(p.operations)
    .slice(0, 30)
    .map((o, i) => {
      const name = str(o?.name, 60);
      const base = str(o?.id, 40).replace(/[^a-z0-9-]/g, '') || `occasion-${i + 1}`;
      let id = base;
      for (let n = 2; seenOp.has(id); n++) id = `${base}-${n}`;
      seenOp.add(id);
      const targets = arr<Partial<Target>>(o?.targets)
        .slice(0, 20)
        .map((t) => ({
          ...(str(t?.channel, 40) ? { channel: str(t?.channel, 40) } : {}),
          format: str(t?.format, 40),
          ...(str(t?.palette, 40) ? { palette: str(t?.palette, 40) } : {}),
        }))
        .filter((t) => t.format);
      return { id, name, targets };
    })
    .filter((o) => o.name);
  const keywords = (Array.isArray(p.branding?.keywords) ? p.branding!.keywords : [])
    .map((k) => str(k, 40))
    .filter(Boolean)
    .slice(0, 30);
  return {
    ...(str(p.kind, 60) ? { kind: str(p.kind, 60) } : {}),
    services: { events: cleanLinks(p.services?.events), assets: cleanLinks(p.services?.assets) },
    branding: { palettes, fonts, purpose: str(p.branding?.purpose, 2000), keywords, mentions },
    contacts: cleanContacts(p.contacts),
    channels,
    ...(Array.isArray(p.operations) ? { operations } : {}),
  };
}

export class Accounts {
  private db: DatabaseSync;

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS users (
        email TEXT PRIMARY KEY, name TEXT, created TEXT NOT NULL, last_seen TEXT
      );
      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, created TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS members (
        team TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
        invited_by TEXT, invited TEXT NOT NULL, joined TEXT,
        PRIMARY KEY (team, email)
      );
      CREATE INDEX IF NOT EXISTS members_email ON members(email);
      CREATE TABLE IF NOT EXISTS campaigns (
        team TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, data TEXT,
        created TEXT NOT NULL, by TEXT, closed TEXT,
        PRIMARY KEY (team, id)
      );
      CREATE TABLE IF NOT EXISTS votes (
        team TEXT NOT NULL, atelier TEXT NOT NULL, email TEXT NOT NULL, at TEXT NOT NULL,
        PRIMARY KEY (team, atelier, email)
      );
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team TEXT NOT NULL, atelier TEXT NOT NULL, email TEXT NOT NULL,
        text TEXT NOT NULL, target TEXT, at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS messages_atelier ON messages(team, atelier);
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, value TEXT NOT NULL, updated TEXT NOT NULL, by TEXT
      );
      CREATE TABLE IF NOT EXISTS reactions (
        message INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        email TEXT NOT NULL, emoji TEXT NOT NULL, at TEXT NOT NULL,
        PRIMARY KEY (message, email, emoji)
      );
    `);
    // colonnes ajoutées après coup : fiche d'activité, logo, photo de profil
    this.addColumn('teams', 'profile', 'TEXT');
    this.addColumn('teams', 'logo', 'TEXT');
    this.addColumn('teams', 'updated', 'TEXT');
    this.addColumn('teams', 'logos', 'TEXT');
    this.addColumn('users', 'picture', 'TEXT');
    // étapes de validation inscrites dans la conversation : proposed | approved | changes
    this.addColumn('messages', 'kind', 'TEXT');
  }

  private addColumn(table: string, column: string, type: string) {
    const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as Row[];
    if (!cols.some((c) => c.name === column)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }

  close() {
    this.db.close();
  }

  /* ---------- équipes ---------- */

  team(id: string): Team | undefined {
    const r = this.db.prepare('SELECT id, name, created FROM teams WHERE id = ?').get(id) as Row | undefined;
    return r ? { id: String(r.id), name: String(r.name), created: String(r.created) } : undefined;
  }

  teams(): Team[] {
    return (this.db.prepare('SELECT id, name, created FROM teams ORDER BY name').all() as Row[]).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      created: String(r.created),
    }));
  }

  /** Crée l'équipe ; l'identifiant (dossier sur disque) est tiré du nom s'il n'est pas donné. */
  createTeam(name: string, opts: { id?: string; owner?: string } = {}): Team {
    const clean = name.trim().slice(0, 80);
    if (!clean) throw new Error('Nom d’équipe manquant');
    let id = opts.id ?? teamIdFrom(clean);
    if (!TEAM_ID.test(id)) throw new Error(`Identifiant d’équipe invalide : ${id}`);
    if (!opts.id) for (let n = 2; this.team(id); n++) id = `${teamIdFrom(clean).slice(0, 28)}-${n}`;
    else if (this.team(id)) throw new Error(`L’équipe ${id} existe déjà`);
    const created = new Date().toISOString();
    this.db.prepare('INSERT INTO teams (id, name, created) VALUES (?, ?, ?)').run(id, clean, created);
    if (opts.owner) this.addMember(id, opts.owner, 'owner');
    return { id, name: clean, created };
  }

  renameTeam(id: string, name: string) {
    const clean = name.trim().slice(0, 80);
    if (!clean) throw new Error('Nom d’équipe manquant');
    if (!this.db.prepare('UPDATE teams SET name = ? WHERE id = ?').run(clean, id).changes) throw new Error('Équipe introuvable');
  }

  /* ---------- fiche d'activité ---------- */

  /** Catalogue du site (formats, types de diffusion) : celui des administrateurs, sinon celui d'origine. */
  catalog(): Catalog {
    const r = this.db.prepare("SELECT value FROM settings WHERE key = 'catalog'").get() as Row | undefined;
    try {
      return cleanCatalog(r?.value ? JSON.parse(String(r.value)) : {});
    } catch {
      return cleanCatalog({});
    }
  }

  /* ---------- Postiz : réglage du site, comptes reliés par activité ---------- */

  private setting(key: string): unknown {
    const r = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as Row | undefined;
    try {
      return r?.value ? JSON.parse(String(r.value)) : undefined;
    } catch {
      return undefined;
    }
  }

  private putSetting(key: string, value: unknown, by?: string) {
    this.db
      .prepare('INSERT INTO settings (key, value, updated, by) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated = excluded.updated, by = excluded.by')
      .run(key, JSON.stringify(value), new Date().toISOString(), by ?? null);
  }

  /** Adresse et clé de Postiz enregistrées par les administrateurs (la clé ne sort jamais du serveur). */
  postizConfig(): PostizConfig {
    const v = (this.setting('postiz') ?? {}) as PostizConfig;
    return { ...(str(v.url, 300) ? { url: str(v.url, 300) } : {}), ...(str(v.key, 500) ? { key: str(v.key, 500) } : {}) };
  }

  /** `key` absente = gardée, null = effacée ; `url` vide = effacée. */
  setPostizConfig(raw: { url?: unknown; key?: unknown }, by?: string): PostizConfig {
    const cur = this.postizConfig();
    const url = raw.url === undefined ? cur.url : str(raw.url, 300).replace(/\/+$/, '');
    if (url && !/^https?:\/\//.test(url)) throw new Error('L’adresse de Postiz doit commencer par https://');
    const key = raw.key === undefined ? cur.key : raw.key === null ? undefined : str(raw.key, 500) || cur.key;
    const next = { ...(url ? { url } : {}), ...(key ? { key } : {}) };
    this.putSetting('postiz', next, by);
    return next;
  }

  postizTeam(team: string): PostizTeamState {
    const v = (this.setting(`postiz:team:${team}`) ?? {}) as Partial<PostizTeamState>;
    return { accounts: v.accounts && typeof v.accounts === 'object' ? { ...v.accounts } : {}, ...(v.pending ? { pending: v.pending } : {}) };
  }

  setPostizTeam(team: string, state: PostizTeamState, by?: string) {
    this.putSetting(`postiz:team:${team}`, state, by);
  }

  /** Comptes Postiz déjà pris par une activité (sauf `except`). */
  postizTaken(except?: string): Set<string> {
    const rows = this.db.prepare("SELECT key, value FROM settings WHERE key LIKE 'postiz:team:%'").all() as Row[];
    const out = new Set<string>();
    for (const r of rows) {
      if (String(r.key) === `postiz:team:${except}`) continue;
      try {
        for (const id of Object.keys((JSON.parse(String(r.value)) as PostizTeamState).accounts ?? {})) out.add(id);
      } catch {
        /* ligne illisible : ignorée */
      }
    }
    return out;
  }

  setCatalog(raw: unknown, by?: string): Catalog {
    const c = cleanCatalog(raw);
    this.db
      .prepare("INSERT INTO settings (key, value, updated, by) VALUES ('catalog', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated = excluded.updated, by = excluded.by")
      .run(JSON.stringify(c), new Date().toISOString(), by ?? null);
    return c;
  }

  /** Fiches des éléments réglées par les gérants : copies des fiches d'origine et fiches cachées. */
  elements(): ElementStore {
    const r = this.db.prepare("SELECT value FROM settings WHERE key = 'elements'").get() as Row | undefined;
    try {
      return cleanElementStore(r?.value ? JSON.parse(String(r.value)) : {});
    } catch {
      return cleanElementStore({});
    }
  }

  setElements(raw: unknown, by?: string): ElementStore {
    const c = cleanElementStore(raw);
    this.db
      .prepare("INSERT INTO settings (key, value, updated, by) VALUES ('elements', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated = excluded.updated, by = excluded.by")
      .run(JSON.stringify(c), new Date().toISOString(), by ?? null);
    return c;
  }

  /** Mes réglages : les jeux de paramètres qu'une personne garde pour ses éléments (`who` : son adresse, ou « local »). */
  userPresets(who: string): UserPresets {
    const r = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(`presets:${who}`) as Row | undefined;
    try {
      return cleanUserPresets(r?.value ? JSON.parse(String(r.value)) : {});
    } catch {
      return {};
    }
  }

  setUserPresets(who: string, raw: unknown): UserPresets {
    const c = cleanUserPresets(raw);
    this.db
      .prepare('INSERT INTO settings (key, value, updated, by) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated = excluded.updated, by = excluded.by')
      .run(`presets:${who}`, JSON.stringify(c), new Date().toISOString(), who);
    return c;
  }

  /** Fiche de l'activité (type, services, branding) ; vide tant que personne ne l'a remplie. */
  profile(id: string): ActivityProfile {
    const r = this.db.prepare('SELECT profile FROM teams WHERE id = ?').get(id) as Row | undefined;
    if (!r) throw new Error('Équipe introuvable');
    try {
      return r.profile ? (JSON.parse(String(r.profile)) as ActivityProfile) : {};
    } catch {
      return {};
    }
  }

  setProfile(id: string, profile: ActivityProfile) {
    const clean = cleanProfile(profile);
    const now = new Date().toISOString();
    if (!this.db.prepare('UPDATE teams SET profile = ?, updated = ? WHERE id = ?').run(JSON.stringify(clean), now, id).changes) throw new Error('Équipe introuvable');
    return clean;
  }

  /** Logo (ou une de ses variantes) en data URL : PNG, JPEG, SVG ou WebP ; null pour l'enlever. */
  setLogo(id: string, dataUrl: string | null, variant: LogoVariant = 'main') {
    if (!isLogoKey(variant)) throw new Error(`Variante de logo inconnue : ${variant}`);
    if (dataUrl !== null) {
      if (!/^data:image\/(png|jpeg|svg\+xml|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) throw new Error('Logo attendu : image PNG, JPEG, SVG ou WebP');
      // le logo d'une variante sert dans les documents : transparence et haute résolution
      const max = variant.startsWith('pal-') ? 5_600_000 : 1_500_000;
      if (dataUrl.length > max) throw new Error(`Logo trop lourd (${variant.startsWith('pal-') ? 4 : 1} Mo au plus)`);
    }
    const now = new Date().toISOString();
    if (variant === 'main') {
      if (!this.db.prepare('UPDATE teams SET logo = ?, updated = ? WHERE id = ?').run(dataUrl, now, id).changes) throw new Error('Équipe introuvable');
      return;
    }
    const others = { ...this.variants(id) };
    if (dataUrl === null) delete others[variant];
    else others[variant] = dataUrl;
    if (!this.db.prepare('UPDATE teams SET logos = ?, updated = ? WHERE id = ?').run(JSON.stringify(others), now, id).changes) throw new Error('Équipe introuvable');
  }

  private variants(id: string): Partial<Record<LogoVariant, string>> {
    const r = this.db.prepare('SELECT logos FROM teams WHERE id = ?').get(id) as Row | undefined;
    try {
      return r?.logos ? JSON.parse(String(r.logos)) : {};
    } catch {
      return {};
    }
  }

  logo(id: string, variant: LogoVariant = 'main'): { type: string; data: Buffer } | null {
    let url: string | undefined;
    if (variant === 'main') {
      const r = this.db.prepare('SELECT logo FROM teams WHERE id = ?').get(id) as Row | undefined;
      url = r?.logo ? String(r.logo) : undefined;
    } else url = this.variants(id)[variant];
    const m = url ? url.match(/^data:([^;]+);base64,(.+)$/) : null;
    return m ? { type: m[1]!, data: Buffer.from(m[2]!, 'base64') } : null;
  }

  /** Variantes de logo présentes (hors logo principal). */
  logoVariants(id: string): LogoVariant[] {
    return Object.keys(this.variants(id)) as LogoVariant[];
  }

  /** Pour les menus : a-t-elle un logo, et sa version (pour le cache du navigateur). */
  looks(id: string): { logo: boolean; updated?: string; kind?: string } {
    const r = this.db.prepare('SELECT logo IS NOT NULL AS has, updated, profile FROM teams WHERE id = ?').get(id) as Row | undefined;
    let kind: string | undefined;
    try {
      kind = r?.profile ? (JSON.parse(String(r.profile)) as ActivityProfile).kind : undefined;
    } catch {
      kind = undefined;
    }
    return { logo: !!r?.has, ...(r?.updated ? { updated: String(r.updated) } : {}), ...(kind ? { kind } : {}) };
  }

  picture(email: string): string | undefined {
    const r = this.db.prepare('SELECT picture FROM users WHERE email = ?').get(normEmail(email)) as Row | undefined;
    return r?.picture ? String(r.picture) : undefined;
  }

  /* ---------- membres ---------- */

  /** Ses équipes, la plus ancienne d'abord : c'est l'équipe active par défaut. */
  teamsOf(email: string): TeamOfUser[] {
    return (
      this.db
        .prepare('SELECT t.id, t.name, t.created, m.role FROM members m JOIN teams t ON t.id = m.team WHERE m.email = ? ORDER BY m.invited, t.name')
        .all(normEmail(email)) as Row[]
    ).map((r) => ({ id: String(r.id), name: String(r.name), created: String(r.created), role: r.role as Role }));
  }

  roleIn(team: string, email: string): Role | undefined {
    const r = this.db.prepare('SELECT role FROM members WHERE team = ? AND email = ?').get(team, normEmail(email)) as Row | undefined;
    return r ? (r.role as Role) : undefined;
  }

  members(team: string): Member[] {
    return (
      this.db
        .prepare(
          `SELECT m.email, m.role, m.joined, m.invited_by, u.name, u.last_seen
           FROM members m LEFT JOIN users u ON u.email = m.email WHERE m.team = ?
           ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, m.email`,
        )
        .all(team) as Row[]
    ).map((r) => ({
      email: String(r.email),
      role: r.role as Role,
      ...(r.name ? { name: String(r.name) } : {}),
      ...(r.joined ? { joined: String(r.joined) } : {}),
      ...(r.last_seen ? { lastSeen: String(r.last_seen) } : {}),
      ...(r.invited_by ? { invitedBy: String(r.invited_by) } : {}),
    }));
  }

  /** Invite (ou réinvite) une adresse ; un membre déjà présent garde son rôle sauf si on le change ensuite. */
  addMember(team: string, email: string, role: Role, invitedBy?: string): Member {
    const e = normEmail(email);
    if (!EMAIL.test(e)) throw new Error(`Adresse invalide : ${email}`);
    if (!ROLES.includes(role)) throw new Error(`Rôle inconnu : ${role}`);
    if (!this.team(team)) throw new Error('Équipe introuvable');
    if (this.roleIn(team, e)) throw new Error(`${e} fait déjà partie de l’équipe`);
    const now = new Date().toISOString();
    // quelqu'un qui s'est déjà connecté rejoint tout de suite
    const known = this.db.prepare('SELECT 1 FROM users WHERE email = ?').get(e);
    this.db
      .prepare('INSERT INTO members (team, email, role, invited_by, invited, joined) VALUES (?, ?, ?, ?, ?, ?)')
      .run(team, e, role, invitedBy ? normEmail(invitedBy) : null, now, known ? now : null);
    return this.members(team).find((m) => m.email === e)!;
  }

  setRole(team: string, email: string, role: Role) {
    if (!ROLES.includes(role)) throw new Error(`Rôle inconnu : ${role}`);
    const e = normEmail(email);
    const current = this.roleIn(team, e);
    if (!current) throw new Error('Membre introuvable');
    if (current === 'owner' && role !== 'owner' && this.owners(team) <= 1) throw new Error('L’équipe doit garder au moins un responsable');
    this.db.prepare('UPDATE members SET role = ? WHERE team = ? AND email = ?').run(role, team, e);
  }

  removeMember(team: string, email: string) {
    const e = normEmail(email);
    const current = this.roleIn(team, e);
    if (!current) throw new Error('Membre introuvable');
    if (current === 'owner' && this.owners(team) <= 1) throw new Error('L’équipe doit garder au moins un responsable');
    this.db.prepare('DELETE FROM members WHERE team = ? AND email = ?').run(team, e);
  }

  private owners(team: string) {
    return Number((this.db.prepare("SELECT COUNT(*) AS n FROM members WHERE team = ? AND role = 'owner'").get(team) as Row).n);
  }

  /* ---------- connexion ---------- */

  /** Une adresse peut entrer si elle appartient à au moins une équipe (invitation comprise). */
  isMember(email: string) {
    return !!this.db.prepare('SELECT 1 FROM members WHERE email = ? LIMIT 1').get(normEmail(email));
  }

  /** À chaque connexion : retient le nom et l'heure, et transforme les invitations en adhésions. */
  signedIn(email: string, name?: string, picture?: string) {
    const e = normEmail(email);
    const now = new Date().toISOString();
    const pic = picture && /^https:\/\//.test(picture) ? picture : null;
    this.db
      .prepare(
        `INSERT INTO users (email, name, created, last_seen, picture) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET name = COALESCE(excluded.name, users.name), last_seen = excluded.last_seen,
           picture = COALESCE(excluded.picture, users.picture)`,
      )
      .run(e, name ?? null, now, now, pic);
    this.db.prepare('UPDATE members SET joined = ? WHERE email = ? AND joined IS NULL').run(now, e);
  }

  /* ---------- campagnes et votes ---------- */

  campaigns(team: string): Campaign[] {
    const rows = this.db.prepare('SELECT * FROM campaigns WHERE team = ? ORDER BY closed IS NOT NULL, created DESC').all(team) as Row[];
    return rows.map(campaignOf);
  }

  campaign(team: string, id: string): Campaign | undefined {
    const r = this.db.prepare('SELECT * FROM campaigns WHERE team = ? AND id = ?').get(team, id) as Row | undefined;
    return r ? campaignOf(r) : undefined;
  }

  createCampaign(team: string, input: CampaignInput, by?: string): Campaign {
    const name = str(input.name, 80);
    if (!name) throw new Error('Nom de campagne attendu');
    const base = teamIdFrom(name) || 'campagne';
    let id = base;
    for (let n = 2; this.campaign(team, id); n++) id = `${base}-${n}`;
    this.db.prepare('INSERT INTO campaigns (team, id, name, data, created, by) VALUES (?, ?, ?, ?, ?, ?)').run(team, id, name, JSON.stringify(cleanCampaign({ ...input, plan: input.plan?.map(({ postiz: _p, ...it }) => it) })), new Date().toISOString(), by ?? null);
    return this.campaign(team, id)!;
  }

  updateCampaign(team: string, id: string, input: CampaignInput & { closed?: boolean }): Campaign {
    const cur = this.campaign(team, id);
    if (!cur) throw new Error('Campagne introuvable');
    const name = str(input.name, 80) || cur.name;
    const { id: _i, name: _n, created: _c, by: _b, closed: _x, ...prev } = cur;
    // le suivi Postiz ne vient que du serveur : celui envoyé par le navigateur est remplacé par le nôtre
    const kept = new Map((cur.plan ?? []).filter((it) => it.postiz).map((it) => [it.id, it.postiz!]));
    if (input.plan) {
      // une publication programmée chez Postiz ne quitte pas le plan sans être annulée : elle paraîtrait sans suivi
      const ids = new Set(input.plan.map((it) => it.id));
      if ([...kept].some(([id, p]) => p.state === 'queue' && !ids.has(id))) throw new Error('Une publication programmée ne se retire pas du plan : annule d’abord sa programmation');
      input = { ...input, plan: input.plan.map(({ postiz: _p, ...it }) => (kept.has(it.id) ? { ...it, postiz: kept.get(it.id) } : it)) };
    }
    const data = cleanCampaign({ ...prev, ...input });
    const closed = input.closed === undefined ? (cur.closed ?? null) : input.closed ? (cur.closed ?? new Date().toISOString()) : null;
    this.db.prepare('UPDATE campaigns SET name = ?, data = ?, closed = ? WHERE team = ? AND id = ?').run(name, JSON.stringify(data), closed, team, id);
    return this.campaign(team, id)!;
  }

  /** Met à jour un élément du plan côté serveur (suivi Postiz, parution). `postiz: null` l'efface. */
  setPlanItem(team: string, id: string, item: string, patch: Partial<Omit<PlanItem, 'postiz'>> & { postiz?: PlanPostiz | null }): Campaign {
    const cur = this.campaign(team, id);
    if (!cur) throw new Error('Campagne introuvable');
    if (!cur.plan?.some((it) => it.id === item)) throw new Error('Élément du plan introuvable');
    const { id: _i, name: _n, created: _c, by: _b, closed: _x, ...prev } = cur;
    const plan = cur.plan.map((it) => {
      if (it.id !== item) return it;
      const { postiz, ...rest } = { ...it, ...patch };
      return postiz ? { ...rest, postiz } : rest;
    });
    this.db.prepare('UPDATE campaigns SET data = ? WHERE team = ? AND id = ?').run(JSON.stringify(cleanCampaign({ ...prev, plan })), team, id);
    return this.campaign(team, id)!;
  }

  /** Votes de l'équipe : composition → adresses des votants. */
  votes(team: string): Map<string, string[]> {
    const out = new Map<string, string[]>();
    for (const r of this.db.prepare('SELECT atelier, email FROM votes WHERE team = ? ORDER BY at').all(team) as Row[]) {
      const k = String(r.atelier);
      out.set(k, [...(out.get(k) ?? []), String(r.email)]);
    }
    return out;
  }

  vote(team: string, atelier: string, email: string, on: boolean) {
    if (on) this.db.prepare('INSERT OR IGNORE INTO votes (team, atelier, email, at) VALUES (?, ?, ?, ?)').run(team, atelier, normEmail(email), new Date().toISOString());
    else this.db.prepare('DELETE FROM votes WHERE team = ? AND atelier = ? AND email = ?').run(team, atelier, normEmail(email));
    return this.votes(team).get(atelier) ?? [];
  }

  forgetVotes(team: string, atelier: string) {
    this.db.prepare('DELETE FROM votes WHERE team = ? AND atelier = ?').run(team, atelier);
    this.db.prepare('DELETE FROM messages WHERE team = ? AND atelier = ?').run(team, atelier);
  }

  /* ---------- messages sur une composition, et leurs smileys ---------- */

  /** Nombre de messages par composition. */
  messageCounts(team: string): Map<string, number> {
    const out = new Map<string, number>();
    for (const r of this.db.prepare('SELECT atelier, COUNT(*) AS n FROM messages WHERE team = ? AND kind IS NULL GROUP BY atelier').all(team) as Row[]) out.set(String(r.atelier), Number(r.n));
    return out;
  }

  messages(team: string, atelier: string, me: string): Message[] {
    const rows = this.db
      .prepare('SELECT m.id, m.email, m.text, m.target, m.kind, m.at, u.name, u.picture FROM messages m LEFT JOIN users u ON u.email = m.email WHERE m.team = ? AND m.atelier = ? ORDER BY m.id')
      .all(team, atelier) as Row[];
    const reacts = this.db
      .prepare('SELECT r.message, r.email, r.emoji FROM reactions r JOIN messages m ON m.id = r.message WHERE m.team = ? AND m.atelier = ? ORDER BY r.at')
      .all(team, atelier) as Row[];
    const mine = normEmail(me);
    return rows.map((r) => {
      const rs: Reaction[] = [];
      for (const x of reacts.filter((y) => Number(y.message) === Number(r.id))) {
        const e = String(x.emoji);
        let g = rs.find((y) => y.emoji === e);
        if (!g) rs.push((g = { emoji: e, by: [], mine: false }));
        g.by.push(String(x.email));
        if (x.email === mine) g.mine = true;
      }
      return {
        id: Number(r.id),
        by: String(r.email),
        ...(r.name ? { name: String(r.name) } : {}),
        ...(r.picture ? { picture: String(r.picture) } : {}),
        text: String(r.text),
        ...(r.target ? { target: JSON.parse(String(r.target)) as Target } : {}),
        ...(r.kind ? { kind: String(r.kind) as ReviewStep } : {}),
        at: String(r.at),
        reactions: rs,
      };
    });
  }

  addMessage(team: string, atelier: string, email: string, text: string, target?: Target) {
    const t = text.trim().slice(0, 2000);
    if (!t) throw new Error('Message vide');
    const tg = target && typeof target.format === 'string' ? { ...(target.channel ? { channel: str(target.channel, 40) } : {}), format: str(target.format, 40), ...(target.palette ? { palette: str(target.palette, 40) } : {}) } : null;
    this.db.prepare('INSERT INTO messages (team, atelier, email, text, target, at) VALUES (?, ?, ?, ?, ?, ?)').run(team, atelier, normEmail(email), t, tg ? JSON.stringify(tg) : null, new Date().toISOString());
  }

  /** Ce qui s'est passé dans l'équipe : messages et étapes de validation, votes ; du plus récent au plus ancien. */
  activity(team: string, limit = 80): ActivityEvent[] {
    const msgs = this.db
      .prepare('SELECT m.atelier, m.email, m.text, m.kind, m.target, m.at, u.name FROM messages m LEFT JOIN users u ON u.email = m.email WHERE m.team = ? ORDER BY m.at DESC, m.id DESC LIMIT ?')
      .all(team, limit) as Row[];
    const votes = this.db.prepare('SELECT v.atelier, v.email, v.at, u.name FROM votes v LEFT JOIN users u ON u.email = v.email WHERE v.team = ? ORDER BY v.at DESC LIMIT ?').all(team, limit) as Row[];
    const camps = this.db.prepare('SELECT id, name, by, created FROM campaigns WHERE team = ? ORDER BY created DESC LIMIT ?').all(team, limit) as Row[];
    const name = (r: Row) => (r.name ? { name: String(r.name) } : {});
    return [
      ...msgs.map((r) => ({
        type: (r.kind ? String(r.kind) : 'message') as ActivityEvent['type'],
        atelier: String(r.atelier),
        by: String(r.email),
        ...name(r),
        ...(r.text ? { text: String(r.text).slice(0, 140) } : {}),
        ...(r.target ? { target: JSON.parse(String(r.target)) as Target } : {}),
        at: String(r.at),
      })),
      ...votes.map((r) => ({ type: 'vote' as const, atelier: String(r.atelier), by: String(r.email), ...name(r), at: String(r.at) })),
      ...camps.map((r) => ({ type: 'campaign' as const, campaign: String(r.id), text: String(r.name), by: String(r.by ?? ''), at: String(r.created) })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, limit);
  }

  /** Étape de validation, inscrite dans la conversation de la composition. */
  addStep(team: string, atelier: string, email: string, kind: ReviewStep) {
    this.db.prepare('INSERT INTO messages (team, atelier, email, text, kind, at) VALUES (?, ?, ?, ?, ?, ?)').run(team, atelier, normEmail(email), '', kind, new Date().toISOString());
  }

  /** Ce que la personne a écrit depuis la dernière étape : le mot qui accompagne l'e-mail de proposition ou de réponse. */
  noteSinceStep(team: string, atelier: string, email: string) {
    const last = this.db.prepare('SELECT MAX(id) AS id FROM messages WHERE team = ? AND atelier = ? AND kind IS NOT NULL').get(team, atelier) as Row | undefined;
    const rows = this.db
      .prepare('SELECT text FROM messages WHERE team = ? AND atelier = ? AND email = ? AND kind IS NULL AND id > ? ORDER BY id')
      .all(team, atelier, normEmail(email), Number(last?.id ?? 0)) as Row[];
    const t = rows.map((r) => String(r.text)).join('\n').trim();
    return t ? t.slice(0, 500) : undefined;
  }

  /** Message d'une composition de l'équipe (pour vérifier qu'il existe et à qui il est). */
  message(team: string, atelier: string, id: number) {
    const r = this.db.prepare('SELECT email FROM messages WHERE team = ? AND atelier = ? AND id = ?').get(team, atelier, id) as Row | undefined;
    return r ? { by: String(r.email) } : null;
  }

  removeMessage(id: number) {
    this.db.prepare('DELETE FROM messages WHERE id = ?').run(id);
  }

  react(id: number, email: string, emoji: string, on: boolean) {
    if (on) this.db.prepare('INSERT OR IGNORE INTO reactions (message, email, emoji, at) VALUES (?, ?, ?, ?)').run(id, normEmail(email), emoji, new Date().toISOString());
    else this.db.prepare('DELETE FROM reactions WHERE message = ? AND email = ? AND emoji = ?').run(id, normEmail(email), emoji);
  }
}

export interface Reaction {
  emoji: string;
  by: string[];
  mine: boolean;
}
export type ReviewStep = 'proposed' | 'approved' | 'changes';
/** Une nouveauté du fil de l'activité. */
export interface ActivityEvent {
  type: 'message' | ReviewStep | 'vote' | 'campaign' | 'composition';
  atelier?: string;
  campaign?: string;
  by: string;
  name?: string;
  text?: string;
  target?: Target;
  at: string;
}
/** Message laissé sur une composition, avec le rendu (cible) qu'on regardait en l'écrivant. */
export interface Message {
  id: number;
  by: string;
  name?: string;
  picture?: string;
  text: string;
  target?: Target;
  /** une étape de validation plutôt qu'un message */
  kind?: ReviewStep;
  at: string;
  reactions: Reaction[];
}

/** Campagne : un temps de communication (souvent la promotion d'un évènement) où chacun propose des documents et vote. */
export interface Campaign {
  id: string;
  name: string;
  /** Occasion dont partent ses documents (concert…). */
  operation?: string;
  /** Date de l'évènement promu (AAAA-MM-JJ). */
  date?: string;
  place?: string;
  /** Heure d'accueil (HH:MM). */
  time?: string;
  /** Type de prestation : concert, DJ set, showcase… */
  kind?: string;
  /** Contact réservation. */
  contact?: { name?: string; phone?: string; email?: string };
  note?: string;
  /** Compositions proposées comme modèles : chacun peut partir de l'une d'elles. */
  templates?: string[];
  /** Plan de publication : ce qu'il faut sortir, quand, avec quelle composition. */
  plan?: PlanItem[];
  created: string;
  by?: string;
  closed?: string;
}
/** Une publication prévue : un rendu (média, format, variante), une date, la composition retenue. */
export interface PlanItem {
  id: string;
  channel?: string;
  format: string;
  palette?: string;
  /** « rappel », « annonce »… */
  label?: string;
  date?: string;
  composition?: string;
  /** publiée : quand, et le lien de la publication */
  published?: string;
  link?: string;
  /** confiée à Postiz : écrit par le serveur seulement */
  postiz?: PlanPostiz;
}
export type CampaignInput = Partial<Pick<Campaign, 'name' | 'operation' | 'date' | 'place' | 'time' | 'kind' | 'contact' | 'note' | 'templates' | 'plan'>>;

function cleanCampaign(c: CampaignInput) {
  const date = str(c.date, 10);
  const k = c.contact ?? {};
  const email = str(k.email, 120);
  const ct = {
    ...(str(k.name, 80) ? { name: str(k.name, 80) } : {}),
    ...(str(k.phone, 30) ? { phone: str(k.phone, 30) } : {}),
    ...(/^[^\s@]+@[^\s@]+$/.test(email) ? { email } : {}),
  };
  const contact = Object.keys(ct).length ? ct : undefined;
  const templates = [...new Set(arr<string>(c.templates).filter((t) => typeof t === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(t)))].slice(0, 20);
  const ids = new Set<string>();
  const plan = arr<PlanItem>(c.plan)
    .filter((x) => x && typeof x === 'object' && str(x.format, 40) && /^[a-z0-9][a-z0-9-]{0,39}$/.test(str(x.id, 40)) && !ids.has(x.id) && ids.add(x.id))
    .slice(0, 40)
    .map((x) => ({
      id: x.id,
      ...(str(x.channel, 40) ? { channel: str(x.channel, 40) } : {}),
      format: str(x.format, 40),
      ...(str(x.palette, 40) ? { palette: str(x.palette, 40) } : {}),
      ...(str(x.label, 60) ? { label: str(x.label, 60) } : {}),
      ...(/^\d{4}-\d{2}-\d{2}$/.test(str(x.date, 10)) ? { date: str(x.date, 10) } : {}),
      ...(/^[a-z0-9][a-z0-9-]{0,63}$/.test(str(x.composition, 64)) ? { composition: str(x.composition, 64) } : {}),
      ...(str(x.published, 30) ? { published: str(x.published, 30) } : {}),
      ...(/^https?:\/\/\S+$/.test(str(x.link, 300)) ? { link: str(x.link, 300) } : {}),
      ...(cleanPlanPostiz(x.postiz) ? { postiz: cleanPlanPostiz(x.postiz)! } : {}),
    }));
  return {
    ...(str(c.operation, 40) ? { operation: str(c.operation, 40) } : {}),
    ...(/^\d{4}-\d{2}-\d{2}$/.test(date) ? { date } : {}),
    ...(str(c.place, 120) ? { place: str(c.place, 120) } : {}),
    ...(/^([01]\d|2[0-3]):[0-5]\d$/.test(str(c.time, 5)) ? { time: str(c.time, 5) } : {}),
    ...(str(c.kind, 60) ? { kind: str(c.kind, 60) } : {}),
    ...(contact ? { contact } : {}),
    ...(str(c.note, 1000) ? { note: str(c.note, 1000) } : {}),
    ...(templates.length ? { templates } : {}),
    ...(plan.length ? { plan } : {}),
  };
}

function cleanPlanPostiz(v: unknown): PlanPostiz | undefined {
  const p = v as Partial<PlanPostiz> | undefined;
  if (!p || typeof p !== 'object' || !str(p.post, 80) || !str(p.account, 80) || !['queue', 'published', 'error'].includes(String(p.state))) return undefined;
  return { post: str(p.post, 80), account: str(p.account, 80), at: str(p.at, 30), state: p.state as PlanPostiz['state'], ...(str(p.error, 300) ? { error: str(p.error, 300) } : {}) };
}

function campaignOf(r: Row): Campaign {
  let data: CampaignInput = {};
  try {
    data = JSON.parse(String(r.data ?? '{}'));
  } catch {
    /* données abîmées : ignorées */
  }
  return {
    id: String(r.id),
    name: String(r.name),
    ...cleanCampaign(data),
    created: String(r.created),
    ...(r.by ? { by: String(r.by) } : {}),
    ...(r.closed ? { closed: String(r.closed) } : {}),
  };
}
