import { resolveAnchor } from './anchors.js';
import { shiftColor } from './color.js';
import { clampDelta, sizeFactor } from './deltas.js';
import type { Format } from './formats.js';
import type { LibraryElement, PaletteElement, Placed, Project } from './schema.js';
import { substitute, type Values } from './tags.js';

/**
 * Calcule la mise en page concrète d'un projet pour un format : chaque élément
 * placé devient une boîte en unités du format, après overrides et deltas.
 * Même code côté navigateur (aperçu) et serveur (export).
 */

export interface LayoutItem {
  id: string;
  ref: string;
  kind: 'image' | 'text' | 'missing';
  anchor: { frame: string; point: string; x: number; y: number };
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  href?: string;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  textAlign?: 'start' | 'middle' | 'end';
  color?: string;
  fit: 'contain' | 'cover' | 'stretch';
}

export interface LayoutContext {
  formats: Format[];
  library: Map<string, LibraryElement>;
  /** Construit l'URL publique d'un fichier source de la bibliothèque. */
  fileUrl?: (path: string) => string;
}

export function libraryKey(el: LibraryElement): string {
  return `${el.type}/${el.id}`;
}

export function effectiveElement(project: Project, formatId: string, el: Placed): Placed {
  const o = project.overrides[formatId]?.[el.id] as Partial<Placed> | undefined;
  if (!o) return el;
  return {
    ...el,
    ...o,
    anchor: { ...el.anchor, ...(o.anchor ?? {}) },
    size: o.size ?? el.size,
    style: { ...el.style, ...(o.style ?? {}) },
    deltas: { ...el.deltas, ...(o.deltas ?? {}) },
  };
}

export function resolveColor(value: string | undefined, palette: PaletteElement | undefined, fallback: string): string {
  if (!value) return fallback;
  const m = /^palette\.(\w+)$/.exec(value);
  if (!m) return value;
  if (!palette) return fallback;
  const key = m[1]!;
  const byIndex = /^\d+$/.test(key) ? palette.colors[Number(key) - 1] : undefined;
  const byRole = palette.colors.find((c) => c.role === key || c.name === key);
  return (byIndex ?? byRole)?.hex ?? fallback;
}

function alignOffset(align: Placed['align'], w: number, h: number): { ox: number; oy: number } {
  const ox = align.includes('left') ? 0 : align.includes('right') ? w : w / 2;
  const oy = align.startsWith('top') ? 0 : align.startsWith('bottom') ? h : h / 2;
  return { ox, oy };
}

export function computeLayout(project: Project, formatId: string, ctx: LayoutContext, values?: Values): LayoutItem[] {
  const format = ctx.formats.find((f) => f.id === formatId);
  if (!format) throw new Error(`Format inconnu : ${formatId}`);
  const palette = project.palette ? (ctx.library.get(`palette/${project.palette}`) as PaletteElement | undefined) : undefined;
  const vals = values ?? project.values;
  const W = format.width;
  const H = format.height;
  const minSide = Math.min(W, H);

  return project.elements.map((raw) => {
    const el = effectiveElement(project, formatId, raw);
    const lib = ctx.library.get(el.ref);
    const anchor = resolveAnchor(el.anchor.frame, el.anchor.point, format);
    const d = el.deltas;
    const k = sizeFactor(d.size);
    const common = {
      id: el.id,
      ref: el.ref,
      anchor: { frame: el.anchor.frame, point: el.anchor.point, ...anchor },
      rotation: clampDelta('rotation', d.rotation ?? 0),
      opacity: Math.max(0, 1 + clampDelta('opacity', d.opacity ?? 0)),
      fit: el.fit,
    };
    const colorDelta = { h: d['color.hue'], l: d['color.lightness'], c: d['color.chroma'] };

    let w: number;
    let h: number;
    let item: Partial<LayoutItem>;
    let scaled = false; // vrai quand le facteur de taille est déjà appliqué

    if (lib?.type === 'image') {
      const aspect = lib.meta ? lib.meta.width / lib.meta.height : 1;
      if (el.size.w !== undefined) {
        w = el.size.w * W;
        h = el.size.h !== undefined ? el.size.h * H : w / aspect;
      } else if (el.size.h !== undefined) {
        h = el.size.h * H;
        w = h * aspect;
      } else {
        const m = (el.size.min ?? 0.3) * minSide;
        [w, h] = aspect >= 1 ? [m * aspect, m] : [m, m / aspect];
      }
      item = { kind: 'image', href: ctx.fileUrl ? ctx.fileUrl(lib.source) : lib.source };
    } else if (lib?.type === 'text') {
      const fontSize = (el.style.size ?? 0.06) * minSide * k;
      const text = substitute(lib.body.trimEnd(), { ...defaultsOf(lib.slots), ...vals });
      const lines = text.split('\n').length;
      w = (el.size.w ?? 0.8) * W;
      h = lines * fontSize * 1.2;
      scaled = true;
      item = {
        kind: 'text',
        text,
        fontSize,
        fontFamily: fontFamily(el.style.font, ctx),
        fontWeight: el.style.weight,
        textAlign: el.style.align ?? 'middle',
        color: shiftColor(resolveColor(el.style.color, palette, '#111111'), colorDelta),
      };
    } else {
      w = (el.size.w ?? 0.2) * W;
      h = (el.size.h ?? el.size.w ?? 0.2) * H;
      item = { kind: 'missing' };
    }

    if (!scaled) {
      w *= k;
      h *= k;
    }
    const { ox, oy } = alignOffset(el.align, w, h);
    const x = anchor.x * W + (d.dx ?? 0) * W - ox;
    const y = anchor.y * H + (d.dy ?? 0) * H - oy;
    return { ...common, ...item, x, y, w, h } as LayoutItem;
  });
}

function defaultsOf(slots: Record<string, { default?: unknown }>): Values {
  return Object.fromEntries(Object.entries(slots).filter(([, s]) => s.default !== undefined).map(([k, s]) => [k, s.default]));
}

/** Une police peut être un élément de bibliothèque ("inter" → font/inter) ou un nom de famille. */
function fontFamily(font: string | undefined, ctx: LayoutContext): string | undefined {
  if (!font) return undefined;
  const el = ctx.library.get(`font/${font}`);
  return el?.type === 'font' ? el.family : font;
}
