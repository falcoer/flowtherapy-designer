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

  it('la fiche d’activité : les responsables la remplissent, les membres la lisent', async () => {
    const { login, as } = await setup();
    const lauris = as((await login('lauris@example.org'))!);
    await lauris.send('POST', '/api/teams/flowtherapy/members', { email: 'jenni@example.org', role: 'editor' });
    const png = 'data:image/png;base64,' + Buffer.from('logo').toString('base64');
    const put = await lauris.send('PUT', '/api/teams/flowtherapy/profile', {
      name: 'Flow Therapy',
      logo: png,
      kind: 'Groupe musical',
      services: { events: [{ name: 'Bandsintown', url: 'https://bandsintown.com/a/1' }, { name: '' }] },
      branding: {
        palette: [{ hex: '#E9A7C3', name: 'Rose', role: 'accent' }, { hex: 'rouge' }],
        fonts: { title: 'bungee', body: 'inter' },
        purpose: 'Faire danser',
        keywords: ['psyché', ' ', 'groove'],
        mentions: [{ name: 'Réseaux', text: '@flowtherapy' }, { name: 'vide', text: '' }],
      },
      logos: { dark: png },
      channels: [
        { id: 'insta', name: 'Post Instagram', kind: 'social', formats: ['carre'], margin: 0.04, logo: 'icon', mentions: ['Réseaux'] },
        { id: 'insta', name: 'Story', kind: 'social', formats: ['story'], margin: 0.9 },
        { name: '' },
      ],
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().profile).toMatchObject({
      name: 'Flow Therapy',
      kind: 'Groupe musical',
      services: { events: [{ name: 'Bandsintown', url: 'https://bandsintown.com/a/1' }], assets: [] },
      branding: {
        palettes: [{ id: 'principale', name: 'Principale', colors: [{ hex: '#e9a7c3', name: 'Rose', role: 'accent' }] }],
        fonts: { title: 'bungee', body: 'inter' },
        purpose: 'Faire danser',
        keywords: ['psyché', 'groove'],
        mentions: [{ name: 'Réseaux', text: '@flowtherapy' }],
      },
      channels: [
        { id: 'insta', name: 'Post Instagram', kind: 'social', formats: ['carre'], margin: 0.04, logo: 'icon', mentions: ['Réseaux'] },
        { id: 'insta-2', name: 'Story', kind: 'social', formats: ['story'], margin: 0.25, mentions: [] },
      ],
    });
    expect(Object.keys(put.json().profile.logos)).toEqual(['main', 'dark']);
    expect((await lauris.get(put.json().profile.logos.dark)).body).toBe('logo');

    const jenni = as((await login('jenni@example.org'))!);
    const me = (await jenni.get('/api/me')).json();
    expect(me.team).toMatchObject({ name: 'Flow Therapy', kind: 'Groupe musical' });
    expect(me.team.logo).toMatch(/^\/api\/teams\/flowtherapy\/logo\?v=/);
    const logo = await jenni.get(me.team.logo);
    expect(logo.headers['content-type']).toBe('image/png');
    expect(logo.body).toBe('logo');
    expect((await jenni.get('/api/teams/flowtherapy/profile')).json().branding.purpose).toBe('Faire danser');
    expect((await jenni.send('PUT', '/api/teams/flowtherapy/profile', { kind: 'Autre' })).statusCode).toBe(403);
    expect((await lauris.send('PUT', '/api/teams/flowtherapy/profile', { logo: 'data:text/html;base64,PGI+' })).statusCode).toBe(400);

    // plusieurs palettes, chaque canal peut choisir la sienne
    const multi = await lauris.send('PUT', '/api/teams/flowtherapy/profile', {
      branding: {
        palettes: [
          { id: 'jour', name: 'Jour', colors: [{ hex: '#ffffff', role: 'fond' }] },
          { id: 'jour', name: 'Nuit', colors: [{ hex: '#000000', role: 'fond' }] },
          { name: 'Vide', colors: [] },
        ],
      },
      channels: [
        { id: 'affiche', name: 'Affiche', kind: 'affichage', formats: ['a4'], palette: 'jour-2' },
        { id: 'post', name: 'Post', kind: 'social', formats: ['carre'], palette: 'inconnue' },
      ],
    });
    const prof = multi.json().profile;
    expect(prof.branding.palettes.map((q: { id: string; name: string }) => [q.id, q.name])).toEqual([
      ['jour', 'Jour'],
      ['jour-2', 'Nuit'],
    ]);
    expect(prof.channels[0].palette).toBe('jour-2');
    expect(prof.channels[1].palette).toBeUndefined();
    expect(prof.operations).toBeUndefined();

    // pastilles prévues : couleurs unies ou dégradés (arrêts, transition, style)
    const grads = await lauris.send('PUT', '/api/teams/flowtherapy/profile', {
      branding: {
        palettes: [
          {
            id: 'site-clair',
            name: 'Site clair',
            colors: [
              { hex: '#168AD5', role: 'principale', stops: ['#168AD5', '#7130c8', '#ffc425', 'jaune'], blend: 'smooth', shape: { mode: 'conic', repeat: 40, mirror: true, x: 1 } },
              { hex: '#ffffff', role: 'bordure', stops: ['#ffffff'] },
              { hex: '#f9b353', role: 'sujet1', stops: ['#f9b353', '#c73047'], blend: 'flou' },
              { hex: '#000000', role: 'inconnu' },
            ],
          },
        ],
      },
    });
    expect(grads.json().profile.branding.palettes[0].colors).toEqual([
      { hex: '#168ad5', role: 'principale', stops: ['#168ad5', '#7130c8', '#ffc425'], blend: 'smooth', shape: { mode: 'conic', repeat: 12, mirror: true } },
      { hex: '#ffffff', role: 'bordure' },
      { hex: '#f9b353', role: 'sujet1', stops: ['#f9b353', '#c73047'] },
      { hex: '#000000' },
    ]);

    // occasions : cibles présélectionnées (média, format, variante)
    const ops = await lauris.send('PUT', '/api/teams/flowtherapy/profile', {
      operations: [
        { id: 'concert', name: 'Concert', targets: [{ channel: 'affiche', format: 'a4' }, { channel: 'post', format: 'carre', palette: 'jour' }, { format: '' }] },
        { name: '' },
      ],
    });
    expect(ops.json().profile.operations).toEqual([
      { id: 'concert', name: 'Concert', targets: [{ channel: 'affiche', format: 'a4' }, { channel: 'post', format: 'carre', palette: 'jour' }] },
    ]);
  });

  it('les campagnes : chacun y contribue, tout membre vote', async () => {
    const { login, as } = await setup();
    const lauris = as((await login('lauris@example.org'))!);
    await lauris.send('POST', '/api/teams/flowtherapy/members', { email: 'jenni@example.org', role: 'editor' });
    await lauris.send('POST', '/api/teams/flowtherapy/members', { email: 'max@example.org', role: 'viewer' });
    const jenni = as((await login('jenni@example.org'))!);
    const max = as((await login('max@example.org'))!);

    const c = (await jenni.send('POST', '/api/campaigns', { name: 'Concert du Plan', operation: 'concert', date: '2026-12-12', place: 'Le Plan', note: 'affiches en ville' })).json().campaign;
    expect(c).toMatchObject({ id: 'concert-du-plan', name: 'Concert du Plan', operation: 'concert', date: '2026-12-12', by: 'jenni@example.org' });
    expect((await jenni.send('POST', '/api/campaigns', { name: 'Concert du Plan', date: 'demain' })).json().campaign).toMatchObject({ id: 'concert-du-plan-2' });
    expect((await jenni.send('POST', '/api/campaigns', { name: ' ' })).statusCode).toBe(400);
    expect((await max.send('POST', '/api/campaigns', { name: 'Non' })).statusCode).toBe(403);

    expect((await jenni.send('PUT', '/api/ateliers/affiche-jenni', { title: 'Affiche de Jenni', doc: { ...doc, campaign: 'concert-du-plan' } })).statusCode).toBe(200);
    await lauris.send('PUT', '/api/ateliers/affiche-lauris', { title: 'Affiche de Lauris', doc: { ...doc, campaign: 'concert-du-plan' } });

    // lecteurs compris, un vote par personne
    expect((await max.send('POST', '/api/ateliers/affiche-jenni/vote', {})).json()).toMatchObject({ votes: ['max@example.org'], voted: true });
    await max.send('POST', '/api/ateliers/affiche-jenni/vote', {});
    await lauris.send('POST', '/api/ateliers/affiche-jenni/vote', { on: true });
    expect((await max.send('POST', '/api/ateliers/inconnue/vote', {})).statusCode).toBe(404);
    const list = (await max.get('/api/ateliers')).json() as Array<{ id: string; campaign?: string; votes: string[]; voted: boolean }>;
    expect(list.find((m) => m.id === 'affiche-jenni')).toMatchObject({ campaign: 'concert-du-plan', votes: ['max@example.org', 'lauris@example.org'], voted: true });
    expect(list.find((m) => m.id === 'affiche-lauris')).toMatchObject({ votes: [], voted: false });
    expect((await max.send('POST', '/api/ateliers/affiche-jenni/vote', { on: false })).json().votes).toEqual(['lauris@example.org']);

    const more = (
      await jenni.send('PATCH', '/api/campaigns/concert-du-plan', { time: '19:30', kind: 'Concert', contact: { name: 'Sam', phone: '06 12 34 56 78', email: 'pas une adresse' } })
    ).json().campaign;
    expect(more).toMatchObject({ time: '19:30', kind: 'Concert', contact: { name: 'Sam', phone: '06 12 34 56 78' }, place: 'Le Plan' });
    expect(more.contact.email).toBeUndefined();
    expect((await jenni.send('PATCH', '/api/campaigns/concert-du-plan', { time: '25:00' })).json().campaign.time).toBeUndefined();
    const closed = (await lauris.send('PATCH', '/api/campaigns/concert-du-plan', { closed: true })).json().campaign;
    expect(closed.closed).toBeTruthy();
    expect(closed.place).toBe('Le Plan');
    const all = (await max.get('/api/campaigns')).json() as Array<{ id: string }>;
    expect(all.map((x) => x.id)).toEqual(['concert-du-plan-2', 'concert-du-plan']);

    // plan de publication : rendus, dates, composition retenue, publication
    const plan = (
      await jenni.send('PATCH', '/api/campaigns/concert-du-plan', {
        plan: [
          { id: 'affiche', channel: 'affiche', format: 'a4', date: '2026-11-21', composition: 'affiche-jenni' },
          { id: 'rappel', channel: 'facebook', format: 'carre', label: 'rappel', date: 'bientôt', link: 'javascript:alert(1)' },
          { id: 'affiche', format: 'a4' },
          { id: 'sans-format' },
          { id: 'story', channel: 'instagram', format: 'story', published: '2026-12-11T18:00:00Z', link: 'https://instagram.com/p/x' },
        ],
      })
    ).json().campaign.plan;
    expect(plan).toEqual([
      { id: 'affiche', channel: 'affiche', format: 'a4', date: '2026-11-21', composition: 'affiche-jenni' },
      { id: 'rappel', channel: 'facebook', format: 'carre', label: 'rappel' },
      { id: 'story', channel: 'instagram', format: 'story', published: '2026-12-11T18:00:00Z', link: 'https://instagram.com/p/x' },
    ]);

    // modèles de la campagne, et copie d'une composition dans une autre campagne
    const tpl = (await jenni.send('PATCH', '/api/campaigns/concert-du-plan', { templates: ['affiche-lauris', 'affiche-lauris', 'Pas Valide'] })).json().campaign;
    expect(tpl.templates).toEqual(['affiche-lauris']);
    const copy = await jenni.send('POST', '/api/ateliers/affiche-lauris/copy', { to: 'affiche-jenni-2', title: 'Ma version', campaign: 'concert-du-plan-2' });
    expect(copy.json().meta).toMatchObject({ id: 'affiche-jenni-2', title: 'Ma version', campaign: 'concert-du-plan-2', by: 'jenni@example.org' });
    expect((await jenni.get('/api/ateliers/affiche-jenni-2')).json().doc.layers).toEqual([]);
    expect((await jenni.send('POST', '/api/ateliers/affiche-lauris/copy', { to: 'affiche-jenni-2' })).statusCode).toBe(409);
    expect((await max.send('POST', '/api/ateliers/affiche-lauris/copy', { to: 'x' })).statusCode).toBe(403);

    await lauris.send('DELETE', '/api/ateliers/affiche-jenni');
    await lauris.send('PUT', '/api/ateliers/affiche-jenni', { title: 'Nouvelle', doc });
    expect(((await max.get('/api/ateliers')).json() as Array<{ id: string; votes: string[] }>).find((m) => m.id === 'affiche-jenni')?.votes).toEqual([]);
  });

  it('les messages d’une composition : tout membre écrit, met des smileys, retire le sien', async () => {
    const { login, as } = await setup();
    const lauris = as((await login('lauris@example.org'))!);
    await lauris.send('POST', '/api/teams/flowtherapy/members', { email: 'max@example.org', role: 'viewer' });
    const max = as((await login('max@example.org'))!);
    await lauris.send('PUT', '/api/ateliers/affiche', { title: 'Affiche', doc });

    const first = await max.send('POST', '/api/ateliers/affiche/messages', { text: '  Le titre est trop petit en story  ', target: { channel: 'instagram', format: 'story' } });
    expect(first.statusCode).toBe(200);
    expect(first.json().messages).toMatchObject([{ by: 'max@example.org', text: 'Le titre est trop petit en story', target: { channel: 'instagram', format: 'story' }, reactions: [] }]);
    expect((await max.send('POST', '/api/ateliers/affiche/messages', { text: ' ' })).statusCode).toBe(400);
    expect((await max.send('POST', '/api/ateliers/inconnue/messages', { text: 'x' })).statusCode).toBe(404);
    await lauris.send('POST', '/api/ateliers/affiche/messages', { text: 'Je le grossis' });
    const [a, b] = (await max.get('/api/ateliers/affiche/messages')).json() as Array<{ id: number }>;

    // smileys sur ses messages et ceux des autres
    await lauris.send('POST', `/api/ateliers/affiche/messages/${a!.id}/react`, { emoji: '👍' });
    const r = (await max.send('POST', `/api/ateliers/affiche/messages/${a!.id}/react`, { emoji: '👍' })).json().messages[0].reactions;
    expect(r).toEqual([{ emoji: '👍', by: ['lauris@example.org', 'max@example.org'], mine: true }]);
    expect((await max.send('POST', `/api/ateliers/affiche/messages/${a!.id}/react`, { emoji: 'bonjour' })).statusCode).toBe(400);
    expect((await max.send('POST', `/api/ateliers/affiche/messages/${a!.id}/react`, { emoji: '👍', on: false })).json().messages[0].reactions[0].by).toEqual(['lauris@example.org']);

    // proposer et valider s'inscrivent dans la conversation, sans compter comme messages
    await lauris.send('POST', '/api/ateliers/affiche/propose', {});
    await lauris.send('POST', '/api/ateliers/affiche/review', { approved: true });
    const steps = ((await max.get('/api/ateliers/affiche/messages')).json() as Array<{ kind?: string; by: string }>).filter((m) => m.kind);
    expect(steps).toMatchObject([{ kind: 'proposed', by: 'lauris@example.org' }, { kind: 'approved', by: 'lauris@example.org' }]);
    expect(((await max.get('/api/ateliers')).json() as Array<{ id: string; messages: number }>).find((m) => m.id === 'affiche')?.messages).toBe(2);
    // le fil de l'activité : du plus récent au plus ancien, avec le titre
    const feed = (await max.get('/api/activity')).json() as Array<{ type: string; title?: string; by: string }>;
    expect(feed.map((e) => e.type)).toEqual(['approved', 'proposed', 'message', 'message', 'composition']);
    expect(feed[0]).toMatchObject({ title: 'Affiche', by: 'lauris@example.org' });
    // l'historique d'une campagne : seulement ses compositions, filtré avant la coupe
    await lauris.send('PUT', '/api/ateliers/story', { title: 'Story', doc: { ...doc, campaign: 'concert' } });
    const scoped = async (c: string) => ((await max.get(`/api/activity?campaign=${c}`)).json() as Array<{ type: string; title?: string }>).map((e) => `${e.type}:${e.title}`);
    expect(await scoped('concert')).toEqual(['composition:Story']);
    expect(await scoped('')).toEqual(['approved:Affiche', 'proposed:Affiche', 'message:Affiche', 'message:Affiche', 'composition:Affiche']);
    await lauris.send('DELETE', '/api/ateliers/story');

    // l'auteur retire le sien ; un responsable peut tout retirer
    expect((await max.send('DELETE', `/api/ateliers/affiche/messages/${b!.id}`)).statusCode).toBe(403);
    expect((await lauris.send('DELETE', `/api/ateliers/affiche/messages/${a!.id}`)).json().messages).toHaveLength(3);
    await lauris.send('DELETE', '/api/ateliers/affiche');
    await lauris.send('PUT', '/api/ateliers/affiche', { title: 'Affiche', doc });
    expect((await max.get('/api/ateliers/affiche/messages')).json()).toEqual([]);
  });

  it('le catalogue du site : les administrateurs le règlent, les formats d’origine restent', async () => {
    const { login, as } = await setup();
    const lauris = as((await login('lauris@example.org'))!);
    await lauris.send('POST', '/api/teams/flowtherapy/members', { email: 'jenni@example.org', role: 'owner' });
    const jenni = as((await login('jenni@example.org'))!);
    const first = (await jenni.get('/api/catalog')).json();
    expect(first.media.find((m: { id: string }) => m.id === 'affiche').name).toBe('Supports imprimés');
    expect((await jenni.send('PUT', '/api/catalog', first)).statusCode).toBe(403);
    const put = await lauris.send('PUT', '/api/catalog', {
      formats: [{ id: 'flyer-a5', title: 'Flyer A5', width: 148, height: 210, unit: 'mm' }],
      media: [{ id: 'flyer', name: 'Flyers', kind: 'affichage', formats: ['flyer-a5', 'inconnu'], fields: { folder: true } }],
      known: first.known,
    });
    const cat = put.json().catalog;
    expect(cat.formats.map((f: { id: string }) => f.id)).toEqual(expect.arrayContaining(['flyer-a5', 'a4', 'carre']));
    expect(cat.formats.find((f: { id: string }) => f.id === 'flyer-a5')).toMatchObject({ dpi: 300, target: 'print' });
    expect(cat.media).toEqual([{ id: 'flyer', name: 'Flyers', kind: 'affichage', formats: ['flyer-a5'], fields: { folder: true } }]);
    expect((await jenni.get('/api/catalog')).json().media[0].id).toBe('flyer');
  });

  it('le secret d’une délégation d’accès est gardé sans jamais être relu, branchement par branchement', async () => {
    const { login, as } = await setup();
    const lauris = as((await login('lauris@example.org'))!);
    const url = '/api/teams/flowtherapy/profile';
    // une ancienne fiche : son branchement unique devient le premier
    await lauris.send('PUT', url, { channels: [{ id: 'facebook', account: '@flow', api: 'https://graph.facebook.com', secret: 's3cret' }] });
    let got = (await lauris.get(url)).json();
    expect(got.channels).toEqual([{ id: 'facebook', mentions: [], connections: [{ id: 'c1', account: '@flow', api: 'https://graph.facebook.com', secretSet: true }] }]);
    expect(JSON.stringify(got)).not.toContain('s3cret');
    // deux comptes Facebook : le premier garde son secret sans le renvoyer, le second a le sien
    const [c1] = got.channels[0].connections;
    await lauris.send('PUT', url, { channels: [{ id: 'facebook', connections: [{ ...c1, account: '@flowtherapy' }, { id: 'c2', label: 'Page Betty', account: '@betty', secret: 'autre' }] }] });
    got = (await lauris.get(url)).json();
    expect(got.channels[0].connections).toEqual([
      { id: 'c1', account: '@flowtherapy', api: 'https://graph.facebook.com', secretSet: true },
      { id: 'c2', label: 'Page Betty', account: '@betty', secretSet: true },
    ]);
    expect(JSON.stringify(got)).not.toContain('autre');
    // null : il part
    await lauris.send('PUT', url, { channels: [{ id: 'facebook', connections: [{ id: 'c1', secret: null }, { id: 'c2' }] }] });
    got = (await lauris.get(url)).json();
    expect(got.channels[0].connections.map((x: { secretSet?: boolean }) => !!x.secretSet)).toEqual([false, true]);
  });

});
