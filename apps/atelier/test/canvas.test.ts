/**
 * Tests de non-régression qui ont besoin d'un vrai canevas : on sert l'atelier avec Vite et on
 * l'interroge dans Chromium (playwright-core, déjà installé pour l'export côté serveur).
 * Hors CI, sans Chromium installé, ces tests sont sautés ; en CI ils doivent tourner.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, Page } from 'playwright-core';
import type { ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let server: ViteDevServer | undefined;
let browser: Browser | undefined;
let page: Page | undefined;
let skip = '';

beforeAll(async () => {
  const { chromium } = await import('playwright-core');
  try {
    browser = await chromium.launch({ executablePath: process.env.FTD_CHROMIUM_PATH, args: ['--no-sandbox'] });
  } catch (e) {
    if (process.env.CI) throw e;
    skip = `Chromium indisponible : ${(e as Error).message.split('\n')[0]}`;
    return;
  }
  const { createServer } = await import('vite');
  server = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
  await server.listen();
  const addr = server.httpServer!.address() as { port: number };
  page = await browser.newPage();
  // une page vide de la même origine suffit : les modules se chargent à la demande
  await page.goto(`http://127.0.0.1:${addr.port}/@vite/client`);
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

/** Exécute `fn` dans la page, avec les modules de l'atelier (src/…) importés. */
async function run<T>(fn: string): Promise<T> {
  return page!.evaluate(`(async () => {
    const scene = await import('/src/scene.ts');
    const model = await import('/src/model.ts');
    const mold = await import('/src/mold.ts');
    const spill = await import('/src/spill.ts');
    const brush = await import('/src/brush.ts');
    const blank = await import('/src/blank.ts');
    const f = model.formatOf('a4');
    const doc = blank.blankDoc();
    const line = (y, x0 = 0.1, x1 = 0.9, n = 30) => Array.from({ length: n }, (_, i) => ({ x: x0 + (i * (x1 - x0)) / (n - 1), y, p: 0.7 }));
    const shape = (strokes, extra = {}) => ({ id: 'a', name: 'a', kind: 'shape', shape: 'rounded', anchor: { frame: 'repartition', point: 'h1/2 v1/2' }, dx: 0, dy: 0, w: 0.4, h: 0.3, guide: 1, height: 0, visible: true, strokes, ...extra });
    const alpha = (c) => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const compare = (A, B) => {
      let sum = 0, big = 0, ink = 0;
      for (let i = 3; i < A.length; i += 4) {
        const d = Math.abs(A[i] - B[i]);
        sum += d;
        if (d > 64) big++;
        if (B[i] > 64) ink++;
      }
      return { mean: sum / (A.length / 4), big, ink };
    };
    ${fn}
  })()`);
}

const t = (name: string, fn: () => Promise<void>) =>
  it(name, async (ctx) => {
    if (skip) return ctx.skip();
    await fn();
  }, 60_000);

describe('dans le navigateur', () => {
  describe('passes d’aquarelle', () => {
    t('peindre trait par trait donne la même image que tout repeindre', async () => {
      const r = await run<{ mean: number; big: number; ink: number }>(`
        const S = [
          { brush: 'acrylic', guide: 2, size: 0.03, opacity: 1, seed: 1, pts: line(0.2) },
          { brush: 'aquarelle', guide: 3, size: 0.05, opacity: 0.8, seed: 2, pts: line(0.45), wash: 1 },
          { brush: 'aquarelle', guide: 4, size: 0.05, opacity: 0.8, seed: 3, pts: line(0.55), wash: 1 },
          { brush: 'aquarelle', guide: 2, size: 0.05, opacity: 0.8, seed: 4, pts: line(0.7), wash: 2 },
        ];
        scene.forgetPaint();
        let c;
        for (let n = 1; n <= S.length; n++) c = scene.paintFor(shape(S.slice(0, n)), doc, f, 6);
        const A = alpha(c);
        scene.forgetPaint();
        const B = alpha(scene.paintFor(shape(S), doc, f, 6));
        return compare(A, B);
      `);
      expect(r.ink).toBeGreaterThan(1000);
      expect(r.mean).toBeLessThan(0.05);
      expect(r.big).toBe(0);
    });

    t('deux traits de la même passe se mêlent, une passe séchée se pose par-dessus', async () => {
      const r = await run<{ mean: number }>(`
        const a = { brush: 'aquarelle', guide: 3, size: 0.06, opacity: 0.8, seed: 2, pts: line(0.48), wash: 1 };
        const b = { brush: 'aquarelle', guide: 4, size: 0.06, opacity: 0.8, seed: 3, pts: line(0.52), wash: 1 };
        scene.forgetPaint();
        const wet = alpha(scene.paintFor(shape([a, b]), doc, f, 6));
        scene.forgetPaint();
        const dry = alpha(scene.paintFor(shape([a, { ...b, wash: 2 }]), doc, f, 6));
        return compare(wet, dry);
      `);
      // le rendu doit différer : sinon les passes humides ne font plus rien
      expect(r.mean).toBeGreaterThan(0.5);
    });
  });

  describe('Déborder', () => {
    /** Peint le trait dans la fenêtre du geste, comme l'atelier, puis en tire les contours de l'encre. */
    const SPILL = `
      const spillRings = (l, s) => {
        const { win, t } = spill.spillWindow(l, f, 6);
        const wet = document.createElement('canvas');
        wet.width = t.pw;
        wet.height = t.ph;
        brush.paintStroke(wet.getContext('2d'), spill.inWin(s, win), doc.guides, t);
        return spill.inkRings(l, f, s, doc.guides, 6, wet, win);
      };
    `;

    t('l’encre sortie de la boîte repousse la découpe', async () => {
      const r = await run<{ maxX: number; grown: boolean; molded: boolean; w0: number; w1: number }>(`${SPILL}
        const s = { brush: 'stamp', stamp: 'dot', guide: 2, size: 0.05, opacity: 1, seed: 5, pts: line(0.5, 0.7, 1.4, 12) };
        const l = shape([]);
        const rings = spillRings(l, s);
        const maxX = Math.max(...rings.flat().map((p) => p.x));
        const g = mold.growPatch({ ...l, strokes: [s] }, f, rings);
        return { maxX, grown: !!g.cut, molded: !!g.molded, w0: l.w, w1: g.w ?? l.w };
      `);
      expect(r.maxX).toBeGreaterThan(1.2);
      expect(r.grown).toBe(true);
      expect(r.molded).toBe(true);
      expect(r.w1).toBeGreaterThan(r.w0 * 1.15);
    });

    t('l’encre restée dans la découpe ne change rien', async () => {
      const r = await run<{ rings: number; patch: string[] }>(`${SPILL}
        const s = { brush: 'stamp', stamp: 'dot', guide: 2, size: 0.03, opacity: 1, seed: 6, pts: line(0.5, 0.4, 0.6, 6) };
        const l = shape([]);
        const rings = spillRings(l, s);
        return { rings: rings.length, patch: Object.keys(mold.growPatch({ ...l, strokes: [s] }, f, rings)) };
      `);
      expect(r.rings).toBeGreaterThan(0);
      expect(r.patch).toEqual([]);
    });

    t('après un débordement, la peinture reprise vaut une repeinture complète', async () => {
      const r = await run<{ mean: number; big: number; ink: number; w: number; w0: number }>(`
        const S = [
          { brush: 'acrylic', guide: 2, size: 0.03, opacity: 1, seed: 1, pts: line(0.3) },
          { brush: 'aquarelle', guide: 3, size: 0.04, opacity: 0.8, seed: 2, pts: line(0.5), wash: 7 },
        ];
        const extra = { brush: 'aquarelle', guide: 4, size: 0.04, opacity: 0.8, seed: 3, pts: line(0.6, 0.5, 0.9), wash: 7 };
        scene.forgetPaint();
        const l = shape(S);
        const w0 = scene.paintFor(l, doc, f, 8).width;
        const ink = [[{ x: 0.9, y: -0.3 }, { x: 1.4, y: -0.3 }, { x: 1.4, y: 0.4 }, { x: 0.9, y: 0.4 }]];
        const g = mold.growPatch({ ...l, strokes: [...S, extra] }, f, ink);
        const l2 = { ...l, ...g };
        const kept = scene.paintFor(l2, doc, f, 8);
        const w = kept.width;
        const A = alpha(kept);
        scene.forgetPaint();
        return { ...compare(A, alpha(scene.paintFor(l2, doc, f, 8))), w, w0 };
      `);
      expect(r.w).toBeGreaterThan(r.w0);
      expect(r.ink).toBeGreaterThan(10_000);
      expect(r.mean).toBeLessThan(0.5);
      expect(r.big / r.ink).toBeLessThan(0.001);
    });
  });

  describe('cache de peinture', () => {
    t('la peinture d’une couche retirée est lâchée', async () => {
      const r = await run<{ before: number; after: number; again: number }>(`
        scene.forgetPaint();
        const S = [{ brush: 'acrylic', guide: 2, size: 0.03, opacity: 1, seed: 1, pts: line(0.3) }];
        const c = scene.paintFor(shape(S), doc, f, 6);
        const before = c.width;
        scene.prunePaints(['autre']);
        const after = c.width;
        return { before, after, again: scene.paintFor(shape(S), doc, f, 6).width };
      `);
      expect(r.before).toBeGreaterThan(0);
      expect(r.after).toBe(0);
      expect(r.again).toBe(r.before);
    });
  });
});
