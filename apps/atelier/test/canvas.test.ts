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

    t('les poils ne sont pas tranchés par la fenêtre de l’aperçu', async () => {
      // pendant le geste, l'aperçu des poils n'est fait que de pastilles : les brins vont au-delà
      const r = await run<{ preview: number[]; full: number[] }>(`
        const s = { brush: 'hair', guide: 2, size: 0.04, opacity: 1, seed: 9, hairLen: 0.8, pts: line(0.5, 0.6, 1.3, 20) };
        const l = shape([]);
        const box = (wetPaint) => {
          const { win, t } = spill.spillWindow(l, f, 6);
          const wet = document.createElement('canvas');
          wet.width = t.pw;
          wet.height = t.ph;
          wetPaint(wet.getContext('2d'), spill.inWin(s, win), t);
          const pts = spill.inkRings(l, f, s, doc.guides, 6, wet, win).flat();
          return [Math.min(...pts.map((p) => p.x)), Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.y))];
        };
        return {
          preview: box((ctx, ws, t) => brush.previewStamps(ctx, ws, doc.guides, t, 0)),
          full: box((ctx, ws, t) => brush.paintStroke(ctx, ws, doc.guides, t)),
        };
      `);
      // même encre, que l'aperçu soit fait de pastilles ou des vrais brins
      r.full.forEach((v, i) => expect(Math.abs(r.preview[i]! - v)).toBeLessThan(0.01));
      // les brins dépassent nettement le bout du geste
      expect(r.full[2]).toBeGreaterThan(1.4);
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

  describe('objet sans surface', () => {
    t('seul le bord se dessine : ni teinte, ni matière, ni volume, ni ombre de la surface', async () => {
      const r = await run<Record<string, number>>(`
        const k = 400 / f.width;
        const draw = (l) => {
          const c = document.createElement('canvas');
          c.width = Math.round(f.width * k);
          c.height = Math.round(f.height * k);
          const ctx = c.getContext('2d');
          ctx.setTransform(k, 0, 0, k, 0, 0);
          scene.drawLayers(ctx, { ...doc, layers: [l] }, f, { scale: k, onImage: () => {} });
          return c;
        };
        // encre dans la boîte du milieu (la surface) et sur toute l'image
        const ink = (c) => {
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          let all = 0, mid = 0;
          for (let y = 0; y < c.height; y++)
            for (let x = 0; x < c.width; x++)
              if (d[(y * c.width + x) * 4 + 3] > 40) {
                all++;
                if (Math.abs(x / c.width - 0.5) < 0.1 && Math.abs(y / c.height - 0.5) < 0.05) mid++;
              }
          return { all, mid };
        };
        const border = { style: 'round', guide: 2, width: 0.02 };
        const full = ink(draw(shape([], { border, bevel: 0.5, extrude: 0.5, height: 0.4 })));
        const edge = ink(draw(shape([], { border, bevel: 0.5, extrude: 0.5, height: 0.4, hollow: true })));
        const none = ink(draw(shape([], { hollow: true, height: 0.4 })));
        return { fullMid: full.mid, fullAll: full.all, edgeMid: edge.mid, edgeAll: edge.all, none: none.all, opaque: scene.hollowOf(shape([], { hollow: true })) ? 1 : 0 };
      `);
      expect(r.fullMid).toBeGreaterThan(500);
      // le milieu est vide, le bord est toujours là
      expect(r.edgeMid).toBe(0);
      expect(r.edgeAll).toBeGreaterThan(300);
      expect(r.edgeAll).toBeLessThan(r.fullAll / 2);
      // sans bord, il ne reste rien, pas même une ombre
      expect(r.none).toBe(0);
      expect(r.opaque).toBe(1);
    });
  });
  describe('surface inversée', () => {
    t('la surface couvre la page, la découpe devient une fenêtre', async () => {
      const r = await run<Record<string, number>>(`
        const k = 400 / f.width;
        const draw = (l) => {
          const c = document.createElement('canvas');
          c.width = Math.round(f.width * k);
          c.height = Math.round(f.height * k);
          const ctx = c.getContext('2d');
          ctx.setTransform(k, 0, 0, k, 0, 0);
          scene.drawLayers(ctx, { ...doc, layers: [l] }, f, { scale: k, onImage: () => {} });
          return c;
        };
        const at = (c, u, v) => c.getContext('2d').getImageData(Math.round(u * c.width), Math.round(v * c.height), 1, 1).data[3];
        const plain = draw(shape([]));
        const inv = draw(shape([], { invert: true, bevel: 0.3, height: 0.2 }));
        return {
          plainMid: at(plain, 0.5, 0.5), plainCorner: at(plain, 0.05, 0.05),
          invMid: at(inv, 0.5, 0.5), invCorner: at(inv, 0.05, 0.05), invEdge: at(inv, 0.98, 0.98),
          flag: scene.invertOf(shape([], { invert: true })) ? 1 : 0,
          hollowWins: scene.invertOf(shape([], { invert: true, hollow: true })) ? 1 : 0,
        };
      `);
      expect(r.plainMid).toBeGreaterThan(200);
      expect(r.plainCorner).toBe(0);
      // inversée : le milieu (la découpe) est vide, toute la page autour est couverte jusqu'au bord
      expect(r.invMid).toBe(0);
      expect(r.invCorner).toBeGreaterThan(200);
      expect(r.invEdge).toBeGreaterThan(200);
      expect(r.flag).toBe(1);
      expect(r.hollowWins).toBe(0);
    });
  });
  describe('surface déformée gardée et posée en WebGL', () => {
    // un oiseau qui bat des ailes, peint d'un dégradé et d'un trait : sa surface se plie avec lui
    const setup = `
      const anim = await import('/src/anim.ts');
      const wgl = await import('/src/warp-gl.ts');
      anim.setAnimTiming({ period: 1, count: 4 });
      doc.guides.push({ name: 'g', type: 'gradient', stops: ['#ff0044', '#2244ff', '#ffee00'] });
      const G = doc.guides.length - 1;
      const bird = anim.GENERATORS.find((g) => g.kind === 'bird');
      const S = [{ brush: 'acrylic', guide: 2, size: 0.04, opacity: 1, seed: 1, pts: line(0.5, 0.05, 0.95) }];
      const L = { ...shape(S, { anim: anim.newAnim(bird, {}), w: 0.6, h: 0.4 }), shape: undefined, guide: G };
      const c = document.createElement('canvas');
      c.width = 600;
      c.height = Math.round((600 * f.height) / f.width);
      const k = 600 / f.width;
      const draw = (d, t) => {
        anim.setAnimTime(t);
        const ctx = c.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.setTransform(k, 0, 0, k, 0, 0);
        scene.drawLayers(ctx, d, f, { scale: k, onImage: () => {} });
        return ctx.getImageData(0, 0, c.width, c.height).data;
      };
      const diff = (A, B) => {
        let sum = 0, big = 0;
        for (let i = 0; i < A.length; i++) {
          const d = Math.abs(A[i] - B[i]);
          sum += d;
          if (d > 64) big++;
        }
        return { mean: sum / A.length, big };
      };
    `;
    t('la surface gardée donne la même image que la surface refaite à chaque image', async () => {
      const r = await run<{ mean: number; big: number; kept: number }>(`${setup}
        const d = { ...doc, layers: [L] };
        wgl.warpGLTest({ gl: false, cache: false });
        const A = draw(d, 0.3);
        wgl.warpGLTest({ gl: false, cache: true });
        draw(d, 0.1);
        const B = draw(d, 0.3);
        const kept = wgl.warpGLState().kept;
        wgl.warpGLTest({ gl: true, cache: true, force: false });
        return { ...diff(A, B), kept };
      `);
      expect(r.kept).toBe(1);
      expect(r.mean).toBe(0);
    });
    t('une couleur changée dans la palette se voit tout de suite sur la surface gardée', async () => {
      const r = await run<{ before: number[]; after: number[] }>(`${setup}
        wgl.warpGLTest({ gl: false, cache: true });
        const d = { ...doc, layers: [{ ...L, strokes: [] }] };
        const at = (P) => { const x = 300, y = Math.round(c.height / 2); const i = (y * c.width + x) * 4; return [P[i], P[i + 1], P[i + 2], P[i + 3]]; };
        const before = at(draw(d, 0.3));
        const guides = doc.guides.slice();
        guides[G] = { name: 'g', type: 'color', color: '#00ff00' };
        const after = at(draw({ ...d, guides }, 0.3));
        wgl.warpGLTest({ gl: true, cache: true, force: false });
        return { before, after };
      `);
      expect(r.after[1]).toBeGreaterThan(200);
      expect(r.after[0]).toBeLessThan(40);
      expect(r.before).not.toEqual(r.after);
    });
    t('posée en WebGL, la surface pliée est celle du dessin par morceaux', async () => {
      const r = await run<{ mean: number; big: number; gl: boolean }>(`${setup}
        const d = { ...doc, layers: [L] };
        wgl.warpGLTest({ gl: false, cache: true });
        const A = draw(d, 0.3);
        wgl.warpGLTest({ gl: true, cache: true, force: true });
        const gl = wgl.warpGLState().gl;
        const B = draw(d, 0.3);
        wgl.warpGLTest({ gl: true, cache: true, force: false });
        return { ...diff(A, B), gl };
      `);
      // sans WebGL du tout (navigateur de test sans carte graphique ni rendu logiciel), rien à comparer
      if (!r.gl) return;
      expect(r.mean).toBeLessThan(0.05);
      expect(r.big).toBeLessThan(200);
    });
  });
});
