import { ringsToPath } from '../cut';
import type { Pt } from '../model';
import { silhouetteRings } from '../silhouettes';
import { cached, numOf, type Anim, type Generator, type Progress, type Warp } from './kit';

/**
 * Gestes de la forme « Goutte » (Generator.on = « shape:drop ») : la goutte s'affaisse au bas de sa boîte et s'étale en flaque,
 * plus large que la goutte (elle déborde de la boîte sur les côtés).
 * Au repos la découpe est celle de la forme, telle quelle ; le geste fini, la flaque reste.
 */
const N = 120;
const FRAMES = 48;
const smooth = (x: number) => {
  const u = Math.max(0, Math.min(1, x));
  return u * u * (3 - 2 * u);
};

/** Le contour de la goutte, redécoupé en N points réguliers à partir de sa pointe. */
function dropRing(): Pt[] {
  const ring = silhouetteRings('drop')[0] ?? [];
  if (ring.length < 3) return [];
  const top = ring.reduce((b, p, i) => (p.y < ring[b]!.y ? i : b), 0);
  const pts = ring.map((_, i) => ring[(top + i) % ring.length]!);
  const lens = pts.map((p, i) => Math.hypot(pts[(i + 1) % pts.length]!.x - p.x, pts[(i + 1) % pts.length]!.y - p.y));
  const total = lens.reduce((s, l) => s + l, 0) || 1;
  const out: Pt[] = [];
  let [k, run] = [0, 0];
  for (let i = 0; i < N; i++) {
    const d = (i / N) * total;
    while (k < pts.length - 1 && run + lens[k]! < d) run += lens[k++]!;
    const [p, q] = [pts[k]!, pts[(k + 1) % pts.length]!];
    const t = lens[k] ? (d - run) / lens[k]! : 0;
    out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  }
  return out;
}

/** Avancée du geste, ramenée à ses images. */
const frameOf = (g: Progress) => Math.round(Math.max(0, Math.min(1, g('spread'))) * FRAMES) / FRAMES;

/** La flaque à une avancée : sa demi-largeur, son épaisseur et la hauteur de son centre (boîte 0..1 ; elle déborde sur les côtés). */
function puddleAt(a: Anim, u: number) {
  const wide = Math.max(1, Math.min(3, numOf(a, 'wide', 2)));
  // la goutte s'affaisse d'abord sur sa largeur, puis la flaque gagne ; elle dépasse un peu puis revient (la tension de l'eau)
  const grow = smooth((u - 0.3) / 0.7) + 0.06 * Math.sin(Math.PI * smooth((u - 0.6) / 0.4));
  const ry = 0.09 / Math.sqrt(wide);
  return { rx: 0.5 + 0.5 * (wide - 1) * grow, ry, cy: 1 - ry };
}

function ringAt(a: Anim, u: number): Pt[] {
  const drop = dropRing();
  if (!u) return drop;
  const { rx, ry, cy } = puddleAt(a, u);
  // le sens du contour de la goutte décide du sens de celui de la flaque
  const area = drop.reduce((s, p, i) => s + p.x * drop[(i + 1) % N]!.y - drop[(i + 1) % N]!.x * p.y, 0);
  const dir = area >= 0 ? 1 : -1;
  const e = smooth(u / 0.6);
  return drop.map((p, i) => {
    const th = -Math.PI / 2 + dir * (i / N) * 2 * Math.PI;
    const q = { x: 0.5 + rx * Math.cos(th), y: cy + ry * Math.sin(th) };
    // la pointe descend plus vite que le ventre
    const k = Math.min(1, e * (1 + 0.6 * (1 - p.y)));
    return { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k };
  });
}

function cut(a: Anim, _phase: number, g: Progress): string {
  const u = frameOf(g);
  // au repos : la découpe de la forme, la même que sans animation
  if (!u) return cached('pd|rest', () => ringsToPath(silhouetteRings('drop'), 0.0008, 30));
  return cached(`pd|${a.wide ?? ''}|${u}`, () => ringsToPath([ringAt(a, u)], 0.0006, 40));
}

const even = (n: number) => Array.from({ length: n + 1 }, (_, i) => i / n);
/**
 * Déformation de la surface (Generator.warp) : la boîte de la goutte s'écrase vers celle de la flaque, au même pas que son contour
 * (la pointe plus vite que le ventre) ; la teinte, le dégradé, l'image et la peinture s'étalent avec l'eau.
 */
function warp(a: Anim, _phase: number, g: Progress): Warp | null {
  const u = frameOf(g);
  if (!u) return null;
  const { rx, ry, cy } = puddleAt(a, u);
  const e = smooth(u / 0.6);
  const map = (x: number, y: number): [number, number] => {
    const k = Math.min(1, e * (1 + 0.6 * (1 - y)));
    const [X, Y] = [0.5 + (x - 0.5) * 2 * rx, cy - ry + y * 2 * ry];
    return [x + (X - x) * k, y + (Y - y) * k];
  };
  return { key: `pw|${a.wide ?? ''}|${u}`, us: even(8), vs: even(16), map };
}

export const puddle: Generator = {
  kind: 'puddle',
  name: 'Goutte',
  on: 'shape:drop',
  cycle: 2,
  cycleName: 'Chute',
  cycleWhat: 'La goutte tombe et s’étale',
  params: [{ key: 'wide', name: 'Étalement', title: 'Largeur de la flaque, en largeurs de goutte', type: 'range', min: 1, max: 3, def: 2 }],
  gestures: () => [{ id: 'spread', name: 'Flaque', note: 'tombe et s’étale', params: ['wide'], len: 0.5, start: false }],
  cut,
  warp,
  // un os de la pointe au ventre : un objet posé sur la goutte descend avec elle
  skeleton: (a, _phase, g) => {
    const r = ringAt(a, frameOf(g));
    const top = r[0] ?? { x: 0.5, y: 0 };
    const low = r[Math.floor(N / 2)] ?? { x: 0.5, y: 1 };
    return [
      [
        [low.x, low.y],
        [top.x, top.y],
      ],
    ];
  },
  ratio: () => 1,
};
