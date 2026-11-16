import { ringsToPath } from '../cut';
import type { Pt } from '../model';
import { cached, frac, numOf, type Anim, type Generator } from './kit';

/** Sens de rotation : 1, ou -1 (inverse des aiguilles) ; les anciens documents le portaient dans le signe de la vitesse. */
const dirOf = (a: Anim) => (a.dir === 1 || a.dir === -1 ? a.dir : a.speed !== undefined && a.speed < 0 ? -1 : 1);

// hélice : un moyeu, des pales en goutte déportée, un trou d'axe
function cut(a: Anim): string {
  const n = Math.max(2, Math.min(8, Math.round(numOf(a, 'blades', 3))));
  const w = Math.max(0.2, Math.min(0.9, numOf(a, 'width', 0.55)));
  // la rotation n'est pas dans la découpe : c'est une consigne (order) ajoutée au mouvement de l'objet,
  // pour que teinte, dégradé, peinture et bord tournent avec les pales
  return cached(`p|${n}|${w}`, () => {
    const turn = (2 * Math.PI) / n;
    const th = 0;
    const [R0, R1] = [0.13, 0.48];
    const outer: Pt[] = [];
    const N = 90 * n;
    for (let i = 0; i < N; i++) {
      const phi = (i / N) * 2 * Math.PI;
      const psi = frac((phi - th) / turn);
      let r = R0;
      if (psi < w) {
        // bord d'attaque arrondi, bord de fuite étiré : la pale semble balayer
        const u = psi / w;
        const p = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.65)), 0.7);
        r = R0 + (R1 - R0) * p;
      }
      outer.push({ x: 0.5 + r * Math.cos(phi), y: 0.5 + r * Math.sin(phi) });
    }
    const hole: Pt[] = [];
    for (let i = 0; i < 24; i++) {
      const phi = (i / 24) * 2 * Math.PI;
      hole.push({ x: 0.5 + 0.035 * Math.cos(phi), y: 0.5 + 0.035 * Math.sin(phi) });
    }
    return ringsToPath([outer, hole], 0.0006, 40);
  });
}

export const propeller: Generator = {
  kind: 'propeller',
  name: 'Hélice',
  cycle: 1,
  cycleName: 'Tour',
  cycleWhat: 'Un tour d’hélice',
  params: [
    { key: 'blades', name: 'Pales', type: 'steps', min: 2, max: 8, def: 3 },
    { key: 'width', name: 'Largeur des pales', type: 'range', min: 0.2, max: 0.9, def: 0.55 },
    { key: 'dir', name: 'Sens inverse', type: 'check', on: -1, off: 1, def: 1, read: dirOf },
  ],
  gestures: () => [{ id: 'spin', name: 'Rotation', note: 'un tour par cycle', order: true, params: ['dir'] }],
  cut,
  ratio: () => 1,
  order: (a, _phase, g) => ({ rot: dirOf(a) * g('spin') * 2 * Math.PI }),
  migrate: (a) => (a.dir === undefined && (a.speed ?? 0) < 0 ? { dir: -1 } : {}),
};
