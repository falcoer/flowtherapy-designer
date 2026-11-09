// Génère la série d'icônes des applications Flow Therapy (SVG + PNG).
// Usage : node branding/app-icons/generate.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'dist');

// Palette de marque (docs/brand du site) : fond nuit + une couleur d'accent par app.
const NIGHT = '#07101D';
const CREAM = '#FFFAF1';
const BRAND = { violet: '#9A48F0', orange: '#FF8A00', rose: '#FF3B9D', bleu: '#19A7EF' };

// Le « flow » de la vague : du bleu vers le violet vers le jaune.
const FLOW_YELLOW = '#FFC425';

const APPS = [
  { id: 'gestion', name: 'Gestion', accent: BRAND.orange, echo: BRAND.violet },
  { id: 'designer', name: 'Designer', accent: BRAND.rose, echo: BRAND.orange },
  { id: 'manager', name: 'Manager', accent: BRAND.bleu, echo: BRAND.rose },
  { id: 'composer', name: 'Composer', accent: BRAND.violet, echo: BRAND.bleu },
];

const S = 'stroke="' + CREAM + '" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"';

// Pictogrammes dans une boîte ~ 300..724 × 240..740, trait crème + détail d'accent.
const PICTOS = {
  // Classeur : planchette, pince en accent, trois lignes cochées.
  gestion: (a) => `
    <rect x="318" y="262" width="388" height="478" rx="56" fill="none" ${S}/>
    <rect x="420" y="222" width="184" height="92" rx="34" fill="${a}" ${S}/>
    <path d="M378 420l34 34 58-66M378 540l34 34 58-66M378 660l34 34 58-66" fill="none" stroke="${a}" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M532 428h112M532 548h112M532 668h80" fill="none" ${S}/>`,
  // Plume : bec en accent, fente et œil, porte-plume.
  designer: (a) => `
    <path d="M380 372h264l64 140-196 248-196-248z" fill="${a}" ${S}/>
    <path d="M512 760V572" fill="none" ${S}/>
    <circle cx="512" cy="536" r="38" fill="${NIGHT}" ${S}/>
    <rect x="404" y="244" width="216" height="104" rx="30" fill="none" ${S}/>`,
  // Agenda : en-tête en accent, anneaux, grille de dates avec une étoile.
  manager: (a) => `
    <rect x="292" y="300" width="440" height="430" rx="60" fill="none" ${S}/>
    <path d="M292 360a60 60 0 0 1 60-60h320a60 60 0 0 1 60 60v52H292z" fill="${a}" ${S}/>
    <path d="M412 240v100M612 240v100" fill="none" ${S}/>
    <g fill="${CREAM}">
      <circle cx="392" cy="520" r="30"/><circle cx="512" cy="520" r="30"/>
      <circle cx="392" cy="630" r="30"/><circle cx="512" cy="630" r="30"/><circle cx="632" cy="630" r="30"/>
    </g>
    <path d="M632 470l17 36 40 5-29 27 8 40-36-20-36 20 8-40-29-27 40-5z" fill="${a}" stroke="${a}" stroke-width="10" stroke-linejoin="round"/>`,
  // Double croche : têtes crème, hampes, ligature en accent.
  composer: (a) => `
    <path d="M444 640V330M684 590V280" fill="none" ${S}/>
    <path d="M444 300l240-50v110l-240 50z" fill="${a}" ${S}/>
    <ellipse cx="376" cy="652" rx="88" ry="66" transform="rotate(-22 376 652)" fill="${CREAM}"/>
    <ellipse cx="616" cy="602" rx="88" ry="66" transform="rotate(-22 616 602)" fill="${CREAM}"/>`,
};

// Signature commune : la vague du logo Flow Therapy, aux couleurs de la marque.
const WAVE = 'M150 862c60-52 112-58 168-20 48 32 92 36 140-6 56-48 108-44 164 4 50 42 98 40 150-4 30-26 58-34 102-14';

function svg(app, { maskable = false, tiny = false } = {}) {
  const r = maskable ? 0 : 228;
  const scale = maskable ? 0.8 : 1; // zone de sécurité PWA : 80 % du carré
  const t = `translate(${512 - 512 * scale} ${512 - 512 * scale}) scale(${scale})`;
  const wave = tiny ? '' : `<path d="${WAVE}" fill="none" stroke="url(#w-${app.id})" stroke-width="30" stroke-linecap="round"/>`;
  const shift = tiny ? 'translate(0 24)' : 'translate(0 -18)';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <title>Flow Therapy ${app.name}</title>
  <defs>
    <radialGradient id="g-${app.id}" cx="0.5" cy="0.44" r="0.62">
      <stop offset="0" stop-color="${app.accent}" stop-opacity="0.55"/>
      <stop offset="0.55" stop-color="${app.accent}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="${app.accent}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="e-${app.id}" cx="0.9" cy="0.08" r="0.5">
      <stop offset="0" stop-color="${app.echo}" stop-opacity="0.5"/>
      <stop offset="1" stop-color="${app.echo}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="w-${app.id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${BRAND.bleu}"/>
      <stop offset="0.5" stop-color="${BRAND.violet}"/>
      <stop offset="1" stop-color="${FLOW_YELLOW}"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="${r}" fill="${NIGHT}"/>
  <rect width="1024" height="1024" rx="${r}" fill="url(#e-${app.id})"/>
  <rect width="1024" height="1024" rx="${r}" fill="url(#g-${app.id})"/>
  <g transform="${t}">
    <g transform="${shift}">${PICTOS[app.id](app.accent)}</g>
    ${wave}
  </g>
</svg>
`;
}

const PNG = [
  // [nom, taille, variante]
  ['favicon-16.png', 16, 'tiny'], ['favicon-32.png', 32, 'tiny'], ['favicon-48.png', 48, 'tiny'],
  ['apple-touch-icon.png', 180, 'full'], ['icon-192.png', 192, 'full'], ['icon-512.png', 512, 'full'],
  ['icon-1024.png', 1024, 'full'],
  ['maskable-192.png', 192, 'maskable'], ['maskable-512.png', 512, 'maskable'],
];

mkdirSync(out, { recursive: true });
const sources = {};
for (const app of APPS) {
  const dir = join(out, app.id);
  mkdirSync(dir, { recursive: true });
  sources[app.id] = { full: svg(app), tiny: svg(app, { tiny: true }), maskable: svg(app, { maskable: true }) };
  writeFileSync(join(dir, `${app.id}.svg`), sources[app.id].full);
  writeFileSync(join(dir, `${app.id}-favicon.svg`), sources[app.id].tiny);
  writeFileSync(join(dir, `${app.id}-maskable.svg`), sources[app.id].maskable);
}

// Rendu PNG avec le Chromium de Playwright.
const { createRequire } = await import('node:module');
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const app of APPS) {
  for (const [file, size, variant] of PNG) {
    await page.setViewportSize({ width: size, height: size });
    const s = sources[app.id][variant].replace('width="1024" height="1024"', `width="${size}" height="${size}"`);
    await page.setContent(`<html><body style="margin:0;background:transparent">${s}</body></html>`);
    await page.locator('svg').screenshot({ path: join(out, app.id, file), omitBackground: true });
  }
}
await browser.close();
console.log('ok', out);
