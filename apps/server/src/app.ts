import path from 'node:path';
import { readFile } from 'node:fs/promises';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { Accounts, isLogoKey, normEmail, ROLES, type ActivityProfile, type CampaignInput, type Target, type LogoVariant, type Role, type TeamOfUser } from './accounts.js';
import { Ateliers } from './ateliers.js';
import { cookie, readCookie, registerAuth, type AuthConfig } from './auth.js';
import { Exporter, type ExportKind } from './export.js';
import { invitationMail, proposalMail, reviewMail, type Mail, type Mailer } from './mail.js';
import { Library } from './library.js';
import { FontInstaller, installedFonts } from './fonts.js';
import { CACHE_PROFILES, type CacheProfile } from './media.js';
import { Postiz, PostizError, POSTIZ_PROVIDERS, postizOutcome, settlePending, type PostizConfig, type PostizMedia } from './postiz.js';

export interface AppOptions {
  libraryRoot: string;
  /** Index et rendus en cache (reconstructibles). Par défaut : <bibliothèque>/../cache. */
  cacheRoot?: string;
  /** Charger Agbalumo et Inter depuis Google Fonts dans les exports (vrai par défaut). */
  webFonts?: boolean;
  chromiumPath?: string;
  webDist?: string;
  /** Atelier compilé (apps/atelier/dist), servi à la racine. L'ancien éditeur passe alors sous /editeur/. */
  atelierDist?: string;
  /** Compositions de l'atelier. Par défaut : <bibliothèque>/../ateliers. */
  ateliersRoot?: string;
  /** Connexion externe (Google, Microsoft…) avec liste blanche d'adresses. */
  auth?: AuthConfig | null;
  /** Repli : mot de passe unique (HTTP Basic), ignoré si `auth` est fourni. */
  password?: string;
  /** Adresses des administrateurs (état du serveur, redémarrage). Accès partagé par mot de passe : tout le monde. */
  adminEmails?: string[];
  /** Version affichée dans les préférences (paquet et commit). */
  version?: { version: string; commit?: string };
  /** Téléchargements des polices installées (remplaçable en test). */
  fetch?: typeof fetch;
  /** Base des comptes et équipes. Par défaut : <bibliothèque>/../comptes.sqlite (à sauvegarder). */
  accountsFile?: string;
  /** Équipe d'origine : elle garde les dossiers ateliers/ et objets/ existants. */
  defaultTeam?: { id: string; name: string };
  /** Envoi d'e-mails (invitations, propositions). Sans lui, rien n'est envoyé. */
  mailer?: Mailer | null;
  /** Adresse publique pour les liens des e-mails ; par défaut celle de la connexion externe. */
  publicUrl?: string;
  /** Postiz par défaut (variables d'environnement) ; la configuration globale l'emporte. */
  postiz?: PostizConfig;
  /** Intervalle de relecture des publications chez Postiz (0 : jamais ; 10 min par défaut). */
  postizSyncMs?: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Équipe active de la requête, avec le rôle de la personne connectée. */
    team?: TeamOfUser;
  }
}

const TEAM_COOKIE = 'ftd_team';
const ROLE_RANK: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 };

export async function buildApp(opts: AppOptions) {
  const app = Fastify({ logger: process.env.NODE_ENV === 'production' });
  const lib = new Library(opts.libraryRoot, opts.cacheRoot ?? path.join(path.dirname(path.resolve(opts.libraryRoot)), 'cache'));
  await lib.reindex();
  const ateliersRoot = path.resolve(opts.ateliersRoot ?? path.join(path.dirname(path.resolve(opts.libraryRoot)), 'ateliers'));
  const dataRoot = path.dirname(ateliersRoot);
  const accounts = new Accounts(opts.accountsFile ?? path.join(dataRoot, 'comptes.sqlite'));
  const home = opts.defaultTeam ?? { id: 'flowtherapy', name: 'Flowtherapy' };
  if (!accounts.team(home.id)) accounts.createTeam(home.name, { id: home.id });
  // l'équipe d'origine garde les dossiers d'avant les équipes ; les autres ont le leur sous equipes/<id>/
  const ateliers = new Ateliers(ateliersRoot);
  const storesByTeam = new Map<string, { ateliers: Ateliers; objets: Ateliers }>([
    [home.id, { ateliers, objets: new Ateliers(path.join(dataRoot, 'objets')) }],
  ]);
  const storesOf = (team: string) => {
    let s = storesByTeam.get(team);
    if (!s) {
      const dir = path.join(dataRoot, 'equipes', team);
      s = { ateliers: new Ateliers(path.join(dir, 'ateliers')), objets: new Ateliers(path.join(dir, 'objets')) };
      storesByTeam.set(team, s);
    }
    return s;
  };
  const exporter = new Exporter(lib, { webFonts: opts.webFonts, chromiumPath: opts.chromiumPath });
  app.addHook('onClose', async () => {
    await exporter.close();
    lib.index.close();
    accounts.close();
  });
  await app.register(multipart, { limits: { fileSize: 200 * 1024 * 1024, files: 20 } });

  app.addContentTypeParser(['text/yaml', 'application/yaml', 'text/plain'], { parseAs: 'string' }, (_req, body, done) => done(null, body));

  const startedAt = new Date().toISOString();
  const admins = (opts.adminEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);
  const allowlist = new Set((opts.auth?.allowedEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean));

  if (opts.auth) {
    registerAuth(app, opts.auth, {
      admit: (email) => admins.includes(email) || accounts.isMember(email),
      signedIn: (email, name, picture) => {
        accounts.signedIn(email, name, picture);
        // amorçage : un administrateur ou une adresse de la liste sans équipe rejoint l'équipe d'origine
        if (!accounts.teamsOf(email).length && (admins.includes(email) || allowlist.has(email))) {
          accounts.addMember(home.id, email, admins.includes(email) ? 'owner' : 'editor');
        }
      },
    });
  } else if (opts.password) {
    const expected = 'Basic ' + Buffer.from(`ft:${opts.password}`).toString('base64');
    app.addHook('onRequest', async (req, reply) => {
      if (req.url === '/api/health') return;
      if (req.headers.authorization !== expected) {
        reply.header('WWW-Authenticate', 'Basic realm="FT Designer"').code(401).send('Authentification requise');
      }
    });
  }

  const isAdmin = (req: FastifyRequest) => (opts.auth ? !!req.user && admins.includes(req.user.email.toLowerCase()) : true);
  const adminOnly = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!isAdmin(req)) reply.code(403).send({ error: 'Réservé aux administrateurs' });
  };

  // équipe active : celle choisie (cookie) si on en est membre, sinon la première ; sans comptes, l'équipe d'origine
  const homeTeam = (): TeamOfUser => ({ ...accounts.team(home.id)!, role: 'owner' });
  const teamsOfReq = (req: FastifyRequest): TeamOfUser[] => {
    if (!opts.auth) return [homeTeam()];
    if (!req.user) return [];
    const mine = accounts.teamsOf(req.user.email);
    // un administrateur peut entrer dans toutes les équipes, comme responsable
    if (!isAdmin(req)) return mine;
    return [...mine, ...accounts.teams().filter((t) => !mine.some((m) => m.id === t.id)).map((t) => ({ ...t, role: 'owner' as Role }))];
  };
  const secureCookies = !!(opts.auth?.publicUrl ?? opts.publicUrl)?.startsWith('https://');
  app.addHook('preHandler', async (req, reply) => {
    // un lien d'e-mail (?equipe=…) fait entrer dans l'équipe qu'il vise
    const linked = (req.query as Record<string, string> | undefined)?.equipe;
    if (!req.url.startsWith('/api/') && !linked) return;
    const teams = teamsOfReq(req);
    const fromLink = linked ? teams.find((t) => t.id === linked) : undefined;
    if (fromLink) reply.header('Set-Cookie', cookie(TEAM_COOKIE, fromLink.id, 365 * 86_400, { secure: secureCookies }));
    const wanted = fromLink?.id ?? readCookie(req, TEAM_COOKIE);
    const mine = opts.auth && req.user ? accounts.teamsOf(req.user.email) : teams;
    req.team = teams.find((t) => t.id === wanted) ?? mine[0] ?? teams[0];
  });

  // --- e-mails : un échec d'envoi ne fait jamais échouer l'action ---
  const publicUrl = (opts.auth?.publicUrl ?? opts.publicUrl ?? 'http://localhost:4310').replace(/\/$/, '');
  const link = (team: string, composition?: string) =>
    `${publicUrl}/?equipe=${encodeURIComponent(team)}${composition ? `&composition=${encodeURIComponent(composition)}` : ''}`;
  const mail = async (req: FastifyRequest, m: Mail) => {
    if (!opts.mailer || (Array.isArray(m.to) && !m.to.length)) return false;
    try {
      await opts.mailer.send(m);
      return true;
    } catch (err) {
      req.log.warn({ err, subject: m.subject }, 'e-mail non envoyé');
      return false;
    }
  };
  /** Garde : il faut une équipe active, avec au moins ce rôle. */
  const needs = (min: Role) => async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.team) return reply.code(403).send({ error: 'Tu ne fais partie d’aucune équipe' });
    if (ROLE_RANK[req.team.role] < ROLE_RANK[min]) {
      return reply.code(403).send({ error: min === 'owner' ? 'Réservé aux responsables de l’équipe' : 'Lecture seule dans cette équipe' });
    }
  };
  /** Garde pour /api/teams/:id/… : l'équipe visée doit être une des siennes, avec ce rôle. */
  const needsIn = (min: Role) => async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const t = teamsOfReq(req).find((x) => x.id === req.params.id);
    if (!t) return reply.code(404).send({ error: 'Équipe introuvable' });
    if (ROLE_RANK[t.role] < ROLE_RANK[min]) return reply.code(403).send({ error: 'Réservé aux responsables de l’équipe' });
  };

  app.get('/api/health', async () => ({ ok: true }));
  // pour les menus : nom, rôle, type d'activité et adresse du logo (avec sa version)
  const teamRef = (t: TeamOfUser) => {
    const look = accounts.looks(t.id);
    return {
      id: t.id,
      name: t.name,
      role: t.role,
      ...(look.kind ? { kind: look.kind } : {}),
      ...(look.logo ? { logo: `/api/teams/${encodeURIComponent(t.id)}/logo?v=${encodeURIComponent(look.updated ?? '')}` } : {}),
    };
  };
  app.get('/api/me', async (req) => {
    const teams = teamsOfReq(req).map(teamRef);
    const team = req.team && teamRef(req.team);
    const mailOn = !!opts.mailer;
    if (opts.auth) {
      if (!req.user) return null;
      const picture = accounts.picture(req.user.email);
      return { ...req.user, ...(picture ? { picture } : {}), admin: isAdmin(req), mode: 'compte', team, teams, mail: mailOn };
    }
    return { name: opts.password ? 'Accès partagé' : 'Accès local', admin: true, mode: opts.password ? 'mot-de-passe' : 'local', team, teams, mail: mailOn };
  });
  // Mes réglages : chacun garde ses jeux de paramètres d'éléments (sans comptes, ceux de l'accès local)
  const presetsOwner = (req: FastifyRequest) => (opts.auth ? req.user?.email.toLowerCase() : 'local');
  app.get('/api/me/presets', async (req, reply) => {
    const who = presetsOwner(req);
    return who ? accounts.userPresets(who) : reply.code(401).send({ error: 'Connexion requise' });
  });
  app.put<{ Body: unknown }>('/api/me/presets', async (req, reply) => {
    const who = presetsOwner(req);
    return who ? { ok: true, presets: accounts.setUserPresets(who, req.body) } : reply.code(401).send({ error: 'Connexion requise' });
  });
  app.post<{ Body: { team?: string } }>('/api/me/team', async (req, reply) => {
    const t = teamsOfReq(req).find((x) => x.id === req.body?.team);
    if (!t) return reply.code(404).send({ error: 'Équipe introuvable' });
    reply.header('Set-Cookie', cookie(TEAM_COOKIE, t.id, 365 * 86_400, { secure: secureCookies }));
    return { ok: true, team: { id: t.id, name: t.name, role: t.role } };
  });

  // --- équipes : membres, invitations, rôles ---
  app.get('/api/teams', { preHandler: adminOnly }, async () => accounts.teams());
  app.post<{ Body: { name?: string } }>('/api/teams', { preHandler: adminOnly }, async (req, reply) => {
    try {
      return { ok: true, team: accounts.createTeam(req.body?.name ?? '', { owner: req.user?.email }) };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });
  app.patch<{ Params: { id: string }; Body: { name?: string } }>('/api/teams/:id', { preHandler: needsIn('owner') }, async (req, reply) => {
    try {
      accounts.renameTeam(req.params.id, req.body?.name ?? '');
      return { ok: true };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });
  // --- catalogue du site : formats et types de diffusion, réglés par les administrateurs ---
  app.get('/api/catalog', async () => accounts.catalog());
  app.put<{ Body: unknown }>('/api/catalog', { preHandler: adminOnly }, async (req) => ({ ok: true, catalog: accounts.setCatalog(req.body, req.user?.email) }));
  // --- Postiz : moteur de diffusion caché ; les activités y relient leurs comptes depuis le volet Médias ---
  const postizCfg = (): PostizConfig => {
    const saved = accounts.postizConfig();
    return { url: saved.url ?? opts.postiz?.url, key: saved.key ?? opts.postiz?.key };
  };
  const postiz = () => {
    const c = postizCfg();
    return c.url && c.key ? new Postiz({ url: c.url, key: c.key }, opts.fetch) : null;
  };
  const postizFail = (reply: FastifyReply, err: unknown) => {
    if (err instanceof PostizError) return reply.code(err.status).send({ error: err.message });
    throw err;
  };
  app.get('/api/postiz/config', { preHandler: adminOnly }, async () => {
    const c = postizCfg();
    return { url: c.url ?? '', keySet: !!c.key, providers: POSTIZ_PROVIDERS };
  });
  app.put<{ Body: { url?: string; key?: string | null } }>('/api/postiz/config', { preHandler: adminOnly }, async (req, reply) => {
    try {
      accounts.setPostizConfig(req.body ?? {}, req.user?.email);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
    const c = postizCfg();
    return { ok: true, url: c.url ?? '', keySet: !!c.key };
  });
  /** Les comptes reliés par l'activité, par type de diffusion ; rattache ceux d'une connexion qui vient d'aboutir. */
  app.get('/api/postiz/accounts', { preHandler: needs('viewer') }, async (req, reply) => {
    const pz = postiz();
    if (!pz) return { enabled: false, providers: POSTIZ_PROVIDERS, accounts: [] };
    const team = req.team!.id;
    try {
      const list = await pz.integrations();
      const cur = accounts.postizTeam(team);
      const next = settlePending(cur, list, accounts.postizTaken(team));
      // un compte détaché dans Postiz disparaît aussi de l'activité
      const known = new Set(list.map((x) => x.id));
      for (const id of Object.keys(next.accounts)) if (!known.has(id)) delete next.accounts[id];
      if (JSON.stringify(next) !== JSON.stringify(cur)) accounts.setPostizTeam(team, next);
      return {
        enabled: true,
        providers: POSTIZ_PROVIDERS,
        ...(next.pending ? { pending: next.pending.channel } : {}),
        accounts: list.filter((x) => next.accounts[x.id]).map((x) => ({ ...x, channel: next.accounts[x.id] })),
      };
    } catch (err) {
      return postizFail(reply, err);
    }
  });
  /** Lien vers l'autorisation du réseau ; au retour, le compte apparaît dans la liste de l'activité. */
  app.post<{ Body: { channel?: string } }>('/api/postiz/connect', { preHandler: needs('owner') }, async (req, reply) => {
    const pz = postiz();
    if (!pz) return reply.code(409).send({ error: 'Postiz n’est pas configuré (configuration globale)' });
    const channel = String(req.body?.channel ?? '');
    const provider = POSTIZ_PROVIDERS[channel];
    if (!provider) return reply.code(400).send({ error: 'Ce type de diffusion ne se publie pas par Postiz' });
    const team = req.team!.id;
    try {
      const before = (await pz.integrations()).map((x) => x.id);
      const url = await pz.connectLink(provider, `${publicUrl}/?equipe=${encodeURIComponent(team)}&postiz=${encodeURIComponent(channel)}`);
      accounts.setPostizTeam(team, { ...accounts.postizTeam(team), pending: { channel, provider, before, at: new Date().toISOString() } }, req.user?.email);
      return { url };
    } catch (err) {
      return postizFail(reply, err);
    }
  });
  app.delete<{ Params: { id: string } }>('/api/postiz/accounts/:id', { preHandler: needs('owner') }, async (req, reply) => {
    const pz = postiz();
    if (!pz) return reply.code(409).send({ error: 'Postiz n’est pas configuré' });
    const team = req.team!.id;
    const cur = accounts.postizTeam(team);
    if (!cur.accounts[req.params.id]) return reply.code(404).send({ error: 'Compte introuvable dans cette activité' });
    try {
      await pz.remove(req.params.id);
    } catch (err) {
      return postizFail(reply, err);
    }
    delete cur.accounts[req.params.id];
    accounts.setPostizTeam(team, cur, req.user?.email);
    return { ok: true };
  });
  /**
   * Confie à Postiz un élément du plan : les images rendues par l'atelier, le texte, le compte et la date.
   * Formulaire : campaign, item, account, when ('now' ou date ISO), caption, puis les images (image).
   */
  const publishing = new Set<string>();
  app.post('/api/postiz/publish', { preHandler: needs('owner') }, async (req, reply) => {
    const pz = postiz();
    if (!pz) return reply.code(409).send({ error: 'Postiz n’est pas configuré (configuration globale)' });
    const team = req.team!.id;
    const f: Record<string, string> = {};
    const files: { data: Buffer; name: string; type: string }[] = [];
    try {
      for await (const part of req.parts()) {
        if (part.type === 'file') {
          if (!/^image\/(png|jpeg)$/.test(part.mimetype)) return reply.code(400).send({ error: 'Images PNG ou JPEG attendues' });
          files.push({ data: await part.toBuffer(), name: part.filename || 'publication.png', type: part.mimetype });
        } else f[part.fieldname] = String(part.value ?? '');
      }
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
    const camp = accounts.campaign(team, f.campaign ?? '');
    const item = camp?.plan?.find((it) => it.id === f.item);
    if (!camp || !item) return reply.code(404).send({ error: 'Élément du plan introuvable' });
    if (item.published) return reply.code(409).send({ error: 'Déjà publiée' });
    if (item.postiz?.state === 'queue') return reply.code(409).send({ error: 'Déjà programmée : annule d’abord la programmation' });
    if (item.composition && f.composition !== item.composition) return reply.code(409).send({ error: 'Cet élément du plan est prévu pour une autre composition' });
    // deux envois simultanés du même élément : le second attend que le premier soit fini
    const lock = `${team}/${camp.id}/${item.id}`;
    if (publishing.has(lock)) return reply.code(409).send({ error: 'Programmation déjà en cours' });
    const channel = accounts.postizTeam(team).accounts[f.account ?? ''];
    if (!channel) return reply.code(404).send({ error: 'Compte introuvable dans cette activité' });
    if (item.channel && channel !== item.channel) return reply.code(400).send({ error: 'Ce compte ne publie pas sur ce réseau' });
    const when = f.when === 'now' ? 'now' : f.when ?? '';
    if (when !== 'now') {
      const t = Date.parse(when);
      if (!Number.isFinite(t)) return reply.code(400).send({ error: 'Date de publication attendue' });
      if (t < Date.now() - 60_000) return reply.code(400).send({ error: 'Cette date est déjà passée' });
    }
    const caption = (f.caption ?? '').slice(0, 5000);
    if (!files.length && !caption.trim()) return reply.code(400).send({ error: 'Rien à publier : ni image ni texte' });
    publishing.add(lock);
    try {
      const images: PostizMedia[] = [];
      for (const x of files) images.push(await pz.upload(x.data, x.name, x.type));
      const provider = POSTIZ_PROVIDERS[channel] ?? channel;
      const post = await pz.schedule({ integration: f.account!, provider, when, content: caption, images });
      const at = when === 'now' ? new Date().toISOString() : new Date(when).toISOString();
      const campaign = accounts.setPlanItem(team, camp.id, item.id, {
        postiz: { post, account: f.account!, at, state: 'queue' },
        ...(/^[a-z0-9][a-z0-9-]{0,63}$/.test(f.composition ?? '') && !item.composition ? { composition: f.composition } : {}),
      });
      return { ok: true, campaign };
    } catch (err) {
      return postizFail(reply, err);
    } finally {
      publishing.delete(lock);
    }
  });
  /** Annule une programmation pas encore parue. */
  app.delete<{ Params: { campaign: string; item: string } }>('/api/postiz/publish/:campaign/:item', { preHandler: needs('owner') }, async (req, reply) => {
    const pz = postiz();
    if (!pz) return reply.code(409).send({ error: 'Postiz n’est pas configuré' });
    const team = req.team!.id;
    const item = accounts.campaign(team, req.params.campaign)?.plan?.find((it) => it.id === req.params.item);
    if (!item?.postiz) return reply.code(404).send({ error: 'Rien de programmé ici' });
    if (item.postiz.state === 'published') return reply.code(409).send({ error: 'Déjà parue : retire-la depuis le réseau' });
    try {
      await pz.unschedule(item.postiz.post);
    } catch (err) {
      // déjà effacée chez Postiz : on oublie la programmation quand même
      if (!(err instanceof PostizError && /404/.test(err.message))) return postizFail(reply, err);
    }
    return { ok: true, campaign: accounts.setPlanItem(team, req.params.campaign, req.params.item, { postiz: null }) };
  });
  /** Relit chez Postiz l'état des publications programmées de l'activité : parues (avec leur lien) ou en échec. */
  const syncPostiz = async (pz: Postiz, team: string) => {
    const queued = accounts.campaigns(team).flatMap((c) => (c.plan ?? []).filter((it) => it.postiz?.state === 'queue').map((it) => ({ c, it })));
    if (!queued.length) return 0;
    const times = queued.map(({ it }) => Date.parse(it.postiz!.at)).filter(Number.isFinite);
    const day = 86_400_000;
    const list = await pz.posts(new Date(Math.min(...times, Date.now()) - day), new Date(Math.max(...times, Date.now()) + day));
    const byId = new Map(list.map((x) => [x.id, x]));
    let changed = 0;
    for (const { c, it } of queued) {
      const out = postizOutcome(it.postiz!, byId.get(it.postiz!.post));
      if (!out) continue;
      accounts.setPlanItem(team, c.id, it.id, out);
      changed++;
    }
    return changed;
  };
  app.post('/api/postiz/sync', { preHandler: needs('viewer') }, async (req, reply) => {
    const pz = postiz();
    if (!pz) return { ok: true, changed: 0 };
    try {
      const changed = await syncPostiz(pz, req.team!.id);
      return { ok: true, changed, campaigns: accounts.campaigns(req.team!.id) };
    } catch (err) {
      return postizFail(reply, err);
    }
  });
  // relecture de fond : les publications parues passent « publiées » même si personne n'ouvre l'atelier
  if (opts.postizSyncMs !== 0) {
    const timer = setInterval(() => {
      const pz = postiz();
      if (!pz) return;
      for (const t of accounts.teams()) void syncPostiz(pz, t.id).catch((err) => app.log.warn({ err, team: t.id }, 'postiz sync'));
    }, opts.postizSyncMs ?? 10 * 60_000);
    timer.unref();
    app.addHook('onClose', async () => clearInterval(timer));
  }
  // --- fiches des éléments : copies et fiches cachées, réglées par les administrateurs ---
  app.get('/api/elements', async () => accounts.elements());
  app.put<{ Body: unknown }>('/api/elements', { preHandler: adminOnly }, async (req) => ({ ok: true, elements: accounts.setElements(req.body, req.user?.email) }));

  // --- polices : celles livrées avec l'atelier (son index), plus celles installées par les administrateurs ---
  const fonts = new FontInstaller(lib, opts.fetch);
  const builtinFonts = async (): Promise<Set<string>> => {
    if (!opts.atelierDist) return new Set();
    try {
      const idx = JSON.parse(await readFile(path.join(opts.atelierDist, 'library', 'index.json'), 'utf8')) as { fonts?: Array<{ id: string }> };
      return new Set((idx.fonts ?? []).map((f) => f.id));
    } catch {
      return new Set();
    }
  };
  app.get('/api/fonts', async () => {
    const builtin = await builtinFonts();
    return { fonts: installedFonts(lib).filter((f) => !builtin.has(f.id)) };
  });
  app.post<{ Body: { name?: string; url?: string; dir?: string } }>('/api/fonts', { preHandler: adminOnly }, async (req, reply) => {
    try {
      return { ok: true, font: await fonts.install(req.body ?? {}, await builtinFonts()) };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });
  app.delete<{ Params: { id: string } }>('/api/fonts/:id', { preHandler: adminOnly }, async (req, reply) => {
    try {
      await fonts.remove(req.params.id);
    } catch (e) {
      return reply.code(404).send({ error: (e as Error).message });
    }
    const c = accounts.catalog();
    if (c.fonts?.[req.params.id]) {
      delete c.fonts[req.params.id];
      accounts.setCatalog(c, req.user?.email);
    }
    return { ok: true };
  });

  // --- fiche d'activité : tout membre la lit, les responsables la modifient ---
  const profileOf = (id: string) => {
    const look = accounts.looks(id);
    const v = encodeURIComponent(look.updated ?? '');
    const base = `/api/teams/${encodeURIComponent(id)}/logo`;
    // adresses des logos présents, par variante
    const logos = Object.fromEntries(
      [...(look.logo ? (['main'] as LogoVariant[]) : []), ...accounts.logoVariants(id)].map((k) => [k, `${base}${k === 'main' ? '' : `/${k}`}?v=${v}`]),
    );
    const prof = accounts.profile(id);
    // le secret d'une délégation d'accès ne repart jamais vers le navigateur
    const channels = prof.channels?.map((c) => ({ ...c, ...(c.connections ? { connections: c.connections.map(({ secret, ...x }) => (secret ? { ...x, secretSet: true } : x)) } : {}) }));
    return { ...accounts.team(id)!, ...prof, ...(channels ? { channels } : {}), logos };
  };
  app.get<{ Params: { id: string } }>('/api/teams/:id/profile', { preHandler: needsIn('viewer') }, async (req) => profileOf(req.params.id));
  app.put<{ Params: { id: string }; Body: ActivityProfile & { name?: string; logo?: string | null; logos?: Partial<Record<LogoVariant, string | null>> } }>(
    '/api/teams/:id/profile',
    { preHandler: needsIn('owner'), bodyLimit: 16 * 1024 * 1024 },
    async (req, reply) => {
      try {
        const { name, logo, logos, ...profile } = req.body ?? {};
        if (name !== undefined) accounts.renameTeam(req.params.id, name);
        if (logo !== undefined) accounts.setLogo(req.params.id, logo);
        for (const [k, url] of Object.entries(logos ?? {})) if (url !== undefined) accounts.setLogo(req.params.id, url, k as LogoVariant);
        // secret absent : on garde celui enregistré ; null : on l'efface
        // (un par branchement : type de diffusion / branchement)
        const before = new Map((accounts.profile(req.params.id).channels ?? []).flatMap((c) => (c.connections ?? []).map((x) => [`${c.id}/${x.id}`, x.secret] as const)));
        profile.channels = profile.channels?.map((c) => {
          const { secretSet: _s, secret: _x, account: _a, api: _p, folder: _f, ...rest } = c as typeof c & { secret?: string | null };
          // une ancienne fiche envoyée telle quelle : son branchement unique devient le premier
          const list = rest.connections ?? (c.account || c.api || c.folder || c.secret !== undefined ? [{ id: 'c1', account: c.account, api: c.api, folder: c.folder, secret: c.secret }] : undefined);
          if (!list) return rest;
          return {
            ...rest,
            connections: list.map((x) => {
              const { secretSet: _xs, ...y } = x as typeof x & { secret?: string | null };
              if (y.secret === null) return { ...y, secret: undefined };
              const kept = before.get(`${c.id}/${y.id}`);
              return y.secret === undefined && kept ? { ...y, secret: kept } : y;
            }),
          };
        });
        accounts.setProfile(req.params.id, profile);
        return { ok: true, profile: profileOf(req.params.id) };
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    },
  );
  app.get<{ Params: { id: string; variant?: string } }>('/api/teams/:id/logo/:variant?', { preHandler: needsIn('viewer') }, async (req, reply) => {
    const variant = (req.params.variant ?? 'main') as LogoVariant;
    if (!isLogoKey(variant)) return reply.code(404).send({ error: 'Variante inconnue' });
    const logo = accounts.logo(req.params.id, variant);
    if (!logo) return reply.code(404).send({ error: 'Pas de logo' });
    // un SVG importé ne doit pas pouvoir exécuter de script
    return reply.type(logo.type).header('Cache-Control', 'private, max-age=31536000').header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'").send(logo.data);
  });

  app.get<{ Params: { id: string } }>('/api/teams/:id/members', { preHandler: needsIn('viewer') }, async (req) => accounts.members(req.params.id));
  app.post<{ Params: { id: string }; Body: { email?: string; role?: Role } }>('/api/teams/:id/members', { preHandler: needsIn('owner') }, async (req, reply) => {
    try {
      const member = accounts.addMember(req.params.id, req.body?.email ?? '', req.body?.role ?? 'editor', req.user?.email);
      const team = accounts.team(req.params.id)!;
      const mailed = await mail(
        req,
        invitationMail({ to: member.email, team: team.name, role: member.role, inviter: req.user, url: link(team.id) }),
      );
      return { ok: true, member, mailed };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });
  app.patch<{ Params: { id: string; email: string }; Body: { role?: Role } }>('/api/teams/:id/members/:email', { preHandler: needsIn('owner') }, async (req, reply) => {
    try {
      if (!req.body?.role || !ROLES.includes(req.body.role)) throw new Error('Rôle attendu');
      accounts.setRole(req.params.id, req.params.email, req.body.role);
      return { ok: true };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });
  // un responsable retire qui il veut ; chacun peut quitter une équipe
  app.delete<{ Params: { id: string; email: string } }>('/api/teams/:id/members/:email', async (req, reply) => {
    const t = teamsOfReq(req).find((x) => x.id === req.params.id);
    if (!t) return reply.code(404).send({ error: 'Équipe introuvable' });
    const self = !!req.user && req.user.email.toLowerCase() === req.params.email.trim().toLowerCase();
    if (t.role !== 'owner' && !self) return reply.code(403).send({ error: 'Réservé aux responsables de l’équipe' });
    try {
      accounts.removeMember(req.params.id, req.params.email);
      return { ok: true };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });
  app.get('/api/system', { preHandler: adminOnly }, async () => {
    const [elements, ateliersList] = await Promise.all([lib.elements(), ateliers.list()]);
    const teams = accounts.teams();
    const mem = process.memoryUsage();
    return {
      ...(opts.version ?? { version: '?' }),
      node: process.version,
      startedAt,
      uptime: Math.round(process.uptime()),
      memory: { rss: mem.rss, heap: mem.heapUsed },
      library: elements.length,
      ateliers: ateliersList.length,
      teams: teams.length,
      auth: opts.auth ? 'compte' : opts.password ? 'mot-de-passe' : 'local',
      restartable: !!process.env.INVOCATION_ID,
    };
  });
  // le service systemd relance le serveur quand il s'arrête en erreur (Restart=on-failure)
  app.post('/api/system/restart', { preHandler: adminOnly }, async (_req, reply) => {
    if (!process.env.INVOCATION_ID) return reply.code(409).send({ error: 'Le serveur ne tourne pas sous systemd : redémarrage manuel' });
    setTimeout(() => process.exit(75), 300);
    return { ok: true };
  });
  app.get('/api/formats', async () => lib.formats());

  app.get<{ Querystring: { type?: string; tags?: string; q?: string } }>('/api/library', async (req) =>
    lib.search({
      type: req.query.type || undefined,
      tags: req.query.tags ? req.query.tags.split(',').filter(Boolean) : undefined,
      text: req.query.q,
    }),
  );

  app.get('/api/library/tags', async () => lib.index.tags());

  /** Import de fichiers (images, logos, polices), champs optionnels : title, tags, weight. */
  app.post('/api/library/upload', async (req, reply) => {
    const created = [];
    const fields: Record<string, string> = {};
    try {
      for await (const part of req.parts()) {
        if (part.type === 'field') {
          fields[part.fieldname] = String(part.value);
          continue;
        }
        const data = await part.toBuffer();
        created.push(
          ...(await lib.importFile(data, part.filename, {
            title: fields.title,
            tags: fields.tags?.split(','),
            weight: fields.weight ? Number(fields.weight) : undefined,
          })),
        );
      }
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
    if (!created.length) return reply.code(400).send({ error: 'Aucun fichier reçu' });
    return { created };
  });

  app.post<{ Body: { title?: string; colors?: Array<{ hex: string; name?: string; role?: string }>; tags?: string[] } }>('/api/library/palettes', async (req, reply) => {
    try {
      const { title, colors, tags } = req.body ?? {};
      return { created: await lib.createPalette({ title: title || 'Palette', colors: colors ?? [], tags }) };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.post('/api/library/reindex', { preHandler: adminOnly }, async () => ({ count: await lib.reindex() }));

  app.get<{ Params: { id: string; profile: string } }>('/cache/images/:id/:profile', async (req, reply) => {
    if (!(req.params.profile in CACHE_PROFILES)) return reply.code(404).send({ error: 'Profil inconnu' });
    try {
      const out = await lib.render(req.params.id, req.params.profile as CacheProfile);
      const { createReadStream } = await import('node:fs');
      return reply.type(out.type).header('Cache-Control', 'private, max-age=3600').send(createReadStream(out.file));
    } catch (err) {
      return reply.code(404).send({ error: (err as Error).message });
    }
  });

  app.get<{ Params: { id: string }; Querystring: { format?: string; type?: string; record?: string } }>('/api/projects/:id/export', async (req, reply) => {
    const kind = (req.query.type ?? 'png') as ExportKind;
    if (!['png', 'pdf', 'svg'].includes(kind)) return reply.code(400).send({ error: 'Type d’export inconnu' });
    try {
      const { project } = await lib.readProject(req.params.id);
      const formats = await lib.formats();
      const formatId = req.query.format ?? project.formats[0]!;
      const format = formats.find((f) => f.id === formatId);
      if (!format) return reply.code(400).send({ error: `Format inconnu : ${formatId}` });
      const record = Number(req.query.record ?? 0);
      const body = await exporter.render(kind, project, format, formats, record);
      const suffix = project.records?.length ? `-${record + 1}` : '';
      const type = { png: 'image/png', pdf: 'application/pdf', svg: 'image/svg+xml' }[kind];
      return reply.type(type).header('Content-Disposition', `attachment; filename="${project.id}-${format.id}${suffix}.${kind}"`).send(body);
    } catch (err) {
      req.log.error(err);
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.get('/api/projects', async () => lib.listProjects());

  app.get<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
    try {
      return await lib.readProject(req.params.id);
    } catch (err) {
      return reply.code(404).send({ error: (err as Error).message });
    }
  });

  app.put<{ Params: { id: string }; Body: string }>('/api/projects/:id', async (req, reply) => {
    try {
      const project = await lib.writeProject(req.params.id, req.body, req.user?.email);
      return { ok: true, project };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  // --- compositions de l'atelier, et objets préparés (pièces, matières, hauteurs) rangés en bibliothèque ---
  // chaque équipe a les siens ; lire demande d'en être membre, écrire de pouvoir modifier
  for (const [base, kind, missing] of [
    ['/api/ateliers', 'ateliers', 'Composition introuvable'],
    ['/api/objets', 'objets', 'Objet introuvable'],
  ] as const) {
    const storeOf = (req: FastifyRequest) => storesOf(req.team!.id)[kind];
    const read = { preHandler: needs('viewer') };
    const write = { preHandler: needs('editor') };
    app.get(base, read, async (req) => {
      const list = await storeOf(req).list();
      if (kind !== 'ateliers') return list;
      // les votes des membres, et le sien
      const votes = accounts.votes(req.team!.id);
      const counts = accounts.messageCounts(req.team!.id);
      const me = req.user?.email ? normEmail(req.user.email) : 'groupe';
      return list.map((m) => {
        const v = votes.get(m.id) ?? [];
        return { ...m, votes: v, voted: v.includes(me), messages: counts.get(m.id) ?? 0 };
      });
    });
    app.get<{ Params: { id: string } }>(`${base}/:id`, read, async (req, reply) => {
      try {
        return await storeOf(req).read(req.params.id);
      } catch {
        return reply.code(404).send({ error: missing });
      }
    });
    app.put<{ Params: { id: string }; Body: { title?: string; doc?: unknown; thumb?: string; thumbs?: unknown } }>(
      `${base}/:id`,
      // photos importées comprises, une composition peut peser lourd
      { ...write, bodyLimit: 200 * 1024 * 1024 },
      async (req, reply) => {
        try {
          return { ok: true, meta: await storeOf(req).write(req.params.id, req.body ?? {}, req.user?.email) };
        } catch (err) {
          return reply.code(400).send({ error: (err as Error).message });
        }
      },
    );
    app.delete<{ Params: { id: string } }>(`${base}/:id`, write, async (req, reply) => {
      try {
        await storeOf(req).remove(req.params.id);
        if (kind === 'ateliers') accounts.forgetVotes(req.team!.id, req.params.id);
        return { ok: true };
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    });
    app.get<{ Params: { id: string }; Querystring: { t?: string } }>(`${base}/:id/thumb.png`, read, async (req, reply) => {
      // ?t=n : la vignette de la publication n
      const t = req.query.t === undefined ? undefined : Number(req.query.t);
      const f = await storeOf(req).thumb(req.params.id, t).catch(() => null);
      if (!f) return reply.code(404).send({ error: 'Pas de vignette' });
      const { createReadStream } = await import('node:fs');
      return reply.type('image/png').header('Cache-Control', 'private, no-cache').send(createReadStream(f));
    });
  }

  // --- campagnes : chacun y contribue et vote pour les compositions ---
  app.get('/api/campaigns', { preHandler: needs('viewer') }, async (req) => accounts.campaigns(req.team!.id));
  app.post<{ Body: CampaignInput }>('/api/campaigns', { preHandler: needs('editor') }, async (req, reply) => {
    try {
      return { ok: true, campaign: accounts.createCampaign(req.team!.id, req.body ?? {}, req.user?.email) };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });
  app.patch<{ Params: { id: string }; Body: CampaignInput & { closed?: boolean } }>('/api/campaigns/:id', { preHandler: needs('editor') }, async (req, reply) => {
    try {
      return { ok: true, campaign: accounts.updateCampaign(req.team!.id, req.params.id, req.body ?? {}) };
    } catch (err) {
      const msg = (err as Error).message;
      return reply.code(/programmée/.test(msg) ? 409 : 404).send({ error: msg });
    }
  });
  // renommer une composition depuis la campagne, sans la rouvrir
  app.patch<{ Params: { id: string }; Body: { title?: string } }>('/api/ateliers/:id', { preHandler: needs('editor') }, async (req, reply) => {
    const title = req.body?.title?.trim();
    if (!title) return reply.code(400).send({ error: 'Titre attendu' });
    try {
      return { ok: true, meta: await storesOf(req.team!.id).ateliers.retitle(req.params.id, title) };
    } catch {
      return reply.code(404).send({ error: 'Composition introuvable' });
    }
  });
  // copier une composition (modèle de campagne, ou import depuis une autre campagne)
  app.post<{ Params: { id: string }; Body: { to?: string; title?: string; campaign?: string } }>('/api/ateliers/:id/copy', { preHandler: needs('editor') }, async (req, reply) => {
    const store = storesOf(req.team!.id).ateliers;
    const to = req.body?.to ?? '';
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(to)) return reply.code(400).send({ error: 'Identifiant de destination attendu' });
    try {
      await store.read(to);
      return reply.code(409).send({ error: 'Cette composition existe déjà' });
    } catch {
      /* libre */
    }
    try {
      const meta = await store.copy(req.params.id, to, { title: req.body?.title?.trim().slice(0, 120) || undefined, campaign: req.body?.campaign || undefined }, req.user?.email);
      return { ok: true, meta };
    } catch (err) {
      return reply.code(404).send({ error: (err as Error).message.includes('ENOENT') ? 'Composition introuvable' : (err as Error).message });
    }
  });
  // tout membre vote, lecteurs compris ; un vote par personne et par composition
  app.post<{ Params: { id: string }; Body: { on?: boolean } }>('/api/ateliers/:id/vote', { preHandler: needs('viewer') }, async (req, reply) => {
    const team = req.team!;
    try {
      await storesOf(team.id).ateliers.read(req.params.id);
    } catch {
      return reply.code(404).send({ error: 'Composition introuvable' });
    }
    const me = req.user?.email ? normEmail(req.user.email) : 'groupe';
    const votes = accounts.vote(team.id, req.params.id, me, req.body?.on !== false);
    return { ok: true, votes, voted: votes.includes(me) };
  });

  // --- fil de l'activité : messages, étapes, votes, campagnes et compositions créées, avec le titre des compositions ---
  // ?campaign=<id> : seulement ce qui touche la campagne (?campaign= : les compositions hors campagne), trié avant la coupe
  app.get<{ Querystring: { campaign?: string } }>('/api/activity', { preHandler: needs('viewer') }, async (req) => {
    const team = req.team!.id;
    const list = await storesOf(team).ateliers.list();
    const titles = new Map(list.map((m) => [m.id, m]));
    const made = list.filter((m) => m.created).map((m) => ({ type: 'composition' as const, atelier: m.id, by: m.author ?? m.by ?? '', at: m.created! }));
    const scope = req.query.campaign;
    const keep =
      scope === undefined
        ? () => true
        : (e: { atelier?: string; campaign?: string }) => (e.atelier ? (titles.get(e.atelier)?.campaign ?? '') === scope : !!scope && e.campaign === scope);
    return [...accounts.activity(team, scope === undefined ? 80 : 2000), ...made]
      .filter(keep)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 80)
      .map((e) => (e.atelier ? { ...e, title: titles.get(e.atelier)?.title ?? 'composition supprimée', ...(titles.get(e.atelier)?.campaign ? { inCampaign: titles.get(e.atelier)!.campaign } : {}) } : e))
      .filter((e) => !('atelier' in e) || titles.has(e.atelier!));
  });

  // --- messages sur une composition : tout membre écrit et met des smileys ---
  const atelierExists = async (team: string, id: string) =>
    storesOf(team)
      .ateliers.read(id)
      .then(() => true)
      .catch(() => false);
  const meOf = (req: FastifyRequest) => (req.user?.email ? normEmail(req.user.email) : 'groupe');
  app.get<{ Params: { id: string } }>('/api/ateliers/:id/messages', { preHandler: needs('viewer') }, async (req, reply) => {
    if (!(await atelierExists(req.team!.id, req.params.id))) return reply.code(404).send({ error: 'Composition introuvable' });
    return accounts.messages(req.team!.id, req.params.id, meOf(req));
  });
  app.post<{ Params: { id: string }; Body: { text?: string; target?: Target } }>('/api/ateliers/:id/messages', { preHandler: needs('viewer') }, async (req, reply) => {
    if (!(await atelierExists(req.team!.id, req.params.id))) return reply.code(404).send({ error: 'Composition introuvable' });
    try {
      accounts.addMessage(req.team!.id, req.params.id, meOf(req), String(req.body?.text ?? ''), req.body?.target);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
    return { ok: true, messages: accounts.messages(req.team!.id, req.params.id, meOf(req)) };
  });
  // son propre message, ou n'importe lequel pour un responsable
  app.delete<{ Params: { id: string; mid: string } }>('/api/ateliers/:id/messages/:mid', { preHandler: needs('viewer') }, async (req, reply) => {
    const m = accounts.message(req.team!.id, req.params.id, Number(req.params.mid));
    if (!m) return reply.code(404).send({ error: 'Message introuvable' });
    if (m.by !== meOf(req) && req.team!.role !== 'owner') return reply.code(403).send({ error: 'Seul l’auteur peut retirer ce message' });
    accounts.removeMessage(Number(req.params.mid));
    return { ok: true, messages: accounts.messages(req.team!.id, req.params.id, meOf(req)) };
  });
  app.post<{ Params: { id: string; mid: string }; Body: { emoji?: string; on?: boolean } }>('/api/ateliers/:id/messages/:mid/react', { preHandler: needs('viewer') }, async (req, reply) => {
    const id = Number(req.params.mid);
    if (!accounts.message(req.team!.id, req.params.id, id)) return reply.code(404).send({ error: 'Message introuvable' });
    const emoji = String(req.body?.emoji ?? '');
    // un smiley : quelques caractères, pas de texte
    if (!emoji || emoji.length > 16 || /[\p{L}\p{N}\s<>]/u.test(emoji)) return reply.code(400).send({ error: 'Smiley attendu' });
    accounts.react(id, meOf(req), emoji, req.body?.on !== false);
    return { ok: true, messages: accounts.messages(req.team!.id, req.params.id, meOf(req)) };
  });

  // --- circuit de validation : un membre propose, un responsable valide ou demande une retouche ---
  app.post<{ Params: { id: string }; Body: { note?: string } }>('/api/ateliers/:id/propose', { preHandler: needs('editor') }, async (req, reply) => {
    const team = req.team!;
    const store = storesOf(team.id).ateliers;
    try {
      const current = await store.read(req.params.id);
      const by = req.user?.email ?? 'groupe';
      // le mot d'accompagnement : celui donné, sinon ce que la personne vient d'écrire dans la conversation
      const note = req.body?.note?.trim().slice(0, 500) || accounts.noteSinceStep(team.id, req.params.id, by);
      accounts.addStep(team.id, req.params.id, by, 'proposed');
      const meta = await store.setReview(req.params.id, { status: 'proposed', proposedBy: by, proposedAt: new Date().toISOString(), ...(note ? { note } : {}) });
      const owners = opts.auth ? accounts.members(team.id).filter((m) => m.role === 'owner' && m.email !== by).map((m) => m.email) : [];
      const mailed = await mail(
        req,
        proposalMail({ to: owners, team: team.name, title: current.title, by: { email: by, name: req.user?.name }, note, url: link(team.id, req.params.id) }),
      );
      return { ok: true, meta, mailed, notified: mailed ? owners.length : 0 };
    } catch (err) {
      return reply.code(404).send({ error: (err as Error).message.includes('ENOENT') ? 'Composition introuvable' : (err as Error).message });
    }
  });
  app.post<{ Params: { id: string }; Body: { approved?: boolean; note?: string } }>('/api/ateliers/:id/review', { preHandler: needs('owner') }, async (req, reply) => {
    const team = req.team!;
    const store = storesOf(team.id).ateliers;
    try {
      const current = await store.read(req.params.id);
      if (!current.review) return reply.code(409).send({ error: 'Cette composition n’a pas été proposée' });
      const by = req.user?.email ?? 'groupe';
      const approved = req.body?.approved === true;
      const note = req.body?.note?.trim().slice(0, 500) || accounts.noteSinceStep(team.id, req.params.id, by);
      accounts.addStep(team.id, req.params.id, by, approved ? 'approved' : 'changes');
      const meta = await store.setReview(req.params.id, {
        ...current.review,
        status: approved ? 'approved' : 'changes',
        reviewedBy: by,
        reviewedAt: new Date().toISOString(),
        ...(note ? { reviewNote: note } : { reviewNote: undefined }),
      });
      const proposer = current.review.proposedBy;
      const mailed =
        opts.auth && proposer !== by && proposer.includes('@')
          ? await mail(req, reviewMail({ to: proposer, team: team.name, title: current.title, by: { email: by, name: req.user?.name }, approved, note, url: link(team.id, req.params.id) }))
          : false;
      return { ok: true, meta, mailed };
    } catch (err) {
      return reply.code(404).send({ error: (err as Error).message.includes('ENOENT') ? 'Composition introuvable' : (err as Error).message });
    }
  });

  // fichiers sources de la bibliothèque (images, polices...)
  await app.register(fastifyStatic, { root: path.resolve(opts.libraryRoot), prefix: '/files/', decorateReply: false });

  if (opts.atelierDist) {
    // l'atelier à la racine, l'ancien éditeur à côté
    await app.register(fastifyStatic, { root: path.resolve(opts.atelierDist), prefix: '/', decorateReply: false });
    if (opts.webDist) await app.register(fastifyStatic, { root: path.resolve(opts.webDist), prefix: '/editeur/', decorateReply: false });
    app.setNotFoundHandler((req, reply) => reply.code(404).send({ error: 'Introuvable' }));
  } else if (opts.webDist) {
    await app.register(fastifyStatic, { root: path.resolve(opts.webDist), prefix: '/', wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Introuvable' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
