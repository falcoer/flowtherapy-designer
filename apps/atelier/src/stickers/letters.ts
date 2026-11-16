import { ringsToPath, type Ring } from '../cut';
import { textCut, lettersOf, type TextStyle } from '../text';
import { cached, numOf, type ActState, type Anim, type Context, type Generator } from './kit';

/**
 * Gestes des textes : le générateur ne dessine pas sa forme, il anime les lettres d'un objet texte (Generator.on = 'text').
 * Chaque lettre est faite des contours qui lui appartiennent (text.ts relève à quelle lettre va chaque contour) ;
 * chaque geste posé déplace, tourne, gonfle, cache ou dévoile les lettres qu'il vise, avec ses propres réglages.
 * Sans geste en cours ni effet gardé, la découpe est exactement celle du texte.
 */

/** Une lettre à l'instant : écart à sa place, rotation autour d'un pivot, échelle, pression (gonfle > 0, dégonfle < 0), cachée, dévoilée jusqu'à x. */
interface Pose {
  dx: number;
  dy: number;
  rot: number;
  px: number;
  py: number;
  scale: number;
  press: number;
  hide: boolean;
}

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const smooth = (v: number) => {
  const x = clamp(v);
  return x * x * (3 - 2 * x);
};
/** Petit aléa reproductible. */
const hash = (a: number, b = 0) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Les lettres visées par un réglage `letters` : toutes, celle du milieu, la dernière, ou une liste de numéros. */
export function lettersPicked(v: unknown, n: number): Set<number> {
  const s = typeof v === 'string' ? v : 'all';
  if (s === 'all' || !n) return new Set(Array.from({ length: n }, (_, i) => i));
  if (s === 'last') return new Set([n - 1]);
  if (s === 'mid') return new Set([Math.floor((n - 1) / 2)]);
  const out = new Set(
    s
      .split(',')
      .map(Number)
      .filter((i) => Number.isInteger(i) && i >= 0 && i < n),
  );
  return out.size ? out : new Set(Array.from({ length: n }, (_, i) => i));
}

/** Boîte de chaque lettre, en unités de hauteur de la boîte (x multiplié par les proportions). */
function boxes(rings: Ring[], owner: number[], n: number, ratio: number) {
  const b = Array.from({ length: n }, () => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }));
  rings.forEach((r, i) => {
    const k = owner[i]!;
    if (k < 0 || k >= n) return;
    for (const p of r) {
      const B = b[k]!;
      B.x0 = Math.min(B.x0, p.x * ratio);
      B.x1 = Math.max(B.x1, p.x * ratio);
      B.y0 = Math.min(B.y0, p.y);
      B.y1 = Math.max(B.y1, p.y);
    }
  });
  return b.map((B) => (Number.isFinite(B.x0) ? B : { x0: 0, y0: 0, x1: 0, y1: 0 }));
}

/** Coupe un contour au demi-plan x ≤ X (Sutherland-Hodgman) : la plume avance de gauche à droite. */
function clipX(r: Ring, X: number): Ring {
  const out: Ring = [];
  for (let i = 0; i < r.length; i++) {
    const a = r[i]!;
    const b = r[(i + 1) % r.length]!;
    const ia = a.x <= X;
    const ib = b.x <= X;
    if (ia) out.push(a);
    if (ia !== ib) out.push({ x: X, y: a.y + ((b.y - a.y) * (X - a.x)) / (b.x - a.x) });
  }
  return out;
}

/** Contour gonflé ou dégonflé : chaque point part le long de sa normale, les angles s'arrondissent quand il gonfle. */
function pressed(r: Ring, d: number, hole: boolean): Ring {
  const n = r.length;
  if (n < 4 || Math.abs(d) < 1e-5) return r;
  // normale sortante du contour, quel que soit son sens ; un trou se resserre quand la lettre gonfle
  let area = 0;
  for (let i = 0; i < n; i++) area += r[i]!.x * r[(i + 1) % n]!.y - r[(i + 1) % n]!.x * r[i]!.y;
  const sgn = (area > 0 ? 1 : -1) * (hole ? -1 : 1);
  let pts = r;
  // arrondi : quelques passes de lissage, d'autant plus que la lettre gonfle
  const passes = d > 0 ? Math.min(6, Math.round(d * 120)) : 0;
  for (let k = 0; k < passes; k++) pts = pts.map((p, i) => ({ x: (pts[(i - 1 + n) % n]!.x + 2 * p.x + pts[(i + 1) % n]!.x) / 4, y: (pts[(i - 1 + n) % n]!.y + 2 * p.y + pts[(i + 1) % n]!.y) / 4 }));
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n]!;
    const b = pts[(i + 1) % n]!;
    const [tx, ty] = [b.x - a.x, b.y - a.y];
    const L = Math.hypot(tx, ty) || 1;
    return { x: p.x + (sgn * ty * d) / L, y: p.y - (sgn * tx * d) / L };
  });
}

/** Avancée d'une boucle de geste, avec une entrée et une sortie douces (un quart de boucle). */
const envelope = (s: ActState) => (s.u <= 0 || s.u >= 1 ? 0 : Math.min(1, s.turns / 0.25, (s.of - s.turns) / 0.25));

/** Numéro de chaque découpe de texte, pour les clés de cache. */
const ids = new WeakMap<object, number>();
let lastId = 0;

function cut(_a: Anim, _phase: number, _g: unknown, ctx: Context): string {
  const t: TextStyle | undefined = ctx.host?.text;
  if (!t) return 'M0 0H1V1H0Z';
  const tc = textCut(t);
  const n = lettersOf(t.content).length;
  if (!n || !tc.rings.length) return tc.d;
  const ratio = tc.ratio;
  const em = tc.em;
  const B = boxes(tc.rings, tc.owner, n, ratio);
  const P: Pose[] = B.map((b) => ({ dx: 0, dy: 0, rot: 0, px: (b.x0 + b.x1) / 2, py: (b.y0 + b.y1) / 2, scale: 1, press: 0, hide: false }));
  let changed = false;
  const pick = (s: ActState, key: string) => lettersPicked(s.a[key] ?? DEFS.get(key), n);

  // ondulation : une vague passe sur les lettres, chacune monte et descend un peu après sa voisine
  for (const s of ctx.each('wave')) {
    const env = envelope(s);
    if (!env) continue;
    const amp = clamp(numOf(s.a, 'waveAmp', 0.4), 0, 1) * 0.35 * em * env;
    const len = Math.max(1, numOf(s.a, 'waveLen', 6));
    const on = pick(s, 'waveOn');
    for (const i of on) {
      const th = 2 * Math.PI * (s.turns - i / len);
      P[i]!.dy -= amp * Math.sin(th);
      // la lettre suit la pente de la vague (une lettre fait à peu près un demi-corps de large)
      P[i]!.rot += Math.atan((amp * 2 * Math.PI * Math.cos(th)) / (len * 0.55 * em)) * 0.6;
      changed = true;
    }
  }

  // gonflement et dégonflement : une pression par lettre, que chaque geste posé mène vers sa cible
  const press = new Float64Array(n);
  const puffs = [...ctx.each('puff').map((s) => ({ s, to: clamp(numOf(s.a, 'puffAmp', 0.5)), on: 'puffOn', back: (s.a.puffBack ?? 1) === 1 })), ...ctx.each('deflate').map((s) => ({ s, to: -clamp(numOf(s.a, 'deflAmp', 0.6)), on: 'deflOn', back: false }))].sort((p, q) => p.s.act.at - q.s.act.at);
  for (const { s, to, on, back } of puffs) {
    if (s.u <= 0) continue;
    // aller-retour : la lettre gonfle puis revient, comme une respiration
    const k = back ? Math.sin(Math.PI * s.u) : smooth(s.u);
    for (const i of pick(s, on)) press[i] = back ? press[i]! + to * k : press[i]! + (to - press[i]!) * k;
  }
  press.forEach((v, i) => {
    if (Math.abs(v) < 1e-4) return;
    P[i]!.press = v;
    changed = true;
  });

  // écriture : les lettres apparaissent (ou s'effacent) dans l'ordre de lecture, d'un trait continu ou une à une
  let reveal: number | null = null;
  let oneByOne = false;
  const writes = ctx.each('write');
  const started = writes.filter((s) => s.u > 0);
  const last = started[started.length - 1];
  if (last) {
    reveal = last.a.writeOut === 1 ? 1 - last.u : last.u;
    oneByOne = last.a.writeStep === 1;
  } else if (writes[0]) {
    // avant la première écriture : le texte attend d'apparaître (ou reste plein s'il doit s'effacer)
    reveal = writes[0].a.writeOut === 1 ? 1 : 0;
    oneByOne = writes[0].a.writeStep === 1;
  }
  if (reveal !== null && reveal >= 1) reveal = null;
  if (reveal !== null) changed = true;

  // clignotement : la lettre s'éteint par à-coups, comme une enseigne en panne
  for (const s of ctx.each('flicker')) {
    if (s.u <= 0) continue;
    const on = pick(s, 'flickOn');
    if (s.u >= 1) {
      if (s.a.flickEnd === 1) for (const i of on) P[i]!.hide = changed = true;
      continue;
    }
    const nerve = clamp(numOf(s.a, 'flickRate', 0.5));
    const dark = clamp(numOf(s.a, 'flickDark', 0.4), 0.05, 0.95);
    const steps = 4 + Math.round(nerve * 20);
    const k = Math.floor(s.turns * steps);
    for (const i of on) {
      // des rafales : quelques pas éteints d'affilée, puis de brefs sursauts
      const burst = hash(Math.floor(k / 3), i + 7) < dark * 0.6;
      const off = burst ? hash(k, i) < 0.75 : hash(k, i + 13) < dark * 0.35;
      if (off) P[i]!.hide = changed = true;
    }
  }

  // chute : la lettre se décroche et tombe (gravité), en tournant un peu, rebond possible à l'arrivée
  for (const s of ctx.each('fall')) {
    if (s.u <= 0) continue;
    const dist = Math.max(0.2, numOf(s.a, 'fallDist', 2)) * em;
    const spin = clamp(numOf(s.a, 'fallSpin', 0.3), -1, 1);
    const bounce = s.a.fallBounce === 1;
    const u = s.u;
    // un petit frisson avant de lâcher
    const shake = u < 0.12 ? Math.sin(u * 160) * 0.04 * (1 - u / 0.12) : 0;
    const v = clamp((u - 0.12) / 0.88);
    const y = bounce ? bounceOut(v) : v * v;
    for (const i of pick(s, 'fallOn')) {
      const p = P[i]!;
      p.dy += dist * y;
      p.rot += shake + spin * (Math.PI / 2) * (bounce ? Math.min(1, v * 1.4) : v);
      changed = true;
    }
  }

  // décrochage : un clou lâche, la lettre pivote autour de l'autre coin du haut et pendouille en se balançant
  for (const s of ctx.each('hang')) {
    if (s.u <= 0) continue;
    const right = s.a.hangSide === 1;
    const sway = clamp(numOf(s.a, 'hangSway', 0.6));
    const u = s.u;
    for (const i of pick(s, 'hangOn')) {
      const b = B[i]!;
      const [w, h] = [Math.max(0.01, b.x1 - b.x0), Math.max(0.01, b.y1 - b.y0)];
      // équilibre : le centre de la lettre se met sous le clou
      const eq = (Math.PI / 2 - Math.atan2(h, w)) * (right ? -1 : 1);
      const jolt = u < 0.1 ? Math.sin(u * 220) * 0.03 * (1 - u / 0.1) : 0;
      const v = clamp((u - 0.1) / 0.9);
      const swings = 1.5 + 3 * sway;
      const damp = 7 - 5 * sway;
      const th = eq * (1 - Math.cos(2 * Math.PI * swings * v) * Math.exp(-damp * v));
      const p = P[i]!;
      p.px = right ? b.x1 : b.x0;
      p.py = b.y0;
      p.rot += jolt + th;
      // la lettre glisse un peu en lâchant
      p.dy += 0.04 * em * smooth(v * 4);
      changed = true;
    }
  }

  if (!changed) return tc.d;
  // clé de cache : l'état de chaque lettre, arrondi à ce que l'œil voit
  const q = (v: number) => Math.round(v * 2000);
  let id = ids.get(tc);
  if (id === undefined) ids.set(tc, (id = ++lastId));
  const key = `L|${id}|${reveal === null ? '' : q(reveal)}|${oneByOne ? 1 : 0}|${P.map((p) => (p.hide ? 'h' : `${q(p.dx)},${q(p.dy)},${q(p.rot)},${q(p.px)},${q(p.py)},${q(p.press)}`)).join(';')}`;
  return cached(key, () => {
    // plume : jusqu'où chaque ligne est écrite (les lignes s'écrivent l'une après l'autre)
    const lineOf = tc.lines;
    const nLines = Math.max(1, ...lineOf.map((l) => l + 1));
    const span = Array.from({ length: nLines }, () => [Infinity, -Infinity]);
    B.forEach((b, i) => {
      const L = span[lineOf[i] ?? 0]!;
      L[0] = Math.min(L[0]!, b.x0);
      L[1] = Math.max(L[1]!, b.x1);
    });
    const widths = span.map(([a, b]) => (Number.isFinite(a!) ? b! - a! : 0));
    const total = widths.reduce((x, y) => x + y, 0) || 1;
    const penAt = (line: number) => {
      if (reveal === null) return Infinity;
      let before = 0;
      for (let l = 0; l < line; l++) before += widths[l]!;
      return span[line]![0]! + (reveal * total - before);
    };
    // lettre par lettre : la lettre apparaît d'un coup quand la plume atteint son milieu
    const shownLetter = (i: number) => reveal === null || (B[i]!.x0 + B[i]!.x1) / 2 <= penAt(lineOf[i] ?? 0);
    // trous des lettres (contour pris dans un autre) : ils se resserrent quand la lettre gonfle
    const holes = tc.rings.map((r, k) => {
      const q0 = r[0];
      if (!q0) return false;
      let inside = 0;
      tc.rings.forEach((o, j) => {
        if (j === k) return;
        let c = false;
        for (let i = 0, m = o.length - 1; i < o.length; m = i++) {
          const [a, b] = [o[i]!, o[m]!];
          if (a.y > q0.y !== b.y > q0.y && q0.x < ((b.x - a.x) * (q0.y - a.y)) / (b.y - a.y) + a.x) c = !c;
        }
        if (c) inside++;
      });
      return inside % 2 === 1;
    });
    const out: Ring[] = [];
    tc.rings.forEach((r0, k) => {
      const i = tc.owner[k]!;
      const p = P[i];
      if (p?.hide) return;
      let r: Ring = r0.map((pt) => ({ x: pt.x * ratio, y: pt.y }));
      if (reveal !== null) {
        if (oneByOne) {
          if (i >= 0 && !shownLetter(i)) return;
        } else {
          const line = i >= 0 ? (lineOf[i] ?? 0) : 0;
          r = clipX(r, penAt(line));
          if (r.length < 3) return;
        }
      }
      if (!p) {
        out.push(r);
        return;
      }
      if (p.press) {
        const b = B[i]!;
        // gonfle : la lettre s'épaissit et grandit un peu ; dégonfle : elle maigrit, s'affaisse sur sa base et penche
        r = pressed(r, p.press * (p.press > 0 ? 0.04 : 0.03) * em, holes[k]!);
        const sx = p.press > 0 ? 1 + 0.08 * p.press : 1 - 0.05 * p.press;
        const sy = p.press > 0 ? 1 + 0.08 * p.press : 1 + 0.45 * p.press;
        const cx = (b.x0 + b.x1) / 2;
        const cy = p.press > 0 ? (b.y0 + b.y1) / 2 : b.y1;
        const lean = p.press < 0 ? -p.press * 0.25 * (hash(i, 3) - 0.5) : 0;
        r = r.map((pt) => {
          const x = cx + (pt.x - cx) * sx + lean * (b.y1 - pt.y);
          return { x, y: cy + (pt.y - cy) * sy };
        });
      }
      if (p.rot || p.dx || p.dy) {
        const [c, s] = [Math.cos(p.rot), Math.sin(p.rot)];
        r = r.map((pt) => {
          const [x, y] = [pt.x - p.px, pt.y - p.py];
          return { x: p.px + x * c - y * s + p.dx, y: p.py + x * s + y * c + p.dy };
        });
      }
      out.push(r);
    });
    if (!out.length) return 'M0 0Z';
    return ringsToPath(
      out.map((r) => r.map((pt) => ({ x: pt.x / ratio, y: pt.y }))),
      1e-6,
      55,
      false,
    );
  });
}

function bounceOut(v: number): number {
  const [n, d] = [7.5625, 2.75];
  if (v < 1 / d) return n * v * v;
  if (v < 2 / d) return n * (v -= 1.5 / d) * v + 0.75;
  if (v < 2.5 / d) return n * (v -= 2.25 / d) * v + 0.9375;
  return n * (v -= 2.625 / d) * v + 0.984375;
}

const DEFS = new Map<string, unknown>();
export const letters: Generator = {
  kind: 'letters',
  name: 'Texte',
  on: 'text',
  cycle: 1,
  cycleName: 'Boucle',
  cycleWhat: 'Une vague, une série de clignements',
  params: [
    { key: 'waveOn', name: 'Lettres', type: 'letters', def: 'all' },
    { key: 'waveAmp', name: 'Hauteur', title: 'Jusqu’où les lettres montent et descendent', type: 'range', min: 0, max: 1, def: 0.4 },
    { key: 'waveLen', name: 'Longueur', title: 'Nombre de lettres par vague', type: 'steps', min: 2, max: 16, def: 6 },
    { key: 'writeStep', name: 'Lettre par lettre', title: 'Chaque lettre apparaît d’un coup, au lieu d’un trait continu', type: 'check', on: 1, off: 0, def: 0 },
    { key: 'writeOut', name: 'Effacer', title: 'Le texte s’efface au lieu d’apparaître', type: 'check', on: 1, off: 0, def: 0 },
    { key: 'puffOn', name: 'Lettres', type: 'letters', def: 'all' },
    { key: 'puffAmp', name: 'Gonflé', title: 'Jusqu’où les lettres gonflent', type: 'range', min: 0, max: 1, def: 0.5 },
    { key: 'puffBack', name: 'Respire', title: 'Les lettres gonflent puis reviennent ; sinon elles restent gonflées', type: 'check', on: 1, off: 0, def: 1 },
    { key: 'deflOn', name: 'Lettres', type: 'letters', def: 'all' },
    { key: 'deflAmp', name: 'Dégonflé', title: 'Jusqu’où les lettres s’affaissent', type: 'range', min: 0, max: 1, def: 0.6 },
    { key: 'flickOn', name: 'Lettres', type: 'letters', def: 'mid' },
    { key: 'flickRate', name: 'Nervosité', title: 'Des à-coups lents ou nerveux', type: 'range', min: 0, max: 1, def: 0.5 },
    { key: 'flickDark', name: 'Panne', title: 'Part du temps où la lettre est éteinte', type: 'range', min: 0.05, max: 0.95, def: 0.4 },
    { key: 'flickEnd', name: 'Reste éteinte', title: 'À la fin du geste, la lettre reste éteinte', type: 'check', on: 1, off: 0, def: 0 },
    { key: 'fallOn', name: 'Lettres', type: 'letters', def: 'last' },
    { key: 'fallDist', name: 'Chute', title: 'Hauteur de la chute, en corps de texte', type: 'range', min: 0.5, max: 8, def: 2 },
    { key: 'fallSpin', name: 'Bascule', title: 'La lettre tourne en tombant (négatif : vers la gauche)', type: 'range', min: -1, max: 1, def: 0.3 },
    { key: 'fallBounce', name: 'Rebond', title: 'La lettre rebondit en touchant le sol', type: 'check', on: 1, off: 0, def: 0 },
    { key: 'hangOn', name: 'Lettres', type: 'letters', def: 'last' },
    { key: 'hangSide', name: 'Tenue à droite', title: 'Le clou de droite tient, la lettre bascule vers la gauche', type: 'check', on: 1, off: 0, def: 0 },
    { key: 'hangSway', name: 'Balancement', title: 'La lettre se balance plus ou moins longtemps avant de s’immobiliser', type: 'range', min: 0, max: 1, def: 0.6 },
  ],
  gestures: () => [
    { id: 'wave', name: 'Ondulation', note: 'une vague passe', loop: true, params: ['waveOn', 'waveAmp', 'waveLen'] },
    { id: 'write', name: 'Écriture', note: 'apparaît à la plume', len: 2, params: ['writeStep', 'writeOut'] },
    { id: 'puff', name: 'Gonflement', note: 'les lettres gonflent', params: ['puffOn', 'puffAmp', 'puffBack'] },
    { id: 'deflate', name: 'Dégonflement', note: 's’affaissent', params: ['deflOn', 'deflAmp'] },
    { id: 'flicker', name: 'Clignotement', note: 'enseigne en panne', loop: true, params: ['flickOn', 'flickRate', 'flickDark', 'flickEnd'] },
    { id: 'fall', name: 'Chute', note: 'la lettre tombe', params: ['fallOn', 'fallDist', 'fallSpin', 'fallBounce'] },
    { id: 'hang', name: 'Décrochage', note: 'lâche et pendouille', len: 2, params: ['hangOn', 'hangSide', 'hangSway'] },
  ],
  cut,
  ratio: () => 1,
};

for (const p of letters.params) DEFS.set(p.key, p.def);
