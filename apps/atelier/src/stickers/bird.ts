import { ringsToPath, type Ring } from '../cut';
import type { Pt } from '../model';
import { cached, frac, numOf, type Anim, type Generator, type Progress } from './kit';

// oiseau vu de face : ailes en V qui battent (le bout suit le coude avec un retard), le corps monte et descend
const BIRD_FRAMES = 40;
const BIRD_H = 0.66;
function cut(a: Anim, _phase: number, g: Progress): string {
  const amp = Math.max(0.1, Math.min(1, numOf(a, 'amp', 0.8)));
  // hors de la plage du battement, l'oiseau plane dans sa pose de départ
  const k = Math.floor(frac(g('flap')) * BIRD_FRAMES);
  return cached(`b|${amp}|${k}`, () => {
    const ph = (k / BIRD_FRAMES) * 2 * Math.PI;
    const s = Math.sin(ph);
    const yb = 0.035 * amp * Math.sin(ph + Math.PI);
    const yEl = -0.12 * amp * s + yb;
    const yTip = -0.23 * amp * Math.sin(ph - 0.7) + 0.02;
    const xTip = 0.47 - 0.04 * amp * Math.abs(s);
    // contour : dessus de l'aile gauche, tête, dessus de l'aile droite, puis dessous en revenant, queue
    const half = (sx: number) => ({
      tip: { x: sx * xTip, y: yTip },
      elUp: { x: sx * 0.26, y: yEl - 0.03 },
      shUp: { x: sx * 0.08, y: yb - 0.05 },
      shLo: { x: sx * 0.07, y: yb + 0.06 },
      elLo: { x: sx * 0.25, y: yEl + 0.06 },
      tipLo: { x: sx * (xTip - 0.07), y: yTip + 0.04 },
    });
    const [L, R] = [half(-1), half(1)];
    const ctrl: Pt[] = [
      L.tip,
      L.elUp,
      L.shUp,
      { x: -0.045, y: yb - 0.1 },
      { x: 0, y: yb - 0.13 },
      { x: 0.045, y: yb - 0.1 },
      R.shUp,
      R.elUp,
      R.tip,
      R.tipLo,
      R.elLo,
      R.shLo,
      { x: 0.05, y: yb + 0.14 },
      { x: 0, y: yb + 0.11 },
      { x: -0.05, y: yb + 0.14 },
      L.shLo,
      L.elLo,
      L.tipLo,
    ];
    const ring = catmull(ctrl, 8).map((p) => ({ x: p.x + 0.5, y: (p.y + BIRD_H / 2) / BIRD_H }));
    return ringsToPath([ring], 0.0005, 30);
  });
}

/** Courbe fermée passant par les points (Catmull-Rom), `n` points par segment. */
function catmull(P: Pt[], n: number): Ring {
  const out: Pt[] = [];
  const m = P.length;
  for (let i = 0; i < m; i++) {
    const [p0, p1, p2, p3] = [P[(i - 1 + m) % m]!, P[i]!, P[(i + 1) % m]!, P[(i + 2) % m]!];
    for (let j = 0; j < n; j++) {
      const t = j / n;
      const [t2, t3] = [t * t, t * t * t];
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  return out;
}

export const bird: Generator = {
  kind: 'bird',
  name: 'Vol d’oiseau',
  cycle: 1 / 2,
  cycleName: 'Battement',
  cycleWhat: 'Un battement d’ailes',
  params: [{ key: 'amp', name: 'Amplitude', type: 'range', min: 0.1, max: 1, def: 0.8 }],
  gestures: () => [{ id: 'flap', name: 'Battement d’ailes', note: 'bat des ailes', loop: true, params: ['amp'] }],
  cut,
  ratio: () => 1 / BIRD_H,
  glyphPhase: 0.1,
};
