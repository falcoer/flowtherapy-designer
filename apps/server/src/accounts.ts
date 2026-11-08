import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

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
    /** Modules de publication (réseaux sociaux, lettre d'information…). */
    publishing?: ServiceLink[];
  };
  branding?: {
    palette?: Array<{ hex: string; name?: string }>;
    /** Raison d'être. */
    purpose?: string;
    keywords?: string[];
  };
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

/** Garde ce qui est attendu, à des tailles raisonnables. */
export function cleanProfile(p: ActivityProfile): ActivityProfile {
  const palette = (Array.isArray(p.branding?.palette) ? p.branding!.palette : [])
    .slice(0, 24)
    .filter((c) => typeof c?.hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.hex))
    .map((c) => ({ hex: c.hex.toLowerCase(), ...(str(c.name, 40) ? { name: str(c.name, 40) } : {}) }));
  const keywords = (Array.isArray(p.branding?.keywords) ? p.branding!.keywords : [])
    .map((k) => str(k, 40))
    .filter(Boolean)
    .slice(0, 30);
  return {
    ...(str(p.kind, 60) ? { kind: str(p.kind, 60) } : {}),
    services: { events: cleanLinks(p.services?.events), assets: cleanLinks(p.services?.assets), publishing: cleanLinks(p.services?.publishing) },
    branding: { palette, purpose: str(p.branding?.purpose, 2000), keywords },
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
    `);
    // colonnes ajoutées après coup : fiche d'activité, logo, photo de profil
    this.addColumn('teams', 'profile', 'TEXT');
    this.addColumn('teams', 'logo', 'TEXT');
    this.addColumn('teams', 'updated', 'TEXT');
    this.addColumn('users', 'picture', 'TEXT');
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

  /** Logo en data URL (PNG, JPEG, SVG ou WebP), ou null pour l'enlever. */
  setLogo(id: string, dataUrl: string | null) {
    if (dataUrl !== null) {
      if (!/^data:image\/(png|jpeg|svg\+xml|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) throw new Error('Logo attendu : image PNG, JPEG, SVG ou WebP');
      if (dataUrl.length > 1_500_000) throw new Error('Logo trop lourd (1 Mo au plus)');
    }
    const now = new Date().toISOString();
    if (!this.db.prepare('UPDATE teams SET logo = ?, updated = ? WHERE id = ?').run(dataUrl, now, id).changes) throw new Error('Équipe introuvable');
  }

  logo(id: string): { type: string; data: Buffer } | null {
    const r = this.db.prepare('SELECT logo FROM teams WHERE id = ?').get(id) as Row | undefined;
    const m = r?.logo ? String(r.logo).match(/^data:([^;]+);base64,(.+)$/) : null;
    return m ? { type: m[1]!, data: Buffer.from(m[2]!, 'base64') } : null;
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
}
