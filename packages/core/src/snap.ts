import type { AnchorPoint } from './anchors.js';
import type { Format } from './formats.js';
import { ALIGNS } from './schema.js';

/**
 * Aimantation : pendant un glisser, chacun des 9 points d'un élément (coins,
 * milieux des bords, centre) est attiré par le point d'ancrage le plus proche.
 */

export type Align = (typeof ALIGNS)[number];

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Position relative (0..1) d'un point d'alignement dans la boîte. */
export function alignFactors(align: Align): { fx: number; fy: number } {
  const fx = align.includes('left') ? 0 : align.includes('right') ? 1 : 0.5;
  const fy = align.startsWith('top') ? 0 : align.startsWith('bottom') ? 1 : 0.5;
  return { fx, fy };
}

export function alignPoint(box: Box, align: Align): { x: number; y: number } {
  const { fx, fy } = alignFactors(align);
  return { x: box.x + box.w * fx, y: box.y + box.h * fy };
}

export interface Snap {
  anchor: AnchorPoint;
  align: Align;
  /** Décalage à appliquer à la boîte pour que le point touche l'ancrage (unités du format). */
  dx: number;
  dy: number;
  distance: number;
}

/**
 * Meilleure accroche d'une boîte (unités du format) dans le rayon donné,
 * ou null. À distance égale, le centre est préféré, puis les milieux de bord.
 */
export function snapBox(box: Box, anchors: AnchorPoint[], format: Format, radius: number, aligns: readonly Align[] = ALIGNS): Snap | null {
  let best: Snap | null = null;
  let bestScore = Infinity;
  for (const align of aligns) {
    const p = alignPoint(box, align);
    const bias = align === 'center' ? 0.85 : align.includes('-') ? 1 : 0.93;
    for (const a of anchors) {
      const dx = a.x * format.width - p.x;
      const dy = a.y * format.height - p.y;
      const distance = Math.hypot(dx, dy);
      if (distance > radius) continue;
      const score = distance * bias;
      if (score < bestScore) {
        bestScore = score;
        best = { anchor: a, align, dx, dy, distance };
      }
    }
  }
  return best;
}
