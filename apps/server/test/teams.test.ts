import { cp, mkdtemp, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { googleProvider, type AuthConfig } from '../src/auth.js';
import type { Mail } from '../src/mail.js';

const repoLibrary = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/library');
const jwt = (claims: object) => `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`;
const doc = { formatId: 'carre', layers: [] };

/** Serveur avec connexion Google simulée : `login(email)` renvoie le cookie de session. */
async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ftd-teams-'));
  const lib = path.join(root, 'library');
  await cp(repoLibrary, lib, { recursive: true });
  let claims: object = {};
  const fakeFetch = (async () => new Response(JSON.stringify({ id_token: jwt(claims) }), { status: 200 })) as unknown as typeof fetch;
  const auth: AuthConfig = {
    providers: [googleProvider('id', 'secret')],
    publicUrl: 'https://designer.example.org',
    allowedEmails: ['betty@example.org'],
    sessionSecret: 'x'.repeat(40),
    fetch: fakeFetch,
  };
  const sent: Mail[] = [];
  const app = await buildApp({
    mailer: { send: async (m) => void sent.push(m) },
    libraryRoot: lib,
    cacheRoot: path.join(root, 'cache'),
    ateliersRoot: path.join(root, 'ateliers'),
    auth,
    adminEmails: ['lauris@example.org'],
    webFonts: false,
  });
  const login = async (email: string) => {
    claims = { email, email_verified: true, name: email.split('@')[0] };
    const start = await app.inject('/auth/login/google');
    const state = new URL(start.headers.location as string).searchParams.get('state');
    const pending = String(start.headers['set-cookie']).split(';')[0];
    const cb = await app.inject({ url: `/auth/callback/google?code=c&state=${state}`, headers: { cookie: pending } });
    return cb.statusCode === 303 ? String(([] as string[]).concat(cb.headers['set-cookie'] as string[])[0]).split(';')[0]! : null;
  };
  const as = (cookie: string) => ({
    get: (url: string) => app.inject({ url, headers: { cookie } }),
    send: (method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
      app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) }),
  });
  return { app, root, login, as, sent };
}

describe('équipes', () => {
  it('l’administrateur entre dans l’équipe d’origine, invite, et l’invité rejoint à sa connexion', async () => {
    const { login, as } = await setup();
    expect(await login('inconnu@example.org')).toBeNull();

    const lauris = as((await login('lauris@example.org'))!);
    const me = (await lauris.get('/api/me')).json();
    expect(me.team).toEqual({ id: 'flowtherapy', name: 'Flowtherapy', role: 'owner' });

    const inv = await lauris.send('POST', '/api/teams/flowtherapy/members', { email: 'Jenni@Example.org', role: 'viewer' });
    expect(inv.json().member).toMatchObject({ email: 'jenni@example.org', role: 'viewer', invitedBy: 'lauris@example.org' });
    expect(inv.json().member.joined).toBeUndefined();

    const jenni = as((await login('jenni@example.org'))!);
    const members = (await jenni.get('/api/teams/flowtherapy/members')).json();
    expect(members.find((m: { email: string }) => m.email === 'jenni@example.org').joined).toBeTruthy();

    // lecture seule : lire oui, écrire non, gérer non
    expect((await jenni.get('/api/ateliers')).statusCode).toBe(200);
    expect((await jenni.send('PUT', '/api/ateliers/essai', { title: 'Essai', doc })).statusCode).toBe(403);
    expect((await jenni.send('POST', '/api/teams/flowtherapy/members', { email: 'x@example.org' })).statusCode).toBe(403);

    // promue, elle peut enregistrer
    expect((await lauris.send('PATCH', '/api/teams/flowtherapy/members/jenni@example.org', { role: 'editor' })).statusCode).toBe(200);
    expect((await jenni.send('PUT', '/api/ateliers/essai', { title: 'Essai', doc })).statusCode).toBe(200);
    expect((await lauris.get('/api/ateliers')).json()).toHaveLength(1);

    // retirée, elle ne voit plus rien
    expect((await lauris.send('DELETE', '/api/teams/flowtherapy/members/jenni@example.org')).statusCode).toBe(200);
    expect((await jenni.get('/api/ateliers')).statusCode).toBe(403);
  });

  it('chaque équipe a ses compositions, et on change d’équipe active', async () => {
    const { login, as, root } = await setup();
    const lauris = as((await login('lauris@example.org'))!);
    const created = (await lauris.send('POST', '/api/teams', { name: 'Café Concert' })).json();
    expect(created.team.id).toBe('cafe-concert');
    await lauris.send('POST', '/api/teams/cafe-concert/members', { email: 'gerant@example.org', role: 'owner' });

    const gerant = as((await login('gerant@example.org'))!);
    expect((await gerant.get('/api/me')).json().teams).toEqual([{ id: 'cafe-concert', name: 'Café Concert', role: 'owner' }]);
    await gerant.send('PUT', '/api/ateliers/affiche', { title: 'Affiche', doc });
    expect(await readdir(path.join(root, 'equipes/cafe-concert/ateliers'))).toContain('affiche.json');
    // l'équipe d'origine ne la voit pas, et le gérant n'a pas accès à l'équipe d'origine
    expect((await lauris.get('/api/ateliers')).json()).toEqual([]);
    expect((await gerant.get('/api/teams/flowtherapy/members')).statusCode).toBe(404);
    expect((await gerant.send('POST', '/api/me/team', { team: 'flowtherapy' })).statusCode).toBe(404);

    // l'administrateur passe dans l'autre équipe
    const sw = await lauris.send('POST', '/api/me/team', { team: 'cafe-concert' });
    const teamCookie = String(sw.headers['set-cookie']).split(';')[0];
    expect(teamCookie).toBe('ftd_team=cafe-concert');
    const laurisCookie = (await login('lauris@example.org'))!;
    const list = await as(`${laurisCookie}; ${teamCookie}`).get('/api/ateliers');
    expect(list.json().map((m: { id: string }) => m.id)).toEqual(['affiche']);
  });

  it('garde au moins un responsable', async () => {
    const { login, as } = await setup();
    const lauris = as((await login('lauris@example.org'))!);
    const r = await lauris.send('PATCH', '/api/teams/flowtherapy/members/lauris@example.org', { role: 'editor' });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/responsable/);
  });

  it('une adresse de la liste d’amorçage rejoint l’équipe d’origine comme membre', async () => {
    const { login, as } = await setup();
    const betty = as((await login('betty@example.org'))!);
    expect((await betty.get('/api/me')).json().team).toMatchObject({ id: 'flowtherapy', role: 'editor' });
  });

  it('envoie l’invitation par e-mail, et le circuit proposer / valider prévient les bonnes personnes', async () => {
    const { login, as, sent } = await setup();
    const lauris = as((await login('lauris@example.org'))!);
    expect((await lauris.get('/api/me')).json().mail).toBe(true);
    const inv = (await lauris.send('POST', '/api/teams/flowtherapy/members', { email: 'jenni@example.org', role: 'editor' })).json();
    expect(inv.mailed).toBe(true);
    expect(sent[0]).toMatchObject({ to: 'jenni@example.org', replyTo: 'lauris@example.org' });
    expect(sent[0]!.subject).toContain('Flowtherapy');
    expect(sent[0]!.text).toContain('https://designer.example.org/?equipe=flowtherapy');

    const jenni = as((await login('jenni@example.org'))!);
    await jenni.send('PUT', '/api/ateliers/concert', { title: 'Concert du 12', doc });
    const prop = (await jenni.send('POST', '/api/ateliers/concert/propose', { note: 'Version avec le lama' })).json();
    expect(prop).toMatchObject({ mailed: true, notified: 1, meta: { review: { status: 'proposed', proposedBy: 'jenni@example.org', note: 'Version avec le lama' } } });
    expect(sent[1]).toMatchObject({ to: ['lauris@example.org'], subject: 'Nouveau support proposé : Concert du 12 · Flowtherapy' });
    expect(sent[1]!.text).toContain('composition=concert');

    // l'état suit les enregistrements suivants
    await jenni.send('PUT', '/api/ateliers/concert', { title: 'Concert du 12', doc });
    expect((await jenni.get('/api/ateliers')).json()[0].review.status).toBe('proposed');
    // seule une responsable valide
    expect((await jenni.send('POST', '/api/ateliers/concert/review', { approved: true })).statusCode).toBe(403);
    const rev = (await lauris.send('POST', '/api/ateliers/concert/review', { approved: false, note: 'Logo plus grand' })).json();
    expect(rev.meta.review).toMatchObject({ status: 'changes', reviewedBy: 'lauris@example.org', reviewNote: 'Logo plus grand' });
    expect(sent[2]).toMatchObject({ to: 'jenni@example.org', subject: 'À revoir : Concert du 12 · Flowtherapy' });
  });

  it('un lien d’e-mail fait entrer dans l’équipe visée', async () => {
    const { login, as } = await setup();
    const cookie = (await login('lauris@example.org'))!;
    await as(cookie).send('POST', '/api/teams', { name: 'Café Concert' });
    const r = await as(cookie).get('/api/me?equipe=cafe-concert');
    expect(String(r.headers['set-cookie'])).toContain('ftd_team=cafe-concert');
    expect(r.json().team.id).toBe('cafe-concert');
  });
});
