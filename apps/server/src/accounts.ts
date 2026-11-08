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
  signedIn(email: string, name?: string) {
    const e = normEmail(email);
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO users (email, name, created, last_seen) VALUES (?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET name = COALESCE(excluded.name, users.name), last_seen = excluded.last_seen`,
      )
      .run(e, name ?? null, now, now);
    this.db.prepare('UPDATE members SET joined = ? WHERE email = ? AND joined IS NULL').run(now, e);
  }
}
