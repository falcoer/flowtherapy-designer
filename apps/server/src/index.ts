import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { authFromEnv } from './auth.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const webDist = path.join(repo, 'apps/web/dist');
const atelierDist = path.join(repo, 'apps/atelier/dist');

/** Version du paquet et commit déployé (lu dans .git, sans lancer git). */
function versionInfo() {
  const version = (JSON.parse(readFileSync(path.join(repo, 'package.json'), 'utf8')) as { version?: string }).version ?? '0.0.0';
  try {
    const head = readFileSync(path.join(repo, '.git/HEAD'), 'utf8').trim();
    const ref = head.startsWith('ref: ') ? head.slice(5) : null;
    let commit = ref ? '' : head;
    if (ref) {
      const loose = path.join(repo, '.git', ref);
      if (existsSync(loose)) commit = readFileSync(loose, 'utf8').trim();
      else
        commit =
          readFileSync(path.join(repo, '.git/packed-refs'), 'utf8')
            .split('\n')
            .find((l) => l.endsWith(` ${ref}`))
            ?.split(' ')[0] ?? '';
    }
    return { version, commit: commit.slice(0, 7) || undefined };
  } catch {
    return { version };
  }
}

const auth = authFromEnv();
const app = await buildApp({
  libraryRoot: process.env.FTD_LIBRARY ?? path.join(repo, 'library'),
  cacheRoot: process.env.FTD_CACHE,
  webFonts: process.env.FTD_WEB_FONTS !== 'off',
  chromiumPath: process.env.FTD_CHROMIUM_PATH,
  webDist: process.env.NODE_ENV === 'production' && existsSync(webDist) ? webDist : undefined,
  atelierDist: process.env.NODE_ENV === 'production' && existsSync(atelierDist) ? atelierDist : undefined,
  ateliersRoot: process.env.FTD_ATELIERS,
  auth,
  adminEmails: (process.env.FTD_ADMIN_EMAILS ?? auth?.allowedEmails[0] ?? '').split(','),
  version: versionInfo(),
  password: process.env.FTD_PASSWORD,
});

const port = Number(process.env.PORT ?? 4310);
await app.listen({ port, host: process.env.HOST ?? '127.0.0.1' });
console.log(`FT Designer sur http://localhost:${port}`);
