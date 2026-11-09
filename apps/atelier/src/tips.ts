/**
 * Pointes de la brosse (pinceau) : ronde, plate, croix, triangle, râteaux de 2 à 5 dents, épis.
 * Les pointes composées (croix, râteaux, épis) sont faites de plusieurs pièces : des disques (dents)
 * ou des lames (traits fins entre deux points). Coordonnées pour un rayon 1, pointe non tournée :
 * la lame plate et les dents du râteau sont alignées sur l'axe x.
 */
export type BrushTip = 'round' | 'flat' | 'cross' | 'triangle' | 'rake2' | 'rake3' | 'rake4' | 'rake5' | 'ears';

/** Ordre du choix sur la roue (la croix suit la plate). */
export const BRUSH_TIPS: readonly BrushTip[] = ['round', 'flat', 'cross', 'triangle', 'rake2', 'rake3', 'rake4', 'rake5', 'ears'];

export const TIP_NAMES: Record<BrushTip, string> = {
  round: 'Ronde',
  flat: 'Plate',
  cross: 'Croix',
  triangle: 'Triangle',
  rake2: 'Râteau 2 dents',
  rake3: 'Râteau 3 dents',
  rake4: 'Râteau 4 dents',
  rake5: 'Râteau 5 dents',
  ears: 'Épis',
};

/** Pièce d'une pointe composée : une dent ronde, ou une lame de a à b (demi-épaisseur ha au départ, hb au bout). */
export type TipPart =
  | { kind: 'dot'; x: number; y: number; r: number }
  | {
      kind: 'blade';
      ax: number;
      ay: number;
      bx: number;
      by: number;
      ha: number;
      hb: number;
    };

/** Demi-épaisseur de la lame plate (la même que la pointe plate). */
const BLADE = 0.16;

/** Épis : trois traits partis d'un même pied, écartés d'angles et de longueurs inégaux. */
const EARS: Array<{ deg: number; len: number }> = [
  { deg: -36, len: 1.42 },
  { deg: 4, len: 1.72 },
  { deg: 27, len: 1.28 },
];

/** Pièces d'une pointe composée ; vide pour ronde, plate et triangle (dessinées à part). */
export function tipParts(tip: BrushTip | undefined): TipPart[] {
  if (!tip) return [];
  if (tip === 'cross')
    return [
      { kind: 'blade', ax: -1, ay: 0, bx: 1, by: 0, ha: BLADE, hb: BLADE },
      { kind: 'blade', ax: 0, ay: -1, bx: 0, by: 1, ha: BLADE, hb: BLADE },
    ];
  if (tip.startsWith('rake')) {
    const n = Number(tip.slice(4));
    // dents réparties sur la largeur de la brosse, séparées par des vides
    const r = 0.55 / n;
    return Array.from({ length: n }, (_, i) => ({
      kind: 'dot' as const,
      x: -1 + (2 * i + 1) / n,
      y: 0,
      r,
    }));
  }
  if (tip === 'ears') {
    const [px, py] = [0, 0.78];
    return EARS.map(({ deg, len }) => {
      const a = (deg * Math.PI) / 180;
      return {
        kind: 'blade' as const,
        ax: px,
        ay: py,
        bx: px + Math.sin(a) * len,
        by: py - Math.cos(a) * len,
        ha: 0.11,
        hb: 0.07,
      };
    });
  }
  return [];
}

/**
 * Épis le long d'un geste : la pointe ne traîne pas, elle s'imprime à intervalles réguliers, ses trois
 * traits tournés vers l'avant du geste ; chaque empreinte varie un peu (angles, longueurs), et
 * l'enchaînement dessine un épi de blé, en arêtes de poisson. `i` : indice du point d'où part l'empreinte.
 */
export function earPrints(pts: Array<{ x: number; y: number; r: number }>, seed: number) {
  let z = (seed ^ 0x9e3779b9) >>> 0;
  const rnd = () => {
    z = (z + 0x6d2b79f5) >>> 0;
    let q = Math.imul(z ^ (z >>> 15), 1 | z);
    q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q;
    return ((q ^ (q >>> 14)) >>> 0) / 4294967296;
  };
  const out: Array<{
    i: number;
    x: number;
    y: number;
    r: number;
    ang: number;
    parts: TipPart[];
  }> = [];
  let next = 0;
  let along = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    if (i) along += Math.hypot(p.x - pts[i - 1]!.x, p.y - pts[i - 1]!.y);
    if (along < next && i) continue;
    // sens du geste, pris un peu avant et un peu après
    const a = pts[Math.max(0, i - 3)]!;
    const b = pts[Math.min(pts.length - 1, i + 3)]!;
    const dir = a === b ? -Math.PI / 2 : Math.atan2(b.y - a.y, b.x - a.x);
    const parts: TipPart[] = EARS.map(({ deg, len }) => {
      const g = ((deg + (rnd() - 0.5) * 16) * Math.PI) / 180;
      const l = len * (0.82 + rnd() * 0.3);
      return {
        kind: 'blade',
        ax: 0,
        ay: 0.78,
        bx: Math.sin(g) * l,
        by: 0.78 - Math.cos(g) * l,
        ha: 0.11,
        hb: 0.07,
      };
    });
    // la pointe dessinée regarde vers le haut (−y) : on la tourne vers l'avant du geste
    out.push({ i, x: p.x, y: p.y, r: p.r, ang: dir + Math.PI / 2, parts });
    next = along + Math.max(1, p.r * (0.5 + rnd() * 0.25));
  }
  return out;
}

/** Vrai pour les pointes faites de plusieurs pièces. */
export const isComposite = (tip: BrushTip | undefined) => tipParts(tip).length > 0;

/** Contour d'une pièce (polygone, sens direct), pour un rayon 1. */
export function partPolygon(p: TipPart): Array<[number, number]> {
  if (p.kind === 'dot') return Array.from({ length: 14 }, (_, k) => [p.x + Math.cos((k * 2 * Math.PI) / 14) * p.r, p.y + Math.sin((k * 2 * Math.PI) / 14) * p.r]);
  const L = Math.hypot(p.bx - p.ax, p.by - p.ay) || 1;
  const [nx, ny] = [-(p.by - p.ay) / L, (p.bx - p.ax) / L];
  return [
    [p.ax - nx * p.ha, p.ay - ny * p.ha],
    [p.bx - nx * p.hb, p.by - ny * p.hb],
    [p.bx + nx * p.hb, p.by + ny * p.hb],
    [p.ax + nx * p.ha, p.ay + ny * p.ha],
  ];
}

/** Le point (u, v) (rayon 1) est-il dans une des pièces ? */
export function insideParts(parts: TipPart[], u: number, v: number) {
  return parts.some((p) => {
    if (p.kind === 'dot') return (u - p.x) ** 2 + (v - p.y) ** 2 <= p.r * p.r;
    const dx = p.bx - p.ax;
    const dy = p.by - p.ay;
    const L2 = dx * dx + dy * dy || 1;
    const t = ((u - p.ax) * dx + (v - p.ay) * dy) / L2;
    if (t < 0 || t > 1) return false;
    const h = p.ha + (p.hb - p.ha) * t;
    return Math.hypot(u - p.ax - dx * t, v - p.ay - dy * t) <= h;
  });
}

/**
 * Pistes de peinture d'une pointe composée (acrylique, rouleau) : des points de la pointe (rayon 1)
 * que le geste traîne, chacun avec sa place sur sa pièce (o, de -1 à 1, pour les bords qui sèchent).
 * Environ `lanes` pistes, au moins deux par pièce.
 */
export function partLanes(parts: TipPart[], lanes: number): Array<{ u: number; v: number; o: number }> {
  const size = parts.map((p) => (p.kind === 'dot' ? 2 * p.r : Math.hypot(p.bx - p.ax, p.by - p.ay)));
  const sum = size.reduce((a, b) => a + b, 0) || 1;
  const out: Array<{ u: number; v: number; o: number }> = [];
  parts.forEach((p, i) => {
    const n = Math.max(2, Math.round((lanes * size[i]!) / sum));
    for (let k = 0; k < n; k++) {
      const o = (k / (n - 1)) * 2 - 1;
      if (p.kind === 'dot') {
        // une dent : des poils sur toute sa largeur, de travers par rapport à la rangée
        out.push({ u: p.x + o * p.r, v: p.y, o });
        out.push({ u: p.x, v: p.y + o * p.r, o });
      } else {
        const t = (o + 1) / 2;
        out.push({
          u: p.ax + (p.bx - p.ax) * t,
          v: p.ay + (p.by - p.ay) * t,
          o,
        });
      }
    }
  });
  return out;
}

/** Tracé SVG de la pointe dans un carré de 100 (centre 50, rayon 44), pour le repère et les icônes. */
export function tipSvgPath(tip: BrushTip, size = 100, rad = 44) {
  const c = size / 2;
  return tipParts(tip)
    .map((p) => {
      const pts = partPolygon(p).map(([x, y]) => `${(c + x * rad).toFixed(2)} ${(c + y * rad).toFixed(2)}`);
      return `M${pts.join('L')}Z`;
    })
    .join('');
}

/** Repère de survol d'une pointe composée : ses pièces cernées de blanc et de sombre, comme le repère du triangle. */
export function tipHoverSvg(tip: BrushTip) {
  const d = tipSvgPath(tip);
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><path d='${d}' fill='none' stroke='white' stroke-width='4' stroke-linejoin='round'/><path d='${d}' fill='none' stroke='#140f1e' stroke-opacity='.55' stroke-width='1.6' stroke-linejoin='round'/></svg>`;
}
