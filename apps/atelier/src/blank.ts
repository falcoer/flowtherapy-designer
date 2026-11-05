import type { Doc, Guide } from './model';

/** Palette du groupe, reprise du logo (library/palettes/flow-therapy.yaml). */
export const BAND_GUIDES: Guide[] = [
  { name: 'Crème', type: 'color', color: '#f8f4ec' },
  { name: 'Nuit', type: 'color', color: '#1b1530' },
  { name: 'Rose', type: 'color', color: '#e9a7c3' },
  { name: 'Menthe', type: 'color', color: '#8ed9d0' },
  { name: 'Violet', type: 'color', color: '#6c4fa1' },
];

/** Page vierge : la seule surface de fond, aux couleurs du groupe. */
export function blankDoc(): Doc {
  return {
    formatId: 'a4',
    frame: 'repartition',
    guides: structuredClone(BAND_GUIDES),
    light: -40,
    layers: [
      {
        id: 'fond',
        name: 'Surface de fond',
        kind: 'surface',
        anchor: { frame: 'repartition', point: 'h1/2 v1/2' },
        dx: 0,
        dy: 0,
        w: 1,
        h: 1,
        guide: 0,
        height: 0,
        visible: true,
        strokes: [],
      },
    ],
  };
}
