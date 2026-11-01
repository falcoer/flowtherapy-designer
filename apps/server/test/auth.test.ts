import { generateKeyPairSync, verify as cryptoVerify } from 'node:crypto';
import { cp, mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { appleClientSecret, appleProvider, googleProvider, type AuthConfig } from '../src/auth.js';

const repoLibrary = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../library');
const jwt = (claims: object) => `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`;
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

async function setup(claims: object) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ftd-auth-'));
  await cp(repoLibrary, root, { recursive: true });
  const calls: Array<{ url: string; body: URLSearchParams }> = [];
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: new URLSearchParams(String(init?.body ?? '')) });
    return new Response(JSON.stringify({ access_token: 'at', id_token: jwt(claims) }), { status: 200 });
  }) as typeof fetch;
  const auth: AuthConfig = {
    providers: [
      googleProvider('google-id', 'google-secret'),
      appleProvider({ clientId: 'com.flowtherapy.designer', teamId: 'TEAM', keyId: 'KEY', privateKeyPem: pem }),
    ],
    publicUrl: 'https://designer.example.org',
    allowedEmails: ['Lauris@Example.org', 'betty@example.org'],
    sessionSecret: 'x'.repeat(40),
    fetch: fakeFetch,
  };
  return { app: await buildApp({ libraryRoot: root, auth }), calls, root };
}

const cookiesOf = (res: { headers: Record<string, unknown> }) =>
  ([] as string[])
    .concat((res.headers['set-cookie'] as string | string[]) ?? [])
    .map((c) => c.split(';')[0])
    .filter((c) => !c.endsWith('='))
    .join('; ');

describe('connexion externe', () => {
  it('bloque l’API et renvoie la page de connexion sans session', async () => {
    const { app } = await setup({});
    expect((await app.inject('/api/formats')).statusCode).toBe(401);
    expect((await app.inject('/')).headers.location).toBe('/auth/login');
    const login = await app.inject('/auth/login');
    expect(login.body).toContain('Continuer avec Google');
    expect(login.body).toContain('Continuer avec Apple');
  });

  it('connecte un membre autorisé via Google (PKCE) et note l’auteur des modifications', async () => {
    const { app, calls, root } = await setup({ email: 'lauris@example.org', email_verified: true, name: 'Lauris' });
    const start = await app.inject('/auth/login/google');
    const loc = new URL(start.headers.location as string);
    expect(loc.origin).toBe('https://accounts.google.com');
    expect(loc.searchParams.get('code_challenge_method')).toBe('S256');
    const state = loc.searchParams.get('state')!;
    const cb = await app.inject({ url: `/auth/callback/google?code=abc&state=${state}`, headers: { cookie: cookiesOf(start) } });
    expect(cb.statusCode).toBe(303);
    expect(calls[0]!.body.get('code_verifier')).toBeTruthy();
    const session = cookiesOf(cb);
    const me = (await app.inject({ url: '/api/me', headers: { cookie: session } })).json();
    expect(me.email).toBe('lauris@example.org');

    const { yaml } = (await app.inject({ url: '/api/projects/concert-exemple', headers: { cookie: session } })).json();
    const put = await app.inject({ method: 'PUT', url: '/api/projects/concert-exemple', headers: { cookie: session, 'content-type': 'text/yaml' }, payload: yaml });
    expect(put.statusCode).toBe(200);
    const saved = await readFile(path.join(root, 'projects/concert-exemple.yaml'), 'utf8');
    expect(saved).toContain('updatedBy: lauris@example.org');
    expect(saved).toContain("# Projet d'exemple"); // commentaires conservés
  });

  it('refuse une adresse hors liste ou non vérifiée', async () => {
    for (const claims of [{ email: 'intrus@example.org', email_verified: true }, { email: 'betty@example.org', email_verified: false }]) {
      const { app } = await setup(claims);
      const start = await app.inject('/auth/login/google');
      const state = new URL(start.headers.location as string).searchParams.get('state');
      const cb = await app.inject({ url: `/auth/callback/google?code=abc&state=${state}`, headers: { cookie: cookiesOf(start) } });
      expect(cb.statusCode).toBe(403);
    }
  });

  it('refuse un state qui ne correspond pas', async () => {
    const { app } = await setup({ email: 'lauris@example.org', email_verified: true });
    const start = await app.inject('/auth/login/google');
    const cb = await app.inject({ url: '/auth/callback/google?code=abc&state=autre', headers: { cookie: cookiesOf(start) } });
    expect(cb.statusCode).toBe(400);
  });

  it('accepte le retour en POST d’Apple, avec le nom transmis à la première connexion', async () => {
    const { app, calls } = await setup({ email: 'betty@example.org', email_verified: 'true' });
    const start = await app.inject('/auth/login/apple');
    expect(String(start.headers['set-cookie'])).toContain('SameSite=None');
    const loc = new URL(start.headers.location as string);
    expect(loc.searchParams.get('response_mode')).toBe('form_post');
    const state = loc.searchParams.get('state')!;
    const cb = await app.inject({
      method: 'POST',
      url: '/auth/callback/apple',
      headers: { cookie: cookiesOf(start), 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ code: 'abc', state, user: JSON.stringify({ name: { firstName: 'Betty' } }) }).toString(),
    });
    expect(cb.statusCode).toBe(303);
    expect(calls[0]!.url).toBe('https://appleid.apple.com/auth/token');
    const me = (await app.inject({ url: '/api/me', headers: { cookie: cookiesOf(cb) } })).json();
    expect(me).toEqual({ email: 'betty@example.org', name: 'Betty' });
  });

  it('signe le secret client Apple en ES256', () => {
    const secret = appleClientSecret({ teamId: 'TEAM', keyId: 'KEY', clientId: 'com.x', privateKeyPem: pem });
    const [h, p, s] = secret.split('.');
    expect(JSON.parse(Buffer.from(h!, 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'KEY' });
    expect(JSON.parse(Buffer.from(p!, 'base64url').toString()).sub).toBe('com.x');
    const ok = cryptoVerify('sha256', Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s!, 'base64url'));
    expect(ok).toBe(true);
  });
});
