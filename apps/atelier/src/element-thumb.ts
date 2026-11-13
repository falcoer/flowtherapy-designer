import { paintStroke } from './brush';
import { strokeParams, type ElementDef, type Params } from './elements';
import type { Guide, Stroke } from './model';

const cache = new Map<string, string>();

/**
 * Petit trait d'exemple d'un jeu de paramètres, à la couleur courante (image en data URL).
 * La brûlure ne peint pas (elle consume la couche) : pas d'exemple, l'appelant montre une icône.
 */
export function presetThumb(def: ElementDef, values: Params, guide: Guide | undefined): string | null {
  if (def.brush === 'burn' || !guide) return null;
  const key = `${def.id}|${JSON.stringify(values)}|${JSON.stringify(guide)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [W, H] = [156, 96];
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  // la lumière se lit sur un fond sombre
  if (def.matter === 'light' || def.matter === 'spark') {
    x.fillStyle = '#17161b';
    x.fillRect(0, 0, W, H);
  }
  const pts = Array.from({ length: 21 }, (_, i) => {
    const u = i / 20;
    return { x: 0.16 + 0.5 * u, y: 0.62 - 0.22 * Math.sin(u * Math.PI * 1.4), p: 0.7 };
  });
  const s: Stroke = { brush: def.brush, guide: 0, size: 0.13, opacity: 1, seed: 20261113, pts, ...strokeParams(def, values), grow: 1 };
  paintStroke(x, s, [guide], { pw: W, ph: H, pxPerMin: H });
  const url = c.toDataURL('image/png');
  c.width = c.height = 0;
  if (cache.size > 200) cache.clear();
  cache.set(key, url);
  return url;
}
