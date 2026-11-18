import { fxOf, type Fx } from './fx';
import type { Doc, Layer, PaletteEdge } from './model';
import { addEntry, bare, isVarnish, listOf, varnishOf } from './palettes';

/**
 * Ce qu'on tire d'un emplacement du panneau des attributs : la teinte de l'objet, son vernis, sa matière
 * ou l'un de ses bords. Lâché sur un autre objet, celui-ci en reçoit une copie ; lâché sur la palette,
 * le réglage y devient une entrée à soi (« Mes matières », « Mes vernis », « Mes bords »).
 */
export type SlotPayload = { kind: 'tint' } | { kind: 'varnish' } | { kind: 'material' } | { kind: 'edge'; k: 'border' | 'glow' | 'trim' } | { kind: 'image' };
// `image` : l'image d'une photo, tirée pour devenir un revêtement (palette, forme, réglage) : l'atelier s'en charge.
export type PaletteTab = 'color' | 'material' | 'varnish' | 'edge';

const EDGE_WORD = { border: 'le bord', glow: 'la lueur', trim: 'le rognage' } as const;
/** Un réglage posé sur un autre objet y arrive actif, même s'il était désactivé sur le premier. */
const active = (fx: Fx): Fx => {
  const { off: _o, ...rest } = fx;
  return rest;
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Y a-t-il quelque chose à tirer de cet emplacement ? */
export function slotFilled(l: Layer, p: SlotPayload): boolean {
  if (p.kind === 'tint') return l.kind !== 'photo';
  if (p.kind === 'image') return l.kind === 'photo' && !!l.src;
  if (p.kind === 'varnish') return !!varnishOf(l);
  if (p.kind === 'material') return !!l.material;
  return !!l[p.k];
}

/** Ce que l'objet visé reçoit de l'objet d'origine, et la phrase qui le dit. Sans `patch`, rien ne change. */
export function slotOnto(from: Layer, to: Layer, p: SlotPayload): { patch?: Partial<Layer>; msg: string } {
  if (!slotFilled(from, p) || p.kind === 'image') return { msg: '' };
  if (p.kind === 'tint') {
    if (to.kind === 'photo') return { msg: 'Une photo n’a pas de couleur de fond : peins-la ou donne-lui un style' };
    return { patch: { guide: from.guide }, msg: `« ${to.name} » prend la teinte de « ${from.name} »` };
  }
  if (p.kind === 'varnish') {
    const v = active(varnishOf(from)!);
    return { patch: { fx: [...(to.fx ?? []).filter((x) => !isVarnish(x)), v] }, msg: `« ${to.name} » prend le vernis de « ${from.name} »` };
  }
  if (p.kind === 'material') {
    const m = active(from.material!);
    const d = fxOf(m.id);
    return {
      patch: { material: m, ...(d?.transparent && to.material?.id !== m.id ? { opacity: from.opacity ?? d.transparent } : {}) },
      msg: `« ${to.name} » prend la matière de « ${from.name} »`,
    };
  }
  if (to.kind === 'surface') return { msg: 'La surface de fond n’a pas de bord' };
  return { patch: { [p.k]: JSON.parse(JSON.stringify(from[p.k])) } as Partial<Layer>, msg: `« ${to.name} » prend ${EDGE_WORD[p.k]} de « ${from.name} »` };
}

/**
 * Le réglage de l'emplacement rangé dans la palette, sous `name`. Une matière ou un vernis y est lié à
 * l'objet (ses retouches suivent l'entrée) ; un bord y est copié. Sans `doc`, rien ne change : le réglage
 * y est déjà. `tab` est l'onglet de la palette à montrer, `entry` l'entrée qui porte le réglage (la nouvelle,
 * d'identifiant `id` s'il est donné, ou celle qui l'avait déjà).
 */
export function slotToPalette(d: Doc, from: Layer, p: SlotPayload, name: string, id?: string): { doc?: Doc; msg: string; tab: PaletteTab; entry?: string } {
  const fresh = (prefix: string) => `${prefix}${id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`}`;
  if (p.kind === 'tint') return { msg: `« ${d.guides[from.guide]?.name ?? 'Cette teinte'} » est déjà une couleur de la palette`, tab: 'color' };
  if (p.kind === 'image') return { msg: '', tab: 'color' };
  if (p.kind === 'varnish' || p.kind === 'material') {
    const tab = p.kind;
    const book = p.kind === 'material' ? 'Mes matières' : 'Mes vernis';
    const fx = p.kind === 'material' ? from.material : varnishOf(from);
    if (!fx) return { msg: '', tab };
    const list = listOf(d, p.kind);
    const known = list.find((e) => e.id === fx.ref) ?? list.find((e) => same(e.fx, bare(fx)));
    if (known) return { msg: `« ${known.name} » est déjà dans ${book}`, tab, entry: known.id };
    const eid = fresh(p.kind === 'material' ? 'm' : 'v');
    return { doc: addEntry(d, from.id, p.kind, name, eid), msg: `« ${name} » rangé dans ${book} : « ${from.name} » y est lié`, tab, entry: eid };
  }
  const v = from[p.k];
  if (!v) return { msg: '', tab: 'edge' };
  const known = (d.edges ?? []).find((e) => same(e[p.k], v));
  if (known) return { msg: `« ${known.name} » est déjà dans Mes bords`, tab: 'edge', entry: known.id };
  const e: PaletteEdge = { id: fresh('e'), name, [p.k]: JSON.parse(JSON.stringify(v)) };
  return { doc: { ...d, edges: [...(d.edges ?? []), e] }, msg: `« ${name} » rangé dans Mes bords`, tab: 'edge', entry: e.id };
}
