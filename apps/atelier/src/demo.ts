import photo from '../../../library/images/trio-concert/source.jpeg?inline';
import { DEFAULT_GUIDES, type Doc, type Stroke } from './model';

/** Un trait de démonstration : une vague en travers de la couche. */
function wave(guide: number, y: number, amp: number, size: number, seed: number): Stroke {
  const pts = Array.from({ length: 40 }, (_, i) => {
    const t = i / 39;
    return { x: 0.06 + 0.88 * t, y: y + Math.sin(t * Math.PI * 2.2 + seed) * amp, p: 0.45 + 0.5 * Math.sin(t * Math.PI) };
  });
  return { brush: 'aquarelle', guide, size, opacity: 1, seed, pts };
}

/** Document de départ : une affiche de concert composée de quatre couches. */
export function demoDoc(): Doc {
  return {
    formatId: 'a4',
    frame: 'repartition',
    guides: structuredClone(DEFAULT_GUIDES),
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
        strokes: [wave(5, 0.12, 0.04, 0.09, 3), wave(3, 0.9, 0.03, 0.07, 8)],
      },
      {
        id: 'photo',
        name: 'Photo du concert',
        kind: 'photo',
        anchor: { frame: 'repartition', point: 'h1/2 v1/3' },
        dx: 0,
        dy: 0.02,
        w: 0.86,
        h: 0.6,
        shape: 'blob',
        guide: 0,
        src: photo,
        height: 0.35,
        visible: true,
        strokes: [],
      },
      {
        id: 'arche',
        name: 'Papier en arche',
        kind: 'support',
        anchor: { frame: 'repartition', point: 'h1/2 v3/4' },
        dx: 0,
        dy: 0.04,
        w: 0.78,
        h: 0.42,
        shape: 'arch',
        guide: 6,
        height: 0.25,
        visible: true,
        strokes: [wave(2, 0.45, 0.08, 0.12, 1), wave(4, 0.7, 0.05, 0.08, 5)],
      },
      {
        id: 'etoile',
        name: 'Étoile',
        kind: 'shape',
        shape: 'star',
        anchor: { frame: 'repartition', point: 'h3/4 v1/4' },
        dx: 0.06,
        dy: -0.07,
        w: 0.26,
        h: 0.26,
        guide: 4,
        height: 0.6,
        visible: true,
        strokes: [],
      },
    ],
  };
}

export const DEMO_PHOTO = photo;
