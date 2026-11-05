import { FRAME_TITLES, ANCHOR_FRAMES, type AnchorFrame, type Format } from '@ftd/core';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { paintStroke, previewStamps } from './brush';
import { STAMPS, stampOf, stampSvg } from './stamps';
import { CoupePanel } from './coupe';
import { LibraryShelf, RailScroll, SHELVES, type DrawerShelf, type LibItem } from './library';
import { ensureFont, fontFamily, loadFonts, onFontReady, TEXT_PRESETS, textCut, textEpoch, type TextPreset, type TextStyle } from './text';
import { TextBar } from './textbar';
import { PaletteEditor } from './colorpicker';
import { isClosed, recognize } from './shapes';
import { blankDoc } from './blank';
import { anchorsOf, cssGradient, DEFAULT_DENSITY, DENSITY_STEPS, edgeLines, marginOf, setAnchorDensity, setAnchorMargin, type Blend, type Pin } from './model';
import { isSilhouette, SHAPE_FAMILIES, silhouetteRatio, silhouetteRings } from './silhouettes';
import { Icon } from './icons';
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
  type Pt,
  type BorderStyle,
  type GlowStyle,
  type BrushKind,
  type ShapeKind,
  type Stroke,
} from './model';
import { geomArea, insideRings, intersect, ringsOfGeom, ringsToPath, simplifyRing, splitByCut, subtract } from './cut';
import { applyPixelFx, DRAW_FX, FX, FX_GROUPS, fxGuides, fxOf, isMaterial, MATERIALS, newFx, type Fx, type FxGroup, type FxId } from './fx';
import { applyLook, lookGuides, lookOf, LOOKS, type LookId, type LookSettings } from './looks';
import { analyse, analysisSize, EdgeGrid, edgeMap, type EdgeMap, type EdgeMode } from './edges';
import {
  drawLampTint,
  lampOf,
  levelOf,
  renderOrder,
  cutOf,
  holdPins,
  imageFor,
  localBounds,
  localToPage,
  pageBounds,
  pageToLocal,
  pinsOf,
  drawChecker,
  drawLayers,
  forgetPaint,
  localRings,
  maskPath2D,
  maskRings,
  paintTarget,
  tracePath,
} from './scene';

type Tool = 'cut' | 'paint' | 'stamp' | 'filter' | 'transform' | 'material' | 'coat' | 'edge' | 'move';
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
type Bubble = 'add' | 'layers' | 'palette' | 'light' | 'format' | 'anchor' | null;
type View = { zoom: number; rot: number; px: number; py: number };

const STORE = 'ftd-atelier-doc-v2';
const TOP = 52;
/** Rayon d'attraction des ancrages, en pixels écran. */
const MAGNET = 30;
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
export const swatch = (g: Guide | undefined) => (g?.type === 'gradient' ? cssGradient(g.stops, g.blend) : guideColor(g));
const EDGE_MODES: Array<[EdgeMode, string, string]> = [
  ['contrast', 'Contraste', 'bords de lumière'],
  ['color', 'Couleur', 'bords de teinte'],
  ['both', 'Les deux', 'lumière et teinte'],
];

const LINK_FX_MS = 900;

function load(): Doc {
  try {
    const s = localStorage.getItem(STORE);
    if (s) {
      const d = JSON.parse(s) as Doc;
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
      return d;
    }
  } catch {
    /* stockage indisponible */
  }
  return blankDoc();
}

export function App() {
  const [doc, setDoc] = useState<Doc>(load);
  const docRef = useRef(doc);
  docRef.current = doc;
  const past = useRef<string[]>([]);
  const future = useRef<string[]>([]);
  const [, force] = useState(0);
  const redraw = useCallback(() => force((n) => n + 1), []);
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
    past.current.push(JSON.stringify(docRef.current));
    if (past.current.length > 60) past.current.shift();
    future.current = [];
    setDoc((d) => fn(structuredClone(d)));
  }, []);
  const undo = useCallback(() => {
    const s = past.current.pop();
    if (!s) return;
    future.current.push(JSON.stringify(docRef.current));
    forgetPaint();
    setDoc(JSON.parse(s));
    setToast('Annulé');
  }, []);
  const redo = useCallback(() => {
    const s = future.current.pop();
    if (!s) return;
    past.current.push(JSON.stringify(docRef.current));
    forgetPaint();
    setDoc(JSON.parse(s));
    setToast('Rétabli');
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(doc));
    } catch {
      /* photo trop lourde pour le stockage local : on garde en mémoire */
    }
  }, [doc]);

  const [tool, setToolState] = useState<Tool>('paint');
  // Modifier rouvre la dernière section utilisée
  const lastEdit = useRef<EditTool>('transform');
  const setTool = (t: Tool) => {
    if (isEdit(t)) lastEdit.current = t;
    setToolState(t);
  };
  const [bubble, setBubble] = useState<Bubble>(null);
  const [frozenOrder, setFrozenOrder] = useState<string[] | null>(null);
  // astuces (textes d'aide, sous-titres des menus, bandeau d'état) : masquables pour gagner de la place
  const [tips, setTipsState] = useState(() => {
    try {
      return localStorage.getItem('ftd-atelier-tips') !== 'off';
    } catch {
      return true;
    }
  });
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
  const [textEditing, setTextEditing] = useState(false);
  const [size, setSize] = useState(0.05);
  const [opacity, setOpacity] = useState(0.85);
  /** Outil Tampons : motif, taille, opacité et dilution de l'encre. */
  const [stampId, setStampId] = useState('etoile');
  const [stampSize, setStampSize] = useState(0.08);
  const [dilution, setDilution] = useState(0.15);
  /** Rotation du tampon (radians), fixée au curseur : Safari ne transmet pas la rotation du crayon. */
  const [stampRot, setStampRot] = useState(0);
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
  const [burnChar, setBurnChar] = useState(0.3);
  const [branchCore, setBranchCore] = useState(1);
  const [burnHole, setBurnHole] = useState(true);
  const [stampPick, setStampPick] = useState(false);
  /** Survol du stylet (ou de la souris) : un repère montre où la pointe touchera. */
  const hoverRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ zoom: 1, rot: 0, px: 0, py: 0 });
  const [rendu, setRendu] = useState(false);
  const [magnet, setMagnet] = useState(true);
  /** Détection des contours de l'image sélectionnée : critère et seuil (0..1). */
  const [edgeMode, setEdgeMode] = useState<EdgeMode>('both');
  const [edgeThreshold, setEdgeThreshold] = useState(0.35);
  const [edgeSmooth, setEdgeSmooth] = useState(0.4);
  const [modePick, setModePick] = useState(false);
  /** Bulle ouverte de l'outil Bords. */
  const [epop, setEpop] = useState<string | null>(null);
  const [brushKind, setBrushKind] = useState<BrushKind>('aquarelle');
  const [brushPick, setBrushPick] = useState(false);
  /** Barre latérale : réglages sur deux colonnes quand une seule ne tient pas dans la hauteur. */
  const sideRef = useRef<HTMLElement>(null);
  const paramsRef = useRef<HTMLDivElement>(null);
  const [sideTwo, setSideTwo] = useState(false);
  useLayoutEffect(() => {
    const fit = () => {
      const side = sideRef.current;
      const pr = paramsRef.current;
      if (!side || !pr) return;
      const items = [...pr.children].filter((c) => getComputedStyle(c).position !== 'absolute') as HTMLElement[];
      // hauteur sur une seule colonne, curseurs à leur taille naturelle (indépendante du mode courant)
      const vs = Math.max(64, Math.min(100, (window.innerHeight - 640) / 2));
      const one = items.reduce((h, c) => h + (c.classList.contains('vslider') ? vs : c.offsetHeight), 0) + 8 * Math.max(0, items.length - 1);
      const rest = side.offsetHeight - pr.offsetHeight;
      // place libre entre la barre d'outils et le bas de l'écran
      const tools = document.querySelector('.side.tools-bar')?.getBoundingClientRect();
      const room = window.innerHeight - (tools ? tools.bottom + 10 : 380) - 12;
      const two = items.length > 2 && one + rest > room;
      if (two !== sideTwo) setSideTwo(two);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  });
  /** Forme de la brosse et son angle (radians), auquel s'ajoute la rotation du crayon. */
  const [brushTip, setBrushTip] = useState<'round' | 'flat' | 'triangle'>('round');
  const [brushRot, setBrushRot] = useState(0);
  /** Ramures : nombre de ramifications et convergence. */
  const [branches, setBranches] = useState(6);
  const [converge, setConverge] = useState(0.3);
  const growTimer = useRef(0);
  /** Couleur glissée depuis la palette (position écran). */
  const [dragGuide, setDragGuide] = useState<{ i: number; x: number; y: number } | null>(null);
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
  setAnchorMargin(doc.margin);
  /** Repères toujours visibles, et leur couleur : préférence de l'atelier, gardée d'une séance à l'autre. */
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
    const p = matrix.inverse().transformPoint(new DOMPoint(cx, cy));
    return { x: p.x, y: p.y };
  };
  const scale = fit * view.zoom;

  const lastTap = useRef<{ t: number; id?: string; x: number; y: number } | null>(null);
  const dotAt = useRef(0);
  // --- état des gestes en cours ---
  const live = useRef<{
    kind: 'paint' | 'cut' | 'move' | 'resize' | 'rotate' | 'pivot' | 'view' | null;
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
    drawn?: number;
    lasso?: Pt[];
    /** Ciseaux partis de l'extérieur de la forme choisie : un chemin qui la sépare en morceaux. */
    path?: boolean;
    start?: { x: number; y: number };
    orig?: Layer;
    /** Objets solidaires de la couche tenue, dans leur état de départ. */
    mates?: Layer[];
    last?: { x: number; y: number; t: number; p: number };
    snap?: { x: number; y: number } | null;
    /** Contours aimantés (unités du format) et indices des points aimantés. */
    grid?: EdgeGrid | null;
    snapped?: number[];
    /** Mode ligne : le tracé est figé jusqu'à cet indice, une ligne droite part de là jusqu'à la pointe. */
    lineAt?: number;
    /** Forme reconnue (rond, carré…) : le contour est figé jusqu'au lâcher. */
    shaped?: boolean;
  }>({ kind: null });
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
  const gesture = useRef<{ view: View; c: { x: number; y: number }; d: number; a: number; next?: View } | null>(null);
  const tap = useRef<{ n: number; t0: number; moved: boolean } | null>(null);
  const lampDrag = useRef<number | null>(null);
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
    if (gesture.current?.next) previewView(gesture.current.next);
    else previewView(null);
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
      wet: L.kind === 'paint' && L.wet && L.layer ? { id: L.layer, canvas: L.wet } : undefined,
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
      if (tool === 'move' && L.kind !== 'move') {
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
    if (tool === 'cut' && magnet && sel && (L.kind === null || L.kind === 'cut')) {
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
    // ancrages pendant un déplacement, et tant que le réglage d'ancrage est ouvert
    if (L.kind === 'move' || bubble === 'anchor' || guidesOn.on) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = guidesOn.color;
      // la marge des repères : un cadre pointillé, dedans ou autour de la page
      if (doc.margin) {
        const { mx, my } = marginOf(f);
        ctx.strokeStyle = guidesOn.color;
        ctx.lineWidth = 1.2 * px;
        ctx.setLineDash([6 * px, 5 * px]);
        ctx.strokeRect(mx * f.width, my * f.height, f.width * (1 - 2 * mx), f.height * (1 - 2 * my));
        ctx.setLineDash([]);
      }
      for (const a of anchorsOf(doc.frame, f)) {
        ctx.beginPath();
        ctx.arc(a.x * f.width, a.y * f.height, 3.5 * px, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      if (L.snap) {
        ctx.strokeStyle = '#7a5cff';
        ctx.lineWidth = 2.5 * px;
        ctx.beginPath();
        ctx.arc(L.snap.x, L.snap.y, 11 * px, 0, Math.PI * 2);
        ctx.stroke();
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
      if (l.visible && insideRings(maskRings(l, f), x, y)) return l;
    }
    return null;
  };
  const toLocal = (l: Layer, x: number, y: number) => pageToLocal(l, f, x, y);
  /** Copie de l'élément sélectionné (et de ses objets solidaires), décalée, posée juste au-dessus. */
  const duplicate = () => {
    const me = doc.layers.find((x) => x.id === selected);
    if (!me || me.kind === 'surface') return;
    const group = [me, ...matesOf(doc, me)];
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
      const b = layerBox(l, f);
      const q = pageToLocal(l, f, b.cx - l.dx * f.width, b.cy - l.dy * f.height);
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
      out.set(m.id, { ...m, w: m.w * k, h: m.h * k, rot: dr ? Math.atan2(Math.sin((m.rot ?? 0) + dr), Math.cos((m.rot ?? 0) + dr)) : m.rot, anchor: a.anchor, dx: a.dx, dy: a.dy, pins: undefined });
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
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
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
    setBrushPick(false);
    setStampPick(false);
    const touches = [...pointers.current.values()].filter((p) => p.type === 'touch');
    if (e.pointerType === 'touch' && touches.length >= 2) {
      // plusieurs doigts : on annule le geste à un doigt et on manipule la vue
      stopHold();
      stopCutStill();
      if (live.current.kind === 'move' || live.current.kind === 'resize') {
        const o = live.current.orig!;
        const back = new Map([o, ...(live.current.mates ?? [])].map((x) => [x.id, x]));
        setDoc((d) => ({ ...d, layers: d.layers.map((l) => back.get(l.id) ?? l) }));
        past.current.pop();
      }
      live.current = { kind: 'view' };
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
    // le doigt déplace, le stylet (ou la souris) utilise l'outil
    const t: Tool = e.pointerType === 'touch' ? 'move' : tool;
    const sel = doc.layers.find((l) => l.id === selected);

    // double toucher (ou double clic) sur une forme ou une image : on passe en Disposer
    {
      const now = performance.now();
      const hit = layerAt(p.x, p.y);
      const lt = lastTap.current;
      if (hit && hit.kind !== 'surface' && lt && lt.id === hit.id && now - lt.t < 350 && Math.hypot(p.x - lt.x, p.y - lt.y) * scale < 24) {
        lastTap.current = null;
        live.current = { kind: null };
        // le premier toucher a pu poser un point de peinture : on le retire
        if (now - dotAt.current < 400) undo();
        setTool('move');
        setSelected(hit.id);
        if (hit.kind === 'text') setTextEditing(true);
        else setToast(`« ${hit.name} » : Disposer`);
        redraw();
        return;
      }
      lastTap.current = { t: now, id: hit?.id, x: p.x, y: p.y };
    }

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
          live.current = { kind: 'rotate', layer: sel.id, start: p, orig: structuredClone(sel), mates: structuredClone(matesOf(doc, sel)) };
          return;
        }
        for (const c of h.corners)
          if (near(c.q)) {
            update((d) => d);
            live.current = { kind: 'resize', layer: sel.id, start: p, orig: structuredClone(sel), opp: c.opp, centered: centeredOnAnchor(sel), mates: structuredClone(matesOf(doc, sel)) };
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
      live.current = { kind: 'move', layer: l.id, start: p, orig: structuredClone(l), snap: null, mates: structuredClone(matesOf(doc, l)) };
      stopHold();
      hold.current = { x: e.clientX, y: e.clientY, timer: window.setTimeout(() => ((hold.current = null), solidarize(l.id, p)), 600) };
      return;
    }
    if (isEdit(t)) {
      // Transformer : toucher une photo la sélectionne
      const l = layerAt(p.x, p.y);
      setSelected(l?.id ?? null);
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
    const target = sel && insideRings(maskRings(sel, f), p.x, p.y) ? sel : layerAt(p.x, p.y);
    if (!target) return;
    if (target.id !== selected) setSelected(target.id);
    const tg = paintTarget(target, f, scale * dpr);
    const wet = document.createElement('canvas');
    wet.width = tg.pw;
    wet.height = tg.ph;
    const pr = pressure(e, null);
    const q = toLocal(target, p.x, p.y);
    live.current = {
      kind: 'paint',
      layer: target.id,
      wet,
      drawn: 0,
      last: { x: e.clientX, y: e.clientY, t: performance.now(), p: pr },
      stroke:
        t === 'stamp'
          ? { brush: 'stamp', stamp: stampId, dilution, wipe: true, guide, size: stampSize, opacity: 0.95, seed: Math.floor(Math.random() * 1e9), pts: [{ ...q, p: pr, ...stampAngle(e, target) }] }
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
                  pts: [{ ...q, p: pr, ...(tipOn(brushKind) ? { r: tipAngle(e, target) } : {}) }],
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
        paintStroke(wx, L0.stroke, doc.guides, tg);
        redraw();
        if (L0.stroke.grow < 1) growTimer.current = requestAnimationFrame(tick);
      };
      cancelAnimationFrame(growTimer.current);
      growTimer.current = requestAnimationFrame(tick);
    }
    // le tampon s'imprime dès le contact
    if (t === 'stamp') {
      paintStroke(wet.getContext('2d')!, live.current.stroke!, doc.guides, tg);
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
    }
    return out;
  };

  /** Repère de survol : un rond de la taille du pinceau, ou l'empreinte du tampon. */
  const showHover = (e: React.PointerEvent) => {
    const el = hoverRef.current;
    if (!el) return;
    const painting = tool === 'paint' || tool === 'stamp';
    if (!painting || rendu || (e.pointerType !== 'pen' && e.pointerType !== 'mouse')) return hideHover();
    const m = Math.min(f.width, f.height) * scale;
    const d = tool === 'stamp' ? stampSize * 2 * m : size * 2 * m;
    el.style.display = 'block';
    const D = Math.max(6, d);
    // brosse plate ou triangle : la silhouette de la touche, tournée comme elle peindra
    const tip = tool === 'paint' && tipOn(brushKind) ? brushTip : 'round';
    el.dataset.tip = tip;
    el.style.width = `${D}px`;
    el.style.height = `${tip === 'flat' ? Math.max(3, D * 0.3) : D}px`;
    const ang = tool === 'stamp' ? stampScreenAngle(e) : tip !== 'round' ? brushRot + penTwist(e) : view.rot;
    el.style.transform = `translate(${e.clientX - D / 2}px, ${e.clientY - (tip === 'flat' ? Math.max(3, D * 0.3) : D) / 2}px) rotate(${ang}rad)`;
  };
  const hideHover = () => {
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
    const pt = pointers.current.get(e.pointerId);
    // pointe au-dessus de l'écran, sans contact : on montre seulement où elle touchera
    if (!pt) return showHover(e);
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
    if (L.kind === 'paint' && L.stroke && L.layer) {
      const l = doc.layers.find((x) => x.id === L.layer)!;
      const events = (e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]) as PointerEvent[];
      const stamping = L.stroke.brush === 'stamp';
      const branching = L.stroke.brush === 'branch';
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
        if (stamping ? dist < L.stroke.size * (L.stroke.wipe ? 0.05 : 2.2) : dist * Math.min(f.width, f.height) * scale < 1.5) continue;
        L.stroke.pts.push({ ...loc, p: pr, ...(stamping && !L.stroke.wipe ? stampAngle(ev, l) : L.stroke.tip ? { r: tipAngle(ev, l) } : {}) });
      }
      const tg = paintTarget(l, f, scale * dpr);
      if (stamping || branching) {
        const wx = L.wet!.getContext('2d')!;
        wx.clearRect(0, 0, L.wet!.width, L.wet!.height);
        paintStroke(wx, L.stroke, doc.guides, tg);
      } else L.drawn = previewStamps(L.wet!.getContext('2d')!, L.stroke, doc.guides, tg, L.drawn ?? 0);
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
      const tr = trashRef.current?.getBoundingClientRect();
      const hot = !!tr && e.clientX > tr.left - 14 && e.clientX < tr.right + 14 && e.clientY > tr.top - 14 && e.clientY < tr.bottom + 14;
      if (hot !== trashHot) setTrashHot(hot);
      const o = L.orig;
      const b = layerBox(o, f);
      let cx = b.cx + p.x - L.start.x;
      let cy = b.cy + p.y - L.start.y;
      // aimant : le centre est attiré par l'ancrage le plus proche
      const near = anchorFor(doc.frame, f, cx, cy);
      const ax = near.at.x * f.width;
      const ay = near.at.y * f.height;
      L.snap = Math.hypot(ax - cx, ay - cy) * scale < MAGNET ? { x: ax, y: ay } : null;
      if (L.snap) [cx, cy] = [ax, ay];
      // bords de la découpe aimantés sur les bords de la page
      const bb = pageBounds(o, f);
      const tol = MAGNET / scale;
      const ex = { l: bb.x0 - b.cx, r: bb.x1 - b.cx, t: bb.y0 - b.cy, b: bb.y1 - b.cy };
      const pins: NonNullable<Layer['pins']> = {};
      // bords de page, puis lignes de marge : le plus proche l'emporte
      const lines = edgeLines(f);
      const near1 = (side: 'left' | 'right' | 'top' | 'bottom', v: number) => {
        let best: { d: number; pin: Pin; at: number } | null = null;
        for (const [pin, at] of [[true, lines.page[side]], ...(lines.margin ? [['margin', lines.margin[side]]] : [])] as Array<[Pin, number]>) {
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
      setDoc((d) => ({ ...d, layers: d.layers.map((x) => (x.id === o.id ? { ...x, anchor: a.anchor, dx: L.snap ? 0 : a.dx, dy: L.snap ? 0 : a.dy, pins: L.pins } : (carried.get(x.id) ?? x))) }));
    } else if (L.kind === 'resize' && L.orig && L.start && L.opp) {
      // agrandir depuis un coin : le coin opposé reste en place
      const o = L.orig;
      const b = layerBox(o, f);
      // posé par son centre sur son ancrage : il grandit autour de ce centre, sinon le coin opposé reste en place
      const O = L.centered ? { x: b.cx, y: b.cy } : localToPage(o, f, L.opp.u, L.opp.v);
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
        if (kk > 0.05 && Math.abs(now - page) * scale < MAGNET && (best === null || Math.abs(kk - k) < Math.abs(best - k))) best = kk;
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
        setDoc((d) => ({ ...d, layers: d.layers.map((x) => (x.id === o.id ? { ...x, w: o.w * kx, h: o.h * ky, anchor: a.anchor, dx: a.dx, dy: a.dy } : x)) }));
        return;
      }
      const cx = O.x + (b.cx - O.x) * k;
      const cy = O.y + (b.cy - O.y) * k;
      const a = anchorFor(doc.frame, f, cx, cy);
      const carried = carryMates(L.mates, O, k, 0, 0, 0);
      setDoc((d) => ({ ...d, layers: d.layers.map((x) => (x.id === o.id ? { ...x, w: o.w * k, h: o.h * k, anchor: a.anchor, dx: a.dx, dy: a.dy } : (carried.get(x.id) ?? x))) }));
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
      if (Math.abs(r - q) < (3 * Math.PI) / 180) r = q;
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
      setDoc((d) => ({ ...d, layers: d.layers.map((x) => (x.id === o.id ? { ...x, rot: r, anchor: a.anchor, dx: a.dx, dy: a.dy } : (carried.get(x.id) ?? x))) }));
    }
  };

  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    stopHold();
    if (lampDrag.current === e.pointerId) {
      lampDrag.current = null;
      return;
    }
    const remaining = pointers.current.size;
    const L = live.current;
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
        if (next) setView(next);
      }
      return;
    }
    if (remaining > 0) return;
    tap.current = null;
    if (L.kind === 'paint' && L.stroke && L.layer) {
      const s = L.stroke;
      const id = L.layer;
      live.current = { kind: null };
      if (s.pts.length === 1 && s.brush !== 'stamp') s.pts.push({ ...s.pts[0]!, x: s.pts[0]!.x + 0.001 });
      dotAt.current = s.pts.length <= 3 ? performance.now() : 0;
      update((d) => ({ ...d, layers: d.layers.map((l) => (l.id === id ? { ...l, strokes: [...l.strokes, s] } : l)) }));
      return;
    }
    if (L.kind === 'cut' && L.lasso) {
      live.current = { kind: null };
      stopCutStill();
      // en mode ligne, les segments droits gardent leurs extrémités exactes
      const pts = L.shaped ? L.lasso : L.lineAt !== undefined ? [...simplify(L.lasso.slice(0, Math.max(1, L.lineAt)), 1.2 / scale), L.lasso[L.lasso.length - 1]!] : simplify(L.lasso, 1.2 / scale);
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
    setToast(`« ${sel.name} » séparée en ${parts.length} morceaux : déplace-les avec Disposer`);
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
      const rest = subtract(shape, [local]);
      if (geomArea(rest) * b.w * b.h < lassoArea * 1e-4) {
        setToast(`Le tracé englobe toute « ${l.name} »`);
        return redraw();
      }
      const eps = 0.6 / (scale * Math.max(b.w, b.h));
      const pieceCut = ringsToPath(ringsOfGeom(piece), eps);
      const restCut = ringsToPath(ringsOfGeom(rest), eps);
      const m = Math.min(f.width, f.height);
      const morceau: Layer = {
        ...structuredClone(l),
        id: uid(),
        name: `${l.name} · morceau`,
        cut: pieceCut,
        height: l.height,
        // légèrement décalé, comme un morceau qu'on vient de détacher
        dx: l.dx + (0.012 * m) / f.width,
        dy: l.dy + (0.012 * m) / f.height,
      };
      update((d) => {
        const layers = d.layers.map((x) => (x.id === l.id ? { ...x, cut: restCut } : x));
        layers.splice(layers.findIndex((x) => x.id === l.id) + 1, 0, morceau);
        return { ...d, layers };
      });
      setSelected(morceau.id);
      setToast(`« ${l.name} » découpée : le morceau est posé dessus`);
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
      visible: true,
      strokes: [],
    };
    update((d) => ({ ...d, layers: [...d.layers, layer] }));
    setSelected(layer.id);
    setTool('move');
    setBubble(null);
  };
  /** Pose un texte dans le style choisi, prêt à être réécrit. */
  const addText = async (p: TextPreset) => {
    await loadFonts();
    await ensureFont(p.style.font);
    const t: TextStyle = { content: p.sample, ...p.style };
    const c = textCut(t);
    // corps de départ : une ligne haute d'un dixième du petit côté
    const h = 0.1;
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
    setTool('move');
    setBubble(null);
    setTextEditing(true);
  };
  /** Change la typographie d'un texte en gardant son corps : la boîte suit les lettres. */
  const patchText = (l: Layer, next: Partial<TextStyle>, history: boolean) => {
    if (!l.text) return;
    const t = { ...l.text, ...next };
    const [a, b] = [textCut(l.text), textCut(t)];
    const k = l.h / (a.bh || 1);
    patchLayer(l.id, { text: t, cut: undefined, w: Math.max(0.01, b.bw * k), h: Math.max(0.01, b.bh * k) }, history);
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
    const fn = (d: Doc) => ({ ...d, layers: d.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
    if (history) update(fn);
    else setDoc(fn);
  };
  const moveLayer = (id: string, step: number) =>
    update((d) => {
      // l'ordre suit la hauteur : on n'échange qu'avec la voisine de même hauteur
      const ord = renderOrder(d.layers);
      const k = ord.findIndex((l) => l.id === id);
      const me = ord[k];
      const other = ord[k + step];
      if (!me || !other || other.kind === 'surface' || levelOf(other) !== levelOf(me)) return d;
      const layers = [...d.layers];
      const i = layers.indexOf(me);
      const j = layers.indexOf(other);
      [layers[i], layers[j]] = [layers[j]!, layers[i]!];
      return { ...d, layers };
    });

  // raccourcis clavier (ordinateur)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
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
      else if (e.key === 'v') setTool('move');
      else if (e.key === 'Escape') {
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

  return (
    <div className={`atelier ${rendu ? 'rendu' : ''} ${tips ? '' : 'no-tips'}`}>
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
        onWheel={(e) => {
          // ordinateur : molette = zoom, Maj + molette = rotation
          if (e.shiftKey) setView((v) => ({ ...v, rot: v.rot + e.deltaY * 0.002 }));
          else setView((v) => ({ ...v, zoom: Math.max(0.3, Math.min(6, v.zoom * Math.exp(-e.deltaY * 0.0015))) }));
        }}
      />
      <div
        ref={hoverRef}
        className={`pen-hover ${tool === 'stamp' ? 'stamp' : ''}`}
        style={tool === 'stamp' ? { backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(stampSvg(stampOf(stampId), guideColor(doc.guides[guide], 0.5)))}")` } : undefined}
      />

      {!rendu && (
        <>
          <header className="bar">
            <div className="bar-left">
              <span className="brand">Atelier</span>
              <button className={`chip ${bubble === 'format' ? 'on' : ''}`} onClick={() => setBubble(bubble === 'format' ? null : 'format')}>
                <FormatGlyph w={f.width} h={f.height} /> <span className="chip-label">{f.title}</span>
              </button>
              <button className={`btn ${bubble === 'anchor' ? 'on' : ''}`} onClick={() => setBubble(bubble === 'anchor' ? null : 'anchor')} title="Aide au positionnement : repères, densité, marge">
                <Icon name="anchor" />
              </button>
            </div>
            <div className="bar-right">
              <button className={`btn ${bubble === 'layers' ? 'on' : ''}`} onClick={() => setBubble(bubble === 'layers' ? null : 'layers')} title="Couches">
                <Icon name="layers" />
              </button>
              <button className={`btn ${bubble === 'light' ? 'on' : ''}`} onClick={() => setBubble(bubble === 'light' ? null : 'light')} title="Lumière">
                <Icon name="sun" />
              </button>
              <button className={`btn guide-btn ${bubble === 'palette' ? 'on' : ''}`} onClick={() => setBubble(bubble === 'palette' ? null : 'palette')} title="Palette de guides">
                <span className="dot" style={{ background: swatch(g) }} />
              </button>
              <span className="sep" />
              <button
                className={`btn ${penRoll ? 'on' : ''}`}
                onClick={() => setPenRoll(!penRoll)}
                title={penRoll ? 'Rotation du stylet : tourner le crayon tourne les tampons (désactiver)' : 'Rotation du stylet ignorée (activer)'}
              >
                <Icon name="pen-roll" />
              </button>
              <button
                className={`btn ${penTilt ? 'on' : ''}`}
                onClick={() => setPenTilt(!penTilt)}
                title={penTilt ? 'Inclinaison du stylet : les tampons se mettent en perspective (désactiver)' : 'Inclinaison du stylet ignorée (activer la perspective des tampons)'}
              >
                <Icon name="pen-tilt" />
              </button>
              <button className={`btn ${tips ? 'on' : ''}`} onClick={() => setTips(!tips)} title={tips ? 'Masquer les astuces' : 'Afficher les astuces'}>
                <Icon name="tips" />
              </button>
              <button
                className={`btn ${guidesOn.on ? 'on' : ''}`}
                aria-pressed={guidesOn.on}
                onClick={() => setGuidesOn({ ...guidesOn, on: !guidesOn.on })}
                title={guidesOn.on ? 'Masquer les repères' : 'Afficher les repères en permanence'}
              >
                <Icon name="guides" />
              </button>
              <button className="btn fit" onClick={() => setView({ zoom: 1, rot: 0, px: 0, py: 0 })} title="Recadrer la vue" disabled={view.zoom === 1 && !view.rot && !view.px && !view.py}>
                <Icon name="fit" />
              </button>
              <button className="btn" onClick={() => setRendu(true)} title="Rendu final">
                <Icon name="eye" />
              </button>
            </div>
          </header>

          <aside className="side tools-bar">
            <button className={`btn small ${bubble === 'add' ? 'on' : ''}`} onClick={() => setBubble(bubble === 'add' ? null : 'add')} title="Ajouter une couche">
              <Icon name="plus" />
            </button>
            <span className="side-sep" />
            <button className={`btn small ${tool === 'cut' ? 'on' : ''}`} onClick={() => setTool('cut')} title="Découper (C) : trace un contour au stylet">
              <Icon name="scissors" />
            </button>
            <button className={`btn small ${tool === 'paint' ? 'on' : ''}`} onClick={() => setTool('paint')} title="Peindre (B) : aquarelle, acrylique, pistolet, paillettes, poils">
              <Icon name="brush" />
            </button>
            <button className={`btn small ${tool === 'stamp' ? 'on' : ''}`} onClick={() => setTool('stamp')} title="Tampons (S) : motifs à la couleur courante, dilution et rotation">
              <Icon name="stamp" />
            </button>
            <button className={`btn small ${isEdit(tool) ? 'on' : ''}`} onClick={() => setTool(lastEdit.current)} title="Modifier l'objet (T) : filtres, transformations, matière, revêtement, bords">
              <Icon name="transform" />
            </button>
            <button className={`btn small ${tool === 'move' ? 'on' : ''}`} onClick={() => setTool('move')} title="Disposer (V) : déplacer, agrandir, ancrer">
              <Icon name="move" />
            </button>
          </aside>

          {tool === 'move' && sel?.kind === 'text' && sel.text && !bubble && <TextBar layer={sel} editing={textEditing} setEditing={setTextEditing} onChange={(next, h) => patchText(sel, next, h)} />}

          {isEdit(tool) && sel && (
            <CoupePanel
              layer={sel}
              doc={doc}
              f={f}
              patch={(p, h) => patchLayer(sel.id, p, h)}
              onClose={() => setTool('move')}
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
            <div ref={paramsRef} className={`side-params ${sideTwo ? 'two' : ''}`}>
              {tool === 'paint' && (
                <>
                  <button className={`btn small ${brushPick ? 'on' : ''}`} onClick={() => setBrushPick(!brushPick)} title={`Pinceau : ${BRUSHES.find((x) => x[0] === brushKind)![1]}`}>
                    <Icon name={`brush-${brushKind}`} />
                  </button>
                  {brushPick && (
                    <div className="mode-pop wide">
                      <div className="b-title">Pinceau</div>
                      {BRUSHES.map(([k, t, hint]) => (
                        <button
                          key={k}
                          className={`row ${brushKind === k ? 'on' : ''}`}
                          onClick={() => {
                            setBrushKind(k);
                            setBrushPick(false);
                          }}
                        >
                          <Icon name={`brush-${k}`} />
                          <span>{t}</span>
                          <small>{hint}</small>
                        </button>
                      ))}
                    </div>
                  )}
                  <VSlider label="Taille" value={(size - 0.01) / 0.14} onChange={(v) => setSize(0.01 + v * 0.14)} />
                  <VSlider label="Opacité" value={opacity} onChange={(v) => setOpacity(Math.max(0.05, v))} />
                  {tipOn(brushKind) && brushTip !== 'round' && <Dial label="Rotation de la brosse" value={brushRot} onChange={setBrushRot} />}
                  {tipOn(brushKind) && (
                    <button
                      className="btn small"
                      onClick={() => setBrushTip(brushTip === 'round' ? 'flat' : brushTip === 'flat' ? 'triangle' : 'round')}
                      title={`Forme de la brosse : ${brushTip === 'round' ? 'ronde' : brushTip === 'flat' ? 'plate' : 'triangle'} (toucher pour changer)`}
                    >
                      <Icon name={`tip-${brushTip}`} />
                    </button>
                  )}
                  {brushKind === 'branch' && (
                    <>
                      <VSlider label="Ramifications" value={(branches - 1) / 15} onChange={(v) => setBranches(1 + Math.round(v * 15))} />
                      <VSlider label="Chaos" value={converge} onChange={(v) => setConverge(Math.round(v * 100) / 100)} />
                      <VSlider label="Noyau : taille de la tache de couleur au départ" value={branchCore} onChange={(v) => setBranchCore(Math.round(v * 100) / 100)} />
                    </>
                  )}
                  {brushKind === 'burn' && (
                    <>
                      <VSlider label="Roussi : largeur de la marge, qui parcourt le dégradé du guide" value={burnChar} onChange={(v) => setBurnChar(Math.max(0.02, Math.round(v * 100) / 100))} />
                      <button className={`btn small ${burnHole ? 'on' : ''}`} onClick={() => setBurnHole(!burnHole)} title={burnHole ? 'Trous : la brûlure perce la couche' : 'Sans trou : la brûlure teinte seulement'}>
                        <Icon name="burn-hole" />
                      </button>
                    </>
                  )}
                </>
              )}
              {tool === 'stamp' && (
                <>
                  <button
                    className={`btn small stamp-btn ${stampPick ? 'on' : ''}`}
                    onClick={() => setStampPick(!stampPick)}
                    title={`Motif : ${stampOf(stampId).name}`}
                    dangerouslySetInnerHTML={{ __html: stampSvg(stampOf(stampId)) }}
                  />
                  {stampPick && (
                    <div className="mode-pop wide stamp-pop">
                      <div className="b-title">Tampons</div>
                      <div className="stamp-grid">
                        {STAMPS.map((x) => (
                          <button
                            key={x.id}
                            className={stampId === x.id ? 'on' : ''}
                            onClick={() => {
                              setStampId(x.id);
                              setStampPick(false);
                            }}
                            title={x.name}
                          >
                            <span className="stamp-ico" dangerouslySetInnerHTML={{ __html: stampSvg(x, guideColor(doc.guides[guide], 0.5)) }} />
                            <small>{x.name}</small>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <VSlider label="Taille" value={(stampSize - 0.02) / 0.28} onChange={(v) => setStampSize(0.02 + v * 0.28)} />
                  <VSlider label="Dilution : de l’encre pleine au lavis" value={dilution} onChange={(v) => setDilution(Math.round(v * 100) / 100)} />
                  <Dial label="Rotation" value={stampRot} onChange={setStampRot} />
                </>
              )}
              {tool === 'cut' && (
                <>
                  <button className={`btn small ${magnet ? 'on' : ''}`} onClick={() => setMagnet(!magnet)} title="Lignes magnétiques : les ciseaux suivent les contours détectés">
                    <Icon name="magnet" />
                  </button>
                  {magnet && (
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
                      <VSlider label="Seuil" value={(edgeThreshold - 0.05) / 0.9} onChange={(v) => setEdgeThreshold(Math.round((0.05 + v * 0.9) * 50) / 50)} />
                      <VSlider label="Lissage" value={edgeSmooth} onChange={(v) => setEdgeSmooth(Math.round(v * 20) / 20)} />
                    </>
                  )}
                </>
              )}
              {tool === 'move' && sel && sel.kind !== 'surface' && (
                <>
                  <VSlider label="Hauteur" center value={0.5 + (sel.height - (sel.inner ?? 0)) / 2} onChange={(v) => patchLayer(sel.id, heightPatch(Math.round((v * 2 - 1) * 100) / 100), false)} />
                </>
              )}
            </div>
            <span className="side-sep" />
            <div className="side-actions">
              <button className="btn small" onClick={undo} disabled={!past.current.length} title="Annuler (deux doigts)">
                <Icon name="undo" />
              </button>
              <button className="btn small" onClick={redo} disabled={!future.current.length} title="Rétablir (trois doigts)">
                <Icon name="redo" />
              </button>
              <button className="btn small" onClick={duplicate} disabled={!sel || sel.kind === 'surface'} title="Dupliquer l'élément sélectionné">
                <Icon name="duplicate" />
              </button>
              <button
                ref={trashRef}
                className={`btn small trash ${trashHot ? 'hot' : ''} ${live.current.kind === 'move' ? 'armed' : ''}`}
                onClick={() => setToast('Glisse un élément sur la corbeille pour le supprimer')}
                title="Corbeille : glisse un élément dessus pour le supprimer"
              >
                <Icon name="trash" />
              </button>
            </div>
          </aside>

          {bubble === 'format' && (
            <div className="bubble format-bubble">
              <div className="b-title">Format</div>
              {FORMATS.map((x) => (
                <button key={x.id} className={`row ${x.id === f.id ? 'on' : ''}`} onClick={() => setDoc((d) => holdPins({ ...d, formatId: x.id }, x))}>
                  <FormatGlyph w={x.width} h={x.height} big />
                  <span>{x.title}</span>
                  <small>
                    {x.width} × {x.height} {x.unit}
                  </small>
                </button>
              ))}
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

          {bubble === 'layers' && (
            <div className="bubble layers-bubble">
              <div className="b-title">Couches</div>
              <div className="layer-list">
                {(frozenOrder ? frozenOrder.map((id) => doc.layers.find((x) => x.id === id)).filter((x): x is Layer => !!x) : [...renderOrder(doc.layers)].reverse()).map((l, k, list) => (
                  <div key={l.id} className={`layer ${l.id === selected ? 'on' : ''} ${l.visible ? '' : 'hidden'}`} onClick={() => setSelected(l.id)}>
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
                      {l.kind !== 'surface' ? (
                        <label className="height" title="Hauteur : ombre et épaisseur" onClick={(e) => e.stopPropagation()}>
                          <Icon name="height" />
                          <span className="height-track">
                            <input
                              type="range"
                              min={-1}
                              max={1}
                              step={0.01}
                              value={l.height - (l.inner ?? 0)}
                              // l'ordre de la liste reste figé tant que le curseur est tenu
                              onPointerDown={() => setFrozenOrder([...renderOrder(doc.layers)].reverse().map((x) => x.id))}
                              onPointerUp={() => setFrozenOrder(null)}
                              onPointerCancel={() => setFrozenOrder(null)}
                              onBlur={() => setFrozenOrder(null)}
                              onChange={(e) => {
                                // le neutre aimante le doigt
                                const v = Number(e.target.value);
                                patchLayer(l.id, heightPatch(Math.abs(v) < 0.06 ? 0 : v), false);
                              }}
                            />
                          </span>
                        </label>
                      ) : (
                        <small>bords perdus, suit le format</small>
                      )}
                    </div>
                    <div className="layer-actions" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => patchLayer(l.id, { visible: !l.visible })} title={l.visible ? 'Masquer' : 'Afficher'}>
                        <Icon name={l.visible ? 'eye' : 'eyeoff'} />
                      </button>
                      {l.kind !== 'surface' && (
                        <>
                          <button onClick={() => moveLayer(l.id, 1)} disabled={!list[k - 1] || levelOf(list[k - 1]!) !== levelOf(l)} title="Monter (entre couches de même hauteur ; sinon, règle la hauteur)">
                            <Icon name="up" />
                          </button>
                          <button onClick={() => moveLayer(l.id, -1)} disabled={!list[k + 1] || levelOf(list[k + 1]!) !== levelOf(l)} title="Descendre (entre couches de même hauteur ; sinon, règle la hauteur)">
                            <Icon name="down" />
                          </button>
                        </>
                      )}
                      {/* le fond se cache (œil) mais ne se supprime pas */}
                      {l.kind !== 'surface' && (
                        <button
                          onClick={() => {
                            update((d) => ({ ...d, layers: d.layers.filter((x) => x.id !== l.id) }));
                            if (selected === l.id) setSelected(null);
                          }}
                          title="Supprimer"
                        >
                          <Icon name="trash" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {sel && sel.strokes.length > 0 && (
                <button className="row" onClick={() => patchLayer(sel.id, { strokes: [] })}>
                  Effacer la peinture de « {sel.name} »
                </button>
              )}
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
              {shelf !== 'formes' && shelf !== 'textes' && (
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
                          <button key={sh} onClick={() => addLayer('shape', { shape: sh as ShapeKind, name })} title={name}>
                            <ShapeGlyph shape={sh as ShapeKind} />
                            {name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
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

          {bubble === 'anchor' && (
            <div className="bubble anchor-bubble">
              <div className="b-title">Aide au positionnement</div>
              <div className="seg">
                {ANCHOR_FRAMES.filter((x) => x !== 'grid').map((x) => (
                  <button key={x} className={doc.frame === x ? 'on' : ''} onClick={() => setDoc((d) => ({ ...d, frame: x as AnchorFrame }))} title={FRAME_TITLES[x]}>
                    {x === 'repartition' ? '½ ⅓' : x === 'or' ? 'φ' : '✕'}
                  </button>
                ))}
              </div>
              <div className="b-title">
                Densité des points <span className="b-count">{anchorsOf(doc.frame, f).length} points</span>
              </div>
              <label className={`density ${doc.frame === 'repartition' ? '' : 'off'}`}>
                <span>−</span>
                <input
                  type="range"
                  min={1}
                  max={DENSITY_STEPS.length}
                  step={1}
                  disabled={doc.frame !== 'repartition'}
                  value={doc.density ?? DEFAULT_DENSITY}
                  onChange={(e) => setDoc((d) => ({ ...d, density: Number(e.target.value) }))}
                />
                <span>+</span>
              </label>
              <small className="fx-hint">
                {doc.frame === 'repartition'
                  ? ['Demis', 'Demis et tiers', 'Demis, tiers et quarts', 'Jusqu’aux sixièmes', 'Douzièmes', 'Vingt-quatrièmes'][(doc.density ?? DEFAULT_DENSITY) - 1]
                  : 'Le nombre d’or et l’armature ont des points fixes : la densité règle la répartition.'}
              </small>
              <div className="b-title">
                Marge <span className="b-count">{Math.round((doc.margin ?? 0) * 100)} %</span>
              </div>
              <label className="density">
                <span>−</span>
                <input
                  type="range"
                  min={-0.25}
                  max={0.25}
                  step={0.01}
                  value={doc.margin ?? 0}
                  onChange={(e) => {
                    // le neutre aimante le curseur
                    const v = Number(e.target.value);
                    const m = Math.abs(v) < 0.015 ? 0 : v;
                    // les objets tenus à la marge la suivent
                    setAnchorMargin(m);
                    setDoc((d) => holdPins({ ...d, margin: m }, f));
                  }}
                />
                <span>+</span>
              </label>
              <small className="fx-hint">Les repères se répartissent à cette distance du bord, dedans (+) ou au-delà (−) ; elle suit le format quand il change.</small>
              <div className="b-title">Repères visibles</div>
              <div className="guides-look">
                <button className={`pal-lib-save ${guidesOn.on ? 'on' : ''}`} onClick={() => setGuidesOn({ ...guidesOn, on: !guidesOn.on })}>
                  {guidesOn.on ? 'Toujours' : 'Au déplacement'}
                </button>
                <div className="guides-colors">
                  {['#7a5cff', '#00b3c7', '#ff3b6b', '#1d1b22', '#ffffff'].map((c) => (
                    <button key={c} className={guidesOn.color === c ? 'on' : ''} style={{ background: c }} onClick={() => setGuidesOn({ ...guidesOn, color: c })} aria-label={`Couleur des repères ${c}`} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {bubble === 'palette' && (
            <PaletteBubble
              doc={doc}
              active={guide}
              onPick={setGuide}
              onGuides={(guides, commit = true) => (commit ? update : setDoc)((d) => ({ ...d, guides }))}
              onDrag={(i, x, y) => setDragGuide(i === null ? null : { i, x, y })}
              onDrop={(i, x, y) => {
                setDragGuide(null);
                const el = document.elementFromPoint(x, y);
                if (!el || el.tagName !== 'CANVAS') return;
                const q = toPage(x, y);
                const l = layerAt(q.x, q.y);
                if (!l) return;
                if (l.kind === 'photo') return setToast('Une photo n’a pas de couleur de fond : peins-la ou donne-lui un style');
                patchLayer(l.id, { guide: i });
                setSelected(l.id);
                setToast(`« ${l.name} » prend la couleur « ${doc.guides[i]?.name} »`);
              }}
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
              {tool === 'stamp' && `Tampon « ${stampOf(stampId).name} » dans « ${sel.name} » : touche pour imprimer, glisse pour une traînée`}
              {tool === 'cut' && `Trace un contour : le morceau se détache de la couche touchée${magnet ? `, aimanté sur les contours de « ${sel.name} »` : ''}`}
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
          <button className="chip" onClick={() => setRendu(false)}>
            Retour à l'atelier
          </button>
        </div>
      )}
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

function VSlider({ label, value, onChange, center }: { label: string; value: number; onChange: (v: number) => void; center?: boolean }) {
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
        set(e);
      }}
      onPointerMove={(e) => e.buttons && set(e)}
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

function FormatGlyph({ w, h, big }: { w: number; h: number; big?: boolean }) {
  const s = big ? 26 : 16;
  const k = s / Math.max(w, h);
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden>
      <rect x={(s - w * k) / 2 + 0.75} y={(s - h * k) / 2 + 0.75} width={w * k - 1.5} height={h * k - 1.5} rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
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
function PaletteBubble({
  doc,
  active,
  onPick,
  onGuides,
  onDrag,
  onDrop,
}: {
  doc: Doc;
  active: number;
  onPick: (i: number) => void;
  onGuides: (g: Guide[], commit?: boolean) => void;
  onDrag: (i: number | null, x: number, y: number) => void;
  onDrop: (i: number, x: number, y: number) => void;
}) {
  // glisser une couleur jusqu'à un objet : elle devient sa couleur de fond
  const drag = useRef<{ i: number; x: number; y: number; on: boolean } | null>(null);
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
  // édition de la couleur : escamotable, retenue d'une ouverture à l'autre
  // édition de la couleur : fermée à chaque ouverture de la palette ; double toucher sur une couleur l'ouvre
  const [editing, setEditing] = useState(false);
  const lastPick = useRef<{ i: number; t: number } | null>(null);
  const store = (list: typeof saved) => {
    setSaved(list);
    try {
      localStorage.setItem(SAVED, JSON.stringify(list));
    } catch {
      /* stockage indisponible */
    }
  };
  const edit = (patch: Partial<Guide>) => onGuides(doc.guides.map((x, i) => (i === active ? ({ ...x, ...patch } as Guide) : x)));
  // une teinte = une couleur ; deux ou plus = un dégradé
  const stopsOf = (x: Guide) => (x.type === 'gradient' ? x.stops : [x.color]);
  const setStops = (stops: string[], commit = true) =>
    onGuides(
      doc.guides.map((x, i) =>
        i !== active ? x : stops.length > 1 ? { name: x.name, type: 'gradient', stops, ...(x.type === 'gradient' && x.blend ? { blend: x.blend } : {}) } : { name: x.name, type: 'color', color: stops[0]! },
      ),
      commit,
    );
  return (
    <div className={`bubble palette-bubble ${editing ? 'editing' : ''}`}>
      <div className="pal-head">
        <button className={`cp-bench cp-toggle ${editing ? 'on' : ''}`} aria-pressed={editing} onClick={() => setEditing(!editing)} title="Afficher ou masquer l'édition de la couleur choisie">
          Modifier
        </button>
        <div className="b-title">Palette du document</div>
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
                <span className="strip" style={{ background: `linear-gradient(90deg, ${p.guides.map((x) => guideColor(x, 0.5)).join(',')})` }} />
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
      {editing && g && (
        <div className="guide-edit">
          <PaletteEditor
            key={active}
            stops={stopsOf(g)}
            blend={g.type === 'gradient' ? (g.blend ?? 'smooth') : 'smooth'}
            onBlend={(blend: Blend) => onGuides(doc.guides.map((x, i) => (i === active && x.type === 'gradient' ? { ...x, blend } : x)))}
            onChange={(stops, commit) => setStops(stops, commit)}
          />
        </div>
      )}
      <div className="guides">
        {doc.guides.map((x, i) => (
          <div
            key={i}
            role="button"
            tabIndex={0}
            className={`guide ${i === active ? 'on' : ''}`}
            onClick={() => {
              onPick(i);
              const now = performance.now();
              const lp = lastPick.current;
              if (lp && lp.i === i && now - lp.t < 400) {
                setEditing(true);
                lastPick.current = null;
              } else lastPick.current = { i, t: now };
            }}
            title={`${x.name} : double toucher pour la modifier, glisse-la sur un objet pour lui donner cette couleur`}
            onPointerDown={(e) => {
              (e.currentTarget as Element).setPointerCapture(e.pointerId);
              drag.current = { i, x: e.clientX, y: e.clientY, on: false };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              if (!d.on && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) d.on = true;
              if (d.on) onDrag(d.i, e.clientX, e.clientY);
            }}
            onPointerUp={(e) => {
              const d = drag.current;
              drag.current = null;
              if (d?.on) {
                e.preventDefault();
                onDrop(d.i, e.clientX, e.clientY);
              }
            }}
            onPointerCancel={() => {
              drag.current = null;
              onDrag(null, 0, 0);
            }}
          >
            <span className="sw" style={{ background: swatch(x) }} />
            {i === active ? (
              // le nom de la couleur choisie s'écrit sur place
              <input
                className="gname gname-edit"
                value={x.name}
                aria-label="Nom de la couleur"
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => edit({ name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  e.stopPropagation();
                }}
              />
            ) : (
              <span className="gname">{x.name}</span>
            )}
          </div>
        ))}
        <button
          className="guide add"
          onClick={() => {
            onGuides([...doc.guides, { name: `Couleur ${doc.guides.length + 1}`, type: 'color', color: '#6c8cd5' }]);
            onPick(doc.guides.length);
          }}
          title="Ajouter une couleur : ajoute-lui une seconde teinte pour en faire un dégradé"
        >
          <span className="sw plus">＋</span>
          <span className="gname">Ajouter</span>
        </button>
      </div>
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
      {look && def && <VSlider label="Mélange" value={look.mix} onChange={(v) => onChange({ ...look, mix: Math.round(v * 100) / 100 }, false)} />}
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
          <VSlider label="Dessin" value={draw.amount} onChange={(v) => onChange({ ...look, draw: { ...draw, amount: Math.round(v * 100) / 100 } }, false)} />
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
      {cur && <VSlider label="Intensité" value={cur.amount} onChange={(v) => onChange({ ...cur, amount: Math.round(v * 100) / 100 }, false)} />}
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
      {def && cur && <VSlider label="Intensité" value={cur.amount} onChange={(v) => patchCur({ amount: Math.round(v * 100) / 100 }, false)} />}
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
          <VSlider label="Bord" value={Math.sqrt((bd.width - 0.002) / 0.198)} onChange={(v) => patch({ border: { ...bd, width: 0.002 + Math.round(v * v * 198) / 1000 } }, false)} />
        </>
      )}
      <VSlider label="Biseau" value={l.bevel ?? 0} onChange={(v) => patch({ bevel: Math.round(v * 100) / 100 }, false)} />
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
          <VSlider label="Distance : dedans (−) ou dehors (+)" center value={(gl.distance + 1) / 2} onChange={(v) => patch({ glow: { ...gl, distance: Math.round((v * 2 - 1) * 100) / 100 } }, false)} />
          <VSlider label="Largeur" value={gl.width} onChange={(v) => patch({ glow: { ...gl, width: Math.round(v * 100) / 100 } }, false)} />
        </>
      )}
    </>
  );
}
