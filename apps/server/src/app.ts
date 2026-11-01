import path from 'node:path';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { registerAuth, type AuthConfig } from './auth.js';
import { Exporter, type ExportKind } from './export.js';
import { Library } from './library.js';
import { CACHE_PROFILES, type CacheProfile } from './media.js';

export interface AppOptions {
  libraryRoot: string;
  /** Index et rendus en cache (reconstructibles). Par défaut : <bibliothèque>/../cache. */
  cacheRoot?: string;
  /** Charger Agbalumo et Inter depuis Google Fonts dans les exports (vrai par défaut). */
  webFonts?: boolean;
  chromiumPath?: string;
  webDist?: string;
  /** Connexion externe (Google, Microsoft…) avec liste blanche d'adresses. */
  auth?: AuthConfig | null;
  /** Repli : mot de passe unique (HTTP Basic), ignoré si `auth` est fourni. */
  password?: string;
}

export async function buildApp(opts: AppOptions) {
  const app = Fastify({ logger: process.env.NODE_ENV === 'production' });
  const lib = new Library(opts.libraryRoot, opts.cacheRoot ?? path.join(path.dirname(path.resolve(opts.libraryRoot)), 'cache'));
  await lib.reindex();
  const exporter = new Exporter(lib, { webFonts: opts.webFonts, chromiumPath: opts.chromiumPath });
  app.addHook('onClose', async () => {
    await exporter.close();
    lib.index.close();
  });
  await app.register(multipart, { limits: { fileSize: 200 * 1024 * 1024, files: 20 } });

  app.addContentTypeParser(['text/yaml', 'application/yaml', 'text/plain'], { parseAs: 'string' }, (_req, body, done) =>
    done(null, body),
  );

  if (opts.auth) {
    registerAuth(app, opts.auth);
  } else if (opts.password) {
    const expected = 'Basic ' + Buffer.from(`ft:${opts.password}`).toString('base64');
    app.addHook('onRequest', async (req, reply) => {
      if (req.url === '/api/health') return;
      if (req.headers.authorization !== expected) {
        reply.header('WWW-Authenticate', 'Basic realm="FT Designer"').code(401).send('Authentification requise');
      }
    });
  }

  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/me', async (req) => req.user ?? null);
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

  app.post<{ Body: { title?: string; colors?: Array<{ hex: string; name?: string; role?: string }>; tags?: string[] } }>(
    '/api/library/palettes',
    async (req, reply) => {
      try {
        const { title, colors, tags } = req.body ?? {};
        return { created: await lib.createPalette({ title: title || 'Palette', colors: colors ?? [], tags }) };
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    },
  );

  app.post('/api/library/reindex', async () => ({ count: await lib.reindex() }));

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

  app.get<{ Params: { id: string }; Querystring: { format?: string; type?: string; record?: string } }>(
    '/api/projects/:id/export',
    async (req, reply) => {
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
        return reply
          .type(type)
          .header('Content-Disposition', `attachment; filename="${project.id}-${format.id}${suffix}.${kind}"`)
          .send(body);
      } catch (err) {
        req.log.error(err);
        return reply.code(400).send({ error: (err as Error).message });
      }
    },
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
      const project = await lib.writeProject(req.params.id, req.body, req.user?.email);
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
