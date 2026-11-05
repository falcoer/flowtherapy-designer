/**
 * Tampons : motifs vectoriels (les décors à la craie du site du groupe) que l'outil
 * Tampons pose à la couleur courante. Chaque partie est un tracé plein ou un trait.
 */
export interface StampPart {
  d: string;
  fill?: boolean;
  /** Épaisseur du trait, dans le repère du motif. */
  width?: number;
  alpha?: number;
}
export interface StampDef {
  id: string;
  name: string;
  w: number;
  h: number;
  parts: StampPart[];
  /** Sens du motif (radians) : semé, il avance dans la direction du geste. Haut du motif = -π/2. */
  ahead?: number;
  /** Traces de pas : semées, elles alternent gauche et droite (pied miroir), en file. */
  pair?: boolean;
}

/** Ellipse en tracé SVG. */
const ell = (cx: number, cy: number, rx: number, ry: number) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
const UP = -Math.PI / 2;

export const STAMPS: StampDef[] = [
  {
    id: 'coeur',
    name: 'Cœur',
    w: 190.0,
    h: 180.0,
    parts: [
      {
        d: 'M95 161S25 120 18 68C12 27 58 10 94 48c34-39 82-22 78 20-5 50-77 93-77 93Z',
        width: 9.0,
      },
      {
        d: 'M94 153S32 116 26 69c-5-33 31-47 68-10 31-37 69-24 69 10-3 43-69 84-69 84Z',
        width: 3.0,
        alpha: 0.46,
      },
    ],
  },
  {
    id: 'etoile',
    name: 'Étoile',
    w: 180.0,
    h: 180.0,
    parts: [
      {
        d: 'M103,10L126,62L164,51L130,94L166,134L111,128L88,170L72,120L18,111L61,84L35,34L80,56L103,10Z',
        width: 9.0,
      },
      {
        d: 'M107,10L127,67L167,53L136,95L169,138L105,130L88,164L75,116L24,109L67,86L42,40L83,62L107,10Z',
        width: 3.0,
        alpha: 0.48,
      },
    ],
  },
  {
    id: 'etincelle',
    name: 'Étincelle',
    w: 160.0,
    h: 160.0,
    parts: [
      {
        d: 'M80 10C77 47 68 69 32 80c36 8 45 31 48 70 4-39 13-62 49-70-36-11-45-33-49-70Z',
        width: 8.0,
      },
      {
        d: 'M80 25c-3 27-11 45-33 55 23 8 31 27 33 54 4-28 11-47 34-54-23-10-31-28-34-55Z',
        width: 3.0,
        alpha: 0.45,
      },
    ],
  },
  {
    id: 'eclaboussure',
    name: 'Éclaboussure',
    w: 260.0,
    h: 220.0,
    parts: [
      {
        d: 'M54 62c23-37 68-47 104-26 29 17 52 43 48 77-4 39-43 70-84 66-45-4-92-25-91-67 0-18 9-35 23-50Z',
        fill: true,
        alpha: 0.82,
      },
      {
        d: 'M69 68c20-25 60-35 91-16 25 15 38 34 33 61-6 31-37 52-70 49-37-3-76-20-76-52 0-16 8-30 22-42Z',
        width: 7.0,
        alpha: 0.54,
      },
      {
        d: 'M17.0 48.0a14.0 14.0 0 1 0 28.0 0a14.0 14.0 0 1 0 -28.0 0Z',
        fill: true,
      },
      {
        d: 'M201.0 48.0a10.0 10.0 0 1 0 20.0 0a10.0 10.0 0 1 0 -20.0 0Z',
        fill: true,
        alpha: 0.9,
      },
      {
        d: 'M212.0 130.0a17.0 17.0 0 1 0 34.0 0a17.0 17.0 0 1 0 -34.0 0Z',
        fill: true,
        alpha: 0.78,
      },
      {
        d: 'M32.0 172.0a9.0 9.0 0 1 0 18.0 0a9.0 9.0 0 1 0 -18.0 0Z',
        fill: true,
        alpha: 0.84,
      },
      {
        d: 'M144.0 202.0a7.0 7.0 0 1 0 14.0 0a7.0 7.0 0 1 0 -14.0 0Z',
        fill: true,
        alpha: 0.72,
      },
      {
        d: 'M186.0 188.0a4.0 4.0 0 1 0 8.0 0a4.0 4.0 0 1 0 -8.0 0Z',
        fill: true,
        alpha: 0.62,
      },
    ],
  },
  {
    id: 'fleche',
    name: 'Flèche',
    w: 280.0,
    h: 180.0,
    parts: [
      {
        d: 'M18 151C75 133 112 145 156 109c28-23 42-48 86-70M242 39l-59 5M242 39l-25 56',
        width: 11.0,
      },
      {
        d: 'M24 157c57-17 98-7 137-42 25-23 41-49 78-70M236 45l-51 4M236 45l-21 48',
        width: 3.0,
        alpha: 0.42,
      },
    ],
  },
  {
    id: 'virgule',
    name: 'Virgule',
    w: 360.0,
    h: 150.0,
    parts: [
      {
        d: 'M15 121C79 56 135 126 195 78c48-38 86-42 150-50',
        width: 11.0,
      },
      {
        d: 'M20 126c64-61 116 7 179-42 46-36 84-40 140-49',
        width: 3.0,
        alpha: 0.42,
      },
    ],
  },
  {
    id: 'soulignement',
    name: 'Soulignement',
    w: 320.0,
    h: 90.0,
    parts: [
      {
        d: 'M12 34c77-23 170 5 296-16M19 67c88-25 181 3 283-17',
        width: 10.0,
      },
      {
        d: 'M16 38c82-19 173 5 286-15M24 71c82-21 176 2 272-16',
        width: 3.0,
        alpha: 0.44,
      },
    ],
  },
  {
    id: 'nuage',
    name: 'Nuage',
    w: 190.0,
    h: 110.0,
    parts: [
      { d: 'M42 94c-24 0-34-20-23-36 7-10 19-12 27-8 2-21 21-35 41-29 11-15 35-15 45 2 19-4 35 10 33 29 15 4 19 27 4 37-6 4-14 5-21 5Z', width: 8.0 },
      { d: 'M46 86c-16 0-23-13-16-24 5-7 14-8 20-5 2-15 15-25 30-21 8-11 25-10 32 2 14-3 25 7 24 20', width: 3.0, alpha: 0.42 },
    ],
  },
  {
    id: 'laine',
    name: 'Laine',
    w: 170.0,
    h: 120.0,
    parts: [
      { d: 'M16 54c0-22 28-22 28 0s-22 16-16-4c7-20 35-20 37 2s-20 20-13-2c7-22 37-22 37 0s-20 18-13-2c7-20 35-18 35 4s-20 18-15 0', width: 6.0 },
      { d: 'M24 92c0-18 24-18 24 0s-18 13-13-3c6-17 30-17 31 2s-17 16-11-2c6-18 31-18 31 0s-17 15-11-2c6-17 29-15 29 3', width: 5.0, alpha: 0.7 },
    ],
  },
  {
    id: 'feuille',
    name: 'Feuille',
    w: 100.0,
    h: 170.0,
    ahead: UP,
    parts: [
      { d: 'M50 162C18 124 8 72 50 10c42 62 32 114 0 152Z', width: 7.0 },
      { d: 'M50 162V34M50 120 30 102M50 92l20-18M50 68 34 54', width: 3.0, alpha: 0.6 },
    ],
  },
  {
    id: 'pas',
    name: 'Pas',
    w: 100.0,
    h: 170.0,
    ahead: UP,
    pair: true,
    parts: [
      { d: 'M30 48C17 62 22 90 30 106c6 14 0 26 2 42 2 17 31 19 35 0 3-14-4-26 2-44 6-18 22-36 16-52-6-14-41-16-55-4Z', fill: true },
      { d: [ell(34, 26, 10, 12), ell(52, 18, 6, 7.5), ell(65, 21, 5.5, 6.5), ell(76, 28, 5, 6), ell(84, 38, 4.5, 5)].join(''), fill: true },
    ],
  },
  {
    id: 'chien',
    name: 'Chien',
    w: 120.0,
    h: 120.0,
    ahead: UP,
    pair: true,
    parts: [
      { d: 'M60 114c-23 0-41-10-39-29 2-16 18-22 26-34 6-9 19-9 25 0 8 12 24 18 26 34 2 19-15 29-38 29Z', fill: true },
      { d: [ell(22, 50, 10, 13), ell(45, 24, 10, 13.5), ell(75, 24, 10, 13.5), ell(98, 50, 10, 13)].join(''), fill: true },
    ],
  },
  {
    id: 'fer',
    name: 'Fer à cheval',
    w: 110.0,
    h: 120.0,
    ahead: UP,
    pair: true,
    parts: [
      { d: 'M23 110C9 80 9 40 30 20 44 7 66 7 80 20c21 20 21 60 7 90', width: 16.0 },
      { d: 'M23 86v.1M17 58v.1M28 32v.1M87 86v.1M93 58v.1M82 32v.1', width: 5.0, alpha: 0.5 },
    ],
  },
  {
    id: 'sabot',
    name: 'Sabot',
    w: 100.0,
    h: 130.0,
    ahead: UP,
    pair: true,
    parts: [
      { d: 'M45 124C27 124 17 111 17 90 17 60 27 30 40 12c4-6 9-4 9 4v102c0 4-1 6-4 6Z', fill: true },
      { d: 'M55 124c18 0 28-13 28-34 0-30-10-60-23-78-4-6-9-4-9 4v102c0 4 1 6 4 6Z', fill: true },
    ],
  },
];

export const stampOf = (id: string | undefined) => STAMPS.find((s) => s.id === id) ?? STAMPS[0]!;

const paths = new Map<string, Path2D[]>();
/** Tracés du motif, mis en cache. */
export function stampPaths(s: StampDef): Path2D[] {
  let p = paths.get(s.id);
  if (!p) paths.set(s.id, (p = s.parts.map((x) => new Path2D(x.d))));
  return p;
}

/** Aperçu SVG d'un motif (vignettes, curseur). */
export function stampSvg(s: StampDef, color = 'currentColor') {
  const body = s.parts
    .map((x) =>
      x.fill
        ? `<path d="${x.d}" fill="${color}"${x.alpha ? ` opacity="${x.alpha}"` : ''}/>`
        : `<path d="${x.d}" fill="none" stroke="${color}" stroke-width="${x.width}" stroke-linecap="round" stroke-linejoin="round"${x.alpha ? ` opacity="${x.alpha}"` : ''}/>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s.w} ${s.h}">${body}</svg>`;
}
