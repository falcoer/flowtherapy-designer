import type { Format } from '@ftd/core';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BORDER_TYPES, fxPreview, GLOW_TYPES, Knob, swatch } from './App';
import { FX, fxGuides, fxKnobs, fxOf, MATERIALS, newFx, type Fx, type FxGroup, type FxId } from './fx';
import { Icon } from './icons';
import { lookGuides, lookOf, LOOKS, type LookId, type LookSettings } from './looks';
import { GEN_DEFAULTS, SKINS, VOLUMES, volumeName, type Doc, type Layer } from './model';
import { ensureFont, fontFamily, fontsFor, fontOf, leanOf, loadFonts, WARPS, withLean, type TextStyle, type WarpKind } from './text';
import { AlignGlyph, TextContent, useLazyText, WarpGlyph, weightName } from './textbar';
import { TiltPad } from './tilt';
import { borderDefaults } from './targets';
import { EDGE_SLOTS, EdgeGlyph, edgeName } from './edge-palette';
import { matterSwatch, varnishOf, varnishSwatch } from './palettes';

/**
 * Coupe de l'objet : ses couches lues comme l'objet posé, du dessus au dessous.
 * Bords tout autour, vernis par-dessus, image (et son filtre) avec les transformations
 * en parallèle, support (la matière) dessous. Un aperçu éclaté montre chaque couche rendue.
 */
export type Section = 'edge' | 'coat' | 'image' | 'transform' | 'support' | 'depth';

/**
 * Forme des pastilles selon ce qu'elles posent : la couleur reste ronde, la matière est un hexagone,
 * le vernis un triangle, le carré est réservé aux bords.
 */
export const shapeClass = (sec: Section | 'color') => (sec === 'support' ? 'shape-matter' : sec === 'coat' ? 'shape-varnish' : sec === 'edge' ? 'shape-edge' : '');

export interface Item {
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

export function itemsOf(l: Layer, doc: Doc): Item[] {
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
  for (const { x, i } of fxIn(l, 'lumiere')) out.push({ sec: 'coat', key: `fx:${i}`, name: x.preset ?? fxOf(x.id)!.name, bg: 'linear-gradient(135deg,#fff,#c9c3d6)', removable: true });
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
export function removal(l: Layer, key: string): Partial<Layer> {
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
export function choicesOf(l: Layer, sec: Section, doc?: Doc): Array<{ id: string; name: string; patch: Partial<Layer>; focus: string; text?: Partial<TextStyle>; font?: string }> {
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
  if (sec === 'coat') {
    // un seul vernis : en choisir un autre remplace celui qui est posé
    const keep = (l.fx ?? []).filter((x) => groupOf(x) !== 'lumiere');
    const cur = (l.fx ?? []).find((x) => groupOf(x) === 'lumiere');
    return FX.filter((d) => d.group === 'lumiere' && d.id !== cur?.id).map((d) => ({ id: d.id, name: d.name, patch: { fx: [...keep, newFx(d.id)] } as Partial<Layer>, focus: `fx:${keep.length}` }));
  }
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

/** Onglets du panneau des attributs : l'objet lui-même (Texte, Forme ou Image), son support, ses bords, son volume. */
export type AttrTab = 'main' | 'support' | 'edge' | 'depth';
const TAB_KEY = 'ftd-atelier-attr-tab';
/** Section d'origine (forme qu'on vient de poser, double toucher) → onglet. */
const tabOfSec = (sec?: Section): AttrTab => (sec === 'support' || sec === 'coat' ? 'support' : sec === 'edge' ? 'edge' : sec === 'depth' ? 'depth' : 'main');

/**
 * Panneau des attributs (bandeau du bas, outil multicouche) : la liste des objets à gauche, puis à droite
 * les onglets Texte / Forme / Image (selon l'objet), Support (teinte, vernis, matière), Bord (trois
 * emplacements) et Volume. Teinte, vernis, matière et bords se posent depuis la palette (on y dépose une
 * pastille) ou par l'assistant (toucher un emplacement).
 */
export function CoupePanel({
  list,
  patchText,
  unmold,
  onMold,
  simple = true,
  onSculpt,
  onWizard,
  onPalette,
  layer: l,
  doc,
  f,
  patch,
  onClose,
  onToast,
  openOn,
}: {
  /** Liste des objets de la page, à gauche du panneau. */
  list?: React.ReactNode;
  /** Retouche du texte (police, graisse) : les lettres gardent leur place sur la page. */
  patchText?: (next: Partial<TextStyle>, history: boolean) => void;
  /** Retire le modelage : la forme, le texte ou le cadre d'origine reviennent. */
  unmold?: () => void;
  /** Passe à l'outil Modeler. */
  onMold?: () => void;
  /** Mode simplifié : les transformations attendent « Plus ». */
  simple?: boolean;
  /** Passe à l'outil Modeler en mode Relief. */
  onSculpt?: () => void;
  /** Ouvre l'assistant sur une section (toucher un emplacement vide ou rempli). */
  onWizard?: (tab: 'support' | 'coat' | 'depth' | 'edge') => void;
  /** Ouvre la palette sur un onglet (toucher la teinte). */
  onPalette?: (tab: 'color' | 'material' | 'varnish' | 'edge') => void;
  layer: Layer;
  doc: Doc;
  f: Format;
  patch: (p: Partial<Layer>, history?: boolean) => void;
  onClose: () => void;
  onToast: (msg: string, undoable?: boolean) => void;
  /** Élément à ouvrir d'emblée (une forme qu'on vient de poser : ses paramètres ; un texte touché deux fois : son contenu). */
  openOn?: { key: string; n: number; sec?: Section };
}) {
  const surface = l.kind === 'surface';
  const mainOn = l.kind === 'text' || l.kind === 'shape' || l.kind === 'photo';
  const tabs: Array<[AttrTab, string]> = [
    ...(mainOn ? [['main', secLabel('image', l)] as [AttrTab, string]] : []),
    ['support', 'Support'],
    ...(surface
      ? []
      : ([
          ['edge', 'Bord'],
          ['depth', 'Volume'],
        ] as Array<[AttrTab, string]>)),
  ];
  const [tabRaw, setTabRaw] = useState<AttrTab>(() => {
    if (openOn) return tabOfSec(openOn.sec);
    try {
      const t = localStorage.getItem(TAB_KEY);
      return t === 'support' || t === 'edge' || t === 'depth' ? t : 'main';
    } catch {
      return 'main';
    }
  });
  const setTab = (t: AttrTab) => {
    setTabRaw(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* stockage indisponible */
    }
  };
  const tab = tabs.some(([t]) => t === tabRaw) ? tabRaw : tabs[0]![0];
  // le contenu du texte prend le clavier seulement quand on vient de toucher deux fois le texte (ou d'en poser un)
  // demande consommée dès que le contenu a pris le clavier, et réservée au texte qu'elle vise
  const [typeNow, setTypeNow] = useState<string | null>(openOn?.key === 'content' ? l.id : null);
  useEffect(() => {
    if (!openOn) return;
    setTabRaw(tabOfSec(openOn.sec));
    if (openOn.key === 'content') setTypeNow(l.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openOn]);

  const [focus, setFocus] = useState<string | null>(null);
  const [adding, setAdding] = useState<Section | null>(null);
  useEffect(() => {
    setFocus(null);
    setAdding(null);
  }, [l.id, tab]);
  const [tick, bump] = useState(0);
  const reload = () => bump((n) => n + 1);
  const items = itemsOf(l, doc);

  // vignettes des choix du catalogue ouvert : l'objet avec ce choix appliqué, calculées une à une sans bloquer
  const hintOf = (id: string) => HINTS[id] ?? HINTS[id.replace(/^[bg]-/, '')] ?? ['', ''];
  const depthGroup = (id: string) => (id.startsWith('v-') || id === 'extrude' ? 'Volume' : 'Relief');
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

  /** Une rangée de pastilles (filtre d'une photo, transformations, volume) avec son catalogue. */
  const card = (sec: Section, title: string) => {
    const mine = items.filter((x) => x.sec === sec);
    // les transformations se règlent pour toute la scène (boîte Scène) : ici on ne fait plus que retirer les anciennes
    const choices = sec === 'transform' ? [] : choicesOf(l, sec, doc);
    const one = sec === 'image';
    return (
      <div key={sec} className={`cp-card ap-card ${adding === sec ? 'open' : ''}`}>
        <div className="cp-h">
          <span className="cn">{title}</span>
          <div className="cp-items">
            {mine.map((it) => (
              <span key={it.key} className={`cp-item ${focused?.key === it.key ? 'on' : ''}`}>
                <button className="cp-nm" onClick={() => setFocus(it.key)}>
                  <span className={`sw ${shapeClass(it.sec)}`} style={{ background: it.bg }} />
                  <span className="nm">{it.name}</span>
                </button>
                {it.removable && (
                  <button
                    className="x"
                    title={`Retirer ${it.name}`}
                    aria-label={`Retirer ${it.name}`}
                    onClick={() => {
                      patch(removal(l, it.key));
                      setFocus(null);
                      onToast(`${it.name} retiré`, true);
                    }}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            {!mine.length && <span className="cp-empty">{SECTIONS.find((s) => s.sec === sec)!.empty}</span>}
          </div>
          {sec === 'depth' && onSculpt && (
            <button className="chip cp-sculpt" onClick={onSculpt} title="Modeler › Relief : bosser, creuser, lisser la surface au stylet">
              {l.bump ? 'Reprendre la sculpture' : 'Sculpter'}
            </button>
          )}
          {choices.length > 0 && (
            <button className="cp-add" onClick={() => setAdding(adding === sec ? null : sec)} title={`${one ? 'Changer' : 'Ajouter'} : ${title}`} aria-label={`${one ? 'Changer' : 'Ajouter'} : ${title}`}>
              <Icon name={one ? 'pen' : 'plus'} />
            </button>
          )}
        </div>
        {adding === sec && (
          <div className="cp-pick-wrap">
            {(() => {
              const groups: string[] = [];
              const fam = (id: string) => (sec === 'depth' ? depthGroup(id) : hintOf(id)[0]);
              for (const c of choices) if (!groups.includes(fam(c.id))) groups.push(fam(c.id));
              return groups.map((gname) => (
                <div key={gname || 'all'}>
                  {gname && <div className="cp-fam">{gname}</div>}
                  <div className="cp-pick">
                    {choices
                      .filter((c) => fam(c.id) === gname)
                      .map((c) => (
                        <button
                          key={c.id}
                          title={hintOf(c.id)[1] || undefined}
                          onClick={() => {
                            patch(c.patch);
                            setFocus(c.focus);
                            setAdding(null);
                          }}
                        >
                          <span className="thumb">{thumbs.get(c.id) ? <img src={thumbs.get(c.id)} alt="" /> : <span className="spin" aria-label="Chargement" />}</span>
                          <b>{c.name}</b>
                        </button>
                      ))}
                  </div>
                </div>
              ));
            })()}
          </div>
        )}
      </div>
    );
  };
  // l'élément dont les réglages s'affichent : celui touché, sinon le premier de l'onglet
  const cardSecs: Section[] = tab === 'depth' ? ['depth'] : tab === 'main' ? ['image', 'transform'] : [];
  const tabItems = items.filter((x) => cardSecs.includes(x.sec) && x.key !== 'paint' && x.key !== 'shape' && x.key !== 'content' && x.key !== 'text' && x.key !== 'warp' && x.key !== 'molded');
  const focused = tabItems.find((x) => x.key === focus) ?? tabItems[0];
  const attrsOf = (it: Item | undefined) => (it ? <Attrs layer={l} doc={doc} item={it} patch={patch} patchText={patchText} unmold={unmold} onMold={onMold} onSculpt={onSculpt} /> : null);
  const hasFx = (l.fx ?? []).some((x) => groupOf(x) === 'effet');
  // les transformations sont passées à la scène entière : un objet n'en garde que d'anciennes, à retirer
  const fxCard = hasFx ? card('transform', 'Anciennes transformations') : null;

  /** Bandeau du bas d'un objet modelé : ses attributs d'origine sont grisés jusqu'au retour. */
  const moldBar = l.molded && (
    <div className="ap-molded">
      <span>{l.kind === 'text' ? 'Texte modelé : ses lettres sont gardées de côté.' : l.kind === 'photo' ? 'Bord de la photo modelé.' : 'Forme modelée : son dessin d’origine est gardé de côté.'}</span>
      {onMold && (
        <button className="chip" onClick={onMold}>
          <Icon name="mold" /> Modeler encore
        </button>
      )}
      {unmold && (
        <button className="chip primary" onClick={unmold}>
          {l.kind === 'text' ? 'Revenir au texte' : l.kind === 'photo' ? 'Revenir au cadre' : 'Revenir à la forme'}
        </button>
      )}
    </div>
  );

  let body: React.ReactNode = null;
  if (tab === 'main' && l.kind === 'text' && l.text && patchText)
    body = (
      <>
        <TextTab key={l.id} text={l.text} locked={!!l.molded} onChange={patchText} typeNow={typeNow === l.id} onTyped={() => setTypeNow(null)} />
        {fxCard}
        {focused && attrsOf(focused)}
        {moldBar}
      </>
    );
  else if (tab === 'main' && l.kind === 'shape') {
    const it = items.find((x) => x.key === 'shape');
    body = (
      <>
        <div className={`ap-shape ${l.molded ? 'ap-locked' : ''}`}>{it && <Attrs bare layer={l} doc={doc} item={{ ...it, locked: false }} patch={patch} />}</div>
        {fxCard}
        {focused && attrsOf(focused)}
        {moldBar}
      </>
    );
  } else if (tab === 'main') {
    body = (
      <>
        {card('image', 'Filtre')}
        {fxCard}
        {focused && attrsOf(focused)}
        {moldBar}
      </>
    );
  } else if (tab === 'support') {
    const v = varnishOf(l);
    const vi = v ? (l.fx ?? []).indexOf(v) : -1;
    const g = doc.guides[l.guide];
    body = (
      <div className="ap-support">
        {l.kind !== 'photo' && (
          <div className="ap-tint" data-drop="tint">
            <button className="ap-slot" style={{ background: swatch(g) }} onClick={() => onPalette?.('color')} title="Teinte : glisse ici une couleur de la palette (toucher ouvre la palette)" aria-label="Teinte" />
            <span className="ap-slot-l">Teinte</span>
            <small>{g?.name ?? '—'}</small>
          </div>
        )}
        <div className="ap-rows">
          <SlotRow
            drop="varnish"
            label="Vernis"
            shape="shape-varnish"
            name={v ? (v.preset ?? fxOf(v.id)!.name) : undefined}
            bg={v ? varnishSwatch(v) : undefined}
            onSlot={() => onWizard?.('coat')}
            onRemove={() => {
              patch({ fx: (l.fx ?? []).filter((x) => x !== v) });
              onToast('Vernis retiré', true);
            }}
            hint="Glisse ici un vernis de la palette, ou touche le triangle pour l’assistant"
          >
            {v && <Attrs bare layer={l} doc={doc} item={{ sec: 'coat', key: `fx:${vi}`, name: '', bg: '', removable: true }} patch={patch} />}
          </SlotRow>
          <SlotRow
            drop="material"
            label="Matière"
            shape="shape-matter"
            name={l.material ? (l.material.preset ?? fxOf(l.material.id)!.name) : undefined}
            bg={l.material ? matterSwatch(l.material) : undefined}
            onSlot={() => onWizard?.('support')}
            onRemove={() => {
              patch({ material: undefined });
              onToast('Matière retirée', true);
            }}
            hint="Glisse ici une matière de la palette, ou touche l’hexagone pour l’assistant"
          >
            {l.material && <Attrs bare layer={l} doc={doc} item={{ sec: 'support', key: 'material', name: '', bg: '', removable: true }} patch={patch} />}
          </SlotRow>
        </div>
      </div>
    );
  } else if (tab === 'edge') {
    body = (
      <div className="ap-edges">
        {EDGE_SLOTS.map(([k, label]) => {
          const has = !!l[k];
          const what = k === 'glow' ? 'une lueur' : k === 'trim' ? 'un rognage' : 'un bord';
          return (
            <div key={k} className={`ap-ecard ${has ? '' : 'empty'}`} data-drop={`edge-${k}`}>
              <div className="ap-ecard-h">
                <button className={`ap-slot shape-edge ${has ? '' : 'empty'}`} onClick={() => onWizard?.('edge')} title={`Glisse ici ${what} de la palette (onglet Bords), ou touche le carré pour l’assistant`} aria-label={`${label} : assistant`}>
                  {has ? <EdgeGlyph edge={{ [k]: l[k] }} doc={doc} size={40} /> : <span className="ap-plus">＋</span>}
                </button>
                <span className="ap-ecard-t">
                  <span className="ap-slot-l">{label}</span>
                  <small>{has ? edgeName(k, l) : 'Vide'}</small>
                </span>
                {has && (
                  <button
                    className="ap-x"
                    onClick={() => {
                      patch(removal(l, k));
                      onToast(`${label} retiré${k === 'glow' ? 'e' : ''}`, true);
                    }}
                    title={`Retirer : ${edgeName(k, l)}`}
                    aria-label={`Retirer ${label}`}
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="ap-ecard-b">
                {has ? <Attrs bare layer={l} doc={doc} item={{ sec: 'edge', key: k, name: '', bg: '', removable: true }} patch={patch} /> : <p className="ap-hint">Dépose {what} de la palette ici, ou touche le carré.</p>}
              </div>
            </div>
          );
        })}
      </div>
    );
  } else if (tab === 'depth') {
    body = (
      <>
        {card('depth', 'Volume')}
        {focused && attrsOf(focused)}
      </>
    );
  }

  return (
    <aside className="coupe with-list ap" aria-label={`Attributs de « ${l.name} »`}>
      <div className="ap-grid">
        {list}
        <div className="ap-right">
          <div className="ap-tabs" role="tablist">
            {tabs.map(([t, name]) => (
              <button key={t} role="tab" aria-selected={t === tab} className={`ap-tab ${t === tab ? 'on' : ''}`} onClick={() => setTab(t)}>
                {name}
              </button>
            ))}
            <button className="ap-close" onClick={onClose} aria-label="Fermer">
              ×
            </button>
          </div>
          <div className={`ap-pane ap-${tab}`} role="tabpanel">
            {body}
          </div>
        </div>
      </div>
    </aside>
  );
}

/** Un emplacement (vernis, matière, bord) : sa pastille à gauche, ses réglages à côté. */
function SlotRow({
  drop,
  label,
  shape,
  name,
  bg,
  glyph,
  onSlot,
  onRemove,
  hint,
  children,
}: {
  drop: string;
  label: string;
  shape: string;
  name?: string;
  bg?: string;
  glyph?: React.ReactNode;
  onSlot: () => void;
  onRemove: () => void;
  hint: string;
  children?: React.ReactNode;
}) {
  const empty = name === undefined;
  return (
    <div className={`ap-row ${empty ? 'empty' : ''}`} data-drop={drop}>
      <div className="ap-slot-col">
        <button className={`ap-slot ${shape} ${empty ? 'empty' : ''}`} style={bg ? { background: bg, backgroundSize: 'cover' } : undefined} onClick={onSlot} title={hint} aria-label={`${label} : assistant`}>
          {empty ? <span className="ap-plus">＋</span> : glyph}
        </button>
        <span className="ap-slot-l">{label}</span>
        {!empty && (
          <span className="ap-slot-n">
            <small title={name}>{name}</small>
            <button className="ap-x" onClick={onRemove} title={`Retirer : ${name}`} aria-label={`Retirer ${label}`}>
              ×
            </button>
          </span>
        )}
      </div>
      <div className="ap-params">{empty ? <p className="ap-hint">{hint}.</p> : children}</div>
    </div>
  );
}

/** Onglet Texte : le contenu en grand, l'alignement, la police (dans sa boîte), la disposition et les potards. */
function TextTab({
  text: t,
  locked,
  onChange,
  typeNow,
  onTyped,
}: {
  text: TextStyle;
  locked: boolean;
  onChange: (next: Partial<TextStyle>, history: boolean) => void;
  /** Le contenu prend le clavier (double toucher sur ce texte, ou texte qu'on vient de poser). */
  typeNow: boolean;
  onTyped: () => void;
}) {
  const first = useRef(true);
  const [draft, setDraft] = useLazyText(t.content, (v) => {
    onChange({ content: v }, first.current);
    first.current = false;
  });
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!typeNow || locked) return;
    const id = setTimeout(() => {
      onTyped();
      const a = area.current;
      if (!a || document.activeElement === a) return;
      a.focus();
      a.select();
    }, 60);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeNow, locked]);
  const live = useStep(onChange);
  const [fonts, setFonts] = useState(false);
  const lines = draft.split('\n').length;
  const lead = t.leading ?? 1.1;
  const variable = fontOf(t.font).files.some((x) => x.weightMax);
  return (
    <div className={`ap-text ${locked ? 'ap-locked' : ''}`} aria-disabled={locked || undefined}>
      <textarea
        ref={area}
        className="ap-area"
        rows={Math.min(4, Math.max(2, lines))}
        value={draft}
        disabled={locked}
        spellCheck
        placeholder="Votre texte (Entrée pour une nouvelle ligne)"
        style={{ fontFamily: `${fontFamily(t.font)}, Inter, sans-serif`, fontWeight: t.weight, fontStyle: t.italic ? 'italic' : 'normal', textAlign: t.align }}
        onFocus={() => (first.current = true)}
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="ap-tools">
      <div className="ap-ctl">
        <div className="ap-ctl-row">
          <div className="seg tb-align" title={lines > 1 ? undefined : 'L’alignement agit sur un texte de plusieurs lignes'}>
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} className={t.align === a ? 'on' : ''} onClick={() => onChange({ align: a }, true)} title={{ left: 'À gauche', center: 'Centré', right: 'À droite' }[a]}>
                <AlignGlyph a={a} />
              </button>
            ))}
          </div>
          <button className="ap-font" onClick={() => setFonts(true)} title="Police : choisir parmi les polices activées" style={{ fontFamily: `${fontFamily(t.font)}, Inter, sans-serif` }}>
            {fontOf(t.font).family}
          </button>
        </div>
        <div className="seg tb-warps">
          {WARPS.map((w) => (
            <button key={w.id} className={(t.warp?.kind ?? 'none') === w.id ? 'on' : ''} onClick={() => onChange({ warp: w.id === 'none' ? undefined : { kind: w.id, amount: t.warp?.amount || 0.5 } }, true)} title={w.name}>
              <WarpGlyph k={w.id} />
            </button>
          ))}
        </div>
      </div>
      <div className="ap-knobs">
        <Range label="Graisse" display={`${weightName(t.weight)}${variable ? '' : '*'}`} value={(t.weight - 100) / 800} onChange={(v) => live('weight', { weight: 100 + Math.round(v * 80) * 10 })} />
        <div className="cp-dial" title="Inclinaison : glisser à droite ou à gauche ; dès 8° à droite le texte passe en italique">
          <TiltPad label="Inclinaison" axis="x" size={46} x={leanOf(t) / 30} display="" onChange={(x) => live('lean', withLean(Math.round(x * 30)))} />
          <span className="cp-dial-l">Inclinaison</span>
          <output>
            {leanOf(t)}°{t.italic ? ' it.' : ''}
          </output>
        </div>
        <Range label="Espace" min={-0.2} value={(t.tracking ?? 0) / 0.5} display={`${Math.round((t.tracking ?? 0) * 100)}`} onChange={(v) => live('tracking', { tracking: Math.round(v * 50) / 100 })} />
        <div className={lines > 1 ? 'cp-dial-wrap' : 'cp-dial-wrap off'} title={lines > 1 ? undefined : 'L’interligne agit sur un texte de plusieurs lignes'}>
          <Range
            label="Interligne"
            min={-1}
            value={(lead - 1) / 0.7}
            display={`${lead >= 1 ? '+' : '−'}${Math.round(Math.abs(lead - 1) * 100)}`}
            onChange={(v) => live('leading', { leading: Math.round((1 + v * 0.7) * 100) / 100 })}
          />
        </div>
        {t.warp && <Range label="Courbure" min={-1} value={t.warp.amount} display={`${Math.round(t.warp.amount * 100)}`} onChange={(v) => live('warp', { warp: { ...t.warp!, amount: Math.round(v * 50) / 50 } })} />}
      </div>
      </div>
      {fonts && createPortal(<FontDialog text={t} onPick={(id) => onChange({ font: id }, true)} onClose={() => setFonts(false)} />, document.body)}
    </div>
  );
}

/** Boîte des polices : celles activées pour les compositions (Configuration globale › Polices), chacune montrée avec le texte. */
function FontDialog({ text: t, onPick, onClose }: { text: TextStyle; onPick: (id: string) => void; onClose: () => void }) {
  const [, ready] = useState(0);
  useEffect(() => {
    let stop = false;
    void loadFonts().then(() => Promise.all(fontsFor('compositions').map((x) => ensureFont(x.id))).then(() => !stop && ready((n) => n + 1)));
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => {
      stop = true;
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);
  const sample = (t.content || 'Aa').split('\n')[0]!.slice(0, 18);
  return (
    <div className="color-dialog font-dialog" role="dialog" aria-label="Police">
      <button className="lamp-close cd-close" onClick={onClose} aria-label="Fermer">
        ×
      </button>
      <div className="cd-head">
        <b>Police</b>
        <small className="cd-kind">{fontOf(t.font).family}</small>
      </div>
      <div className="fd-grid">
        {fontsFor('compositions').map((ft) => (
          <button
            key={ft.id}
            className={ft.id === t.font ? 'on' : ''}
            onClick={() => {
              onPick(ft.id);
              onClose();
            }}
          >
            <span className="fd-sample" style={{ fontFamily: `${fontFamily(ft.id)}, Inter, sans-serif`, fontWeight: t.weight, fontStyle: t.italic ? 'italic' : 'normal' }}>
              {sample}
            </span>
            <small>{ft.family}</small>
          </button>
        ))}
      </div>
    </div>
  );
}


/**
 * Teinte d'un réglage : une pastille de la taille d'un potard. Doigt posé, la palette s'affiche en petit
 * dessous ; glisser à droite ou à gauche défile dans l'ordre (et revient), relâcher garde la teinte.
 * Un simple toucher passe à la suivante. Une couleur de la palette déposée sur la zone du réglage
 * (la plaque, le formulaire) arrive ici par l'événement « tint-drop ».
 */
const TINT_STEP = 22;
export function Dots({ label, value, doc, onPick }: { label: string; value: number; doc: Doc; onPick: (i: number) => void }) {
  const n = doc.guides.length;
  const ref = useRef<HTMLDivElement>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const cur = useRef(value);
  cur.current = value;
  const drag = useRef<{ id: number; x0: number; i0: number; moved: boolean } | null>(null);
  const [strip, setStrip] = useState<{ cx: number; top: number; i0: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = (e: Event) => pick.current((e as CustomEvent<number>).detail);
    el.addEventListener('tint-drop', on);
    return () => el.removeEventListener('tint-drop', on);
  }, []);
  const step = (d = 1) => n && pick.current((((cur.current + d) % n) + n) % n);
  const end = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setStrip(null);
    if (!d.moved && e.type === 'pointerup') step();
  };
  const g = doc.guides[value];
  return (
    <div className="cp-dial cp-tint" ref={ref} data-tint title={`${label} : glisser à droite ou à gauche pour changer de couleur, toucher pour la suivante, ou déposer une couleur de la palette`}>
      <button
        className={`tint-b ${strip ? 'held' : ''}`}
        style={{ background: g ? swatch(g) : undefined }}
        aria-label={`${label} : ${g?.name ?? 'aucune'}`}
        onPointerDown={(e) => {
          if (e.button || !n) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { id: e.pointerId, x0: e.clientX, i0: cur.current, moved: false };
          const r = e.currentTarget.getBoundingClientRect();
          setStrip({ cx: r.left + r.width / 2, top: r.bottom + 6, i0: cur.current });
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          const dx = e.clientX - d.x0;
          if (Math.abs(dx) > 6) d.moved = true;
          const i = Math.max(0, Math.min(n - 1, d.i0 + Math.round(dx / TINT_STEP)));
          if (i !== cur.current) pick.current(i);
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') step(-1);
          else if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') step(1);
          else return;
          e.preventDefault();
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="tint-ring" aria-hidden>
          {doc.guides.map((x, i) => (
            <i key={i} className={i === value ? 'on' : ''} style={{ background: swatch(x), transform: `rotate(${(i / Math.max(1, n)) * 360}deg) translateY(calc(var(--tint-r, 19.5px) * -1))` }} />
          ))}
        </span>
      </button>
      <span className="cp-dial-l">{label}</span>
      <output>{g?.name ?? '—'}</output>
      {strip &&
        createPortal(
          // la palette en petit, la teinte choisie sous le doigt : elle défile avec le geste
          <div className="tint-strip" style={{ top: strip.top, left: strip.cx - (value + 0.5) * TINT_STEP }} aria-hidden>
            {doc.guides.map((x, i) => (
              <i key={i} className={i === value ? 'on' : ''} style={{ background: swatch(x) }} />
            ))}
            <b style={{ left: (value + 0.5) * TINT_STEP }}>{g?.name}</b>
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * Réglage rotatif : un potard, et sous lui sa légende (nom et valeur) en texte simple.
 * Les potards d'un formulaire s'alignent côte à côte, en bas, après les choix.
 */
export function Range({ label, value, onChange, unit, min = 0, display }: { label: string; value: number; onChange: (v: number) => void; unit?: string; min?: number; display?: string }) {
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
export function Attrs({
  layer: l,
  doc,
  item,
  patch,
  patchText,
  unmold,
  onMold,
  onSculpt,
  bare,
}: {
  layer: Layer;
  doc: Doc;
  item: Item;
  /** Sans titre ni cadre : les réglages seuls, posés à côté de leur emplacement. */
  bare?: boolean;
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
  if (bare) return <div className="cp-attrs ap-attrs">{body}</div>;
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
