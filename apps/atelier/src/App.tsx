import { anchorsFor, FRAME_TITLES, ANCHOR_FRAMES, type AnchorFrame, type Format } from '@ftd/core';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { previewStamps } from './brush';
import { DEMO_PHOTO, demoDoc } from './demo';
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
  type Layer,
  type Pt,
  type BorderStyle,
  type ShapeKind,
  type Stroke,
} from './model';
import { geomArea, insideRings, intersect, ringsOfGeom, ringsToPath, simplifyRing, subtract } from './cut';
import { FX, FX_GROUPS, fxGuides, fxOf, newFx, type Fx, type FxId } from './fx';
import { applyLook, lookGuides, lookOf, LOOKS, type LookId, type LookSettings } from './looks';
import { analyse, analysisSize, EdgeGrid, edgeMap, type EdgeMap, type EdgeMode } from './edges';
import { cutOf, holdPins, imageFor, localBounds, localToPage, pageBounds, pageToLocal, pinsOf, drawChecker, drawLayers, forgetPaint, localRings, maskPath2D, maskRings, paintTarget, tracePath } from './scene';

type Tool = 'cut' | 'paint' | 'transform' | 'move';
type Bubble = 'layers' | 'palette' | 'light' | 'format' | null;
type View = { zoom: number; rot: number; px: number; py: number };

const STORE = 'ftd-atelier-doc';
const TOP = 52;
/** Rayon d'attraction des ancrages, en pixels écran. */
const MAGNET = 30;
/** Rayon d'aimantation des ciseaux sur les contours détectés, en pixels écran. */
const EDGE_RADIUS = 14;
const BORDER_TYPES: Array<[BorderStyle | null, string, string]> = [
  [null, 'Aucun', 'pas de bord'],
  ['round', 'Arrondi', 'suit la découpe'],
  ['straight', 'Droit', 'à facettes'],
  ['torn', 'Déchiré', 'papier arraché'],
];
const swatch = (g: Guide | undefined) => (g?.type === 'gradient' ? `linear-gradient(135deg, ${g.stops.join(',')})` : guideColor(g));
const EDGE_MODES: Array<[EdgeMode, string, string]> = [
  ['contrast', 'Contraste', 'bords de lumière'],
  ['color', 'Couleur', 'bords de teinte'],
  ['both', 'Les deux', 'lumière et teinte'],
];

function load(): Doc {
  try {
    const s = localStorage.getItem(STORE);
    if (s) {
      const d = JSON.parse(s) as Doc;
      // anciens documents : découpe polygonale → tracé
      for (const l of d.layers) {
        // biseau séparé de la hauteur : les anciens documents gardent leur relief
        if (l.bevel === undefined) l.bevel = l.kind === 'surface' ? 0 : Math.round(l.height * 60) / 100;
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
  return demoDoc();
}

export function App() {
  const [doc, setDoc] = useState<Doc>(load);
  const docRef = useRef(doc);
  docRef.current = doc;
  const past = useRef<string[]>([]);
  const future = useRef<string[]>([]);
  const [, force] = useState(0);
  const redraw = useCallback(() => force((n) => n + 1), []);

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

  const [tool, setTool] = useState<Tool>('paint');
  const [bubble, setBubble] = useState<Bubble>(null);
  const [selected, setSelected] = useState<string | null>('arche');
  const [guide, setGuide] = useState(2);
  const [size, setSize] = useState(0.05);
  const [opacity, setOpacity] = useState(0.85);
  const [view, setView] = useState<View>({ zoom: 1, rot: 0, px: 0, py: 0 });
  const [rendu, setRendu] = useState(false);
  const [magnet, setMagnet] = useState(true);
  /** Détection des contours de l'image sélectionnée : critère et seuil (0..1). */
  const [edgeMode, setEdgeMode] = useState<EdgeMode>('both');
  const [edgeThreshold, setEdgeThreshold] = useState(0.35);
  const [edgeSmooth, setEdgeSmooth] = useState(0.4);
  const [modePick, setModePick] = useState(false);
  const [borderPick, setBorderPick] = useState(false);
  /** Bulle ouverte de l'outil Transformer : style, guide du style, effets, guide d'effet. */
  const [tpop, setTpop] = useState<string | null>(null);
  const [fxFocus, setFxFocus] = useState<number | null>(null);
  useEffect(() => {
    setFxFocus(null);
    setTpop(null);
  }, [selected]);
  const [borderColorPick, setBorderColorPick] = useState(false);
  const trashRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [trashHot, setTrashHot] = useState(false);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const f = formatOf(doc.formatId);
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
  const matrix = useMemo(
    () =>
      new DOMMatrix()
        .translate(vp.w / 2 + view.px, top + (vp.h - top) / 2 + view.py)
        .rotate((view.rot * 180) / Math.PI)
        .scale(fit * view.zoom)
        .translate(-f.width / 2, -f.height / 2),
    [vp, view, fit, f, top],
  );
  const toPage = (cx: number, cy: number) => {
    const p = matrix.inverse().transformPoint(new DOMPoint(cx, cy));
    return { x: p.x, y: p.y };
  };
  const scale = fit * view.zoom;

  // --- état des gestes en cours ---
  const live = useRef<{
    kind: 'paint' | 'cut' | 'move' | 'resize' | 'rotate' | 'pivot' | 'view' | null;
    /** Coin opposé (coordonnées de la couche) tenu fixe pendant un agrandissement. */
    opp?: { u: number; v: number };
    pins?: Layer['pins'];
    layer?: string;
    stroke?: Stroke;
    wet?: HTMLCanvasElement;
    drawn?: number;
    lasso?: Pt[];
    start?: { x: number; y: number };
    orig?: Layer;
    last?: { x: number; y: number; t: number; p: number };
    snap?: { x: number; y: number } | null;
    /** Contours aimantés (unités du format) et indices des points aimantés. */
    grid?: EdgeGrid | null;
    snapped?: number[];
  }>({ kind: null });
  const pointers = useRef(new Map<number, { x: number; y: number; type: string }>());
  const gesture = useRef<{ view: View; c: { x: number; y: number }; d: number; a: number } | null>(null);
  const tap = useRef<{ n: number; t0: number; moved: boolean } | null>(null);

  // --- dessin ---
  useLayoutEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
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
    });
    if (rendu) return;
    const px = 1 / scale;
    // sélection : découpe en pointillés
    const sel = doc.layers.find((l) => l.id === selected);
    if (sel && sel.kind !== 'surface' && L.kind !== 'cut') {
      ctx.save();
      ctx.lineWidth = 1.5 * px;
      ctx.setLineDash([6 * px, 5 * px]);
      ctx.strokeStyle = '#7a5cff';
      ctx.stroke(maskPath2D(sel, f));
      ctx.restore();
      if (tool === 'move' && L.kind !== 'move') {
        const h = handlesOf(sel);
        ctx.strokeStyle = '#7a5cff';
        ctx.lineWidth = 2 * px;
        ctx.beginPath();
        ctx.moveTo(h.top.x, h.top.y);
        ctx.lineTo(h.rot.x, h.rot.y);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        for (const q of [h.tl, h.br]) {
          ctx.beginPath();
          ctx.arc(q.x, q.y, 9 * px, 0, Math.PI * 2);
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
    // ancrages pendant un déplacement
    if (L.kind === 'move') {
      ctx.fillStyle = 'rgba(122,92,255,0.55)';
      for (const a of anchorsFor(doc.frame, f)) {
        ctx.beginPath();
        ctx.arc(a.x * f.width, a.y * f.height, 3.5 * px, 0, Math.PI * 2);
        ctx.fill();
      }
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
      tracePath(ctx, L.lasso);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
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
    for (let i = doc.layers.length - 1; i >= 0; i--) {
      const l = doc.layers[i]!;
      if (l.visible && insideRings(maskRings(l, f), x, y)) return l;
    }
    return null;
  };
  const toLocal = (l: Layer, x: number, y: number) => pageToLocal(l, f, x, y);
  /** Poignées : coins du rectangle serré de la découpe, rotation au-dessus du bord haut. */
  const handlesOf = (l: Layer) => {
    const k = localBounds(l);
    const tl = localToPage(l, f, k.u0, k.v0);
    const br = localToPage(l, f, k.u1, k.v1);
    const top = localToPage(l, f, (k.u0 + k.u1) / 2, k.v0);
    const r = l.rot ?? 0;
    const off = 34 / scale;
    const pv = l.pivot ?? { u: (k.u0 + k.u1) / 2, v: (k.v0 + k.v1) / 2 };
    return { k, tl, br, top, pv, pivot: localToPage(l, f, pv.u, pv.v), rot: { x: top.x + Math.sin(r) * off, y: top.y - Math.cos(r) * off } };
  };

  // --- pointeurs ---
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    setBubble(null);
    setModePick(false);
    setBorderPick(false);
    setBorderColorPick(false);
    const touches = [...pointers.current.values()].filter((p) => p.type === 'touch');
    if (e.pointerType === 'touch' && touches.length >= 2) {
      // plusieurs doigts : on annule le geste à un doigt et on manipule la vue
      if (live.current.kind === 'move' || live.current.kind === 'resize') {
        const o = live.current.orig!;
        setDoc((d) => ({ ...d, layers: d.layers.map((l) => (l.id === o.id ? o : l)) }));
        past.current.pop();
      }
      live.current = { kind: 'view' };
      const [a, b] = touches;
      gesture.current = {
        view,
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
          live.current = { kind: 'rotate', layer: sel.id, start: p, orig: structuredClone(sel) };
          return;
        }
        for (const [q, opp] of [
          [h.br, { u: h.k.u0, v: h.k.v0 }],
          [h.tl, { u: h.k.u1, v: h.k.v1 }],
        ] as const)
          if (near(q)) {
            update((d) => d);
            live.current = { kind: 'resize', layer: sel.id, start: p, orig: structuredClone(sel), opp };
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
      live.current = { kind: 'move', layer: l.id, start: p, orig: structuredClone(l), snap: null };
      return;
    }
    if (t === 'transform') {
      // Transformer : toucher une photo la sélectionne
      const l = layerAt(p.x, p.y);
      setSelected(l?.id ?? null);
      return;
    }
    if (t === 'cut') {
      // lignes magnétiques : contours des couches visibles et bords du format
      const grid = magnet && sel ? edgeGrid(sel) : null;
      const s0 = snapEdge(grid, p);
      live.current = { kind: 'cut', lasso: [s0.p], grid, snapped: s0.hit ? [0] : [] };
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
      stroke: { brush: 'aquarelle', guide, size, opacity, seed: Math.floor(Math.random() * 1e9), pts: [{ ...q, p: pr }] },
    };
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
    if (!pt) return;
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
      setView({ zoom: Math.max(0.3, Math.min(6, (g.view.zoom * d) / g.d)), rot, px: g.view.px + c.x - g.c.x, py: g.view.py + c.y - g.c.y });
      return;
    }
    if (tap.current && moved > 6) tap.current.moved = true;
    const p = toPage(e.clientX, e.clientY);
    if (L.kind === 'paint' && L.stroke && L.layer) {
      const l = doc.layers.find((x) => x.id === L.layer)!;
      const events = (e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]) as PointerEvent[];
      for (const ev of events) {
        const q = toPage(ev.clientX, ev.clientY);
        const pr = pressure(ev as unknown as React.PointerEvent, L.last!);
        L.last = { x: ev.clientX, y: ev.clientY, t: performance.now(), p: pr };
        const loc = toLocal(l, q.x, q.y);
        const prev = L.stroke.pts[L.stroke.pts.length - 1]!;
        if (Math.hypot((loc.x - prev.x) * l.w, (loc.y - prev.y) * l.h) * Math.min(f.width, f.height) * scale < 1.5) continue;
        L.stroke.pts.push({ ...loc, p: pr });
      }
      const tg = paintTarget(l, f, scale * dpr);
      L.drawn = previewStamps(L.wet!.getContext('2d')!, L.stroke, doc.guides, tg, L.drawn ?? 0);
      redraw();
    } else if (L.kind === 'cut' && L.lasso) {
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
      if (Math.abs(cx + ex.l) < tol) [cx, pins.left] = [-ex.l, true];
      else if (Math.abs(cx + ex.r - f.width) < tol) [cx, pins.right] = [f.width - ex.r, true];
      if (Math.abs(cx + ex.r - f.width) < tol) pins.right = true;
      if (Math.abs(cy + ex.t) < tol) [cy, pins.top] = [-ex.t, true];
      else if (Math.abs(cy + ex.b - f.height) < tol) [cy, pins.bottom] = [f.height - ex.b, true];
      if (Math.abs(cy + ex.b - f.height) < tol) pins.bottom = true;
      const edge = pins.left || pins.right || pins.top || pins.bottom;
      if (edge) L.snap = null;
      L.pins = edge ? pins : undefined;
      const a = anchorFor(doc.frame, f, cx, cy);
      setDoc((d) => ({ ...d, layers: d.layers.map((x) => (x.id === o.id ? { ...x, anchor: a.anchor, dx: L.snap ? 0 : a.dx, dy: L.snap ? 0 : a.dy, pins: L.pins } : x)) }));
    } else if (L.kind === 'resize' && L.orig && L.start && L.opp) {
      // agrandir depuis un coin : le coin opposé reste en place
      const o = L.orig;
      const b = layerBox(o, f);
      const O = localToPage(o, f, L.opp.u, L.opp.v);
      let k = Math.max(0.05, Math.hypot(p.x - O.x, p.y - O.y) / Math.max(1e-9, Math.hypot(L.start.x - O.x, L.start.y - O.y)));
      // aimant : un bord de la découpe qui approche un bord de page s'y pose
      const bb = pageBounds(o, f);
      let best: number | null = null;
      for (const [edge, o0, page] of [
        [bb.x0, O.x, 0],
        [bb.x1, O.x, f.width],
        [bb.y0, O.y, 0],
        [bb.y1, O.y, f.height],
      ] as const) {
        if (Math.abs(edge - o0) < 1e-9) continue;
        const kk = (page - o0) / (edge - o0);
        const now = o0 + (edge - o0) * k;
        if (kk > 0.05 && Math.abs(now - page) * scale < MAGNET && (best === null || Math.abs(kk - k) < Math.abs(best - k))) best = kk;
      }
      if (best !== null) k = best;
      const cx = O.x + (b.cx - O.x) * k;
      const cy = O.y + (b.cy - O.y) * k;
      const a = anchorFor(doc.frame, f, cx, cy);
      setDoc((d) => ({ ...d, layers: d.layers.map((x) => (x.id === o.id ? { ...x, w: o.w * k, h: o.h * k, anchor: a.anchor, dx: a.dx, dy: a.dy } : x)) }));
    } else if (L.kind === 'pivot' && L.orig) {
      // le centre de rotation reste dans le cadre des poignées
      const o = L.orig;
      const k = localBounds(o);
      const q = pageToLocal(o, f, p.x, p.y);
      const pivot = { u: Math.max(k.u0, Math.min(k.u1, q.x)), v: Math.max(k.v0, Math.min(k.v1, q.y)) };
      setDoc((d) => ({ ...d, layers: d.layers.map((x) => (x.id === o.id ? { ...x, pivot } : x)) }));
    } else if (L.kind === 'rotate' && L.orig && L.start) {
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
      setDoc((d) => ({ ...d, layers: d.layers.map((x) => (x.id === o.id ? { ...x, rot: r, anchor: a.anchor, dx: a.dx, dy: a.dy } : x)) }));
    }
  };

  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
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
        gesture.current = null;
      }
      return;
    }
    if (remaining > 0) return;
    tap.current = null;
    if (L.kind === 'paint' && L.stroke && L.layer) {
      const s = L.stroke;
      const id = L.layer;
      live.current = { kind: null };
      if (s.pts.length === 1) s.pts.push({ ...s.pts[0]!, x: s.pts[0]!.x + 0.001 });
      update((d) => ({ ...d, layers: d.layers.map((l) => (l.id === id ? { ...l, strokes: [...l.strokes, s] } : l)) }));
      return;
    }
    if (L.kind === 'cut' && L.lasso) {
      live.current = { kind: null };
      finishCut(simplify(L.lasso, 1.2 / scale));
      return;
    }
    if (L.kind === 'move' && L.layer) {
      const l = doc.layers.find((x) => x.id === L.layer);
      if (l && trashHot) {
        // glissé sur la corbeille : suppression (annulable)
        const o = L.orig!;
        setDoc((d) => ({ ...d, layers: d.layers.filter((x) => x.id !== o.id) }));
        setSelected(null);
        setTrashHot(false);
        setToast(`« ${o.name} » à la corbeille`);
      } else if (l) {
        const pins = l.pins ? Object.entries(l.pins).filter(([, v]) => v).map(([k]) => ({ left: 'gauche', right: 'droite', top: 'haut', bottom: 'bas' })[k]) : [];
        setToast(pins.length ? `Tenu au bord ${pins.join(', ')}` : L.snap ? `Ancré sur ${l.anchor.point}` : `Près de ${l.anchor.point}`);
      }
    }
    if ((L.kind === 'resize' || L.kind === 'rotate') && L.layer) {
      // après agrandissement ou rotation : bords de page touchés
      const id = L.layer;
      setDoc((d) => ({ ...d, layers: d.layers.map((x) => (x.id === id ? { ...x, pins: pinsOf(x, f, 1.5 / scale) } : x)) }));
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
    const key = JSON.stringify([l.id, l.cut, l.shape, l.src?.length, l.strokes.length, l.guide, doc.guides, l.w, l.h, f.id, l.anchor, l.dx, l.dy]);
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
  const coveringLayers = (l: Layer) => doc.layers.slice(doc.layers.findIndex((x) => x.id === l.id) + 1).filter((x) => x.visible);

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
    const order = [sel, ...[...doc.layers].reverse()].filter((l, i, a): l is Layer => !!l && l.visible && l.kind !== 'surface' && a.indexOf(l) === i);
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
        height: Math.min(1, l.height + 0.1),
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
      height: 0.2,
      visible: true,
      strokes: [],
    };
    update((d) => ({ ...d, layers: [...d.layers, layer] }));
    setSelected(layer.id);
    setToast('Papier découpé : peins-le au stylet');
  };

  // --- ajout de couches ---
  const addLayer = (kind: 'shape' | 'photo', opts: { shape?: ShapeKind; src?: string; name: string }) => {
    const a = anchorFor(doc.frame, f, f.width / 2, f.height / 2);
    let w = 0.4;
    let h = 0.4;
    if (opts.shape === 'arch') h = 0.5;
    if (kind === 'photo') [w, h] = [0.7, 0.5];
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
      height: 0.3,
      visible: true,
      strokes: [],
    };
    update((d) => ({ ...d, layers: [...d.layers, layer] }));
    setSelected(layer.id);
    setTool('move');
    setBubble(null);
  };
  const importPhoto = (file: File) => {
    const r = new FileReader();
    r.onload = () => addLayer('photo', { src: String(r.result), name: file.name.replace(/\.[^.]+$/, '') });
    r.readAsDataURL(file);
  };

  const patchLayer = (id: string, patch: Partial<Layer>, history = true) => {
    const fn = (d: Doc) => ({ ...d, layers: d.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
    if (history) update(fn);
    else setDoc(fn);
  };
  const moveLayer = (id: string, step: number) =>
    update((d) => {
      const i = d.layers.findIndex((l) => l.id === id);
      const j = i + step;
      // la surface de fond reste tout en bas
      if (j < 0 || j >= d.layers.length || d.layers[j]!.kind === 'surface') return d;
      const layers = [...d.layers];
      [layers[i], layers[j]] = [layers[j]!, layers[i]!];
      return { ...d, layers };
    });

  // raccourcis clavier (ordinateur)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key === 'b') setTool('paint');
      else if (e.key === 'c') setTool('cut');
      else if (e.key === 't') setTool('transform');
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
  const g = doc.guides[guide];

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
    forgetPaint();
    setSnapshot(c.toDataURL('image/png'));
  };

  return (
    <div className={rendu ? 'atelier rendu' : 'atelier'}>
      <canvas
        ref={canvasRef}
        className="stage"
        style={{ width: vp.w, height: vp.h }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={(e) => {
          // ordinateur : molette = zoom, Maj + molette = rotation
          if (e.shiftKey) setView((v) => ({ ...v, rot: v.rot + e.deltaY * 0.002 }));
          else setView((v) => ({ ...v, zoom: Math.max(0.3, Math.min(6, v.zoom * Math.exp(-e.deltaY * 0.0015))) }));
        }}
      />

      {!rendu && (
        <>
          <header className="bar">
            <div className="bar-left">
              <span className="brand">Atelier</span>
              <button className={`chip ${bubble === 'format' ? 'on' : ''}`} onClick={() => setBubble(bubble === 'format' ? null : 'format')}>
                <FormatGlyph w={f.width} h={f.height} /> <span className="chip-label">{f.title}</span>
              </button>
              <button className="btn fit" onClick={() => setView({ zoom: 1, rot: 0, px: 0, py: 0 })} title="Recadrer la vue" disabled={view.zoom === 1 && !view.rot && !view.px && !view.py}>
                <Icon name="fit" />
              </button>
            </div>
            <div className="bar-right">
              <button className={`btn ${tool === 'cut' ? 'on' : ''}`} onClick={() => setTool('cut')} title="Découper (C) : trace un contour au stylet">
                <Icon name="scissors" />
              </button>
              <button className={`btn ${tool === 'paint' ? 'on' : ''}`} onClick={() => setTool('paint')} title="Peindre à l'aquarelle (B)">
                <Icon name="brush" />
              </button>
              <button className={`btn ${tool === 'transform' ? 'on' : ''}`} onClick={() => setTool('transform')} title="Transformer (T) : style photo et effets">
                <Icon name="transform" />
              </button>
              <button className={`btn ${tool === 'move' ? 'on' : ''}`} onClick={() => setTool('move')} title="Disposer (V) : déplacer, agrandir, ancrer">
                <Icon name="move" />
              </button>
              <span className="sep" />
              <button className={`btn ${bubble === 'layers' ? 'on' : ''}`} onClick={() => setBubble(bubble === 'layers' ? null : 'layers')} title="Couches">
                <Icon name="layers" />
              </button>
              <button className={`btn ${bubble === 'light' ? 'on' : ''}`} onClick={() => setBubble(bubble === 'light' ? null : 'light')} title="Lumière">
                <Icon name="sun" />
              </button>
              <button className={`btn guide-btn ${bubble === 'palette' ? 'on' : ''}`} onClick={() => setBubble(bubble === 'palette' ? null : 'palette')} title="Palette de guides">
                <span className="dot" style={{ background: g?.type === 'gradient' ? `linear-gradient(135deg, ${g.stops.join(',')})` : guideColor(g) }} />
              </button>
              <span className="sep" />
              <button className="btn" onClick={() => setRendu(true)} title="Rendu final">
                <Icon name="eye" />
              </button>
            </div>
          </header>

          <aside className={`side ${tool === 'move' && sel && sel.kind !== 'surface' ? (sel.border ? 'denser' : 'dense') : tool === 'transform' && sel?.look && sel.fx?.length ? 'denser' : tool === 'transform' && (sel?.look || sel?.fx?.length) ? 'dense' : ''}`}>
            {tool === 'paint' && (
              <>
                <VSlider label="Taille" value={(size - 0.01) / 0.14} onChange={(v) => setSize(0.01 + v * 0.14)} />
                <VSlider label="Opacité" value={opacity} onChange={(v) => setOpacity(Math.max(0.05, v))} />
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
                <VSlider label="Hauteur" value={sel.height} onChange={(v) => patchLayer(sel.id, { height: Math.round(v * 100) / 100 }, false)} />
                <VSlider label="Opacité" value={sel.opacity ?? 1} onChange={(v) => patchLayer(sel.id, { opacity: Math.round(v * 100) / 100 }, false)} />
                <VSlider label="Biseau" value={sel.bevel ?? 0} onChange={(v) => patchLayer(sel.id, { bevel: Math.round(v * 100) / 100 }, false)} />
                <button className={`btn small ${borderPick ? 'on' : ''}`} onClick={() => setBorderPick(!borderPick)} title={`Bord : ${BORDER_TYPES.find((x) => x[0] === (sel.border?.style ?? null))![1]}`}>
                  <Icon name={`border-${sel.border?.style ?? 'none'}`} />
                </button>
                {borderPick && (
                  <div className="mode-pop">
                    <div className="b-title">Bord</div>
                    {BORDER_TYPES.map(([st, t, hint]) => (
                      <button
                        key={t}
                        className={`row ${(sel.border?.style ?? null) === st ? 'on' : ''}`}
                        onClick={() => {
                          patchLayer(sel.id, { border: st ? { style: st, guide: sel.border?.guide ?? 0, width: sel.border?.width ?? 0.012 } : undefined });
                          setBorderPick(false);
                        }}
                      >
                        <Icon name={`border-${st ?? 'none'}`} />
                        <span>{t}</span>
                        <small>{hint}</small>
                      </button>
                    ))}
                  </div>
                )}
                {sel.border && (
                  <>
                    <button className={`btn small guide-btn ${borderColorPick ? 'on' : ''}`} onClick={() => setBorderColorPick(!borderColorPick)} title="Couleur du bord">
                      <span className="dot" style={{ background: swatch(doc.guides[sel.border.guide]) }} />
                    </button>
                    {borderColorPick && (
                      <div className="mode-pop">
                        <div className="b-title">Couleur du bord</div>
                        <div className="border-guides">
                          {doc.guides.map((x, i) => (
                            <button
                              key={i}
                              className={`sw ${sel.border!.guide === i ? 'on' : ''}`}
                              title={x.name}
                              style={{ background: swatch(x) }}
                              onClick={() => {
                                patchLayer(sel.id, { border: { ...sel.border!, guide: i } });
                                setBorderColorPick(false);
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    <VSlider label="Bord" value={Math.sqrt((sel.border.width - 0.002) / 0.198)} onChange={(v) => patchLayer(sel.id, { border: { ...sel.border!, width: 0.002 + Math.round(v * v * 198) / 1000 } }, false)} />
                  </>
                )}
              </>
            )}
            {tool === 'transform' && sel?.kind === 'photo' && (
              <LookControls
                layer={sel}
                guides={doc.guides}
                pick={tpop === 'look'}
                setPick={(v) => setTpop(v ? 'look' : null)}
                guidePick={tpop?.startsWith('lg') ? Number(tpop.slice(2)) : null}
                setGuidePick={(v) => setTpop(v === null ? null : `lg${v}`)}
                onChange={(look, history) => patchLayer(sel.id, { look }, history)}
              />
            )}
            {tool === 'transform' && sel && (
              <FxControls
                layer={sel}
                doc={doc}
                f={f}
                pick={tpop === 'fx'}
                setPick={(v) => setTpop(v ? 'fx' : null)}
                guidePick={tpop?.startsWith('fg') ? Number(tpop.slice(2)) : null}
                setGuidePick={(v) => setTpop(v === null ? null : `fg${v}`)}
                focus={fxFocus}
                setFocus={setFxFocus}
                onChange={(fx, history) => patchLayer(sel.id, { fx: fx.length ? fx : undefined }, history)}
                redraw={redraw}
              />
            )}
            <span className="side-sep" />
            <button className="btn small" onClick={undo} disabled={!past.current.length} title="Annuler (deux doigts)">
              <Icon name="undo" />
            </button>
            <button className="btn small" onClick={redo} disabled={!future.current.length} title="Rétablir (trois doigts)">
              <Icon name="redo" />
            </button>
            <button
              ref={trashRef}
              className={`btn small trash ${trashHot ? 'hot' : ''} ${live.current.kind === 'move' ? 'armed' : ''}`}
              onClick={() => setToast('Glisse un élément sur la corbeille pour le supprimer')}
              title="Corbeille : glisse un élément dessus pour le supprimer"
            >
              <Icon name="trash" />
            </button>
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
              <div className="b-title">Repères d'ancrage</div>
              <div className="seg">
                {ANCHOR_FRAMES.filter((x) => x !== 'grid').map((x) => (
                  <button key={x} className={doc.frame === x ? 'on' : ''} onClick={() => setDoc((d) => ({ ...d, frame: x as AnchorFrame }))} title={FRAME_TITLES[x]}>
                    {x === 'repartition' ? '½ ⅓' : x === 'or' ? 'φ' : '✕'}
                  </button>
                ))}
              </div>
              <button
                className="row danger"
                onClick={() => {
                  update(() => demoDoc());
                  forgetPaint();
                  setSelected('arche');
                }}
              >
                Repartir de l'exemple
              </button>
            </div>
          )}

          {bubble === 'layers' && (
            <div className="bubble layers-bubble">
              <div className="b-title">Couches</div>
              <div className="layer-list">
                {[...doc.layers].reverse().map((l) => (
                  <div key={l.id} className={`layer ${l.id === selected ? 'on' : ''} ${l.visible ? '' : 'hidden'}`} onClick={() => setSelected(l.id)}>
                    <LayerThumb layer={l} doc={doc} />
                    <div className="layer-main">
                      <span className="layer-name">{l.name}</span>
                      {l.kind !== 'surface' ? (
                        <label className="height" title="Hauteur : ombre et épaisseur" onClick={(e) => e.stopPropagation()}>
                          <Icon name="height" />
                          <input type="range" min={0} max={1} step={0.01} value={l.height} onChange={(e) => patchLayer(l.id, { height: Number(e.target.value) }, false)} />
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
                          <button onClick={() => moveLayer(l.id, 1)} title="Monter">
                            <Icon name="up" />
                          </button>
                          <button onClick={() => moveLayer(l.id, -1)} title="Descendre">
                            <Icon name="down" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => {
                          update((d) => ({ ...d, layers: d.layers.filter((x) => x.id !== l.id) }));
                          if (selected === l.id) setSelected(null);
                        }}
                        title="Supprimer"
                      >
                        <Icon name="trash" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {sel && sel.strokes.length > 0 && (
                <button className="row" onClick={() => patchLayer(sel.id, { strokes: [] })}>
                  Effacer la peinture de « {sel.name} »
                </button>
              )}
              <div className="b-title">Ajouter</div>
              <div className="add-grid">
                <button
                  onClick={() => {
                    setTool('cut');
                    setSelected(null);
                    setBubble(null);
                    setToast('Trace le contour du papier au stylet');
                  }}
                >
                  <Icon name="scissors" />
                  Papier découpé
                </button>
                {(
                  [
                    ['star', 'Étoile'],
                    ['circle', 'Cercle'],
                    ['arch', 'Arche'],
                    ['blob', 'Tache'],
                  ] as Array<[ShapeKind, string]>
                ).map(([s, name]) => (
                  <button key={s} onClick={() => addLayer('shape', { shape: s, name })}>
                    <ShapeGlyph shape={s} />
                    {name}
                  </button>
                ))}
                <button onClick={() => addLayer('photo', { src: DEMO_PHOTO, name: 'Photo du concert' })}>
                  <Icon name="photo" />
                  Photo exemple
                </button>
                <label className="file">
                  <Icon name="import" />
                  Importer une photo
                  <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && importPhoto(e.target.files[0])} />
                </label>
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
            </div>
          )}

          {bubble === 'palette' && (
            <PaletteBubble
              doc={doc}
              active={guide}
              selected={sel}
              onPick={setGuide}
              onTint={() => sel && sel.kind !== 'photo' && patchLayer(sel.id, { guide })}
              onGuides={(guides) => update((d) => ({ ...d, guides }))}
            />
          )}

          {bubble === 'light' && (
            <div className="bubble light-bubble">
              <div className="b-title">Lumière unique</div>
              <LightDial angle={doc.light} onChange={(a) => setDoc((d) => ({ ...d, light: a }))} />
              <p className="hint">Toutes les ombres et les épaisseurs suivent cette lumière. La hauteur de chaque couche se règle dans Couches.</p>
            </div>
          )}

          {tool === 'transform' && !sel && <div className="status">Sélectionne une photo ou une forme pour la transformer</div>}
          {!sel && tool === 'cut' && magnet && <div className="status">Sélectionne une image : ses contours guideront les ciseaux</div>}
          {sel && (
            <div className="status">
              {tool === 'paint' && `Peinture dans « ${sel.name} »`}
              {tool === 'cut' && `Trace un contour : le morceau se détache de la couche touchée${magnet ? `, aimanté sur les contours de « ${sel.name} »` : ''}`}
              {tool === 'transform' &&
                `« ${sel.name} » · ${[sel.kind === 'photo' ? (lookOf(sel.look?.style)?.name ?? 'photo originale') : '', ...(sel.fx ?? []).map((x) => fxOf(x.id)?.name)].filter(Boolean).join(' + ') || 'aucun effet'}`}
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
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/** Curseur vertical du bord gauche, à la façon de Procreate. */
function VSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const set = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    onChange(Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)));
  };
  return (
    <div
      ref={ref}
      className="vslider"
      title={label}
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture(e.pointerId);
        set(e);
      }}
      onPointerMove={(e) => e.buttons && set(e)}
    >
      <div className="vs-fill" style={{ height: `${value * 100}%` }} />
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
  const pts = shapePath(shape)
    .map((p) => `${2 + p.x * 20},${2 + p.y * 20}`)
    .join(' ');
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
      <polygon points={pts} fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
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

/** Cadran de la lumière : on tourne le soleil autour de la page. */
function LightDial({ angle, onChange }: { angle: number; onChange: (a: number) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const set = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const a = (Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180) / Math.PI;
    onChange(Math.round(a / 5) * 5);
  };
  const rad = (angle * Math.PI) / 180;
  const sx = 80 + Math.sin(rad) * 62;
  const sy = 80 - Math.cos(rad) * 62;
  const shx = -Math.sin(rad) * 8;
  const shy = Math.cos(rad) * 8;
  return (
    <svg
      ref={ref}
      viewBox="0 0 160 160"
      className="dial"
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture(e.pointerId);
        set(e);
      }}
      onPointerMove={(e) => e.buttons && set(e)}
    >
      <circle cx="80" cy="80" r="62" className="dial-ring" />
      <rect x={62 + shx} y={62 + shy} width="36" height="36" rx="6" className="dial-shadow" />
      <rect x="62" y="62" width="36" height="36" rx="6" className="dial-card" />
      <line x1="80" y1="80" x2={sx} y2={sy} className="dial-ray" />
      <circle cx={sx} cy={sy} r="11" className="dial-sun" />
      <text x="80" y="152" textAnchor="middle" className="dial-text">
        {angle}°
      </text>
    </svg>
  );
}

const SAVED = 'ftd-atelier-palettes';
function PaletteBubble({
  doc,
  active,
  selected,
  onPick,
  onTint,
  onGuides,
}: {
  doc: Doc;
  active: number;
  selected: Layer | null;
  onPick: (i: number) => void;
  onTint: () => void;
  onGuides: (g: Guide[]) => void;
}) {
  const g = doc.guides[active];
  const [saved, setSaved] = useState<Array<{ name: string; guides: Guide[] }>>(() => {
    try {
      return JSON.parse(localStorage.getItem(SAVED) ?? '[]');
    } catch {
      return [];
    }
  });
  const store = (list: typeof saved) => {
    setSaved(list);
    try {
      localStorage.setItem(SAVED, JSON.stringify(list));
    } catch {
      /* stockage indisponible */
    }
  };
  const edit = (patch: Partial<Guide>) => onGuides(doc.guides.map((x, i) => (i === active ? ({ ...x, ...patch } as Guide) : x)));
  return (
    <div className="bubble palette-bubble">
      <div className="b-title">Palette du document</div>
      <div className="guides">
        {doc.guides.map((x, i) => (
          <button key={i} className={`guide ${i === active ? 'on' : ''}`} onClick={() => onPick(i)} title={x.name}>
            <span className="sw" style={{ background: x.type === 'gradient' ? `linear-gradient(135deg, ${x.stops.join(',')})` : x.color }} />
            <span className="gname">{x.name}</span>
          </button>
        ))}
        <button className="guide add" onClick={() => onGuides([...doc.guides, { name: `Couleur ${doc.guides.length + 1}`, type: 'color', color: '#6c8cd5' }])} title="Ajouter une couleur">
          <span className="sw plus">＋</span>
          <span className="gname">Couleur</span>
        </button>
        <button
          className="guide add"
          onClick={() => onGuides([...doc.guides, { name: `Dégradé ${doc.guides.length + 1}`, type: 'gradient', stops: ['#e3a83c', '#ee6b5b'] }])}
          title="Ajouter un dégradé"
        >
          <span className="sw plus" style={{ background: 'linear-gradient(135deg,#e3a83c,#ee6b5b)' }} />
          <span className="gname">Dégradé</span>
        </button>
      </div>
      {g && (
        <div className="guide-edit">
          <input className="gname-input" value={g.name} onChange={(e) => edit({ name: e.target.value })} aria-label="Nom du guide" />
          {g.type === 'color' ? (
            <input type="color" value={g.color} onChange={(e) => edit({ color: e.target.value })} aria-label="Couleur" />
          ) : (
            <div className="stops">
              {g.stops.map((s, i) => (
                <input key={i} type="color" value={s} onChange={(e) => edit({ stops: g.stops.map((x, j) => (j === i ? e.target.value : x)) } as Partial<Guide>)} />
              ))}
              <button onClick={() => edit({ stops: [...g.stops, g.stops[g.stops.length - 1]!] } as Partial<Guide>)} title="Ajouter une teinte au dégradé">
                ＋
              </button>
            </div>
          )}
        </div>
      )}
      <button className="row" disabled={!selected || selected.kind === 'photo'} onClick={onTint}>
        {selected && selected.kind !== 'photo' ? `Teinter « ${selected.name} » avec ce guide` : 'Sélectionne un papier ou une forme pour le teinter'}
      </button>
      <div className="b-title">Palettes enregistrées</div>
      <button className="row" onClick={() => store([...saved, { name: `Palette ${saved.length + 1}`, guides: doc.guides }])}>
        Enregistrer la palette courante
      </button>
      {saved.map((p, i) => (
        <div key={i} className="saved">
          <span className="strip" style={{ background: `linear-gradient(90deg, ${p.guides.map((x) => guideColor(x, 0.5)).join(',')})` }} />
          <span>{p.name}</span>
          <button
            onClick={() => {
              // les traits gardent leur numéro de guide : on complète si la palette est plus courte
              const guides = [...p.guides];
              while (guides.length < doc.guides.length) guides.push(doc.guides[guides.length]!);
              onGuides(guides);
            }}
          >
            Réimporter
          </button>
          <button onClick={() => store(saved.filter((_, j) => j !== i))} aria-label="Supprimer">
            ✕
          </button>
        </div>
      ))}
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
    return out;
  }, [pick, im, layer.src, guides, look]);
  const choose = (id: LookId | null) => {
    if (!id) onChange(undefined);
    else {
      const d = lookOf(id)!;
      // les guides déjà choisis sont gardés quand le nouveau style en demande autant
      const keep = look && lookOf(look.style)?.slots.length === d.slots.length ? look.guides : d.slots.map((x) => x.def);
      onChange({ style: id, guides: keep, mix: look?.mix ?? 1 });
    }
    setPick(false);
  };
  const slots = def ? lookGuides(def, look) : [];
  return (
    <>
      <button className={`btn small look-btn ${pick ? 'on' : ''}`} onClick={() => setPick(!pick)} title={`Style : ${def?.name ?? 'aucun'}`}>
        <Icon name="transform" />
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
      {look && <VSlider label="Mélange" value={look.mix} onChange={(v) => onChange({ ...look, mix: Math.round(v * 100) / 100 }, false)} />}
    </>
  );
}

/** Aperçu d'une couche seule, avec une liste d'effets, cadrée sur sa découpe. */
function fxPreview(l: Layer, doc: Doc, f: Format, fx: Fx[] | undefined, key: string, onImage: () => void): string {
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
  drawLayers(ctx, { ...doc, layers: [{ ...l, id: `pv-${l.id}-${key}`, fx, height: 0, opacity: 1, visible: true }] }, f, { scale: s, onImage });
  return c.toDataURL('image/png');
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
}) {
  const list = layer.fx ?? [];
  const cur = focus !== null ? list[focus] : list[list.length - 1];
  const curIdx = focus !== null && list[focus] ? focus : list.length - 1;
  const def = fxOf(cur?.id);
  const [tick, bump] = useState(0);
  // aperçus : l'effet ajouté à ceux déjà posés (ou seul s'il y est déjà)
  const thumbs = useMemo(() => {
    if (!pick) return null;
    const out: Partial<Record<FxId, string>> = {};
    const reload = () => bump((n) => n + 1);
    for (const d of FX) {
      const on = list.some((x) => x.id === d.id);
      out[d.id] = fxPreview(layer, doc, f, on ? list : [...list, newFx(d.id)], d.id, reload);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick, layer, doc.guides, doc.light, f, tick]);
  const tap = (id: FxId) => {
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) {
      onChange([...list, newFx(id)]);
      setFocus(list.length);
    } else if (i === curIdx) {
      onChange(list.filter((_, j) => j !== i));
      setFocus(null);
    } else setFocus(i);
    redraw();
  };
  const slots = def && cur ? fxGuides(def, cur) : [];
  const patchCur = (p: Partial<Fx>, history = true) => onChange(list.map((x, j) => (j === curIdx ? { ...x, ...p } : x)), history);
  return (
    <>
      <button className={`btn small fx-btn ${pick ? 'on' : ''}`} onClick={() => setPick(!pick)} title={`Effets${list.length ? ` : ${list.map((x) => fxOf(x.id)?.name).join(', ')}` : ''}`}>
        <Icon name="fx" />
        {list.length > 0 && <span className="fx-count">{list.length}</span>}
      </button>
      {pick && (
        <div className="mode-pop look-pop">
          <div className="b-title">Effets</div>
          <p className="fx-hint">Touche pour ajouter, retouche pour régler, une troisième fois pour retirer. Les effets se cumulent.</p>
          {FX_GROUPS.map(([g, title]) => (
            <div key={g}>
              <div className="fx-group">{title}</div>
              <div className="look-grid">
                {FX.filter((d) => d.group === g).map((d) => {
                  const i = list.findIndex((x) => x.id === d.id);
                  return (
                    <button key={d.id} className={`look-item ${i >= 0 ? 'active' : ''} ${i >= 0 && i === curIdx ? 'on' : ''}`} onClick={() => tap(d.id)}>
                      <span className="look-thumb">
                        {thumbs?.[d.id] && <img src={thumbs[d.id]} alt="" />}
                        {i >= 0 && <span className="fx-check">✓</span>}
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
          <button key={`${cur.id}${i}`} className={`btn small guide-btn ${guidePick === i ? 'on' : ''}`} onClick={() => setGuidePick(guidePick === i ? null : i)} title={`${def.name} · ${sl.label} : ${doc.guides[slots[i]!]?.name ?? ''}`}>
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
