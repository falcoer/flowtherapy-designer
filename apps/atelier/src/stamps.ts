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
}

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
