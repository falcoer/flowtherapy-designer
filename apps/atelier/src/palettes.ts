import { applyPixelFx, fxOf, type Fx } from './fx';
import type { Doc, Layer, PaletteMatter } from './model';

/**
 * Palettes de matières et de vernis : comme une couleur de la palette, une entrée est partagée par
 * les objets qui y sont liés (Fx.ref). Retoucher la matière d'un objet lié retouche l'entrée et
 * tous les autres objets liés. Une matière ne porte jamais de couleur : la teinte reste celle de l'objet.
 */
export type MatterKind = 'material' | 'varnish';

export const isVarnish = (x: Fx) => fxOf(x.id)?.group === 'lumiere';
/** Le vernis de l'objet (un seul). */
export const varnishOf = (l: Layer) => (l.fx ?? []).find(isVarnish);
export const listOf = (d: Doc, k: MatterKind): PaletteMatter[] => (k === 'material' ? d.materials : d.varnishes) ?? [];
const withList = (d: Doc, k: MatterKind, list: PaletteMatter[]): Doc => (k === 'material' ? { ...d, materials: list } : { ...d, varnishes: list });
const bare = (x: Fx): Fx => {
  const { ref: _r, preset: _p, ...rest } = x;
  return rest;
};

/** Le réglage d'une entrée, lié, prêt à poser sur un objet. */
export const linked = (e: PaletteMatter): Fx => ({ ...e.fx, ref: e.id, preset: e.name });

/** Ce qu'on change sur l'objet pour lui poser l'entrée. */
export function applyPatch(l: Layer, k: MatterKind, e: PaletteMatter): Partial<Layer> {
  if (k === 'material') {
    const d = fxOf(e.fx.id);
    return { material: linked(e), ...(d?.transparent && l.material?.id !== e.fx.id ? { opacity: d.transparent } : {}) };
  }
  return { fx: [...(l.fx ?? []).filter((x) => !isVarnish(x)), linked(e)] };
}

/** Ajoute le réglage de l'objet à la palette et l'y lie. */
export function addEntry(d: Doc, layerId: string, k: MatterKind, name: string): Doc {
  const l = d.layers.find((x) => x.id === layerId);
  const fx = l && (k === 'material' ? l.material : varnishOf(l));
  if (!l || !fx) return d;
  const e: PaletteMatter = { id: `${k === 'material' ? 'm' : 'v'}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name, fx: bare(fx) };
  const next = withList(d, k, [...listOf(d, k), e]);
  return { ...next, layers: next.layers.map((x) => (x.id === layerId ? { ...x, ...applyPatch(x, k, e) } : x)) };
}

/** Après une retouche de l'objet : son entrée liée et les autres objets liés suivent. */
export function syncRefs(d: Doc, layerId: string): Doc {
  const me = d.layers.find((x) => x.id === layerId);
  if (!me) return d;
  let out = d;
  for (const k of ['material', 'varnish'] as const) {
    const fx = k === 'material' ? me.material : varnishOf(me);
    const e = fx?.ref ? listOf(out, k).find((x) => x.id === fx.ref) : undefined;
    if (!fx || !e) continue;
    const plain = bare(fx);
    if (JSON.stringify(plain) === JSON.stringify(e.fx)) continue;
    const ne = { ...e, fx: plain };
    out = withList(out, k, listOf(out, k).map((x) => (x.id === e.id ? ne : x)));
    out = {
      ...out,
      layers: out.layers.map((l) => {
        if (l.id === layerId) return l;
        if (k === 'material') return l.material?.ref === e.id ? { ...l, material: linked(ne) } : l;
        return varnishOf(l)?.ref === e.id ? { ...l, fx: (l.fx ?? []).map((x) => (isVarnish(x) ? linked(ne) : x)) } : l;
      }),
    };
  }
  return out;
}

/** Renomme une entrée : les objets liés prennent le nouveau nom. */
export function renameEntry(d: Doc, k: MatterKind, id: string, name: string): Doc {
  const out = withList(d, k, listOf(d, k).map((x) => (x.id === id ? { ...x, name } : x)));
  return relink(out, k, id, (fx) => ({ ...fx, preset: name }));
}
/** Retire une entrée : les objets gardent leur réglage, sans lien. */
export function removeEntry(d: Doc, k: MatterKind, id: string): Doc {
  return relink(withList(d, k, listOf(d, k).filter((x) => x.id !== id)), k, id, (fx) => {
    const { ref: _r, ...rest } = fx;
    return rest;
  });
}
function relink(d: Doc, k: MatterKind, id: string, f: (x: Fx) => Fx): Doc {
  return {
    ...d,
    layers: d.layers.map((l) => {
      if (k === 'material') return l.material?.ref === id ? { ...l, material: f(l.material) } : l;
      const v = varnishOf(l);
      return v?.ref === id ? { ...l, fx: (l.fx ?? []).map((x) => (x === v ? f(x) : x)) } : l;
    }),
  };
}

/** Pastille d'une matière : son relief sur un gris moyen (la couleur reste celle de l'objet). */
const chips = new Map<string, string>();
export function matterSwatch(fx: Fx): string {
  const key = JSON.stringify(bare(fx));
  const hit = chips.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 72;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.fillStyle = '#b4ada3';
  x.fillRect(0, 0, 72, 72);
  const img = x.getImageData(0, 0, 72, 72);
  applyPixelFx(img, [bare(fx)], [], 260, 0.5, -0.8);
  x.putImageData(img, 0, 0);
  const url = `url(${c.toDataURL('image/png')})`;
  chips.set(key, url);
  return url;
}

/** Pastille d'un vernis : une bille plus ou moins brillante. */
export function varnishSwatch(fx: Fx): string {
  const a = Math.max(0.15, Math.min(1, fx.amount));
  const shine: Record<string, string> = {
    gloss: `radial-gradient(circle at 32% 28%, #fff 0 ${10 + 8 * a}%, transparent ${18 + 10 * a}%)`,
    satin: `radial-gradient(circle at 32% 28%, rgba(255,255,255,${0.5 + 0.3 * a}) 0 12%, transparent 45%)`,
    'matte-varnish': 'radial-gradient(circle at 40% 35%, rgba(255,255,255,.18), transparent 60%)',
    liquid: `radial-gradient(ellipse at 35% 25%, #fff 0 8%, transparent 20%), radial-gradient(circle at 65% 75%, rgba(255,255,255,${0.4 * a}) 0 10%, transparent 26%)`,
    glazed: `linear-gradient(135deg, rgba(255,255,255,${0.6 * a}) 0 30%, transparent 31%)`,
    glacis: `linear-gradient(160deg, rgba(255,240,200,${0.45 * a}), transparent 70%)`,
  };
  return `${shine[fx.id] ?? ''}${shine[fx.id] ? ', ' : ''}radial-gradient(circle at 45% 40%, #8f88a0, #4b4558 75%)`;
}
