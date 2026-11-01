import type { SHAPES } from './schema.js';

export type ShapeKind = (typeof SHAPES)[number];

const n = (v: number) => Math.round(v * 1000) / 1000;

/** Géométrie d'une forme dans sa boîte : balise SVG et attributs. */
export function shapeGeometry(shape: ShapeKind, x: number, y: number, w: number, h: number, radius = 0) {
  switch (shape) {
    case 'ellipse':
      return { tag: 'ellipse' as const, attrs: { cx: n(x + w / 2), cy: n(y + h / 2), rx: n(w / 2), ry: n(h / 2) } };
    case 'pill': {
      const r = Math.min(w, h) / 2;
      return { tag: 'rect' as const, attrs: { x: n(x), y: n(y), width: n(w), height: n(h), rx: n(r), ry: n(r) } };
    }
    case 'triangle':
      return { tag: 'polygon' as const, attrs: { points: `${n(x + w / 2)},${n(y)} ${n(x + w)},${n(y + h)} ${n(x)},${n(y + h)}` } };
    case 'diamond':
      return {
        tag: 'polygon' as const,
        attrs: { points: `${n(x + w / 2)},${n(y)} ${n(x + w)},${n(y + h / 2)} ${n(x + w / 2)},${n(y + h)} ${n(x)},${n(y + h / 2)}` },
      };
    default: {
      const r = radius * Math.min(w, h);
      return { tag: 'rect' as const, attrs: { x: n(x), y: n(y), width: n(w), height: n(h), rx: n(r), ry: n(r) } };
    }
  }
}

export function shapeSvg(shape: ShapeKind, x: number, y: number, w: number, h: number, radius = 0): string {
  const g = shapeGeometry(shape, x, y, w, h, radius);
  return `<${g.tag} ${Object.entries(g.attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ')}/>`;
}
