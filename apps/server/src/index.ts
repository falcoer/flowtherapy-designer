import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { authFromEnv } from './auth.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const webDist = path.join(repo, 'apps/web/dist');
const atelierDist = path.join(repo, 'apps/atelier/dist');

const app = await buildApp({
  libraryRoot: process.env.FTD_LIBRARY ?? path.join(repo, 'library'),
  cacheRoot: process.env.FTD_CACHE,
  webFonts: process.env.FTD_WEB_FONTS !== 'off',
  chromiumPath: process.env.FTD_CHROMIUM_PATH,
  webDist: process.env.NODE_ENV === 'production' && existsSync(webDist) ? webDist : undefined,
  atelierDist: process.env.NODE_ENV === 'production' && existsSync(atelierDist) ? atelierDist : undefined,
  ateliersRoot: process.env.FTD_ATELIERS,
  auth: authFromEnv(),
  password: process.env.FTD_PASSWORD,
});

const port = Number(process.env.PORT ?? 4310);
await app.listen({ port, host: process.env.HOST ?? '127.0.0.1' });
console.log(`FT Designer sur http://localhost:${port}`);
