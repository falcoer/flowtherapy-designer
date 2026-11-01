import type { Format } from './formats.js';
import type { LayoutItem } from './layout.js';

/**
 * Rendu d'une mise en page en SVG autonome (export). Le même découpage que la
 * surface de travail : fond, éléments globaux, éléments placés.
 */

export interface RenderOptions {
  background: string;
  /** Dégradé de fond, prioritaire sur la couleur. */
  gradient?: { stops: string[]; angle: number };
  /** Images attachées au document entier (déjà résolues en URL ou data URI). */
  globals: Array<{ href: string; fit: 'contain' | 'cover' | 'stretch'; opacity?: number }>;
  /** Règles CSS ajoutées (polices @font-face). */
  css?: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const par = (fit: string) => (fit === 'cover' ? 'xMidYMid slice' : fit === 'stretch' ? 'none' : 'xMidYMid meet');
const n = (v: number) => Number(v.toFixed(3));

/** Coordonnées d'un dégradé linéaire orienté comme en CSS (180° = de haut en bas). */
export function gradientVector(angle: number) {
  const r = (angle * Math.PI) / 180;
  const dx = Math.sin(r) / 2;
  const dy = -Math.cos(r) / 2;
  return { x1: 0.5 - dx, y1: 0.5 - dy, x2: 0.5 + dx, y2: 0.5 + dy };
}

function gradientDef(id: string, g: { stops: string[]; angle: number }) {
  const v = gradientVector(g.angle);
  const stops = g.stops.map((c, i) => `<stop offset="${n(i / (g.stops.length - 1))}" stop-color="${esc(c)}"/>`).join('');
  return `<linearGradient id="${id}" x1="${n(v.x1)}" y1="${n(v.y1)}" x2="${n(v.x2)}" y2="${n(v.y2)}">${stops}</linearGradient>`;
}

export function renderSvg(format: Format, items: LayoutItem[], opts: RenderOptions): string {
  const W = format.width;
  const H = format.height;
  const unit = format.unit === 'mm' ? 'mm' : 'px';
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}${unit}" height="${H}${unit}" viewBox="0 0 ${W} ${H}">`,
  );
  if (opts.css) parts.push(`<style>${opts.css}</style>`);
  const grad = opts.gradient ? gradientDef('bg', opts.gradient) : '';
  parts.push(`<defs><clipPath id="f"><rect width="${W}" height="${H}"/></clipPath>${grad}</defs>`);
  parts.push(`<g clip-path="url(#f)"><rect width="${W}" height="${H}" fill="${grad ? 'url(#bg)' : esc(opts.background)}"/>`);
  for (const g of opts.globals) {
    const op = g.opacity !== undefined && g.opacity < 1 ? ` opacity="${n(g.opacity)}"` : '';
    parts.push(`<image href="${esc(g.href)}" width="${W}" height="${H}" preserveAspectRatio="${par(g.fit)}"${op}/>`);
  }
  for (const it of items) {
    const cx = n(it.x + it.w / 2);
    const cy = n(it.y + it.h / 2);
    const tr = it.rotation ? ` transform="rotate(${it.rotation} ${cx} ${cy})"` : '';
    parts.push(`<g opacity="${n(it.opacity)}"${tr}>`);
    if (it.kind === 'image' && it.href) {
      parts.push(
        `<image href="${esc(it.href)}" x="${n(it.x)}" y="${n(it.y)}" width="${n(it.w)}" height="${n(it.h)}" preserveAspectRatio="${par(it.fit)}"/>`,
      );
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
        } fill="${esc(it.color ?? '#111')}" text-anchor="${anchor}">${lines}</text>`,
      );
    }
    parts.push('</g>');
  }
  parts.push('</g></svg>');
  return parts.join('');
}
