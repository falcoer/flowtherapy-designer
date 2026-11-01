import type { Format } from './formats.js';
import { blurRadius, effectFilterSvg, type Effects } from './effects.js';
import { gradientSvg, type Gradient } from './gradient.js';
import type { LayoutItem } from './layout.js';
import { shapeSvg } from './shapes.js';

/**
 * Rendu d'une mise en page en SVG autonome (export). Le même découpage que la
 * surface de travail : fond, éléments globaux, éléments placés.
 */

export interface RenderOptions {
  background: string;
  /** Dégradé de fond, prioritaire sur la couleur. */
  gradient?: Gradient;
  /** Images attachées au document entier (déjà résolues en URL ou data URI). */
  globals: Array<{ href: string; fit: 'contain' | 'cover' | 'stretch'; opacity?: number }>;
  /** Effets appliqués au fond (couleur, dégradé et images). */
  effects?: Effects;
  /** Règles CSS ajoutées (polices @font-face). */
  css?: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const par = (fit: string) => (fit === 'cover' ? 'xMidYMid slice' : fit === 'stretch' ? 'none' : 'xMidYMid meet');
const n = (v: number) => Number(v.toFixed(3));

export function renderSvg(format: Format, items: LayoutItem[], opts: RenderOptions): string {
  const W = format.width;
  const H = format.height;
  const unit = format.unit === 'mm' ? 'mm' : 'px';
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}${unit}" height="${H}${unit}" viewBox="0 0 ${W} ${H}">`,
  );
  if (opts.css) parts.push(`<style>${opts.css}</style>`);
  const grad = opts.gradient ? gradientSvg('bg', opts.gradient) : '';
  parts.push(`<defs><clipPath id="f"><rect width="${W}" height="${H}"/></clipPath>${grad}</defs>`);
  const minSide = Math.min(W, H);
  // avec un flou, le fond déborde du format pour que ses bords restent pleins
  const m = n(3 * blurRadius(opts.effects, minSide));
  const bgFx = opts.effects ? effectFilterSvg('fx-bg', opts.effects, minSide, { x: -m, y: -m, w: W + 2 * m, h: H + 2 * m }) : '';
  parts.push(`<g clip-path="url(#f)">${bgFx ? `<defs>${bgFx}</defs><g filter="url(#fx-bg)">` : ''}`);
  parts.push(`<rect x="${-m}" y="${-m}" width="${n(W + 2 * m)}" height="${n(H + 2 * m)}" fill="${grad ? 'url(#bg)' : esc(opts.background)}"/>`);
  for (const g of opts.globals) {
    const op = g.opacity !== undefined && g.opacity < 1 ? ` opacity="${n(g.opacity)}"` : '';
    parts.push(`<image href="${esc(g.href)}" x="${-m}" y="${-m}" width="${n(W + 2 * m)}" height="${n(H + 2 * m)}" preserveAspectRatio="${par(g.fit)}"${op}/>`);
  }
  if (bgFx) parts.push('</g>');
  for (const it of items) {
    const cx = n(it.x + it.w / 2);
    const cy = n(it.y + it.h / 2);
    const tr = it.rotation ? ` transform="rotate(${it.rotation} ${cx} ${cy})"` : '';
    const fid = `fx-${it.id}`;
    if (it.effects) parts.push(`<defs>${effectFilterSvg(fid, it.effects, minSide)}</defs>`);
    parts.push(`<g opacity="${n(it.opacity)}"${tr}>`);
    // le filtre s'applique dans un groupe intérieur, avant la rotation
    if (it.effects) parts.push(`<g filter="url(#${fid})">`);
    const gid = `g-${it.id}`;
    if (it.gradient) parts.push(`<defs>${gradientSvg(gid, it.gradient)}</defs>`);
    const fill = it.gradient ? `url(#${gid})` : esc(it.color ?? '#111');
    if (it.kind === 'image' && it.href) {
      parts.push(
        `<image href="${esc(it.href)}" x="${n(it.x)}" y="${n(it.y)}" width="${n(it.w)}" height="${n(it.h)}" preserveAspectRatio="${par(it.fit)}"/>`,
      );
    } else if (it.kind === 'shape' && it.shape) {
      parts.push(shapeSvg(it.shape, it.x, it.y, it.w, it.h, it.radius ?? 0).replace('/>', ` fill="${fill}"/>`));
    } else if (it.kind === 'text') {
      const anchor = it.textAlign ?? 'middle';
      const tx = n(anchor === 'start' ? it.x : anchor === 'end' ? it.x + it.w : it.x + it.w / 2);
      const family = it.fontFamily ? `${esc(it.fontFamily)}, ` : '';
      const lines = (it.text ?? '')
        .split('\n')
        .map((line, i) => `<tspan x="${tx}" dy="${i === 0 ? '0.95em' : '1.2em'}">${esc(line)}</tspan>`)
        .join('');
      parts.push(
        `<text x="${tx}" y="${n(it.y)}" font-size="${n(it.fontSize ?? 10)}" font-family="${family}Agbalumo, Georgia, serif"${
          it.fontWeight ? ` font-weight="${it.fontWeight}"` : ''
        } fill="${fill}" text-anchor="${anchor}">${lines}</text>`,
      );
    }
    if (it.effects) parts.push('</g>');
    parts.push('</g>');
  }
  parts.push('</g></svg>');
  return parts.join('');
}
