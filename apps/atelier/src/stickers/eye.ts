import { ringsToPath } from '../cut';
import type { Pt } from '../model';
import { cached, numOf, type Anim, type Generator, type Progress } from './kit';

// œil : une amande (paupières), l'iris en anneau, la pupille pleine ; deux gestes, le clignement et le regard
const EYE_H = 0.56;
const BLINK_FRAMES = 14;
const LOOK_FRAMES = 32;

function cut(a: Anim, _phase: number, g: Progress): string {
  const open = Math.max(0.3, Math.min(1, numOf(a, 'open', 0.85)));
  const iris = Math.max(0.3, Math.min(0.95, numOf(a, 'iris', 0.7)));
  const gaze = Math.max(0, Math.min(1, numOf(a, 'gaze', 0.6)));
  // clignement : la paupière descend puis remonte sur sa plage ; regard : un aller à gauche, un aller à droite, retour au centre
  const kb = Math.round(Math.sin(Math.PI * g('blink')) * BLINK_FRAMES);
  const kl = Math.round(g('look') * LOOK_FRAMES) % LOOK_FRAMES;
  return cached(`e|${open}|${iris}|${gaze}|${kb}|${kl}`, () => {
    const shut = kb / BLINK_FRAMES;
    const o = open * (1 - 0.96 * shut);
    // en unités de largeur : l'œil va de x = 0,04 à 0,96, son axe est à mi-hauteur de la boîte
    const [x0, x1, cy] = [0.04, 0.96, EYE_H / 2];
    const half = (x1 - x0) / 2;
    const up = (x: number) => cy - 0.25 * o * Math.pow(Math.sin((Math.PI * (x - x0)) / (x1 - x0)), 0.75);
    // la paupière du bas bouge peu : c'est celle du haut qui ferme l'œil
    const lo = (x: number) => cy + 0.2 * open * (1 - 0.8 * shut) * Math.pow(Math.sin((Math.PI * (x - x0)) / (x1 - x0)), 0.85);
    const N = 48;
    const lids: Pt[] = [];
    for (let i = 0; i <= N; i++) {
      const x = x0 + ((x1 - x0) * i) / N;
      lids.push({ x, y: up(x) });
    }
    for (let i = N - 1; i > 0; i--) {
      const x = x0 + ((x1 - x0) * i) / N;
      lids.push({ x, y: lo(x) });
    }
    const R = 0.2 * iris;
    const cx = 0.5 - gaze * (half - R - 0.1) * Math.sin(2 * Math.PI * (kl / LOOK_FRAMES));
    // iris et pupille restent sous les paupières : leurs points sont ramenés dans l'amande
    const disc = (r: number, inset: number): Pt[] => {
      const out: Pt[] = [];
      for (let i = 0; i < 40; i++) {
        const th = (i / 40) * 2 * Math.PI;
        const x = cx + r * Math.cos(th);
        const [top, bot] = [up(x) + inset, lo(x) - inset];
        out.push({ x, y: top >= bot ? (top + bot) / 2 : Math.max(top, Math.min(bot, cy + r * Math.sin(th))) });
      }
      return out;
    };
    const rings = [lids, disc(R, 0.012), disc(R * 0.45, 0.024)].map((ring) => ring.map((p) => ({ x: p.x, y: p.y / EYE_H })));
    return ringsToPath(rings, 0.0005, 30);
  });
}

export const eye: Generator = {
  kind: 'eye',
  name: 'Œil',
  cycle: 4,
  cycleName: 'Scénario',
  cycleWhat: 'Le scénario entier de l’œil (regard et clignements)',
  params: [
    { key: 'open', name: 'Ouverture', type: 'range', min: 0.3, max: 1, def: 0.85 },
    { key: 'iris', name: 'Iris', type: 'range', min: 0.3, max: 0.95, def: 0.7 },
    { key: 'gaze', name: 'Regard', title: 'Jusqu’où l’iris part sur les côtés', type: 'range', min: 0, max: 1, def: 0.6 },
  ],
  gestures: () => [
    { id: 'look', name: 'Regard', note: 'gauche, droite, centre', params: ['gaze'], at: 0.1, len: 0.5 },
    { id: 'blink', name: 'Clignement', note: 'ferme et rouvre', at: 0.75, len: 0.1 },
  ],
  cut,
  ratio: () => 1 / EYE_H,
  size: 0.6,
};
