import { buffer, drawBlurred, rng, type Target } from './brush';
import { guideColor, type Guide, type Stroke } from './model';

/**
 * Moteur Ramification, autres rendus que les Ramures : l'Électricité (arcs brisés qui fourchent,
 * cœur blanc et halo de la couleur) et le Givre (cristaux à bras réguliers, aiguilles à 60°).
 * Les réglages sont ceux des Ramures : `branches` = bras ou arcs, `converge` = désordre, `grow` = poussée.
 */
export type Ramify = 'bolt' | 'frost';

type Seg = { x1: number; y1: number; x2: number; y2: number; w: number; f: number };

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
/** Teinte poussée vers le blanc (k = 0 : la couleur, 1 : blanc). */
function toWhite(c: string, k: number, a = 1) {
  const n = parseInt(c.slice(1, 7), 16);
  const f = (v: number) => Math.round(v + (255 - v) * k);
  return `rgba(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)},${a})`;
}

/** Points du geste en pixels, et départs : le point touché puis tous les `gap` le long du geste. */
function gesture(s: Stroke, t: Target, gap: number) {
  const pts = s.pts.map((p) => ({ x: p.x * t.pw, y: p.y * t.ph, p: p.p ?? 0.7 }));
  const seeds: Array<{ x: number; y: number; p: number; a: number }> = [];
  const dir = (i: number) => {
    const a = pts[Math.max(0, i - 2)]!;
    const b = pts[Math.min(pts.length - 1, i + 2)]!;
    return Math.hypot(b.x - a.x, b.y - a.y) > 0.5 ? Math.atan2(b.y - a.y, b.x - a.x) : -Math.PI / 2;
  };
  seeds.push({ ...pts[0]!, a: dir(0) });
  let acc = 0;
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
    acc += d;
    total += d;
    if (acc > gap) {
      seeds.push({ ...pts[i]!, a: dir(i) });
      acc = 0;
    }
  }
  return { pts, seeds, total };
}

/** Le geste rééchantillonné à pas régulier. */
function resample(pts: Array<{ x: number; y: number }>, step: number) {
  const out = [{ x: pts[0]!.x, y: pts[0]!.y }];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1]!, pts[i]!];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    let d = step - carry;
    while (d <= len) {
      out.push({ x: a.x + ((b.x - a.x) * d) / len, y: a.y + ((b.y - a.y) * d) / len });
      d += step;
    }
    carry = len - (d - step);
  }
  const last = pts[pts.length - 1]!;
  if (Math.hypot(last.x - out[out.length - 1]!.x, last.y - out[out.length - 1]!.y) > step * 0.3) out.push({ x: last.x, y: last.y });
  return out;
}

/** Trace les segments par paquets de même largeur et même couleur (un chemin par paquet). */
function strokeSegs(x: CanvasRenderingContext2D, segs: Seg[], width: (s: Seg) => number, color: (s: Seg) => string) {
  const groups = new Map<string, Seg[]>();
  for (const s of segs) {
    const k = `${color(s)}|${Math.round(width(s) * 4) / 4}`;
    let l = groups.get(k);
    if (!l) groups.set(k, (l = []));
    l.push(s);
  }
  for (const [k, l] of groups) {
    const [c, w] = k.split('|');
    x.strokeStyle = c!;
    x.lineWidth = Math.max(0.3, Number(w));
    x.beginPath();
    for (const s of l) {
      x.moveTo(s.x1, s.y1);
      x.lineTo(s.x2, s.y2);
    }
    x.stroke();
  }
}

/** Couleur du guide quantifiée le long du trait (pour regrouper les segments). */
const q8 = (f: number) => Math.round(clamp(f) * 8) / 8;

export function ramifyInk(dst: CanvasRenderingContext2D, s: Stroke, guides: Guide[], t: Target) {
  if (s.ramify === 'frost') return frost(dst, s, guides, t);
  return bolt(dst, s, guides, t);
}

/**
 * Électricité : touché, des arcs partent du point ; tracé, le geste devient un éclair brisé d'où
 * partent des fourches. Le resserrage (`focus`) dit où vont les arcs : 0 = dans toutes les
 * directions (boule de plasma), 1 = la foudre tombe du point touché et les fourches suivent le geste.
 * Chaque arc garde son cap mais
 * zigzague (plus fort avec le désordre), se divise, s'amincit. Rendu : halo flou de la couleur,
 * corps coloré, cœur presque blanc.
 */
function bolt(dst: CanvasRenderingContext2D, s: Stroke, guides: Guide[], t: Target) {
  const r = rng(s.seed);
  const g = guides[s.guide];
  const grow = Math.max(0.05, Math.min(1, s.grow ?? 1));
  const R = s.size * t.pxPerMin * 4;
  const w0 = Math.max(0.8, s.size * t.pxPerMin * 0.12);
  const nb = Math.max(1, Math.round(s.branches ?? 5));
  const chaos = clamp(s.converge ?? 0.3);
  const foc = clamp(s.focus ?? 0);
  const { pts, seeds, total } = gesture(s, t, R * 0.45);
  const segs: Seg[] = [];
  const seg = () => R * (0.035 + 0.045 * r());
  const zig = 0.5 + 1.1 * chaos;
  const arc = (x: number, y: number, a: number, len: number, w: number, depth: number, f0: number) => {
    let d = 0;
    let head = a;
    while (d < len && segs.length < 12000) {
      // resserré, l'arc serpente davantage mais revient vers son cap : il ne s'enroule pas
      head += (r() - 0.5) * (0.18 + 0.45 * foc);
      head += Math.atan2(Math.sin(a - head), Math.cos(a - head)) * 0.18 * foc;
      const l = Math.min(seg(), len - d);
      const aa = head + (r() - 0.5) * zig;
      const nx = x + Math.cos(aa) * l;
      const ny = y + Math.sin(aa) * l;
      const k = d / len;
      segs.push({ x1: x, y1: y, x2: nx, y2: ny, w: w * (1 - 0.6 * k), f: f0 + (1 - f0) * k });
      x = nx;
      y = ny;
      d += l;
      if (depth < 3 && r() < 0.06 + 0.08 * chaos) {
        const side = r() < 0.5 ? -1 : 1;
        arc(x, y, head + side * (0.3 + 0.6 * r()) * (1 - 0.5 * foc), (len - d) * (0.35 + 0.35 * r()), w * (1 - 0.6 * k) * 0.55, depth + 1, f0 + (1 - f0) * k);
      }
    }
  };
  if (pts.length > 2 && total > R * 0.25) {
    // tronc : le geste, brisé tout du long ; l'écart au geste erre puis revient (marche au hasard rappelée)
    const path = resample(pts, R * 0.05);
    let off = 0;
    for (let i = 1; i < path.length; i++) {
      const [a, b] = [path[i - 1]!, path[i]!];
      const nx0 = -(b.y - a.y) / (Math.hypot(b.x - a.x, b.y - a.y) || 1);
      const ny0 = (b.x - a.x) / (Math.hypot(b.x - a.x, b.y - a.y) || 1);
      const prev = off;
      off = i === path.length - 1 ? 0 : off * 0.8 + (r() - 0.5) * R * 0.09 * zig;
      const u = i / (path.length - 1);
      segs.push({ x1: a.x + nx0 * prev, y1: a.y + ny0 * prev, x2: b.x + nx0 * off, y2: b.y + ny0 * off, w: w0 * (1.25 - 0.45 * u), f: u * 0.5 });
    }
    // fourches le long du tronc, penchées vers l'avant
    for (const sd of seeds.slice(1)) {
      for (let k = 0; k < Math.max(1, nb - 1); k++) {
        const side = r() < 0.5 ? -1 : 1;
        arc(sd.x, sd.y, sd.a + side * (0.35 + 0.8 * r()) * (1 - 0.6 * foc), R * (0.3 + 0.45 * r()) * grow * (1 + 0.5 * chaos), w0 * (0.6 + 0.4 * sd.p), 1, 0.3);
      }
    }
  } else {
    // touché : les arcs s'ouvrent en éventail autour du bas, du cercle entier (plasma) à la chute droite (foudre)
    const sd = seeds[0]!;
    const spread = Math.PI * 2 * (1 - foc) ** 1.5;
    const a0 = foc < 0.05 ? r() * Math.PI * 2 : Math.PI / 2;
    for (let k = 0; k < nb; k++) {
      // les traits d'avant le resserrage (sans `focus`) gardent leurs angles d'origine
      const a = s.focus === undefined ? a0 + (k / nb) * Math.PI * 2 + (r() - 0.5) * 0.9 : a0 + ((k + 0.5) / nb - 0.5) * spread + (r() - 0.5) * (0.9 * (1 - foc) + 0.35);
      arc(sd.x, sd.y, a, R * (0.55 + 0.45 * r()) * (1 + 0.8 * foc) * grow * (1 + 0.5 * chaos), w0 * (0.8 + 0.5 * sd.p), 0, 0);
    }
  }
  if (!segs.length) return;
  const { c: buf, ctx: bx } = buffer('a', t.pw, t.ph);
  const { c: glow, ctx: gx } = buffer('b', t.pw, t.ph);
  for (const x of [bx, gx]) {
    x.lineCap = 'round';
    x.lineJoin = 'round';
  }
  // halo : la couleur, large et floue, s'additionne
  strokeSegs(gx, segs, (q) => q.w * 5, (q) => guideColor(g, q8(q.f)));
  bx.globalAlpha = 0.55;
  drawBlurred(bx, glow, Math.max(2, w0 * 5));
  bx.globalAlpha = 1;
  // corps coloré puis cœur blanc
  strokeSegs(bx, segs, (q) => q.w * 1.7, (q) => toWhite(guideColor(g, q8(q.f)), 0.25));
  strokeSegs(bx, segs, (q) => q.w * 0.55, () => 'rgba(255,255,255,0.95)');
  dst.save();
  dst.globalAlpha = s.opacity;
  dst.drawImage(buf, 0, 0);
  dst.restore();
}

/**
 * Givre : des cristaux poussent du point touché et le long du geste. Chaque cristal a des bras
 * réguliers ; sur chaque bras, des aiguilles partent par paires à 60°, de plus en plus courtes vers
 * la pointe, et portent à leur tour des aiguilles plus fines. Le désordre casse la symétrie
 * (angles, longueurs, aiguilles manquantes). Un seul bras suit le sens du geste (fougère).
 */
function frost(dst: CanvasRenderingContext2D, s: Stroke, guides: Guide[], t: Target) {
  const r = rng(s.seed);
  const g = guides[s.guide];
  const grow = Math.max(0.05, Math.min(1, s.grow ?? 1));
  const R = s.size * t.pxPerMin * 3;
  const w0 = Math.max(0.6, s.size * t.pxPerMin * 0.07);
  const nb = Math.max(1, Math.round(s.branches ?? 6));
  const chaos = clamp(s.converge ?? 0.1);
  const { pts, seeds: all, total } = gesture(s, t, R * 1.1);
  const traced = pts.length > 2 && total > R * 0.3;
  const segs: Seg[] = [];
  const tips: Array<[number, number, number]> = [];
  const maxDepth = nb > 8 ? 1 : 2;
  const cap = 20000;
  const needle = (x: number, y: number, a: number, len: number, w: number, depth: number, f0: number, spine?: Array<{ x: number; y: number }>) => {
    // l'aiguille file presque droit : quelques segments, à peine déviés par le désordre ; la tige d'une fronde suit le geste
    const pts: Array<[number, number]> = [[x, y]];
    const dirs: number[] = [];
    if (spine) {
      for (let k = 1; k < spine.length; k++) {
        pts.push([spine[k]!.x, spine[k]!.y]);
        dirs.push(Math.atan2(spine[k]!.y - spine[k - 1]!.y, spine[k]!.x - spine[k - 1]!.x));
      }
    } else {
      const n0 = Math.max(2, Math.round(len / Math.max(2, R * 0.04)));
      let aa = a;
      for (let k = 1; k <= n0; k++) {
        aa += (r() - 0.5) * 0.12 * chaos;
        const [px, py] = pts[k - 1]!;
        pts.push([px + (Math.cos(aa) * len) / n0, py + (Math.sin(aa) * len) / n0]);
        dirs.push(aa);
      }
    }
    const n = pts.length - 1;
    if (n < 1) return;
    for (let k = 1; k <= n; k++) {
      const u = k / n;
      segs.push({ x1: pts[k - 1]![0], y1: pts[k - 1]![1], x2: pts[k]![0], y2: pts[k]![1], w: w * (1 - 0.7 * u), f: f0 + (1 - f0) * u });
    }
    const end = pts[n]!;
    if (depth === 0 || r() < 0.15) tips.push([end[0], end[1], w]);
    if (depth >= maxDepth || len < R * 0.05) return;
    // aiguilles filles par paires, plus longues près de la base ; une tige porte des aiguilles de longueur égale
    const gap = spine ? R * 0.09 : len * (depth === 0 ? 0.15 + 0.05 * r() : 0.2 + 0.08 * r());
    for (let d = gap * (0.6 + 0.6 * r()); d < len * 0.92 && segs.length < cap; d += gap * (0.8 + 0.5 * r() * (1 + chaos))) {
      const u = d / len;
      const i = Math.min(n, Math.max(1, Math.round(u * n)));
      const [px, py] = pts[i]!;
      const rest = spine ? R * 0.42 * grow * (1 - 0.5 * u) : (len - d) * (depth === 0 ? 0.48 : 0.4);
      for (const side of [-1, 1]) {
        if (r() < chaos * 0.45) continue;
        const ang = dirs[i - 1]! + side * (Math.PI / 3) * (1 + (r() - 0.5) * 0.5 * chaos);
        needle(px, py, ang, rest * (1 + (r() - 0.5) * chaos), w * 0.6, depth + 1, f0 + (1 - f0) * u);
      }
    }
  };
  // tracé : le geste devient une tige de fronde ; avec plusieurs bras, des étoiles s'y accrochent
  if (traced) needle(pts[0]!.x, pts[0]!.y, 0, total, w0 * 1.2, 0, 0, resample(pts, Math.max(2, R * 0.04)));
  const seeds = traced ? (nb > 1 ? all.slice(1) : []) : all.slice(0, 1);
  for (const sd of seeds) {
    if (segs.length >= cap) break;
    // un bras seul suit le geste ; sinon les bras se répartissent en étoile
    const a0 = nb === 1 ? sd.a : r() * Math.PI * 2;
    const L = R * (0.6 + 0.3 * r()) * grow * (0.6 + 0.4 * sd.p) * (traced ? 0.65 : nb === 1 ? 1.5 : 1);
    for (let k = 0; k < nb; k++) {
      const a = a0 + (k / nb) * Math.PI * 2 + (r() - 0.5) * 0.6 * chaos;
      needle(sd.x, sd.y, a, L * (1 + (r() - 0.5) * 0.7 * chaos), w0 * (0.8 + 0.4 * sd.p), 0, 0);
    }
  }
  if (!segs.length) return;
  const { c: buf, ctx: bx } = buffer('a', t.pw, t.ph);
  const { c: glow, ctx: gx } = buffer('b', t.pw, t.ph);
  for (const x of [bx, gx]) {
    x.lineCap = 'round';
    x.lineJoin = 'round';
  }
  // lueur froide autour des cristaux, puis les aiguilles, éclaircies vers la pointe
  strokeSegs(gx, segs, (q) => q.w * 3, (q) => toWhite(guideColor(g, q8(q.f)), 0.3));
  bx.globalAlpha = 0.35;
  drawBlurred(bx, glow, Math.max(1.5, w0 * 3));
  bx.globalAlpha = 1;
  strokeSegs(bx, segs, (q) => q.w, (q) => toWhite(guideColor(g, q8(q.f)), 0.05 + 0.35 * q8(q.f), 0.95));
  // éclats : petites croix de lumière au bout de quelques aiguilles
  bx.strokeStyle = 'rgba(255,255,255,0.9)';
  for (const [x, y, w] of tips) {
    if (r() > 0.3) continue;
    const l = Math.max(1.5, w * (1.5 + 2 * r()));
    bx.lineWidth = Math.max(0.4, w * 0.35);
    bx.beginPath();
    bx.moveTo(x - l, y);
    bx.lineTo(x + l, y);
    bx.moveTo(x, y - l);
    bx.lineTo(x, y + l);
    bx.stroke();
  }
  dst.save();
  dst.globalAlpha = s.opacity;
  dst.drawImage(buf, 0, 0);
  dst.restore();
}
