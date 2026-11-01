import { formatFraction, parseFraction } from './fractions.js';
import type { Format } from './formats.js';

/**
 * Référentiels d'ancrage.
 *
 * Répartition : le format est normalisé en [0,1]², découpé par des lignes
 * axiales (demis, tiers, quarts) et par des rayons issus du centre vers les
 * points de division des bords. Un ancrage se nomme par ses fractions, donc il
 * se recalcule sur n'importe quel format :
 *   - axial  : "h1/3 v2/3"           (h = position sur la largeur, v = sur la hauteur)
 *   - radial : "ray h1/4 v0 @1/2"    (rayon du centre vers le point h1/4 v0, à mi-distance)
 *
 * Grille : colonnes et rangées avec marges et gouttières, en unités du format.
 *   - "c2 r3"     centre de la cellule colonne 2, rangée 3 (comptées depuis 1)
 *   - "c2 r3 nw"  coin haut-gauche de cette cellule (n, s, e, w, ne, nw, se, sw)
 */

export type AnchorFrame = 'repartition' | 'grid';

export interface AnchorPoint {
  id: string;
  frame: AnchorFrame;
  kind: 'axial' | 'radial' | 'grid';
  /** Coordonnées normalisées (0..1) dans le format. */
  x: number;
  y: number;
}

export interface GuideLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  weight: 'half' | 'third' | 'quarter' | 'radial' | 'grid';
}

export const AXIAL_FRACTIONS = [0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1];
export const RADIAL_DISTANCES = [1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4];

const EPS = 1e-9;

function weightOf(f: number): GuideLine['weight'] {
  if (Math.abs(f - 1 / 2) < EPS) return 'half';
  if (Math.abs(f - 1 / 3) < EPS || Math.abs(f - 2 / 3) < EPS) return 'third';
  return 'quarter';
}

export function axialId(h: number, v: number): string {
  return `h${formatFraction(h)} v${formatFraction(v)}`;
}

/** Points du bord vers lesquels partent les rayons (coins compris). */
export function rayTargets(): Array<{ h: number; v: number }> {
  const out: Array<{ h: number; v: number }> = [];
  for (const h of AXIAL_FRACTIONS) {
    for (const v of AXIAL_FRACTIONS) {
      const onBorder = h === 0 || h === 1 || v === 0 || v === 1;
      if (onBorder) out.push({ h, v });
    }
  }
  return out;
}

export function repartitionAnchors(): AnchorPoint[] {
  const points: AnchorPoint[] = [];
  for (const h of AXIAL_FRACTIONS) {
    for (const v of AXIAL_FRACTIONS) {
      points.push({ id: axialId(h, v), frame: 'repartition', kind: 'axial', x: h, y: v });
    }
  }
  for (const t of rayTargets()) {
    for (const d of RADIAL_DISTANCES) {
      const x = 0.5 + (t.h - 0.5) * d;
      const y = 0.5 + (t.v - 0.5) * d;
      const duplicate = points.some((p) => Math.abs(p.x - x) < EPS && Math.abs(p.y - y) < EPS);
      if (duplicate) continue;
      points.push({
        id: `ray ${axialId(t.h, t.v)} @${formatFraction(d)}`,
        frame: 'repartition',
        kind: 'radial',
        x,
        y,
      });
    }
  }
  return points;
}

export function repartitionGuides(): GuideLine[] {
  const lines: GuideLine[] = [];
  for (const f of AXIAL_FRACTIONS) {
    if (f === 0 || f === 1) continue;
    const weight = weightOf(f);
    lines.push({ x1: f, y1: 0, x2: f, y2: 1, weight });
    lines.push({ x1: 0, y1: f, x2: 1, y2: f, weight });
  }
  for (const t of rayTargets()) {
    lines.push({ x1: 0.5, y1: 0.5, x2: t.h, y2: t.v, weight: 'radial' });
  }
  return lines;
}

const AXIAL_RE = /^h(\S+)\s+v(\S+)$/;
const RAY_RE = /^ray\s+h(\S+)\s+v(\S+)\s+@(\S+)$/;
const GRID_RE = /^c(\d+)\s+r(\d+)(?:\s+(n|s|e|w|ne|nw|se|sw|c))?$/;

/** Calcule la position normalisée (0..1) d'un ancrage sur un format donné. */
export function resolveAnchor(frame: AnchorFrame, point: string, format: Format): { x: number; y: number } {
  const p = point.trim();
  if (frame === 'repartition') {
    const ray = RAY_RE.exec(p);
    if (ray) {
      const h = parseFraction(ray[1]!);
      const v = parseFraction(ray[2]!);
      const d = parseFraction(ray[3]!);
      return { x: 0.5 + (h - 0.5) * d, y: 0.5 + (v - 0.5) * d };
    }
    const ax = AXIAL_RE.exec(p);
    if (ax) return { x: parseFraction(ax[1]!), y: parseFraction(ax[2]!) };
    throw new Error(`Ancrage de répartition invalide : "${point}"`);
  }
  const g = GRID_RE.exec(p);
  if (!g) throw new Error(`Ancrage de grille invalide : "${point}"`);
  const cell = gridCell(format, Number(g[1]), Number(g[2]));
  const corner = g[3] ?? 'c';
  const fx = corner.includes('w') ? 0 : corner.includes('e') ? 1 : 0.5;
  const fy = corner.includes('n') ? 0 : corner.includes('s') ? 1 : 0.5;
  return {
    x: (cell.x + cell.w * fx) / format.width,
    y: (cell.y + cell.h * fy) / format.height,
  };
}

function gridCell(format: Format, col: number, row: number) {
  const grid = format.grid ?? { cols: 12, rows: 12, margin: 0, gutter: 0 };
  if (col < 1 || col > grid.cols || row < 1 || row > grid.rows) {
    throw new Error(`Cellule hors grille : c${col} r${row} (grille ${grid.cols}×${grid.rows})`);
  }
  const margin = grid.margin ?? 0;
  const gutter = grid.gutter ?? 0;
  const w = (format.width - 2 * margin - gutter * (grid.cols - 1)) / grid.cols;
  const h = (format.height - 2 * margin - gutter * (grid.rows - 1)) / grid.rows;
  return { x: margin + (col - 1) * (w + gutter), y: margin + (row - 1) * (h + gutter), w, h };
}

export function gridAnchors(format: Format): AnchorPoint[] {
  const grid = format.grid ?? { cols: 12, rows: 12, margin: 0, gutter: 0 };
  const out: AnchorPoint[] = [];
  for (let c = 1; c <= grid.cols; c++) {
    for (let r = 1; r <= grid.rows; r++) {
      for (const corner of ['c', 'nw', 'ne', 'sw', 'se'] as const) {
        const id = corner === 'c' ? `c${c} r${r}` : `c${c} r${r} ${corner}`;
        const pos = resolveAnchor('grid', id, format);
        out.push({ id, frame: 'grid', kind: 'grid', ...pos });
      }
    }
  }
  return out;
}

export function gridGuides(format: Format): GuideLine[] {
  const grid = format.grid ?? { cols: 12, rows: 12, margin: 0, gutter: 0 };
  const lines: GuideLine[] = [];
  for (let c = 1; c <= grid.cols; c++) {
    const a = resolveAnchor('grid', `c${c} r1 nw`, format);
    const b = resolveAnchor('grid', `c${c} r1 ne`, format);
    lines.push({ x1: a.x, y1: 0, x2: a.x, y2: 1, weight: 'grid' });
    lines.push({ x1: b.x, y1: 0, x2: b.x, y2: 1, weight: 'grid' });
  }
  for (let r = 1; r <= grid.rows; r++) {
    const a = resolveAnchor('grid', `c1 r${r} nw`, format);
    const b = resolveAnchor('grid', `c1 r${r} sw`, format);
    lines.push({ x1: 0, y1: a.y, x2: 1, y2: a.y, weight: 'grid' });
    lines.push({ x1: 0, y1: b.y, x2: 1, y2: b.y, weight: 'grid' });
  }
  return lines;
}

export function anchorsFor(frame: AnchorFrame, format: Format): AnchorPoint[] {
  return frame === 'grid' ? gridAnchors(format) : repartitionAnchors();
}

/**
 * Ancrage le plus proche d'un point (coordonnées normalisées). La distance est
 * mesurée dans les unités réelles du format pour ne pas favoriser un axe.
 */
export function nearestAnchor(points: AnchorPoint[], x: number, y: number, format: Format): AnchorPoint {
  let best = points[0]!;
  let bestD = Infinity;
  for (const p of points) {
    const dx = (p.x - x) * format.width;
    const dy = (p.y - y) * format.height;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}
