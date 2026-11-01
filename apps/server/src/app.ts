import path from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { Library } from './library.js';

export interface AppOptions {
  libraryRoot: string;
  webDist?: string;
  /** Mot de passe unique (HTTP Basic) ; aucun contrôle si absent. */
  password?: string;
}

export async function buildApp(opts: AppOptions) {
  const app = Fastify({ logger: process.env.NODE_ENV === 'production' });
  const lib = new Library(opts.libraryRoot);

  app.addContentTypeParser(['text/yaml', 'application/yaml', 'text/plain'], { parseAs: 'string' }, (_req, body, done) =>
    done(null, body),
  );

  if (opts.password) {
    const expected = 'Basic ' + Buffer.from(`ft:${opts.password}`).toString('base64');
    app.addHook('onRequest', async (req, reply) => {
      if (req.url === '/api/health') return;
      if (req.headers.authorization !== expected) {
        reply.header('WWW-Authenticate', 'Basic realm="FT Designer"').code(401).send('Authentification requise');
      }
    });
  }

  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/formats', async () => lib.formats());

  app.get<{ Querystring: { type?: string; tags?: string; q?: string } }>('/api/library', async (req) =>
    lib.search({
      type: req.query.type || undefined,
      tags: req.query.tags ? req.query.tags.split(',').filter(Boolean) : undefined,
      text: req.query.q,
    }),
  );

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
      const project = await lib.writeProject(req.params.id, req.body);
      return { ok: true, project };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  // fichiers sources de la bibliothèque (images, polices...)
  await app.register(fastifyStatic, { root: path.resolve(opts.libraryRoot), prefix: '/files/', decorateReply: false });

  if (opts.webDist) {
    await app.register(fastifyStatic, { root: path.resolve(opts.webDist), prefix: '/', wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Introuvable' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
