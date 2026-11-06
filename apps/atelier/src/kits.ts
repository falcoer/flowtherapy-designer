/**
 * Objets en pièces : un dessin SVG dont chaque groupe (ou chaque forme isolée) devient une pièce
 * nommée, découpée dans la même boîte, solidaire des autres. La couleur du dessin choisit le guide
 * de la palette le plus proche ; `data-volume` (dome, cylinder, cone, cushion) et `data-lift`
 * (hauteur ajoutée, 0..1) sont lus s'ils sont présents.
 */
import polygonClipping from 'polygon-clipping';
import { ringsToPath, type Ring } from './cut';
import type { Volume, VolumeKind } from './model';

export interface KitPart {
  name: string;
  /** Découpe, en coordonnées 0..1 de la boîte de l'objet. */
  d: string;
  /** Couleur du dessin (#rrggbb). */
  color: string;
  volume?: Volume;
  /** Hauteur au-dessus de la pièce de base (0..1). */
  lift: number;
}

export interface Kit {
  name: string;
  /** Largeur / hauteur de la boîte. */
  ratio: number;
  parts: KitPart[];
}

const SHAPES = 'path, rect, circle, ellipse, polygon, polyline, line';
const VOLS: VolumeKind[] = ['dome', 'cylinder', 'cone', 'cushion'];

/** Contours d'une forme SVG, échantillonnés dans le repère du dessin. */
function ringsOf(el: SVGGeometryElement, root: SVGSVGElement): Ring[] {
  const len = el.getTotalLength();
  if (!(len > 0)) return [];
  const m = root.getScreenCTM()!.inverse().multiply(el.getScreenCTM()!);
  const n = Math.max(24, Math.min(600, Math.round(len / 2)));
  const step = len / n;
  const rings: Ring[] = [];
  let cur: Ring = [];
  let prev: DOMPoint | null = null;
  for (let i = 0; i <= n; i++) {
    const p = el.getPointAtLength(Math.min(len, i * step));
    // un saut : un nouveau sous-tracé commence
    if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) > step * 2.5) {
      if (cur.length > 2) rings.push(cur);
      cur = [];
    }
    const q = p.matrixTransform(m);
    cur.push({ x: q.x, y: q.y });
    prev = p;
  }
  if (cur.length > 2) rings.push(cur);
  return rings;
}

/** Les formes d'une pièce réunies (union), chacune lue en pair-impair. */
function unite(all: Ring[][]): Ring[] {
  const polys = all
    .map((rings) => {
      const ps = rings.filter((r) => r.length >= 3).map((r) => [r.map((p) => [p.x, p.y] as [number, number])]);
      if (!ps.length) return null;
      const [a, ...rest] = ps;
      return rest.length ? polygonClipping.xor(a!, ...rest) : polygonClipping.union(a!);
    })
    .filter((x): x is ReturnType<typeof polygonClipping.union> => !!x && x.length > 0);
  if (!polys.length) return [];
  const [a, ...rest] = polys;
  const g = rest.length ? polygonClipping.union(a!, ...rest) : a!;
  return g.flatMap((poly) => poly.map((ring) => ring.map(([x, y]) => ({ x, y }))));
}

function hexOf(css: string | null): string | null {
  if (!css || css === 'none') return null;
  const c = document.createElement('canvas').getContext('2d')!;
  c.fillStyle = '#000';
  c.fillStyle = css;
  const v = c.fillStyle as string;
  return v.startsWith('#') ? v : null;
}

const labelOf = (el: Element) => el.getAttribute('inkscape:label') ?? el.getAttribute('data-name') ?? el.getAttribute('aria-label') ?? el.getAttribute('id');

/** Lit un dessin SVG : une pièce par groupe de premier niveau (ou par forme hors groupe). */
export function kitFromSvg(text: string, name: string): Kit {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const src = doc.documentElement;
  if (src.nodeName !== 'svg') throw new Error('Ce fichier n’est pas un dessin SVG');
  // placé dans la page (invisible) pour que le navigateur mesure les formes
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1000px;height:1000px;visibility:hidden';
  const svg = document.importNode(src, true) as unknown as SVGSVGElement;
  host.appendChild(svg);
  document.body.appendChild(host);
  try {
    // une seule couche englobante (export Inkscape, Illustrator) : on descend d'un niveau
    let top: Element = svg;
    for (;;) {
      const kids = [...top.children].filter((c) => c.nodeName === 'g' || c.matches(SHAPES));
      if (kids.length === 1 && kids[0]!.nodeName === 'g' && kids[0]!.querySelectorAll('g').length > 0) top = kids[0]!;
      else break;
    }
    const groups = [...top.children].filter((c) => c.nodeName === 'g' || c.matches(SHAPES));
    const raw: Array<{ name: string; rings: Ring[]; color: string; volume?: Volume; lift: number }> = [];
    groups.forEach((g, i) => {
      const shapes = (g.matches(SHAPES) ? [g] : [...g.querySelectorAll(SHAPES)]) as SVGGeometryElement[];
      const visible = shapes.filter((s) => getComputedStyle(s).fill !== 'none' && getComputedStyle(s).display !== 'none');
      const rings = unite(visible.map((s) => ringsOf(s, svg)));
      if (!rings.length) return;
      const color = hexOf(g.getAttribute('fill')) ?? hexOf(visible[0] ? getComputedStyle(visible[0]).fill : null) ?? '#999999';
      const vk = g.getAttribute('data-volume') as VolumeKind | null;
      const volume =
        vk && VOLS.includes(vk)
          ? { kind: vk, amount: Number(g.getAttribute('data-amount') ?? (vk === 'cone' ? 0.5 : 0.7)), axis: g.hasAttribute('data-axis') ? (Number(g.getAttribute('data-axis')) * Math.PI) / 180 : undefined }
          : undefined;
      raw.push({ name: labelOf(g) ?? `Pièce ${i + 1}`, rings, color, volume, lift: Number(g.getAttribute('data-lift') ?? 0) || 0 });
    });
    if (!raw.length) throw new Error('Aucune forme pleine dans ce dessin');
    // la boîte commune : l'étendue de toutes les pièces
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of raw)
      for (const r of p.rings)
        for (const q of r) {
          x0 = Math.min(x0, q.x);
          y0 = Math.min(y0, q.y);
          x1 = Math.max(x1, q.x);
          y1 = Math.max(y1, q.y);
        }
    const [w, h] = [Math.max(1e-6, x1 - x0), Math.max(1e-6, y1 - y0)];
    const parts = raw.map((p) => ({
      name: p.name,
      d: ringsToPath(
        p.rings.map((r) => r.map((q) => ({ x: (q.x - x0) / w, y: (q.y - y0) / h }))),
        0.0015,
      ),
      color: p.color,
      volume: p.volume,
      lift: p.lift,
    }));
    return { name: labelOf(svg) ?? name, ratio: w / h, parts };
  } finally {
    host.remove();
  }
}

/** Guide de la palette le plus proche d'une couleur. */
export function nearestGuide(hex: string, colors: string[]): number {
  const rgb = (c: string) => {
    const s = c.replace('#', '');
    const n = parseInt(s.length === 3 ? s.replace(/./g, (x) => x + x) : s.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [r, g, b] = rgb(hex);
  let best = 0;
  let bd = Infinity;
  colors.forEach((c, i) => {
    if (!c.startsWith('#')) return;
    const [R, G, B] = rgb(c);
    // écart perçu, grossièrement : le vert compte plus
    const d = 2 * (r! - R!) ** 2 + 4 * (g! - G!) ** 2 + 3 * (b! - B!) ** 2;
    if (d < bd) [bd, best] = [d, i];
  });
  return best;
}
