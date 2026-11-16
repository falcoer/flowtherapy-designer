import { pathToRings, ringsToPath } from '../cut';
import { textCut, textEpoch, type TextStyle } from '../text';
import { cached, frac, numOf, type Anim, type Generator } from './kit';

// compte à rebours : chaque nouvelle valeur arrive en grossissant légèrement (10 images)
const POP_FRAMES = 10;
function values(a: Anim): number[] {
  const from = Math.max(0, Math.min(9999, Math.round(numOf(a, 'from', 3))));
  const step = Math.max(1, Math.round(numOf(a, 'step', 1)));
  const out: number[] = [];
  for (let v = from; v >= 0; v -= step) out.push(v);
  return out;
}
const styleOf = (a: Anim, content: string): TextStyle => ({ content, font: typeof a.font === 'string' ? a.font : 'anton', weight: 400, italic: false, align: 'center' });
/** Boîte de référence : autant de 8 que la plus longue valeur, toutes les valeurs s'y centrent. */
const refStyle = (a: Anim) => styleOf(a, '8'.repeat(String(values(a)[0] ?? 0).length));

/** Valeur affichée à une avancée du cycle, et l'avancée dans son temps (0..1) : les valeurs se partagent le cycle. */
function at(a: Anim, phase: number): { value: number; f: number } {
  const vals = values(a);
  const x = frac(phase) * vals.length;
  const i = Math.min(vals.length - 1, Math.floor(x));
  return { value: vals[i] ?? 0, f: frac(x) };
}

function cut(a: Anim, phase: number): string {
  const { value, f } = at(a, phase);
  const k = Math.min(POP_FRAMES - 1, Math.floor(f * POP_FRAMES * 3));
  return cached(`c|${a.font}|${refStyle(a).content.length}|${value}|${k}|${textEpoch()}`, () => {
    const r = textCut(refStyle(a));
    const c = textCut(styleOf(a, String(value)));
    // l'arrivée : de 80 % à 100 % sur le premier tiers du temps de la valeur
    const e = k / (POP_FRAMES - 1);
    const s = 0.8 + 0.2 * (1 - Math.pow(1 - e, 3));
    const rings = pathToRings(c.d).map((ring) =>
      ring.map((p) => {
        const X = c.ox + p.x * c.bw + (r.fw - c.fw) / 2;
        const Y = c.oy + p.y * c.bh;
        const u = (X - r.ox) / r.bw;
        const v = (Y - r.oy) / r.bh;
        return { x: 0.5 + (u - 0.5) * s, y: 0.5 + (v - 0.5) * s };
      }),
    );
    return ringsToPath(rings, 1e-6, 55, false);
  });
}

export const countdown: Generator = {
  kind: 'countdown',
  name: 'Compte à rebours',
  cycle: 4,
  cycleName: 'Décompte',
  cycleWhat: 'Le décompte entier',
  params: [
    { key: 'from', name: 'Départ', title: 'La valeur affichée au début du décompte', type: 'int', min: 0, max: 9999, def: 3, reshape: true },
    { key: 'step', name: 'Pas', title: 'De combien la valeur descend à chaque battement', type: 'int', min: 1, max: 1000, def: 1, reshape: true },
    { key: 'font', name: 'Police', type: 'font', def: 'anton', reshape: true },
  ],
  gestures: (a) => [{ id: 'count', name: 'Décompte', note: `${values(a).length} valeurs par cycle`, params: ['from', 'step'] }],
  cut,
  ratio: (a) => textCut(refStyle(a)).ratio,
  legacyUnits: (a) => values(a).length,
  note: (a, sec) => {
    const n = values(a).length;
    return `${n} valeur${n > 1 ? 's' : ''}, ${(sec / n).toFixed(2)} s chacune`;
  },
  size: 0.42,
  glyphText: '3',
};
