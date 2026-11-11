import type { Format } from '@ftd/core';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BORDER_TYPES, fxPreview, GLOW_TYPES, Knob, swatch } from './App';
import { layerColor, MaterialWizard, WandGlyph } from './material-wizard';
import { presetFx } from './material-presets';
import { FX, fxGuides, fxKnobs, fxOf, MATERIALS, newFx, type Fx, type FxGroup, type FxId } from './fx';
import { Icon } from './icons';
import { lookGuides, lookOf, LOOKS, type LookId, type LookSettings } from './looks';
import { GEN_DEFAULTS, SKINS, VOLUMES, volumeName, type Doc, type Layer } from './model';
import { ensureFont, fontFamily, fontsFor, fontOf, leanOf, loadFonts, WARPS, withLean, type TextStyle, type WarpKind } from './text';
import { TextContent, WarpGlyph, weightName } from './textbar';
import { TiltPad } from './tilt';
import { borderDefaults } from './targets';

/**
 * Coupe de l'objet : ses couches lues comme l'objet posé, du dessus au dessous.
 * Bords tout autour, vernis par-dessus, image (et son filtre) avec les transformations
 * en parallèle, support (la matière) dessous. Un aperçu éclaté montre chaque couche rendue.
 */
export type Section = 'edge' | 'coat' | 'image' | 'transform' | 'support' | 'depth';

interface Item {
  sec: Section;
  /** border, bevel, glow, look, draw, paint, material, fx:<index dans l.fx> */
  key: string;
  name: string;
  bg: string;
  removable: boolean;
  /** Une police : la pastille et le nom s'affichent dans cette police. */
  font?: string;
  /** Pastille dessinée (contenu, déformation du texte). */
  glyph?: 'content' | 'molded' | WarpKind | 'none';
  /** Attribut d'origine d'un objet modelé : grisé, il revient avec « Revenir ». */
  locked?: boolean;
}

const groupOf = (x: Fx) => fxOf(x.id)?.group;

/** Vignettes des choix déjà calculées pour l'état présent d'une couche (palette, lumière, format). */
const thumbCache = new WeakMap<Layer, { deps: unknown[]; urls: Map<string, string> }>();
function thumbsFor(l: Layer, deps: unknown[]) {
  let c = thumbCache.get(l);
  if (!c || c.deps.length !== deps.length || c.deps.some((d, i) => d !== deps[i])) {
    c = { deps, urls: new Map() };
    thumbCache.set(l, c);
  }
  return c;
}
/** Dernier toucher ou mouvement du stylet : le préchargement s'efface pendant un geste. */
let lastInput = 0;
if (typeof window !== 'undefined')
  for (const t of ['pointerdown', 'pointermove', 'wheel', 'keydown'])
    window.addEventListener(t, () => (lastInput = performance.now()), { capture: true, passive: true });
const busy = () => performance.now() - lastInput < 400;
/** Ce que fait chaque choix, en quelques mots, et sa famille dans la liste. */
const HINTS: Record<string, [string, string]> = {
  trim: ['Rognage', 'bords flous, flottants, zigzag'],
  mono: ['Couleur', 'une seule teinte de la palette'],
  bw: ['Couleur', 'noir et blanc franc, grain'],
  duotone: ['Couleur', 'ombres et lumières en deux teintes'],
  tritone: ['Couleur', 'trois teintes, des ombres aux lumières'],
  vintage: ['Pellicule', 'tons jaunis, contraste doux'],
  sepia: ['Pellicule', 'virage brun des tirages anciens'],
  aging: ['Vieillissement', 'jauni, taches, rayures, coins usés'],
  polaroid: ['Pellicule', 'instantané délavé, blancs crème'],
  kodachrome: ['Pellicule', 'couleurs denses, rouges profonds'],
  chrome: ['Pellicule', 'couleurs retenues, ciels froids'],
  cross: ['Pellicule', 'couleurs décalées, vert et magenta'],
  bleach: ['Pellicule', 'désaturé, très contrasté, métallique'],
  matte: ['Pellicule', 'noirs levés, image voilée'],
  pastel: ['Lumière', 'tons clairs et tendres'],
  highkey: ['Lumière', 'très lumineux, ombres effacées'],
  lowkey: ['Lumière', 'très sombre, lumières isolées'],
  hdr: ['Lumière', 'détails poussés partout'],
  golden: ['Lumière', 'soleil bas, chaud et doré'],
  moody: ['Lumière', 'sombre, désaturé, dramatique'],
  cold: ['Ambiance', 'bleuté, froid'],
  warm: ['Ambiance', 'orangé, chaleureux'],
  cyber: ['Ambiance', 'néons cyan et magenta, nuit'],
  synth: ['Ambiance', 'violet et rose années 80'],
  cartoon: ['Dessin', 'aplats et contours noirs'],
  manga: ['Dessin', 'encre noire, trames, hachures'],
  sketch: ['Dessin', 'traits au crayon sur papier'],
  pencil: ['Dessin', 'crayon, ombres en dégradé de palette'],
  halftone: ['', 'points d’imprimerie, comme une affiche'],
  riso: ['', 'deux encres décalées, grain d’impression'],
  posterize: ['', 'quelques aplats de couleur'],
  gradmap: ['', 'les clairs et sombres repeints en dégradé'],
  gloss: ['', 'reflet de vernis côté lumière'],
  satin: ['', 'lueur douce, sans éclat'],
  'matte-varnish': ['', 'voile poudré, aucun reflet'],
  liquid: ['', 'couche épaisse et fraîche, surface qui ondule'],
  glazed: ['', 'lisse comme un glaçage, reflets nets'],
  glacis: ['', 'couche transparente teintée, densité réglable'],
  grain: ['', 'grain fin de papier'],
  kraft: ['', 'papier brun à fibres'],
  watercolor: ['', 'papier épais, grain marqué'],
  corrugated: ['', 'ondulations de carton'],
  newsprint: ['', 'papier gris, fibres et taches'],
  canvas: ['', 'tissage de toile'],
  wood: ['', 'veines de bois'],
  metal: ['', 'métal brossé, reflets en lignes'],
  felt: ['', 'feutre doux et duveteux'],
  glass: ['', 'transparent, reflets nets'],
  plexi: ['', 'transparent, couleur franche'],
  ice: ['', 'givrée, fêlures'],
  smoke: ['', 'volutes, on voit à travers'],
  hologram: ['', 'irisé, lignes de balayage'],
  greyboard: ['', 'carton compact gris, fibres serrées'],
  bristol: ['', 'papier blanc lisse, grain léger'],
  tracing: ['', 'voile laiteux, on devine dessous'],
  frosted: ['', 'translucide, lumière diffuse'],
  mirror: ['', 'reflète, bande de lumière vive'],
  aluminium: ['', 'panneau alu lisse et satiné'],
  concrete: ['', 'gris, taches et bullages'],
  slate: ['', 'feuillets gris-bleu, mat'],
  cork: ['', 'granules bruns agglomérés'],
  carbon: ['', 'fibre tressée sombre et vernie'],
  leather: ['', 'grain de cuir, lustre discret'],
  'soft-leather': ['', 'grain fin, plis souples, satiné'],
  suede: ['', 'velours mat, poils couchés'],
  denim: ['', 'sergé indigo, délavé'],
};
const genOf = (l: Layer) => l.gen ?? (l.shape && !l.cut ? GEN_DEFAULTS[l.shape] : undefined);
/** Pour une forme, la section Image devient Forme : sa découpe et sa couleur. */
const secLabel = (sec: Section, l: Layer) => (sec === 'image' && l.kind === 'shape' ? 'Forme' : sec === 'image' && l.kind === 'text' ? 'Texte' : SECTIONS.find((s) => s.sec === sec)!.name);
const fxIn = (l: Layer, g: FxGroup) => (l.fx ?? []).map((x, i) => ({ x, i })).filter(({ x }) => groupOf(x) === g);

function itemsOf(l: Layer, doc: Doc): Item[] {
  const out: Item[] = [];
  const g = (i: number) => swatch(doc.guides[i]);
  if (l.kind !== 'surface') {
    if (l.border) out.push({ sec: 'edge', key: 'border', name: BORDER_TYPES.find((x) => x[0] === l.border!.style)![1], bg: g(l.border.guide), removable: true });
    if (l.trim) out.push({ sec: 'edge', key: 'trim', name: 'Rognage', bg: 'repeating-linear-gradient(135deg,#c9c3d6 0 3px,transparent 3px 6px)', removable: true });
    // le volume : forme bombée, biseau, relief sculpté
    if ((l.extrude ?? 0) > 0.001) out.push({ sec: 'depth', key: 'extrude', name: 'Extrusion', bg: 'linear-gradient(160deg,#d8d3e4 0 45%,#6f6880 45%)', removable: true });
    if ((l.bevel ?? 0) > 0.001) out.push({ sec: 'depth', key: 'bevel', name: 'Biseau', bg: 'linear-gradient(135deg,#fff,#8a849a)', removable: true });
    if (l.glow) out.push({ sec: 'edge', key: 'glow', name: GLOW_TYPES.find((x) => x[0] === l.glow!.style)![1], bg: `radial-gradient(circle, #fff 20%, ${swatch(doc.guides[l.glow.guide])} 60%)`, removable: true });
  }
  if (l.molded) out.push({ sec: 'image', key: 'molded', name: 'Modelé', bg: '', removable: false, glyph: 'molded' });
  if (l.volume) out.push({ sec: 'depth', key: 'volume', name: volumeName(l.volume), bg: 'radial-gradient(circle at 35% 30%,#fff,#b9b2c9 55%,#6f6880)', removable: true });
  if (l.bump && l.kind !== 'surface') out.push({ sec: 'depth', key: 'relief', name: 'Relief sculpté', bg: 'radial-gradient(circle at 30% 30%,#fff,#b9b2c9 40%,#fff 55%,#8a849a)', removable: true });
  for (const { x, i } of fxIn(l, 'lumiere')) out.push({ sec: 'coat', key: `fx:${i}`, name: fxOf(x.id)!.name, bg: 'linear-gradient(135deg,#fff,#c9c3d6)', removable: true });
  if (l.kind === 'shape') {
    const gen = genOf(l);
    out.push({
      sec: 'image',
      key: 'shape',
      name: gen ? `${gen.sides} côtés` : 'Proportions',
      bg: 'conic-gradient(from 18deg,#8a849a 0 20%,#e8e4f0 0 40%,#8a849a 0 60%,#e8e4f0 0 80%,#8a849a 0)',
      removable: false,
    });
  }
  if (l.kind === 'text' && l.text) {
    out.push({ sec: 'image', key: 'content', name: 'Contenu', bg: '', removable: false, glyph: 'content' });
  }
  if (l.kind === 'text' && l.text) out.push({ sec: 'image', key: 'text', name: fontOf(l.text.font).family, bg: 'linear-gradient(135deg,#fff,#c9c3d6)', removable: false, font: l.text.font });
  if (l.kind === 'photo') {
    if (l.look?.style) out.push({ sec: 'image', key: 'look', name: lookOf(l.look.style)!.name, bg: 'linear-gradient(135deg,#2b3a8c,#9b4f9e,#ee6b5b)', removable: true });
  } else out.push({ sec: 'image', key: 'paint', name: doc.guides[l.guide]?.name ?? 'Couleur', bg: g(l.guide), removable: false });
  if (l.kind === 'text' && l.text) {
    const w = l.text.warp?.kind ?? 'none';
    out.push({ sec: 'image', key: 'warp', name: 'Disposition', bg: '', removable: false, glyph: w });
  }
  for (const { x, i } of fxIn(l, 'effet')) out.push({ sec: 'transform', key: `fx:${i}`, name: fxOf(x.id)!.name, bg: 'radial-gradient(circle,#1c1b3a 30%,#e3a83c 34%) 0 0/6px 6px', removable: true });
  if (l.material) out.push({ sec: 'support', key: 'material', name: l.material.preset ?? fxOf(l.material.id)!.name, bg: 'repeating-linear-gradient(45deg,#c79a63 0 3px,#b0814d 3px 6px)', removable: true });
  if (l.molded) for (const it of out) if (['shape', 'content', 'text', 'warp'].includes(it.key)) it.locked = true;
  return out;
}

/** Ce qu'on retire quand on touche la croix d'un élément. */
function removal(l: Layer, key: string): Partial<Layer> {
  if (key === 'border') return { border: undefined };
  if (key === 'bevel') return { bevel: 0, bevelProfile: undefined, bevelBorder: undefined };
  if (key === 'extrude') return { extrude: undefined };
  if (key === 'trim') return { trim: undefined };
  if (key === 'volume') return { volume: undefined };
  if (key === 'relief') return { bump: undefined };
  if (key === 'glow') return { glow: undefined };
  if (key === 'material') return { material: undefined };
  if (key === 'look' || key === 'draw') {
    const look = { ...(l.look ?? { guides: [], mix: 1 }) } as LookSettings;
    if (key === 'look') {
      look.style = undefined;
      look.guides = [];
    } else look.draw = undefined;
    return { look: look.style || look.draw ? look : undefined };
  }
  const i = Number(key.slice(3));
  const fx = (l.fx ?? []).filter((_, j) => j !== i);
  return { fx: fx.length ? fx : undefined };
}

/** Ce qu'on peut ajouter dans chaque section, avec la retouche qui l'applique. */
function choicesOf(l: Layer, sec: Section, doc?: Doc): Array<{ id: string; name: string; patch: Partial<Layer>; focus: string; text?: Partial<TextStyle>; font?: string }> {
  const fxAdd = (g: FxGroup) =>
    FX.filter((d) => d.group === g && !(l.fx ?? []).some((x) => x.id === d.id)).map((d) => ({
      id: d.id,
      name: d.name,
      patch: { fx: [...(l.fx ?? []), newFx(d.id)] },
      focus: `fx:${(l.fx ?? []).length}`,
    }));
  if (sec === 'edge')
    return [
      ...BORDER_TYPES.filter((x) => x[0] && x[0] !== l.border?.style).map(([st, name]) => ({
        id: `b-${st}`,
        name,
        patch: { border: { style: st!, ...borderDefaults(st!, l.border, doc?.guides ?? []), width: l.border?.width ?? 0.012 } },
        focus: 'border',
      })),
      ...(l.trim ? [] : [{ id: 'trim', name: 'Rognage', patch: { trim: { blur: 0.25, float: 0.3, zigzag: 0 } }, focus: 'trim' }]),
      ...GLOW_TYPES.filter((x) => x[0] && x[0] !== l.glow?.style).map(([st, name]) => ({
        id: `g-${st}`,
        name,
        patch: { glow: { style: st!, guide: l.glow?.guide ?? 3, distance: l.glow?.distance ?? 0.1, width: l.glow?.width ?? 0.4 } },
        focus: 'glow',
      })),
    ];
  if (sec === 'coat') return fxAdd('lumiere');
  if (sec === 'transform') return fxAdd('effet');
  if (sec === 'support')
    return MATERIALS()
      .filter((d) => d.id !== l.material?.id && !(d.transparent && l.kind === 'surface'))
      .map((d) => ({ id: d.id, name: d.name, patch: { material: newFx(d.id), ...(d.transparent ? { opacity: d.transparent } : {}) }, focus: 'material' }));
  if (sec === 'depth')
    return l.kind === 'surface'
      ? []
      : [
          // volume : proposé à tout objet qui n'en a pas encore
          ...(l.volume
            ? []
            : [
                ...VOLUMES.filter(([kind]) => kind !== 'flat').map(([kind, name]) => ({ id: `v-${kind}`, name: `Volume ${name.toLowerCase()}`, patch: { volume: { kind, amount: kind === 'cone' ? 0.5 : 0.7 } } as Partial<Layer>, focus: 'volume' })),
                // plis et fissures : posés à plat, la forme se choisit ensuite dans le réglage
                ...SKINS.map(([kind, name]) => ({ id: `v-${kind}`, name, patch: { volume: { kind: 'flat', amount: 0.7, skin: { kind, depth: 0.6, density: 0.4 } } } as Partial<Layer>, focus: 'volume' })),
              ]),
          ...((l.bevel ?? 0) > 0.001 ? [] : [{ id: 'bevel', name: 'Biseau', patch: { bevel: 0.5 } as Partial<Layer>, focus: 'bevel' }]),
          ...((l.extrude ?? 0) > 0.001 ? [] : [{ id: 'extrude', name: 'Extrusion', patch: { extrude: 0.5 } as Partial<Layer>, focus: 'extrude' }]),
        ];
  return imageChoices(l);
}

function imageChoices(l: Layer): Array<{ id: string; name: string; patch: Partial<Layer>; focus: string; text?: Partial<TextStyle>; font?: string }> {
  // texte : le catalogue des polices, chacune montrée avec le texte lui-même
  if (l.kind === 'text' && l.text && l.molded) return [];
  if (l.kind === 'text' && l.text)
    return fontsFor('compositions')
      .filter((ft) => ft.id !== l.text!.font)
      .map((ft) => ({ id: `font-${ft.id}`, name: ft.family, patch: {}, focus: 'text', text: { font: ft.id }, font: ft.id }));
  if (l.kind !== 'photo') return [];
  const look = l.look ?? { guides: [], mix: 1 };
  return [
    ...LOOKS.filter((d) => d.id !== look.style).map((d) => ({
      id: d.id,
      name: d.name,
      patch: { look: { ...look, style: d.id as LookId, guides: d.slots.map((x) => x.def), mix: look.mix ?? 1 } },
      focus: 'look',
    })),
  ];
}

const SECTIONS: Array<{ sec: Section; name: string; role: string; empty: string; slab: string }> = [
  { sec: 'edge', name: 'Bords', role: 'tout autour', empty: 'Aucun', slab: 's-edge' },
  { sec: 'coat', name: 'Vernis', role: 'par-dessus', empty: 'Aucun', slab: 's-coat' },
  { sec: 'image', name: 'Image', role: 'et son filtre', empty: 'Originale', slab: 's-image' },
  { sec: 'transform', name: 'Transformations', role: 'en parallèle', empty: 'Aucune', slab: 's-fx' },
  { sec: 'depth', name: 'Volume', role: 'bombé, biseau, relief', empty: 'À plat', slab: 's-depth' },
  { sec: 'support', name: 'Support', role: 'la matière', empty: 'Papier', slab: 's-support' },
];

/** Couches de l'aperçu éclaté, de la plus basse à la plus haute. */
function pliesOf(l: Layer): Array<{ id: string; name: string; sec: Section; patch: Partial<Layer> }> {
  const bare = { border: undefined, glow: undefined, bevel: 0, trim: undefined } as Partial<Layer>;
  const effects = (l.fx ?? []).filter((x) => groupOf(x) === 'effet');
  const coat = (l.fx ?? []).filter((x) => groupOf(x) === 'lumiere');
  const out: Array<{ id: string; name: string; sec: Section; patch: Partial<Layer> }> = [
    {
      id: 'support',
      name: l.material ? fxOf(l.material.id)!.name : 'Support',
      sec: 'support',
      patch: { ...bare, kind: l.kind === 'photo' ? 'support' : l.kind, src: undefined, look: undefined, fx: undefined, strokes: [], guide: l.kind === 'photo' ? 0 : l.guide },
    },
    { id: 'image', name: l.kind === 'photo' ? 'Image' : 'Peinture', sec: 'image', patch: { ...bare, material: undefined, fx: undefined } },
  ];
  if (effects.length) out.push({ id: 'transform', name: 'Transformations', sec: 'transform', patch: { ...bare, material: undefined, fx: effects } });
  if (coat.length) out.push({ id: 'coat', name: 'Vernis', sec: 'coat', patch: { border: undefined, glow: undefined } });
  out.push({ id: 'result', name: 'Résultat', sec: 'edge', patch: {} });
  return out;
}

export function CoupePanel({
  list,
  patchText,
  unmold,
  onMold,
  simple = true,
  onSculpt,
  layer: l,
  doc,
  f,
  patch,
  onClose,
  onToast,
  openOn,
}: {
  /** Liste des objets de la page, à gauche du volet. */
  list?: React.ReactNode;
  /** Retouche du texte (police, graisse) : les lettres gardent leur place sur la page. */
  patchText?: (next: Partial<TextStyle>, history: boolean) => void;
  /** Retire le modelage : la forme, le texte ou le cadre d'origine reviennent. */
  unmold?: () => void;
  /** Passe à l'outil Modeler. */
  onMold?: () => void;
  /** Mode simplifié : les réglages rares attendent « Plus ». */
  simple?: boolean;
  /** Passe à l'outil Modeler en mode Relief. */
  onSculpt?: () => void;
  layer: Layer;
  doc: Doc;
  f: Format;
  patch: (p: Partial<Layer>, history?: boolean) => void;
  onClose: () => void;
  onToast: (msg: string, undoable?: boolean) => void;
  /** Élément à ouvrir d'emblée (une forme qu'on vient de poser : ses paramètres). */
  openOn?: { key: string; n: number; sec?: Section };
}) {
  const [focus, setFocus] = useState<string | null>(openOn && (openOn.sec || l.kind === 'shape') ? openOn.key : null);
  useEffect(() => {
    if (openOn && (openOn.sec || l.kind === 'shape')) setFocus(openOn.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openOn]);
  const [adding, setAdding] = useState<Section | null>(null);
  const [wizard, setWizard] = useState(false);
  // une couche touchée dans l'aperçu : on ne montre que son panneau
  const [only, setOnly] = useState<Section | null>(null);
  // sur téléphone, l'aperçu n'a pas la place : une section est toujours ouverte
  const narrow = () => window.matchMedia('(max-width: 540px)').matches;
  useEffect(() => {
    if (!narrow()) return setOnly(null);
    const first = sections[0]?.sec ?? null;
    setOnly(first);
    const it = first ? items.find((x) => x.sec === first) : undefined;
    setFocus((f) => (f && items.some((x) => x.key === f) ? f : it ? it.key : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [l.id]);
  useEffect(() => {
    if (openOn && (openOn.sec || l.kind === 'shape')) setOnly(openOn.sec ?? 'image');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openOn]);
  // traits de rappel : du bouton de légende à la couche qu'il édite, dans l'aperçu
  const view = useRef<HTMLDivElement>(null);
  const plyEls = useRef<Record<string, HTMLElement | null>>({});
  const tagEls = useRef<Record<string, HTMLElement | null>>({});
  const [leaders, setLeaders] = useState<Array<{ sec: Section; d: string; x: number; y: number }>>([]);
  const [tick, bump] = useState(0);
  const items = itemsOf(l, doc);
  const reload = () => bump((n) => n + 1);

  // aperçu éclaté, recalculé un instant après le dernier réglage (le geste reste fluide)
  const [plies, setPlies] = useState<Array<{ id: string; name: string; sec: Section; src: string }>>([]);
  useEffect(() => {
    const t = setTimeout(() => setPlies(pliesOf(l).map((p) => ({ ...p, src: fxPreview(l, doc, f, l.fx, `ply-${p.id}`, reload, p.patch) }))), 140);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [l, doc.guides, doc.light, doc.lamp, f, tick]);

  // vignettes des choix de la section ouverte : l'objet avec ce choix appliqué
  const choices = adding ? choicesOf(l, adding, doc) : [];
  const hintOf = (id: string) => HINTS[id] ?? HINTS[id.replace(/^[bg]-/, '')] ?? ['', ''];
  const edgeGroup = (id: string) => (id.startsWith('b-') ? 'Bord' : id === 'trim' ? 'Rognage' : 'Lueur');
  const depthGroup = (id: string) => (id.startsWith('v-') || id === 'extrude' ? 'Volume' : 'Relief');
  // calculées une à une sans bloquer, seulement pour le catalogue ouvert : les précharger toutes en
  // tâche de fond (une lueur coûte des centaines de ms sur iPad) ralentissait chaque ouverture des attributs
  const [, thumbDone] = useState(0);
  const cache = thumbsFor(l, [doc.guides, doc.light, doc.lamp, f, tick]);
  useEffect(() => {
    if (!adding) return;
    const todo = choicesOf(l, adding, doc).filter((c) => !c.font && !cache.urls.has(c.id));
    let stop = false;
    let timer = 0;
    const step = () => {
      if (stop) return;
      const c = todo.shift();
      if (!c) return;
      if (!cache.urls.has(c.id)) cache.urls.set(c.id, fxPreview(l, doc, f, l.fx, `add-${c.id}`, reload, c.patch));
      thumbDone((n) => n + 1);
      // une vignette par tâche : la main garde la priorité entre deux
      timer = window.setTimeout(step, busy() ? 60 : 0);
    };
    timer = window.setTimeout(step, 30);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adding, cache]);
  const thumbs = cache.urls;
  // catalogue des polices ouvert : chacune se charge pour que son aperçu soit dans sa forme
  const isText = l.kind === 'text';
  useEffect(() => {
    if (adding !== 'image' || !isText) return;
    let stop = false;
    void loadFonts().then((all) => Promise.all(all.map((x) => ensureFont(x.id))).then(() => !stop && thumbDone((n) => n + 1)));
    return () => {
      stop = true;
    };
  }, [adding, isText]);

  // « Plus » : Transformations, Rognage et Lueur se montrent d'un toucher (ou quand l'objet en a déjà)
  const [moreOn, setMore] = useState(false);
  useEffect(() => setMore(false), [l.id]);
  const more = moreOn || !simple;
  const hasFx = (l.fx ?? []).some((x) => groupOf(x) === 'effet');
  const sections = SECTIONS.filter((s) => (l.kind === 'surface' ? s.sec !== 'edge' && s.sec !== 'image' && s.sec !== 'depth' : true)).filter((s) => s.sec !== 'transform' || more || hasFx || only === 'transform');
  const card = (s: (typeof SECTIONS)[number]) => {
    const mine = items.filter((x) => x.sec === s.sec);
    const can = choicesOf(l, s.sec, doc).length > 0;
    // une seule couche possible (matière, filtre) : on la change au crayon plutôt que d'en ajouter
    const one = s.sec === 'support' || s.sec === 'image';
    return (
      <div key={s.sec} className={`cp-card ${adding === s.sec ? 'open' : ''}`}>
        <div className="cp-h">
          <span className={`slab ${s.slab}`} />
          <span className="cn">{secLabel(s.sec, l)}</span>
          {s.sec === 'depth' && onSculpt && (
            <button className="chip cp-sculpt" onClick={onSculpt} title="Modeler › Relief : bosser, creuser, lisser la surface au stylet">
              {l.bump ? 'Reprendre la sculpture' : 'Sculpter le volume'}
            </button>
          )}
          {s.sec === 'support' && (
            <button className="cp-add cp-wand" onClick={() => setWizard(true)} title="Assistant matières : choisir une matière réelle (chêne, laiton, velours…)" aria-label="Assistant matières">
              <WandGlyph />
            </button>
          )}
          {can && (
            <button
              className="cp-add"
              onClick={() => setAdding(adding === s.sec ? null : s.sec)}
              title={`${one ? 'Changer' : 'Ajouter'} : ${secLabel(s.sec, l)}`}
              aria-label={`${one ? 'Changer' : 'Ajouter'} : ${secLabel(s.sec, l)}`}
            >
              <Icon name={one ? 'pen' : 'plus'} />
            </button>
          )}
        </div>
        <div className="cp-items">
          {mine.length ? (
            mine.map((it) => (
              <span key={it.key} className={`cp-item ${focus === it.key ? 'on' : ''} ${it.locked ? 'locked' : ''}`}>
                <button className="cp-nm" onClick={() => setFocus(focus === it.key ? null : it.key)}>
                  {it.glyph ? (
                    <span className="sw sw-glyph">
                      {it.glyph === 'molded' ? (
                        <Icon name="mold" />
                      ) : it.glyph === 'content' ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M5 6h10M10 6v12M15 14h5M15 18h4" />
                        </svg>
                      ) : (
                        <WarpGlyph k={it.glyph} />
                      )}
                    </span>
                  ) : it.font ? (
                    <span className="sw sw-font" style={{ fontFamily: `${fontFamily(it.font)}, Inter, sans-serif` }}>
                      Aa
                    </span>
                  ) : (
                    <span className="sw" style={{ background: it.bg }} />
                  )}
                  <span className="nm" style={it.font ? { fontFamily: `${fontFamily(it.font)}, Inter, sans-serif` } : undefined}>
                    {it.name}
                  </span>
                </button>
                {it.removable && (
                  <button
                    className="x"
                    title={`Retirer ${it.name}`}
                    aria-label={`Retirer ${it.name}`}
                    onClick={() => {
                      patch(removal(l, it.key));
                      if (focus === it.key || focus?.startsWith('fx:')) setFocus(null);
                      onToast(`${it.name} retiré`, true);
                    }}
                  >
                    ×
                  </button>
                )}
              </span>
            ))
          ) : (
            <span className="cp-empty">{s.empty}</span>
          )}
        </div>
        {adding === s.sec && (
          <div className="cp-pick-wrap">
            {(() => {
              const list = choicesOf(l, s.sec, doc);
              const groups: string[] = [];
              const fam = (id: string) => (s.sec === 'edge' ? edgeGroup(id) : s.sec === 'depth' ? depthGroup(id) : s.sec === 'support' ? (fxOf(id as FxId)?.family ?? '') : hintOf(id)[0]);
              for (const c of list) if (!groups.includes(fam(c.id))) groups.push(fam(c.id));
              const extra = s.sec === 'edge' ? ['Rognage', 'Lueur'] : [];
              const shown = groups.filter((gname) => more || !extra.includes(gname));
              const hidden = groups.length - shown.length;
              return [
                ...shown.map((gname) => (
                  <div key={gname || 'all'}>
                    {gname && <div className="cp-fam">{gname}</div>}
                    <div className="cp-pick">
                      {list
                        .filter((c) => fam(c.id) === gname)
                        .map((c) => (
                          <button
                            key={c.id}
                            title={hintOf(c.id)[1] || undefined}
                            onClick={() => {
                              if (c.text) patchText?.(c.text, true);
                              else patch(c.patch);
                              setFocus(c.focus);
                              setAdding(null);
                            }}
                          >
                            <span className="thumb">
                              {c.font ? (
                                <span className="font-thumb" style={{ fontFamily: `${fontFamily(c.font)}, Inter, sans-serif`, fontWeight: l.text?.weight, fontStyle: l.text?.italic ? 'italic' : 'normal' }}>
                                  {(l.text?.content || 'Aa').split('\n')[0]!.slice(0, 14)}
                                </span>
                              ) : (
                                (thumbs.get(c.id) ? <img src={thumbs.get(c.id)} alt="" /> : <span className="spin" aria-label="Chargement" />)
                              )}
                            </span>
                            <b>{c.name}</b>
                          </button>
                        ))}
                    </div>
                  </div>
                )),
                ...(hidden
                  ? [
                      <button key="more" className="chip cp-more" onClick={() => setMore(true)}>
                        Plus : rognage, lueur
                      </button>,
                    ]
                  : []),
              ];
            })()}
          </div>
        )}
      </div>
    );
  };
  /** La couche de l'aperçu que chaque section édite (les bords : l'objet fini). */
  const plyOf = (sec: Section) => {
    const has = (id: string) => plies.some((p) => p.id === id);
    if (sec === 'edge') return 'result';
    // le volume se lit sur la plaque du support
    if (sec === 'depth') return 'support';
    if (sec === 'coat') return has('coat') ? 'coat' : 'result';
    if (sec === 'transform') return has('transform') ? 'transform' : 'image';
    return sec;
  };
  const pick = (sec: Section | null) => {
    // la section choisie prend la place de l'aperçu ; son catalogue s'ouvre au stylo ou au +
    setAdding(null);
    setOnly(sec);
    // le premier élément de la section s'ouvre : ses curseurs sont tout de suite là
    const first = sec ? items.find((x) => x.sec === sec) : undefined;
    setFocus(first ? first.key : null);
  };
  useLayoutEffect(() => {
    const draw = () => {
      const box = view.current?.getBoundingClientRect();
      if (!box) return;
      const out: Array<{ sec: Section; d: string; x: number; y: number }> = [];
      for (const s of sections) {
        const tag = tagEls.current[s.sec]?.getBoundingClientRect();
        const ply = plyEls.current[plyOf(s.sec)]?.getBoundingClientRect();
        if (!tag || !ply) continue;
        const bx = tag.right - box.left + 3;
        const by = tag.top - box.top + tag.height / 2;
        // le point d'attache : sur le bord gauche de la couche, à sa hauteur
        const x = ply.left - box.left + ply.width * 0.2;
        const y = ply.top - box.top + ply.height * 0.42;
        const ex = bx + 14;
        out.push({ sec: s.sec, d: `M${bx} ${by}H${ex}L${x} ${y}`, x, y });
      }
      setLeaders(out);
    };
    draw();
    // l'aperçu glisse : on retrace les rappels une fois arrivé
    const late = setTimeout(draw, 340);
    const ro = new ResizeObserver(draw);
    if (view.current) ro.observe(view.current);
    return () => {
      clearTimeout(late);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plies, items.length, l.kind, only]);
  const byKey = (k: Section) => sections.find((s) => s.sec === k);
  const focused = items.find((x) => x.key === focus);
  return (
    <aside className={`coupe ${list ? 'with-list' : ''}`} aria-label={`Attributs de « ${l.name} »`}>
      <button className="cp-close" onClick={onClose} aria-label="Fermer">
        ×
      </button>
      <div className={`cp-view with-list ${only ? 'open' : ''}`} ref={view}>
        {list}
        <div className="cp-tags">
          {sections.map((s) => {
            const mine = items.filter((x) => x.sec === s.sec);
            return (
              <button
                key={s.sec}
                ref={(el) => {
                  tagEls.current[s.sec] = el;
                }}
                className={`cp-tag ${only === s.sec ? 'on' : ''}`}
                onClick={() => pick(only === s.sec && !narrow() ? null : s.sec)}
              >
                <span className={`slab ${s.slab}`} />
                <span className="tg-t">
                  <b>{secLabel(s.sec, l)}</b>
                  <small>{mine.length ? mine.map((x) => x.name).join(', ') : s.empty}</small>
                </span>
              </button>
            );
          })}
          {!sections.some((s) => s.sec === 'transform') && (
            <button className="cp-tag cp-tag-more" onClick={() => setMore(true)} title="Plus : Transformations (effets en parallèle de l'image)">
              <span className="slab s-more">
                <Icon name="more" />
              </span>
              <span className="tg-t">
                <b>Plus</b>
                <small>Transformations</small>
              </span>
            </button>
          )}
        </div>
        {/* les réglages s'ouvrent entre les sections et l'aperçu, qui glisse à droite */}
        <div className="cp-pane">
          {only && byKey(only) && (
            <>
              {card(byKey(only)!)}
              {focused && focused.sec === only && <Attrs layer={l} doc={doc} item={focused} patch={patch} patchText={patchText} unmold={unmold} onMold={onMold} onSculpt={onSculpt} />}
            </>
          )}
        </div>
        <div className="plies">
          <div className="plies-3d">
            {plies.map((p, k) => (
              <button
                key={p.id}
                ref={(el) => {
                  plyEls.current[p.id] = el;
                }}
                className="ply"
                style={{ transform: `translate(-50%, -50%) translateZ(${k * Math.min(30, 120 / Math.max(1, plies.length - 1))}px)` }}
                onClick={() => pick(p.id === 'result' ? 'edge' : p.sec)}
                title={p.name}
              >
                <img src={p.src} alt="" />
              </button>
            ))}
          </div>
        </div>
        {!only && (
          <svg className="cp-leaders" aria-hidden>
            {leaders.map((g) => (
              <g key={g.sec}>
                <path d={g.d} />
                <circle cx={g.x} cy={g.y} r="2.6" />
              </g>
            ))}
          </svg>
        )}
      </div>
      {wizard && (
        <MaterialWizard
          current={l.material}
          guides={doc.guides}
          color={layerColor(doc.guides, l.guide)}
          onClose={() => setWizard(false)}
          onPick={(p) => {
            const d = fxOf(p.fx)!;
            const base = l.material?.id === p.fx ? l.material : newFx(p.fx);
            patch({ material: presetFx(p, base), ...(d.transparent && l.material?.id !== p.fx ? { opacity: d.transparent } : {}) });
            setFocus('material');
            onToast(`${p.name} posé sur « ${l.name} »`, true);
          }}
        />
      )}
    </aside>
  );
}

function Dots({ label, value, doc, onPick }: { label: string; value: number; doc: Doc; onPick: (i: number) => void }) {
  return (
    <div className="cp-row colors">
      <span>{label}</span>
      <div className="dots">
        {doc.guides.map((g, i) => (
          <button key={i} className={i === value ? 'on' : ''} style={{ background: swatch(g) }} title={g.name} aria-label={g.name} onClick={() => onPick(i)} />
        ))}
      </div>
    </div>
  );
}

/**
 * Réglage rotatif : un potard, et sous lui sa légende (nom et valeur) en texte simple.
 * Les potards d'un formulaire s'alignent côte à côte, en bas, après les choix.
 */
function Range({ label, value, onChange, unit, min = 0, display }: { label: string; value: number; onChange: (v: number) => void; unit?: string; min?: number; display?: string }) {
  const span = 1 - min;
  return (
    <div className="cp-dial" title={`${label} : glisser vers le haut ou la droite pour monter${min < 0 ? ', double toucher pour revenir au neutre' : ''}`}>
      <Knob label={label} center={min === -1} value={(Math.max(min, Math.min(1, value)) - min) / span} onChange={(v) => onChange(Math.round((min + v * span) * 1000) / 1000)} />
      <span className="cp-dial-l">{label}</span>
      <output>
        {display ?? Math.round(value * 100)}
        {unit && <small> {unit}</small>}
      </output>
    </div>
  );
}

/** Une seule étape d'annulation par réglage : la première retouche l'ouvre, les suivantes (le même potard, sans pause) la complètent. */
function useStep(onChange: (next: Partial<TextStyle>, history: boolean) => void) {
  const step = useRef<{ key: string; t: number } | null>(null);
  return (key: string, next: Partial<TextStyle>) => {
    const now = performance.now();
    const fresh = !step.current || step.current.key !== key || now - step.current.t > 700;
    step.current = { key, t: now };
    onChange(next, fresh);
  };
}

/** Disposition du texte : enveloppe et courbure, espacement des lettres, interligne. */
function TextLayout({ text: t, onChange }: { text: TextStyle; onChange: (next: Partial<TextStyle>, history: boolean) => void }) {
  const live = useStep(onChange);
  const lines = t.content.split('\n').length;
  const lead = t.leading ?? 1.1;
  return (
    <>
      <div className="seg tb-warps">
        {WARPS.map((w) => (
          <button key={w.id} className={(t.warp?.kind ?? 'none') === w.id ? 'on' : ''} onClick={() => onChange({ warp: w.id === 'none' ? undefined : { kind: w.id, amount: t.warp?.amount || 0.5 } }, true)} title={w.name}>
            <WarpGlyph k={w.id} />
          </button>
        ))}
      </div>
      {t.warp && <Range label="Courbure" min={-1} value={t.warp.amount} display={`${Math.round(t.warp.amount * 100)}`} onChange={(v) => live('warp', { warp: { ...t.warp!, amount: Math.round(v * 50) / 50 } })} />}
      <Range
        label="Espacement"
        min={-0.2}
        value={(t.tracking ?? 0) / 0.5}
        display={`${Math.round((t.tracking ?? 0) * 100)}`}
        onChange={(v) => live('tracking', { tracking: Math.round(v * 50) / 100 })}
      />
      {/* interligne : l'écart entre les lignes, en % du corps ; négatif, les lignes se recouvrent (pas de 0,3 à 1,7 corps) */}
      <div className={lines > 1 ? 'cp-dial-wrap' : 'cp-dial-wrap off'} title={lines > 1 ? undefined : 'L’interligne agit sur un texte de plusieurs lignes'}>
        <Range
          label="Interligne"
          min={-1}
          value={(lead - 1) / 0.7}
          display={`${lead >= 1 ? '+' : '−'}${Math.round(Math.abs(lead - 1) * 100)}`}
          onChange={(v) => live('leading', { leading: Math.round((1 + v * 0.7) * 100) / 100 })}
        />
      </div>
    </>
  );
}

/** Réglages de l'élément touché, en bas de la coupe. */
function Attrs({
  layer: l,
  doc,
  item,
  patch,
  patchText,
  unmold,
  onMold,
  onSculpt,
}: {
  layer: Layer;
  doc: Doc;
  item: Item;
  onSculpt?: () => void;
  patch: (p: Partial<Layer>, history?: boolean) => void;
  patchText?: (next: Partial<TextStyle>, history: boolean) => void;
  unmold?: () => void;
  onMold?: () => void;
}) {
  const live = (p: Partial<Layer>) => patch(p, false);
  const liveText = useStep(patchText ?? (() => {}));
  let body: React.ReactNode = null;
  const fxRows = (x: Fx, set: (x: Fx, history?: boolean) => void, amountLabel = 'Intensité') => {
    const def = fxOf(x.id)!;
    const slots = fxGuides(def, x);
    return (
      <>
        {def.slots.map((sl, i) => (
          <Dots key={i} label={sl.label} value={slots[i]!} doc={doc} onPick={(g) => set({ ...x, guides: slots.map((v, j) => (j === i ? g : v)) })} />
        ))}
        <Range label={def.amountLabel ?? amountLabel} unit={def.amountUnit} value={x.amount} onChange={(v) => set({ ...x, amount: Math.round(v * 100) / 100 }, false)} />
        {def.knobs?.map((kn) => {
          const val = fxKnobs(def, x)[kn.key]!;
          return (
            <Range
              key={kn.key}
              label={kn.label}
              value={val}
              display={kn.angle ? `${Math.round(val * 180) % 180}°` : undefined}
              onChange={(v) => set({ ...x, knobs: { ...fxKnobs(def, x), [kn.key]: kn.angle ? Math.round(v * 36) / 36 : Math.round(v * 100) / 100 } }, false)}
            />
          );
        })}
      </>
    );
  };
  if (item.key === 'border' && l.border) {
    const bd = l.border;
    body = (
      <>
        <Dots label={bd.style === 'double' ? 'Intérieur' : 'Couleur'} value={bd.guide} doc={doc} onPick={(i) => patch({ border: { ...bd, guide: i } })} />
        {bd.style === 'double' && <Dots label="Extérieur" value={bd.guide2 ?? 1} doc={doc} onPick={(i) => patch({ border: { ...bd, guide2: i } })} />}
        <Range label="Largeur" value={Math.sqrt((bd.width - 0.002) / 0.198)} onChange={(v) => live({ border: { ...bd, width: 0.002 + Math.round(v * v * 198) / 1000 } })} />
      </>
    );
  } else if (item.key === 'trim' && l.trim) {
    const tr = l.trim;
    const r2 = (v: number) => Math.round(v * 100) / 100;
    body = (
      <>
        <Range label="Flou" value={tr.blur} onChange={(v) => live({ trim: { ...tr, blur: r2(v) } })} />
        <Range label="Flottant" value={tr.float} onChange={(v) => live({ trim: { ...tr, float: r2(v) } })} />
        <Range label="Zigzag" value={tr.zigzag} onChange={(v) => live({ trim: { ...tr, zigzag: r2(v) } })} />
        {tr.zigzag > 0.01 && <Range label="Aléa" value={tr.chaos ?? 0.5} onChange={(v) => live({ trim: { ...tr, chaos: r2(v) } })} />}
      </>
    );
  } else if (item.key === 'relief') {
    body = (
      <>
        <p className="cp-note">Bosses et creux sculptés au stylet, éclairés par la lampe.</p>
        {onSculpt && (
          <button className="chip cp-sculpt" onClick={onSculpt}>
            Reprendre la sculpture
          </button>
        )}
      </>
    );
  } else if (item.key === 'extrude')
    body = (
      <>
        <Range label="Épaisseur" value={l.extrude ?? 0} onChange={(v) => live({ extrude: Math.max(0.02, Math.round(v * 100) / 100) })} />
        {l.link && <p className="cp-note">Toutes les pièces de l’objet prennent la même épaisseur.</p>}
      </>
    );
  else if (item.key === 'bevel')
    body = (
      <>
        <Range label="Largeur" value={l.bevel ?? 0} onChange={(v) => live({ bevel: Math.max(0.05, Math.round(v * 100) / 100) })} />
        <label className="cp-row">
          <span>Profil</span>
          <span className="seg cp-seg">
            {(
              [
                ['round', 'Arrondi'],
                ['chamfer', 'Chanfrein'],
              ] as const
            ).map(([v, name]) => (
              <button key={v} className={(l.bevelProfile ?? 'round') === v ? 'on' : ''} onClick={() => patch({ bevelProfile: v === 'round' ? undefined : v })}>
                {name}
              </button>
            ))}
          </span>
        </label>
        {l.border && (
          <label className="cp-row">
            <span>Inclure le bord</span>
            <input type="checkbox" checked={!!l.bevelBorder} onChange={(e) => patch({ bevelBorder: e.target.checked || undefined })} />
            <output>{l.bevelBorder ? 'oui' : 'non'}</output>
          </label>
        )}
      </>
    );
  else if (item.key === 'glow' && l.glow) {
    const gl = l.glow;
    body = (
      <>
        <Dots label="Couleur" value={gl.guide} doc={doc} onPick={(i) => patch({ glow: { ...gl, guide: i } })} />
        <Range label="Distance" min={-1} value={gl.distance} onChange={(v) => live({ glow: { ...gl, distance: Math.round(v * 100) / 100 } })} />
        <Range label="Largeur" value={gl.width} onChange={(v) => live({ glow: { ...gl, width: Math.round(v * 100) / 100 } })} />
      </>
    );
  } else if (item.key === 'volume' && l.volume) {
    const v = l.volume;
    const sk = v.skin;
    body = (
      <>
        <label className="cp-row">
          <span>Forme</span>
          <span className="seg cp-seg">
            {VOLUMES.map(([k, name]) => (
              <button key={k} className={v.kind === k ? 'on' : ''} onClick={() => patch({ volume: { ...v, kind: k } })}>
                {name}
              </button>
            ))}
          </span>
        </label>
        {v.kind !== 'flat' && <Range label="Force" value={v.amount} onChange={(x) => live({ volume: { ...v, amount: Math.max(0.05, Math.round(x * 100) / 100) } })} />}
        {v.kind === 'cylinder' && (
          <Range
            label="Axe"
            value={((((v.axis ?? 0) / Math.PI) % 1) + 1) % 1}
            display={`${Math.round((((((v.axis ?? 0) * 180) / Math.PI) % 180) + 180) % 180)}°`}
            onChange={(x) => live({ volume: { ...v, axis: (Math.round(x * 36) / 36) * Math.PI } })}
          />
        )}
        <label className="cp-row">
          <span>Surface</span>
          <span className="seg cp-seg">
            <button className={!sk ? 'on' : ''} onClick={() => patch({ volume: { ...v, skin: undefined, kind: v.kind === 'flat' ? 'dome' : v.kind } })}>
              Lisse
            </button>
            {SKINS.map(([k, name]) => (
              <button key={k} className={sk?.kind === k ? 'on' : ''} onClick={() => patch({ volume: { ...v, skin: { depth: 0.6, density: 0.4, ...sk, kind: k } } })}>
                {name}
              </button>
            ))}
          </span>
        </label>
        {sk && (
          <>
            <Range label="Profondeur" value={sk.depth} onChange={(x) => live({ volume: { ...v, skin: { ...sk, depth: Math.max(0.05, Math.round(x * 100) / 100) } } })} />
            <Range label="Densité" value={sk.density} onChange={(x) => live({ volume: { ...v, skin: { ...sk, density: Math.round(x * 100) / 100 } } })} />
            {sk.kind === 'drape' && (
              <Range
                label="Orientation"
                value={((((sk.angle ?? 0) / Math.PI) % 1) + 1) % 1}
                display={`${Math.round((((((sk.angle ?? 0) * 180) / Math.PI) % 180) + 180) % 180)}°`}
                onChange={(x) => live({ volume: { ...v, skin: { ...sk, angle: (Math.round(x * 36) / 36) * Math.PI } } })}
              />
            )}
          </>
        )}
      </>
    );
  } else if (item.key === 'paint') {
    body = (
      <>
        <Dots label="Couleur" value={l.guide} doc={doc} onPick={(i) => patch({ guide: i })} />
        {l.kind !== 'shape' && (
          <label className="cp-row">
            <span>Proportions libres</span>
            <input type="checkbox" checked={!!l.free} onChange={(e) => patch({ free: e.target.checked || undefined })} />
            <output>{l.free ? 'oui' : 'non'}</output>
          </label>
        )}
      </>
    );
  } else if (item.key === 'molded' || item.locked) {
    const back = l.kind === 'text' ? 'Revenir au texte' : l.kind === 'photo' ? 'Revenir au cadre' : 'Revenir à la forme';
    body = (
      <div className="cp-molded">
        <p>
          {l.kind === 'text'
            ? 'Ce texte a été modelé : c’est maintenant une forme. Ses lettres, sa police et sa déformation sont gardées de côté.'
            : l.kind === 'photo'
              ? 'Le bord de cette photo a été modelé.'
              : 'Cette forme a été modelée : son dessin d’origine est gardé de côté.'}
        </p>
        <div className="cp-molded-act">
          {onMold && (
            <button onClick={onMold}>
              <Icon name="mold" /> Modeler encore
            </button>
          )}
          {unmold && (
            <button className="primary" onClick={unmold}>
              {back}
            </button>
          )}
        </div>
      </div>
    );
  } else if (item.key === 'content' && l.text && patchText) body = <TextContent key={l.id} text={l.text} onChange={patchText} />;
  else if (item.key === 'warp' && l.text && patchText) body = <TextLayout text={l.text} onChange={patchText} />;
  else if (item.key === 'text' && l.text && patchText) {
    const t = l.text;
    const variable = fontOf(t.font).files.some((x) => x.weightMax);
    body = (
      <>
        <Range label="Graisse" display={`${weightName(t.weight)}${variable ? '' : '*'}`} value={(t.weight - 100) / 800} onChange={(v) => liveText('weight', { weight: 100 + Math.round(v * 80) * 10 })} />
        <div className="cp-dial" title="Inclinaison : glisser à droite ou à gauche ; dès 8° à droite le texte passe en italique">
          <TiltPad label="Inclinaison" axis="x" size={46} x={leanOf(t) / 30} display="" onChange={(x) => liveText('lean', withLean(Math.round(x * 30)))} />
          <span className="cp-dial-l">Inclinaison</span>
          <output>
            {leanOf(t)}°{t.italic ? ' it.' : ''}
          </output>
        </div>
        {!variable && <p className="cp-note cp-legend">* graisse simulée : cette police n’a qu’une épaisseur</p>}
      </>
    );
  } else if (item.key === 'shape') {
    const gen = genOf(l);
    body = (
      <>
        {gen && (
          <>
            <Range label="Côtés" display={`${gen.sides}`} value={(gen.sides - 3) / 21} onChange={(v) => live({ gen: { ...gen, sides: 3 + Math.round(v * 21) } })} />
            <Range label="Creux (étoile)" value={gen.depth / 0.95} onChange={(v) => live({ gen: { ...gen, depth: Math.round(v * 95) / 100 } })} />
          </>
        )}
        <label className="cp-row">
          <span>Proportions libres</span>
          <input type="checkbox" checked={!!l.free} onChange={(e) => patch({ free: e.target.checked || undefined })} />
          <output>{l.free ? 'oui' : 'non'}</output>
        </label>
      </>
    );
  } else if (item.key === 'material' && l.material)
    body = (
      <>
        {l.material.tone && (
          <label className="cp-row">
            <span>Teinte</span>
            <span className="cp-tone">
              <i style={{ background: l.material.tone }} />
              {l.material.preset ?? 'naturelle'}
            </span>
            <button className="chip cp-tone-off" onClick={() => patch({ material: { ...l.material!, tone: undefined, preset: undefined } })} title="Reprendre la couleur de l’objet sous la matière">
              Couleur de l’objet
            </button>
          </label>
        )}
        {fxRows(l.material, (x, h) => patch({ material: x }, h))}
        {fxOf(l.material.id)?.transparent && <Range label="Opacité" value={l.opacity ?? 1} onChange={(v) => live({ opacity: Math.max(0.05, Math.round(v * 100) / 100) })} />}
      </>
    );
  else if (item.key === 'look' && l.look?.style) {
    const look = l.look;
    const def = lookOf(look.style)!;
    const slots = lookGuides(def, look);
    body = (
      <>
        {def.slots.map((sl, i) => (
          <Dots key={i} label={sl.label} value={slots[i]!} doc={doc} onPick={(g) => patch({ look: { ...look, guides: slots.map((v, j) => (j === i ? g : v)) } })} />
        ))}
        <Range label="Mélange" value={look.mix} onChange={(v) => live({ look: { ...look, mix: Math.round(v * 100) / 100 } })} />
      </>
    );
  } else if (item.key.startsWith('fx:')) {
    const i = Number(item.key.slice(3));
    const x = l.fx?.[i];
    if (x) body = fxRows(x, (y, h) => patch({ fx: l.fx!.map((z, j) => (j === i ? y : z)) }, h));
  }
  // le titre de la section est déjà au-dessus (carte) : pas de rappel à droite ; la Disposition se nomme dans sa pastille
  const head =
    item.key === 'molded' || item.locked
      ? 'Modelé'
      : item.key === 'shape'
        ? 'Paramètres de la forme'
        : item.key === 'text'
          ? 'Style'
          : item.key === 'content'
            ? 'Contenu'
            : item.key === 'warp'
              ? null
              : item.name;
  return (
    <section className="cp-attrs">
      {head && (
        <div className="cp-attrs-h">
          <b>{head}</b>
        </div>
      )}
      {body}
    </section>
  );
}
