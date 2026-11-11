import type { Fx } from './fx';
import type { Doc, Layer } from './model';

/**
 * Couleurs importées (avec un kit ou un objet de la bibliothèque) : elles quittent la palette dès que plus
 * aucun élément ne s'en sert. Les objets désignent leurs couleurs par numéro de guide : retirer un guide
 * renumérote tous ceux qui suivent, partout où un numéro est rangé.
 */
const fxGuides = (x: Fx | undefined) => x?.guides ?? [];

/** Tous les numéros de guide qu'utilise une couche. */
function layerGuides(l: Layer): number[] {
  return [
    l.guide,
    ...l.strokes.map((s) => s.guide),
    ...(l.border ? [l.border.guide, ...(l.border.guide2 !== undefined ? [l.border.guide2] : [])] : []),
    ...(l.glow ? [l.glow.guide] : []),
    ...(l.look?.guides ?? []),
    ...fxGuides(l.look?.draw),
    ...fxGuides(l.material),
    ...(l.fx ?? []).flatMap(fxGuides),
  ];
}

const remapFx = (x: Fx, m: (i: number) => number): Fx => (x.guides ? { ...x, guides: x.guides.map(m) } : x);

function remapLayer(l: Layer, m: (i: number) => number): Layer {
  return {
    ...l,
    guide: m(l.guide),
    strokes: l.strokes.map((s) => ({ ...s, guide: m(s.guide) })),
    ...(l.border ? { border: { ...l.border, guide: m(l.border.guide), ...(l.border.guide2 !== undefined ? { guide2: m(l.border.guide2) } : {}) } } : {}),
    ...(l.glow ? { glow: { ...l.glow, guide: m(l.glow.guide) } } : {}),
    ...(l.look ? { look: { ...l.look, guides: l.look.guides.map(m), ...(l.look.draw ? { draw: remapFx(l.look.draw, m) } : {}) } } : {}),
    ...(l.material ? { material: remapFx(l.material, m) } : {}),
    ...(l.fx ? { fx: l.fx.map((x) => remapFx(x, m)) } : {}),
  };
}

/**
 * Retire les couleurs importées que plus rien n'utilise (ni un objet, ni une matière ou un vernis de la palette,
 * ni les numéros de `keep`, comme la couleur du pinceau). Renvoie null quand il n'y a rien à retirer ;
 * sinon le document renuméroté et la correspondance ancien numéro → nouveau.
 */
export function pruneImported(d: Doc, keep: number[] = []): { doc: Doc; map: (i: number) => number } | null {
  if (!d.guides.some((g) => g.from && !g.role)) return null;
  const used = new Set<number>(keep);
  for (const l of d.layers) for (const i of layerGuides(l)) used.add(i);
  for (const e of [...(d.materials ?? []), ...(d.varnishes ?? [])]) for (const i of fxGuides(e.fx)) used.add(i);
  const drop = d.guides.map((g, i) => !!g.from && !g.role && !used.has(i));
  if (!drop.some(Boolean)) return null;
  const to: number[] = [];
  let n = 0;
  for (let i = 0; i < d.guides.length; i++) to.push(drop[i] ? -1 : n++);
  // un numéro qui ne pointe plus nulle part (hors palette) garde la même place relative
  const map = (i: number) => (i >= 0 && i < to.length && to[i]! >= 0 ? to[i]! : Math.max(0, Math.min(n - 1, i - drop.slice(0, Math.max(0, i)).filter(Boolean).length)));
  return {
    doc: {
      ...d,
      guides: d.guides.filter((_, i) => !drop[i]),
      layers: d.layers.map((l) => remapLayer(l, map)),
      ...(d.materials ? { materials: d.materials.map((e) => ({ ...e, fx: remapFx(e.fx, map) })) } : {}),
      ...(d.varnishes ? { varnishes: d.varnishes.map((e) => ({ ...e, fx: remapFx(e.fx, map) })) } : {}),
    },
    map,
  };
}
