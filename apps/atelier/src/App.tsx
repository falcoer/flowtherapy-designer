import { FRAME_TITLES, ANCHOR_FRAMES, type AnchorFrame, type Format } from '@ftd/core';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LEAN, paintStroke, previewStampInk, previewStamps, type InkLive, type Target } from './brush';
import { canSpill, inkRings, inWin, spillWindow, type Win } from './spill';
import { steadyPath } from './steady';
import { afterPen, fingerDrawsFor, ignoreTouch, pointerTool } from './finger';
import { STAMPS, stampOf, stampSvg, type StampDef } from './stamps';
import { CoupePanel } from './coupe';
import { LibraryShelf, RailScroll, SHELVES, type DrawerShelf, type LibItem } from './library';
import { PrefsPanel, type FingerMode, type Theme } from './prefs';
import { PointGrids } from './anchor-ui';
import { BrushWheel } from './wheel';
import { SHIFT_IDLE, shiftButtonOn, shiftDown, shiftHeld, shiftUp, tiltStep, wheelAction, wheelDevice, zoomFactor } from './shift';
import { ParallaxView } from './parallax';
import { kitFromSvg, nearestOf, SAME_COLOR, type Kit } from './kits';
import { KITS } from './kit-samples';
import { blankBump, bumpHeights, dab, encodeBump, heightUnder, smoothBump } from './bump';
import { currentPx, growPatch, localToPx, MOLD_UNIT, moldPatch, pristinePx, unitPx, unmoldPatch } from './mold';
import { ensureFont, fontFamily, loadFonts, onFontReady, swashPoint, swashWidth, TEXT_PRESETS, textCut, textEm, textEpoch, type Mold, type Swash, type TextPreset, type TextStyle } from './text';
import { type SwashTool } from './textbar';
import { ColorDialog, swatch } from './color-dialog';
import { GradientOverlay } from './gradient-ui';
import { isClosed, recognize } from './shapes';
import { blankDoc } from './blank';
import { download, exportSize, fileName, pdfOf, pngOf, renderDoc, renderLayers } from './export';
import { ObjetsShelf } from './objets-shelf';
import { objetLayers, packObjet, readObjet, saveObjet, unpackObjet, type ObjetEntry } from './objets';
import { ActivityForm, ActivityMark, ActivityMenu, UserButton, UserMenu } from './activity';
import { fetchActivity, type ActivityEvent, copyAtelier, createCampaign, fetchMe, fetchProfile, listAteliers, listCampaigns, palettesOf, updateCampaign, voteAtelier, type Campaign, type CampaignInput, type Operation, newAtelierId, proposeAtelier, readAtelier, removeAtelier, reviewAtelier, saveAtelier, serverOnline, thumbUrl, type ActivityProfile, type AtelierMeta, type Me, type Palette } from './server';
import { channelsOf, docForTarget, operationsOf, paletteFor, paletteGuides, recolor, ROLE_SHORT, defaultLabel, targetKey, targetLabel } from './targets';
import { Knob } from './knob';
import { MediaIcon, PublicationsPanel, VariantBar } from './targets-ui';
import { CampaignDialog } from './campaigns-ui';
import { NewCompositionDialog } from './compositions-ui';
import { CompositionMenu, CompositionsMenu, TopCrumbs } from './compositions-menu';
import { CampaignSheet, planFromOperation } from './campaign-sheet';
import { MessagesButton, MessagesDialog } from './messages-ui';
import { FeedButton, FeedDialog, overdueOf, unreadCount } from './feed-ui';
import { anchorPointOf, anchorsOf, objectGrips, ungrip, compact, setAnchorExtras, cssGradient, DEFAULT_DENSITY, shapeOf, DEFAULT_SHAPE, type GradShape, DENSITY_STEPS, edgeLines, genPath, marginOf, pinLine, setAnchorDensity, setAnchorMargin, docMargins, hasMargins, type Pin, type AnchorExtras, type Target as PubTarget } from './model';
import { isSilhouette, SHAPE_FAMILIES, silhouetteRatio, silhouetteRings } from './silhouettes';
import { Icon } from './icons';
import { BRUSH_TIPS, TIP_NAMES, isComposite, tipHoverSvg, type BrushTip } from './tips';
import {
  anchorFor,
  FORMATS,
  formatOf,
  guideColor,
  layerBox,
  shapePath,
  simplify,
  uid,
  type Doc,
  type Guide,
  type Lamp,
  type Layer,
  type Volume,
  type Pt,
  type BorderStyle,
  type GlowStyle,
  type BrushKind,
  type ShapeKind,
  type Stroke,
} from './model';
import { type Ring, geomArea, insideRings, intersect, nearRings, ringsOfGeom, ringsToPath, simplifyRing, splitByCut, subtract } from './cut';
import { applyPixelFx, DRAW_FX, FX, FX_GROUPS, fxGuides, fxOf, isMaterial, MATERIALS, newFx, type Fx, type FxGroup, type FxId } from './fx';
import { applyLook, lookGuides, lookOf, LOOKS, type LookId, type LookSettings } from './looks';
import { analyse, analysisSize, EdgeGrid, edgeMap, type EdgeMap, type EdgeMode } from './edges';
import { FanButton } from './fan';
import { anchorKind, loadMarkColors, marksOfFrame, markColor, pinKind, saveMarkColors, setMarkColors, type MarkKind } from './marks';
import { MarkLegend } from './marks-ui';
import type { MultiPolygon } from 'polygon-clipping';
import { maskImage, segmentSubject, setSubjectImage, SUBJECT_SIZE, subjectGeom, type SubjectCrop, type SubjectMask, type SubjectStroke } from './subject';
import {
  borderOut,
  drawLampTint,
  lampOf,
  levelOf,
  renderOrder,
  cutOf,
  holdPins,
  linkShapes,
  imageFor,
  localBounds,
  layerMatrix,
  localToPage,
  pageBounds,
  pageToLocal,
  pinsOf,
  drawChecker,
  drawLayers,
  forgetPaint,
  holdPaint,
  prunePaints,
  localRings,
  maskPath2D,
  maskRings,
  paintTarget,
  tracePath,
} from './scene';

type Tool = 'cut' | 'paint' | 'mold' | 'stamp' | 'filter' | 'transform' | 'material' | 'coat' | 'edge' | 'move';
/** Les cinq sections du mode Modifier l'objet, dans l'ordre de la barre. */
type EditTool = 'filter' | 'transform' | 'material' | 'coat' | 'edge';
const EDIT_SECTIONS: Array<[EditTool, string, string]> = [
  ['filter', 'Filtres', 'filter'],
  ['transform', 'Transfo.', 'fx'],
  ['material', 'Matière', 'material'],
  ['coat', 'Revêtement', 'coat'],
  ['edge', 'Bords', 'frame'],
];
const isEdit = (t: Tool): t is EditTool => EDIT_SECTIONS.some(([k]) => k === t);
type Bubble = 'activity' | 'activity-edit' | 'user' | 'prefs' | 'add' | 'layers' | 'palette' | 'light' | 'format' | 'projects' | 'composition' | 'export' | null;
type View = { zoom: number; rot: number; px: number; py: number };

const STORE = 'ftd-atelier-doc-v2';
/** Composition dont la copie locale (entière) porte des retouches pas encore enregistrées sur le serveur. */
const PENDING = 'ftd-atelier-pending';
const setPending = (id: string | null) => {
  try {
    if (id) localStorage.setItem(PENDING, id);
    else localStorage.removeItem(PENDING);
  } catch {
    /* stockage indisponible */
  }
};
const pendingId = () => {
  try {
    return localStorage.getItem(PENDING);
  } catch {
    return null;
  }
};

const TOP = 52;
/** Rayon d'attraction des ancrages, en pixels écran. */
const MAGNET = 30;

/**
 * Bords tenus d'un objet : la ligne de page ou de marge à laquelle il se tient
 * est rappelée en fin trait sur toute la page, et le bord de l'objet qui la
 * touche est souligné en gros, dans la couleur de cette ligne.
 */
function drawHeldEdges(ctx: CanvasRenderingContext2D, l: Layer, pins: NonNullable<Layer['pins']>, f: Format, px: number) {
  const bb = pageBounds(l, f);
  const hasMargin = !!edgeLines(f).margin;
  ctx.save();
  ctx.lineCap = 'round';
  for (const side of ['left', 'right', 'top', 'bottom'] as const) {
    const p = pins[side];
    if (!p) continue;
    const c = markColor(pinKind(p, hasMargin));
    const at = pinLine(f, side, p);
    const v = side === 'left' || side === 'right';
    const seg = (a: number, b: number) => {
      ctx.beginPath();
      if (v) {
        ctx.moveTo(at, a);
        ctx.lineTo(at, b);
      } else {
        ctx.moveTo(a, at);
        ctx.lineTo(b, at);
      }
      ctx.stroke();
    };
    // la ligne tenue, d'un bout à l'autre de la page
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.5 * px;
    seg(0, v ? f.height : f.width);
    // le bord de l'objet qui s'y tient
    ctx.globalAlpha = 1;
    const [a, b] = v ? [bb.y0, bb.y1] : [bb.x0, bb.x1];
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 8 * px;
    seg(a, b);
    ctx.strokeStyle = c;
    ctx.lineWidth = 5 * px;
    seg(a, b);
  }
  ctx.restore();
}
/** Rayon d'aimantation des ciseaux sur les contours détectés, en pixels écran. */
const EDGE_RADIUS = 14;
export const BORDER_TYPES: Array<[BorderStyle | null, string, string]> = [
  [null, 'Aucun', 'pas de bord'],
  ['round', 'Arrondi', 'suit la découpe'],
  ['straight', 'Droit', 'à facettes'],
  ['torn', 'Déchiré', 'papier arraché'],
  ['stamp', 'Timbre', 'bord dentelé perforé'],
  ['burst', 'Explosion', 'pointes irrégulières'],
  ['double', 'Double', 'deux couleurs'],
];
/** Pinceaux qui acceptent une forme de brosse. */
const tipOn = (k: BrushKind) => k === 'aquarelle' || k === 'acrylic' || k === 'roller';
/** Pinceaux qui suivent l'inclinaison (la ramure et la brûlure poussent d'elles-mêmes). */
const leanOn = (k: BrushKind) => k !== 'branch' && k !== 'burn';
/** Les trois façons de modeler une forme. */
const MOLD_MODES = [
  { key: 'mold', label: 'Modeler', hint: 'de l’intérieur on tire le contour, de l’extérieur on le repousse', icon: <Icon name="mold" /> },
  {
    key: 'orn',
    label: 'Plume',
    hint: 'un trait fin, plein et délié, ajouté au contour',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 20c1-5 3-9 8-13l5 5c-4 5-8 7-13 8z" />
        <path d="M4 20l6-6" />
        <circle cx="11.5" cy="12.5" r="1.3" />
      </svg>
    ),
  },
  {
    key: 'relief',
    label: 'Relief',
    hint: 'sculpter la surface, bosses et creux éclairés par la lampe',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 18h20" />
        <path d="M3 18c3 0 4-8 9-8s6 8 9 8" />
        <path d="M9 12.5c1-1 2-1.4 3-1.4" opacity="0.6" />
      </svg>
    ),
  },
];
type TipKind = 'round' | 'flat' | 'triangle';
/** Pointe du mode de modelage en cours, et son angle à l'écran : chaque mode garde la sienne (Plume : plate, bec à 45°). */
const moldTip = (s: SwashTool): { tip: TipKind; rot: number } =>
  s.mode === 'orn' ? { tip: s.ornTip ?? 'flat', rot: s.ornRot ?? -Math.PI / 4 } : s.mode === 'relief' ? { tip: s.reliefTip ?? 'round', rot: s.reliefRot ?? 0 } : { tip: s.tip ?? 'round', rot: s.rot ?? 0 };
const withMoldTip = (s: SwashTool, t: { tip?: TipKind; rot?: number }): SwashTool => {
  const [tk, rk] = s.mode === 'orn' ? (['ornTip', 'ornRot'] as const) : s.mode === 'relief' ? (['reliefTip', 'reliefRot'] as const) : (['tip', 'rot'] as const);
  return { ...s, ...(t.tip ? { [tk]: t.tip } : {}), ...(t.rot !== undefined ? { [rk]: t.rot } : {}) };
};
/** Relief : bosser, creuser, niveler. */
const SCULPT_MODES = [
  {
    key: 'raise',
    label: 'Bosser',
    hint: 'la pointe soulève la surface',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 16c4 0 5-7 9-7s5 7 9 7" />
        <path d="M12 20v-6m-2.5 2.5L12 14l2.5 2.5" />
      </svg>
    ),
  },
  {
    key: 'dig',
    label: 'Creuser',
    hint: 'la pointe enfonce la surface',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9c4 0 5 7 9 7s5-7 9-7" />
        <path d="M12 4v6m-2.5-2.5L12 10l2.5-2.5" />
      </svg>
    ),
  },
  {
    key: 'level',
    label: 'Niveler',
    hint: 'aplanit bosses et creux à la hauteur où le geste commence',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 13h4c1 0 1.5-3 3-3h4c1.5 0 2 6 3.5 6S19 13 21 13" strokeDasharray="2 2" opacity="0.6" />
        <path d="M3 13h18" />
        <path d="M12 4v5m-2.5-2.5L12 9l2.5-2.5M12 20v-3.5" />
      </svg>
    ),
  },
] as const;
const BRUSHES: Array<[BrushKind, string, string]> = [
  ['aquarelle', 'Aquarelle', 'lavis transparent'],
  ['acrylic', 'Acrylique pinceau', 'pâte couvrante striée'],
  ['roller', 'Acrylique rouleau', 'bande large pochée'],
  ['spray', 'Acrylique pistolet', 'nuage de gouttelettes'],
  ['glitter', 'Paillettes', 'éclats qui scintillent'],
  ['hair', 'Poils', 'brins fins effilés'],
  ['branch', 'Ramures', 'veines, racines : la couleur se propage'],
  ['burn', 'Brûlure', 'consume la couche, lisière de braise'],
];
export const GLOW_TYPES: Array<[GlowStyle | null, string, string]> = [
  [null, 'Aucune', 'pas de lueur'],
  ['neon', 'Néon', 'tube lumineux'],
  ['laser', 'Laser', 'faisceaux droits, impact'],
  ['electric', 'Électricité', 'éclairs et branches'],
  ['particles', 'Particules', 'poussière lumineuse'],
  ['smoke', 'Fumée', 'volutes douces'],
  ['halo', 'Halo lumineux', 'lueur large et diffuse'],
  ['aura', 'Énergie', 'aura de flammes'],
  ['fire', 'Flammes', 'langues de feu qui montent'],
];
export { swatch };
const EDGE_MODES: Array<[EdgeMode, string, string]> = [
  ['contrast', 'Contraste', 'bords de lumière'],
  ['color', 'Couleur', 'bords de teinte'],
  ['both', 'Les deux', 'lumière et teinte'],
];

const LINK_FX_MS = 900;

function load(): Doc {
  try {
    const s = localStorage.getItem(STORE);
    if (s) return migrate(JSON.parse(s) as Doc);
  } catch {
    /* stockage indisponible */
  }
  return blankDoc();
}

/** Remet à jour un document enregistré par une version plus ancienne de l'atelier. */
function migrate(d: Doc): Doc {
  {
    {
      // anciens documents : découpe polygonale → tracé
      for (const l of d.layers) {
        // biseau séparé de la hauteur : les anciens documents gardent leur relief
        if (l.bevel === undefined) l.bevel = l.kind === 'surface' ? 0 : Math.round(l.height * 60) / 100;
        // effets de cadre passés dans l'outil Bords
        const old = (l.fx ?? []) as Array<{ id: string; guides: number[]; amount: number }>;
        for (const e of old) {
          if (e.id === 'inner') l.inner = e.amount;
          if (e.id === 'neon') l.glow = { style: 'neon', guide: e.guides[0] ?? 3, distance: 0, width: e.amount };
          if (e.id === 'sticker' && !l.border) l.border = { style: 'double', guide: e.guides[0] ?? 6, guide2: e.guides[1] ?? 1, width: 0.004 + e.amount * 0.03 };
        }
        if (l.fx) l.fx = l.fx.filter((e) => fxOf(e.id));
        // filtres dessin passés dans les transformations
        if (l.look?.draw) {
          l.fx = [l.look.draw, ...(l.fx ?? [])];
          l.look = l.look.style ? { ...l.look, draw: undefined } : undefined;
        }
        // grain, papiers, carton : devenus des matières (une seule par couche)
        if (l.fx?.some((e) => isMaterial(e.id))) {
          if (!l.material) l.material = l.fx.filter((e) => isMaterial(e.id)).pop();
          l.fx = l.fx.filter((e) => !isMaterial(e.id));
          if (!l.fx.length) delete l.fx;
        }
        if ((l.border?.style as string) === 'zigzag') l.border!.style = 'stamp';
      }
      for (const l of d.layers)
        if (l.mask) {
          l.cut = ringsToPath([l.mask], 0.001);
          delete l.mask;
        }
    }
  }
  return d;
}


/** Le document affiché sur une de ses publications : format, marge du média, couleurs de la variante ; les bords tenus et les pièces solidaires suivent. */
function docAtTarget(d: Doc, i: number, activity: ActivityProfile | null): Doc {
  const t = d.targets?.[i];
  if (!t) return d;
  const next = docForTarget(d, t, activity);
  if (d.formatId === t.format && JSON.stringify(docMargins(next)) === JSON.stringify(docMargins(d))) return { ...next, target: i };
  setAnchorMargin(docMargins(d));
  const links = linkShapes(d, formatOf(d.formatId));
  setAnchorMargin(docMargins(next));
  return { ...holdPins({ ...next, formatId: t.format }, formatOf(t.format), links), target: i };
}

export function App() {
  const [doc, setDoc] = useState<Doc>(load);
  const docRef = useRef(doc);
  docRef.current = doc;
  const past = useRef<string[]>([]);
  const future = useRef<string[]>([]);
  const [, force] = useState(0);
  const redraw = useCallback(() => force((n) => n + 1), []);
  // la peinture en cache des couches retirées est lâchée (mémoire des canevas, limitée sur iPad)
  const layerIds = doc.layers.map((l) => l.id).join(' ');
  useEffect(() => prunePaints(layerIds.split(' ')), [layerIds]);
  // polices : la liste d'abord, puis les fichiers des polices utilisées par les textes
  useEffect(() => onFontReady(redraw), [redraw]);
  const usedFonts = doc.layers
    .map((l) => l.text?.font)
    .filter(Boolean)
    .join(',');
  useEffect(() => {
    void loadFonts().then(() =>
      usedFonts
        .split(',')
        .filter(Boolean)
        .forEach((id) => void ensureFont(id)),
    );
  }, [usedFonts]);

  /** Modifie le document en gardant l'historique (annuler / rétablir). */
  const update = useCallback((fn: (d: Doc) => Doc) => {
    past.current.push(JSON.stringify(docRef.current, compact));
    if (past.current.length > 60) past.current.shift();
    future.current = [];
    setDoc((d) => fn(structuredClone(d)));
  }, []);
  /** Réglage en direct d'une couleur : la peinture posée attend la fin du geste pour se refaire. */
  const liveT = useRef(0);
  const livePaint = (live: boolean) => {
    clearTimeout(liveT.current);
    holdPaint(true);
    // pendant le geste : on attend qu'il se calme ; au choix fini, la boîte répond d'abord, la page suit
    liveT.current = window.setTimeout(
      () => {
        holdPaint(false);
        setDoc((d) => ({ ...d }));
      },
      live ? 350 : 40,
    );
  };
  const undo = useCallback(() => {
    const s = past.current.pop();
    if (!s) return;
    future.current.push(JSON.stringify(docRef.current, compact));
    forgetPaint();
    setDoc(JSON.parse(s));
    setToast('Annulé');
  }, []);
  const redo = useCallback(() => {
    const s = future.current.pop();
    if (!s) return;
    past.current.push(JSON.stringify(docRef.current, compact));
    forgetPaint();
    setDoc(JSON.parse(s));
    setToast('Rétabli');
  }, []);

  // copie locale : elle ne sert de référence au rechargement que si elle a pu être écrite en entier
  const localOk = useRef(true);
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(doc, compact));
      localOk.current = true;
    } catch {
      /* photo trop lourde pour le stockage local : on garde en mémoire */
      localOk.current = false;
    }
  }, [doc]);
  /** Document montré au démarrage (copie locale) : tant qu'on n'y a pas touché, le serveur peut le remplacer. */
  const startDoc = useRef(doc);

  // --- compositions du groupe, enregistrées sur le serveur ---
  const [online, setOnline] = useState<boolean | null>(null);
  const [project, setProjectState] = useState<{ id: string; title: string } | null>(() => {
    try {
      return JSON.parse(localStorage.getItem('ftd-atelier-project') ?? 'null');
    } catch {
      return null;
    }
  });
  const setProject = (p: { id: string; title: string } | null) => {
    setProjectState(p);
    try {
      localStorage.setItem('ftd-atelier-project', JSON.stringify(p));
    } catch {
      /* préférence non retenue */
    }
  };
  const [saving, setSaving] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');
  const [projects, setProjects] = useState<AtelierMeta[]>([]);
  useEffect(() => {
    void serverOnline().then(setOnline);
  }, []);
  // qui est connecté, et son rôle dans l'équipe active (proposer, valider)
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    if (online) fetchMe().then(setMe, () => setMe(null));
  }, [online]);
  // fiche de l'activité : canaux, palettes (pour partir d'un canal)
  const [activity, setActivity] = useState<ActivityProfile | null>(null);
  const loadActivity = () => {
    if (me?.team) fetchProfile(me.team.id).then(setActivity, () => setActivity(null));
    else setActivity(null);
  };
  useEffect(loadActivity, [me?.team?.id]);
  // campagnes de l'activité, et celle que l'on suit (retenue par activité dans ce navigateur)
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const campaignKey = `ftd-campagne-${me?.team?.id ?? ''}`;
  const [campaign, setCampaignRaw] = useState('');
  const setCampaign = (id: string) => {
    setCampaignRaw(id);
    try {
      localStorage.setItem(campaignKey, id);
    } catch {
      /* stockage indisponible */
    }
  };
  const loadCampaigns = () => {
    if (online && me?.team) listCampaigns().then(setCampaigns, () => setCampaigns([]));
  };
  useEffect(() => {
    loadCampaigns();
    try {
      setCampaignRaw(localStorage.getItem(campaignKey) ?? '');
    } catch {
      setCampaignRaw('');
    }
  }, [online, me?.team?.id]);
  // fil de l'activité : relu chaque minute ; la dernière visite est retenue par activité dans ce navigateur
  const [feed, setFeed] = useState<ActivityEvent[] | null>(null);
  const [feedOpen, setFeedOpen] = useState(false);
  const feedKey = `ftd-fil-${me?.team?.id ?? ''}`;
  const readSeen = () => {
    try {
      return localStorage.getItem(feedKey) ?? '';
    } catch {
      return '';
    }
  };
  const [feedSeen, setFeedSeen] = useState('');
  useEffect(() => {
    setFeedSeen(readSeen());
    if (!online || !me?.team) return setFeed(null);
    const load = () => void fetchActivity().then(setFeed, () => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, me?.team?.id]);
  const openFeed = () => {
    setFeedOpen(true);
    void fetchActivity().then(setFeed, () => {});
    try {
      localStorage.setItem(feedKey, new Date().toISOString());
    } catch {
      /* stockage indisponible */
    }
  };
  const closeFeed = () => {
    setFeedOpen(false);
    setFeedSeen(readSeen());
  };
  const refreshProjects = () => void listAteliers().then(setProjects, () => {});
  /** Petite image de la composition pour la liste. */
  const makeThumb = (d: Doc) => {
    const ff = formatOf(d.formatId);
    const k = 360 / Math.max(ff.width, ff.height);
    const c = document.createElement('canvas');
    c.width = Math.round(ff.width * k);
    c.height = Math.round(ff.height * k);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    drawLayers(ctx, d, ff, { scale: k, onImage: () => {} });
    return c.toDataURL('image/png');
  };
  /** Une vignette par publication : le document tel qu'il s'affiche sur chacune (format, marges, couleurs). */
  const makeThumbs = (d: Doc) => {
    if (!d.targets?.length) return undefined;
    try {
      return d.targets.map((_, i) => {
        // les ancrages se résolvent avec les marges de cette publication
        const x = docAtTarget(d, i, activity);
        setAnchorMargin(docMargins(x));
        return makeThumb(x);
      });
    } finally {
      setAnchorMargin(docMargins(docRef.current));
    }
  };
  const saveNow = async (p = project, d = docRef.current) => {
    if (!p || !online) return;
    setSaving('saving');
    try {
      await saveAtelier(p.id, p.title, d, makeThumb(d), makeThumbs(d));
      setSaving(docRef.current === d ? 'saved' : 'dirty');
      if (docRef.current === d) setPending(null);
    } catch (err) {
      setSaving('error');
      setToast(`Enregistrement impossible : ${(err as Error).message}`);
    }
  };
  // enregistrement automatique, quelques secondes après la dernière retouche
  const firstDoc = useRef(true);
  // ce qui a déjà été vu : l'arrivée de la réponse du serveur (en ligne) n'est pas une retouche
  const seen = useRef({ doc, title: project?.title });
  const unsaved = useRef(false);
  useEffect(() => {
    // au chargement, ou juste après avoir ouvert une composition : rien de neuf à enregistrer
    if (firstDoc.current) {
      firstDoc.current = false;
      seen.current = { doc, title: project?.title };
      unsaved.current = false;
      return;
    }
    if (seen.current.doc !== doc || seen.current.title !== project?.title) {
      seen.current = { doc, title: project?.title };
      unsaved.current = true;
    }
    if (!online || !project || !unsaved.current) return;
    setSaving('dirty');
    // la copie locale tient les retouches : au rechargement, elle passera avant celle du serveur
    setPending(localOk.current ? project.id : null);
    const t = setTimeout(() => {
      unsaved.current = false;
      void saveNow();
    }, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, online, project?.id, project?.title]);
  const openProject = async (m: AtelierMeta) => {
    try {
      const r = await readAtelier(m.id);
      forgetPaint();
      past.current = [];
      future.current = [];
      firstDoc.current = true;
      setDoc(migrate(r.doc));
      setPending(null);
      setSelected(null);
      setProject({ id: m.id, title: r.title });
      setSaving('saved');
      setBubble(null);
      setToast(`« ${r.title} » ouverte`);
      return true;
    } catch (err) {
      setToast(`Ouverture impossible : ${(err as Error).message}`);
      return false;
    }
  };
  // lien reçu par e-mail : ?equipe=…&composition=… ouvre la composition (le serveur a déjà choisi l'équipe)
  useEffect(() => {
    if (!online) return;
    const url = new URL(location.href);
    const id = url.searchParams.get('composition');
    if (url.searchParams.has('equipe') || id) {
      url.searchParams.delete('equipe');
      url.searchParams.delete('composition');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    if (id) void openProject({ id, title: '', updated: '' });
    else if (project) void resync(project);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);
  /**
   * Au rechargement, la composition ouverte est relue sur le serveur : la copie locale peut être
   * ancienne (trop lourde pour le stockage du navigateur, ou retouchée depuis un autre appareil),
   * et la montrer ferait enregistrer cette vieille version par-dessus la bonne à la première retouche.
   * Seule exception : des retouches pas encore enregistrées, dont la copie locale est entière.
   */
  const resync = async (p: { id: string; title: string }) => {
    if (pendingId() === p.id) return void saveNow(p, docRef.current);
    try {
      const r = await readAtelier(p.id);
      // déjà retouchée (ou une autre composition ouverte) pendant la lecture : on ne remplace rien
      if (docRef.current !== startDoc.current) return;
      forgetPaint();
      past.current = [];
      future.current = [];
      firstDoc.current = true;
      setDoc(migrate(r.doc));
      setProject({ id: p.id, title: r.title || p.title });
      setSaving('saved');
    } catch {
      /* composition introuvable (supprimée, autre équipe) : la copie locale reste affichée */
    }
  };
  /** Propose la composition aux responsables, ou (responsable) la valide / demande une retouche. */
  const sendReview = async (action: 'propose' | 'approve' | 'changes') => {
    if (!project) return;
    try {
      await saveNow();
      if (action === 'propose') {
        const r = await proposeAtelier(project.id);
        setToast(r.mailed ? `Proposée : ${r.notified > 1 ? `${r.notified} responsables prévenus` : 'responsable prévenu'} par e-mail` : 'Proposée aux responsables');
      } else {
        const r = await reviewAtelier(project.id, action === 'approve');
        setToast(`${action === 'approve' ? 'Validée' : 'Retouche demandée'}${r.mailed ? ' : auteur prévenu par e-mail' : ''}`);
      }
      refreshProjects();
    } catch (err) {
      setToast(`Impossible : ${(err as Error).message}`);
    }
  };
  const newProject = async (title: string, fromCurrent: boolean, op?: Operation) => {
    const p = { id: newAtelierId(title), title };
    const base = fromCurrent ? docRef.current : op ? operationDoc(op) : { ...blankDoc(), formatId: docRef.current.formatId, frame: docRef.current.frame, guides: docRef.current.guides };
    // un nouveau document contribue à la campagne suivie
    const d = campaign && !base.campaign ? { ...base, campaign } : base;
    if (fromCurrent && d !== base) setDoc(d);
    if (!fromCurrent) {
      forgetPaint();
      past.current = [];
      future.current = [];
      setDoc(d);
      setSelected(null);
    }
    setProject(p);
    await saveNow(p, d);
    refreshProjects();
  };
  /** Page vierge pour une occasion : ses cibles, la première affichée avec son format, sa marge et sa variante. */
  const operationDoc = (op: Operation): Doc => {
    const t = op.targets[0]!;
    const pal = paletteFor(t, activity);
    const base: Doc = { ...blankDoc(), frame: docRef.current.frame, guides: pal ? paletteGuides(pal) : docRef.current.guides };
    return { ...docForTarget(base, t, activity), formatId: t.format, targets: op.targets.map((x) => ({ ...x })), target: 0, operation: op.id };
  };
  /** Affiche une cible : format (les objets gardent leurs accroches), marge du média, couleurs de la variante. */
  const showTarget = (i: number) => setDoc((d) => docAtTarget(d, i, activity));
  /** Édite la publication affichée (réseau, format, résolution, variante, marges) : le document suit, la publication garde ses réglages. */
  const applyPublication = (t: PubTarget) => {
    // les couleurs ne changent que si la variante change : une marge ou une résolution garde les couleurs retouchées
    const samePalette = paletteFor(currentPub, activity)?.id === paletteFor(t, activity)?.id;
    setDoc((d) => {
      const next = { ...docForTarget(d, t, activity), ...(samePalette ? { guides: d.guides } : {}) };
      setAnchorMargin(docMargins(d));
      const links = linkShapes(d, formatOf(d.formatId));
      setAnchorMargin(docMargins(next));
      const held = d.formatId === t.format ? holdPins(next, formatOf(t.format), links) : holdPins({ ...next, formatId: t.format }, formatOf(t.format), links);
      const cur = d.targets?.length ? (d.target ?? 0) : 0;
      const targets = d.targets?.length ? d.targets.map((x, j) => (j === cur ? { ...t } : x)) : [{ ...t }];
      return { ...held, targets, target: cur };
    });
  };
  /** Titre de la publication affichée (vide : réseau · format). */
  const renamePublication = (name: string) =>
    setDoc((d) => {
      const cur = d.targets?.length ? (d.target ?? 0) : 0;
      const base = d.targets?.length ? d.targets : [{ ...currentPub }];
      const targets = base.map((x, j) => {
        if (j !== cur) return x;
        const { name: _old, ...rest } = x;
        return name ? { ...rest, name } : rest;
      });
      return { ...d, targets, target: cur };
    });
  /** Nouvelle publication de la composition : une copie de celle affichée, à régler ensuite. */
  const addPublication = () => {
    const { name: _name, ...copy } = currentPub;
    setDoc((d) => (d.targets?.length ? { ...d, targets: [...d.targets, copy], target: d.targets.length } : { ...d, targets: [{ ...currentPub }, copy], target: 1 }));
    setBubble('format');
  };
  const removePublication = (i: number) =>
    setDoc((d) => {
      const targets = (d.targets ?? []).filter((_, j) => j !== i);
      const cur = d.target ?? 0;
      const target = Math.max(0, cur > i ? cur - 1 : Math.min(cur, targets.length - 1));
      const next = { ...d, targets, target };
      // la publication affichée disparaît : on montre celle qui prend sa place
      return cur === i && targets.length ? docAtTarget(next, target, activity) : next;
    });
  const channels = channelsOf(activity);
  const allOperations = operationsOf(activity);
  const followed = campaigns.find((c) => c.id === campaign);
  // l'occasion de la campagne suivie vient en premier
  const operations = followed?.operation ? [...allOperations.filter((o) => o.id === followed.operation), ...allOperations.filter((o) => o.id !== followed.operation)] : allOperations;
  // la campagne fixe l'occasion : une nouvelle composition reprend les rendus de son plan, à défaut ceux de l'occasion
  const campaignOp = ((): Operation | undefined => {
    if (!followed) return undefined;
    const op = allOperations.find((o) => o.id === followed.operation);
    const seen = new Set<string>();
    const fromPlan = (followed.plan ?? [])
      .map((it) => ({ channel: it.channel, format: it.format, palette: it.palette }))
      .filter((t) => !seen.has(targetKey(t)) && !!seen.add(targetKey(t)));
    const targets = fromPlan.length ? fromPlan : (op?.targets ?? []);
    return targets.length ? { id: op?.id ?? followed.id, name: followed.name, targets } : undefined;
  })();
  // dans une campagne : ses compositions, les plus votées d'abord
  const canEditTeam = !!me?.team && me.team.role !== 'viewer';
  const [campaignDialog, setCampaignDialog] = useState(false);
  const [newDialog, setNewDialog] = useState(false);
  const [msgDialog, setMsgDialog] = useState(false);
  const [sheet, setSheet] = useState<string | null>(null);
  const followedTemplates = (followed?.templates ?? []).map((id) => projects.find((m) => m.id === id)).filter((m): m is AtelierMeta => !!m);
  const campaignCounts = projects.reduce<Record<string, number>>((o, m) => (m.campaign ? { ...o, [m.campaign]: (o[m.campaign] ?? 0) + 1 } : o), {});
  /** Nouvelle composition copiée d'une autre (modèle, ou import), rangée dans la campagne suivie, puis ouverte. */
  const fromComposition = async (m: AtelierMeta, title: string) => {
    try {
      const meta = await copyAtelier(m.id, newAtelierId(title), title, campaign || undefined);
      refreshProjects();
      await openProject(meta);
      setToast(`« ${title} » créée`);
    } catch (err) {
      setToast(`Copie impossible : ${(err as Error).message}`);
    }
  };
  /** Double toucher dans le menu de la campagne : la composition s'ouvre sur sa première publication, avec son menu. */
  const openComposition = async (m: AtelierMeta) => {
    if (m.id !== project?.id && !(await openProject(m))) return;
    showTarget(0);
    setBubble('composition');
  };
  const voteFor = (m: AtelierMeta) =>
    void voteAtelier(m.id, !m.voted).then(
      (r) => setProjects((l) => l.map((x) => (x.id === m.id ? { ...x, votes: r.votes, voted: r.voted } : x))),
      (e: Error) => setToast(`Vote impossible : ${e.message}`),
    );
  const templateFor = (m: AtelierMeta, on: boolean) => {
    if (!followed) return;
    const templates = on ? [...(followed.templates ?? []), m.id] : (followed.templates ?? []).filter((t) => t !== m.id);
    void updateCampaign(followed.id, { templates }).then(
      (x) => setCampaigns((l) => l.map((y) => (y.id === x.id ? x : y))),
      (e: Error) => setToast(`Impossible : ${e.message}`),
    );
  };
  const palettes = palettesOf(activity);
  const activeTarget = doc.targets?.[doc.target ?? 0];
  /** Réglages de la publication affichée ; marges et format viennent toujours du document. */
  const currentPub: PubTarget = {
    ...(activeTarget?.channel ? { channel: activeTarget.channel } : {}),
    format: doc.formatId,
    ...(activeTarget?.palette ? { palette: activeTarget.palette } : {}),
    margins: docMargins(doc),
    ...(activeTarget?.width && activeTarget.format === doc.formatId ? { width: activeTarget.width } : {}),
    ...(activeTarget?.name ? { name: activeTarget.name } : {}),
  };

  // --- export ---
  const [exportFormats, setExportFormats] = useState<string[]>([]);
  const [exportKind, setExportKind] = useState<'png' | 'pdf'>('png');
  const [exporting, setExporting] = useState(false);
  const [exportTargets, setExportTargets] = useState<number[]>([]);
  // --- publier : le plan de la campagne du document, les mentions de l'activité ---
  const pubCampaign = campaigns.find((c) => c.id === doc.campaign);
  const pubTargets = (doc.targets ?? []).filter((_, i) => exportTargets.includes(i));
  const pubPlan = (pubCampaign?.plan ?? []).filter((it) => pubTargets.some((t) => (t.channel ?? '') === (it.channel ?? '') && t.format === it.format));
  const pubChannels = channels.filter((c) => pubTargets.some((t) => t.channel === c.id));
  const pubMentions = (activity?.branding?.mentions ?? []).map((m) => ({ ...m, channel: pubChannels.some((c) => c.mentions?.includes(m.name)) }));
  const markPublished = async (id: string) => {
    if (!pubCampaign || !project) return;
    try {
      const plan = (pubCampaign.plan ?? []).map((it) => (it.id === id ? { ...it, published: new Date().toISOString(), composition: it.composition ?? project.id } : it));
      const x = await updateCampaign(pubCampaign.id, { plan });
      setCampaigns((l) => l.map((y) => (y.id === x.id ? x : y)));
      setToast('Marquée publiée dans le plan');
    } catch (err) {
      setToast(`Impossible : ${(err as Error).message}`);
    }
  };

  const runExport = async () => {
    const d0 = docRef.current;
    // avec des cibles : chacune dans son format et sa variante ; sinon les formats cochés
    const jobs = d0.targets?.length
      ? exportTargets
          .map((i) => d0.targets![i])
          .filter((t): t is NonNullable<typeof t> => !!t)
          .map((t) => ({ ff: formatOf(t.format), d: docForTarget(d0, t, activity), width: t.width, name: [project?.title ?? 'composition', t.channel].filter(Boolean).join(' ') }))
      : FORMATS.filter((x) => (exportFormats.length ? exportFormats : [d0.formatId]).includes(x.id)).map((ff) => ({ ff, d: d0, width: undefined as number | undefined, name: project?.title ?? 'composition' }));
    const list = jobs;
    setExporting(true);
    try {
      for (const { ff, d, width, name } of jobs) {
        setToast(`Export ${ff.title}…`);
        const c = await renderDoc(d, ff, 8000, width);
        const blob = exportKind === 'pdf' ? await pdfOf(c, ff) : await pngOf(c);
        await download(blob, fileName(name, ff, exportKind));
      }
      setToast(list.length > 1 ? `${list.length} fichiers exportés` : 'Fichier exporté');
    } catch (err) {
      setToast(`Export impossible : ${(err as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  const [tool, setToolState] = useState<Tool>('move');
  /** Maj : le bouton de la barre (tenu, ou verrouillé d'un double appui), ou la touche du clavier. */
  const [shiftBtn, setShiftBtn] = useState(SHIFT_IDLE);
  const shiftLatch = shiftButtonOn(shiftBtn);
  const [shiftKey, setShiftKey] = useState(false);
  const shift = shiftHeld(shiftLatch, shiftKey);
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Shift' && setShiftKey(e.type === 'keydown');
    const off = () => setShiftKey(false);
    window.addEventListener('keydown', on);
    window.addEventListener('keyup', on);
    window.addEventListener('blur', off);
    return () => {
      window.removeEventListener('keydown', on);
      window.removeEventListener('keyup', on);
      window.removeEventListener('blur', off);
    };
  }, []);
  // Modifier rouvre la dernière section utilisée
  const lastEdit = useRef<EditTool>('transform');
  const [coupeOpen, setCoupeOpen] = useState<{ key: string; n: number; sec?: 'edge' | 'coat' | 'image' | 'transform' | 'support' } | undefined>();
  /** Hauteur du bandeau des attributs, quand il est ouvert : la roue du pinceau se pose au-dessus. */
  const [bandH, setBandH] = useState(0);
  useEffect(() => {
    if (!coupeOpen) return setBandH(0);
    let ro: ResizeObserver | null = null;
    const id = requestAnimationFrame(() => {
      const el = document.querySelector('aside.coupe.with-list');
      if (!el) return;
      ro = new ResizeObserver(() => setBandH(Math.round(el.getBoundingClientRect().height)));
      ro.observe(el);
    });
    return () => {
      cancelAnimationFrame(id);
      ro?.disconnect();
    };
  }, [coupeOpen]);
  // glisser-déposer dans la liste des objets
  const listPress = useRef<{ id: string; y: number; moved: boolean; grip: boolean } | null>(null);
  const [listDrag, setListDrag] = useState<{ id: string; over?: string; above?: boolean } | null>(null);
  const setTool = (t: Tool) => {
    if (isEdit(t)) lastEdit.current = t;
    setToolState(t);
  };
  /** Ranger l'outil en cours : plus aucun outil actif, le stylet déplace et choisit les objets. */
  const leaveTool = () => {
    window.clearTimeout(bgLeave.current);
    setTool('move');
  };
  /** Toucher un outil déjà actif le range. */
  const pickTool = (t: Tool) => (tool === t || (isEdit(t) && isEdit(tool)) ? leaveTool() : setTool(t));
  /** Toucher le fond autour de la page (sans glisser) : l'outil se range, sauf si un second toucher en fait un double toucher. */
  const bgTap = useRef<{ id: number; x: number; y: number; t: number } | null>(null);
  const bgLeave = useRef(0);
  const [bubble, setBubble] = useState<Bubble>(null);
  // historique du menu de la campagne : demandé au serveur pour cette campagne seulement, à l'ouverture du menu
  const [campaignFeed, setCampaignFeed] = useState<ActivityEvent[] | null>(null);
  // menu de la composition : ses publications rendues d'après le document ouvert, retouches comprises
  const previews = useMemo(() => (bubble === 'composition' ? makeThumbs(doc) : undefined), [bubble, doc, activity]); // eslint-disable-line react-hooks/exhaustive-deps
  // menu de la composition : l'historique de sa campagne à elle
  const menuOpen = bubble === 'projects' || bubble === 'composition';
  const campaignScope = bubble === 'composition' && project ? (projects.find((x) => x.id === project.id)?.campaign ?? '') : (followed?.id ?? '');
  useEffect(() => {
    if (!menuOpen || !online || !me?.team) return;
    let live = true;
    setCampaignFeed(null);
    fetchActivity(campaignScope).then(
      (l) => live && setCampaignFeed(l),
      () => live && setCampaignFeed([]),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen, campaignScope, online, me?.team?.id]);
  // astuces (textes d'aide, sous-titres des menus, bandeau d'état) : masquables pour gagner de la place
  const [tips, setTipsState] = useState(() => {
    try {
      return localStorage.getItem('ftd-atelier-tips') !== 'off';
    } catch {
      return true;
    }
  });
  /** Gaucher : les outils passent à gauche et leurs réglages à droite (l'inverse du droitier). */
  /** Délai avant que la roue du pinceau s'écarte (null : jamais). */
  const [wheelHide, setWheelHideState] = useState<number | null>(() => {
    try {
      const v = localStorage.getItem('ftd-atelier-wheel-hide');
      return v === null ? 15000 : v === 'never' ? null : Number(v) || 15000;
    } catch {
      return 15000;
    }
  });
  const setWheelHide = (v: number | null) => {
    setWheelHideState(v);
    try {
      localStorage.setItem('ftd-atelier-wheel-hide', v === null ? 'never' : String(v));
    } catch {
      /* stockage indisponible */
    }
  };
  const [lefty, setLeftyState] = useState(() => {
    try {
      return localStorage.getItem('ftd-atelier-hand') === 'left';
    } catch {
      return false;
    }
  });
  const setLefty = (v: boolean) => {
    setLeftyState(v);
    try {
      localStorage.setItem('ftd-atelier-hand', v ? 'left' : 'right');
    } catch {
      /* stockage indisponible */
    }
  };
  /** Thème : suit le système, ou clair ou sombre au choix. */
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      return (localStorage.getItem('ftd-atelier-theme') as Theme) || 'auto';
    } catch {
      return 'auto';
    }
  });
  const setTheme = (t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem('ftd-atelier-theme', t);
    } catch {
      /* stockage indisponible */
    }
  };
  useEffect(() => {
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);
  // mode simplifié (par défaut) : les réglages rares (Transformations, Rognage, Lueur) restent derrière « Plus »
  const [simple, setSimpleState] = useState(() => {
    try {
      return localStorage.getItem('ftd-atelier-simple') !== 'off';
    } catch {
      return true;
    }
  });
  const setSimple = (v: boolean) => {
    setSimpleState(v);
    try {
      localStorage.setItem('ftd-atelier-simple', v ? 'on' : 'off');
    } catch {
      /* stockage indisponible */
    }
  };
  const setTips = (v: boolean) => {
    setTipsState(v);
    try {
      localStorage.setItem('ftd-atelier-tips', v ? 'on' : 'off');
    } catch {
      /* stockage indisponible */
    }
  };
  const [selected, setSelected] = useState<string | null>('arche');
  const [guide, setGuide] = useState(2);
  /** Barre de texte ouverte sur le clavier (ou l'écriture au stylet). */
  /** Outil Prolonger de la barre de texte. */
  const [swash, setSwash] = useState<SwashTool>({ on: false, mode: 'mold', r: 0.3, end: 'point', w: null });
  const [size, setSize] = useState(0.05);
  const [opacity, setOpacity] = useState(0.85);
  /** Outil Tampons : motif, taille, opacité et dilution de l'encre. */
  const [stampId, setStampId] = useState('etoile');
  const [stampSize, setStampSize] = useState(0.08);
  const [dilution, setDilution] = useState(0.15);
  /** Tampon : essuyé (une empreinte qui s'étire) ou semé (copies éparpillées le long du geste). */
  const [stampSow, setStampSow] = useState(false);
  const [sowDensity, setSowDensity] = useState(0.5);
  const [sowSpread, setSowSpread] = useState(0.4);
  const [sowPersp, setSowPersp] = useState(0.3);
  /** Semis : le cadran Inclinaison de la roue règle la force de la perspective (le sens varie d'une copie à l'autre). */
  const [sowPad, setSowPad] = useState<[number, number]>([0.21, -0.21]);
  const [stampFilled, setStampFilled] = useState(false);
  /** Déborder : tampons, poils et ramures sortent de la forme et repoussent sa découpe. */
  const [spill, setSpill] = useState(false);
  /** Rotation du tampon (radians), fixée au curseur : Safari ne transmet pas la rotation du crayon. */
  const [stampRot, setStampRot] = useState(0);
  /** Inclinaison réglée à la main (sans stylet) : le tampon se met en perspective dans cette direction. */
  const [stampTilt, setStampTilt] = useState<[number, number]>([0, 0]);
  /** Réglage global : l'inclinaison du stylet met les empreintes en perspective. */
  const [penTilt, setPenTiltState] = useState(() => {
    try {
      return localStorage.getItem('ftd-atelier-tilt') !== 'off';
    } catch {
      return true;
    }
  });
  /** Réglage global : la rotation du crayon sur lui-même tourne les tampons. */
  const [penRoll, setPenRollState] = useState(() => {
    try {
      return localStorage.getItem('ftd-atelier-roll') !== 'off';
    } catch {
      return true;
    }
  });
  const setPenRoll = (v: boolean) => {
    setPenRollState(v);
    try {
      localStorage.setItem('ftd-atelier-roll', v ? 'on' : 'off');
    } catch {
      /* stockage indisponible */
    }
  };
  const setPenTilt = (v: boolean) => {
    setPenTiltState(v);
    try {
      localStorage.setItem('ftd-atelier-tilt', v ? 'on' : 'off');
    } catch {
      /* stockage indisponible */
    }
  };
  /**
   * Le doigt : « auto » le laisse dessiner tant qu'aucun stylet n'a touché cet appareil
   * (téléphone, tablette sans crayon) et le rend au déplacement dès qu'un stylet se montre.
   * « draw » et « move » le fixent ; un stylet qui revient rend « draw » à l'automatique.
   */
  const [fingerMode, setFingerModeState] = useState<FingerMode>(() => {
    try {
      const v = localStorage.getItem('ftd-atelier-finger');
      return v === 'draw' || v === 'move' ? v : 'auto';
    } catch {
      return 'auto';
    }
  });
  const setFingerMode = (v: FingerMode) => {
    setFingerModeState(v);
    try {
      localStorage.setItem('ftd-atelier-finger', v);
    } catch {
      /* stockage indisponible */
    }
  };
  /** Un stylet a déjà touché ou survolé l'écran de cet appareil (mémorisé). */
  const [penSeen, setPenSeen] = useState(() => {
    try {
      return localStorage.getItem('ftd-atelier-pen') === 'seen';
    } catch {
      return false;
    }
  });
  /** Souris ou pavé tactile branché : ils tiennent l'outil, le doigt peut rester au déplacement. */
  const [finePointer] = useState(() => typeof matchMedia === 'function' && matchMedia('(any-pointer: fine)').matches);
  /** Écran tactile : le bouton du doigt n'a de sens que là. */
  const [touchScreen] = useState(() => (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) || (typeof matchMedia === 'function' && matchMedia('(any-pointer: coarse)').matches));
  const fingerDraws = fingerDrawsFor(fingerMode, penSeen, finePointer);
  // le premier stylet vu (survol ou contact, n'importe où) : il prend l'outil, le doigt reprend le déplacement
  const fingerRef = useRef({ fingerMode, fingerDraws });
  fingerRef.current = { fingerMode, fingerDraws };
  useEffect(() => {
    const onPen = (e: PointerEvent) => {
      if (e.pointerType !== 'pen') return;
      const { fingerMode: m, fingerDraws: drew } = fingerRef.current;
      if (!penSeen) {
        setPenSeen(true);
        try {
          localStorage.setItem('ftd-atelier-pen', 'seen');
        } catch {
          /* stockage indisponible */
        }
      }
      const next = afterPen(m, drew);
      if (next.mode !== m) setFingerMode(next.mode);
      if (next.toast) setToast('Stylet détecté : il dessine, le doigt reprend le déplacement');
    };
    window.addEventListener('pointerdown', onPen, true);
    window.addEventListener('pointermove', onPen, true);
    return () => {
      window.removeEventListener('pointerdown', onPen, true);
      window.removeEventListener('pointermove', onPen, true);
    };
  }, [penSeen]);
  const [burnChar, setBurnChar] = useState(0.3);
  /**
   * Aquarelle sur papier mouillé : la passe en cours (couche, numéro, dernier trait). Ses traits se
   * mêlent jusqu'à ce qu'on touche « Sécher » ou qu'on peigne une autre couche.
   */
  const wetPass = useRef<{ layer: string; id: number; at: number } | null>(null);
  /** Papier mouillé (1) ou sec (0), pour la jauge du bouton Sécher. */
  const [wetness, setWetness] = useState(0);
  /** La passe humide d'un nouveau trait d'aquarelle sur cette couche : on la rejoint tant qu'on n'a pas séché ni changé de couche. */
  const washFor = (layerId: string) => {
    const w = wetPass.current;
    const now = Date.now();
    setWetness(1);
    if (w && w.layer === layerId) {
      w.at = now;
      return w.id;
    }
    wetPass.current = { layer: layerId, id: now, at: now };
    return now;
  };
  const [branchCore, setBranchCore] = useState(1);
  const [burnHole, setBurnHole] = useState(true);
  /** Survol du stylet (ou de la souris) : un repère montre où la pointe touchera. */
  const hoverRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ zoom: 1, rot: 0, px: 0, py: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [rendu, setRendu] = useState(false);
  /** Vue 3D : les couches en plaques, à leur hauteur. */
  const [view3d, setView3d] = useState<false | { start?: [number, number] }>(false);
  const [magnet, setMagnet] = useState(true);
  /** Ciseaux : le morceau se détache. Scalpel : il reste en place, lié à son objet. */
  const [blade, setBlade] = useState<'scissors' | 'scalpel'>('scissors');
  /** Découper › Sujet : toucher le sujet d'une image pour le détourer (MediaPipe, dans le navigateur). */
  const [subjectOn, setSubjectOn] = useState(false);
  /** Sujet : les traits retirent au lieu d'ajouter. */
  const [subjectErase, setSubjectErase] = useState(false);
  const subject = useRef<{
    /** Couche analysée, recadrage de l'analyse et zone tracée (coordonnées de la couche). */
    layer: string;
    crop: SubjectCrop;
    zone: Pt[] | null;
    state: 'busy' | 'ready' | 'error';
    error?: string;
    strokes: SubjectStroke[];
    mask: SubjectMask | null;
    img: HTMLCanvasElement | null;
    geom: MultiPolygon | null;
    /** Un décodage est en cours ; `again` : les traits ont changé depuis. */
    running?: boolean;
    again?: boolean;
  } | null>(null);
  /** Détection des contours de l'image sélectionnée : critère et seuil (0..1). */
  const [edgeMode, setEdgeMode] = useState<EdgeMode>('both');
  const [edgeThreshold, setEdgeThreshold] = useState(0.35);
  const [edgeSmooth, setEdgeSmooth] = useState(0.4);
  const [modePick, setModePick] = useState(false);
  /** Bulle ouverte de l'outil Bords. */
  const [epop, setEpop] = useState<string | null>(null);
  const [brushKind, setBrushKind] = useState<BrushKind>('aquarelle');
  /** Barre latérale : réglages sur deux colonnes quand une seule ne tient pas dans la hauteur. */
  const sideRef = useRef<HTMLElement>(null);
  const paramsRef = useRef<HTMLDivElement>(null);
  const [sideTwo, setSideTwo] = useState(false);
  const [sideOdd, setSideOdd] = useState(0);
  useLayoutEffect(() => {
    const fit = () => {
      const side = sideRef.current;
      const pr = paramsRef.current;
      if (!side || !pr) return;
      const items = [...pr.children].filter((c) => getComputedStyle(c).position !== 'absolute') as HTMLElement[];
      // hauteur sur une seule colonne, curseurs à leur taille naturelle (indépendante du mode courant)
      const vs = Math.max(64, Math.min(100, (window.innerHeight - 640) / 2));
      const one = items.reduce((h, c) => h + (c.classList.contains('vslider') ? vs : c.offsetHeight), 0) + 8 * Math.max(0, items.length - 1);
      // le reste de la barre, actions comptées sur une colonne (sinon passer sur deux colonnes la raccourcit et l'on oscille)
      const acts = side.querySelector('.side-actions') as HTMLElement | null;
      const actKids = acts ? ([...acts.children] as HTMLElement[]) : [];
      const actsOne = actKids.reduce((h, c) => h + c.offsetHeight, 0) + 8 * Math.max(0, actKids.length - 1);
      const rest = side.offsetHeight - pr.offsetHeight - (acts?.offsetHeight ?? 0) + actsOne;
      // place libre entre la barre d'outils et le bas de l'écran
      // place libre sous le haut de la barre des réglages
      const room = window.innerHeight - side.getBoundingClientRect().top - 12;
      const two = items.length > 2 && one + rest > room;
      if (two !== sideTwo) setSideTwo(two);
      // nombre impair : la case vide va en haut, la grille se remplit depuis le bas
      if (items.length % 2 !== sideOdd) setSideOdd(items.length % 2);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  });
  /** Forme de la brosse et son angle (radians), auquel s'ajoute la rotation du crayon. */
  const [brushTip, setBrushTip] = useState<BrushTip>('round');
  const [brushRot, setBrushRot] = useState(0);
  /** Inclinaison réglée à la main sur la roue du pinceau : la touche s'allonge dans cette direction, comme un crayon couché. */
  const [brushTilt, setBrushTilt] = useState<[number, number]>([0, 0]);
  /** Ramures : nombre de ramifications et convergence. */
  const [branches, setBranches] = useState(6);
  const [converge, setConverge] = useState(0.3);
  /** Poils : longueur des brins et frisure (raide, alpaga, mouton). */
  const [hairLen, setHairLen] = useState(0.3);
  const [curl, setCurl] = useState(0);
  const growTimer = useRef(0);
  /** Couleur glissée depuis la palette (position écran). */
  const [dragGuide, setDragGuide] = useState<{ i: number; x: number; y: number } | null>(null);
  /** La couleur de la barre d'outils tenue : départ du doigt, glisser commencé. */
  const guideDrag = useRef<{ x: number; y: number; on: boolean } | null>(null);
  // le doigt qui glisse depuis la couleur ne fait ni défiler ni rebondir la page (et n'avale pas le toucher suivant)
  const guideBtn = useCallback((el: HTMLButtonElement | null) => {
    if (!el) return;
    const stop = (e: TouchEvent) => e.preventDefault();
    el.addEventListener('touchmove', stop, { passive: false });
    return () => el.removeEventListener('touchmove', stop);
  }, []);
  /** Bulle ouverte de l'outil Transformer : style, guide du style, effets, guide d'effet. */
  const [tpop, setTpop] = useState<string | null>(null);
  const [fxFocus, setFxFocus] = useState<number | null>(null);
  useEffect(() => {
    setFxFocus(null);
    setTpop(null);
  }, [selected]);
  const trashRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [trashHot, setTrashHot] = useState(false);
  const dupRef = useRef<HTMLButtonElement>(null);
  const [dupHot, setDupHot] = useState(false);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [toast, setToastRaw] = useState<string | null>(null);
  // tiroir d'ajout : rayon ouvert (gardé d'une ouverture à l'autre) et glisser en cours
  const [shelf, setShelfRaw] = useState<DrawerShelf>(() => {
    try {
      return (localStorage.getItem('ftd-atelier-shelf') as DrawerShelf | null) ?? 'textes';
    } catch {
      return 'formes';
    }
  });
  const setShelf = (v: DrawerShelf) => {
    setShelfRaw(v);
    try {
      localStorage.setItem('ftd-atelier-shelf', v);
    } catch {
      /* stockage indisponible */
    }
  };
  const [libDrag, setLibDrag] = useState(false);
  // un retrait peut se rétablir depuis le message (même effet que Annuler)
  const [toastUndo, setToastUndo] = useState(false);
  /** Un nouveau message ne garde pas le bouton Rétablir du précédent. */
  const setToast = (m: string | null) => {
    setToastRaw(m);
    setToastUndo(false);
  };
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(
      () => {
        setToast(null);
        setToastUndo(false);
      },
      toastUndo ? 4000 : 1800,
    );
    return () => clearTimeout(t);
  }, [toast]);

  const f = formatOf(doc.formatId);
  // les calculs d'ancrage suivent la densité du document ouvert
  setAnchorDensity(doc.density);
  setAnchorMargin(docMargins(doc));
  /** Points d'accroche par défaut (Préférences) : pour les compositions qui n'ont pas les leurs. */
  const [defaultPoints, setDefaultPointsRaw] = useState<AnchorExtras>(() => {
    try {
      return JSON.parse(localStorage.getItem('ftd-atelier-points') ?? 'null') ?? {};
    } catch {
      return {};
    }
  });
  const setDefaultPoints = (v: AnchorExtras) => {
    setDefaultPointsRaw(v);
    try {
      localStorage.setItem('ftd-atelier-points', JSON.stringify(v));
    } catch {
      /* stockage indisponible */
    }
  };
  const points = doc.points ?? defaultPoints;
  setAnchorExtras(points);
  /** Bulle de positionnement : les points d'accroche s'ouvrent sur « Plus ». */
  const [anchorMore, setAnchorMore] = useState(false);
  /** Couleurs caractéristiques des repères (marges, points) : préférence de l'atelier, par-dessus les couleurs d'origine. */
  const [markColors, setMarkColorsRaw] = useState(loadMarkColors);
  setMarkColors(markColors);
  const changeMarkColors = (c: Partial<Record<MarkKind, string>>) => {
    setMarkColorsRaw(c);
    saveMarkColors(c);
  };
  /** Repères toujours visibles : préférence de l'atelier, gardée d'une séance à l'autre. */
  const [guidesOn, setGuidesOnRaw] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ftd-atelier-guides') ?? 'null') ?? { on: false, color: '#7a5cff' };
    } catch {
      return { on: false, color: '#7a5cff' };
    }
  });
  const setGuidesOn = (v: { on: boolean; color: string }) => {
    setGuidesOnRaw(v);
    try {
      localStorage.setItem('ftd-atelier-guides', JSON.stringify(v));
    } catch {
      /* stockage indisponible */
    }
  };
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  // transformation page → écran (pixels CSS)
  const top = rendu ? 0 : TOP;
  const fit = Math.min((vp.w - (rendu ? 24 : vp.w < 560 ? 84 : 150)) / f.width, (vp.h - top - 24) / f.height);
  const viewMatrix = (v: View) =>
    new DOMMatrix()
      .translate(vp.w / 2 + v.px, top + (vp.h - top) / 2 + v.py)
      .rotate((v.rot * 180) / Math.PI)
      .scale(fit * v.zoom)
      .translate(-f.width / 2, -f.height / 2);
  const matrix = useMemo(() => viewMatrix(view), [vp, view, fit, f, top]);
  /**
   * Pendant le geste à deux doigts, l'image déjà peinte est seulement déplacée (transformation CSS,
   * faite par la carte graphique) ; la page n'est repeinte qu'au lâcher, à la nouvelle vue.
   */
  const previewView = (next: View | null) => {
    const c = canvasRef.current;
    if (!c) return;
    if (!next) {
      c.style.transform = '';
      return;
    }
    const t = viewMatrix(next).multiply(matrix.inverse());
    c.style.transformOrigin = '0 0';
    c.style.transform = `matrix(${t.a},${t.b},${t.c},${t.d},${t.e},${t.f})`;
  };
  const toPage = (cx: number, cy: number) => {
    // vue montrée : celle de l'aperçu de molette s'il y en a un, pas encore repeinte
    const shown = wheelView.current ?? flushedView.current;
    const p = (shown ? viewMatrix(shown) : matrix).inverse().transformPoint(new DOMPoint(cx, cy));
    return { x: p.x, y: p.y };
  };
  const scale = fit * view.zoom;
  /** Place réellement visible à l'écran : entre la barre du haut, les barres posées à gauche et à droite (outils, réglages, hauteur) et l'éditeur d'objet en bas. */
  const freeArea = () => {
    let [left, right] = [12, vp.w - 12];
    for (const el of document.querySelectorAll('.side, .height-bar')) {
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      if (r.left + r.width / 2 < vp.w / 2) left = Math.max(left, r.right + 12);
      else right = Math.min(right, r.left - 12);
    }
    const bottom = (document.querySelector('aside.coupe')?.getBoundingClientRect().top ?? vp.h) - 12;
    return { left, top: top + 12, w: Math.max(80, right - left), h: Math.max(80, bottom - top - 12) };
  };
  /** Vue qui place la boîte b (coordonnées de la page, tournée de rot) au centre de la place libre, remplie à la part fill. */
  const frameView = (b: { cx: number; cy: number; w: number; h: number }, rot: number, a: number, fill: number): View => {
    const area = freeArea();
    const ew = Math.abs(b.w * Math.cos(a)) + Math.abs(b.h * Math.sin(a));
    const eh = Math.abs(b.w * Math.sin(a)) + Math.abs(b.h * Math.cos(a));
    const zoom = Math.max(0.3, Math.min(6, (Math.min(area.w / ew, area.h / eh) * fill) / fit));
    const k = fit * zoom;
    const [dx, dy] = [(b.cx - f.width / 2) * k, (b.cy - f.height / 2) * k];
    const [c, sn] = [Math.cos(rot), Math.sin(rot)];
    const [rx, ry] = [dx * c - dy * sn, dx * sn + dy * c];
    return { zoom, rot, px: area.left + area.w / 2 - vp.w / 2 - rx, py: area.top + area.h / 2 - (top + (vp.h - top) / 2) - ry };
  };
  /** Recadre la vue sur un objet : il remplit la place libre entre les barres et l'éditeur d'objet. */
  const zoomOn = (l: Layer) => {
    const b = layerBox(l, f);
    fitted.current = false;
    setView((v) => frameView(b, v.rot, (l.rot ?? 0) + v.rot, 0.8));
  };
  /** Vue « page entière » : la page tient dans la place réellement visible (éditeur d'objet ouvert compris). */
  const pageView = () => frameView({ cx: f.width / 2, cy: f.height / 2, w: f.width, h: f.height }, 0, 0, 1);
  const fitPage = () => {
    fitted.current = true;
    setView(pageView());
  };
  /** Bord gauche des bulles posées à gauche (format, composition, aide au positionnement) : juste après les barres de gauche (réglages, hauteur, outils), pour ne jamais passer dessous. */
  const [bubbleLeft, setBubbleLeft] = useState(0);
  useLayoutEffect(() => {
    if (bubble !== 'format' && bubble !== 'projects' && bubble !== 'composition') return;
    let x = 0;
    for (const el of document.querySelectorAll('.side, .height-bar')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.left + r.width / 2 < vp.w / 2) x = Math.max(x, Math.round(r.right));
    }
    if (x !== bubbleLeft) setBubbleLeft(x);
  });
  /** La vue montre la page entière : elle se réajuste quand la place visible change (éditeur d'objet ouvert ou fermé, barres, fenêtre). */
  const fitted = useRef(true);
  useLayoutEffect(() => {
    if (!fitted.current) return;
    const refit = () => {
      if (!fitted.current) return;
      const pv = pageView();
      setView((v) => (Math.abs(v.zoom - pv.zoom) < 1e-3 && Math.abs(v.px - pv.px) < 0.5 && Math.abs(v.py - pv.py) < 0.5 && !v.rot ? v : pv));
    };
    refit();
    // l'éditeur d'objet s'ouvre en glissant et change de hauteur selon la section choisie
    let ro: ResizeObserver | null = null;
    const id = requestAnimationFrame(() => {
      refit();
      const el = document.querySelector('aside.coupe');
      if (!el) return;
      ro = new ResizeObserver(refit);
      ro.observe(el);
    });
    return () => {
      cancelAnimationFrame(id);
      ro?.disconnect();
    };
  }, [vp.w, vp.h, tool, selected, rendu, f.width, f.height, lefty]);

  const lastTap = useRef<{ t: number; id?: string; x: number; y: number } | null>(null);
  const dotAt = useRef(0);
  // --- état des gestes en cours ---
  const live = useRef<{
    kind: 'paint' | 'cut' | 'subject' | 'move' | 'resize' | 'rotate' | 'pivot' | 'view' | 'swash' | 'mold' | 'bump' | null;
    /** Relief en cours de sculpture : hauteurs de travail et dernière touche (pixels de la carte). */
    bump?: { w: number; h: number; H: Float32Array; at: [number, number]; level?: number };
    /** Outil Modeler : découpe de départ et découpe d'origine, en pixels de travail. */
    base?: Ring[];
    pristine?: Ring[];
    /** Prolongement de lettre en cours de tracé. */
    sw?: Swash;
    /** Modelage du contour en cours. */
    mold?: Mold;
    /** Coin opposé (coordonnées de la couche) tenu fixe pendant un agrandissement. */
    opp?: { u: number; v: number };
    /** Rotation en cours : dernier point du doigt (lignes de repère). */
    now?: Pt;
    /** Agrandissement centré (objet posé sur son point d'ancrage). */
    centered?: boolean;
    pins?: Layer['pins'];
    layer?: string;
    stroke?: Stroke;
    wet?: HTMLCanvasElement;
    /** Encre qui déborde : fenêtre du canevas humide dans la boîte de la couche, et sa cible de peinture. */
    win?: Win;
    wtg?: Target;
    drawn?: number;
    /** Semis de tampons en cours : la silhouette des empreintes déjà posées. */
    ink?: InkLive;
    /** Ramures : repeinture du trait entier attendue à la prochaine image (une par image, pas une par mouvement du stylet). */
    branchFrame?: number;
    lasso?: Pt[];
    /** Ciseaux partis de l'extérieur de la forme choisie : un chemin qui la sépare en morceaux. */
    path?: boolean;
    start?: { x: number; y: number };
    orig?: Layer;
    /** Objets solidaires de la couche tenue, dans leur état de départ. */
    mates?: Layer[];
    last?: { x: number; y: number; t: number; p: number };
    /** Point d'ancrage aimanté pendant un déplacement, avec sa sorte (sa couleur). */
    /** Accroche en cours : l'ancrage visé, et le point de l'objet qui s'y pose (décalage depuis le centre). */
    snap?: { x: number; y: number; kind: MarkKind; anchor: Layer['anchor']; grip?: Layer['grip']; ox: number; oy: number } | null;
    /** Contours aimantés (unités du format) et indices des points aimantés. */
    grid?: EdgeGrid | null;
    snapped?: number[];
    /** Mode ligne : le tracé est figé jusqu'à cet indice, une ligne droite part de là jusqu'à la pointe. */
    lineAt?: number;
    /** Forme reconnue (rond, carré…) : le contour est figé jusqu'au lâcher. */
    shaped?: boolean;
  }>({ kind: null });
  /** Ramures : le trait entier repeint sur le canevas du geste (dans sa fenêtre quand l'encre déborde). */
  const repaintBranch = (L: typeof live.current, tg: Target) => {
    if (!L.wet || !L.stroke) return;
    const wx = L.wet.getContext('2d')!;
    wx.clearRect(0, 0, L.wet.width, L.wet.height);
    paintStroke(wx, L.win ? inWin(L.stroke, L.win) : L.stroke, docRef.current.guides, tg);
  };
  // pointe immobile 2 s pendant une découpe : passage en ligne droite (puis un nouveau coin à chaque arrêt)
  const cutStill = useRef<{ timer: number; x: number; y: number } | null>(null);
  const armCutStill = (x: number, y: number) => {
    if (cutStill.current) clearTimeout(cutStill.current.timer);
    cutStill.current = {
      x,
      y,
      timer: window.setTimeout(() => {
        const L = live.current;
        if (L.kind !== 'cut' || !L.lasso?.length || L.shaped) return;
        // découpe intérieure refermée : on reconnaît la forme dessinée
        if (!L.path && L.lineAt === undefined && isClosed(L.lasso)) {
          const r = recognize(L.lasso);
          navigator.vibrate?.(10);
          if (r) {
            L.lasso = r.pts;
            L.snapped = [];
            L.shaped = true;
            setToast(`${r.name} : levez la pointe pour découper`);
          } else {
            setToast('Forme non reconnue : continuez à main levée');
            armCutStill(x, y);
          }
          redraw();
          return;
        }
        const first = L.lineAt === undefined;
        if (first) {
          // tout le tracé devient une droite, du point de départ à la pointe
          const end = L.lasso[L.lasso.length - 1]!;
          L.lasso = [L.lasso[0]!, end];
          L.snapped = (L.snapped ?? []).filter((i) => i === 0);
          L.lineAt = 1;
        } else L.lineAt = L.lasso.length;
        navigator.vibrate?.(10);
        setToast(first ? 'Droite depuis le départ : levez la pointe pour couper' : 'Coin posé : nouvelle ligne');
        redraw();
        armCutStill(x, y);
      }, 2000),
    };
  };
  const stopCutStill = () => {
    if (cutStill.current) clearTimeout(cutStill.current.timer);
    cutStill.current = null;
  };
  const pointers = useRef(new Map<number, { x: number; y: number; type: string }>());
  const gesture = useRef<{ view: View; c: { x: number; y: number }; d: number; a: number; next?: View; c3?: { x: number; y: number } } | null>(null);
  const tap = useRef<{ n: number; t0: number; moved: boolean } | null>(null);
  const lampDrag = useRef<number | null>(null);
  /** Souris : molette enfoncée, on fait glisser la feuille. */
  const midPan = useRef<{ id: number; x: number; y: number; px: number; py: number } | null>(null);
  // doigt gardé posé sur un objet : il se solidarise avec celui du dessous
  const hold = useRef<{ timer: number; x: number; y: number } | null>(null);
  const stopHold = () => {
    if (hold.current) clearTimeout(hold.current.timer);
    hold.current = null;
  };
  // assemblage réussi : bond, liseré et teinte passagère sur les objets liés
  const linkFx = useRef<{ ids: string[]; t0: number } | null>(null);
  const flashLink = (ids: string[]) => {
    linkFx.current = { ids, t0: performance.now() };
    const tick = () => {
      redraw();
      if (linkFx.current && performance.now() - linkFx.current.t0 < LINK_FX_MS) requestAnimationFrame(tick);
      else {
        linkFx.current = null;
        redraw();
      }
    };
    requestAnimationFrame(tick);
  };
  const matesOf = (d: Doc, l: Layer) => (l.link ? d.layers.filter((x) => x.link === l.link && x.id !== l.id) : []);

  // --- dessin ---
  useLayoutEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    // repeinte pendant un geste de vue : l'aperçu reste aligné sur la vue en cours
    flushedView.current = null;
    const pending = gesture.current?.next ?? wheelView.current;
    previewView(pending ?? null);
    // durée d'une image : le dessin, puis la peinture du canevas, faite à l'image suivante (elle la retarde)
    const t0 = performance.now();
    let js = 0;
    queueMicrotask(() => (js = performance.now() - t0));
    requestAnimationFrame((t1) =>
      requestAnimationFrame((t2) => (drawCost.current = 0.6 * drawCost.current + 0.4 * (js + Math.max(0, t2 - t1 - 17)))),
    );
    c.width = Math.round(vp.w * dpr);
    c.height = Math.round(vp.h * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    const m0 = new DOMMatrix().scale(dpr).multiply(matrix);
    ctx.setTransform(m0);
    // ombre de la page
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 24 * dpr;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, f.width, f.height);
    ctx.restore();
    drawChecker(ctx, f);
    const L = live.current;
    drawLayers(ctx, doc, f, {
      scale: scale * dpr,
      rot: view.rot,
      onImage: redraw,
      progressive: true,
      wet: L.kind === 'paint' && L.wet && L.layer ? { id: L.layer, canvas: L.wet, win: L.win } : undefined,
      burning: L.kind === 'paint' && L.stroke?.brush === 'burn' && L.layer ? { id: L.layer, stroke: L.stroke } : undefined,
    });
    drawLampTint(ctx, doc, f);
    if (rendu) return;
    const px = 1 / scale;
    // lampe : visible et déplaçable sur la feuille tant que son panneau est ouvert
    if (bubble === 'light') {
      const lp = lampOf(doc);
      const X = lp.x * f.width;
      const Y = lp.y * f.height;
      ctx.save();
      ctx.setLineDash([4 * px, 5 * px]);
      ctx.strokeStyle = 'rgba(227,168,60,0.8)';
      ctx.lineWidth = 1.5 * px;
      ctx.beginPath();
      ctx.moveTo(X, Y);
      ctx.lineTo(f.width / 2, f.height / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      const R = (10 + lp.z * 8) * px;
      ctx.shadowColor = lp.color;
      ctx.shadowBlur = 18 * dpr;
      ctx.fillStyle = lp.color;
      ctx.strokeStyle = '#e3a83c';
      ctx.lineWidth = 2.5 * px;
      ctx.beginPath();
      ctx.arc(X, Y, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(X + Math.cos(a) * (R + 4 * px), Y + Math.sin(a) * (R + 4 * px));
        ctx.lineTo(X + Math.cos(a) * (R + 10 * px), Y + Math.sin(a) * (R + 10 * px));
        ctx.stroke();
      }
      ctx.restore();
    }
    // sélection : découpe en pointillés
    const sel = doc.layers.find((l) => l.id === selected);
    if (sel && sel.kind !== 'surface' && L.kind !== 'cut') {
      ctx.save();
      ctx.lineWidth = 1.5 * px;
      ctx.setLineDash([6 * px, 5 * px]);
      ctx.strokeStyle = '#7a5cff';
      ctx.stroke(maskPath2D(sel, f));
      // objets solidaires : pointillés plus fins
      ctx.lineWidth = 1 * px;
      ctx.setLineDash([2 * px, 4 * px]);
      for (const m of matesOf(doc, sel)) if (m.visible) ctx.stroke(maskPath2D(m, f));
      ctx.restore();
      if ((tool === 'move' || isEdit(tool)) && L.kind !== 'move') {
        const h = handlesOf(sel);
        const r = sel.rot ?? 0;
        const ex = { x: Math.cos(r), y: Math.sin(r) };
        const ey = { x: -Math.sin(r), y: Math.cos(r) };
        // ligne de rotation : du centre de rotation à la poignée
        ctx.save();
        ctx.strokeStyle = 'rgba(122,92,255,0.7)';
        ctx.lineWidth = 1.4 * px;
        ctx.setLineDash([4 * px, 4 * px]);
        ctx.beginPath();
        ctx.moveTo(h.pivot.x, h.pivot.y);
        ctx.lineTo(h.rot.x, h.rot.y);
        ctx.stroke();
        ctx.restore();
        // pendant la rotation : la direction de départ, la direction courante et l'arc parcouru
        if (L.kind === 'rotate' && L.start && L.now) {
          const P = h.pivot;
          const R = Math.hypot(h.rot.x - P.x, h.rot.y - P.y);
          const a0 = Math.atan2(L.start.y - P.y, L.start.x - P.x);
          const a1 = Math.atan2(L.now.y - P.y, L.now.x - P.x);
          ctx.save();
          ctx.lineWidth = 1.4 * px;
          ctx.strokeStyle = 'rgba(122,92,255,0.45)';
          ctx.beginPath();
          ctx.moveTo(P.x, P.y);
          ctx.lineTo(P.x + Math.cos(a0) * R, P.y + Math.sin(a0) * R);
          ctx.stroke();
          // horizontale et verticale de la page, pour se repérer
          ctx.setLineDash([2 * px, 5 * px]);
          ctx.beginPath();
          ctx.moveTo(P.x - R, P.y);
          ctx.lineTo(P.x + R, P.y);
          ctx.moveTo(P.x, P.y - R);
          ctx.lineTo(P.x, P.y + R);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.strokeStyle = '#7a5cff';
          ctx.lineWidth = 2 * px;
          ctx.beginPath();
          ctx.moveTo(P.x, P.y);
          ctx.lineTo(P.x + Math.cos(a1) * R, P.y + Math.sin(a1) * R);
          ctx.stroke();
          let d = a1 - a0;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          ctx.fillStyle = 'rgba(122,92,255,0.14)';
          ctx.beginPath();
          ctx.moveTo(P.x, P.y);
          ctx.arc(P.x, P.y, R * 0.45, a0, a0 + d, d < 0);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        // coins : triangles calés dans l'angle, les côtés le long des bords
        ctx.strokeStyle = '#7a5cff';
        ctx.lineWidth = 2 * px;
        ctx.fillStyle = '#fff';
        ctx.lineJoin = 'round';
        const g = 3 * px;
        const len = 18 * px;
        for (const c of h.corners) {
          const A = { x: c.q.x + (ex.x * c.sx + ey.x * c.sy) * g, y: c.q.y + (ex.y * c.sx + ey.y * c.sy) * g };
          ctx.beginPath();
          ctx.moveTo(A.x, A.y);
          ctx.lineTo(A.x - ex.x * c.sx * len, A.y - ex.y * c.sx * len);
          ctx.lineTo(A.x - ey.x * c.sy * len, A.y - ey.y * c.sy * len);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        // centre de rotation : mire
        ctx.save();
        ctx.lineWidth = 1.6 * px;
        ctx.strokeStyle = '#7a5cff';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(h.pivot.x, h.pivot.y, 7 * px, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(h.pivot.x - 11 * px, h.pivot.y);
        ctx.lineTo(h.pivot.x + 11 * px, h.pivot.y);
        ctx.moveTo(h.pivot.x, h.pivot.y - 11 * px);
        ctx.lineTo(h.pivot.x, h.pivot.y + 11 * px);
        ctx.stroke();
        ctx.restore();
        // poignée de rotation : pastille pleine avec une flèche courbe
        ctx.fillStyle = '#7a5cff';
        ctx.beginPath();
        ctx.arc(h.rot.x, h.rot.y, 10 * px, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.6 * px;
        ctx.beginPath();
        ctx.arc(h.rot.x, h.rot.y, 5 * px, -Math.PI * 0.9, Math.PI * 0.4);
        ctx.stroke();
      }
    }
    // assemblage : l'ensemble bondit, s'entoure d'un liseré et se teinte un instant
    if (linkFx.current) {
      const t = Math.min(1, (performance.now() - linkFx.current.t0) / LINK_FX_MS);
      const ids = new Set(linkFx.current.ids);
      const group = doc.layers.filter((x) => ids.has(x.id) && x.visible);
      if (group.length) {
        let x0 = Infinity,
          y0 = Infinity,
          x1 = -Infinity,
          y1 = -Infinity;
        for (const m of group) {
          const bb = pageBounds(m, f);
          x0 = Math.min(x0, bb.x0);
          y0 = Math.min(y0, bb.y0);
          x1 = Math.max(x1, bb.x1);
          y1 = Math.max(y1, bb.y1);
        }
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        // bond amorti : gonfle puis revient avec un petit rebond
        const k = 1 + 0.07 * Math.sin(t * Math.PI * 2.5) * (1 - t);
        const fade = 1 - t;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(k, k);
        ctx.translate(-cx, -cy);
        for (const m of group) {
          const path = maskPath2D(m, f);
          ctx.fillStyle = `rgba(122,92,255,${0.28 * fade})`;
          ctx.fill(path, 'evenodd');
          ctx.strokeStyle = `rgba(122,92,255,${0.9 * fade})`;
          ctx.lineWidth = (2 + 4 * fade) * px;
          ctx.stroke(path);
        }
        // cadre commun : les objets ne font plus qu'un
        const pad = 10 * px;
        ctx.setLineDash([8 * px, 5 * px]);
        ctx.lineDashOffset = -t * 60 * px;
        ctx.lineWidth = 2 * px;
        ctx.strokeStyle = `rgba(122,92,255,${fade})`;
        ctx.beginPath();
        ctx.roundRect(x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad, 12 * px);
        ctx.stroke();
        ctx.restore();
      }
    }
    // contours détectés dans l'image sélectionnée : pointillés en couleur complémentaire
    // masqués pendant un déplacement ou un geste de vue : seulement pour découper
    if (tool === 'cut' && magnet && !subject.current && sel && (L.kind === null || L.kind === 'cut')) {
      const m = edgesFor(sel);
      if (m) {
        const b = layerBox(sel, f);
        // tracés à part, puis gardés seulement là où la couche est visible :
        // dans sa découpe, dans la page, et pas sous les couches posées dessus
        const o = overlayRef.current ?? (overlayRef.current = document.createElement('canvas'));
        o.width = c.width;
        o.height = c.height;
        const ox = o.getContext('2d')!;
        ox.setTransform(m0);
        ox.strokeStyle = '#ffffff';
        ox.lineWidth = 1.6 * px;
        ox.setLineDash([4 * px, 4 * px]);
        const lines = new Path2D();
        for (const ch of m.chains) {
          for (let i = 0; i < ch.length; i += 2) {
            const q = localToPage(sel, f, ch[i]!, ch[i + 1]!);
            if (i) lines.lineTo(q.x, q.y);
            else lines.moveTo(q.x, q.y);
          }
        }
        ox.stroke(lines);
        ox.globalCompositeOperation = 'destination-in';
        ox.fill(maskPath2D(sel, f), 'evenodd');
        ox.fillRect(0, 0, f.width, f.height);
        ox.globalCompositeOperation = 'destination-out';
        for (const l of coveringLayers(sel)) ox.fill(maskPath2D(l, f), 'evenodd');
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'difference';
        ctx.globalAlpha = 0.85;
        ctx.drawImage(o, 0, 0);
        ctx.restore();
      }
    }
    // Sujet : le sujet trouvé teinté, son contour en pointillés, les traits posés
    const S = subject.current;
    if (tool === 'cut' && subjectOn && S && sel && S.layer === sel.id) {
      if (S.img) {
        ctx.save();
        ctx.clip(maskPath2D(sel, f), 'evenodd');
        const M = layerMatrix(sel, f);
        ctx.transform(M.a, M.b, M.c, M.d, M.e, M.f);
        ctx.globalAlpha = 0.38;
        ctx.drawImage(S.img, S.crop.u0, S.crop.v0, S.crop.u1 - S.crop.u0, S.crop.v1 - S.crop.v0);
        ctx.restore();
      }
      if (S.geom?.length) {
        const path = new Path2D();
        for (const ring of ringsOfGeom(S.geom))
          ring.forEach((q, i) => {
            const P = localToPage(sel, f, q.x, q.y);
            if (i) path.lineTo(P.x, P.y);
            else path.moveTo(P.x, P.y);
          });
        ctx.save();
        ctx.lineWidth = 3 * px;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke(path);
        ctx.lineWidth = 1.6 * px;
        ctx.setLineDash([6 * px, 4 * px]);
        ctx.strokeStyle = '#7a5cff';
        ctx.stroke(path);
        ctx.restore();
      }
      // zone tracée : pointillés fins
      if (S.zone) {
        ctx.save();
        ctx.lineWidth = 1.2 * px;
        ctx.setLineDash([4 * px, 4 * px]);
        ctx.strokeStyle = 'rgba(29,27,34,0.7)';
        ctx.beginPath();
        S.zone.forEach((q, i) => {
          const P = localToPage(sel, f, q.x, q.y);
          if (i) ctx.lineTo(P.x, P.y);
          else ctx.moveTo(P.x, P.y);
        });
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
      // vert pour ajouter, rouge pour retirer
      for (const st of S.strokes) {
        if (st.mode === 'zone') continue;
        ctx.save();
        ctx.strokeStyle = ctx.fillStyle = st.mode === 'add' ? 'rgba(46,170,90,0.9)' : 'rgba(220,60,60,0.9)';
        ctx.lineWidth = 3 * px;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const pts = st.pts.map((q) => localToPage(sel, f, q.x, q.y));
        ctx.beginPath();
        if (pts.length === 1) {
          ctx.arc(pts[0]!.x, pts[0]!.y, 4 * px, 0, Math.PI * 2);
          ctx.fill();
        } else {
          pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    if (L.kind === 'subject' && L.lasso) {
      ctx.save();
      ctx.strokeStyle = subjectErase ? 'rgba(220,60,60,0.9)' : 'rgba(46,170,90,0.9)';
      ctx.fillStyle = 'rgba(122,92,255,0.08)';
      if (L.lasso.length > 2) {
        ctx.beginPath();
        L.lasso.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
        ctx.fill();
      }
      ctx.lineWidth = 3 * px;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      L.lasso.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.stroke();
      ctx.restore();
    }
    // ancrages pendant un déplacement, et tant que le réglage d'ancrage est ouvert :
    // chaque point et chaque ligne a sa couleur caractéristique (marks.ts)
    if (L.kind === 'move' || bubble === 'format' || guidesOn.on) {
      ctx.save();
      ctx.globalAlpha = 0.7;
      // la marge des repères : un cadre pointillé, dedans ou autour de la page
      if (hasMargins(docMargins(doc))) {
        const { l, r, t, b } = marginOf(f);
        ctx.strokeStyle = markColor('margin');
        ctx.lineWidth = 1.2 * px;
        ctx.setLineDash([6 * px, 5 * px]);
        ctx.strokeRect(l * f.width, t * f.height, f.width * (1 - l - r), f.height * (1 - t - b));
        ctx.setLineDash([]);
      }
      ctx.lineWidth = 1 * px;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      for (const a of anchorsOf(doc.frame, f)) {
        ctx.fillStyle = markColor(anchorKind(doc.frame, a.id));
        ctx.beginPath();
        ctx.arc(a.x * f.width, a.y * f.height, 3.5 * px, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
      // l'objet déplacé (ou choisi) : ses bords tenus prennent la couleur de leur ligne, son contour celle de son point
      const held = L.kind === 'move' ? doc.layers.find((x) => x.id === L.layer) : sel && sel.kind !== 'surface' ? sel : undefined;
      if (held?.pins) drawHeldEdges(ctx, held, held.pins, f, px);
      // pendant un déplacement : les points de l'objet qui peuvent s'accrocher (centre, sommets, milieux des côtés)
      if (held && L.kind === 'move') {
        const bb = pageBounds(held, f);
        ctx.save();
        ctx.lineWidth = 1.5 * px;
        for (const g of objectGrips(points)) {
          const x = (bb.x0 + bb.x1) / 2 + g.x * (bb.x1 - bb.x0);
          const y = (bb.y0 + bb.y1) / 2 + g.y * (bb.y1 - bb.y0);
          const r = 3.2 * px;
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.strokeStyle = 'rgba(20,16,30,0.6)';
          ctx.beginPath();
          ctx.rect(x - r, y - r, 2 * r, 2 * r);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }
      if (held && L.kind === 'move' && L.snap) {
        const c = markColor(L.snap.kind);
        const path = maskPath2D(held, f);
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 5 * px;
        ctx.stroke(path);
        ctx.strokeStyle = c;
        ctx.lineWidth = 2.5 * px;
        ctx.stroke(path);
        for (const [w, col] of [
          [5, 'rgba(255,255,255,0.85)'],
          [2.5, c],
        ] as const) {
          ctx.strokeStyle = col;
          ctx.lineWidth = w * px;
          ctx.beginPath();
          ctx.arc(L.snap.x, L.snap.y, 11 * px, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(L.snap.x, L.snap.y, 4 * px, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    // tracé des ciseaux
    if (L.kind === 'cut' && L.lasso && L.lasso.length > 1) {
      ctx.save();
      ctx.lineWidth = 2 * px;
      ctx.setLineDash([7 * px, 5 * px]);
      ctx.strokeStyle = '#1d1b22';
      ctx.fillStyle = 'rgba(122,92,255,0.12)';
      if (L.path) {
        ctx.beginPath();
        L.lasso.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
        ctx.stroke();
      } else {
        tracePath(ctx, L.lasso);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
      if (L.lineAt !== undefined && L.lasso[L.lineAt - 1]) {
        // départ fixe de la ligne droite
        const q = L.lasso[L.lineAt - 1]!;
        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#7a5cff';
        ctx.lineWidth = 2 * px;
        ctx.beginPath();
        ctx.arc(q.x, q.y, 6 * px, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        const z = L.lasso[L.lasso.length - 1]!;
        ctx.fillStyle = '#7a5cff';
        ctx.beginPath();
        ctx.arc(z.x, z.y, 4 * px, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (L.snapped?.length) {
        ctx.fillStyle = '#7a5cff';
        for (const i of L.snapped) {
          const q = L.lasso[i];
          if (!q) continue;
          ctx.beginPath();
          ctx.arc(q.x, q.y, 2.2 * px, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  });

  // --- helpers de couches ---
  const layerAt = (x: number, y: number) => {
    const ord = renderOrder(doc.layers);
    for (let i = ord.length - 1; i >= 0; i--) {
      const l = ord[i]!;
      if (!l.visible) continue;
      const rings = maskRings(l, f);
      // le bord ajouté (contour d'un titre…) fait partie de l'objet : le toucher le choisit
      const out = l.kind === 'surface' ? 0 : borderOut(l, f);
      if (insideRings(rings, x, y) || (out > 0 && nearRings(rings, x, y, out))) return l;
    }
    return null;
  };
  const toLocal = (l: Layer, x: number, y: number) => pageToLocal(l, f, x, y);
  /** Copie de l'élément sélectionné (et de ses objets solidaires), décalée, posée juste au-dessus. */
  const duplicate = (id: string | null = selected, src: Doc = doc) => {
    const me = src.layers.find((x) => x.id === id);
    if (!me || me.kind === 'surface') return;
    const group = [me, ...matesOf(src, me)];
    const link = me.link ? uid() : undefined;
    const ids = new Map(group.map((g) => [g.id, uid()]));
    const copies = group.map((g) => ({ ...structuredClone(g), id: ids.get(g.id)!, name: `${g.name} (copie)`, dx: g.dx + 0.03, dy: g.dy + 0.03, pins: undefined, ...(link ? { link } : {}) }));
    update((d) => {
      const at = Math.max(...group.map((g) => d.layers.findIndex((x) => x.id === g.id)));
      const layers = [...d.layers];
      layers.splice(at + 1, 0, ...copies);
      return { ...d, layers };
    });
    setSelected(ids.get(me.id)!);
    setToast(`« ${me.name} » dupliqué`);
  };
  /** Une couleur lâchée en (x, y) : l'objet visé sur la page ou dans le volet des attributs la prend comme fond. */
  const dropGuide = (i: number, x: number, y: number) => {
    setDragGuide(null);
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!el) return;
    let l: Layer | null | undefined;
    if (el.closest('aside.coupe')) {
      // posée sur le volet des attributs : la ligne visée de la liste, sinon l'objet ouvert
      const row = el.closest('[data-layer]') as HTMLElement | null;
      l = doc.layers.find((x) => x.id === (row?.dataset.layer ?? selected));
    } else if (el.tagName === 'CANVAS') {
      const q = toPage(x, y);
      l = layerAt(q.x, q.y);
    } else return;
    if (!l) return;
    if (l.kind === 'photo') return setToast('Une photo n’a pas de couleur de fond : peins-la ou donne-lui un style');
    patchLayer(l.id, { guide: i });
    setSelected(l.id);
    setToast(`« ${l.name} » prend la couleur « ${doc.guides[i]?.name} »`);
  };
  /**
   * Met à la corbeille les éléments choisis (aujourd'hui un seul, demain une sélection multiple) avec leurs
   * objets solidaires, sauf si Maj est tenu. Le fond n'est jamais supprimé. Annulable.
   */
  const removeSelection = (ids: string[] = selected ? [selected] : []) => {
    const picked = doc.layers.filter((x) => ids.includes(x.id) && x.kind !== 'surface');
    if (!picked.length) return;
    const gone = new Set(picked.flatMap((l) => [l.id, ...(shift ? [] : matesOf(doc, l).map((m) => m.id))]));
    update((d) => ({ ...d, layers: d.layers.filter((x) => !gone.has(x.id) || x.kind === 'surface') }));
    if (selected && gone.has(selected)) setSelected(null);
    const first = picked[0]!;
    setToast(picked.length > 1 ? `${gone.size} éléments à la corbeille` : gone.size > 1 ? `« ${first.name} » et ses objets solidaires à la corbeille` : `« ${first.name} » à la corbeille`);
  };
  const removeRef = useRef(removeSelection);
  removeRef.current = removeSelection;
  /**
   * Poignées : un triangle à chacun des quatre coins du rectangle serré de la découpe, la rotation
   * au-dessus du bord haut. Le centre de rotation est par défaut le point d'ancrage (ramené dans le cadre).
   */
  const handlesOf = (l: Layer) => {
    const k = localBounds(l);
    const tl = localToPage(l, f, k.u0, k.v0);
    const br = localToPage(l, f, k.u1, k.v1);
    const tr = localToPage(l, f, k.u1, k.v0);
    const bl = localToPage(l, f, k.u0, k.v1);
    const top = localToPage(l, f, (k.u0 + k.u1) / 2, k.v0);
    const r = l.rot ?? 0;
    const off = 34 / scale;
    let pv = l.pivot;
    if (!pv) {
      const A = anchorPointOf(l, f);
      const q = pageToLocal(l, f, A.x, A.y);
      pv = { u: Math.max(k.u0, Math.min(k.u1, q.x)), v: Math.max(k.v0, Math.min(k.v1, q.y)) };
    }
    const corners = [
      { q: tl, sx: -1, sy: -1, opp: { u: k.u1, v: k.v1 } },
      { q: tr, sx: 1, sy: -1, opp: { u: k.u0, v: k.v1 } },
      { q: br, sx: 1, sy: 1, opp: { u: k.u0, v: k.v0 } },
      { q: bl, sx: -1, sy: 1, opp: { u: k.u1, v: k.v0 } },
    ];
    return { k, tl, br, top, pv, corners, pivot: localToPage(l, f, pv.u, pv.v), rot: { x: top.x + Math.sin(r) * off, y: top.y - Math.cos(r) * off } };
  };
  /** L'objet est posé sur son point d'ancrage par son centre : il s'agrandit en restant centré. */
  const centeredOnAnchor = (l: Layer) => !l.pivot && Math.abs(l.dx) < 1e-4 && Math.abs(l.dy) < 1e-4;

  /** Déplace, tourne et agrandit les objets solidaires comme la couche tenue : c' = O + R(dr)·k·(c − O). */
  const carryMates = (mates: Layer[] | undefined, O: Pt, k: number, dr: number, tx: number, ty: number) => {
    if (!mates?.length) return new Map<string, Layer>();
    const out = new Map<string, Layer>();
    for (const m of mates) {
      const b = layerBox(m, f);
      const vx = (b.cx - O.x) * k;
      const vy = (b.cy - O.y) * k;
      const cx = O.x + vx * Math.cos(dr) - vy * Math.sin(dr) + tx;
      const cy = O.y + vx * Math.sin(dr) + vy * Math.cos(dr) + ty;
      const a = anchorFor(doc.frame, f, cx, cy);
      out.set(m.id, { ...m, w: m.w * k, h: m.h * k, rot: dr ? Math.atan2(Math.sin((m.rot ?? 0) + dr), Math.cos((m.rot ?? 0) + dr)) : m.rot, anchor: a.anchor, dx: a.dx, dy: a.dy, grip: undefined, pins: undefined });
    }
    return out;
  };
  /** Doigt gardé posé : l'objet descend au niveau de celui du dessous et s'y lie ; déjà lié, il se détache. */
  const solidarize = (id: string, p: Pt) => {
    const d = docRef.current;
    const me = d.layers.find((x) => x.id === id);
    if (!me) return;
    live.current = { kind: null };
    setTrashHot(false);
    setDupHot(false);
    const ord = renderOrder(d.layers);
    const below = ord
      .slice(
        0,
        ord.findIndex((x) => x.id === id),
      )
      .reverse();
    const b = layerBox(me, f);
    const ok = (x: Layer) => x.visible && x.kind !== 'surface' && x.id !== me.id && (!me.link || x.link !== me.link);
    const target = below.find((x) => ok(x) && insideRings(maskRings(x, f), p.x, p.y)) ?? below.find((x) => ok(x) && insideRings(maskRings(x, f), b.cx, b.cy));
    navigator.vibrate?.(12);
    if (!target) {
      if (me.link) {
        const left = d.layers.filter((x) => x.link === me.link && x.id !== me.id);
        setDoc((dd) => ({ ...dd, layers: dd.layers.map((x) => (x.id === me.id || (left.length < 2 && x.link === me.link) ? { ...x, link: undefined } : x)) }));
        setToast(`« ${me.name} » détaché`);
        setToastUndo(true);
      } else setToast('Posez-le sur un autre objet et gardez le doigt pour les solidariser');
      redraw();
      return;
    }
    const group = target.link ?? me.link ?? uid();
    const joining = new Set([me.id, ...(me.link ? d.layers.filter((x) => x.link === me.link).map((x) => x.id) : [])]);
    // descente animée jusqu'au niveau de l'objet du dessous
    const from = new Map(d.layers.filter((x) => joining.has(x.id)).map((x) => [x.id, { h: x.height, i: x.inner ?? 0 }]));
    const to = { h: target.height, i: target.inner ?? 0 };
    const t0 = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / 320);
      const e = 1 - (1 - t) ** 3;
      setDoc((dd) => ({
        ...dd,
        layers: dd.layers.map((x) => {
          if (x.id === target.id && !x.link) return { ...x, link: group };
          const o = from.get(x.id);
          if (!o) return x;
          const inner = o.i + (to.i - o.i) * e;
          return { ...x, link: group, height: o.h + (to.h - o.h) * e, inner: inner || undefined };
        }),
      }));
      if (t < 1) requestAnimationFrame(step);
      else flashLink([target.id, ...joining, ...d.layers.filter((x) => x.link && x.link === target.link).map((x) => x.id)]);
    };
    requestAnimationFrame(step);
    setToast(`« ${me.name} » solidaire de « ${target.name} »`);
    setToastUndo(true);
  };

  // --- pointeurs ---
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    hideHover();
    // aperçu de molette en cours : la vue montrée est appliquée avant de toucher la page
    const flushed = flushWheel();
    (e.target as Element).setPointerCapture(e.pointerId);
    if (e.pointerType === 'mouse' && e.button === 1) {
      e.preventDefault();
      const v0 = flushed ?? view;
      midPan.current = { id: e.pointerId, x: e.clientX, y: e.clientY, px: v0.px, py: v0.py };
      return;
    }
    // stylet posé : la paume et les doigts qui frôlent l'écran sont ignorés
    if (ignoreTouch(e.pointerType, pointers.current.values())) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    // un nouveau toucher : le rangement d'outil en attente attend de voir si c'est un double toucher
    window.clearTimeout(bgLeave.current);
    bgTap.current = null;
    // le panneau lumière reste ouvert : on règle la lampe en regardant la page
    if (bubble === 'light' && pointers.current.size === 1) {
      const q = toPage(e.clientX, e.clientY);
      const lp = lampOf(doc);
      if (Math.hypot(q.x - lp.x * f.width, q.y - lp.y * f.height) * scale < 30) {
        lampDrag.current = e.pointerId;
        return;
      }
    }
    setBubble((b) => (b === 'light' ? b : null));
    setModePick(false);
    setEpop(null);
    const touches = [...pointers.current.values()].filter((p) => p.type === 'touch');
    if (e.pointerType === 'touch' && touches.length >= 2) {
      // plusieurs doigts : on annule le geste à un doigt et on manipule la vue
      stopHold();
      stopCutStill();
      // le premier doigt a pu commencer un geste (déplacer, ou dessiner quand le doigt tient l'outil) :
      // il est retiré sans trace, l'objet revient tel qu'il était
      const L0 = live.current;
      if (swashFrame.current) cancelAnimationFrame(swashFrame.current);
      swashFrame.current = 0;
      cancelAnimationFrame(growTimer.current);
      if (L0.orig && L0.kind && ['move', 'resize', 'rotate', 'pivot', 'mold', 'swash', 'bump'].includes(L0.kind)) {
        const back = new Map([L0.orig, ...(L0.mates ?? [])].map((x) => [x.id, x]));
        setDoc((d) => ({ ...d, layers: d.layers.map((l) => back.get(l.id) ?? l) }));
        past.current.pop();
      }
      live.current = { kind: 'view' };
      if (L0.kind === 'paint' || L0.kind === 'cut') redraw();
      const [a, b] = touches;
      gesture.current = {
        view: gesture.current?.next ?? view,
        c: { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 },
        d: Math.hypot(b!.x - a!.x, b!.y - a!.y),
        a: Math.atan2(b!.y - a!.y, b!.x - a!.x),
      };
      tap.current = { n: touches.length, t0: tap.current?.t0 ?? performance.now(), moved: false };
      return;
    }
    if (e.pointerType === 'touch') tap.current = { n: 1, t0: performance.now(), moved: false };
    if (rendu) return;

    const p = toPage(e.clientX, e.clientY);
    // le doigt déplace, le stylet (ou la souris) utilise l'outil ; sans stylet, le doigt prend l'outil
    // le volet des attributs dispose aussi l'objet (poignées, glisser)
    const t: Tool = pointerTool(e.pointerType, fingerDraws, tool, isEdit(tool));
    const sel = doc.layers.find((l) => l.id === selected);
    // posé sur le fond, hors de la page et de tout objet, un outil actif : un simple toucher le rangera
    const offBg = tool !== 'move' && pointers.current.size === 1 && (p.x < 0 || p.y < 0 || p.x > f.width || p.y > f.height) && !layerAt(p.x, p.y);
    if (offBg) bgTap.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };

    // Modeler : le contour de l'objet choisi (ou touché) suit la pointe
    if (t === 'mold' && !offBg) {
      const hit = layerAt(p.x, p.y);
      // parti près de l'objet choisi (dedans, sur son bord ou à portée de l'outil), le geste le modèle ;
      // parti sur un autre objet, loin du choisi, c'est cet autre objet qu'on modèle
      const reach = swash.r * MOLD_UNIT * Math.min(f.width, f.height) + (sel ? borderOut(sel, f) : 0);
      const nearSel = !!sel && sel.kind !== 'surface' && (insideRings(maskRings(sel, f), p.x, p.y) || nearRings(maskRings(sel, f), p.x, p.y, reach));
      const other = hit && hit.kind !== 'surface' && hit.id !== sel?.id ? hit : null;
      // un objet posé au-dessus du choisi, touché, passe devant (une image de fond choisie par mégarde
      // ne garde pas les gestes suivants)
      const ord = renderOrder(doc.layers);
      const above = !!other && !!sel && ord.indexOf(other) > ord.indexOf(sel);
      const target = other && (above || !nearSel) ? other : sel && sel.kind !== 'surface' ? sel : null;
      if (!target) return setToast('Choisis d’abord un objet à modeler');
      if (target.id !== selected) setSelected(target.id);
      const loc = toLocal(target, p.x, p.y);
      // Relief : on sculpte la surface (bosses, creux), le contour ne bouge pas
      if (swash.mode === 'relief') {
        const bb = layerBox(target, f);
        const cur = target.bump ? { w: target.bump.w, h: target.bump.h, H: bumpHeights(target.bump).slice() } : blankBump(bb.w, bb.h);
        update((d) => d);
        const at: [number, number] = [loc.x * cur.w, loc.y * cur.h];
        // Niveler garde la hauteur trouvée sous la pointe au départ du geste
        const level = swash.sculpt === 'level' ? heightUnder(cur.H, cur.w, cur.h, at[0], at[1], reliefRadius(target, cur.w), reliefTip(target)) : undefined;
        live.current = { kind: 'bump', layer: target.id, orig: target, bump: { ...cur, at, level }, last: { x: e.clientX, y: e.clientY, t: performance.now(), p: pressure(e, null) } };
        sculpt(at, pressure(e, null));
        return;
      }
      const [x, y] = localToPx(target, loc.x, loc.y);
      const pr = pressure(e, null);
      const U = unitPx(target);
      update((d) => d);
      live.current = {
        kind: 'mold',
        layer: target.id,
        orig: target,
        base: currentPx(target),
        pristine: pristinePx(target),
        mold:
          swash.mode === 'orn'
            ? { pts: [], r: 0, orn: { pts: [[x, y, pr]], w: (swash.w ?? (target.text ? swashWidth(target.text.weight) * 0.8 : 0.08)) * U, end: 'fine', ...ornNib(target) } }
            : { pts: [[x, y]], r: swash.r * U, k: swash.k ?? 1, ...(swash.tip && swash.tip !== 'round' ? { tip: swash.tip, rot: (swash.rot ?? 0) - view.rot - (target.rot ?? 0) } : {}) },
        last: { x: e.clientX, y: e.clientY, t: performance.now(), p: pr },
      };
      return;
    }

    // Prolonger : le trait part d'une lettre et devient une partie du texte
    if (swash.on && !offBg && (tool === 'move' || isEdit(tool)) && sel?.kind === 'text' && sel.text) {
      const loc = toLocal(sel, p.x, p.y);
      const pr = pressure(e, null);
      update((d) => d);
      live.current = {
        kind: 'swash',
        layer: sel.id,
        // copie légère : le texte garde ses modelages tels quels, déjà calculés
        orig: { ...sel },
        ...(swash.mode === 'orn'
          ? {
              mold: {
                pts: [],
                r: 0,
                orn: {
                  pts: [[...swashPoint(sel.text, loc.x, loc.y), pr] as [number, number, number]],
                  w: swash.w ?? swashWidth(sel.text.weight) * 0.8,
                  end: 'fine',
                  ...ornNib(sel),
                },
              },
            }
          : swash.mode === 'mold'
            ? { mold: { pts: [swashPoint(sel.text, loc.x, loc.y)], r: swash.r, k: swash.k ?? 1, ...(swash.tip && swash.tip !== 'round' ? { tip: swash.tip, rot: (swash.rot ?? 0) - view.rot - (sel.rot ?? 0) } : {}) } }
            : { sw: { pts: [[...swashPoint(sel.text, loc.x, loc.y), pr] as [number, number, number]], w: swash.w ?? swashWidth(sel.text.weight), end: swash.end } }),
        last: { x: e.clientX, y: e.clientY, t: performance.now(), p: pr },
      };
      return;
    }

    // double toucher (ou double clic) sur un objet : l'éditeur d'objet s'ouvre sur lui
    {
      const now = performance.now();
      const hit = layerAt(p.x, p.y);
      const lt = lastTap.current;
      if (hit && hit.kind !== 'surface' && lt && lt.id === hit.id && now - lt.t < 350 && Math.hypot(p.x - lt.x, p.y - lt.y) * scale < 24) {
        lastTap.current = null;
        live.current = { kind: null };
        // le premier toucher a pu poser un point de peinture : on le retire
        if (now - dotAt.current < 400) undo();
        setSelected(hit.id);
        setTool(lastEdit.current);
        // la vue se recadre sur l'objet, dans la place laissée libre par l'éditeur
        requestAnimationFrame(() => requestAnimationFrame(() => zoomOn(hit)));
        const key = hit.molded ? 'molded' : hit.kind === 'text' ? 'content' : hit.kind === 'shape' ? 'shape' : 'look';
        setCoupeOpen((o) => ({ key, sec: 'image', n: (o?.n ?? 0) + 1 }));
        redraw();
        return;
      }
      // double toucher hors des objets (fond, autour de la page) : la vue revient sur la page entière
      if ((!hit || hit.kind === 'surface') && lt && lt.id === hit?.id && now - lt.t < 350 && Math.hypot(p.x - lt.x, p.y - lt.y) * scale < 24 && !fitted.current) {
        lastTap.current = null;
        live.current = { kind: null };
        if (now - dotAt.current < 400) undo();
        // double toucher : la vue se recadre, l'outil reste en main
        bgTap.current = null;
        fitPage();
        return;
      }
      lastTap.current = { t: now, id: hit?.id, x: p.x, y: p.y };
    }
    // hors de la page, la peinture, le tampon et le modelage n'ont rien à toucher ; le ciseau peut partir de là
    if (offBg && t !== 'cut' && t !== 'move') return;

    if (t === 'move') {
      // poignée de taille de la couche sélectionnée
      if (sel && sel.kind !== 'surface') {
        const h = handlesOf(sel);
        const near = (q: Pt) => Math.hypot(p.x - q.x, p.y - q.y) * scale < 22;
        if (Math.hypot(p.x - h.pivot.x, p.y - h.pivot.y) * scale < 14) {
          update((d) => d);
          live.current = { kind: 'pivot', layer: sel.id, start: p, orig: structuredClone(sel) };
          return;
        }
        if (near(h.rot)) {
          update((d) => d);
          live.current = { kind: 'rotate', layer: sel.id, start: p, orig: structuredClone(sel), mates: shiftHeld(shiftLatch, shiftKey, e.shiftKey) ? [] : structuredClone(matesOf(doc, sel)) };
          return;
        }
        for (const c of h.corners)
          if (near(c.q)) {
            update((d) => d);
            live.current = { kind: 'resize', layer: sel.id, start: p, orig: structuredClone(sel), opp: c.opp, centered: centeredOnAnchor(sel), mates: shiftHeld(shiftLatch, shiftKey, e.shiftKey) ? [] : structuredClone(matesOf(doc, sel)) };
            return;
          }
      }
      const l = layerAt(p.x, p.y);
      if (!l || l.kind === 'surface') {
        setSelected(l?.id ?? null);
        return;
      }
      setSelected(l.id);
      update((d) => d);
      // Maj : la pièce solidaire part seule, sans se détacher (et le doigt gardé ne la détache pas)
      const alone = shiftHeld(shiftLatch, shiftKey, e.shiftKey);
      live.current = { kind: 'move', layer: l.id, start: p, orig: structuredClone(l), snap: null, mates: alone ? [] : structuredClone(matesOf(doc, l)) };
      stopHold();
      if (!alone) hold.current = { x: e.clientX, y: e.clientY, timer: window.setTimeout(() => ((hold.current = null), solidarize(l.id, p)), 600) };
      else if (l.link) setToast('Maj : la pièce bouge seule et reste solidaire');
      return;
    }
    if (isEdit(t)) {
      // Transformer : toucher une photo la sélectionne
      const l = layerAt(p.x, p.y);
      setSelected(l?.id ?? null);
      return;
    }
    if (t === 'cut' && subjectOn && subject.current) {
      // sujet en cours d'ajustement : un toucher ou un trait ajoute ou retire, un nouveau contour refait la zone
      live.current = { kind: 'subject', lasso: [p] };
      redraw();
      return;
    }
    if (t === 'cut') {
      // lignes magnétiques : contours des couches visibles et bords du format
      const grid = magnet && sel ? edgeGrid(sel) : null;
      const s0 = snapEdge(grid, p);
      // parti de l'extérieur de la forme choisie : on trace un chemin, pas une surface
      const path = !!sel && sel.kind !== 'surface' && !insideRings(maskRings(sel, f), p.x, p.y);
      live.current = { kind: 'cut', lasso: [s0.p], grid, snapped: s0.hit ? [0] : [], path };
      armCutStill(e.clientX, e.clientY);
      redraw();
      return;
    }
    // peinture : dans la couche sélectionnée, sinon celle sous le stylet
    const under = layerAt(p.x, p.y);
    // Déborder : parti du fond tout près, le trait reste à l'objet choisi
    const spills = spill && (t === 'stamp' || brushKind === 'hair' || brushKind === 'branch');
    const target = sel && insideRings(maskRings(sel, f), p.x, p.y) ? sel : spills && sel && sel.kind !== 'surface' && (!under || under.kind === 'surface') ? sel : under;
    if (!target) return;
    if (target.id !== selected) setSelected(target.id);
    const sw = spills && target.kind !== 'surface' ? spillWindow(target, f, scale * dpr) : null;
    const tg = sw?.t ?? paintTarget(target, f, scale * dpr);
    const wet = document.createElement('canvas');
    wet.width = tg.pw;
    wet.height = tg.ph;
    const wetOf = (s: Stroke) => (sw ? inWin(s, sw.win) : s);
    const pr = pressure(e, null);
    const q = toLocal(target, p.x, p.y);
    live.current = {
      kind: 'paint',
      layer: target.id,
      wet,
      ...(sw ? { win: sw.win, wtg: sw.t } : {}),
      drawn: 0,
      last: { x: e.clientX, y: e.clientY, t: performance.now(), p: pr },
      stroke:
        t === 'stamp'
          ? {
              brush: 'stamp',
              stamp: stampId,
              dilution,
              wipe: true,
              ...(stampSow ? { sow: { density: sowDensity, spread: sowSpread, persp: sowPersp } } : {}),
              ...(stampFilled ? { filled: true } : {}),
              guide,
              size: stampSize,
              opacity: 0.95,
              seed: Math.floor(Math.random() * 1e9),
              pts: [{ ...q, p: pr, ...stampAngle(e, target) }],
            }
          : brushKind === 'burn'
            ? { brush: 'burn', grow: 0.15, char: burnChar, hole: burnHole, guide, size, opacity, seed: Math.floor(Math.random() * 1e9), pts: [{ ...q, p: pr }] }
            : brushKind === 'branch'
              ? { brush: 'branch', branches, converge, core: branchCore, grow: 0.12, guide, size, opacity, seed: Math.floor(Math.random() * 1e9), pts: [{ ...q, p: pr }] }
              : {
                  brush: brushKind,
                  guide,
                  size,
                  opacity,
                  seed: Math.floor(Math.random() * 1e9),
                  ...(tipOn(brushKind) ? { tip: brushTip } : {}),
                  ...(brushKind === 'hair' ? { hairLen, curl } : {}),
                  ...(brushKind === 'aquarelle' ? { wash: washFor(target.id) } : {}),
                  pts: [{ ...q, p: pr, ...(tipOn(brushKind) ? { r: tipAngle(e, target) } : {}), ...(leanOn(brushKind) ? brushLean(e, target) : {}) }],
                },
    };
    // ramures : tant que la pointe reste posée, les ramifications poussent
    if (t !== 'stamp' && (brushKind === 'branch' || brushKind === 'burn')) {
      const L0 = live.current;
      const t0 = performance.now();
      const tick = () => {
        if (live.current !== L0 || !L0.stroke) return;
        L0.stroke.grow = Math.min(1, (brushKind === 'burn' ? 0.15 : 0.12) + (performance.now() - t0) / (brushKind === 'burn' ? 2200 : 1400));
        const wx = wet.getContext('2d')!;
        wx.clearRect(0, 0, wet.width, wet.height);
        paintStroke(wx, wetOf(L0.stroke), doc.guides, tg);
        redraw();
        if (L0.stroke.grow < 1) growTimer.current = requestAnimationFrame(tick);
      };
      cancelAnimationFrame(growTimer.current);
      growTimer.current = requestAnimationFrame(tick);
    }
    // le tampon s'imprime dès le contact
    if (t === 'stamp') {
      paintStroke(wet.getContext('2d')!, wetOf(live.current.stroke!), doc.guides, tg);
      redraw();
    }
  };

  /**
   * Orientation du stylet à l'écran (radians) : la rotation du crayon sur lui-même quand le
   * stylet la donne (Pencil Pro), sinon la direction où il penche. Tenu en main droite,
   * penché vers le bas à droite, le tampon est droit ; tourner le crayon autour de la pointe le tourne.
   */
  type PenLike = { pointerType: string; buttons?: number; twist?: number; tiltX?: number; tiltY?: number };
  /** Angle du tampon à l'écran : celui du curseur, plus la rotation du crayon si un navigateur la donne un jour. */
  // la rotation du crayon n'arrive qu'au contact : le survol reprend la dernière connue
  const lastTwist = useRef(0);
  const twistSeen = useRef(false);
  const stampScreenAngle = (e: PenLike) => {
    return stampRot + penTwist(e);
  };
  const penTwist = (e: PenLike) => {
    if (e.pointerType !== 'pen' || !penRoll) return 0;
    // au contact, la valeur reçue fait foi (0 compris) dès que le crayon a montré qu'il la donne
    if (e.twist) twistSeen.current = true;
    if (e.buttons && twistSeen.current) lastTwist.current = ((e.twist ?? 0) * Math.PI) / 180;
    return lastTwist.current;
  };
  /** Angle de la brosse dans le repère de la couche : le curseur, plus la rotation du crayon. */
  const tipAngle = (e: PenLike, l: Layer) => brushRot + penTwist(e) - view.rot - (l.rot ?? 0);
  /** Pinceau penché (stylet couché, ou inclinaison de la roue) : la touche s'allonge dans le sens où il penche. */
  const brushLean = (e: PenLike, l: Layer): { k?: number; d?: number } => {
    const tx = e.tiltX ?? 0;
    const ty = e.tiltY ?? 0;
    const tilt = Math.hypot(tx, ty);
    if (e.pointerType === 'pen' && penTilt && tilt > 25) return { k: Math.min(0.9, ((tilt - 25) / 45) * 0.9), d: Math.atan2(ty, tx) - view.rot - (l.rot ?? 0) };
    const m = Math.hypot(brushTilt[0], brushTilt[1]);
    if (m > 0.02) return { k: Math.min(0.9, m * 0.9), d: Math.atan2(brushTilt[1], brushTilt[0]) - view.rot - (l.rot ?? 0) };
    return {};
  };
  /** Rotation et inclinaison du tampon, dans le repère de la couche. */
  const stampAngle = (e: PenLike, l: Layer) => {
    const out: { r?: number; k?: number; d?: number } = { r: stampScreenAngle(e) - view.rot - (l.rot ?? 0) };
    const tx = e.tiltX ?? 0;
    const ty = e.tiltY ?? 0;
    const tilt = Math.hypot(tx, ty);
    // penché au-delà de 25°, le tampon se met en perspective dans le sens où il penche
    if (e.pointerType === 'pen' && penTilt && tilt > 25) {
      out.k = Math.min(0.9, ((tilt - 25) / 45) * 0.9);
      out.d = Math.atan2(ty, tx) - view.rot - (l.rot ?? 0);
    } else if (Math.hypot(stampTilt[0], stampTilt[1]) > 0.02) {
      out.k = Math.min(0.9, Math.hypot(stampTilt[0], stampTilt[1]) * 0.9);
      out.d = Math.atan2(stampTilt[1], stampTilt[0]) - view.rot - (l.rot ?? 0);
    }
    return out;
  };

  /** Repère de survol : un rond de la taille du pinceau, ou l'empreinte du tampon. */
  /** Sélecteur de pointe de la roue : ronde, plate, triangle. */
  /** Le pinceau a toutes les pointes (croix, râteaux, épis) ; Modeler, Plume et Relief : ronde, plate, triangle. */
  const tipPick = <T extends BrushTip>(cur: T, set: (t: T) => void, all: readonly T[] = ['round', 'flat', 'triangle'] as T[]) => ({
    face: <Icon name={`tip-${cur}`} />,
    title: `Pointe : ${TIP_NAMES[cur].toLowerCase()}`,
    next: () => set(all[(all.indexOf(cur) + 1) % all.length]!),
    options: all.map((t) => ({ key: t, icon: <Icon name={`tip-${t}`} />, label: TIP_NAMES[t], on: cur === t })),
    onOption: (k: string) => set(k as T),
  });
  /** Aperçu d'un tampon tel qu'il s'imprime : couleur ou dégradé du guide, rempli si l'option est prise. */
  const stampLook = (def: StampDef) => {
    const g = doc.guides[guide];
    return stampSvg(def, guideColor(g, 0.5), { filled: stampFilled, ...(g?.type === 'gradient' ? { stops: Array.from({ length: 9 }, (_, q) => guideColor(g, q / 8)) } : {}) });
  };
  /** Empreinte en vraie grandeur au centre de l'écran, pendant le réglage de la taille sur la roue. */
  const [sizing, setSizing] = useState<'on' | 'after' | null>(null);
  /** Où survole le stylet (s'il survole la page) : l'empreinte réglée sur la roue s'y montre plutôt qu'au centre. */
  const penHover = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (sizing !== 'after') return;
    const t = setTimeout(() => setSizing(null), 900);
    return () => clearTimeout(t);
  }, [sizing]);
  useEffect(() => {
    const el = hoverRef.current;
    if (!el) return;
    if (!sizing) {
      if (!penHover.current) el.style.display = 'none';
      return;
    }
    const at = penHover.current ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const m = Math.min(f.width, f.height) * scale;
    const D = Math.max(
      6,
      tool === 'mold' ? (swash.mode === 'orn' ? (swash.w ?? (sel?.text ? swashWidth(sel.text.weight) * 0.8 : 0.08)) : swash.r * 2) * MOLD_UNIT * m : tool === 'stamp' ? stampSize * 2 * m : size * 2 * m,
    );
    const tip = tool === 'paint' && tipOn(brushKind) ? brushTip : tool === 'mold' ? moldTip(swash).tip : 'round';
    const H = tip === 'flat' ? Math.max(3, D * 0.3) : D;
    const ang = tool === 'stamp' ? stampRot : tool === 'mold' ? moldTip(swash).rot : tip !== 'round' ? brushRot : 0;
    tipLook(el, tip);
    el.style.display = 'block';
    el.style.width = `${D}px`;
    el.style.height = `${H}px`;
    // tampon incliné : l'empreinte s'écrase vers la direction choisie, comme sur la roue
    const k = tool === 'stamp' && !stampSow ? Math.min(1, Math.hypot(stampTilt[0], stampTilt[1])) : 0;
    const dir = Math.atan2(stampTilt[1], stampTilt[0]);
    // pinceau penché : la touche s'allonge dans le sens choisi
    const kb = tool === 'paint' && leanOn(brushKind) ? Math.min(0.9, Math.hypot(brushTilt[0], brushTilt[1]) * 0.9) : 0;
    const db = Math.atan2(brushTilt[1], brushTilt[0]);
    const persp = k > 0.02 ? ` rotate(${dir}rad) scaleX(${1 - k * 0.35}) rotate(${-dir}rad)` : kb > 0.02 ? ` rotate(${db}rad) scaleX(${1 + kb * LEAN}) rotate(${-db}rad)` : '';
    el.style.transform = `translate(${at.x - D / 2}px, ${at.y - H / 2}px)${persp} rotate(${ang}rad)`;
  });
  /** Repère de survol : forme de la pointe ; une pointe composée se dessine en image (dents, lames). */
  const tipLook = (el: HTMLDivElement, tip: BrushTip) => {
    el.dataset.tip = isComposite(tip) ? 'parts' : tip;
    if (tool === 'stamp') return;
    el.style.backgroundImage = isComposite(tip) ? `url("data:image/svg+xml,${encodeURIComponent(tipHoverSvg(tip))}")` : '';
  };
  const showHover = (e: React.PointerEvent) => {
    const el = hoverRef.current;
    if (!el) return;
    const sel = doc.layers.find((l) => l.id === selected);
    const shaping = swash.on && (tool === 'move' || isEdit(tool)) && sel?.kind === 'text' && !!sel.text;
    const molding = tool === 'mold';
    const painting = tool === 'paint' || tool === 'stamp' || shaping || molding;
    if (!painting || rendu || (e.pointerType !== 'pen' && e.pointerType !== 'mouse')) return hideHover();
    penHover.current = e.pointerType === 'pen' ? { x: e.clientX, y: e.clientY } : null;
    const m = Math.min(f.width, f.height) * scale;
    // Modeler : le rond couvre la zone qui bouge ; Plume : l'épaisseur du trait
    const em = shaping ? (layerBox(sel!, f).w * scale) / Math.max(1e-6, textEm(sel!.text!)) : 0;
    const mu = MOLD_UNIT * m;
    const d = molding
      ? (swash.mode === 'orn' ? (swash.w ?? (sel?.text ? swashWidth(sel.text.weight) * 0.8 : 0.08)) : swash.r * 2) * mu
      : shaping
        ? swash.mode === 'orn'
          ? (swash.w ?? swashWidth(sel!.text!.weight) * 0.8) * em
          : swash.r * 2 * em
        : tool === 'stamp'
          ? stampSize * 2 * m
          : size * 2 * m;
    el.style.display = 'block';
    const D = Math.max(6, d);
    // brosse plate ou triangle : la silhouette de la touche, tournée comme elle peindra
    const tip = molding ? moldTip(swash).tip : shaping && swash.mode === 'orn' ? moldTip(swash).tip : !shaping && tool === 'paint' && tipOn(brushKind) ? brushTip : 'round';
    tipLook(el, tip);
    el.style.width = `${D}px`;
    el.style.height = `${tip === 'flat' ? Math.max(3, D * 0.3) : D}px`;
    const ang = tool === 'stamp' ? stampScreenAngle(e) : (molding || shaping) && tip !== 'round' ? moldTip(swash).rot : tip !== 'round' ? brushRot + penTwist(e) : view.rot;
    // pinceau penché à la main : le repère s'allonge comme la touche
    const kb = tool === 'paint' && !shaping && leanOn(brushKind) ? Math.min(0.9, Math.hypot(brushTilt[0], brushTilt[1]) * 0.9) : 0;
    const db = Math.atan2(brushTilt[1], brushTilt[0]);
    const lean = kb > 0.02 ? ` rotate(${db}rad) scaleX(${1 + kb * LEAN}) rotate(${-db}rad)` : '';
    el.style.transform = `translate(${e.clientX - D / 2}px, ${e.clientY - (tip === 'flat' ? Math.max(3, D * 0.3) : D) / 2}px)${lean} rotate(${ang}rad)`;
  };
  const hideHover = () => {
    penHover.current = null;
    if (hoverRef.current) hoverRef.current.style.display = 'none';
  };

  const pressure = (e: React.PointerEvent, last: { x: number; y: number; t: number; p: number } | null) => {
    if (e.pointerType === 'pen' && e.pressure > 0) {
      // un crayon couché élargit la touche
      const tilt = Math.min(90, Math.hypot(e.tiltX || 0, e.tiltY || 0));
      return Math.min(1, e.pressure * (1 + (tilt / 90) * 0.6));
    }
    // souris : la vitesse remplace la pression (lent = appuyé)
    if (!last) return 0.7;
    const dt = Math.max(1, performance.now() - last.t);
    const v = Math.hypot(e.clientX - last.x, e.clientY - last.y) / dt;
    const target = Math.max(0.25, Math.min(1, 1.1 - v * 0.45));
    return last.p + (target - last.p) * 0.3;
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const mp = midPan.current;
    if (mp && mp.id === e.pointerId) {
      fitted.current = false;
      setView((v) => ({ ...v, px: mp.px + e.clientX - mp.x, py: mp.py + e.clientY - mp.y }));
      return;
    }
    const pt = pointers.current.get(e.pointerId);
    // pointe au-dessus de l'écran, sans contact : on montre seulement où elle touchera
    if (!pt) return showHover(e);
    // le toucher sur le fond devient un glissé : ce n'est plus un toucher pour ranger l'outil
    const bt = bgTap.current;
    if (bt && bt.id === e.pointerId && Math.hypot(e.clientX - bt.x, e.clientY - bt.y) > 10) bgTap.current = null;
    if (lampDrag.current === e.pointerId) {
      const q = toPage(e.clientX, e.clientY);
      const lp = lampOf(doc);
      const cl = (v: number) => Math.max(-0.75, Math.min(1.75, v));
      setDoc((d) => ({ ...d, lamp: { ...lp, x: cl(q.x / f.width), y: cl(q.y / f.height) } }));
      return;
    }
    const moved = Math.hypot(e.clientX - pt.x, e.clientY - pt.y);
    pt.x = e.clientX;
    pt.y = e.clientY;
    const L = live.current;
    if (L.kind === 'view' && gesture.current) {
      const touches = [...pointers.current.values()].filter((p) => p.type === 'touch');
      if (touches.length < 2) return;
      const [a, b] = touches;
      const g = gesture.current;
      // trois doigts qui glissent ensemble (deux avec Maj) : la page s'incline en Vue 3D
      if (touches.length >= 3 || shift) {
        const c3 = { x: touches.reduce((s, t) => s + t.x, 0) / touches.length, y: touches.reduce((s, t) => s + t.y, 0) / touches.length };
        g.c3 ??= c3;
        const [dx, dy] = [c3.x - g.c3.x, c3.y - g.c3.y];
        if (Math.hypot(dx, dy) > 30) {
          previewView(null);
          live.current = { kind: null };
          gesture.current = null;
          tap.current = null;
          pointers.current.clear();
          setView3d({ start: [Math.max(-40, Math.min(40, dx * 0.3)), Math.max(-40, Math.min(40, -dy * 0.3))] });
        }
        return;
      }
      const c = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
      const d = Math.hypot(b!.x - a!.x, b!.y - a!.y);
      const ang = Math.atan2(b!.y - a!.y, b!.x - a!.x);
      if (tap.current && (Math.abs(d - g.d) > 12 || Math.hypot(c.x - g.c.x, c.y - g.c.y) > 12)) tap.current.moved = true;
      let rot = g.view.rot + (ang - g.a);
      // la rotation s'aimante sur l'horizontale
      if (Math.abs(rot) < 0.08) rot = 0;
      g.next = { zoom: Math.max(0.3, Math.min(6, (g.view.zoom * d) / g.d)), rot, px: g.view.px + c.x - g.c.x, py: g.view.py + c.y - g.c.y };
      previewView(g.next);
      return;
    }
    if (tap.current && moved > 6) tap.current.moved = true;
    if (hold.current && Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > 8) stopHold();
    const p = toPage(e.clientX, e.clientY);
    if (L.kind === 'bump' && L.bump && L.orig) {
      const events = (e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]) as PointerEvent[];
      for (const ev of events) {
        if (ev.pointerType === 'pen' && ev.buttons === 0) continue;
        const q = toPage(ev.clientX, ev.clientY);
        const pr = pressure(ev as unknown as React.PointerEvent, L.last!);
        L.last = { x: ev.clientX, y: ev.clientY, t: performance.now(), p: pr };
        const loc = toLocal(L.orig, q.x, q.y);
        sculpt([loc.x * L.bump.w, loc.y * L.bump.h], pr);
      }
      return;
    }
    if (L.kind === 'mold' && L.mold && L.orig) {
      const events = (e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]) as PointerEvent[];
      const U = unitPx(L.orig);
      for (const ev of events) {
        if (ev.pointerType === 'pen' && ev.buttons === 0) continue;
        const q = toPage(ev.clientX, ev.clientY);
        const pr = pressure(ev as unknown as React.PointerEvent, L.last!);
        L.last = { x: ev.clientX, y: ev.clientY, t: performance.now(), p: pr };
        const loc = toLocal(L.orig, q.x, q.y);
        const [x, y] = localToPx(L.orig, loc.x, loc.y);
        const orn = L.mold.orn;
        const line = orn?.pts ?? L.mold.pts;
        const prev = line[line.length - 1]!;
        if (Math.hypot(x - prev[0], y - prev[1]) < U * (orn ? 0.02 : 0.012)) continue;
        if (orn) orn.pts.push([x, y, pr]);
        else L.mold.pts.push([x, y]);
      }
      if (!swashFrame.current) swashFrame.current = requestAnimationFrame(() => ((swashFrame.current = 0), applyMold(false)));
      return;
    }
    if (L.kind === 'swash' && (L.sw || L.mold) && L.orig?.text) {
      const events = (e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]) as PointerEvent[];
      for (const ev of events) {
        if (ev.pointerType === 'pen' && ev.buttons === 0) continue;
        const q = toPage(ev.clientX, ev.clientY);
        const pr = pressure(ev as unknown as React.PointerEvent, L.last!);
        L.last = { x: ev.clientX, y: ev.clientY, t: performance.now(), p: pr };
        const loc = toLocal(L.orig, q.x, q.y);
        const [x, y] = swashPoint(L.orig.text, loc.x, loc.y);
        const orn = L.mold?.orn;
        const line = L.sw?.pts ?? orn?.pts ?? L.mold!.pts;
        const prev = line[line.length - 1]!;
        if (Math.hypot(x - prev[0], y - prev[1]) < (L.mold && !orn ? 0.012 : 0.02)) continue;
        if (L.sw) L.sw.pts.push([x, y, pr]);
        else if (orn) orn.pts.push([x, y, pr]);
        else L.mold!.pts.push([x, y]);
      }
      if (!swashFrame.current) swashFrame.current = requestAnimationFrame(() => ((swashFrame.current = 0), applySwash(false)));
      return;
    }
    if (L.kind === 'paint' && L.stroke && L.layer) {
      const l = doc.layers.find((x) => x.id === L.layer)!;
      const events = (e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]) as PointerEvent[];
      const stamping = L.stroke.brush === 'stamp';
      const branching = L.stroke.brush === 'branch';
      const had = L.stroke.pts.length;
      for (const ev of events) {
        // le stylet n'écrit qu'au contact
        if (ev.pointerType === 'pen' && ev.buttons === 0) continue;
        const q = toPage(ev.clientX, ev.clientY);
        const pr = pressure(ev as unknown as React.PointerEvent, L.last!);
        L.last = { x: ev.clientX, y: ev.clientY, t: performance.now(), p: pr };
        const loc = toLocal(l, q.x, q.y);
        const prev = L.stroke.pts[L.stroke.pts.length - 1]!;
        const dist = Math.hypot((loc.x - prev.x) * l.w, (loc.y - prev.y) * l.h);
        // un tampon traîné imprime une suite d'empreintes, espacées de leur taille
        // essuyé : le geste est suivi finement, l'encre s'étire derrière l'empreinte
        if (stamping ? dist < L.stroke.size * (L.stroke.sow ? 0.12 : L.stroke.wipe ? 0.05 : 2.2) : dist * Math.min(f.width, f.height) * scale < 1.5) continue;
        L.stroke.pts.push({
          ...loc,
          p: pr,
          ...(stamping && !L.stroke.wipe ? stampAngle(ev, l) : L.stroke.tip ? { r: tipAngle(ev, l) } : {}),
          ...(!stamping && !branching && L.stroke.brush !== 'burn' ? brushLean(ev, l) : {}),
        });
      }
      // rien de nouveau sous la pointe : on ne repeint pas
      if (L.stroke.pts.length !== had) {
        const tg = L.wtg ?? paintTarget(l, f, scale * dpr);
        const ws = L.win ? inWin(L.stroke, L.win) : L.stroke;
        if (stamping) L.ink = previewStampInk(L.wet!.getContext('2d')!, ws, doc.guides, tg, L.ink);
        else if (branching) {
          // les ramures se repeignent en entier : au plus une fois par image
          L.branchFrame ||= requestAnimationFrame(() => {
            L.branchFrame = 0;
            if (live.current !== L) return;
            repaintBranch(L, tg);
            redraw();
          });
        } else L.drawn = previewStamps(L.wet!.getContext('2d')!, ws, doc.guides, tg, L.drawn ?? 0);
        redraw();
      }
    } else if (L.kind === 'subject' && L.lasso) {
      const events = (e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]) as PointerEvent[];
      for (const ev of events) L.lasso.push(toPage(ev.clientX, ev.clientY));
      redraw();
    } else if (L.kind === 'cut' && L.shaped) {
      // forme reconnue : elle reste telle quelle jusqu'au lâcher
    } else if (L.kind === 'cut' && L.lasso && L.lineAt !== undefined) {
      // mode ligne : la pointe déplace l'extrémité, le départ reste fixe
      const s1 = snapEdge(L.grid ?? null, p);
      L.lasso.length = L.lineAt;
      L.snapped = (L.snapped ?? []).filter((i) => i < L.lineAt!);
      if (s1.hit) L.snapped.push(L.lasso.length);
      L.lasso.push(s1.p);
      if (cutStill.current && Math.hypot(e.clientX - cutStill.current.x, e.clientY - cutStill.current.y) > 4) armCutStill(e.clientX, e.clientY);
      redraw();
    } else if (L.kind === 'cut' && L.lasso) {
      if (cutStill.current && Math.hypot(e.clientX - cutStill.current.x, e.clientY - cutStill.current.y) > 4) armCutStill(e.clientX, e.clientY);
      const events = (e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]) as PointerEvent[];
      for (const ev of events) {
        const s1 = snapEdge(L.grid ?? null, toPage(ev.clientX, ev.clientY));
        if (s1.hit) L.snapped!.push(L.lasso.length);
        L.lasso.push(s1.p);
      }
      redraw();
    } else if (L.kind === 'move' && L.orig && L.start) {
      const over = (el: HTMLElement | null) => {
        const r = el?.getBoundingClientRect();
        return !!r && e.clientX > r.left - 14 && e.clientX < r.right + 14 && e.clientY > r.top - 14 && e.clientY < r.bottom + 14;
      };
      const hot = over(trashRef.current);
      if (hot !== trashHot) setTrashHot(hot);
      const dhot = !hot && over(dupRef.current);
      if (dhot !== dupHot) setDupHot(dhot);
      const o = L.orig;
      const b = layerBox(o, f);
      let cx = b.cx + p.x - L.start.x;
      let cy = b.cy + p.y - L.start.y;
      // aimant : le centre, et les sommets et milieux de côtés cochés, sont attirés par l'ancrage le plus proche
      const bb = pageBounds(o, f);
      const m0 = Math.min(f.width, f.height);
      L.snap = null;
      // Maj : ni ancrage ni bord, l'objet suit le doigt
      const free = shiftHeld(shiftLatch, shiftKey, e.shiftKey);
      let bestD = free ? 0 : MAGNET / scale;
      for (const g of free ? [] : objectGrips(points)) {
        // le point de l'objet, d'après sa découpe, relatif au centre de sa boîte
        const ox = g.x || g.y ? (bb.x0 + bb.x1) / 2 + g.x * (bb.x1 - bb.x0) - b.cx : 0;
        const oy = g.x || g.y ? (bb.y0 + bb.y1) / 2 + g.y * (bb.y1 - bb.y0) - b.cy : 0;
        const near = anchorFor(doc.frame, f, cx + ox, cy + oy);
        const ax = near.at.x * f.width;
        const ay = near.at.y * f.height;
        // à distance égale, le centre l'emporte
        const d = Math.hypot(ax - cx - ox, ay - cy - oy) * (g.x || g.y ? 1.15 : 1);
        if (d < bestD) {
          bestD = d;
          const grip = g.x || g.y ? { x: ox / (o.w * m0), y: oy / (o.h * m0) } : undefined;
          L.snap = { x: ax, y: ay, kind: anchorKind(doc.frame, near.at.id), anchor: near.anchor, grip, ox, oy };
        }
      }
      if (L.snap) [cx, cy] = [L.snap.x - L.snap.ox, L.snap.y - L.snap.oy];
      // bords de la découpe aimantés sur les bords de la page
      const tol = free ? 0 : MAGNET / scale;
      const ex = { l: bb.x0 - b.cx, r: bb.x1 - b.cx, t: bb.y0 - b.cy, b: bb.y1 - b.cy };
      const pins: NonNullable<Layer['pins']> = {};
      // bords de page, puis lignes de marge : le plus proche l'emporte
      const lines = edgeLines(f);
      const near1 = (side: 'left' | 'right' | 'top' | 'bottom', v: number) => {
        let best: { d: number; pin: Pin; at: number } | null = null;
        // sans marge, la ligne de marge se confond avec le bord : on s'y attache, pour suivre la marge si elle change ensuite
        for (const [pin, at] of [[lines.margin ? true : 'margin', lines.page[side]], ...(lines.margin ? [['margin', lines.margin[side]]] : [])] as Array<[Pin, number]>) {
          const d = Math.abs(v - at);
          if (d < tol && (!best || d < best.d)) best = { d, pin, at };
        }
        return best;
      };
      const pl = near1('left', cx + ex.l);
      const pr = near1('right', cx + ex.r);
      if (pl && (!pr || pl.d <= pr.d)) [cx, pins.left] = [pl.at - ex.l, pl.pin];
      else if (pr) [cx, pins.right] = [pr.at - ex.r, pr.pin];
      const pr2 = near1('right', cx + ex.r);
      if (pr2 && pr2.d < 1e-6) pins.right = pr2.pin;
      const pt = near1('top', cy + ex.t);
      const pb = near1('bottom', cy + ex.b);
      if (pt && (!pb || pt.d <= pb.d)) [cy, pins.top] = [pt.at - ex.t, pt.pin];
      else if (pb) [cy, pins.bottom] = [pb.at - ex.b, pb.pin];
      const pb2 = near1('bottom', cy + ex.b);
      if (pb2 && pb2.d < 1e-6) pins.bottom = pb2.pin;
      const edge = pins.left || pins.right || pins.top || pins.bottom;
      if (edge) L.snap = null;
      L.pins = edge ? pins : undefined;
      const a = anchorFor(doc.frame, f, cx, cy);
      const carried = carryMates(L.mates, { x: 0, y: 0 }, 1, 0, cx - b.cx, cy - b.cy);
      const sn = L.snap;
      setDoc((d) => ({
        ...d,
        layers: d.layers.map((x) =>
          x.id === o.id ? (sn ? { ...x, anchor: sn.anchor, dx: 0, dy: 0, grip: sn.grip, pins: L.pins } : { ...x, anchor: a.anchor, dx: a.dx, dy: a.dy, grip: undefined, pins: L.pins }) : (carried.get(x.id) ?? x),
        ),
      }));
    } else if (L.kind === 'resize' && L.orig && L.start && L.opp) {
      // agrandir depuis un coin : le coin opposé reste en place
      const o = L.orig;
      const b = layerBox(o, f);
      // posé par son centre sur son ancrage : il grandit autour de ce centre, sinon le coin opposé reste en place
      const O = L.centered ? anchorPointOf(o, f) : localToPage(o, f, L.opp.u, L.opp.v);
      let k = Math.max(0.05, Math.hypot(p.x - O.x, p.y - O.y) / Math.max(1e-9, Math.hypot(L.start.x - O.x, L.start.y - O.y)));
      // aimant : un bord de la découpe qui approche un bord de page s'y pose
      const bb = pageBounds(o, f);
      let best: number | null = null;
      const lines = edgeLines(f);
      const targets: Array<readonly [number, number, number]> = [
        [bb.x0, O.x, 0],
        [bb.x1, O.x, f.width],
        [bb.y0, O.y, 0],
        [bb.y1, O.y, f.height],
      ];
      // la marge aimante aussi
      if (lines.margin) targets.push([bb.x0, O.x, lines.margin.left], [bb.x1, O.x, lines.margin.right], [bb.y0, O.y, lines.margin.top], [bb.y1, O.y, lines.margin.bottom]);
      for (const [edge, o0, page] of targets) {
        if (Math.abs(edge - o0) < 1e-9) continue;
        const kk = (page - o0) / (edge - o0);
        const now = o0 + (edge - o0) * k;
        if (kk > 0.05 && !shiftHeld(shiftLatch, shiftKey, e.shiftKey) && Math.abs(now - page) * scale < MAGNET && (best === null || Math.abs(kk - k) < Math.abs(best - k))) best = kk;
      }
      if (best !== null) k = best;
      if (o.free) {
        // proportions libres : largeur et hauteur suivent le doigt séparément, dans le repère de l'objet
        const r = o.rot ?? 0;
        const [c, sn] = [Math.cos(r), Math.sin(r)];
        const loc = (x: number, y: number) => ({ x: (x - O.x) * c + (y - O.y) * sn, y: -(x - O.x) * sn + (y - O.y) * c });
        const d0 = loc(L.start.x, L.start.y);
        const d1 = loc(p.x, p.y);
        const kx = Math.max(0.05, Math.abs(d0.x) > 1e-6 ? d1.x / d0.x : 1);
        const ky = Math.max(0.05, Math.abs(d0.y) > 1e-6 ? d1.y / d0.y : 1);
        const v = loc(b.cx, b.cy);
        const vx = v.x * kx;
        const vy = v.y * ky;
        const cx = O.x + vx * c - vy * sn;
        const cy = O.y + vx * sn + vy * c;
        const a = anchorFor(doc.frame, f, cx, cy);
        setDoc((d) => ({ ...d, layers: d.layers.map((x) => (x.id === o.id ? { ...x, w: o.w * kx, h: o.h * ky, anchor: a.anchor, dx: a.dx, dy: a.dy, grip: undefined } : x)) }));
        return;
      }
      const cx = O.x + (b.cx - O.x) * k;
      const cy = O.y + (b.cy - O.y) * k;
      const a = anchorFor(doc.frame, f, cx, cy);
      const carried = carryMates(L.mates, O, k, 0, 0, 0);
      // accroché par un sommet ou un côté : ce point reste sur son ancrage, seule la taille change
      const keep = L.centered && o.grip;
      setDoc((d) => ({
        ...d,
        layers: d.layers.map((x) => (x.id === o.id ? (keep ? { ...x, w: o.w * k, h: o.h * k } : { ...x, w: o.w * k, h: o.h * k, anchor: a.anchor, dx: a.dx, dy: a.dy, grip: undefined }) : (carried.get(x.id) ?? x))),
      }));
    } else if (L.kind === 'pivot' && L.orig) {
      // le centre de rotation reste dans le cadre des poignées
      const o = L.orig;
      const k = localBounds(o);
      const q = pageToLocal(o, f, p.x, p.y);
      const pivot = { u: Math.max(k.u0, Math.min(k.u1, q.x)), v: Math.max(k.v0, Math.min(k.v1, q.y)) };
      // près du point d'ancrage, le centre de rotation y revient et le suit ensuite
      const home = handlesOf({ ...o, pivot: undefined }).pivot;
      const back = Math.hypot(p.x - home.x, p.y - home.y) * scale < 16;
      if (back !== !!L.centered) setToast(back ? 'Centre de rotation : point d’ancrage' : 'Centre de rotation libre');
      L.centered = back;
      setDoc((d) => ({ ...d, layers: d.layers.map((x) => (x.id === o.id ? { ...x, pivot: back ? undefined : pivot } : x)) }));
    } else if (L.kind === 'rotate' && L.orig && L.start) {
      L.now = p;
      const o = L.orig;
      const b = layerBox(o, f);
      const P = handlesOf(o).pivot;
      let r = (o.rot ?? 0) + Math.atan2(p.y - P.y, p.x - P.x) - Math.atan2(L.start.y - P.y, L.start.x - P.x);
      // aimant tous les 15°
      const step = Math.PI / 12;
      const q = Math.round(r / step) * step;
      if (!shiftHeld(shiftLatch, shiftKey, e.shiftKey) && Math.abs(r - q) < (3 * Math.PI) / 180) r = q;
      r = Math.atan2(Math.sin(r), Math.cos(r));
      setToast(`${Math.round((r * 180) / Math.PI)}°`);
      // le centre de la boîte tourne autour du centre de rotation, qui reste fixe
      const dr = r - (o.rot ?? 0);
      const vx = b.cx - P.x;
      const vy = b.cy - P.y;
      const cx = P.x + vx * Math.cos(dr) - vy * Math.sin(dr);
      const cy = P.y + vx * Math.sin(dr) + vy * Math.cos(dr);
      const a = anchorFor(doc.frame, f, cx, cy);
      const carried = carryMates(L.mates, P, 1, dr, 0, 0);
      setDoc((d) => ({ ...d, layers: d.layers.map((x) => (x.id === o.id ? { ...x, rot: r, anchor: a.anchor, dx: a.dx, dy: a.dy, grip: undefined } : (carried.get(x.id) ?? x))) }));
    }
  };

  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (midPan.current?.id === e.pointerId) {
      midPan.current = null;
      return;
    }
    pointers.current.delete(e.pointerId);
    stopHold();
    if (lampDrag.current === e.pointerId) {
      lampDrag.current = null;
      return;
    }
    const remaining = pointers.current.size;
    const L = live.current;
    // simple toucher sur le fond : l'outil se range (un instant plus tard, pour laisser place au double toucher)
    const bt = bgTap.current;
    if (bt && bt.id === e.pointerId) {
      bgTap.current = null;
      if (e.type !== 'pointercancel' && remaining === 0 && L.kind !== 'view' && performance.now() - bt.t < 500) {
        if (L.kind === 'cut') {
          stopCutStill();
          live.current = { kind: null };
          redraw();
        }
        tap.current = null;
        window.clearTimeout(bgLeave.current);
        bgLeave.current = window.setTimeout(() => setTool('move'), 320);
        return;
      }
    }
    if (L.kind === 'view') {
      if (remaining === 0) {
        const t = tap.current;
        // tape à deux doigts : annuler ; à trois : rétablir
        if (t && !t.moved && performance.now() - t.t0 < 350) {
          if (t.n === 2) undo();
          if (t.n >= 3) redo();
        }
        tap.current = null;
        live.current = { kind: null };
        const next = gesture.current?.next;
        gesture.current = null;
        // la vue est appliquée : la page est repeinte nette et la transformation provisoire retirée
        if (next) {
          fitted.current = false;
          setView(next);
        }
      }
      return;
    }
    if (remaining > 0) return;
    tap.current = null;
    if (L.kind === 'bump' && L.bump && L.layer) {
      if (swashFrame.current) cancelAnimationFrame(swashFrame.current);
      swashFrame.current = 0;
      const { w, h, H } = L.bump;
      const id = L.layer;
      live.current = { kind: null };
      setDoc((d) => ({ ...d, layers: d.layers.map((x) => (x.id === id ? { ...x, bump: encodeBump(w, h, H) } : x)) }));
      return;
    }
    if (L.kind === 'mold') {
      if (swashFrame.current) cancelAnimationFrame(swashFrame.current);
      swashFrame.current = 0;
      applyMold(true);
      live.current = { kind: null };
      return;
    }
    if (L.kind === 'swash') {
      if (swashFrame.current) cancelAnimationFrame(swashFrame.current);
      swashFrame.current = 0;
      applySwash(true);
      live.current = { kind: null };
      return;
    }
    if (L.kind === 'paint' && L.stroke && L.layer) {
      const s = L.stroke;
      const id = L.layer;
      live.current = { kind: null };
      if (s.pts.length === 1 && s.brush !== 'stamp') s.pts.push({ ...s.pts[0]!, x: s.pts[0]!.x + 0.001 });
      // le papier reste mouillé à partir du dernier trait posé
      if (s.wash !== undefined && wetPass.current?.id === s.wash) wetPass.current.at = Date.now();
      dotAt.current = s.pts.length <= 3 ? performance.now() : 0;
      // Déborder : l'encre sortie de la découpe la repousse, comme un modelage
      const l0 = doc.layers.find((x) => x.id === id);
      if (L.branchFrame) {
        // la dernière repeinture des ramures n'a pas eu lieu : l'aperçu doit situer toute l'encre
        cancelAnimationFrame(L.branchFrame);
        L.branchFrame = 0;
        if (L.win && L.wtg) repaintBranch(L, L.wtg);
      }
      const grown = L.win && L.wet && l0 && canSpill(s) ? growPatch({ ...l0, strokes: [...l0.strokes, s] }, f, inkRings(l0, f, s, doc.guides, scale * dpr, L.wet, L.win)) : {};
      // le canevas du geste (jusqu'à 2048 px quand l'encre déborde) n'est plus montré : sa mémoire est rendue
      if (L.wet) L.wet.width = L.wet.height = 0;
      update((d) => ({ ...d, layers: d.layers.map((l) => (l.id === id ? { ...l, strokes: [...l.strokes, s], ...grown } : l)) }));
      return;
    }
    if (L.kind === 'subject' && L.lasso) {
      live.current = { kind: null };
      subjectGesture(L.lasso);
      return;
    }
    if (L.kind === 'cut' && L.lasso) {
      live.current = { kind: null };
      stopCutStill();
      // en mode ligne, les segments droits gardent leurs extrémités exactes
      // Lissage au-delà de la moitié : le tracé aimanté ne suit plus les petits écarts des contours détectés
      const steady = magnet && !L.shaped && L.lineAt === undefined && edgeSmooth > 0.5 ? steadyPath(L.lasso, (30 + (edgeSmooth - 0.5) * 2 * 60) / scale, 2.5 / scale, !L.path) : L.lasso;
      const pts = L.shaped ? L.lasso : L.lineAt !== undefined ? [...simplify(L.lasso.slice(0, Math.max(1, L.lineAt)), 1.2 / scale), L.lasso[L.lasso.length - 1]!] : simplify(steady, 1.2 / scale);
      if (L.path) finishPath(pts);
      else finishCut(pts);
      return;
    }
    if (L.kind === 'move' && L.layer) {
      const l = doc.layers.find((x) => x.id === L.layer);
      if (l && trashHot) {
        // glissé sur la corbeille : suppression (annulable)
        const o = L.orig!;
        const gone = new Set([o.id, ...(L.mates ?? []).map((x) => x.id)]);
        setDoc((d) => ({ ...d, layers: d.layers.filter((x) => !gone.has(x.id)) }));
        setSelected(null);
        setTrashHot(false);
        setToast(gone.size > 1 ? `« ${o.name} » et ses objets solidaires à la corbeille` : `« ${o.name} » à la corbeille`);
      } else if (l && dupHot) {
        // glissé sur Dupliquer : l'objet revient à sa place et sa copie est posée à côté
        const back = new Map<string, Layer>([[L.orig!.id, L.orig!], ...(L.mates ?? []).map((x) => [x.id, x] as [string, Layer])]);
        const src = { ...doc, layers: doc.layers.map((x) => back.get(x.id) ?? x) };
        setDoc(src);
        setDupHot(false);
        duplicate(l.id, src);
      } else if (l) {
        const pins = l.pins
          ? Object.entries(l.pins)
              .filter(([, v]) => v)
              .map(([k, v]) => ({ left: 'gauche', right: 'droite', top: 'haut', bottom: 'bas' })[k] + (v === 'margin' ? ' (marge)' : ''))
          : [];
        setToast(pins.length ? `Tenu au bord ${pins.join(', ')}` : L.snap ? `Ancré sur ${l.anchor.point}` : `Près de ${l.anchor.point}`);
      }
    }
    if ((L.kind === 'resize' || L.kind === 'rotate') && L.layer) {
      // après agrandissement ou rotation : bords de page touchés
      const ids = new Set([L.layer, ...(L.mates ?? []).map((x) => x.id)]);
      setDoc((d) => ({ ...d, layers: d.layers.map((x) => (ids.has(x.id) ? { ...x, pins: pinsOf(x, f, 1.5 / scale) } : x)) }));
    }
    live.current = { kind: null };
    redraw();
  };

  // --- contours de l'image sélectionnée ---
  const analysisCache = useRef<{ key: string; a: ReturnType<typeof analyse> } | null>(null);
  const mapCache = useRef<{ key: string; m: EdgeMap } | null>(null);
  /** Contours détectés dans l'image d'une couche (photo, matière et peinture), mis en cache. */
  const edgesFor = (l: Layer): EdgeMap | null => {
    const b = layerBox(l, f);
    const key = JSON.stringify([l.id, l.cut, l.shape, l.text, textEpoch(), l.src?.length, l.strokes.length, l.guide, doc.guides, l.w, l.h, f.id, l.anchor, l.dx, l.dy]);
    if (analysisCache.current?.key !== key) {
      if (l.kind === 'photo' && l.src && !imageFor(l.src, redraw)) return null;
      const { w, h } = analysisSize(b.w, b.h);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.setTransform(w / b.w, 0, 0, h / b.h, (-(b.cx - b.w / 2) * w) / b.w, (-(b.cy - b.h / 2) * h) / b.h);
      // la couche seule, à plat : sans ombre ni liseré
      drawLayers(ctx, { ...doc, layers: [{ ...l, height: 0, bevel: 0, border: undefined, rot: 0, visible: true }] }, f, { scale: scale * dpr, onImage: redraw });
      analysisCache.current = { key, a: analyse(c) };
      mapCache.current = null;
    }
    const mk = `${key}|${edgeMode}|${edgeThreshold}|${edgeSmooth}`;
    if (mapCache.current?.key !== mk) mapCache.current = { key: mk, m: edgeMap(analysisCache.current.a, edgeMode, edgeThreshold, edgeSmooth) };
    return mapCache.current.m;
  };
  // --- Découper › Sujet : détourage par le modèle Magic Touch ---
  /**
   * Analyse une couche, recadrée sur `crop` (coordonnées de la couche) : le modèle ne
   * se charge qu'à ce moment-là, au premier geste en mode Sujet.
   */
  const startSubject = (l: Layer, crop: SubjectCrop, zone: Pt[] | null, first: SubjectStroke[]) => {
    if (l.kind === 'photo' && l.src && !imageFor(l.src, redraw)) return;
    const b = layerBox(l, f);
    const [cw, ch] = [b.w * (crop.u1 - crop.u0), b.h * (crop.v1 - crop.v0)];
    const k = SUBJECT_SIZE / Math.max(cw, ch);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(cw * k));
    c.height = Math.max(1, Math.round(ch * k));
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.setTransform(k, 0, 0, k, -(b.cx - b.w / 2 + crop.u0 * b.w) * k, -(b.cy - b.h / 2 + crop.v0 * b.h) * k);
    // la photo entière, à plat : le modèle voit tout le contexte, même hors de la découpe
    const flat: Layer = { ...l, height: 0, bevel: 0, border: undefined, rot: 0, visible: true, ...(l.kind === 'photo' ? { cut: undefined, molded: undefined } : {}) };
    drawLayers(ctx, { ...doc, layers: [flat] }, f, { scale: k, onImage: redraw });
    const S: NonNullable<typeof subject.current> = { layer: l.id, crop, zone, state: 'busy', strokes: first, mask: null, img: null, geom: null };
    subject.current = S;
    redraw();
    setSubjectImage(c)
      .then(() => {
        if (subject.current !== S) return;
        S.state = 'ready';
        runSubject();
      })
      .catch((e) => {
        if (subject.current !== S) return;
        S.state = 'error';
        S.error = e instanceof Error ? e.message : String(e);
        redraw();
      });
  };
  /** Décode les traits en cours ; un seul décodage à la fois, le dernier état des traits gagne. */
  const runSubject = () => {
    const S = subject.current;
    if (!S || S.state !== 'ready') return;
    if (S.running) {
      S.again = true;
      return;
    }
    S.running = true;
    S.again = false;
    const { u0, v0, u1, v1 } = S.crop;
    // traits en coordonnées de l'image analysée (le recadrage)
    const strokes = S.strokes.map((x) => ({ ...x, pts: x.pts.map((q) => ({ x: (q.x - u0) / (u1 - u0), y: (q.y - v0) / (v1 - v0) })) }));
    segmentSubject(strokes)
      .then((m) => {
        if (subject.current !== S) return;
        const l = doc.layers.find((x) => x.id === S.layer);
        S.mask = m;
        S.img = m ? maskImage(m, [122, 92, 255]) : null;
        if (m && l) {
          // la découpe suit le contour du modèle (dans la forme de la couche), même là où il
          // déborde du tracé ; on ne garde que les morceaux que le tracé touche
          const g = subjectGeom(m, localRings(l), S.crop);
          const zone = S.zone;
          S.geom = zone ? g.filter((poly) => geomArea(intersect(ringsOfGeom([poly]), [zone])) > 0) : g;
        } else S.geom = null;
        // après le tracé, la lame déjà choisie coupe tout de suite (Annuler, en haut, revient en arrière)
        if (S.zone && S.strokes.length === 1) {
          if (S.geom?.length) detachSubject(blade);
          else {
            subject.current = null;
            setToast('Aucun sujet trouvé dans ce tracé : rien n’est coupé');
          }
        }
      })
      .catch((e) => {
        if (subject.current !== S) return;
        setToast(`Détourage impossible : ${e instanceof Error ? e.message : e}`);
      })
      .finally(() => {
        S.running = false;
        if (S.again && subject.current === S) runSubject();
        redraw();
      });
  };
  /** Contour fermé (coordonnées de la couche) : le sujet est cherché dans cette zone, sur une analyse recadrée. */
  const subjectZone = (l: Layer, line: Pt[]) => {
    const zone = simplifyRing(line, 0.002);
    const us = zone.map((q) => q.x);
    const vs = zone.map((q) => q.y);
    // large marge : le sujet peut déborder du tracé, la découpe suivra le modèle
    const [mu, mv] = [(Math.max(...us) - Math.min(...us)) * 0.5, (Math.max(...vs) - Math.min(...vs)) * 0.5];
    const crop = {
      u0: Math.max(0, Math.min(...us) - mu),
      v0: Math.max(0, Math.min(...vs) - mv),
      u1: Math.min(1, Math.max(...us) + mu),
      v1: Math.min(1, Math.max(...vs) + mv),
    };
    if (crop.u1 - crop.u0 < 0.01 || crop.v1 - crop.v0 < 0.01) return redraw();
    const few = zone.length > 64 ? zone.filter((_, i) => i % Math.ceil(zone.length / 64) === 0) : zone;
    startSubject(l, crop, zone, [{ mode: 'zone', pts: few }]);
  };
  /**
   * Fin d'un geste en mode Sujet. Un contour fermé est une zone : le sujet y est cherché
   * (analyse recadrée sur la zone). Un toucher ou un trait ajoute ce qui manque, ou retire
   * ce qui déborde ; sans zone, il cherche le sujet dans toute l'image.
   */
  const subjectGesture = (pts: Pt[]) => {
    const sel = doc.layers.find((x) => x.id === selected);
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    const [w, h] = [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
    const tap = Math.max(w, h) * scale < 8;
    // toucher une autre image la choisit
    if (tap && !(sel && insideRings(maskRings(sel, f), pts[0]!.x, pts[0]!.y))) {
      const hit = layerAt(pts[0]!.x, pts[0]!.y);
      if (hit && hit.kind !== 'surface' && hit.id !== sel?.id) {
        subject.current = null;
        setSelected(hit.id);
      }
      return redraw();
    }
    if (!sel || sel.kind === 'surface') return redraw();
    const line = simplify(pts, 2 / scale).map((q) => toLocal(sel, q.x, q.y));
    const few = (r: Pt[]) => (r.length > 64 ? r.filter((_, i) => i % Math.ceil(r.length / 64) === 0) : r);
    const closed = !tap && Math.min(w, h) * scale > 30 && Math.hypot(pts[0]!.x - pts[pts.length - 1]!.x, pts[0]!.y - pts[pts.length - 1]!.y) < 0.35 * Math.hypot(w, h);
    if (closed) return subjectZone(sel, line);
    const stroke: SubjectStroke = { mode: subjectErase ? 'remove' : 'add', pts: few(line) };
    const S = subject.current;
    if (!S || S.layer !== sel.id) {
      if (stroke.mode === 'add') startSubject(sel, { u0: 0, v0: 0, u1: 1, v1: 1 }, null, [stroke]);
      return redraw();
    }
    S.strokes.push(stroke);
    runSubject();
    redraw();
  };
  /** Bandeau d'état du mode Sujet. */
  const subjectStatus = (l: Layer) => {
    const S = subject.current;
    if (l.kind === 'surface') return 'Touche une photo : son sujet sera détouré';
    if (!S || S.layer !== l.id) return `Entoure le sujet de « ${l.name} » : il sera détouré dans cette zone (ou touche-le)`;
    if (S.state === 'busy') return `Analyse de « ${l.name} »… (la première fois, le modèle de 30 Mo se télécharge)`;
    if (S.state === 'error') return `Détourage indisponible : ${S.error}`;
    if (S.running) return S.geom ? 'Mise à jour du sujet…' : 'Recherche du sujet…';
    if (!S.geom?.length) return 'Aucun sujet trouvé : touche le sujet, ou entoure-le de plus près';
    return subjectErase ? 'Retirer : glisse sur ce qui déborde du sujet' : 'Sujet trouvé : touche ce qui manque pour l’ajouter, puis coupe aux ciseaux ou au scalpel';
  };
  /** Détache le sujet détouré : un morceau posé au-dessus (ciseaux) ou en place (scalpel). */
  const detachSubject = (how: 'scissors' | 'scalpel') => {
    const S = subject.current;
    const l = S && doc.layers.find((x) => x.id === S.layer);
    if (!S || !l || !S.geom?.length) return;
    const rest = subtract(localRings(l), ringsOfGeom(S.geom));
    const b = layerBox(l, f);
    if (geomArea(rest) * b.w * b.h * scale * scale < 30) {
      setToast(`Le sujet couvre toute « ${l.name} »`);
      return;
    }
    detach(l, S.geom, rest, 'sujet', how);
    subject.current = null;
    setSubjectErase(false);
  };

  /** Couches visibles posées au-dessus d'une couche (elles la cachent). */
  const coveringLayers = (l: Layer) => {
    const ord = renderOrder(doc.layers);
    return ord.slice(ord.findIndex((x) => x.id === l.id) + 1).filter((x) => x.visible);
  };

  /** Grille de recherche des contours, en unités du format. */
  const edgeGrid = (l: Layer): EdgeGrid | null => {
    const m = edgesFor(l);
    if (!m || !m.pts.length) return null;
    const b = layerBox(l, f);
    const n = m.pts.length / 2;
    const xs = new Float32Array(n);
    const ys = new Float32Array(n);
    // les contours cachés par les couches du dessus n'aimantent pas
    const covers = coveringLayers(l).map((x) => maskRings(x, f));
    let k = 0;
    for (let i = 0; i < n; i++) {
      const { x, y } = localToPage(l, f, m.pts[i * 2]!, m.pts[i * 2 + 1]!);
      if (x < 0 || y < 0 || x > f.width || y > f.height || covers.some((r) => insideRings(r, x, y))) continue;
      xs[k] = x;
      ys[k++] = y;
    }
    return new EdgeGrid(xs.subarray(0, k), ys.subarray(0, k), EDGE_RADIUS / scale);
  };

  /** Aimante un point sur le contour détecté le plus proche, s'il est assez près. */
  const snapEdge = (grid: EdgeGrid | null, p: Pt) => {
    const q = grid?.nearest(p.x, p.y, EDGE_RADIUS / scale);
    return q ? { p: q, hit: true } : { p, hit: false };
  };

  /**
   * Fin d'un tracé de ciseaux. Comme avec de vrais ciseaux, la couche touchée
   * donne deux couches : le morceau (découpe ∩ tracé), posé au-dessus et un peu
   * soulevé, et le complément (découpe − tracé) qui reste en place. Le morceau
   * ne peut jamais déborder de la forme initiale. Tracé dans le vide : un
   * nouveau papier découpé.
   */
  /**
   * Découpe en chemin : le trait traverse la forme choisie et la sépare en
   * autant de morceaux qu'il en délimite. Le trait est épaissi d'une fraction
   * de pixel, retiré de la forme, et chaque partie restante devient un élément.
   */
  const finishPath = (line: Pt[]) => {
    const sel = doc.layers.find((l) => l.id === selected);
    if (!sel || sel.kind === 'surface' || line.length < 2) return redraw();
    // on prolonge un peu les extrémités pour bien sortir de la forme
    const ext = (a: Pt, b: Pt) => {
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const k = 3 / scale / d;
      return { x: a.x + (a.x - b.x) * k, y: a.y + (a.y - b.y) * k };
    };
    const pts = [ext(line[0]!, line[1]!), ...line, ext(line[line.length - 1]!, line[line.length - 2]!)];
    const hw = 0.35 / scale;
    const quads = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d < 1e-9) continue;
      const nx = (-(b.y - a.y) / d) * hw;
      const ny = ((b.x - a.x) / d) * hw;
      // chaque segment déborde un peu sur le suivant : pas de trou aux jointures
      const ux = ((b.x - a.x) / d) * hw;
      const uy = ((b.y - a.y) / d) * hw;
      quads.push(
        [
          { x: a.x - ux + nx, y: a.y - uy + ny },
          { x: b.x + ux + nx, y: b.y + uy + ny },
          { x: b.x + ux - nx, y: b.y + uy - ny },
          { x: a.x - ux - nx, y: a.y - uy - ny },
        ].map((q) => toLocal(sel, q.x, q.y)),
      );
    }
    const b = layerBox(sel, f);
    const parts = splitByCut(localRings(sel), quads)
      .map((rings) => ({ rings, area: geomArea([rings.map((r) => r.map((q) => [q.x, q.y] as [number, number]))]) }))
      .filter((x) => x.area * b.w * b.h * scale * scale > 30)
      .sort((x, y) => y.area - x.area);
    if (parts.length < 2) {
      setToast(`Le chemin doit traverser « ${sel.name} » de part en part`);
      return redraw();
    }
    const eps = 0.6 / (scale * Math.max(b.w, b.h));
    const cuts = parts.map((x) => ringsToPath(x.rings, eps));
    const extra: Layer[] = cuts.slice(1).map((c, i) => ({ ...structuredClone(sel), id: uid(), name: `${sel.name} · morceau ${i + 2}`, cut: c }));
    update((d) => {
      const layers = d.layers.map((x) => (x.id === sel.id ? { ...x, cut: cuts[0] } : x));
      layers.splice(layers.findIndex((x) => x.id === sel.id) + 1, 0, ...extra);
      return { ...d, layers };
    });
    setToast(`« ${sel.name} » séparée en ${parts.length} morceaux : glisse-les pour les placer`);
  };

  /**
   * Sépare une couche en deux : le morceau (géométrie en coordonnées de la couche), posé
   * au-dessus, et le reste qui garde la place. Ciseaux : le morceau est un peu décalé ;
   * scalpel : il reste en place, lié à son objet.
   */
  const detach = (l: Layer, piece: MultiPolygon, rest: MultiPolygon, label = 'morceau', how: 'scissors' | 'scalpel' = blade) => {
    const b = layerBox(l, f);
    const eps = 0.6 / (scale * Math.max(b.w, b.h));
    const pieceCut = ringsToPath(ringsOfGeom(piece), eps);
    const restCut = ringsToPath(ringsOfGeom(rest), eps);
    const m = Math.min(f.width, f.height);
    const scalpel = how === 'scalpel';
    const group = scalpel ? (l.link ?? uid()) : undefined;
    const morceau: Layer = {
      ...structuredClone(l),
      id: uid(),
      name: `${l.name} · ${label}`,
      cut: pieceCut,
      height: l.height,
      // ciseaux : légèrement décalé, comme un morceau qu'on vient de détacher ; scalpel : en place, lié
      dx: scalpel ? l.dx : l.dx + (0.012 * m) / f.width,
      dy: scalpel ? l.dy : l.dy + (0.012 * m) / f.height,
      ...(scalpel ? { link: group } : {}),
    };
    update((d) => {
      const layers = d.layers.map((x) => (x.id === l.id ? { ...x, cut: restCut, ...(scalpel ? { link: group } : {}) } : x));
      layers.splice(layers.findIndex((x) => x.id === l.id) + 1, 0, morceau);
      return { ...d, layers };
    });
    setSelected(morceau.id);
    setToast(scalpel ? `« ${l.name} » incisée : le morceau reste en place, lié à son objet` : `« ${l.name} » découpée : le morceau est posé dessus`);
  };

  const finishCut = (raw: Pt[]) => {
    const lasso = simplifyRing(raw, 0.8 / scale);
    if (lasso.length < 4) return redraw();
    const xs = lasso.map((p) => p.x);
    const ys = lasso.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    if ((x1 - x0) * scale < 12 || (y1 - y0) * scale < 12) return redraw();
    const lassoArea = (x1 - x0) * (y1 - y0);
    const sel = doc.layers.find((l) => l.id === selected);
    // la couche choisie d'abord, puis de haut en bas
    const order = [sel, ...[...renderOrder(doc.layers)].reverse()].filter((l, i, a): l is Layer => !!l && l.visible && l.kind !== 'surface' && a.indexOf(l) === i);
    for (const l of order) {
      const b = layerBox(l, f);
      const local = lasso.map((p) => toLocal(l, p.x, p.y));
      const shape = localRings(l);
      const piece = intersect(shape, [local]);
      const pa = geomArea(piece) * b.w * b.h;
      // une couche à peine effleurée n'est découpée que si elle est choisie
      if (pa < lassoArea * 1e-4 || (l !== sel && pa < lassoArea * 0.03)) continue;
      // option Sujet : le tracé n'est qu'une zone, la découpe collera au sujet trouvé dedans
      if (subjectOn) {
        if (l.id !== selected) setSelected(l.id);
        return subjectZone(l, local);
      }
      const rest = subtract(shape, [local]);
      if (geomArea(rest) * b.w * b.h < lassoArea * 1e-4) {
        setToast(`Le tracé englobe toute « ${l.name} »`);
        return redraw();
      }
      detach(l, piece, rest);
      return;
    }
    const m = Math.min(f.width, f.height);
    const w = x1 - x0;
    const h = y1 - y0;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const a = anchorFor(doc.frame, f, cx, cy);
    const n = doc.layers.filter((l) => l.name.startsWith('Papier découpé')).length + 1;
    const local = lasso.map((p) => ({ x: (p.x - x0) / w, y: (p.y - y0) / h }));
    const layer: Layer = {
      id: uid(),
      name: `Papier découpé ${n}`,
      kind: 'support',
      anchor: a.anchor,
      dx: a.dx,
      dy: a.dy,
      w: w / m,
      h: h / m,
      cut: ringsToPath(ringsOfGeom(intersect([local], [local])), 0.6 / (scale * Math.max(w, h))),
      guide: 0,
      height: 0,
      visible: true,
      strokes: [],
    };
    update((d) => ({ ...d, layers: [...d.layers, layer] }));
    setSelected(layer.id);
    setToast('Papier découpé : peins-le au stylet');
  };

  // --- ajout de couches ---
  /** Volume léger posé d'office sur une forme : il se change ou se retire dans Forme. */
  const defaultVolume = (sh: string): Volume => {
    const dome = ['circle', 'oval', 'drop', 'blob', 'moon', 'semicircle', 'arch'];
    const cone = ['star', 'diamond', 'leaf'];
    return { kind: dome.includes(sh) ? 'dome' : cone.includes(sh) ? 'cone' : 'cushion', amount: cone.includes(sh) ? 0.3 : 0.4 };
  };
  /** Objet en pièces : une couche par pièce, toutes dans la même boîte, solidaires. */
  const addKit = (kit: Kit) => {
    const a = anchorFor(doc.frame, f, f.width / 2, f.height / 2);
    const k = 0.62;
    const [w, h] = kit.ratio >= 1 ? [k, k / kit.ratio] : [k * kit.ratio, k];
    const group = uid();
    // couleurs du dessin : celles que la palette a déjà (ou presque) sont reprises, les autres s'y ajoutent
    const guides = [...doc.guides];
    const colors = guides.map((g) => (g.type === 'color' ? g.color : guideColor(g, 0.5)));
    let added = 0;
    const guideFor = (hex: string, name: string) => {
      const n = nearestOf(hex, colors);
      if (n.d <= SAME_COLOR) return n.i;
      guides.push({ name, type: 'color', color: hex, from: kit.name });
      colors.push(hex);
      added++;
      return guides.length - 1;
    };
    const layers: Layer[] = kit.parts.map((p) => ({
      id: uid(),
      name: `${kit.name} · ${p.name}`,
      kind: 'shape',
      anchor: a.anchor,
      dx: a.dx,
      dy: a.dy,
      w,
      h,
      guide: guideFor(p.color, p.name),
      cut: p.d,
      height: Math.round((0.12 + p.lift) * 1000) / 1000,
      ...(p.volume ? { volume: p.volume } : {}),
      link: group,
      visible: true,
      strokes: [],
    }));
    update((d) => ({ ...d, guides, layers: [...d.layers, ...layers] }));
    setSelected(layers[0]!.id);
    setBubble(null);
    setToast(
      `« ${kit.name} » posé en ${layers.length} pièces solidaires${added ? `, ${added} couleur${added > 1 ? 's' : ''} ajoutée${added > 1 ? 's' : ''} à la palette` : ''} : touche une pièce pour sa couleur, son matériau, son volume`,
    );
    setToastUndo(added > 0);
  };
  const importKit = async (file: File) => {
    try {
      addKit(kitFromSvg(await file.text(), file.name.replace(/\.svg$/i, '')));
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Ce dessin SVG n’a pas pu être lu');
    }
  };

  const addLayer = (kind: 'shape' | 'photo', opts: { shape?: ShapeKind; src?: string; name: string; ratio?: number; size?: number; at?: Pt; cut?: string; ref?: string }) => {
    const a = anchorFor(doc.frame, f, opts.at?.x ?? f.width / 2, opts.at?.y ?? f.height / 2);
    let w = 0.4;
    let h = 0.4;
    if (opts.shape === 'arch') h = 0.5;
    if (opts.shape === 'rounded') [w, h] = [0.5, 0.34];
    if (opts.shape === 'triangle') h = 0.36;
    if (opts.shape && isSilhouette(opts.shape)) {
      const r = silhouetteRatio(opts.shape);
      [w, h] = r >= 1 ? [0.45, 0.45 / r] : [0.45 * r, 0.45];
    }
    const k = opts.size ?? 0.7;
    if (kind === 'photo') [w, h] = opts.ratio ? (opts.ratio >= 1 ? [k, k / opts.ratio] : [k * 0.86 * opts.ratio, k * 0.86]) : [k, k * 0.72];
    const layer: Layer = {
      id: uid(),
      name: opts.name,
      kind,
      shape: opts.shape,
      anchor: a.anchor,
      dx: 0,
      dy: 0,
      w,
      h,
      guide: kind === 'shape' ? guide : 0,
      src: opts.src,
      cut: opts.cut,
      ref: opts.ref,
      height: 0,
      ...(kind === 'shape' && opts.shape ? { volume: defaultVolume(opts.shape) } : {}),
      visible: true,
      strokes: [],
    };
    update((d) => ({ ...d, layers: [...d.layers, layer] }));
    setSelected(layer.id);
    setBubble(null);
    if (kind === 'shape') {
      // une forme posée : ses paramètres s'ouvrent tout de suite
      setTool(lastEdit.current);
      setCoupeOpen((o) => ({ key: 'shape', n: (o?.n ?? 0) + 1 }));
      setToast(`Règle la forme de « ${opts.name} » ici ; glisse-la sur la page pour la placer`);
      setToastUndo(false);
    } else {
      setTool(lastEdit.current);
      setCoupeOpen((o) => ({ key: 'look', sec: 'image', n: (o?.n ?? 0) + 1 }));
    }
  };
  /** Pose un texte dans le style choisi, prêt à être réécrit. */
  const addText = async (p: TextPreset) => {
    await loadFonts();
    await ensureFont(p.style.font);
    const t: TextStyle = { content: p.sample, ...p.style };
    const c = textCut(t);
    // corps de départ : une ligne haute d'un dixième du petit côté
    const h = p.size ?? 0.1;
    const n = doc.guides.length || 1;
    const accent = (guide + 1) % n;
    const layer: Layer = {
      id: uid(),
      name: `Texte ${p.name.toLowerCase()}`,
      kind: 'text',
      text: t,
      anchor: anchorFor(doc.frame, f, f.width / 2, f.height / 2).anchor,
      dx: 0,
      dy: 0,
      w: h * c.ratio,
      h,
      guide,
      height: p.extra === 'shadow' ? 0.25 : p.extra === 'sticker' ? 0.12 : 0,
      ...(p.extra === 'neon' ? { glow: { style: 'neon' as const, guide: accent, distance: 0, width: 0.2 } } : {}),
      ...(p.extra === 'sticker' ? { border: { style: 'round' as const, guide: accent, width: 0.025 } } : {}),
      ...(p.extra === 'stamp' ? { border: { style: 'stamp' as const, guide: accent, width: 0.012 } } : {}),
      visible: true,
      strokes: [],
    };
    // trop large pour la page : on réduit
    const m = Math.min(f.width, f.height);
    const maxW = (f.width / m) * 0.86;
    if (layer.w > maxW) [layer.w, layer.h] = [maxW, (maxW / layer.w) * layer.h];
    update((d) => ({ ...d, layers: [...d.layers, layer] }));
    setSelected(layer.id);
    // l'éditeur d'objet s'ouvre sur le contenu du texte
    setTool(lastEdit.current);
    setCoupeOpen((o) => ({ key: 'content', sec: 'image', n: (o?.n ?? 0) + 1 }));
    setBubble(null);
  };
  /** Change la typographie d'un texte en gardant son corps : la boîte suit les lettres. */
  const patchText = (l: Layer, next: Partial<TextStyle>, history: boolean) => {
    if (!l.text) return;
    // texte modelé : c'est une forme, ses lettres reviennent seulement avec « Revenir au texte »
    if (l.molded) return setToast('Ce texte est modelé : « Revenir au texte » pour le modifier');
    const t = { ...l.text, ...next };
    // enveloppe et prolongements : les lettres restent où elles sont, la boîte s'adapte autour
    if ('warp' in next || 'swashes' in next || 'molds' in next) return patchLayer(l.id, placeText(l, t), history);
    const [a, b] = [textCut(l.text), textCut(t)];
    const k = l.h / (a.bh || 1);
    patchLayer(l.id, resizeHeld(l, Math.max(0.01, b.bw * k), Math.max(0.01, b.bh * k), { text: t, cut: undefined }), history);
  };
  /** Nouvelle boîte d'un texte dont les lettres ne bougent pas sur la page (seule l'encre autour change). */
  const placeText = (l0: Layer, t: TextStyle): Partial<Layer> => {
    const l = ungrip(l0, f);
    const [a, b] = [textCut(l.text!), textCut(t)];
    const m = Math.min(f.width, f.height);
    const k = l.h / (a.bh || 1);
    const ux = (b.ox + b.bw / 2 - (a.ox + a.bw / 2)) * k * m;
    const uy = (b.oy + b.bh / 2 - (a.oy + a.bh / 2)) * k * m;
    const r = l.rot ?? 0;
    const [c, sn] = [Math.cos(r), Math.sin(r)];
    return { text: t, cut: undefined, grip: undefined, w: Math.max(0.01, b.bw * k), h: Math.max(0.01, b.bh * k), dx: l.dx + (ux * c - uy * sn) / f.width, dy: l.dy + (ux * sn + uy * c) / f.height };
  };
  const swashFrame = useRef(0);
  // Prolonger se range quand on change de texte ou d'outil
  useEffect(() => setSwash((s) => (s.on ? { ...s, on: false } : s)), [selected, tool]);
  useEffect(() => {
    if (swash.on) {
      setToast(
        swash.mode === 'mold'
          ? 'De l’intérieur, tire le trait ; de l’extérieur, repousse-le'
          : swash.mode === 'orn'
            ? 'Dessine une boucle ou une ligne : elle se lisse et s’ajoute au titre'
            : 'Dessine depuis une lettre pour la prolonger',
      );
      setToastUndo(false);
    }
  }, [swash.on, swash.mode]);
  /** Pose le modelage en cours sur la découpe (en direct pendant le geste). */
  /** Relief : rayon de la pointe en pixels de la carte, le même que le repère qui suit le stylet (swash.r unités de modelage). */
  const reliefRadius = (l: Layer, mapW: number) => (swash.r * MOLD_UNIT * Math.min(f.width, f.height) * mapW) / layerBox(l, f).w;
  /** Relief : forme de la pointe, tournée dans le repère de la carte (celui de l'objet). */
  const reliefTip = (l: Layer) => {
    const { tip, rot } = moldTip(swash);
    return tip === 'round' ? {} : { tip, rot: rot - view.rot - (l.rot ?? 0) };
  };
  /** Plume : la pointe choisie et son angle dans le repère de l'objet (ronde : un trait égal). */
  const ornNib = (l: Layer) => {
    const { tip, rot } = moldTip(swash);
    return tip === 'round' ? {} : { tip, nib: rot - view.rot - (l.rot ?? 0) };
  };
  /** Relief : touches de sculpteur le long du geste, de la dernière touche jusqu'à `to` (pixels de la carte). */
  const sculpt = (to: [number, number], pr: number) => {
    const L = live.current;
    if (L.kind !== 'bump' || !L.bump || !L.orig) return;
    const B = L.bump;
    const rad = reliefRadius(L.orig, B.w);
    const t = reliefTip(L.orig);
    const force = (swash.k ?? 1) * (0.4 + 0.8 * pr);
    // Niveler : chaque touche fait une part du chemin vers la hauteur gardée
    const k = B.level !== undefined ? 0.2 * force : (swash.sculpt === 'dig' ? -1 : 1) * 0.06 * force;
    const [x0, y0] = B.at;
    const n = Math.max(1, Math.ceil(Math.hypot(to[0] - x0, to[1] - y0) / Math.max(1, rad * 0.25)));
    for (let i = 1; i <= n; i++) dab(B.H, B.w, B.h, x0 + ((to[0] - x0) * i) / n, y0 + ((to[1] - y0) * i) / n, rad, k, t, B.level);
    B.at = to;
    if (!swashFrame.current)
      swashFrame.current = requestAnimationFrame(() => {
        swashFrame.current = 0;
        const LL = live.current;
        if (LL.kind !== 'bump' || !LL.bump || !LL.layer) return;
        const enc = encodeBump(LL.bump.w, LL.bump.h, LL.bump.H);
        const id = LL.layer;
        setDoc((d) => ({ ...d, layers: d.layers.map((x) => (x.id === id ? { ...x, bump: enc } : x)) }));
      });
  };
  const smoothRelief = (l: Layer) => {
    if (!l.bump) return;
    patchLayer(l.id, { bump: encodeBump(l.bump.w, l.bump.h, smoothBump(bumpHeights(l.bump), l.bump.w, l.bump.h)) }, true);
  };
  const applyMold = (final: boolean) => {
    const L = live.current;
    if (L.kind !== 'mold' || !L.orig || !L.mold || !L.base || !L.pristine) return;
    const o = L.orig;
    const n = (L.mold.orn ?? L.mold).pts.length;
    if (final && n < 2) {
      past.current.pop();
      return void setDoc((d) => ({ ...d, layers: d.layers.map((x) => (x.id === o.id ? o : x)) }));
    }
    const m = { ...L.mold, pts: [...L.mold.pts], ...(L.mold.orn ? { orn: { ...L.mold.orn, pts: [...L.mold.orn.pts] } } : {}), live: !final };
    const patch = moldPatch(o, f, L.base, L.pristine, m);
    setDoc((d) => ({ ...d, layers: d.layers.map((x) => (x.id === o.id ? { ...o, ...patch } : x)) }));
  };
  /** Lisser : seules les parties modelées s'adoucissent, le reste garde son dessin d'origine. */
  const smoothMold = (l: Layer) => {
    if (!l.molded) return;
    patchLayer(l.id, moldPatch(l, f, currentPx(l), pristinePx(l), { pts: [], r: 0, smooth: 0.035 * unitPx(l) }), true);
  };
  const toggleSpill = () => {
    setSpill(!spill);
    setToast(spill ? 'L’encre reste dans la forme' : 'Déborder : l’encre sort de la forme et repousse son contour (« Revenir à la forme » pour l’annuler)');
    setToastUndo(false);
  };
  const unmold = (l: Layer) => {
    if (!l.molded) return;
    patchLayer(l.id, unmoldPatch(l, f), true);
    setToast(l.kind === 'text' ? 'Le texte retrouve ses lettres et tous ses attributs' : l.kind === 'photo' ? 'La photo retrouve son cadre' : 'La forme retrouve son dessin d’origine');
  };
  /** Pose le prolongement en cours sur le texte (en direct pendant le tracé). */
  const applySwash = (final: boolean) => {
    const L = live.current;
    if (L.kind !== 'swash' || !L.orig?.text) return;
    const o = L.orig;
    const n = (L.sw ?? L.mold?.orn ?? L.mold)?.pts.length ?? 0;
    if (final && n < 2) {
      // simple toucher : rien n'est tracé
      past.current.pop();
      return void setDoc((d) => ({ ...d, layers: d.layers.map((x) => (x.id === o.id ? o : x)) }));
    }
    const patch = placeText(
      o,
      L.sw
        ? { ...o.text!, swashes: [...(o.text!.swashes ?? []), { ...L.sw, pts: [...L.sw.pts] }] }
        : { ...o.text!, molds: [...(o.text!.molds ?? []), { pts: [...L.mold!.pts], r: L.mold!.r, ...(L.mold!.orn ? { orn: { ...L.mold!.orn, pts: [...L.mold!.orn.pts] } } : {}), ...(final ? {} : { live: true }) }] },
    );
    setDoc((d) => ({ ...d, layers: d.layers.map((x) => (x.id === o.id ? { ...x, ...patch } : x)) }));
  };
  /**
   * Nouvelle taille d'une couche qui respecte son ancrage et ses marges : le point d'ancrage garde
   * sa place relative dans la boîte (ancré à gauche, le texte s'allonge vers la droite), puis les
   * bords tenus sur une marge ou un bord de page y restent, quitte à réduire l'ensemble.
   */
  const resizeHeld = (l0: Layer, w: number, h: number, extra: Partial<Layer>, depth = 0): Partial<Layer> => {
    // accroché par un sommet : le point d'ancrage devient un décalage, il garde sa place relative dans la boîte
    const l = ungrip(l0, f);
    const m = Math.min(f.width, f.height);
    const b = layerBox(l, f);
    const ax = b.cx - l.dx * f.width;
    const ay = b.cy - l.dy * f.height;
    const rot = l.rot ?? 0;
    const [c, sn] = [Math.cos(rot), Math.sin(rot)];
    // décalage centre - ancre dans le repère de la couche
    const ox = (b.cx - ax) * c + (b.cy - ay) * sn;
    const oy = -(b.cx - ax) * sn + (b.cy - ay) * c;
    const keep = (o: number, half: number, half2: number) => (Math.abs(o) <= half ? (o * half2) / (half || 1) : o - Math.sign(o) * (half - half2));
    const nx = keep(ox, b.w / 2, (w * m) / 2);
    const ny = keep(oy, b.h / 2, (h * m) / 2);
    const cx = ax + nx * c - ny * sn;
    const cy = ay + nx * sn + ny * c;
    const n: Layer = { ...l, ...extra, w, h, dx: (cx - ax) / f.width, dy: (cy - ay) / f.height };
    let held = n.pins ? holdPins({ ...doc, layers: [n] }, f).layers[0]! : n;
    // ce qui tenait dans la marge (ou la page) y reste : réduit s'il le faut, puis ramené dedans
    const e = edgeLines(f);
    const z = e.margin ?? e.page;
    const tol = 0.5 / scale;
    const inside = (bb: { x0: number; x1: number; y0: number; y1: number }) => bb.x0 >= z.left - tol && bb.x1 <= z.right + tol && bb.y0 >= z.top - tol && bb.y1 <= z.bottom + tol;
    if (!depth && inside(pageBounds(l, f)) && !inside(pageBounds(held, f))) {
      let bb = pageBounds(held, f);
      const k = Math.min(1, (z.right - z.left) / (bb.x1 - bb.x0), (z.bottom - z.top) / (bb.y1 - bb.y0));
      if (k < 1) held = { ...held, ...resizeHeld(l, w * k * 0.999, h * k * 0.999, extra, 1) };
      bb = pageBounds(held, f);
      const sx = bb.x0 < z.left ? z.left - bb.x0 : bb.x1 > z.right ? z.right - bb.x1 : 0;
      const sy = bb.y0 < z.top ? z.top - bb.y0 : bb.y1 > z.bottom ? z.bottom - bb.y1 : 0;
      held = { ...held, dx: held.dx + sx / f.width, dy: held.dy + sy / f.height };
    }
    return { ...extra, grip: undefined, w: held.w, h: held.h, dx: held.dx, dy: held.dy };
  };
  /** Pose un élément de la bibliothèque : centré, ou là où il a été lâché sur la page. */
  const insertItem = async (it: LibItem, client?: { x: number; y: number }) => {
    let src = it.src;
    if (it.tint) {
      // décor à la craie : ses traits prennent la couleur choisie dans la palette
      try {
        const svg = await (await fetch(it.src)).text();
        const c = guideColor(doc.guides[guide]);
        src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/stroke:\s*(black|#000000|#000)\b/gi, `stroke:${c}`).replace(/stroke="(black|#000000|#000)"/gi, `stroke="${c}"`));
      } catch {
        /* on garde le décor tel quel */
      }
    }
    const size = it.shelf === 'logos' ? 0.5 : it.tags.includes('paysage') ? 1 : it.shelf === 'illustrations' ? 0.55 : 0.7;
    const cut = it.rings?.length
      ? ringsToPath(
          it.rings.map((r) => r.map(([x, y]) => ({ x, y }))),
          0.003,
        )
      : undefined;
    addLayer('photo', { src, name: it.title, ratio: it.w / it.h, size, at: client ? toPage(client.x, client.y) : undefined, cut, ref: `image/${it.id}` });
    setToast(`« ${it.title} » posé${client ? '' : ' au centre'}`);
  };
  // photo importée : remise droite (orientation de l'appareil), réduite à 2400 px, cadre au format de la photo
  const importPhoto = async (file: File) => {
    const name = file.name.replace(/\.[^.]+$/, '') || 'Photo';
    setToast(`Import de « ${name} »…`);
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(bmp.width * k));
      c.height = Math.max(1, Math.round(bmp.height * k));
      c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close();
      addLayer('photo', { src: c.toDataURL('image/jpeg', 0.9), name, ratio: c.width / c.height });
      setToast(`« ${name} » importée`);
    } catch {
      // format que le navigateur ne sait pas lire en image (HEIC sur ordinateur, par exemple)
      setToast('Cette photo ne peut pas être lue ici : essaie en JPEG ou PNG');
    }
  };

  const patchLayer = (id: string, patch: Partial<Layer>, history = true) => {
    // l'extrusion épaissit l'objet entier : toutes ses pièces solidaires la partagent
    const fn = (d: Doc) => {
      const me = d.layers.find((l) => l.id === id);
      const group = 'extrude' in patch && me?.link ? me.link : null;
      return { ...d, layers: d.layers.map((l) => (l.id === id ? { ...l, ...patch } : group && l.link === group ? { ...l, extrude: patch.extrude } : l)) };
    };
    if (history) update(fn);
    else setDoc(fn);
  };

  /**
   * Hauteur d'un objet. Dans un objet en pièces, la pièce la plus basse porte les autres :
   * la monter monte tout le groupe, chaque pièce gardant son écart ; une autre pièce bouge seule.
   */
  const setLevel = (l: Layer, v: number) =>
    setDoc((d) => {
      const mates = l.link ? d.layers.filter((x) => x.link === l.link && x.kind !== 'surface') : [];
      const base = mates.reduce<Layer | null>((m, x) => (!m || levelOf(x) < levelOf(m) - 1e-6 ? x : m), null);
      if (!base || base.id !== l.id) return { ...d, layers: d.layers.map((x) => (x.id === l.id ? { ...x, ...heightPatch(v) } : x)) };
      const dv = v - levelOf(base);
      const ids = new Set(mates.map((x) => x.id));
      return { ...d, layers: d.layers.map((x) => (ids.has(x.id) ? { ...x, ...heightPatch(Math.round((levelOf(x) + dv) * 1000) / 1000) } : x)) };
    });

  /**
   * Molette, trackpad : quand repeindre la page prend du temps (ordinateur sans carte graphique, page
   * chargée), la vue suit d'abord par la transformation CSS de l'image déjà peinte, comme au pincement,
   * et la page n'est repeinte qu'une fois le geste arrêté ; sinon elle est repeinte à chaque pas.
   */
  const wheelView = useRef<View | null>(null);
  /** Vue d'aperçu appliquée au toucher, en attendant que la page soit repeinte avec elle. */
  const flushedView = useRef<View | null>(null);
  const wheelTimer = useRef(0);
  const flushWheel = () => {
    const v = wheelView.current;
    if (!v) return null;
    clearTimeout(wheelTimer.current);
    wheelView.current = null;
    flushedView.current = v;
    setView(v);
    return v;
  };
  const drawCost = useRef(0);
  const viewStep = (step: (v: View) => View) => {
    fitted.current = false;
    if (drawCost.current < 30 && !wheelView.current) {
      setView(step);
      return;
    }
    const next = step(wheelView.current ?? viewRef.current);
    wheelView.current = next;
    previewView(next);
    clearTimeout(wheelTimer.current);
    wheelTimer.current = window.setTimeout(() => {
      const v = wheelView.current;
      wheelView.current = null;
      if (v) setView(v);
    }, 180);
  };
  // les écouteurs natifs (posés une fois) passent par là : l'aperçu part toujours de la vue peinte
  const viewStepRef = useRef(viewStep);
  viewStepRef.current = viewStep;
  // molette et trackpad (ordinateur) : écouteur natif, pour empêcher le zoom de la page entière
  const wheelDev = useRef<{ mouse: boolean; t: number } | null>(null);
  const onWheel = useRef<(e: WheelEvent) => void>(() => {});
  onWheel.current = (e) => {
    e.preventDefault();
    if (pinchAt.current) return;
    wheelDev.current = wheelDevice(wheelDev.current, e as WheelEvent & { wheelDeltaY?: number }, performance.now());
    const act = wheelAction(e, shift, wheelDev.current.mouse);
    if (act === 'tilt') {
      // Maj + deux doigts (ou Maj + molette) : la page s'incline en Vue 3D
      const [x, y] = tiltStep(e);
      if (Math.hypot(x, y) > 0.3) setView3d({ start: [Math.max(-40, Math.min(40, x)), Math.max(-40, Math.min(40, y))] });
      return;
    }
    if (act === 'rotate') viewStep((v) => ({ ...v, rot: v.rot + e.deltaY * 0.002 }));
    else if (act === 'pan') viewStep((v) => ({ ...v, px: v.px - e.deltaX, py: v.py - e.deltaY }));
    else viewStep((v) => ({ ...v, zoom: Math.max(0.3, Math.min(6, v.zoom * zoomFactor(e))) }));
  };
  /** Pincement du trackpad dans Safari (évènements « gesture ») : le zoom de départ. */
  const pinchAt = useRef<number | null>(null);
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const wheel = (e: WheelEvent) => onWheel.current(e);
    // Safari sur Mac : pincer le trackpad envoie gesturestart/change/end ; sur iPad, les doigts passent par les pointeurs
    const touching = () => [...pointers.current.values()].some((p) => p.type === 'touch');
    const gs = (e: Event) => {
      e.preventDefault();
      if (!touching()) pinchAt.current = viewRef.current.zoom;
    };
    const gc = (e: Event) => {
      e.preventDefault();
      const z0 = pinchAt.current;
      const k = (e as Event & { scale?: number }).scale;
      if (z0 === null || !k) return;
      viewStepRef.current((v) => ({ ...v, zoom: Math.max(0.3, Math.min(6, z0 * k)) }));
    };
    const ge = (e: Event) => {
      e.preventDefault();
      pinchAt.current = null;
    };
    cv.addEventListener('wheel', wheel, { passive: false });
    cv.addEventListener('gesturestart', gs);
    cv.addEventListener('gesturechange', gc);
    cv.addEventListener('gestureend', ge);
    return () => {
      cv.removeEventListener('wheel', wheel);
      cv.removeEventListener('gesturestart', gs);
      cv.removeEventListener('gesturechange', gc);
      cv.removeEventListener('gestureend', ge);
    };
  }, []);

  // raccourcis clavier (ordinateur)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key === 'b') setTool('paint');
      else if (e.key === 's') setTool('stamp');
      else if (e.key === 'c') setTool('cut');
      else if (e.key === 't') setTool(lastEdit.current);
      else if (e.key === 'e') setTool('edge');
      else if (e.key === 'm') setTool('material');
      else if (e.key === 'g') setTool('mold');
      else if ((e.key === 'Delete' || e.key === 'Backspace') && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        removeRef.current();
      } else if (e.key === 'Escape') {
        setBubble(null);
        setRendu(false);
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [undo, redo]);

  const sel = doc.layers.find((l) => l.id === selected) ?? null;
  const textShelf = bubble === 'add' && shelf === 'textes';
  useEffect(() => {
    if (textShelf) void loadFonts().then(() => TEXT_PRESETS.forEach((p) => void ensureFont(p.style.font)));
  }, [textShelf]);
  const g = doc.guides[guide];
  // les filtres ne concernent que les photos : sur une forme, on passe aux transformations
  useEffect(() => {
    if (tool === 'filter' && sel && sel.kind !== 'photo') setToolState('transform');
  }, [tool, sel?.kind]);

  /** Image finale du format, à 1600 px sur le petit côté. */
  const makeSnapshot = () => {
    const k = 1600 / Math.min(f.width, f.height);
    const c = document.createElement('canvas');
    c.width = Math.round(f.width * k);
    c.height = Math.round(f.height * k);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    forgetPaint();
    drawLayers(ctx, doc, f, { scale: k, onImage: () => {} });
    drawLampTint(ctx, doc, f);
    forgetPaint();
    setSnapshot(c.toDataURL('image/png'));
  };

  // liste des objets, dans le volet du Créateur de matériaux : l'objet choisi l'est aussi sur la page
  const layersJsx = (
    <div className="cp-layers">
      <div className="layer-list">
        {[...renderOrder(doc.layers)].reverse().map((l) => (
          <div
            key={l.id}
            data-layer={l.id}
            className={`layer ${l.id === selected ? 'on' : ''} ${l.visible ? '' : 'hidden'} ${listDrag?.id === l.id ? 'dragging' : ''} ${listDrag?.over === l.id ? (listDrag.above ? 'drop-above' : 'drop-below') : ''}`}
            onPointerDown={(e) => {
              // on glisse l'objet par sa vignette ; ailleurs, le doigt fait défiler la liste
              if ((e.target as HTMLElement).closest('button')) return;
              const grip = !!(e.target as HTMLElement).closest('.thumb') && l.kind !== 'surface';
              listPress.current = { id: l.id, y: e.clientY, moved: false, grip };
            }}
            onPointerMove={(e) => {
              const pr = listPress.current;
              if (!pr || pr.id !== l.id) return;
              if (!pr.moved && Math.abs(e.clientY - pr.y) < 6) return;
              if (!pr.grip) {
                // défilement : ce n'est plus un toucher
                listPress.current = null;
                return;
              }
              if (!pr.moved) {
                pr.moved = true;
                (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
              }
              const row = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('[data-layer]') as HTMLElement | null;
              const over = row?.dataset.layer;
              if (!row || !over || over === l.id) return setListDrag({ id: l.id });
              const r = row.getBoundingClientRect();
              setListDrag({ id: l.id, over, above: e.clientY < r.top + r.height / 2 });
            }}
            onPointerUp={() => {
              const pr = listPress.current;
              listPress.current = null;
              if (pr?.moved) {
                if (listDrag?.over) dropLayer(l.id, listDrag.over, !!listDrag.above);
                setListDrag(null);
              } else setSelected(l.id);
            }}
            onPointerCancel={() => {
              listPress.current = null;
              setListDrag(null);
            }}
          >
            <LayerThumb layer={l} doc={doc} />
            <div className="layer-main">
              <span className="layer-name">
                {l.link && (
                  <span className="link-mark" title="Solidaire d'autres objets : gardez le doigt posé dessus pour le détacher">
                    <Icon name="link" />
                  </span>
                )}
                {l.name}
              </span>
              <div className="layer-actions">
                <button onClick={() => patchLayer(l.id, { visible: !l.visible })} title={l.visible ? 'Masquer' : 'Afficher'}>
                  <Icon name={l.visible ? 'eye' : 'eyeoff'} />
                </button>
                {l.kind !== 'surface' && (
                  <>
                    <button onClick={() => duplicate(l.id)} title="Dupliquer">
                      <Icon name="duplicate" />
                    </button>
                    <button onClick={() => void saveToLibrary(l)} title="Ranger dans la bibliothèque (Objets) : l'objet et ses pièces, avec tous leurs réglages">
                      <Icon name="library" />
                    </button>
                    <button
                      onClick={() => {
                        update((d) => ({ ...d, layers: d.layers.filter((x) => x.id !== l.id) }));
                        if (selected === l.id) setSelected(null);
                      }}
                      title="Supprimer"
                    >
                      <Icon name="trash" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  /** Glisser-déposer dans la liste : l'objet prend la hauteur de son voisin et se range contre lui. */
  const dropLayer = (id: string, target: string, above: boolean) =>
    update((d) => {
      const me = d.layers.find((x) => x.id === id);
      const tg = d.layers.find((x) => x.id === target);
      if (!me || !tg || me === tg) return d;
      const others = d.layers.filter((x) => x.kind !== 'surface' && x.id !== id);
      const lv = tg.kind === 'surface' ? Math.min(0, ...others.map(levelOf)) : levelOf(tg);
      const moved = { ...me, ...heightPatch(lv) };
      const layers = d.layers.filter((x) => x.id !== id);
      const j = layers.indexOf(tg);
      // la liste se lit du dessus au dessous : « au-dessus » = plus loin dans le tableau
      layers.splice(tg.kind === 'surface' || above ? j + 1 : j, 0, moved);
      return { ...d, layers };
    });
  /** Ranger dans la bibliothèque : l'objet (ou toutes ses pièces solidaires) avec tout son réglage et ses couleurs. */
  const saveToLibrary = async (l: Layer) => {
    const ls = objetLayers(l, doc);
    const title = ls.length > 1 ? (l.name.split(' · ')[0] ?? l.name) : l.name;
    setToast(`Rangement de « ${title} »…`);
    setToastUndo(false);
    try {
      const thumb = (await renderLayers(ls, doc, f, 320)).toDataURL('image/png');
      const where = await saveObjet(title, packObjet(ls, doc, f), thumb);
      setToast(`« ${title} » rangé dans les Objets de la bibliothèque${where === 'navigateur' ? ' (dans ce navigateur, le serveur ne répond pas)' : ''}`);
    } catch (err) {
      setToast(`Rangement impossible : ${(err as Error).message}`);
    }
  };
  /** Repose un objet préparé, tel qu'il a été rangé. */
  const insertObjet = async (e: ObjetEntry, client?: { x: number; y: number }) => {
    try {
      const o = await readObjet(e);
      const at = client ? toPage(client.x, client.y) : { x: f.width / 2, y: f.height / 2 };
      const r = unpackObjet(o, doc, f, at.x, at.y, e.title);
      update((d) => ({ ...d, guides: r.guides, layers: [...d.layers, ...r.layers] }));
      setSelected(r.layers[0]?.id ?? null);
      setBubble(null);
      setToast(`« ${e.title} » posé${r.layers.length > 1 ? ` en ${r.layers.length} pièces` : ''}, prêt à retoucher`);
    } catch (err) {
      setToast(`Objet illisible : ${(err as Error).message}`);
    }
    setToastUndo(false);
  };

  return (
    <div className={`atelier ${rendu ? 'rendu' : ''} ${tips ? '' : 'no-tips'} ${lefty ? 'hand-left' : 'hand-right'}`} style={bubbleLeft ? ({ '--bubble-left': `${bubbleLeft + 8}px` } as React.CSSProperties) : undefined}>
      <canvas
        ref={canvasRef}
        className="stage"
        style={{ width: vp.w, height: vp.h }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={hideHover}
        onContextMenu={(e) => e.preventDefault()}
        // molette enfoncée : pas de défilement automatique du navigateur
        onMouseDown={(e) => e.button === 1 && e.preventDefault()}
      />
      <div
        ref={hoverRef}
        className={`pen-hover ${tool === 'stamp' ? 'stamp' : ''}`}
        style={tool === 'stamp' ? { backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(stampLook(stampOf(stampId)))}")` } : undefined}
      />

      {!rendu &&
        tool === 'move' &&
        sel &&
        sel.kind !== 'photo' &&
        (() => {
          // une surface en dégradé montre son repère : centre et axe à glisser, propres à l'objet
          const g = doc.guides[sel.guide];
          if (g?.type !== 'gradient') return null;
          const shape = shapeOf(g, sel.grad) ?? DEFAULT_SHAPE;
          const b = layerBox(sel, f);
          const map = {
            ar: b.w / Math.max(1e-6, b.h),
            toScreen: (u: number, v: number) => {
              const p = localToPage(sel, f, u, v);
              const q = matrix.transformPoint(new DOMPoint(p.x, p.y));
              return { x: q.x, y: q.y };
            },
            fromScreen: (x: number, y: number) => {
              const p = toPage(x, y);
              return pageToLocal(sel, f, p.x, p.y);
            },
          };
          const set = (s: GradShape, commit: boolean) => patchLayer(sel.id, { grad: { cx: s.cx, cy: s.cy, angle: s.angle, spread: s.spread } }, commit);
          return <GradientOverlay shape={shape} map={map} color={g.stops[g.stops.length - 1]!} onChange={set} />;
        })()}
      {!rendu && (
        <>
          <header
            className="bar"
            onClick={(e) => {
              // toucher la barre en dehors de ses boutons : l'outil en cours se range
              if (!(e.target as HTMLElement).closest('button, input, select, textarea, a')) leaveTool();
            }}
          >
            <div className="bar-center">
              {(touchScreen || fingerMode !== 'auto') && (
                <button
                  className={`btn finger-btn ${fingerDraws ? 'on' : ''}`}
                  onClick={() => {
                    const next = !fingerDraws;
                    setFingerMode(next === (!penSeen && !finePointer) ? 'auto' : next ? 'draw' : 'move');
                    setToast(next ? 'Le doigt tient l’outil ; deux doigts déplacent la vue' : 'Le doigt déplace les objets ; le stylet tient l’outil');
                  }}
                  aria-pressed={fingerDraws}
                  title={fingerDraws ? 'Le doigt dessine (pas de stylet) : toucher pour qu’il déplace' : 'Le doigt déplace : toucher pour qu’il dessine comme le stylet'}
                >
                  <Icon name={fingerDraws ? 'finger-draw' : 'finger'} />
                </button>
              )}
              <button className="btn" onClick={undo} disabled={!past.current.length} title="Annuler (deux doigts)">
                <Icon name="undo" />
              </button>
              <button className="btn" onClick={redo} disabled={!future.current.length} title="Rétablir (trois doigts)">
                <Icon name="redo" />
              </button>
              <button
                ref={dupRef}
                className={`btn dup-drop ${dupHot ? 'hot' : ''} ${live.current.kind === 'move' ? 'armed' : ''}`}
                onClick={() => duplicate()}
                disabled={(!sel || sel.kind === 'surface') && live.current.kind !== 'move'}
                title="Dupliquer : touche pour l'élément choisi, ou glisse un élément dessus"
              >
                <Icon name="duplicate" />
              </button>
              <button
                ref={trashRef}
                className={`btn trash ${trashHot ? 'hot' : ''} ${live.current.kind === 'move' ? 'armed' : ''}`}
                onClick={() => removeSelection()}
                disabled={(!sel || sel.kind === 'surface') && live.current.kind !== 'move'}
                title={sel && sel.kind !== 'surface' ? `Corbeille : touche pour supprimer « ${sel.name} », ou glisse un élément dessus` : 'Corbeille : choisis un élément, ou glisse-le dessus'}
              >
                <Icon name="trash" />
              </button>
            </div>
            <div className="bar-left">
              {/* fil d'Ariane : l'activité › la campagne (ou l'occasion) › le contenu ouvert */}
              <TopCrumbs
                team={me?.team}
                campaign={followed}
                occasion={allOperations.find((o) => o.id === doc.operation)}
                showCampaign={!!(online && me?.team)}
                title={project?.title}
                thumb={project ? thumbUrl(projects.find((x) => x.id === project.id) ?? { id: project.id, title: project.title, updated: '' }) : undefined}
                kind={doc.targets?.length ? `${doc.targets.length} publication${doc.targets.length > 1 ? 's' : ''}` : f.title}
                saving={online && project ? saving : undefined}
                open={bubble === 'activity' || bubble === 'activity-edit' ? 'activity' : bubble === 'projects' ? 'campaign' : bubble === 'composition' ? 'content' : null}
                onActivity={() => {
                  if (bubble !== 'activity' && online) fetchMe().then(setMe, () => {});
                  setBubble(bubble === 'activity' ? null : 'activity');
                }}
                onCampaign={() => {
                  if (bubble === 'projects') return setBubble(null);
                  if (online) refreshProjects();
                  setBubble('projects');
                }}
                onContent={() => {
                  if (bubble === 'composition') return setBubble(null);
                  if (bubble !== 'projects' && online) refreshProjects();
                  setBubble('composition');
                }}
              />
            </div>
            <div className="bar-right">
              {/* la publication affichée : son édition */}
              <button
                className={`btn pubs-btn ${bubble === 'format' ? 'on' : ''}`}
                onClick={() => setBubble(bubble === 'format' ? null : 'format')}
                title={`Édition de la publication : ${targetLabel(currentPub, activity)} (réseau, format, résolution, variante, marges, repères)`}
                aria-label="Édition de la publication"
              >
                <FormatGlyph w={f.width} h={f.height} />
                {activeTarget?.channel && (
                  <span className="pubs-media">
                    <MediaIcon ch={channels.find((c) => c.id === activeTarget.channel)} size={13} />
                  </span>
                )}
              </button>
              <button className={`btn ${bubble === 'light' ? 'on' : ''}`} onClick={() => setBubble(bubble === 'light' ? null : 'light')} title="Lumière">
                <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <circle cx="12" cy="12" r="4.5" style={{ fill: lampOf(doc).color }} />
                  <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
                </svg>
              </button>
              <button
                ref={guideBtn}
                className={`btn guide-btn ${bubble === 'palette' ? 'on' : ''}`}
                onClick={() => {
                  // un glisser vient de poser la couleur : pas d'ouverture de la palette
                  if (guideDrag.current?.on) return void (guideDrag.current = null);
                  setBubble(bubble === 'palette' ? null : 'palette');
                }}
                title={`Palette : touche pour l’ouvrir, glisse « ${g?.name ?? 'la couleur'} » sur un objet pour la lui donner`}
                onPointerDown={(e) => {
                  if (e.button !== 0 || !g) return;
                  // suivi sur la fenêtre plutôt que par capture : une capture posée sur ce bouton faisait perdre le toucher suivant sur iPad
                  const id = e.pointerId;
                  const d = { x: e.clientX, y: e.clientY, on: false };
                  guideDrag.current = d;
                  const move = (ev: PointerEvent) => {
                    if (ev.pointerId !== id) return;
                    if (!d.on && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 8) d.on = true;
                    if (d.on) setDragGuide({ i: guide, x: ev.clientX, y: ev.clientY });
                  };
                  const end = (ev: PointerEvent) => {
                    if (ev.pointerId !== id) return;
                    window.removeEventListener('pointermove', move);
                    window.removeEventListener('pointerup', end);
                    window.removeEventListener('pointercancel', end);
                    if (!d.on || ev.type === 'pointercancel') {
                      setDragGuide(null);
                      if (guideDrag.current === d) guideDrag.current = null;
                      return;
                    }
                    dropGuide(guide, ev.clientX, ev.clientY);
                    // le clic qui suit éventuellement est absorbé ; sans clic, l'état est oublié peu après
                    window.setTimeout(() => guideDrag.current === d && (guideDrag.current = null), 300);
                  };
                  window.addEventListener('pointermove', move);
                  window.addEventListener('pointerup', end);
                  window.addEventListener('pointercancel', end);
                }}
              >
                <span className="dot" style={{ background: swatch(g) }} />
              </button>
              {online && project && me?.team && <MessagesButton count={projects.find((m) => m.id === project.id)?.messages ?? 0} on={msgDialog} onClick={() => setMsgDialog(true)} />}
              <button
                className={`btn ${bubble === 'export' ? 'on' : ''}`}
                onClick={() => {
                  if (bubble !== 'export') {
                    setExportFormats([doc.formatId]);
                    setExportTargets((doc.targets ?? []).map((_, i) => i));
                  }
                  setBubble(bubble === 'export' ? null : 'export');
                }}
                title="Publier : télécharger les rendus, texte d’accompagnement, plan de la campagne"
              >
                <Icon name="export" />
              </button>
              <span className="sep" />
              {online && me?.team && (
                <FeedButton
                  count={feed ? unreadCount(feed, feedSeen, (me.email ?? 'groupe').toLowerCase(), overdueOf(campaigns).length) : 0}
                  on={feedOpen}
                  onClick={openFeed}
                />
              )}
              <UserButton
                me={me}
                on={bubble === 'user' || bubble === 'prefs'}
                onClick={() => {
                  if (bubble !== 'user' && online) fetchMe().then(setMe, () => {});
                  setBubble(bubble === 'user' ? null : 'user');
                }}
              />
            </div>
          </header>
          {/* Maj : gros bouton en tête de la colonne de gauche (de droite pour un gaucher) */}
          <button
            className={`shift-big ${shift ? 'on' : ''} ${shiftBtn.latched ? 'latched' : ''}`}
            onPointerDown={(e) => {
              (e.currentTarget as Element).setPointerCapture(e.pointerId);
              const next = shiftDown(shiftBtn, performance.now());
              setShiftBtn(next);
              if (next.latched && !shiftBtn.latched) setToast('Maj verrouillée : un appui la relâche');
              else if (shiftBtn.latched && !next.latched) setToast('Maj relâchée');
            }}
            onPointerUp={() => setShiftBtn((st) => shiftUp(st, performance.now()))}
            onPointerCancel={() => setShiftBtn((st) => shiftUp(st, performance.now()))}
            onContextMenu={(e) => e.preventDefault()}
            aria-pressed={shift}
            title="Maj (comme la touche du clavier), tenue du doigt ; double appui pour la verrouiller, un appui pour la relâcher. Sans aimant, une pièce bouge sans se détacher de son ensemble"
          >
            <Icon name="shift" />
            <span>maj</span>
          </button>

          <aside className="side tools-bar">
            <button
              className={`btn small ${bubble === 'add' ? 'on' : ''}`}
              onClick={() => {
                // ajouter : les autres outils se rangent, le bas de l'écran se libère
                if (bubble !== 'add') setTool('move');
                setBubble(bubble === 'add' ? null : 'add');
              }}
              title="Ajouter une couche"
            >
              <Icon name="plus" />
            </button>
            <span className="side-sep" />
            <button className={`btn small ${isEdit(tool) ? 'on' : ''}`} onClick={() => pickTool(lastEdit.current)} title="Créateur de matériaux (T) : forme, bords, vernis, image, transformations, support">
              <Icon name="matter" />
            </button>
            <button className={`btn small ${tool === 'cut' ? 'on' : ''}`} onClick={() => pickTool('cut')} title="Découper (C) : trace un contour au stylet">
              <Icon name="scissors" />
            </button>
            <button className={`btn small ${tool === 'mold' ? 'on' : ''}`} onClick={() => pickTool('mold')} title="Modeler (G) : tirer ou repousser le contour de l'objet, à la plume ou au doigt de glaise">
              <Icon name="mold" />
            </button>

            <button className={`btn small ${tool === 'paint' ? 'on' : ''}`} onClick={() => pickTool('paint')} title="Peindre (B) : aquarelle, acrylique, pistolet, paillettes, poils">
              <Icon name="brush" />
            </button>
            <button className={`btn small ${tool === 'stamp' ? 'on' : ''}`} onClick={() => pickTool('stamp')} title="Tampons (S) : motifs à la couleur courante, intensité et rotation">
              <Icon name="stamp" />
            </button>
          </aside>


          {isEdit(tool) && !sel && (
            <aside className="coupe with-list" aria-label="Objets">
              <button className="cp-close" onClick={() => setTool('move')} aria-label="Fermer">
                ×
              </button>
              <div className="cp-split">{layersJsx}</div>
            </aside>
          )}
          {isEdit(tool) && sel && sel.kind !== 'surface' && (
            <aside className="height-bar" title="Hauteur : au-dessus de 0 l'objet se soulève (ombre), en dessous il se creuse">
              <VSlider label="Hauteur" center value={0.5 + (sel.height - (sel.inner ?? 0)) / 2} onChange={(v) => setLevel(sel, Math.abs(v - 0.5) < 0.03 ? 0 : Math.round((v * 2 - 1) * 100) / 100)} />
            </aside>
          )}
          {isEdit(tool) && sel && (
            <CoupePanel
              list={layersJsx}
              patchText={(next, h) => patchText(sel, next, h)}
              unmold={() => unmold(sel)}
              onMold={() => setTool('mold')}
              simple={simple}
              onSculpt={() => {
                setSwash((w) => ({ ...w, mode: 'relief' }));
                setTool('mold');
              }}
              layer={sel}
              doc={doc}
              f={f}
              patch={(p, h) => patchLayer(sel.id, p, h)}
              onClose={() => setTool('move')}
              openOn={coupeOpen}
              onToast={(m, u) => {
                setToast(m);
                setToastUndo(!!u);
              }}
            />
          )}

          <aside
            ref={sideRef}
            className={`side ${tool === 'edge' && sel && sel.kind !== 'surface' ? ['', '', '', 'dense', 'denser', 'densest'][1 + (sel.border ? 1 : 0) + (sel.glow ? 2 : 0)] : tool === 'filter' && sel ? ['', '', 'dense', 'denser'][(sel.look?.style ? 1 : 0) + (sel.look?.draw ? 1 : 0)] : ''}`}
          >
            <div ref={paramsRef} className={`side-params ${sideTwo ? 'two' : ''} ${sideOdd ? 'odd' : ''}`}>
              {tool === 'paint' && (
                <>
                  <FanButton
                    dir={lefty ? 'left' : 'right'}
                    face={<Icon name={`brush-${brushKind}`} />}
                    title={`Pinceau : ${BRUSHES.find((x) => x[0] === brushKind)![1]}`}
                    items={BRUSHES.map(([k, t, hint]) => ({ key: k, icon: <Icon name={`brush-${k}`} />, label: t, hint, on: brushKind === k }))}
                    onPick={(k) => setBrushKind(k as BrushKind)}
                  />
                  <button
                    className="btn small"
                    disabled={!sel?.strokes.length}
                    onClick={() => {
                      if (!sel?.strokes.length) return;
                      update((d) => ({ ...d, layers: d.layers.map((l) => (l.id === sel.id ? { ...l, strokes: [] } : l)) }));
                      setToast(`Peinture de « ${sel.name} » effacée`);
                      setToastUndo(true);
                    }}
                    title={sel ? `Effacer toute la peinture de « ${sel.name} » (annulable)` : 'Effacer la peinture'}
                  >
                    <Icon name="paint-reset" />
                  </button>
                  {(brushKind === 'hair' || brushKind === 'branch') && (
                    <button className={`btn small ${spill ? 'on' : ''}`} onClick={toggleSpill} title={spill ? 'Déborder : l’encre sort de la forme et repousse son contour, comme le modelage (« Revenir à la forme » le rend). Toucher pour rester dans la forme' : 'Dans la forme : l’encre reste dans la découpe. Toucher pour la laisser déborder et repousser le contour'}>
                      <Icon name="spill" />
                    </button>
                  )}
                  {brushKind === 'aquarelle' && (
                    <>
                      <button
                        className={`btn small dry-btn ${wetness > 0 ? 'wet' : ''}`}
                        style={{ '--wet': wetness } as React.CSSProperties}
                        disabled={wetness <= 0}
                        onClick={() => {
                          wetPass.current = null;
                          setWetness(0);
                          setToast('Papier séché : les traits suivants se posent en glacis par-dessus');
                        }}
                        title={wetness > 0 ? 'Sécher : le papier est encore mouillé, les traits s’y mêlent. Toucher pour figer la passe' : 'Papier sec : le prochain trait commence une nouvelle passe humide'}
                      >
                        <Icon name="dry" />
                      </button>
                    </>
                  )}
                  {brushKind === 'branch' && (
                    <>
                      <Knob label="Ramifications" fmt={(v) => String(1 + Math.round(v * 15))} value={(branches - 1) / 15} onChange={(v) => setBranches(1 + Math.round(v * 15))} />
                      <Knob label="Chaos" value={converge} onChange={(v) => setConverge(Math.round(v * 100) / 100)} />
                      <Knob label="Taille noyau" value={branchCore} onChange={(v) => setBranchCore(Math.round(v * 100) / 100)} />
                    </>
                  )}
                  {brushKind === 'hair' && (
                    <>
                      <Knob label="Longueur" value={hairLen} onChange={(v) => setHairLen(Math.max(0.03, Math.round(v * 100) / 100))} />
                      <Knob label={curl < 0.15 ? 'Frisure · raide' : curl < 0.6 ? 'Frisure · alpaga' : 'Frisure · mouton'} value={curl} onChange={(v) => setCurl(Math.round(v * 100) / 100)} />
                    </>
                  )}
                  {brushKind === 'burn' && (
                    <>
                      <Knob label="Roussi" value={burnChar} onChange={(v) => setBurnChar(Math.max(0.02, Math.round(v * 100) / 100))} />
                      <button className={`btn small ${burnHole ? 'on' : ''}`} onClick={() => setBurnHole(!burnHole)} title={burnHole ? 'Trous : la brûlure perce la couche' : 'Sans trou : la brûlure teinte seulement'}>
                        <Icon name="burn-hole" />
                      </button>
                    </>
                  )}
                </>
              )}
              {tool === 'mold' && (
                <>
                  <FanButton
                    dir={lefty ? 'left' : 'right'}
                    face={MOLD_MODES.find((m) => m.key === (swash.mode ?? 'mold'))!.icon}
                    title={`Mode : ${MOLD_MODES.find((m) => m.key === (swash.mode ?? 'mold'))!.label} (toucher pour changer)`}
                    items={MOLD_MODES.map((m) => ({ ...m, on: (swash.mode ?? 'mold') === m.key }))}
                    onPick={(k) => setSwash({ ...swash, mode: k as 'mold' | 'orn' | 'relief' })}
                  />
                  {swash.mode === 'relief' ? (
                    <>
                      <button
                        className="btn small"
                        disabled={!sel?.bump}
                        onClick={() => {
                          if (!sel?.bump) return;
                          patchLayer(sel.id, { bump: undefined }, true);
                          setToast('Le relief est effacé, la surface redevient lisse');
                        }}
                        title="Revenir à une surface lisse : efface tout le relief"
                      >
                        <Icon name="paint-reset" />
                      </button>
                      <FanButton
                        dir={lefty ? 'left' : 'right'}
                        face={SCULPT_MODES.find((m) => m.key === (swash.sculpt ?? 'raise'))!.icon}
                        title={`Relief : ${SCULPT_MODES.find((m) => m.key === (swash.sculpt ?? 'raise'))!.label} (toucher pour changer)`}
                        items={SCULPT_MODES.map((m) => ({ ...m, on: (swash.sculpt ?? 'raise') === m.key }))}
                        onPick={(k) => setSwash({ ...swash, sculpt: k as 'raise' | 'dig' | 'level' })}
                      />
                      <button className="btn small" disabled={!sel?.bump} onClick={() => sel && smoothRelief(sel)} title="Lisser le relief (à répéter pour lisser plus)">
                        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 16c2-1 2.5-3 4-3s2 2.5 3.5 2.5S12 12 13.5 12 15 14 16.5 14" strokeDasharray="2 2" />
                          <path d="M3 9c4-3 10-3 18 0" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn small"
                        disabled={!sel?.molded}
                        onClick={() => sel && unmold(sel)}
                        title={sel?.kind === 'text' ? 'Revenir au texte : retire le modelage, rend les lettres et tous leurs attributs' : 'Revenir à l’origine : retire tout le modelage'}
                      >
                        <Icon name="paint-reset" />
                      </button>
                      <button className="btn small" disabled={!sel?.molded} onClick={() => sel && smoothMold(sel)} title="Lisser : seules les parties modelées s’adoucissent (à répéter pour lisser plus)">
                        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 16c2-1 2.5-3 4-3s2 2.5 3.5 2.5S12 12 13.5 12 15 14 16.5 14" strokeDasharray="2 2" />
                          <path d="M3 9c4-3 10-3 18 0" />
                        </svg>
                      </button>
                    </>
                  )}
                </>
              )}
              {tool === 'stamp' && (
                <>
                  <FanButton
                    dir={lefty ? 'left' : 'right'}
                    face={<Icon name={stampSow ? 'stamp-sow' : 'stamp-wipe'} />}
                    title={`Mode du tampon : ${stampSow ? 'semis' : 'normal'} (toucher pour changer)`}
                    items={[
                      { key: 'normal', icon: <Icon name="stamp-wipe" />, label: 'Normal', hint: 'Une empreinte au toucher, l’encre s’étire quand on glisse', on: !stampSow },
                      { key: 'sow', icon: <Icon name="stamp-sow" />, label: 'Semis', hint: 'Des copies du motif s’éparpillent le long du geste', on: stampSow },
                    ]}
                    onPick={(k) => setStampSow(k === 'sow')}
                  />
                  <button className={`btn small ${stampFilled ? 'on' : ''}`} onClick={() => setStampFilled(!stampFilled)} title="Motif rempli : ses formes prennent le dégradé du guide">
                    <Icon name="stamp-fill" />
                  </button>
                  <button className={`btn small ${spill ? 'on' : ''}`} onClick={toggleSpill} title={spill ? 'Déborder : l’encre sort de la forme et repousse son contour, comme le modelage (« Revenir à la forme » le rend). Toucher pour rester dans la forme' : 'Dans la forme : l’encre reste dans la découpe. Toucher pour la laisser déborder et repousser le contour'}>
                      <Icon name="spill" />
                    </button>
                  {stampSow && (
                    <>
                      <Knob label="Densité" value={sowDensity} onChange={(v) => setSowDensity(Math.round(v * 100) / 100)} />
                      <Knob label="Écart" value={sowSpread} onChange={(v) => setSowSpread(Math.round(v * 100) / 100)} />
                    </>
                  )}
                </>
              )}
              {tool === 'cut' && (
                <>
                  <button
                    className="btn small"
                    onClick={() => setBlade(blade === 'scissors' ? 'scalpel' : 'scissors')}
                    title={blade === 'scalpel' ? 'Scalpel : le morceau reste en place, lié à son objet (toucher pour les ciseaux)' : 'Ciseaux : le morceau se détache (toucher pour le scalpel)'}
                  >
                    <Icon name={blade} />
                  </button>
                  <button
                    className={`btn small ${subjectOn ? 'on' : ''}`}
                    onClick={() => {
                      setSubjectOn(!subjectOn);
                      setSubjectErase(false);
                      subject.current = null;
                    }}
                    title="Coller au sujet : après le tracé, la découpe se resserre sur le personnage ou l'objet entouré (le modèle de 30 Mo se charge au premier usage)"
                  >
                    <Icon name="subject" />
                  </button>
                  {subjectOn && subject.current && (
                    <button
                      className="btn small"
                      onClick={() => {
                        subject.current = null;
                        redraw();
                      }}
                      title="Abandonner : la photo reste entière"
                    >
                      <Icon name="undo" />
                    </button>
                  )}
                  {!(subjectOn && subject.current) && (
                    <button className={`btn small ${magnet ? 'on' : ''}`} onClick={() => setMagnet(!magnet)} title="Lignes magnétiques : les ciseaux suivent les contours détectés">
                      <Icon name="magnet" />
                    </button>
                  )}
                  {magnet && !(subjectOn && subject.current) && (
                    <>
                      <button className={`btn small mode-btn ${modePick ? 'on' : ''}`} onClick={() => setModePick(!modePick)} title={`Mode de détection : ${EDGE_MODES.find((x) => x[0] === edgeMode)![1]}`}>
                        <Icon name={`edge-${edgeMode}`} />
                      </button>
                      {modePick && (
                        <div className="mode-pop">
                          <div className="b-title">Détection</div>
                          {EDGE_MODES.map(([m, t, hint]) => (
                            <button
                              key={m}
                              className={`row ${edgeMode === m ? 'on' : ''}`}
                              onClick={() => {
                                setEdgeMode(m);
                                setModePick(false);
                              }}
                            >
                              <Icon name={`edge-${m}`} />
                              <span>{t}</span>
                              <small>{hint}</small>
                            </button>
                          ))}
                        </div>
                      )}
                      <Knob label="Seuil" value={(edgeThreshold - 0.05) / 0.9} onChange={(v) => setEdgeThreshold(Math.round((0.05 + v * 0.9) * 50) / 50)} />
                      <Knob label="Lissage" value={edgeSmooth} onChange={(v) => setEdgeSmooth(Math.round(v * 20) / 20)} />
                    </>
                  )}
                </>
              )}
            </div>
          </aside>
          {(tool === 'paint' || tool === 'stamp' || tool === 'mold') && (
            <div className="wheel-dock" style={bandH ? { bottom: bandH + 12 } : undefined}>
              {/* une seule roue d'un outil à l'autre (même clé) : elle glisse d'un réglage à l'autre au lieu de se redessiner */}
              {[
                tool === 'paint' && (
                  <BrushWheel
                    key="wheel"
                    side={lefty ? 'right' : 'left'}
                    tips={tips}
                    hideAfter={wheelHide}
                    size={(size - 0.01) / 0.14}
                    sizeText={`${Math.round(size * 100)}`}
                    onSize={(v) => setSize(0.01 + v * 0.14)}
                    intensity={opacity}
                    onIntensity={(v) => setOpacity(Math.max(0.05, v))}
                    onSizing={(on) => setSizing(on ? 'on' : 'after')}
                    {...(tipOn(brushKind) ? { tip: brushTip, ...(brushTip !== 'round' && brushTip !== 'ears' ? { rotation: brushRot, onRotation: setBrushRot } : {}) } : {})}
                    {...(leanOn(brushKind) ? { tilt: brushTilt, onTilt: (x: number, y: number) => setBrushTilt([x, y]) } : {})}
                    pick={tipOn(brushKind) ? tipPick(brushTip, setBrushTip, BRUSH_TIPS) : { face: <Icon name="tip-round" />, title: 'Pointe ronde (seule possible pour ce pinceau)' }}
                  />
                ),
                tool === 'stamp' && (
                  <BrushWheel
                    key="wheel"
                    side={lefty ? 'right' : 'left'}
                    tips={tips}
                    hideAfter={wheelHide}
                    size={(stampSize - 0.02) / 0.28}
                    sizeText={`${Math.round(stampSize * 100)}`}
                    onSize={(v) => setStampSize(0.02 + v * 0.28)}
                    intensity={1 - dilution}
                    onIntensity={(v) => setDilution(Math.round((1 - v) * 100) / 100)}
                    rotation={stampRot}
                    onRotation={setStampRot}
                    onSizing={(on) => setSizing(on ? 'on' : 'after')}
                    {...(stampSow
                      ? {
                          tilt: sowPad,
                          onTilt: (x: number, y: number) => {
                            setSowPad([x, y]);
                            setSowPersp(Math.min(1, Math.round(Math.hypot(x, y) * 100) / 100));
                          },
                        }
                      : { tilt: stampTilt, onTilt: (x: number, y: number) => setStampTilt([x, y]) })}
                    pick={{
                      face: <span className="bw-stamp-face" dangerouslySetInnerHTML={{ __html: stampSvg(stampOf(stampId), 'currentColor', { filled: stampFilled }) }} />,
                      title: `Tampon : ${stampOf(stampId).name}`,
                      // les tampons défilent dans l'éventail, comme les autres choix de la roue
                      options: STAMPS.map((x) => ({
                        key: x.id,
                        icon: <span className="fan-stamp" dangerouslySetInnerHTML={{ __html: stampLook(x) }} />,
                        label: x.name,
                        on: stampId === x.id,
                      })),
                      onOption: setStampId,
                    }}
                    stamp={`data:image/svg+xml,${encodeURIComponent(stampLook(stampOf(stampId)))}`}
                  />
                ),
                tool === 'mold' &&
                  (swash.mode === 'orn' ? (
                    <BrushWheel
                      key="wheel"
                      side={lefty ? 'right' : 'left'}
                      tips={tips}
                      hideAfter={wheelHide}
                      size={((swash.w ?? (sel?.text ? swashWidth(sel.text.weight) * 0.8 : 0.08)) - 0.01) / 0.29}
                      sizeText={`${Math.round((swash.w ?? (sel?.text ? swashWidth(sel.text.weight) * 0.8 : 0.08)) * 100)}`}
                      onSize={(v) => setSwash({ ...swash, w: 0.01 + v * 0.29 })}
                      tip={moldTip(swash).tip}
                      pick={tipPick(moldTip(swash).tip, (tip) => setSwash(withMoldTip(swash, { tip })))}
                      {...(moldTip(swash).tip !== 'round' ? { rotation: moldTip(swash).rot, onRotation: (rot: number) => setSwash(withMoldTip(swash, { rot })) } : {})}
                      onSizing={(on) => setSizing(on ? 'on' : 'after')}
                    />
                  ) : (
                    <BrushWheel
                      key="wheel"
                      side={lefty ? 'right' : 'left'}
                      tips={tips}
                      hideAfter={wheelHide}
                      size={(swash.r - 0.06) / 0.94}
                      sizeText={`${Math.round(swash.r * 100)}`}
                      onSize={(v) => setSwash({ ...swash, r: 0.06 + v * 0.94 })}
                      onSizing={(on) => setSizing(on ? 'on' : 'after')}
                      intensity={swash.k ?? 1}
                      onIntensity={(v) => setSwash({ ...swash, k: Math.max(0.05, v) })}
                      tip={moldTip(swash).tip}
                      pick={tipPick(moldTip(swash).tip, (tip) => setSwash(withMoldTip(swash, { tip })))}
                      {...(moldTip(swash).tip !== 'round' ? { rotation: moldTip(swash).rot, onRotation: (rot: number) => setSwash(withMoldTip(swash, { rot })) } : {})}
                    />
                  )),
              ]}
            </div>
          )}

          {campaignDialog && me?.team && (
            <CampaignDialog
              campaigns={campaigns}
              current={campaign}
              counts={campaignCounts}
              operations={operations}
              canEdit={canEditTeam}
              onClose={() => setCampaignDialog(false)}
              onPick={(id) => {
                setCampaign(id);
                setCampaignDialog(false);
              }}
              onSheet={(id) => {
                setCampaignDialog(false);
                setSheet(id);
              }}
              create={async (c: CampaignInput) => {
                // le plan de publication part de l'occasion et de la date
                const plan = planFromOperation(allOperations.find((o) => o.id === c.operation), c.date, activity);
                const x = await createCampaign(plan.length ? { ...c, plan } : c);
                setCampaigns((l) => [x, ...l]);
                setCampaign(x.id);
              }}
              update={async (id, c) => {
                const x = await updateCampaign(id, c);
                setCampaigns((l) => l.map((y) => (y.id === id ? x : y)));
              }}
            />
          )}
          {feedOpen && me?.team && (
            <FeedDialog
              events={online && me?.team ? campaignFeed : null}
              seen={feedSeen}
              me={(me.email ?? 'groupe').toLowerCase()}
              campaigns={campaigns}
              activity={activity}
              onClose={closeFeed}
              onCampaign={(id) => {
                closeFeed();
                setSheet(id);
              }}
              onEvent={(e) => {
                closeFeed();
                if (e.type === 'campaign' && e.campaign) return setSheet(e.campaign);
                const m = projects.find((x) => x.id === e.atelier);
                if (!m) return;
                void openProject(m).then(() => {
                  if (e.type !== 'composition' && e.type !== 'vote') setMsgDialog(true);
                });
              }}
            />
          )}
          {sheet && campaigns.some((c) => c.id === sheet) && (
            <CampaignSheet
              campaign={campaigns.find((c) => c.id === sheet)!}
              operations={allOperations}
              activity={activity}
              projects={projects}
              canEdit={canEditTeam}
              current={project?.id}
              onClose={() => setSheet(null)}
              onSave={async (c) => {
                const x = await updateCampaign(sheet, c);
                setCampaigns((l) => l.map((y) => (y.id === x.id ? x : y)));
              }}
              onOpen={(m) => {
                setSheet(null);
                void openProject(m);
              }}
            />
          )}
          {newDialog && (
            <NewCompositionDialog
              campaign={followed}
              campaignOp={campaignOp}
              operations={allOperations}
              templates={followedTemplates}
              others={projects.filter((m) => m.campaign !== campaign)}
              campaigns={campaigns}
              targetsLabel={(op) => op.targets.map((t) => targetLabel(t, activity)).join(', ')}
              onClose={() => setNewDialog(false)}
              onBlank={() => {
                setNewDialog(false);
                setBubble(null);
                void newProject('Sans titre', false);
              }}
              onOperation={(op) => {
                setNewDialog(false);
                setBubble(null);
                void newProject(op.name, false, op);
              }}
              onCopy={(m) => {
                setNewDialog(false);
                const mine = followedTemplates.includes(m) ? `${m.title} · ${(me?.name ?? me?.email ?? '').split(' ')[0]}` : m.title;
                void fromComposition(m, mine);
              }}
            />
          )}
          {msgDialog && project && me?.team && (
            <MessagesDialog
              atelier={project.id}
              title={project.title}
              me={(me.email ?? 'groupe').toLowerCase()}
              owner={me.team.role === 'owner'}
              targets={doc.targets ?? []}
              active={doc.target ?? 0}
              activity={activity}
              review={projects.find((x) => x.id === project.id)?.review}
              canPropose={me.team.role !== 'viewer' && projects.find((x) => x.id === project.id)?.review?.status !== 'proposed'}
              canReview={me.team.role === 'owner' && projects.find((x) => x.id === project.id)?.review?.status === 'proposed'}
              onStep={sendReview}
              onShowTarget={showTarget}
              onCount={(n) => setProjects((l) => l.map((x) => (x.id === project.id ? { ...x, messages: n } : x)))}
              onClose={() => setMsgDialog(false)}
            />
          )}
          {bubble === 'composition' && online && (
            <CompositionMenu
              meta={project ? projects.find((x) => x.id === project.id) : undefined}
              current={project ?? undefined}
              targets={doc.targets ?? []}
              previews={previews}
              active={doc.target ?? 0}
              campaign={followed}
              campaigns={me?.team ? campaigns : []}
              projects={projects}
              activity={activity}
              events={me?.team ? campaignFeed : null}
              me={me?.email ?? 'groupe'}
              canEdit={!me?.team || canEditTeam}
              isAdmin={!!me?.admin || me?.team?.role === 'owner'}
              canVote={!!me?.team}
              onTitle={(t) => project && setProject({ ...project, title: t })}
              onShow={showTarget}
              onAdd={addPublication}
              onRemove={removePublication}
              onCampaign={() => setBubble('projects')}
              onSaveNew={() => void newProject('Sans titre', true)}
              onVote={voteFor}
              onTemplate={templateFor}
            />
          )}
          {(bubble === 'projects' || (bubble === 'composition' && !online)) && (online ? (
            <CompositionsMenu
              campaigns={me?.team ? campaigns : []}
              operations={allOperations}
              campaign={followed}
              counts={campaignCounts}
              activity={activity}
              projects={projects}
              current={project ?? undefined}
              currentTargets={doc.targets ?? []}
              events={online && me?.team ? campaignFeed : null}
              me={me?.email ?? 'groupe'}
              canEdit={!me?.team || canEditTeam}
              isAdmin={!!me?.admin || me?.team?.role === 'owner'}
              canVote={!!me?.team}
              onPickCampaign={setCampaign}
              onAllCampaigns={() => setCampaignDialog(true)}
              onEditCampaign={() => followed && setSheet(followed.id)}
              onSaveNew={() => void newProject('Sans titre', true)}
              onNew={() => setNewDialog(true)}
              onOpen={(m) => void openComposition(m)}
              onVote={voteFor}
              onDelete={(m) =>
                void removeAtelier(m.id).then(
                  () => {
                    if (project?.id === m.id) setProject(null);
                    refreshProjects();
                    setToast(`« ${m.title} » supprimée`);
                  },
                  (e: Error) => setToast(`Suppression impossible : ${e.message}`),
                )
              }
              onTemplate={templateFor}
            />
          ) : (
            <div className="bubble projects-bubble">
              <p className="fx-hint">{online === null ? 'Connexion au serveur…' : 'Hors ligne : la page reste dans ce navigateur. Sur designer.flowtherapymusic.com, elle s’enregistre pour tout le groupe.'}</p>
            </div>
          ))}

          {bubble === 'export' && (
            <div className="bubble export-bubble">
              <button
                className="row"
                onClick={() => {
                  setBubble(null);
                  setRendu(true);
                }}
              >
                <Icon name="eye" />
                <span>Aperçu plein écran</span>
                <small>le rendu final, sans les outils</small>
              </button>
              <button
                className="row"
                onClick={() => {
                  setBubble(null);
                  setView3d({});
                }}
              >
                <Icon name="layers" />
                <span>Vue 3D</span>
                <small>les couches en relief, à leur hauteur</small>
              </button>
              <div className="b-title">Publier</div>
              <div className="b-sub">{doc.targets?.length ? 'Rendus' : 'Formats'}</div>
              {doc.targets?.map((t, i) => {
                const on = exportTargets.includes(i);
                const x = formatOf(t.format);
                const sz = exportSize(x, t.width);
                return (
                  <button key={i} className={`row ${on ? 'on' : ''}`} onClick={() => setExportTargets(on ? exportTargets.filter((y) => y !== i) : [...exportTargets, i])}>
                    <MediaIcon ch={channels.find((c) => c.id === t.channel)} />
                    <span>{targetLabel(t, activity)}</span>
                    <small className="tg-pal">
                      {sz.w} × {sz.h} px <VariantBar pal={paletteFor(t, activity)} />
                    </small>
                  </button>
                );
              })}
              {!doc.targets?.length && FORMATS.map((x) => {
                const on = exportFormats.includes(x.id);
                const sz = exportSize(x);
                return (
                  <button key={x.id} className={`row ${on ? 'on' : ''}`} onClick={() => setExportFormats(on ? exportFormats.filter((y) => y !== x.id) : [...exportFormats, x.id])}>
                    <FormatGlyph w={x.width} h={x.height} big />
                    <span>{x.title}</span>
                    <small>
                      {sz.w} × {sz.h} px{x.id === doc.formatId ? ' · en cours' : ''}
                    </small>
                  </button>
                );
              })}
              <div className="pub-caption">
                <div className="b-sub">Texte d’accompagnement</div>
                <textarea
                  className="pf-input"
                  rows={4}
                  value={doc.caption ?? ''}
                  placeholder="Ce qui accompagne le post : l’annonce, la date, le lien de billetterie…"
                  onChange={(e) => setDoc((d) => ({ ...d, caption: e.target.value || undefined }))}
                />
                {pubMentions.length > 0 && (
                  <div className="pub-mentions">
                    {pubMentions.map((m) => (
                      <button key={m.name} className={`pub-mention ${m.channel ? 'on' : ''}`} title={m.text} onClick={() => setDoc((d) => ({ ...d, caption: `${(d.caption ?? '').trimEnd()}${d.caption ? '\n' : ''}${m.text}` }))}>
                        + {m.name}
                      </button>
                    ))}
                  </div>
                )}
                <div className="pub-cap-acts">
                  <small>{(doc.caption ?? '').length} caractères</small>
                  <button className="ab-link" disabled={!doc.caption} onClick={() => void navigator.clipboard?.writeText(doc.caption ?? '').then(() => setToast('Texte copié'), () => setToast('Copie impossible'))}>
                    Copier le texte
                  </button>
                </div>
              </div>
              <div className="pub-dl">
                <div className="seg">
                  {(['png', 'pdf'] as const).map((k) => (
                    <button key={k} className={exportKind === k ? 'on' : ''} onClick={() => setExportKind(k)}>
                      {k.toUpperCase()}
                    </button>
                  ))}
                </div>
                <button className="btn-primary" disabled={exporting || (doc.targets?.length ? !exportTargets.length : !exportFormats.length)} onClick={() => void runExport()}>
                  {exporting ? 'Téléchargement…' : 'Télécharger'}
                </button>
              </div>
              {pubPlan.length > 0 && (
                <div className="pub-plan">
                  <div className="b-sub">Dans le plan de « {pubCampaign!.name} »</div>
                  {pubPlan.map((it) => (
                    <div key={it.id} className="pub-plan-row">
                      <span>
                        {targetLabel(it, activity)}
                        {it.label ? ` · ${it.label}` : ''}
                        {it.date ? ` · ${new Date(`${it.date}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}` : ''}
                      </span>
                      {it.published ? (
                        <small className="pub-done">publiée</small>
                      ) : (
                        canEditTeam && (
                          <button className="ab-link" onClick={() => void markPublished(it.id)}>
                            Marquer publiée
                          </button>
                        )
                      )}
                    </div>
                  ))}
                </div>
              )}
              <button className="pf-btn pub-schedule" disabled title="Bientôt : relier les comptes Facebook et Instagram de l’activité">
                Programmer la publication
              </button>
              <p className="fx-hint">La publication programmée viendra quand les comptes Facebook et Instagram de l’activité seront reliés.</p>
            </div>
          )}

          {bubble === 'activity' && <ActivityMenu me={me} online={online} onEdit={() => setBubble('activity-edit')} />}
          {bubble === 'user' && <UserMenu me={me} onPrefs={() => setBubble('prefs')} />}
          {bubble === 'activity-edit' && me?.team && (
            <ActivityForm me={me} onClose={() => setBubble(null)} onSaved={() => {
              void fetchMe().then(setMe, () => {});
              loadActivity();
            }} />
          )}
          {bubble === 'prefs' && (
            <PrefsPanel
              online={online}
              tips={tips}
              setTips={setTips}
              simple={simple}
              setSimple={setSimple}
              penRoll={penRoll}
              setPenRoll={setPenRoll}
              penTilt={penTilt}
              setPenTilt={setPenTilt}
              fingerMode={fingerMode}
              setFingerMode={setFingerMode}
              fingerAuto={!penSeen && !finePointer}
              penSeen={penSeen}
              theme={theme}
              setTheme={setTheme}
              lefty={lefty}
              setLefty={setLefty}
              wheelHide={wheelHide}
              setWheelHide={setWheelHide}
              guides={guidesOn}
              setGuides={setGuidesOn}
              markColors={markColors}
              setMarkColors={changeMarkColors}
              points={defaultPoints}
              setPoints={setDefaultPoints}
              onClose={() => setBubble(null)}
            />
          )}
          {bubble === 'format' && (
            <div className="bubble format-bubble pubs-bubble">
              <div className="b-title pub-title">
                {/* même pictogramme que le bouton de la barre : le format, le réseau en pastille */}
                <span className="pub-ico">
                  <FormatGlyph w={f.width} h={f.height} big />
                  {currentPub.channel && (
                    <span className="pubs-media">
                      <MediaIcon ch={channels.find((c) => c.id === currentPub.channel)} size={14} />
                    </span>
                  )}
                </span>
                {/* le titre de la publication se change sur place */}
                <input
                  className="pub-name"
                  value={currentPub.name ?? ''}
                  placeholder={defaultLabel(currentPub, activity)}
                  onChange={(e) => renamePublication(e.target.value)}
                  aria-label="Titre de la publication"
                  title="Titre de la publication : toucher pour le changer"
                />
                {/* repères affichés en permanence, ou seulement en déplaçant */}
                <button
                  className={`btn small pub-eye ${guidesOn.on ? 'on' : ''}`}
                  onClick={() => setGuidesOn({ ...guidesOn, on: !guidesOn.on })}
                  aria-pressed={guidesOn.on}
                  title={guidesOn.on ? 'Repères affichés en permanence : toucher pour ne les voir qu’en déplaçant' : 'Repères visibles seulement en déplaçant : toucher pour les afficher en permanence'}
                >
                  <Icon name={guidesOn.on ? 'eye' : 'eyeoff'} />
                </button>
              </div>
              <PublicationsPanel
                current={currentPub}
                activity={activity}
                onApply={applyPublication}
                guides={
                  <div className="pub-guides">
                    <div className="b-field-label">Repères</div>
                    <div className="seg">
                      {ANCHOR_FRAMES.filter((x) => x !== 'grid').map((x) => (
                        <button key={x} className={doc.frame === x ? 'on' : ''} onClick={() => setDoc((d) => ({ ...d, frame: x as AnchorFrame }))} title={FRAME_TITLES[x]}>
                          {x === 'repartition' ? '½ ⅓' : x === 'or' ? 'φ' : '✕'}
                        </button>
                      ))}
                    </div>
                    {doc.frame === 'repartition' && (
                      <>
                        <div className="b-title">
                          Densité <span className="b-count">{['Demis', 'Tiers', 'Quarts', 'Sixièmes', 'Douzièmes', '24es'][(doc.density ?? DEFAULT_DENSITY) - 1]}</span>
                        </div>
                        <label className="density">
                          <span>−</span>
                          <input
                            type="range"
                            min={1}
                            max={DENSITY_STEPS.length}
                            step={1}
                            value={doc.density ?? DEFAULT_DENSITY}
                            onChange={(e) => setDoc((d) => ({ ...d, density: Number(e.target.value) }))}
                          />
                          <span>+</span>
                        </label>
                      </>
                    )}
                    {/* légende : seulement ce qui est sur la page en ce moment */}
                    <MarkLegend
                      kinds={(() => {
                        const seen = new Set(anchorsOf(doc.frame, f).map((a) => anchorKind(doc.frame, a.id)));
                        return marksOfFrame(doc.frame).filter((k) => (k === 'margin' ? hasMargins(docMargins(doc)) : k === 'page' || seen.has(k)));
                      })()}
                      colors={markColors}
                    />
                    <button className={`ab-more ${anchorMore ? 'on' : ''}`} onClick={() => setAnchorMore(!anchorMore)} aria-expanded={anchorMore}>
                      <span>Points d’accroche</span>
                      <span className="ab-chev">{anchorMore ? '−' : '+'}</span>
                    </button>
                    {anchorMore && (
                      <>
                        <PointGrids points={points} frame={doc.frame} onChange={(k, v) => setDoc((d) => ({ ...d, points: { ...(d.points ?? defaultPoints), [k]: v } }))} />
                        <button className="ab-link" onClick={() => setBubble('prefs')}>
                          Réglages par défaut dans Préférences
                        </button>
                      </>
                    )}
                  </div>
                }
              />
              <button
                className="row danger"
                onClick={() => {
                  update(() => ({ ...blankDoc(), formatId: doc.formatId, frame: doc.frame, guides: doc.guides }));
                  forgetPaint();
                  setSelected(null);
                }}
              >
                Repartir d'une page vierge
              </button>
            </div>
          )}

          {bubble === 'add' && (
            <div className={`bubble layers-bubble add-bubble ${libDrag ? 'dragging' : ''}`}>
              <div className="lib-tabs" role="tablist">
                {SHELVES.map(([k, label]) => (
                  <button key={k} role="tab" aria-selected={shelf === k} className={shelf === k ? 'on' : ''} onClick={() => setShelf(k)}>
                    {label}
                  </button>
                ))}
              </div>
              {shelf === 'photos' && (
                <div className="add-grid lib-import">
                  <label className="file">
                    <Icon name="import" />
                    Importer une photo
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) {
                          setBubble(null);
                          void importPhoto(file);
                        }
                      }}
                    />
                  </label>
                </div>
              )}
              {shelf === 'textes' && (
                <RailScroll className="forms-scroll">
                  <div className="text-presets">
                    {TEXT_PRESETS.map((p) => (
                      <button key={p.name} className="text-preset" onClick={() => void addText(p)} title={`Poser un texte « ${p.name} »`}>
                        <span
                          className={`tp-sample tp-${p.extra ?? 'plain'}`}
                          style={{ fontFamily: `${fontFamily(p.style.font)}, Inter, sans-serif`, fontWeight: p.style.weight, fontStyle: p.style.italic ? 'italic' : 'normal', letterSpacing: `${p.style.tracking ?? 0}em` }}
                        >
                          {p.sample}
                        </span>
                        <span className="tp-name">{p.name}</span>
                      </button>
                    ))}
                  </div>
                </RailScroll>
              )}
              {shelf === 'objets' && <ObjetsShelf onInsert={(e, at) => void insertObjet(e, at)} onDragState={setLibDrag} />}
              {shelf !== 'formes' && shelf !== 'textes' && shelf !== 'objets' && (
                <LibraryShelf
                  shelf={shelf}
                  onDragState={setLibDrag}
                  onInsert={(it, at) => {
                    setLibDrag(false);
                    setBubble(null);
                    void insertItem(it, at);
                  }}
                />
              )}
              {shelf === 'formes' && (
                <RailScroll className="forms-scroll">
                  {SHAPE_FAMILIES.map(([fam, list]) => (
                    <div key={fam} className="forms-fam">
                      <div className="b-title">{fam}</div>
                      <div className="add-grid forms-grid">
                        {list.map(([sh, name]) => (
                          <button
                            key={sh}
                            onClick={() => (KITS[sh] ? addKit(kitFromSvg(KITS[sh].svg, name)) : addLayer('shape', sh === 'polystar' ? { shape: 'star', name: 'Étoile' } : { shape: sh as ShapeKind, name }))}
                            title={sh === 'polystar' ? 'Polygone ou étoile : côtés et creux se règlent ensuite' : KITS[sh] ? `${name} : en pièces à colorer séparément` : name}
                          >
                            {sh === 'polystar' ? <PolyStarGlyph /> : <ShapeGlyph shape={sh as ShapeKind} />}
                            {name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="forms-fam">
                    <div className="b-title">Vos dessins</div>
                    <div className="add-grid forms-grid kits-grid">
                      <label className="file" title="Un dessin SVG : chaque groupe devient une pièce nommée (data-volume, data-lift facultatifs)">
                        <Icon name="import" />
                        Importer un SVG
                        <input
                          type="file"
                          accept="image/svg+xml,.svg"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (file) void importKit(file);
                          }}
                        />
                      </label>
                    </div>
                  </div>
                  <div className="add-grid">
                    {!doc.layers.some((l) => l.kind === 'surface') && (
                      <button
                        onClick={() =>
                          update((d) => ({
                            ...d,
                            layers: [
                              { id: uid(), name: 'Surface de fond', kind: 'surface', anchor: { frame: 'repartition', point: 'h1/2 v1/2' }, dx: 0, dy: 0, w: 1, h: 1, guide: 0, height: 0, visible: true, strokes: [] },
                              ...d.layers,
                            ],
                          }))
                        }
                      >
                        <Icon name="layers" />
                        Surface de fond
                      </button>
                    )}
                  </div>
                </RailScroll>
              )}
            </div>
          )}

          {bubble === 'palette' && (
            <PaletteBubble
              doc={doc}
              active={guide}
              declared={paletteFor(activeTarget, activity)}
              onPick={setGuide}
              onGuides={(guides, commit = true) => {
                livePaint(!commit);
                (commit ? update : setDoc)((d) => ({ ...d, guides }));
              }}
              onDrag={(i, x, y) => setDragGuide(i === null ? null : { i, x, y })}
              onDrop={dropGuide}
            />
          )}

          {dragGuide && <span className="drag-dot" style={{ left: dragGuide.x, top: dragGuide.y, background: swatch(doc.guides[dragGuide.i]) }} />}

          {bubble === 'light' && <LampPanel doc={doc} f={f} onChange={(lamp) => setDoc((d) => ({ ...d, lamp }))} onClose={() => setBubble(null)} />}

          {tool === 'edge' && (!sel || sel.kind === 'surface') && <div className="status">Sélectionne une photo ou une forme pour régler ses bords</div>}
          {tool === 'material' && !sel && <div className="status">Sélectionne une photo ou une forme pour choisir sa matière</div>}
          {(tool === 'transform' || tool === 'coat' || tool === 'filter') && !sel && <div className="status">Sélectionne une photo ou une forme pour la modifier</div>}
          {!sel && tool === 'cut' && magnet && <div className="status">Sélectionne une image : ses contours guideront les ciseaux</div>}
          {sel && (
            <div className="status">
              {tool === 'paint' && `Peinture dans « ${sel.name} »`}
              {tool === 'stamp' && `Tampon « ${stampOf(stampId).name} » dans « ${sel.name} » : touche pour imprimer, ${stampSow ? 'glisse pour semer' : 'glisse pour essuyer'}`}
              {tool === 'cut' && subjectOn && subject.current && subjectStatus(sel)}
              {tool === 'cut' &&
                !(subjectOn && subject.current) &&
                `Trace un contour : le morceau ${blade === 'scalpel' ? 'reste en place, lié à la couche touchée' : 'se détache de la couche touchée'}${magnet ? `, aimanté sur les contours de « ${sel.name} »` : ''}${subjectOn ? ', puis resserré sur le sujet entouré' : ''}`}
              {tool === 'filter' &&
                `« ${sel.name} » · ${sel.kind === 'photo' ? [lookOf(sel.look?.style)?.name ?? 'photo originale', fxOf(sel.look?.draw?.id)?.name].filter(Boolean).join(' + ') : 'les filtres sont réservés aux photos'}`}
              {(tool === 'transform' || tool === 'coat') &&
                `« ${sel.name} » · ${
                  (sel.fx ?? [])
                    .filter((x) => fxOf(x.id)?.group === (tool === 'coat' ? 'lumiere' : 'effet'))
                    .map((x) => fxOf(x.id)?.name)
                    .join(' + ') || (tool === 'coat' ? 'sans revêtement' : 'aucune transformation')
                }`}
              {tool === 'edge' &&
                sel.kind !== 'surface' &&
                `« ${sel.name} » · ${[sel.border && BORDER_TYPES.find((x) => x[0] === sel.border!.style)?.[1], sel.glow && GLOW_TYPES.find((x) => x[0] === sel.glow!.style)?.[1]].filter(Boolean).join(' + ') || 'sans bord'}`}
              {tool === 'material' && `« ${sel.name} » · ${fxOf(sel.material?.id)?.name ?? 'sans matière'}`}
              {tool === 'move' && `« ${sel.name} » · ${sel.kind === 'surface' ? 'suit le format' : sel.anchor.point}`}
            </div>
          )}
        </>
      )}

      {rendu && (
        <div className="rendu-bar">
          <button className="chip" onClick={makeSnapshot}>
            <Icon name="photo" /> Image finale
          </button>
          <button className="chip" onClick={() => setView3d({})} title="Voir les couches en relief, à leur hauteur">
            Vue 3D
          </button>
          <button className="chip" onClick={() => setRendu(false)}>
            Retour à l'atelier
          </button>
        </div>
      )}
      {view3d && <ParallaxView doc={doc} f={f} start={view3d.start} shift={shift} onClose={() => setView3d(false)} selected={selected} onSelect={setSelected} onLevel={setLevel} />}
      {snapshot && (
        <div className="snapshot" onClick={() => setSnapshot(null)}>
          <img src={snapshot} alt="Rendu final" />
          <p>Appui long sur l'image pour l'enregistrer · toucher pour fermer</p>
        </div>
      )}
      {toast && (
        <div className={`toast ${toastUndo ? 'with-undo' : ''}`}>
          {toast}
          {toastUndo && (
            <button
              onClick={() => {
                setToastUndo(false);
                undo();
              }}
            >
              Rétablir
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Curseur vertical du bord gauche, à la façon de Procreate. */
/**
 * Cadran de rotation : on tourne le doigt autour du centre ; l'angle s'aimante tous les 15°,
 * un double toucher le remet à 0°.
 */
function Dial({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef(0);
  const set = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    let a = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) + Math.PI / 2;
    if (a > Math.PI) a -= 2 * Math.PI;
    const deg = (a * 180) / Math.PI;
    const snap = Math.round(deg / 15) * 15;
    onChange(Math.abs(deg - snap) < 4 ? ((snap === -180 ? 180 : snap) * Math.PI) / 180 : a);
  };
  const deg = Math.round((value * 180) / Math.PI);
  return (
    <div
      ref={ref}
      className="rot-dial"
      title={`${label} : ${deg}° (double toucher : 0°)`}
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture(e.pointerId);
        const now = performance.now();
        if (now - last.current < 320) {
          onChange(0);
          last.current = 0;
          return;
        }
        last.current = now;
        set(e);
      }}
      onPointerMove={(e) => e.buttons && set(e)}
    >
      <div className="rot-dial-hand" style={{ transform: `rotate(${value}rad)` }} />
      <span className="rot-dial-val">{deg}°</span>
    </div>
  );
}

function VSlider({ label, value, onChange, center, onActive }: { label: string; value: number; onChange: (v: number) => void; center?: boolean; onActive?: (on: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const set = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    let v = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
    // curseur à deux sens : le neutre aimante le doigt
    if (center && Math.abs(v - 0.5) < 0.035) v = 0.5;
    onChange(v);
  };
  return (
    <div
      ref={ref}
      className={`vslider ${center ? 'center' : ''}`}
      title={label}
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture(e.pointerId);
        onActive?.(true);
        set(e);
      }}
      onPointerMove={(e) => e.buttons && set(e)}
      onPointerUp={() => onActive?.(false)}
      onPointerCancel={() => onActive?.(false)}
    >
      {center ? (
        <>
          <div className="vs-fill" style={{ bottom: `${Math.min(value, 0.5) * 100}%`, height: `${Math.abs(value - 0.5) * 100}%` }} />
          <div className="vs-zero" />
        </>
      ) : (
        <div className="vs-fill" style={{ height: `${value * 100}%` }} />
      )}
      <div className="vs-thumb" style={{ bottom: `calc(${value * 100}% - 9px)` }} />
      <span className="vs-label">{label}</span>
    </div>
  );
}

export { Knob };

function FormatGlyph({ w, h, big }: { w: number; h: number; big?: boolean }) {
  const s = big ? 26 : 16;
  const k = s / Math.max(w, h);
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden>
      <rect x={(s - w * k) / 2 + 0.75} y={(s - h * k) / 2 + 0.75} width={w * k - 1.5} height={h * k - 1.5} rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** Le générateur : un hexagone et l'étoile qu'il devient. */
function PolyStarGlyph() {
  const pt = (n: number, depth: number, r: number) =>
    'M' +
    genPath({ sides: n, depth })
      .map((p) => `${(12 + (p.x - 0.5) * 2 * r).toFixed(2)} ${(12 + (p.y - 0.5) * 2 * r).toFixed(2)}`)
      .join('L') +
    'Z';
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
      <path d={pt(6, 0, 10)} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d={pt(5, 0.55, 7)} fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function ShapeGlyph({ shape }: { shape: ShapeKind }) {
  // dans un carré de 20 : la silhouette garde ses proportions
  const r = isSilhouette(shape) ? silhouetteRatio(shape) : 1;
  const [w, h] = r >= 1 ? [20, 20 / r] : [20 * r, 20];
  const rings = isSilhouette(shape) ? silhouetteRings(shape) : [shapePath(shape)];
  const d = rings.map((ring) => 'M' + ring.map((p) => `${(2 + (20 - w) / 2 + p.x * w).toFixed(2)} ${(2 + (20 - h) / 2 + p.y * h).toFixed(2)}`).join('L') + 'Z').join('');
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
      <path d={d} fillRule="evenodd" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

/** Vignette de couche : sa découpe remplie de sa matière. */
function LayerThumb({ layer, doc }: { layer: Layer; doc: Doc }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    const S = 44;
    c.width = c.height = S * 2;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, S, S);
    const k = 36 / Math.max(layer.w, layer.h);
    const w = layer.kind === 'surface' ? 36 : layer.w * k;
    const h = layer.kind === 'surface' ? 36 : layer.h * k;
    const x0 = (S - w) / 2;
    const y0 = (S - h) / 2;
    const path = new Path2D();
    path.addPath(new Path2D(cutOf(layer)), new DOMMatrix([w, 0, 0, h, x0, y0]));
    ctx.fillStyle = layer.kind === 'photo' ? '#8a7fa8' : guideColor(doc.guides[layer.guide], 0.5);
    ctx.fill(path, 'evenodd');
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 0.75;
    ctx.stroke(path);
    if (layer.strokes.length) {
      ctx.save();
      ctx.clip(path, 'evenodd');
      for (const s of layer.strokes) {
        ctx.strokeStyle = guideColor(doc.guides[s.guide], 0.5);
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 3;
        ctx.beginPath();
        s.pts.forEach((p, i) => (i ? ctx.lineTo(x0 + p.x * w, y0 + p.y * h) : ctx.moveTo(x0 + p.x * w, y0 + p.y * h)));
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [layer, doc.guides]);
  return <canvas ref={ref} className="thumb" />;
}

const LAMP_COLORS: Array<[string, string]> = [
  ['#ffffff', 'Blanche'],
  ['#ffe9c4', 'Soleil'],
  ['#ffb86b', 'Bougie'],
  ['#ff8f6b', 'Couchant'],
  ['#c9d8ff', 'Lune'],
  ['#ff8ad8', 'Néon rose'],
];

/**
 * Lampe au-dessus de la feuille, en petit panneau en haut à gauche : la page reste visible.
 * On la déplace sur la carte (ou directement sur la feuille), on choisit sa couleur et sa hauteur.
 */
function LampPanel({ doc, f, onChange, onClose }: { doc: Doc; f: Format; onChange: (l: Lamp) => void; onClose: () => void }) {
  const lp = lampOf(doc);
  const ref = useRef<SVGSVGElement>(null);
  // la carte montre la page et une marge de 0,75 page tout autour
  const M = 0.75;
  const ar = f.width / f.height;
  const W = 200;
  const H = Math.round(Math.min(150, Math.max(110, W / ar)));
  const pw = Math.min(W / (1 + 2 * M), (H / (1 + 2 * M)) * ar);
  const ph = pw / ar;
  const ox = (W - pw) / 2;
  const oy = (H - ph) / 2;
  const set = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    const cl = (v: number) => Math.max(-M, Math.min(1 + M, v));
    onChange({ ...lp, x: Math.round(cl((x - ox) / pw) * 100) / 100, y: Math.round(cl((y - oy) / ph) * 100) / 100 });
  };
  const sx = ox + lp.x * pw;
  const sy = oy + lp.y * ph;
  // ombre d'une carte posée au centre, pour lire l'effet
  const cx = ox + pw / 2;
  const cy = oy + ph / 2;
  const dl = Math.hypot(sx - cx, sy - cy) || 1;
  const k = Math.min(3, dl / pw / (0.15 + lp.z * 1.6));
  const shx = (-(sx - cx) / dl) * 6 * k;
  const shy = (-(sy - cy) / dl) * 6 * k;
  return (
    <div className="lamp-panel">
      <div className="lamp-head">
        <span className="b-title">Lumière</span>
        <button className="lamp-close" onClick={onClose} aria-label="Fermer">
          ×
        </button>
      </div>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="lamp-map"
        style={{ aspectRatio: `${W} / ${H}` }}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture(e.pointerId);
          set(e);
        }}
        onPointerMove={(e) => e.buttons && set(e)}
      >
        <rect x={ox} y={oy} width={pw} height={ph} rx="2" className="lamp-page" />
        <rect x={cx - pw * 0.18 + shx} y={cy - pw * 0.18 + shy} width={pw * 0.36} height={pw * 0.36} rx="3" className="dial-shadow" />
        <rect x={cx - pw * 0.18} y={cy - pw * 0.18} width={pw * 0.36} height={pw * 0.36} rx="3" className="dial-card" />
        <line x1={cx} y1={cy} x2={sx} y2={sy} className="dial-ray" />
        <circle cx={sx} cy={sy} r={7 + lp.z * 6} className="dial-sun" style={{ fill: lp.color }} />
      </svg>
      <label className="lamp-row">
        <span>Hauteur</span>
        <input type="range" min={0} max={1} step={0.01} value={lp.z} onChange={(e) => onChange({ ...lp, z: Number(e.target.value) })} />
      </label>
      <div className="lamp-colors">
        {LAMP_COLORS.map(([c, name]) => (
          <button key={c} className={`sw ${lp.color.toLowerCase() === c ? 'on' : ''}`} style={{ background: c }} title={name} onClick={() => onChange({ ...lp, color: c })} />
        ))}
        <label className="sw custom" title="Autre couleur" style={{ background: LAMP_COLORS.some(([c]) => c === lp.color.toLowerCase()) ? undefined : lp.color }}>
          <input type="color" value={lp.color} onChange={(e) => onChange({ ...lp, color: e.target.value })} />
        </label>
      </div>
      <p className="hint">Glisse le soleil sur la carte, ou directement sur la feuille. Plus la lampe est basse, plus les ombres s'allongent et la lumière tombe vite.</p>
    </div>
  );
}

const SAVED = 'ftd-atelier-palettes';
/** Toute la palette en un seul dégradé, comme les variantes : chaque guide au milieu de sa part, les dégradés étalés dans la leur. */
function railGradient(guides: Guide[]): string {
  const n = guides.length;
  if (!n) return 'transparent';
  const stops = guides.flatMap((x, i) => {
    const cs = x.type === 'gradient' ? x.stops : [x.color];
    return cs.map((c, k) => `${c} ${(((i + (cs.length === 1 ? 0.5 : 0.15 + (0.7 * k) / (cs.length - 1))) / n) * 100).toFixed(1)}%`);
  });
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}
function PaletteBubble({
  doc,
  active,
  onPick,
  onGuides,
  onDrag,
  onDrop,
  declared,
}: {
  doc: Doc;
  active: number;
  /** Variante de couleurs que déclare la cible affichée (elle se choisit avec le format). */
  declared?: Palette;
  onPick: (i: number) => void;
  onGuides: (g: Guide[], commit?: boolean) => void;
  onDrag: (i: number | null, x: number, y: number) => void;
  onDrop: (i: number, x: number, y: number) => void;
}) {
  // glisser une couleur jusqu'à un objet : elle devient sa couleur de fond ; jusqu'à « Mes couleurs » : elle y est reprise
  const drag = useRef<{ i: number; x: number; y: number; on: boolean } | null>(null);
  const [over, setOver] = useState(false);
  const g = doc.guides[active];
  const [saved, setSaved] = useState<Array<{ name: string; guides: Guide[] }>>(() => {
    try {
      return JSON.parse(localStorage.getItem(SAVED) ?? '[]');
    } catch {
      return [];
    }
  });
  const [renaming, setRenaming] = useState<number | null>(null);
  const [lib, setLib] = useState(false);
  // la couleur en cours de modification, dans sa propre boîte de dialogue
  const [editing, setEditing] = useState<number | null>(null);
  const lastPick = useRef<{ i: number; t: number } | null>(null);
  const store = (list: typeof saved) => {
    setSaved(list);
    try {
      localStorage.setItem(SAVED, JSON.stringify(list));
    } catch {
      /* stockage indisponible */
    }
  };
  // trois origines : la variante (fixe, vient de la fiche de l'activité), mes couleurs, les couleurs venues avec un import
  const fixed = (x: Guide) => !!x.role;
  const all = doc.guides.map((x, i) => ({ x, i }));
  const variantOnes = all.filter(({ x }) => fixed(x));
  const mine = all.filter(({ x }) => !fixed(x) && !x.from);
  const sources = [...new Set(all.filter(({ x }) => !fixed(x) && x.from).map(({ x }) => x.from!))];
  /** Reprend une couleur dans « Mes couleurs » : une copie libre pour la variante, l'import perd son origine. */
  const adopt = (i: number) => {
    const x = doc.guides[i];
    if (!x) return;
    if (fixed(x)) {
      const { role: _r, ...rest } = x;
      onGuides([...doc.guides, { ...rest, name: `${x.name} (perso)` } as Guide]);
      onPick(doc.guides.length);
    } else if (x.from) {
      const { from: _f, ...rest } = x;
      onGuides(doc.guides.map((y, k) => (k === i ? (rest as Guide) : y)));
    }
  };
  const chip = ({ x, i }: { x: Guide; i: number }) => (
    <div
      key={i}
      role="button"
      tabIndex={0}
      className={`guide ${i === active ? 'on' : ''}`}
      onClick={() => {
        onPick(i);
        const now = performance.now();
        const lp = lastPick.current;
        if (lp && lp.i === i && now - lp.t < 400 && !fixed(x)) {
          setEditing(i);
          lastPick.current = null;
        } else lastPick.current = { i, t: now };
      }}
      title={fixed(x) ? `${x.name} : couleur de la variante. Glisse-la sur un objet, ou dans « Mes couleurs » pour la modifier` : `${x.name} : double toucher pour la modifier, glisse-la sur un objet pour lui donner cette couleur`}
      onPointerDown={(e) => {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        drag.current = { i, x: e.clientX, y: e.clientY, on: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        if (!d.on && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) d.on = true;
        if (!d.on) return;
        const intoMine = !!(document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('.pal-sec.mine');
        setOver(intoMine && (fixed(x) || !!x.from));
        onDrag(intoMine ? null : d.i, e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        setOver(false);
        if (!d?.on) return;
        e.preventDefault();
        if ((document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('.pal-sec.mine')) {
          onDrag(null, 0, 0);
          adopt(d.i);
        } else onDrop(d.i, e.clientX, e.clientY);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setOver(false);
        onDrag(null, 0, 0);
      }}
    >
      <span className="sw" style={{ background: swatch(x) }} />
    </div>
  );
  const editable = g && !fixed(g);
  return (
    <div className="bubble palette-bubble">
      <div className="pal-head">
        <div className="b-title">Palette</div>
        {g && (
          <span className="pal-sel" title={g.name}>
            <span className="pal-sel-name">{g.name}</span>
            {fixed(g) && <small>{ROLE_SHORT[g.role!] ?? g.role}</small>}
          </span>
        )}
        {editable && (
          <button className="pal-edit" onClick={() => setEditing(active)} title="Modifier la couleur choisie">
            <Icon name="pen" /> Modifier
          </button>
        )}
        <button className={`pal-lib-btn ${lib ? 'on' : ''}`} aria-pressed={lib} onClick={() => setLib(!lib)} title="Palettes enregistrées : sauvegarder ou recharger" aria-label="Palettes enregistrées">
          <Icon name="palettes" />
        </button>
      </div>
      {lib && (
        <div className="pal-lib">
          <div className="pal-lib-head">
            <span className="b-title">Mes palettes</span>
            <button className="pal-lib-save" onClick={() => store([...saved, { name: `Palette ${saved.length + 1}`, guides: doc.guides }])} title="Enregistrer la palette du document">
              ＋ Enregistrer
            </button>
          </div>
          {saved.length === 0 && <p className="fx-hint">Aucune palette enregistrée.</p>}
          {saved.map((p, i) => (
            <div key={i} className="saved">
              <button
                className="saved-load"
                title="Charger cette palette"
                onClick={() => {
                  // les traits gardent leur numéro de guide : on complète si la palette est plus courte
                  const guides = [...p.guides];
                  while (guides.length < doc.guides.length) guides.push(doc.guides[guides.length]!);
                  onGuides(guides);
                }}
              >
                <span className="strip" style={{ background: railGradient(p.guides) }} />
              </button>
              {renaming === i ? (
                <input
                  className="saved-name"
                  autoFocus
                  defaultValue={p.name}
                  aria-label="Nom de la palette"
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={(e) => {
                    const name = e.currentTarget.value.trim();
                    if (name) store(saved.map((x, j) => (j === i ? { ...x, name } : x)));
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') setRenaming(null);
                    e.stopPropagation();
                  }}
                />
              ) : (
                <span className="saved-label" onDoubleClick={() => setRenaming(i)}>
                  {p.name}
                </span>
              )}
              <button className="saved-pen" onClick={() => setRenaming(i)} title="Renommer" aria-label="Renommer">
                <Icon name="pen" />
              </button>
              <button className="saved-x" onClick={() => store(saved.filter((_, j) => j !== i))} aria-label="Supprimer">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      {variantOnes.length > 0 && (
        <section className="pal-sec fixed">
          <span className="pal-sec-label" title="La variante se choisit avec le format">
            Variante
            {declared && <small>{declared.name}</small>}
          </span>
          <div className="guides">{variantOnes.map(chip)}</div>
        </section>
      )}
      <section className={`pal-sec mine ${over ? 'over' : ''}`}>
        <span className="pal-sec-label">Mes couleurs</span>
        <div className="guides">
          {mine.map(chip)}
          <button
            className="guide add"
            onClick={() => {
              onGuides([...doc.guides, { name: `Couleur ${mine.length + 1}`, type: 'color', color: g?.type === 'color' ? g.color : '#6c8cd5' }]);
              onPick(doc.guides.length);
              setEditing(doc.guides.length);
            }}
            title="Ajouter une couleur ; glisse ici une couleur de la variante ou d'un import pour la reprendre"
          >
            <span className="sw plus">＋</span>
          </button>
        </div>
      </section>
      {sources.map((src) => (
        <section key={src} className="pal-sec imported">
          <span className="pal-sec-label">
            Importées<small>{src}</small>
          </span>
          <div className="guides">{all.filter(({ x }) => !fixed(x) && x.from === src).map(chip)}</div>
        </section>
      ))}
      {editing !== null && doc.guides[editing] && !fixed(doc.guides[editing]!) && (
        <ColorDialog
          guide={doc.guides[editing]!}
          onClose={() => setEditing(null)}
          onChange={(next, commit) => onGuides(doc.guides.map((x, k) => (k === editing ? next : x)), commit)}
          onRemove={
            // une couleur encore utilisée par un objet ne se retire pas : son numéro est partagé
            doc.layers.some((l) => l.guide === editing) || editing !== doc.guides.length - 1
              ? undefined
              : () => {
                  onGuides(doc.guides.slice(0, -1));
                  onPick(Math.max(0, editing - 1));
                  setEditing(null);
                }
          }
        />
      )}
    </div>
  );
}

/** Options de l'outil Transformer : style, guides de la palette, mélange. */
function LookControls({
  layer,
  guides,
  pick,
  setPick,
  guidePick,
  setGuidePick,
  onChange,
}: {
  layer: Layer;
  guides: Guide[];
  pick: boolean;
  setPick: (v: boolean) => void;
  guidePick: number | null;
  setGuidePick: (v: number | null) => void;
  onChange: (look: LookSettings | undefined, history?: boolean) => void;
}) {
  const look = layer.look;
  const def = lookOf(look?.style);
  const [, bump] = useState(0);
  const im = layer.src ? imageFor(layer.src, () => bump((n) => n + 1)) : null;
  // aperçus : chaque style appliqué à une vignette de la photo
  const thumbs = useMemo(() => {
    if (!pick || !im) return null;
    const key = (layer.src?.length ?? 0) + (layer.src?.slice(-40) ?? '');
    const base = document.createElement('canvas');
    const k = 84 / Math.max(im.naturalWidth, im.naturalHeight);
    base.width = Math.max(1, Math.round(im.naturalWidth * k));
    base.height = Math.max(1, Math.round(im.naturalHeight * k));
    base.getContext('2d')!.drawImage(im, 0, 0, base.width, base.height);
    const out: Record<string, string> = { none: base.toDataURL('image/jpeg', 0.8) };
    for (const d of LOOKS) {
      const gs = lookGuides(d, look?.style === d.id ? look : undefined).map((i) => guides[i]);
      out[d.id] = applyLook(base, `thumb${key}`, d, gs, 84).toDataURL('image/jpeg', 0.8);
    }
    // filtres dessin : posés sur la photo avec son style actuel
    const styled = def
      ? applyLook(
          base,
          `thumb${key}`,
          def,
          lookGuides(def, look).map((i) => guides[i]),
          84,
        )
      : base;
    out['draw-none'] = styled.toDataURL('image/jpeg', 0.8);
    for (const id of DRAW_FX) {
      const c = document.createElement('canvas');
      c.width = base.width;
      c.height = base.height;
      const cx = c.getContext('2d', { willReadFrequently: true })!;
      cx.drawImage(styled, 0, 0, c.width, c.height);
      const img = cx.getImageData(0, 0, c.width, c.height);
      applyPixelFx(img, [look?.draw?.id === id ? look.draw : newFx(id)], guides, 110, 0, -1);
      cx.putImageData(img, 0, 0);
      out[`draw-${id}`] = c.toDataURL('image/jpeg', 0.8);
    }
    return out;
  }, [pick, im, layer.src, guides, look]);
  const tidy = (v: LookSettings) => (v.style || v.draw ? v : undefined);
  const choose = (id: LookId | null) => {
    if (!id) onChange(tidy({ ...(look ?? { guides: [], mix: 1 }), style: undefined, guides: [] }));
    else {
      const d = lookOf(id)!;
      // les guides déjà choisis sont gardés quand le nouveau style en demande autant
      const keep = look && lookOf(look.style)?.slots.length === d.slots.length ? look.guides : d.slots.map((x) => x.def);
      onChange({ ...look, style: id, guides: keep, mix: look?.mix ?? 1 });
    }
    setPick(false);
  };
  const chooseDraw = (id: FxId | null) => {
    onChange(tidy({ ...(look ?? { guides: [], mix: 1 }), draw: id ? (look?.draw?.id === id ? look.draw : newFx(id)) : undefined }));
    setPick(false);
  };
  const draw = look?.draw;
  const drawDef = fxOf(draw?.id);
  const drawSlots = drawDef && draw ? fxGuides(drawDef, draw) : [];
  const slots = def ? lookGuides(def, look) : [];
  return (
    <>
      <button className={`btn small look-btn ${pick ? 'on' : ''}`} onClick={() => setPick(!pick)} title={`Style photo et dessin : ${[def?.name, fxOf(look?.draw?.id)?.name].filter(Boolean).join(' + ') || 'aucun'}`}>
        <Icon name="filter" />
      </button>
      {pick && (
        <div className="mode-pop look-pop">
          <div className="b-title">Style photographique</div>
          <div className="look-grid">
            {[{ id: null as LookId | null, name: 'Original' }, ...LOOKS.map((d) => ({ id: d.id as LookId | null, name: d.name }))].map((x) => (
              <button key={x.id ?? 'none'} className={`look-item ${(look?.style ?? null) === x.id ? 'on' : ''}`} onClick={() => choose(x.id)}>
                <span className="look-thumb">{thumbs && <img src={thumbs[x.id ?? 'none']} alt="" />}</span>
                <span className="look-name">{x.name}</span>
              </button>
            ))}
          </div>
          <div className="fx-group">Dessin</div>
          <div className="look-grid">
            {[{ id: null as FxId | null, name: 'Sans dessin' }, ...DRAW_FX.map((id) => ({ id: id as FxId | null, name: fxOf(id)!.name }))].map((x) => (
              <button key={x.id ?? 'none'} className={`look-item ${(draw?.id ?? null) === x.id ? 'on' : ''}`} onClick={() => chooseDraw(x.id)}>
                <span className="look-thumb">{thumbs && <img src={thumbs[`draw-${x.id ?? 'none'}`]} alt="" />}</span>
                <span className="look-name">{x.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {def &&
        look &&
        def.slots.map((sl, i) => (
          <button key={i} className={`btn small guide-btn ${guidePick === i ? 'on' : ''}`} onClick={() => setGuidePick(guidePick === i ? null : i)} title={`${sl.label} : ${guides[slots[i]!]?.name ?? ''}`}>
            <span className="dot" style={{ background: swatch(guides[slots[i]!]) }} />
          </button>
        ))}
      {def && look && guidePick !== null && def.slots[guidePick] && (
        <div className="mode-pop">
          <div className="b-title">{def.slots[guidePick]!.label}</div>
          <div className="border-guides">
            {guides.map((x, i) => (
              <button
                key={i}
                className={`sw ${slots[guidePick] === i ? 'on' : ''}`}
                title={x.name}
                style={{ background: swatch(x) }}
                onClick={() => {
                  const g = slots.slice();
                  g[guidePick] = i;
                  onChange({ ...look, guides: g });
                  setGuidePick(null);
                }}
              />
            ))}
          </div>
        </div>
      )}
      {look && def && <Knob label="Mélange" value={look.mix} onChange={(v) => onChange({ ...look, mix: Math.round(v * 100) / 100 }, false)} />}
      {look && draw && drawDef && (
        <>
          {drawDef.slots.map((sl, i) => (
            <button
              key={`d${i}`}
              className={`btn small guide-btn ${guidePick === 10 + i ? 'on' : ''}`}
              onClick={() => setGuidePick(guidePick === 10 + i ? null : 10 + i)}
              title={`${drawDef.name} · ${sl.label} : ${guides[drawSlots[i]!]?.name ?? ''}`}
            >
              <span className="dot" style={{ background: swatch(guides[drawSlots[i]!]) }} />
            </button>
          ))}
          {guidePick !== null && guidePick >= 10 && drawDef.slots[guidePick - 10] && (
            <div className="mode-pop">
              <div className="b-title">
                {drawDef.name} · {drawDef.slots[guidePick - 10]!.label}
              </div>
              <div className="border-guides">
                {guides.map((x, i) => (
                  <button
                    key={i}
                    className={`sw ${drawSlots[guidePick - 10] === i ? 'on' : ''}`}
                    title={x.name}
                    style={{ background: swatch(x) }}
                    onClick={() => {
                      const g = drawSlots.slice();
                      g[guidePick - 10] = i;
                      onChange({ ...look, draw: { ...draw, guides: g } });
                      setGuidePick(null);
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          <Knob label="Dessin" value={draw.amount} onChange={(v) => onChange({ ...look, draw: { ...draw, amount: Math.round(v * 100) / 100 } }, false)} />
        </>
      )}
    </>
  );
}

/** Aperçu d'une couche seule, avec une liste d'effets, cadrée sur sa découpe. */
export function fxPreview(l: Layer, doc: Doc, f: Format, fx: Fx[] | undefined, key: string, onImage: () => void, patch: Partial<Layer> = {}): string {
  const W = 168;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const bb = pageBounds(l, f);
  const bw = Math.max(1e-6, bb.x1 - bb.x0);
  const bh = Math.max(1e-6, bb.y1 - bb.y0);
  const s = Math.min(W / (bw * 1.25), H / (bh * 1.25));
  ctx.setTransform(s, 0, 0, s, W / 2 - ((bb.x0 + bb.x1) / 2) * s, H / 2 - ((bb.y0 + bb.y1) / 2) * s);
  drawLayers(ctx, { ...doc, layers: [{ ...l, id: `pv-${l.id}-${key}`, fx, height: 0, inner: 0, opacity: 1, visible: true, ...patch }] }, f, { scale: s, onImage });
  return c.toDataURL('image/png');
}

/** Hauteur à deux sens : au-dessus de 0 la couche se soulève, en dessous elle se creuse (ombre intérieure). */
function heightPatch(v: number): Partial<Layer> {
  return v >= 0 ? { height: v, inner: undefined } : { height: 0, inner: -v };
}

/** Outil Matière : une matière par couche, choisie sur des aperçus. */
function MaterialControls({
  layer,
  doc,
  f,
  pick,
  setPick,
  onChange,
  redraw,
}: {
  layer: Layer;
  doc: Doc;
  f: Format;
  pick: boolean;
  setPick: (v: boolean) => void;
  onChange: (m: Fx | undefined, history?: boolean) => void;
  redraw: () => void;
}) {
  const cur = layer.material;
  const def = fxOf(cur?.id);
  const [tick, bump] = useState(0);
  const thumbs = useMemo(() => {
    if (!pick) return null;
    const out: Record<string, string> = {};
    const reload = () => bump((n) => n + 1);
    out.none = fxPreview(layer, doc, f, layer.fx, 'mat-none', reload, { material: undefined });
    for (const d of MATERIALS()) out[d.id] = fxPreview(layer, doc, f, layer.fx, `mat-${d.id}`, reload, { material: cur?.id === d.id ? cur : newFx(d.id) });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick, layer, doc.guides, doc.light, doc.lamp, f, tick]);
  const tiles = [{ id: null as FxId | null, name: 'Aucune' }, ...MATERIALS().map((d) => ({ id: d.id as FxId | null, name: d.name }))];
  return (
    <>
      <button className={`btn small fx-btn ${pick ? 'on' : ''}`} onClick={() => setPick(!pick)} title={`Matière : ${def?.name ?? 'aucune'}`}>
        <Icon name="material" />
      </button>
      {pick && (
        <div className="mode-pop look-pop">
          <div className="b-title">Matière</div>
          <p className="fx-hint">La matière de la forme ou de l'image : une seule à la fois, la peinture se pose dessus.</p>
          <div className="look-grid">
            {tiles.map((x) => (
              <button
                key={x.id ?? 'none'}
                className={`look-item ${(cur?.id ?? null) === x.id ? 'on' : ''}`}
                onClick={() => {
                  onChange(x.id ? (cur?.id === x.id ? cur : newFx(x.id)) : undefined);
                  redraw();
                }}
              >
                <span className="look-thumb">{thumbs?.[x.id ?? 'none'] && <img src={thumbs[x.id ?? 'none']} alt="" />}</span>
                <span className="look-name">{x.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {cur && <Knob label="Intensité" value={cur.amount} onChange={(v) => onChange({ ...cur, amount: Math.round(v * 100) / 100 }, false)} />}
    </>
  );
}

/** Effets cumulables de l'outil Transformer, pour toutes les couches. */
function FxControls({
  layer,
  doc,
  f,
  pick,
  setPick,
  guidePick,
  setGuidePick,
  focus,
  setFocus,
  onChange,
  redraw,
  groups,
  title,
  icon,
}: {
  layer: Layer;
  doc: Doc;
  f: Format;
  pick: boolean;
  setPick: (v: boolean) => void;
  guidePick: number | null;
  setGuidePick: (v: number | null) => void;
  focus: number | null;
  setFocus: (v: number | null) => void;
  onChange: (fx: Fx[], history?: boolean) => void;
  redraw: () => void;
  /** Familles d'effets montrées par cette section (Transformations, Revêtement). */
  groups: FxGroup[];
  title: string;
  icon: string;
}) {
  const list = layer.fx ?? [];
  const inGroup = (x: Fx) => groups.includes(fxOf(x.id)?.group as FxGroup);
  const mine = list.filter(inGroup);
  const lastMine = list.reduce((k, x, i) => (inGroup(x) ? i : k), -1);
  const curIdx = focus !== null && list[focus] && inGroup(list[focus]!) ? focus : lastMine;
  const cur = curIdx >= 0 ? list[curIdx] : undefined;
  const def = fxOf(cur?.id);
  const [tick, bump] = useState(0);
  // aperçus : l'effet ajouté à ceux déjà posés (ou seul s'il y est déjà)
  const thumbs = useMemo(() => {
    if (!pick) return null;
    const out: Partial<Record<FxId, string>> = {};
    const reload = () => bump((n) => n + 1);
    for (const d of FX.filter((x) => groups.includes(x.group))) {
      const on = list.some((x) => x.id === d.id);
      out[d.id] = fxPreview(layer, doc, f, on ? list : [...list, newFx(d.id)], d.id, reload);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick, layer, doc.guides, doc.light, doc.lamp, f, tick]);
  const tap = (id: FxId) => {
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) {
      onChange([...list, newFx(id)]);
      setFocus(list.length);
    } else setFocus(i);
    redraw();
  };
  const slots = def && cur ? fxGuides(def, cur) : [];
  const patchCur = (p: Partial<Fx>, history = true) =>
    onChange(
      list.map((x, j) => (j === curIdx ? { ...x, ...p } : x)),
      history,
    );
  return (
    <>
      <button className={`btn small fx-btn ${pick ? 'on' : ''}`} onClick={() => setPick(!pick)} title={`${title}${mine.length ? ` : ${mine.map((x) => fxOf(x.id)?.name).join(', ')}` : ''}`}>
        <Icon name={icon} />
        {mine.length > 0 && <span className="fx-count">{mine.length}</span>}
      </button>
      {pick && (
        <div className="mode-pop look-pop">
          <div className="fx-head">
            <div className="b-title">{title}</div>
            {mine.length > 0 && (
              <button
                className="fx-clear"
                onClick={() => {
                  onChange(list.filter((x) => !inGroup(x)));
                  setFocus(null);
                }}
              >
                Tout enlever
              </button>
            )}
          </div>
          <p className="fx-hint">Touche pour ajouter, puis pour choisir celui à régler. La croix retire un effet. Les effets se cumulent.</p>
          {FX_GROUPS.filter(([g]) => groups.includes(g)).map(([g, gt]) => (
            <div key={g}>
              {groups.length > 1 && <div className="fx-group">{gt}</div>}
              <div className="look-grid">
                {FX.filter((d) => d.group === g).map((d) => {
                  const i = list.findIndex((x) => x.id === d.id);
                  return (
                    <button key={d.id} className={`look-item ${i >= 0 ? 'active' : ''} ${i >= 0 && i === curIdx ? 'on' : ''}`} onClick={() => tap(d.id)}>
                      <span className="look-thumb">
                        {thumbs?.[d.id] && <img src={thumbs[d.id]} alt="" />}
                        {i >= 0 && (
                          <span
                            className="fx-check"
                            role="button"
                            title="Retirer cet effet"
                            onClick={(e) => {
                              e.stopPropagation();
                              onChange(list.filter((_, j) => j !== i));
                              setFocus(null);
                            }}
                          >
                            ×
                          </span>
                        )}
                      </span>
                      <span className="look-name">{d.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {def &&
        cur &&
        def.slots.map((sl, i) => (
          <button
            key={`${cur.id}${i}`}
            className={`btn small guide-btn ${guidePick === i ? 'on' : ''}`}
            onClick={() => setGuidePick(guidePick === i ? null : i)}
            title={`${def.name} · ${sl.label} : ${doc.guides[slots[i]!]?.name ?? ''}`}
          >
            <span className="dot" style={{ background: swatch(doc.guides[slots[i]!]) }} />
          </button>
        ))}
      {def && cur && guidePick !== null && def.slots[guidePick] && (
        <div className="mode-pop">
          <div className="b-title">
            {def.name} · {def.slots[guidePick]!.label}
          </div>
          <div className="border-guides">
            {doc.guides.map((x, i) => (
              <button
                key={i}
                className={`sw ${slots[guidePick] === i ? 'on' : ''}`}
                title={x.name}
                style={{ background: swatch(x) }}
                onClick={() => {
                  const g = slots.slice();
                  g[guidePick] = i;
                  patchCur({ guides: g });
                  setGuidePick(null);
                }}
              />
            ))}
          </div>
        </div>
      )}
      {def && cur && <Knob label="Intensité" value={cur.amount} onChange={(v) => patchCur({ amount: Math.round(v * 100) / 100 }, false)} />}
    </>
  );
}

/** Pastille de couleur avec sa bulle de guides. */
function GuidePick({ title, value, guides, open, setOpen, onPick }: { title: string; value: number; guides: Guide[]; open: boolean; setOpen: (v: boolean) => void; onPick: (i: number) => void }) {
  return (
    <>
      <button className={`btn small guide-btn ${open ? 'on' : ''}`} onClick={() => setOpen(!open)} title={`${title} : ${guides[value]?.name ?? ''}`}>
        <span className="dot" style={{ background: swatch(guides[value]) }} />
      </button>
      {open && (
        <div className="mode-pop">
          <div className="b-title">{title}</div>
          <div className="border-guides">
            {guides.map((x, i) => (
              <button
                key={i}
                className={`sw ${value === i ? 'on' : ''}`}
                title={x.name}
                style={{ background: swatch(x) }}
                onClick={() => {
                  onPick(i);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** Outil Bords : type de bord et couleurs, biseau, ombre intérieure, lueur. */
function EdgeControls({ layer: l, guides, pop, setPop, patch }: { layer: Layer; guides: Guide[]; pop: string | null; setPop: (v: string | null) => void; patch: (p: Partial<Layer>, history?: boolean) => void }) {
  const toggle = (k: string) => (v: boolean) => setPop(v ? k : null);
  const bd = l.border;
  const gl = l.glow;
  return (
    <>
      <button className={`btn small ${pop === 'type' ? 'on' : ''}`} onClick={() => setPop(pop === 'type' ? null : 'type')} title={`Bord : ${BORDER_TYPES.find((x) => x[0] === (bd?.style ?? null))![1]}`}>
        <Icon name={`border-${bd?.style ?? 'none'}`} />
      </button>
      {pop === 'type' && (
        <div className="mode-pop">
          <div className="b-title">Bord</div>
          {BORDER_TYPES.map(([st, t, hint]) => (
            <button
              key={t}
              className={`row ${(bd?.style ?? null) === st ? 'on' : ''}`}
              onClick={() => {
                patch({ border: st ? { style: st, guide: bd?.guide ?? 0, guide2: bd?.guide2 ?? 1, width: bd?.width ?? 0.012 } : undefined });
                setPop(null);
              }}
            >
              <Icon name={`border-${st ?? 'none'}`} />
              <span>{t}</span>
              <small>{hint}</small>
            </button>
          ))}
        </div>
      )}
      {bd && (
        <>
          <GuidePick
            title={bd.style === 'double' ? 'Bord intérieur' : 'Couleur du bord'}
            value={bd.guide}
            guides={guides}
            open={pop === 'c1'}
            setOpen={toggle('c1')}
            onPick={(i) => patch({ border: { ...bd, guide: i } })}
          />
          {bd.style === 'double' && <GuidePick title="Bord extérieur" value={bd.guide2 ?? 1} guides={guides} open={pop === 'c2'} setOpen={toggle('c2')} onPick={(i) => patch({ border: { ...bd, guide2: i } })} />}
          <Knob label="Bord" value={Math.sqrt((bd.width - 0.002) / 0.198)} onChange={(v) => patch({ border: { ...bd, width: 0.002 + Math.round(v * v * 198) / 1000 } }, false)} />
        </>
      )}
      <Knob label="Biseau" value={l.bevel ?? 0} onChange={(v) => patch({ bevel: Math.round(v * 100) / 100 }, false)} />
      <span className="side-sep" />
      <button className={`btn small ${pop === 'glow' ? 'on' : ''}`} onClick={() => setPop(pop === 'glow' ? null : 'glow')} title={`Lueur : ${GLOW_TYPES.find((x) => x[0] === (gl?.style ?? null))![1]}`}>
        <Icon name={`glow-${gl?.style ?? 'none'}`} />
      </button>
      {pop === 'glow' && (
        <div className="mode-pop">
          <div className="b-title">Lueur</div>
          {GLOW_TYPES.map(([st, t, hint]) => (
            <button
              key={t}
              className={`row ${(gl?.style ?? null) === st ? 'on' : ''}`}
              onClick={() => {
                patch({ glow: st ? { style: st, guide: gl?.guide ?? 3, distance: gl?.distance ?? 0.1, width: gl?.width ?? 0.4 } : undefined });
                setPop(null);
              }}
            >
              <Icon name={`glow-${st ?? 'none'}`} />
              <span>{t}</span>
              <small>{hint}</small>
            </button>
          ))}
        </div>
      )}
      {gl && (
        <>
          <GuidePick title="Couleur de la lueur" value={gl.guide} guides={guides} open={pop === 'gc'} setOpen={toggle('gc')} onPick={(i) => patch({ glow: { ...gl, guide: i } })} />
          <Knob label="Distance" center value={(gl.distance + 1) / 2} onChange={(v) => patch({ glow: { ...gl, distance: Math.round((v * 2 - 1) * 100) / 100 } }, false)} />
          <Knob label="Largeur" value={gl.width} onChange={(v) => patch({ glow: { ...gl, width: Math.round(v * 100) / 100 } }, false)} />
        </>
      )}
    </>
  );
}
