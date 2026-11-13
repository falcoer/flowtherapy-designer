import { cp, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { settlePending, type PostizIntegration } from '../src/postiz.js';

const repoLibrary = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/library');

/** Un Postiz simulé : ses comptes, et les requêtes reçues. */
function fakePostiz() {
  const integrations: PostizIntegration[] = [];
  const calls: { method: string; url: string; auth: string | null; body?: unknown }[] = [];
  const fetchFn = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, auth: new Headers(init?.headers).get('authorization'), body });
    if (new Headers(init?.headers).get('authorization') !== 'cle-secrete') return new Response('{"msg":"Unauthorized"}', { status: 401 });
    if (url.endsWith('/api/public/v1/integrations') && method === 'GET') return Response.json(integrations);
    if (url.endsWith('/api/public/v1/integrations/connect')) return Response.json({ url: 'https://postiz.example.org/integrations/connect/abc' });
    const del = url.match(/\/integrations\/([^/]+)$/);
    if (del && method === 'DELETE') {
      integrations.splice(integrations.findIndex((x) => x.id === del[1]), 1);
      return Response.json({ ok: true });
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
  return { integrations, calls, fetchFn };
}

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ftd-postiz-'));
  const lib = path.join(root, 'library');
  await cp(repoLibrary, lib, { recursive: true });
  const pz = fakePostiz();
  const app = await buildApp({ libraryRoot: lib, cacheRoot: path.join(root, 'cache'), ateliersRoot: path.join(root, 'ateliers'), webFonts: false, fetch: pz.fetchFn, publicUrl: 'https://designer.example.org' });
  return { app, pz };
}

describe('Postiz', () => {
  it('sans configuration, la fiche ne propose pas de relier de compte', async () => {
    const { app } = await setup();
    expect((await app.inject('/api/postiz/accounts')).json()).toMatchObject({ enabled: false, accounts: [] });
    expect((await app.inject({ method: 'POST', url: '/api/postiz/connect', payload: { channel: 'facebook' } })).statusCode).toBe(409);
  });

  it('la clé est gardée sur le serveur et jamais renvoyée', async () => {
    const { app } = await setup();
    const put = await app.inject({ method: 'PUT', url: '/api/postiz/config', payload: { url: 'https://postiz.example.org/', key: 'cle-secrete' } });
    expect(put.json()).toEqual({ ok: true, url: 'https://postiz.example.org', keySet: true });
    const get = await app.inject('/api/postiz/config');
    expect(get.body).not.toContain('cle-secrete');
    // changer l'adresse garde la clé ; null l'efface
    await app.inject({ method: 'PUT', url: '/api/postiz/config', payload: { url: 'https://postiz.example.org' } });
    expect((await app.inject('/api/postiz/config')).json().keySet).toBe(true);
    await app.inject({ method: 'PUT', url: '/api/postiz/config', payload: { key: null } });
    expect((await app.inject('/api/postiz/config')).json().keySet).toBe(false);
    expect((await app.inject({ method: 'PUT', url: '/api/postiz/config', payload: { url: 'postiz.example.org' } })).statusCode).toBe(400);
  });

  it('relier un compte : lien de connexion, puis le nouveau compte revient à l’activité', async () => {
    const { app, pz } = await setup();
    await app.inject({ method: 'PUT', url: '/api/postiz/config', payload: { url: 'https://postiz.example.org', key: 'cle-secrete' } });
    // un compte déjà là avant la demande n'est pas à cette activité
    pz.integrations.push({ id: 'ancien', name: 'Autre page', identifier: 'facebook' });

    const link = await app.inject({ method: 'POST', url: '/api/postiz/connect', payload: { channel: 'facebook' } });
    expect(link.json()).toEqual({ url: 'https://postiz.example.org/integrations/connect/abc' });
    const sent = pz.calls.find((c) => c.url.endsWith('/integrations/connect'))!;
    expect(sent.auth).toBe('cle-secrete');
    expect(sent.body).toEqual({ integration: 'facebook', redirectUrl: 'https://designer.example.org/?equipe=flowtherapy&postiz=facebook' });
    expect((await app.inject('/api/postiz/accounts')).json()).toMatchObject({ enabled: true, pending: 'facebook', accounts: [] });

    // l'autorisation aboutit chez Postiz
    pz.integrations.push({ id: 'page-ft', name: 'Flow Therapy', identifier: 'facebook', picture: 'https://cdn/p.png' });
    const after = (await app.inject('/api/postiz/accounts')).json();
    expect(after.pending).toBeUndefined();
    expect(after.accounts).toEqual([{ id: 'page-ft', name: 'Flow Therapy', identifier: 'facebook', picture: 'https://cdn/p.png', channel: 'facebook' }]);

    // retirer le compte le détache aussi de Postiz
    expect((await app.inject({ method: 'DELETE', url: '/api/postiz/accounts/ancien' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: '/api/postiz/accounts/page-ft' })).json()).toEqual({ ok: true });
    expect(pz.integrations.map((x) => x.id)).toEqual(['ancien']);
    expect((await app.inject('/api/postiz/accounts')).json().accounts).toEqual([]);
  });

  it('un type sans fournisseur Postiz est refusé, une clé refusée est expliquée', async () => {
    const { app } = await setup();
    await app.inject({ method: 'PUT', url: '/api/postiz/config', payload: { url: 'https://postiz.example.org', key: 'mauvaise' } });
    expect((await app.inject({ method: 'POST', url: '/api/postiz/connect', payload: { channel: 'affiche' } })).statusCode).toBe(400);
    const r = await app.inject('/api/postiz/accounts');
    expect(r.statusCode).toBe(502);
    expect(r.json().error).toMatch(/Clé Postiz refusée/);
  });

  it('settlePending ne prend ni les comptes d’une autre activité ni ceux d’un autre réseau', () => {
    const at = new Date().toISOString();
    const state = { accounts: {}, pending: { channel: 'instagram', provider: 'instagram', before: ['a'], at } };
    const list = [
      { id: 'a', name: 'A', identifier: 'instagram' },
      { id: 'b', name: 'B', identifier: 'instagram' },
      { id: 'c', name: 'C', identifier: 'facebook' },
      { id: 'd', name: 'D', identifier: 'instagram' },
    ];
    expect(settlePending(state, list, new Set(['d']))).toEqual({ accounts: { b: 'instagram' } });
    // rien de neuf : on attend encore, sauf après une heure
    expect(settlePending(state, list.slice(0, 1), new Set())).toBe(state);
    expect(settlePending({ ...state, pending: { ...state.pending, at: '2020-01-01T00:00:00Z' } }, [], new Set())).toEqual({ accounts: {} });
  });
});
