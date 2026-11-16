import { ringsToPath } from '../cut';
import type { Pt } from '../model';
import { cached, numOf, type Anim, type Generator, type Progress } from './kit';

// œil : les paupières (en amande, bridées ou rondes), l'iris, la pupille, en trois pièces solidaires ; deux gestes, le clignement et le regard
const EYE_H = 0.56;
const BLINK_FRAMES = 14;
const LOOK_FRAMES = 32;

/** Les pièces de l'œil : chacune est un objet solidaire des autres, avec sa teinte, son bord, sa matière. */
const PARTS = [
  { id: 'white', name: 'Blanc', tint: 0 },
  { id: 'iris', name: 'Iris', tint: 1 },
  { id: 'pupil', name: 'Pupille', tint: 2 },
];

const unit = (a: Anim, key: string, def: number, min = 0, max = 1) => Math.max(min, Math.min(max, numOf(a, key, def)));

function cut(a: Anim, _phase: number, g: Progress): string {
  const open = unit(a, 'open', 0.85, 0.3);
  const iris = unit(a, 'iris', 0.7, 0.3, 0.95);
  const gaze = unit(a, 'gaze', 0.6);
  const round = unit(a, 'round', 0);
  const slant = unit(a, 'slant', 0);
  const flip = a.mirror === 1 ? -1 : 1;
  const part = typeof a.part === 'string' ? a.part : '';
  // clignement : la paupière descend puis remonte sur sa plage ; regard : un aller à gauche, un aller à droite, retour au centre
  const kb = Math.round(Math.sin(Math.PI * g('blink')) * BLINK_FRAMES);
  const kl = Math.round(g('look') * LOOK_FRAMES) % LOOK_FRAMES;
  return cached(`e|${part}|${open}|${iris}|${gaze}|${round}|${slant}|${flip}|${kb}|${kl}`, () => {
    const shut = kb / BLINK_FRAMES;
    const o = open * (1 - 0.96 * shut);
    // en unités de largeur : l'œil en amande va de x = 0,04 à 0,96, l'œil rond se resserre ; son axe est à mi-hauteur de la boîte
    const cy = EYE_H / 2;
    const half = 0.46 * (1 - 0.45 * round);
    const [x0, x1] = [0.5 - half, 0.5 + half];
    /** Position le long de l'œil, de −1 (coin gauche) à 1 (coin droit), gardée dans l'œil. */
    const along = (x: number) => Math.max(-1, Math.min(1, (x - 0.5) / half));
    // profil des paupières : en amande (pointu aux coins), il tend vers l'arc de cercle quand l'œil s'arrondit
    const arc = (u: number, p: number) => Math.pow(Math.cos((Math.PI * u) / 2), p) * (1 - round) + Math.sqrt(Math.max(0, 1 - u * u)) * round;
    // œil bridé : le coin extérieur remonte, la paupière du haut s'aplatit et son sommet part vers le coin intérieur
    const tilt = (u: number) => -0.075 * slant * flip * u;
    const lean = (u: number) => Math.max(-1, Math.min(1, u + 0.3 * slant * flip * (1 - u * u)));
    const [ampUp, ampLo] = [0.25 + (half - 0.25) * round, 0.2 + (half - 0.2) * round];
    const up = (x: number) => {
      const u = along(x);
      return cy + tilt(u) - ampUp * (1 - 0.4 * slant) * o * arc(lean(u), 0.75);
    };
    // la paupière du bas bouge peu : c'est celle du haut qui ferme l'œil
    const lo = (x: number) => {
      const u = along(x);
      return cy + tilt(u) + ampLo * (1 - 0.25 * slant) * open * (1 - 0.8 * shut) * arc(u, 0.85);
    };
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
    const R = Math.min(0.2 * iris, half * 0.8);
    const cx = 0.5 - gaze * Math.max(0, half - R - 0.1 * (1 - 0.8 * round)) * Math.sin(2 * Math.PI * (kl / LOOK_FRAMES));
    // iris et pupille restent sous les paupières : leurs points sont ramenés dans l'œil
    const disc = (r: number, inset: number): Pt[] => {
      const out: Pt[] = [];
      for (let i = 0; i < 40; i++) {
        const th = (i / 40) * 2 * Math.PI;
        const x = Math.max(x0, Math.min(x1, cx + r * Math.cos(th)));
        const [top, bot] = [up(x) + inset, lo(x) - inset];
        out.push({ x, y: top >= bot ? (top + bot) / 2 : Math.max(top, Math.min(bot, cy + r * Math.sin(th))) });
      }
      return out;
    };
    // une pièce : sa surface pleine (le blanc, l'iris posé dessus, la pupille dessus) ; sans pièce, l'œil d'un seul tenant, iris à jour
    const rings = part === 'white' ? [lids] : part === 'iris' ? [disc(R, 0.012)] : part === 'pupil' ? [disc(R * 0.45, 0.024)] : [lids, disc(R, 0.012), disc(R * 0.45, 0.024)];
    return ringsToPath(
      rings.map((ring) => ring.map((p) => ({ x: p.x, y: p.y / EYE_H }))),
      0.0005,
      30,
    );
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
    { key: 'round', name: 'Rondeur', title: 'De l’amande à l’œil tout rond', type: 'range', min: 0, max: 1, def: 0 },
    { key: 'slant', name: 'Bridé', title: 'Le coin extérieur remonte, la paupière s’aplatit', type: 'range', min: 0, max: 1, def: 0 },
    { key: 'mirror', name: 'Miroir', title: 'Retourne la forme de l’œil, pour faire la paire : le regard garde son sens', type: 'check', on: 1, off: 0, def: 0 },
    { key: 'gaze', name: 'Regard', title: 'Jusqu’où l’iris part sur les côtés', type: 'range', min: 0, max: 1, def: 0.6 },
  ],
  gestures: () => [
    { id: 'look', name: 'Regard', note: 'gauche, droite, centre', params: ['gaze'], at: 0.1, len: 0.5 },
    { id: 'blink', name: 'Clignement', note: 'ferme et rouvre', at: 0.75, len: 0.1 },
  ],
  parts: PARTS,
  cut,
  ratio: () => 1 / EYE_H,
  size: 0.6,
};
