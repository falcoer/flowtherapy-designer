import { anchorsFor, FRAME_TITLES, ANCHOR_FRAMES, type AnchorFrame } from '@ftd/core';
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
  type ShapeKind,
  type Stroke,
} from './model';
import { drawChecker, drawLayers, forgetPaint, inside, maskPath, paintTarget, tracePath } from './scene';

type Tool = 'cut' | 'paint' | 'move';
type Bubble = 'layers' | 'palette' | 'light' | 'format' | null;
type View = { zoom: number; rot: number; px: number; py: number };

const STORE = 'ftd-atelier-doc';
const TOP = 52;
/** Rayon d'attraction des ancrages, en pixels écran. */
const MAGNET = 30;

function load(): Doc {
  try {
    const s = localStorage.getItem(STORE);
    if (s) return JSON.parse(s) as Doc;
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
    kind: 'paint' | 'cut' | 'move' | 'resize' | 'view' | null;
    layer?: string;
    stroke?: Stroke;
    wet?: HTMLCanvasElement;
    drawn?: number;
    lasso?: Pt[];
    start?: { x: number; y: number };
    orig?: Layer;
    last?: { x: number; y: number; t: number; p: number };
    snap?: { x: number; y: number } | null;
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
    const m = new DOMMatrix().scale(dpr).multiply(matrix);
    ctx.setTransform(m);
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
      tracePath(ctx, maskPath(sel, f));
      ctx.stroke();
      ctx.restore();
      if (tool === 'move') {
        const b = layerBox(sel, f);
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#7a5cff';
        ctx.lineWidth = 2 * px;
        ctx.beginPath();
        ctx.arc(b.cx + b.w / 2, b.cy + b.h / 2, 9 * px, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
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
    }
  });

  // --- helpers de couches ---
  const layerAt = (x: number, y: number) => {
    for (let i = doc.layers.length - 1; i >= 0; i--) {
      const l = doc.layers[i]!;
      if (l.visible && inside(maskPath(l, f), x, y)) return l;
    }
    return null;
  };
  const toLocal = (l: Layer, x: number, y: number) => {
    const b = layerBox(l, f);
    return { x: (x - (b.cx - b.w / 2)) / b.w, y: (y - (b.cy - b.h / 2)) / b.h };
  };

  // --- pointeurs ---
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    setBubble(null);
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
        const b = layerBox(sel, f);
        if (Math.hypot(p.x - (b.cx + b.w / 2), p.y - (b.cy + b.h / 2)) * scale < 22) {
          update((d) => d);
          live.current = { kind: 'resize', layer: sel.id, start: p, orig: structuredClone(sel) };
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
    if (t === 'cut') {
      live.current = { kind: 'cut', lasso: [p] };
      redraw();
      return;
    }
    // peinture : dans la couche sélectionnée, sinon celle sous le stylet
    const target = sel && inside(maskPath(sel, f), p.x, p.y) ? sel : layerAt(p.x, p.y);
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
      L.lasso.push(p);
      redraw();
    } else if (L.kind === 'move' && L.orig && L.start) {
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
      const a = anchorFor(doc.frame, f, cx, cy);
      setDoc((d) => ({ ...d, layers: d.layers.map((x) => (x.id === o.id ? { ...x, anchor: a.anchor, dx: L.snap ? 0 : a.dx, dy: L.snap ? 0 : a.dy } : x)) }));
    } else if (L.kind === 'resize' && L.orig && L.start) {
      const o = L.orig;
      const b = layerBox(o, f);
      const k0 = Math.hypot(L.start.x - b.cx, L.start.y - b.cy);
      const k = Math.max(0.1, Math.hypot(p.x - b.cx, p.y - b.cy) / k0);
      setDoc((d) => ({ ...d, layers: d.layers.map((x) => (x.id === o.id ? { ...x, w: o.w * k, h: o.h * k } : x)) }));
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
      if (l) setToast(L.snap ? `Ancré sur ${l.anchor.point}` : `Près de ${l.anchor.point}`);
    }
    live.current = { kind: null };
    redraw();
  };

  /** Fin d'un tracé de ciseaux : découpe la couche sélectionnée, ou crée un papier découpé. */
  const finishCut = (lasso: Pt[]) => {
    if (lasso.length < 6) return redraw();
    const xs = lasso.map((p) => p.x);
    const ys = lasso.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    if ((x1 - x0) * scale < 12 || (y1 - y0) * scale < 12) return redraw();
    const sel = doc.layers.find((l) => l.id === selected);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    if (sel && sel.kind !== 'surface' && inside(maskPath(sel, f), cx, cy)) {
      // découpe de la couche sélectionnée (photo, forme, papier)
      const mask = lasso.map((p) => toLocal(sel, p.x, p.y));
      update((d) => ({ ...d, layers: d.layers.map((l) => (l.id === sel.id ? { ...l, mask, shape: undefined } : l)) }));
      setToast(`« ${sel.name} » découpée`);
      return;
    }
    const m = Math.min(f.width, f.height);
    const w = x1 - x0;
    const h = y1 - y0;
    const a = anchorFor(doc.frame, f, cx, cy);
    const n = doc.layers.filter((l) => l.name.startsWith('Papier découpé')).length + 1;
    const layer: Layer = {
      id: uid(),
      name: `Papier découpé ${n}`,
      kind: 'support',
      anchor: a.anchor,
      dx: a.dx,
      dy: a.dy,
      w: w / m,
      h: h / m,
      mask: lasso.map((p) => ({ x: (p.x - x0) / w, y: (p.y - y0) / h })),
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
      mask: kind === 'photo' ? undefined : undefined,
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

          <aside className="side">
            <VSlider label="Taille" value={(size - 0.01) / 0.14} onChange={(v) => setSize(0.01 + v * 0.14)} />
            <button className="btn small" onClick={undo} disabled={!past.current.length} title="Annuler (deux doigts)">
              <Icon name="undo" />
            </button>
            <button className="btn small" onClick={redo} disabled={!future.current.length} title="Rétablir (trois doigts)">
              <Icon name="redo" />
            </button>
            <VSlider label="Opacité" value={opacity} onChange={(v) => setOpacity(Math.max(0.05, v))} />
          </aside>

          {bubble === 'format' && (
            <div className="bubble format-bubble">
              <div className="b-title">Format</div>
              {FORMATS.map((x) => (
                <button key={x.id} className={`row ${x.id === f.id ? 'on' : ''}`} onClick={() => setDoc((d) => ({ ...d, formatId: x.id }))}>
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

          {sel && (
            <div className="status">
              {tool === 'paint' && `Peinture dans « ${sel.name} »`}
              {tool === 'cut' && (sel.kind === 'surface' ? 'Trace un contour : nouveau papier découpé' : `Trace un contour sur « ${sel.name} » pour la découper, ou ailleurs pour un nouveau papier`)}
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
    const m = layer.mask ?? (layer.shape ? shapePath(layer.shape) : null);
    const k = 36 / Math.max(layer.w, layer.h);
    const w = layer.kind === 'surface' ? 36 : layer.w * k;
    const h = layer.kind === 'surface' ? 36 : layer.h * k;
    const x0 = (S - w) / 2;
    const y0 = (S - h) / 2;
    ctx.beginPath();
    const pts = m ?? [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    pts.forEach((p, i) => (i ? ctx.lineTo(x0 + p.x * w, y0 + p.y * h) : ctx.moveTo(x0 + p.x * w, y0 + p.y * h)));
    ctx.closePath();
    ctx.fillStyle = layer.kind === 'photo' ? '#8a7fa8' : guideColor(doc.guides[layer.guide], 0.5);
    ctx.fill();
    if (layer.strokes.length) {
      ctx.save();
      ctx.clip();
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
