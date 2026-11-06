import path from 'node:path';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { Ateliers } from './ateliers.js';
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
}

export async function buildApp(opts: AppOptions) {
  const app = Fastify({ logger: process.env.NODE_ENV === 'production' });
  const lib = new Library(opts.libraryRoot, opts.cacheRoot ?? path.join(path.dirname(path.resolve(opts.libraryRoot)), 'cache'));
  await lib.reindex();
  const ateliers = new Ateliers(opts.ateliersRoot ?? path.join(path.dirname(path.resolve(opts.libraryRoot)), 'ateliers'));
  const exporter = new Exporter(lib, { webFonts: opts.webFonts, chromiumPath: opts.chromiumPath });
  app.addHook('onClose', async () => {
    await exporter.close();
    lib.index.close();
  });
  await app.register(multipart, { limits: { fileSize: 200 * 1024 * 1024, files: 20 } });

  app.addContentTypeParser(['text/yaml', 'application/yaml', 'text/plain'], { parseAs: 'string' }, (_req, body, done) => done(null, body));

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

  const startedAt = new Date().toISOString();
  const admins = (opts.adminEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);
  const isAdmin = (req: FastifyRequest) => (opts.auth ? !!req.user && admins.includes(req.user.email.toLowerCase()) : true);
  const adminOnly = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!isAdmin(req)) reply.code(403).send({ error: 'Réservé aux administrateurs' });
  };

  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/me', async (req) => {
    if (opts.auth) return req.user ? { ...req.user, admin: isAdmin(req), mode: 'compte' } : null;
    return { name: opts.password ? 'Accès partagé' : 'Accès local', admin: true, mode: opts.password ? 'mot-de-passe' : 'local' };
  });
  app.get('/api/system', { preHandler: adminOnly }, async () => {
    const [elements, ateliersList] = await Promise.all([lib.elements(), ateliers.list()]);
    const mem = process.memoryUsage();
    return {
      ...(opts.version ?? { version: '?' }),
      node: process.version,
      startedAt,
      uptime: Math.round(process.uptime()),
      memory: { rss: mem.rss, heap: mem.heapUsed },
      library: elements.length,
      ateliers: ateliersList.length,
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

  // --- compositions de l'atelier ---
  app.get('/api/ateliers', async () => ateliers.list());
  app.get<{ Params: { id: string } }>('/api/ateliers/:id', async (req, reply) => {
    try {
      return await ateliers.read(req.params.id);
    } catch {
      return reply.code(404).send({ error: 'Composition introuvable' });
    }
  });
  app.put<{ Params: { id: string }; Body: { title?: string; doc?: unknown; thumb?: string } }>(
    '/api/ateliers/:id',
    // photos importées comprises, une composition peut peser lourd
    { bodyLimit: 200 * 1024 * 1024 },
    async (req, reply) => {
      try {
        return { ok: true, meta: await ateliers.write(req.params.id, req.body ?? {}, req.user?.email) };
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    },
  );
  app.delete<{ Params: { id: string } }>('/api/ateliers/:id', async (req, reply) => {
    try {
      await ateliers.remove(req.params.id);
      return { ok: true };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });
  app.get<{ Params: { id: string } }>('/api/ateliers/:id/thumb.png', async (req, reply) => {
    const f = await ateliers.thumb(req.params.id).catch(() => null);
    if (!f) return reply.code(404).send({ error: 'Pas de vignette' });
    const { createReadStream } = await import('node:fs');
    return reply.type('image/png').header('Cache-Control', 'private, no-cache').send(createReadStream(f));
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
