import { formatFraction, parseFraction } from './fractions.js';
import type { Format } from './formats.js';

/**
 * Référentiels d'ancrage. Chaque référentiel est un ensemble de lignes
 * caractéristiques ; ses ancrages sont les intersections de ces lignes à
 * l'intérieur du format. Les noms d'ancrage décrivent leur construction, donc
 * ils se recalculent sur n'importe quel format.
 *
 * - repartition : lignes axiales à 1/2, 1/3, 2/3, 1/4, 3/4.        "h1/3 v2/3"
 * - or          : sections dorées (0,382 et 0,618) sur chaque axe.  "h-or-a × v-or-b"
 * - armature    : armature harmonique (diagonales, réciproques
 *                 perpendiculaires depuis les coins, rabattements
 *                 du petit côté, médianes). Les angles dépendent
 *                 du rapport largeur/hauteur : les points bougent
 *                 avec le format, comme en peinture.                 "d1 × r2"
 * - grid        : colonnes et rangées (marges, gouttières).          "c2 r3", "c2 r3 nw"
 *
 * h = position sur la largeur, v = position sur la hauteur.
 */

export const ANCHOR_FRAMES = ['repartition', 'or', 'armature', 'grid'] as const;
export type AnchorFrame = (typeof ANCHOR_FRAMES)[number];

export const FRAME_TITLES: Record<AnchorFrame, string> = {
  repartition: 'Répartition (demis, tiers, quarts)',
  or: 'Nombre d’or',
  armature: 'Armature harmonique',
  grid: 'Grille classique',
};

export interface AnchorPoint {
  id: string;
  frame: AnchorFrame;
  /** Coordonnées normalisées (0..1) dans le format. */
  x: number;
  y: number;
}

export type LineWeight = 'half' | 'third' | 'quarter' | 'golden' | 'diagonal' | 'reciprocal' | 'rabattement' | 'grid';

export interface GuideLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  weight: LineWeight;
}

/** Droite infinie en unités réelles du format : point + direction. */
interface Line {
  id: string;
  px: number;
  py: number;
  dx: number;
  dy: number;
  weight: LineWeight;
}

const EPS = 1e-9;
export const PHI_MINOR = (3 - Math.sqrt(5)) / 2; // 0,381966…
export const AXIAL_FRACTIONS = [1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4];

const vertical = (id: string, x: number, weight: LineWeight): Line => ({ id, px: x, py: 0, dx: 0, dy: 1, weight });
const horizontal = (id: string, y: number, weight: LineWeight): Line => ({ id, px: 0, py: y, dx: 1, dy: 0, weight });
const through = (id: string, x1: number, y1: number, x2: number, y2: number, weight: LineWeight): Line => ({
  id,
  px: x1,
  py: y1,
  dx: x2 - x1,
  dy: y2 - y1,
  weight,
});

function axialWeight(f: number): LineWeight {
  if (Math.abs(f - 1 / 2) < EPS) return 'half';
  if (Math.abs(f - 1 / 3) < EPS || Math.abs(f - 2 / 3) < EPS) return 'third';
  return 'quarter';
}

/** Lignes caractéristiques d'un référentiel, calculées pour un format. */
export function frameLines(frame: Exclude<AnchorFrame, 'grid'>, format: Format): Line[] {
  const W = format.width;
  const H = format.height;
  if (frame === 'repartition') {
    return AXIAL_FRACTIONS.flatMap((f) => [
      vertical(`h${formatFraction(f)}`, f * W, axialWeight(f)),
      horizontal(`v${formatFraction(f)}`, f * H, axialWeight(f)),
    ]);
  }
  if (frame === 'or') {
    return [
      vertical('h-or-a', PHI_MINOR * W, 'golden'),
      vertical('h-or-b', (1 - PHI_MINOR) * W, 'golden'),
      horizontal('v-or-a', PHI_MINOR * H, 'golden'),
      horizontal('v-or-b', (1 - PHI_MINOR) * H, 'golden'),
    ];
  }
  // armature harmonique
  const lines: Line[] = [
    through('d1', 0, 0, W, H, 'diagonal'),
    through('d2', W, 0, 0, H, 'diagonal'),
    // réciproques : depuis chaque coin, perpendiculaire à la diagonale qui n'y passe pas
    { id: 'r1', px: W, py: 0, dx: -H, dy: W, weight: 'reciprocal' }, // ⟂ d1 depuis haut-droit
    { id: 'r2', px: 0, py: H, dx: -H, dy: W, weight: 'reciprocal' }, // ⟂ d1 depuis bas-gauche
    { id: 'r3', px: 0, py: 0, dx: H, dy: W, weight: 'reciprocal' }, // ⟂ d2 depuis haut-gauche
    { id: 'r4', px: W, py: H, dx: H, dy: W, weight: 'reciprocal' }, // ⟂ d2 depuis bas-droit
    vertical('mh', W / 2, 'half'),
    horizontal('mv', H / 2, 'half'),
  ];
  // rabattements : le petit côté reporté sur le grand
  if (H > W + EPS) lines.push(horizontal('rb1', W, 'rabattement'), horizontal('rb2', H - W, 'rabattement'));
  if (W > H + EPS) lines.push(vertical('rb1', H, 'rabattement'), vertical('rb2', W - H, 'rabattement'));
  return lines;
}

function intersect(a: Line, b: Line): { x: number; y: number } | null {
  const det = a.dx * b.dy - a.dy * b.dx;
  const scale = Math.hypot(a.dx, a.dy) * Math.hypot(b.dx, b.dy);
  if (Math.abs(det) < 1e-9 * scale) return null; // parallèles ou confondues
  const t = ((b.px - a.px) * b.dy - (b.py - a.py) * b.dx) / det;
  return { x: a.px + t * a.dx, y: a.py + t * a.dy };
}

function inside(p: { x: number; y: number }, format: Format) {
  const e = 1e-6 * Math.max(format.width, format.height);
  return p.x >= -e && p.x <= format.width + e && p.y >= -e && p.y <= format.height + e;
}

/** Nom d'un ancrage d'intersection, stable quel que soit l'ordre des lignes. */
export function crossingId(a: string, b: string): string {
  return [a, b].sort().join(' × ');
}

function lineAnchors(frame: Exclude<AnchorFrame, 'grid'>, format: Format): AnchorPoint[] {
  const lines = frameLines(frame, format);
  const out: AnchorPoint[] = [];
  const tol = 1e-6 * Math.max(format.width, format.height);
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i]!;
      const b = lines[j]!;
      const p = intersect(a, b);
      if (!p || !inside(p, format)) continue;
      if (out.some((q) => Math.abs(q.x * format.width - p.x) < tol && Math.abs(q.y * format.height - p.y) < tol)) continue;
      const id =
        frame === 'repartition'
          ? `${a.id.startsWith('h') ? a.id : b.id} ${a.id.startsWith('v') ? a.id : b.id}`
          : crossingId(a.id, b.id);
      out.push({ id, frame, x: p.x / format.width, y: p.y / format.height });
    }
  }
  return out;
}

/** Lignes d'un référentiel découpées au format, pour l'affichage des repères. */
function lineGuides(frame: Exclude<AnchorFrame, 'grid'>, format: Format): GuideLine[] {
  const W = format.width;
  const H = format.height;
  const borders = [vertical('L', 0, 'grid'), vertical('R', W, 'grid'), horizontal('T', 0, 'grid'), horizontal('B', H, 'grid')];
  const out: GuideLine[] = [];
  for (const l of frameLines(frame, format)) {
    const pts = borders.map((b) => intersect(l, b)).filter((p): p is { x: number; y: number } => !!p && inside(p, format));
    if (pts.length < 2) continue;
    // les deux points les plus éloignés sur la droite
    let best: [typeof pts[0], typeof pts[0]] = [pts[0]!, pts[1]!];
    let bestD = -1;
    for (const p of pts)
      for (const q of pts) {
        const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
        if (d > bestD) [bestD, best] = [d, [p, q]];
      }
    out.push({ x1: best[0].x / W, y1: best[0].y / H, x2: best[1].x / W, y2: best[1].y / H, weight: l.weight });
  }
  return out;
}

const AXIAL_RE = /^h(\S+)\s+v(\S+)$/;
const CROSS_RE = /^(\S+)\s*×\s*(\S+)$/;
const GRID_RE = /^c(\d+)\s+r(\d+)(?:\s+(n|s|e|w|ne|nw|se|sw|c))?$/;

/** Calcule la position normalisée (0..1) d'un ancrage sur un format donné. */
export function resolveAnchor(frame: AnchorFrame, point: string, format: Format): { x: number; y: number } {
  const p = point.trim();
  if (frame === 'grid') return resolveGrid(p, format);
  if (frame === 'repartition') {
    // les fractions sont libres : "h2/5 v3/7" est valide même hors des lignes affichées
    const ax = AXIAL_RE.exec(p);
    if (ax) return { x: parseFraction(ax[1]!), y: parseFraction(ax[2]!) };
    throw new Error(`Ancrage de répartition invalide : "${point}"`);
  }
  const m = CROSS_RE.exec(p);
  if (!m) throw new Error(`Ancrage invalide pour ${frame} : "${point}"`);
  const lines = frameLines(frame, format);
  const a = lines.find((l) => l.id === m[1]);
  const b = lines.find((l) => l.id === m[2]);
  if (!a || !b) throw new Error(`Ligne inconnue dans "${point}" pour ce format (${frame})`);
  const q = intersect(a, b);
  if (!q) throw new Error(`Les lignes de "${point}" ne se croisent pas sur ce format`);
  return { x: q.x / format.width, y: q.y / format.height };
}

function resolveGrid(p: string, format: Format) {
  const g = GRID_RE.exec(p);
  if (!g) throw new Error(`Ancrage de grille invalide : "${p}"`);
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

function gridAnchors(format: Format): AnchorPoint[] {
  const grid = format.grid ?? { cols: 12, rows: 12, margin: 0, gutter: 0 };
  const out: AnchorPoint[] = [];
  for (let c = 1; c <= grid.cols; c++) {
    for (let r = 1; r <= grid.rows; r++) {
      for (const corner of ['c', 'nw', 'ne', 'sw', 'se'] as const) {
        const id = corner === 'c' ? `c${c} r${r}` : `c${c} r${r} ${corner}`;
        out.push({ id, frame: 'grid', ...resolveGrid(id, format) });
      }
    }
  }
  return out;
}

function gridGuides(format: Format): GuideLine[] {
  const grid = format.grid ?? { cols: 12, rows: 12, margin: 0, gutter: 0 };
  const lines: GuideLine[] = [];
  for (let c = 1; c <= grid.cols; c++) {
    for (const x of [resolveGrid(`c${c} r1 nw`, format).x, resolveGrid(`c${c} r1 ne`, format).x]) {
      lines.push({ x1: x, y1: 0, x2: x, y2: 1, weight: 'grid' });
    }
  }
  for (let r = 1; r <= grid.rows; r++) {
    for (const y of [resolveGrid(`c1 r${r} nw`, format).y, resolveGrid(`c1 r${r} sw`, format).y]) {
      lines.push({ x1: 0, y1: y, x2: 1, y2: y, weight: 'grid' });
    }
  }
  return lines;
}

export function anchorsFor(frame: AnchorFrame, format: Format): AnchorPoint[] {
  if (frame === 'grid') return gridAnchors(format);
  const pts = lineAnchors(frame, format);
  if (frame === 'repartition') {
    // coins et milieux des bords, utiles pour caler un élément au bord
    for (const h of [0, 0.5, 1])
      for (const v of [0, 0.5, 1]) {
        if (h === 0.5 && v === 0.5) continue;
        pts.push({ id: `h${formatFraction(h)} v${formatFraction(v)}`, frame, x: h, y: v });
      }
  }
  return pts;
}

export function guidesFor(frame: AnchorFrame, format: Format): GuideLine[] {
  return frame === 'grid' ? gridGuides(format) : lineGuides(frame, format);
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
