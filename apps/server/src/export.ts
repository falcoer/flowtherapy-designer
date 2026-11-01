import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  computeLayout,
  expandRecords,
  formatPixelSize,
  renderSvg,
  globalOpacity,
  resolveBackground,
  type Format,
  type LibraryElement,
  type PaletteElement,
  type Project,
} from '@ftd/core';
import type { Browser } from 'playwright-core';
import type { Library } from './library.js';

export type ExportKind = 'svg' | 'png' | 'pdf';

const MIME: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const GOOGLE_FONTS = "@import url('https://fonts.googleapis.com/css2?family=Agbalumo&family=Inter:wght@400;600;700&display=block');";

/**
 * Export d'un projet pour un format : SVG autonome (images et polices
 * intégrées), puis PNG ou PDF rendus par Chromium sans tête, le même moteur
 * qu'à l'écran.
 */
export class Exporter {
  private browser: Promise<Browser> | null = null;

  constructor(
    private lib: Library,
    private opts: { webFonts?: boolean; chromiumPath?: string } = {},
  ) {}

  async svg(project: Project, format: Format, formats: Format[], recordIndex = 0): Promise<string> {
    const library = new Map<string, LibraryElement>(this.lib.all().map((e) => [`${e.type}/${e.id}`, e]));
    const rows = expandRecords(project.values, project.records);
    if (recordIndex < 0 || recordIndex >= rows.length) throw new Error(`Ligne ${recordIndex + 1} inexistante (${rows.length} au total)`);

    // images intégrées : original pour le papier, rendu web pour l'écran
    const print = format.unit === 'mm';
    const used = new Set<string>([...project.elements.map((e) => e.ref), ...project.globals.map((g) => g.ref)]);
    const uris = new Map<string, string>();
    for (const ref of used) {
      const el = library.get(ref);
      if (el?.type !== 'image') continue;
      const src = path.join(this.lib.root, el.source);
      const isSvg = path.extname(src).toLowerCase() === '.svg';
      const file = isSvg ? { file: src, type: 'image/svg+xml' } : await this.lib.render(el.id, print ? 'print' : 'web');
      uris.set(el.source, `data:${file.type};base64,${(await readFile(file.file)).toString('base64')}`);
    }
    const items = computeLayout(project, format.id, { formats, library, fileUrl: (p) => uris.get(p) ?? p }, rows[recordIndex]);

    const palette = project.palette ? (library.get(`palette/${project.palette}`) as PaletteElement | undefined) : undefined;
    const globals = project.globals
      .map((g) => ({ el: library.get(g.ref), fit: g.fit, opacity: globalOpacity(g.deltas) }))
      .filter((g): g is { el: Extract<LibraryElement, { type: 'image' }>; fit: 'contain' | 'cover' | 'stretch'; opacity: number } => g.el?.type === 'image')
      .map((g) => ({ href: uris.get(g.el.source) ?? '', fit: g.fit, opacity: g.opacity }));

    return renderSvg(format, items, {
      background: resolveBackground(project, palette),
      globals,
      css: await this.fontCss(project, library),
    });
  }

  async render(kind: ExportKind, project: Project, format: Format, formats: Format[], recordIndex = 0): Promise<Buffer> {
    const svg = await this.svg(project, format, formats, recordIndex);
    if (kind === 'svg') return Buffer.from(svg);
    const browser = await this.launch();
    const unit = format.unit;
    const px = formatPixelSize(format);
    const page = await browser.newPage(
      kind === 'png'
        ? { viewport: { width: Math.round(format.unit === 'mm' ? px.width / 4 : px.width), height: Math.round(format.unit === 'mm' ? px.height / 4 : px.height) }, deviceScaleFactor: format.unit === 'mm' ? 4 : 1 }
        : {},
    );
    try {
      const size = kind === 'png' ? 'width:100vw;height:100vh' : `width:${format.width}${unit};height:${format.height}${unit}`;
      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${format.width}${unit} ${format.height}${unit};margin:0}html,body{margin:0;padding:0}svg{display:block;${size}}</style></head><body>${svg}</body></html>`,
        { waitUntil: 'load' },
      );
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      if (kind === 'png') return await page.screenshot({ type: 'png', fullPage: false });
      return await page.pdf({ width: `${format.width}${unit}`, height: `${format.height}${unit}`, printBackground: true, pageRanges: '1' });
    } finally {
      await page.close();
    }
  }

  private async fontCss(project: Project, library: Map<string, LibraryElement>): Promise<string> {
    const rules: string[] = this.opts.webFonts === false ? [] : [GOOGLE_FONTS];
    const fonts = new Set(project.elements.map((e) => e.style.font).filter(Boolean) as string[]);
    for (const id of fonts) {
      const el = library.get(`font/${id}`);
      if (el?.type !== 'font') continue;
      for (const f of el.files) {
        const file = path.join(this.lib.root, f.path);
        const data = (await readFile(file)).toString('base64');
        const mime = MIME[path.extname(file).toLowerCase()] ?? 'font/ttf';
        rules.push(
          `@font-face{font-family:"${el.family.replace(/"/g, '')}";font-weight:${f.weight};font-style:${f.style};src:url(data:${mime};base64,${data})}`,
        );
      }
    }
    return rules.join('');
  }

  private launch(): Promise<Browser> {
    this.browser ??= import('playwright-core').then(({ chromium }) =>
      chromium.launch({ executablePath: this.opts.chromiumPath, args: ['--no-sandbox'] }),
    );
    this.browser.catch(() => (this.browser = null));
    return this.browser;
  }

  async close() {
    if (this.browser) await (await this.browser).close().catch(() => undefined);
    this.browser = null;
  }
}
