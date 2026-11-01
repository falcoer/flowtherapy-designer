import { createHash, createHmac, createPrivateKey, randomBytes, sign as cryptoSign, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/**
 * Connexion par fournisseurs externes : Google (OpenID Connect) et
 * Sign in with Apple. Seules les adresses de la liste blanche entrent.
 * La session est un cookie signé, sans base de données.
 */

export interface Profile {
  email?: string;
  emailVerified?: boolean;
  name?: string;
}

export interface Provider {
  id: 'google' | 'apple';
  label: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  clientId: string;
  /** Apple renvoie la réponse en POST (form_post) quand on demande l'e-mail. */
  formPost: boolean;
  scope: string;
  pkce: boolean;
  clientSecret: () => string;
  profile: (tokens: TokenResponse, callbackBody: Record<string, string>, doFetch: typeof fetch) => Promise<Profile>;
}

export interface AuthConfig {
  providers: Provider[];
  /** URL publique de l'app, ex. https://designer.flowtherapymusic.com */
  publicUrl: string;
  allowedEmails: string[];
  sessionSecret: string;
  /** Remplaçable dans les tests. */
  fetch?: typeof fetch;
}

interface TokenResponse {
  access_token?: string;
  id_token?: string;
}

export interface SessionUser {
  email: string;
  name?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: SessionUser;
  }
}

const SESSION = 'ftd_session';
const PENDING = 'ftd_oidc';
const SESSION_DAYS = 30;

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');

export function sign(payload: object, secret: string): string {
  const body = b64url(JSON.stringify(payload));
  const mac = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verify<T>(token: string | undefined, secret: string): T | null {
  if (!token) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = createHmac('sha256', secret).update(body).digest();
  const given = Buffer.from(mac, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString()) as T & { exp?: number };
    if (data.exp && data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Contenu d'un id_token. Il arrive directement du fournisseur par le canal
 * TLS de l'échange de code (client confidentiel) : la spécification OpenID
 * Connect admet alors de ne pas revérifier sa signature.
 */
export function decodeJwtPayload<T>(jwt: string): T {
  const part = jwt.split('.')[1];
  if (!part) throw new Error('id_token invalide');
  return JSON.parse(Buffer.from(part, 'base64url').toString()) as T;
}

function readCookie(req: FastifyRequest, name: string): string | undefined {
  const header = req.headers.cookie ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

function cookie(name: string, value: string, maxAgeSec: number, opts: { secure: boolean; crossSitePost?: boolean }): string {
  // le retour d'Apple est un POST venant d'un autre site : SameSite=None est nécessaire
  const sameSite = opts.crossSitePost && opts.secure ? 'SameSite=None' : 'SameSite=Lax';
  return [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', sameSite, `Max-Age=${maxAgeSec}`, opts.secure ? 'Secure' : '']
    .filter(Boolean)
    .join('; ');
}

/* ---------- Fournisseurs ---------- */

export function googleProvider(clientId: string, clientSecret: string): Provider {
  return {
    id: 'google',
    label: 'Continuer avec Google',
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    clientId,
    formPost: false,
    scope: 'openid email profile',
    pkce: true,
    clientSecret: () => clientSecret,
    profile: async (tokens) => {
      const claims = decodeJwtPayload<{ email?: string; email_verified?: boolean; name?: string }>(tokens.id_token ?? '');
      return { email: claims.email, emailVerified: claims.email_verified === true, name: claims.name };
    },
  };
}

/** Le secret Apple est un JWT ES256 signé avec la clé .p8 du compte développeur. */
export function appleClientSecret(o: { teamId: string; keyId: string; clientId: string; privateKeyPem: string }, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: o.keyId }));
  const payload = b64url(
    JSON.stringify({ iss: o.teamId, iat, exp: iat + 3600, aud: 'https://appleid.apple.com', sub: o.clientId }),
  );
  const sig = cryptoSign('sha256', Buffer.from(`${header}.${payload}`), {
    key: createPrivateKey(o.privateKeyPem),
    dsaEncoding: 'ieee-p1363',
  });
  return `${header}.${payload}.${b64url(sig)}`;
}

export function appleProvider(o: { clientId: string; teamId: string; keyId: string; privateKeyPem: string }): Provider {
  return {
    id: 'apple',
    label: 'Continuer avec Apple',
    authorizationEndpoint: 'https://appleid.apple.com/auth/authorize',
    tokenEndpoint: 'https://appleid.apple.com/auth/token',
    clientId: o.clientId,
    formPost: true,
    scope: 'name email',
    pkce: false,
    clientSecret: () => appleClientSecret(o),
    profile: async (tokens, body) => {
      const claims = decodeJwtPayload<{ email?: string; email_verified?: boolean | string }>(tokens.id_token ?? '');
      // Apple n'envoie le nom qu'à la toute première connexion, dans le champ "user"
      let name: string | undefined;
      try {
        const u = body.user ? (JSON.parse(body.user) as { name?: { firstName?: string; lastName?: string } }) : undefined;
        name = [u?.name?.firstName, u?.name?.lastName].filter(Boolean).join(' ') || undefined;
      } catch {
        name = undefined;
      }
      return { email: claims.email, emailVerified: claims.email_verified === true || claims.email_verified === 'true', name };
    },
  };
}

/* ---------- Routes ---------- */

export function registerAuth(app: FastifyInstance, cfg: AuthConfig) {
  const doFetch = cfg.fetch ?? fetch;
  const secure = cfg.publicUrl.startsWith('https://');
  const allowed = new Set(cfg.allowedEmails.map((e) => e.trim().toLowerCase()).filter(Boolean));
  const byId = new Map(cfg.providers.map((p) => [p.id, p]));
  const redirectUri = (p: Provider) => new URL(`/auth/callback/${p.id}`, cfg.publicUrl).toString();

  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) =>
    done(null, Object.fromEntries(new URLSearchParams(body as string))),
  );

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = verify<SessionUser>(readCookie(req, SESSION), cfg.sessionSecret);
    if (user) req.user = { email: user.email, name: user.name };
    const path = req.url.split('?')[0]!;
    if (req.user || path.startsWith('/auth/') || path === '/api/health') return;
    if (path.startsWith('/api/') || path.startsWith('/files/')) {
      return reply.code(401).send({ error: 'Connexion requise', login: '/auth/login' });
    }
    return reply.redirect('/auth/login');
  });

  app.get('/auth/login', async (_req, reply) => {
    const buttons = cfg.providers
      .map((p) => `<a href="/auth/login/${p.id}" style="${BUTTON}">${p.label}</a>`)
      .join('');
    return reply.type('text/html').send(page(`<h1 style="font-size:22px;margin:0 0 20px">FT Designer</h1>${buttons}`));
  });

  app.get<{ Params: { provider: string } }>('/auth/login/:provider', async (req, reply) => {
    const p = byId.get(req.params.provider as Provider['id']);
    if (!p) return reply.code(404).send('Fournisseur inconnu');
    const state = b64url(randomBytes(16));
    const verifier = b64url(randomBytes(32));
    const params: Record<string, string> = {
      response_type: 'code',
      client_id: p.clientId,
      redirect_uri: redirectUri(p),
      scope: p.scope,
      state,
    };
    if (p.formPost) params.response_mode = 'form_post';
    if (p.pkce) {
      params.code_challenge = createHash('sha256').update(verifier).digest('base64url');
      params.code_challenge_method = 'S256';
    }
    if (p.id === 'google') params.prompt = 'select_account';
    const url = new URL(p.authorizationEndpoint);
    url.search = new URLSearchParams(params).toString();
    const pending = sign({ state, verifier, provider: p.id, exp: Date.now() + 10 * 60_000 }, cfg.sessionSecret);
    reply.header('Set-Cookie', cookie(PENDING, pending, 600, { secure, crossSitePost: p.formPost }));
    return reply.redirect(url.toString());
  });

  const callback = async (req: FastifyRequest<{ Params: { provider: string } }>, reply: FastifyReply) => {
    const p = byId.get(req.params.provider as Provider['id']);
    if (!p) return reply.code(404).send('Fournisseur inconnu');
    const input = { ...(req.query as Record<string, string>), ...((req.body as Record<string, string>) ?? {}) };
    const pending = verify<{ state: string; verifier: string; provider: string }>(readCookie(req, PENDING), cfg.sessionSecret);
    if (input.error) return reply.code(401).type('text/html').send(page(`Connexion annulée (${escapeHtml(input.error)}). <a href="/auth/login">Réessayer</a>`));
    if (!pending || pending.provider !== p.id || !input.code || input.state !== pending.state) {
      return reply.code(400).type('text/html').send(page('Lien de connexion expiré. <a href="/auth/login">Recommencer</a>'));
    }
    const form: Record<string, string> = {
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: redirectUri(p),
      client_id: p.clientId,
      client_secret: p.clientSecret(),
    };
    if (p.pkce) form.code_verifier = pending.verifier;
    const tokenRes = await doFetch(p.tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form),
    });
    if (!tokenRes.ok) {
      req.log.warn({ status: tokenRes.status, provider: p.id }, 'échange de code refusé');
      return reply.code(502).type('text/html').send(page('Le fournisseur a refusé la connexion.'));
    }
    const profile = await p.profile((await tokenRes.json()) as TokenResponse, input, doFetch);
    const email = profile.email?.toLowerCase();
    if (!email || !profile.emailVerified || !allowed.has(email)) {
      req.log.warn({ email, provider: p.id }, 'connexion refusée (adresse non autorisée)');
      return reply
        .code(403)
        .type('text/html')
        .send(page(`L'adresse ${escapeHtml(email ?? 'inconnue')} n'est pas autorisée. Demande à Lauris de l'ajouter.`));
    }
    const session = sign({ email, name: profile.name, exp: Date.now() + SESSION_DAYS * 86_400_000 }, cfg.sessionSecret);
    reply.header('Set-Cookie', [
      cookie(SESSION, session, SESSION_DAYS * 86_400, { secure }),
      cookie(PENDING, '', 0, { secure, crossSitePost: p.formPost }),
    ]);
    // après un POST d'Apple, 303 force le navigateur à recharger l'app en GET
    return reply.code(303).redirect('/');
  };
  app.get('/auth/callback/:provider', callback);
  app.post('/auth/callback/:provider', callback);

  app.get('/auth/logout', async (_req, reply) => {
    reply.header('Set-Cookie', cookie(SESSION, '', 0, { secure }));
    return reply.type('text/html').send(page('Tu es déconnecté. <a href="/auth/login">Se reconnecter</a>'));
  });
}

const BUTTON =
  'display:block;margin:10px 0;padding:14px 22px;border-radius:12px;background:#1d1b22;color:#fff;text-decoration:none;font-weight:600;min-width:240px';

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function page(content: string) {
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FT Designer</title><body style="font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#ecebe7;color:#1d1b22"><div style="max-width:28rem;text-align:center">${content}</div></body></html>`;
}

/** Lit la configuration depuis l'environnement ; null si aucun fournisseur n'est configuré. */
export function authFromEnv(env = process.env): AuthConfig | null {
  const providers: Provider[] = [];
  if (env.FTD_GOOGLE_CLIENT_ID) {
    if (!env.FTD_GOOGLE_CLIENT_SECRET) throw new Error('FTD_GOOGLE_CLIENT_SECRET manquant');
    providers.push(googleProvider(env.FTD_GOOGLE_CLIENT_ID, env.FTD_GOOGLE_CLIENT_SECRET));
  }
  if (env.FTD_APPLE_CLIENT_ID) {
    const pem = env.FTD_APPLE_PRIVATE_KEY ?? (env.FTD_APPLE_PRIVATE_KEY_FILE ? readFileSync(env.FTD_APPLE_PRIVATE_KEY_FILE, 'utf8') : '');
    if (!env.FTD_APPLE_TEAM_ID || !env.FTD_APPLE_KEY_ID || !pem) {
      throw new Error('Apple : FTD_APPLE_TEAM_ID, FTD_APPLE_KEY_ID et FTD_APPLE_PRIVATE_KEY_FILE sont requis');
    }
    providers.push(appleProvider({ clientId: env.FTD_APPLE_CLIENT_ID, teamId: env.FTD_APPLE_TEAM_ID, keyId: env.FTD_APPLE_KEY_ID, privateKeyPem: pem }));
  }
  if (providers.length === 0) return null;
  const { FTD_PUBLIC_URL, FTD_ALLOWED_EMAILS, FTD_SESSION_SECRET } = env;
  if (!FTD_PUBLIC_URL || !FTD_SESSION_SECRET || !FTD_ALLOWED_EMAILS) {
    throw new Error('Connexion externe : FTD_PUBLIC_URL, FTD_SESSION_SECRET et FTD_ALLOWED_EMAILS sont requis.');
  }
  if (FTD_SESSION_SECRET.length < 32) throw new Error('FTD_SESSION_SECRET doit faire au moins 32 caractères.');
  return { providers, publicUrl: FTD_PUBLIC_URL, allowedEmails: FTD_ALLOWED_EMAILS.split(','), sessionSecret: FTD_SESSION_SECRET };
}
