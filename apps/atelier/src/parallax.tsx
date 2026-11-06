/**
 * Vue 3D : chaque couche devient une plaque posée à sa hauteur au-dessus de la feuille.
 * On fait pivoter le document (souris, doigt, inclinaison de la tablette) et les couches glissent
 * les unes sur les autres. Rendu WebGL 2 (gl3d.ts : vraie épaisseur, lumière de la lampe, ombres
 * portées) ; sans WebGL 2, le navigateur fait la perspective en CSS 3D.
 */
import type { Format } from '@ftd/core';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Doc, Layer } from './model';
import { hexRGB, opacityOf } from './fx';
import { drawLampTint, drawLayers, forgetPaint, lampOf, levelOf, renderOrder, shadowVector } from './scene';
import { Gl3d, hasWebGL2, type GlView } from './gl3d';
import { layerBox } from './model';

interface Plate {
  /** Image de la couche, recadrée sur ce qu'elle couvre. */
  c: HTMLCanvasElement;
  /** Position du recadrage, en pixels de rendu. */
  x: number;
  y: number;
  /** Hauteur au-dessus de la feuille (0..1). */
  h: number;
  l?: Layer;
}

/** Ce que couvre une image : le plus petit cadre des pixels non transparents. */
function crop(src: HTMLCanvasElement): { x: number; y: number; w: number; h: number } | null {
  const { width: W, height: H } = src;
  const d = src.getContext('2d')!.getImageData(0, 0, W, H).data;
  let [x0, y0, x1, y1] = [W, H, -1, -1];
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++)
      if (d[(j * W + i) * 4 + 3]! > 2) {
        if (i < x0) x0 = i;
        if (i > x1) x1 = i;
        if (j < y0) y0 = j;
        if (j > y1) y1 = j;
      }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function buildPlates(doc: Doc, f: Format, r: number): Plate[] {
  const [W, H] = [Math.round(f.width * r), Math.round(f.height * r)];
  const page = () => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(r, 0, 0, r, 0, 0);
    return { c, ctx };
  };
  forgetPaint();
  const order = renderOrder(doc.layers).filter((l) => l.visible && opacityOf(l) > 0);
  // la feuille : les fonds, et la teinte de la lampe
  const base = page();
  base.ctx.fillStyle = '#fff';
  base.ctx.fillRect(0, 0, f.width, f.height);
  drawLayers(base.ctx, { ...doc, layers: order.filter((l) => l.kind === 'surface') }, f, { scale: r, onImage: () => {} });
  drawLampTint(base.ctx, doc, f);
  const plates: Plate[] = [{ c: base.c, x: 0, y: 0, h: 0 }];
  for (const l of order) {
    if (l.kind === 'surface') continue;
    // la couche seule, sans son ombre : l'ombre est posée à part, sur les plaques du dessous
    const one = page();
    drawLayers(one.ctx, { ...doc, layers: [{ ...l, height: 0, inner: 0, extrude: 0 }] }, f, { scale: r, onImage: () => {} });
    const b = crop(one.c);
    if (!b) continue;
    const c = document.createElement('canvas');
    c.width = b.w;
    c.height = b.h;
    c.getContext('2d')!.drawImage(one.c, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    plates.push({ c, x: b.x, y: b.y, h: topOf(l), l });
  }
  forgetPaint();
  return plates;
}

interface ShadowPiece {
  c: HTMLCanvasElement;
  x: number;
  y: number;
  /** Plaque qui la reçoit. */
  on: number;
}

/**
 * Ombres : celle de chaque couche tombe sur les plaques du dessous, décalée de la différence
 * de hauteur ; une plaque plus proche cache celles qui sont plus bas (comme dans le rendu à plat).
 */
function buildShadows(doc: Doc, f: Format, r: number, plates: Plate[]): ShadowPiece[] {
  const out: ShadowPiece[] = [];
  const q = 0.5; // les ombres sont floues : demi-résolution
  const [W, H] = [Math.round(f.width * r * q), Math.round(f.height * r * q)];
  for (let i = 1; i < plates.length; i++) {
    const L = plates[i]!;
    if (L.h <= 0.001 || !L.l) continue;
    const lb = layerBox(L.l, f);
    const covered = document.createElement('canvas');
    covered.width = W;
    covered.height = H;
    const cv = covered.getContext('2d')!;
    for (let j = i - 1; j >= 0; j--) {
      const P = plates[j]!;
      const dh = L.h - P.h;
      if (dh <= 0.001) continue;
      const s = shadowVector(doc, f, lb.cx, lb.cy, dh);
      const [dx, dy, blur] = [s.dx * r * q, s.dy * r * q, s.blur * r * q];
      const m = blur * 2 + 2;
      // l'ombre et la plaque se touchent-elles ?
      const [sx0, sy0, sx1, sy1] = [L.x * q + dx - m, L.y * q + dy - m, (L.x + L.c.width) * q + dx + m, (L.y + L.c.height) * q + dy + m];
      const [px0, py0, px1, py1] = [P.x * q, P.y * q, (P.x + P.c.width) * q, (P.y + P.c.height) * q];
      if (sx1 > px0 && sx0 < px1 && sy1 > py0 && sy0 < py1) {
        const pw = Math.max(1, Math.round(P.c.width * q));
        const ph = Math.max(1, Math.round(P.c.height * q));
        const c = document.createElement('canvas');
        c.width = pw;
        c.height = ph;
        const x = c.getContext('2d')!;
        x.filter = `blur(${Math.max(0.5, blur / 2)}px)`;
        x.drawImage(L.c, L.x * q + dx - px0, L.y * q + dy - py0, L.c.width * q, L.c.height * q);
        x.filter = 'none';
        x.globalCompositeOperation = 'source-in';
        x.fillStyle = `rgba(20, 16, 30, ${Math.min(0.62, 0.3 + 0.3 * dh)})`;
        x.fillRect(0, 0, pw, ph);
        // seulement sur la plaque, et pas là où une plaque plus haute l'a déjà reçue
        x.globalCompositeOperation = 'destination-in';
        x.drawImage(P.c, 0, 0, pw, ph);
        x.globalCompositeOperation = 'destination-out';
        x.drawImage(covered, -px0, -py0);
        out.push({ c, x: P.x, y: P.y, on: j });
      }
      cv.drawImage(P.c, P.x * q, P.y * q, P.c.width * q, P.c.height * q);
    }
  }
  return out;
}

/** Tranches dessinées sous chaque plaque. */
const SLICES = 10;
/** Épaisseur d'un objet découpé (en hauteur de page) : un carton, plus son volume et son biseau. */
function thicknessOf(l: Layer): number {
  return 0.035 + (l.volume ? l.volume.amount * 0.07 : 0) + (l.bevel ?? 0) * 0.025 + (l.extrude ?? 0) * EXTRUDE;
}
/** Extrusion à 1, en hauteur de page : le dessus monte d'autant, la tranche descend jusqu'à la feuille. */
const EXTRUDE = 0.5;
/** Hauteur du dessus d'une plaque. */
const topOf = (l: Layer) => Math.max(0, levelOf(l)) + (l.extrude ?? 0) * EXTRUDE;

/** Une plaque posée dans la vue : son image, ses tranches, et de quoi la retrouver sous le doigt. */
interface Placed {
  p: Plate;
  i: number;
  el: HTMLCanvasElement;
  slices: HTMLCanvasElement[];
}

export function ParallaxView({
  doc,
  f,
  onClose,
  start,
  selected,
  onSelect,
  onLevel,
}: {
  doc: Doc;
  f: Format;
  onClose: () => void;
  start?: [number, number];
  /** Objet choisi : il se règle en hauteur sans quitter la vue. */
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  onLevel?: (l: Layer, v: number) => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const placed = useRef<Placed[]>([]);
  const shadowEls = useRef<HTMLCanvasElement[]>([]);
  const geo = useRef<{ r: number; k: number; put: (c: HTMLCanvasElement, x: number, y: number, z: number, cls: string, scale?: number) => void } | null>(null);
  const [heightDrag, setHeightDrag] = useState(false);
  const [tilt, setTilt] = useState<[number, number]>(start ?? [0, 0]);
  // ouverte d'un geste (molette, trois doigts) : revenir de face la referme
  const peek = useRef(!!start);
  const [zoom, setZoom] = useState(1);
  // écartement des plaques : la hauteur réelle, exagérée pour bien voir
  const [spread, setSpread] = useState(2);
  const [gyro, setGyro] = useState(false);
  const [busy, setBusy] = useState(true);
  const [size, setSize] = useState<[number, number]>([0, 0]);
  const drag = useRef<{ x: number; y: number; t: [number, number] } | null>(null);
  const lastTap = useRef(0);
  const [dragging, setDragging] = useState(false);
  // WebGL 2 si l'appareil le permet ; sinon les plaques CSS
  const [useGl] = useState(hasWebGL2);
  const glCanvas = useRef<HTMLCanvasElement>(null);
  const gl = useRef<Gl3d | null>(null);
  /** Vue affichée (elle rejoint en douceur la vue demandée) et vue demandée. */
  const shown = useRef<GlView & { z: Map<string, number> }>({ tilt: [0, 0], zoom: 1, lift: 0, z: new Map() });
  const wanted = useRef<GlView & { z: Map<string, number>; t: Map<string, number> }>({ tilt: [0, 0], zoom: 1, lift: 0, z: new Map(), t: new Map() });
  const kick = useRef<() => void>(() => {});
  const heightRef = useRef(false);
  heightRef.current = heightDrag;

  /** Les plaques du document : à l'ouverture, puis à chaque changement de contenu (ajout, retouche, peinture). */
  const docRef = useRef(doc);
  docRef.current = doc;
  const build = (first: boolean) => {
    const doc = docRef.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const k = Math.min((vw * 0.72) / f.width, (vh * 0.7) / f.height);
    const r = k * Math.min(2, window.devicePixelRatio || 1);
    if (first) setSize([f.width * k, f.height * k]);
    if (useGl && glCanvas.current) {
      const plates = buildPlates(doc, f, r);
      let g = gl.current;
      if (!g) {
        try {
          g = new Gl3d(glCanvas.current);
        } catch {
          return;
        }
        gl.current = g;
      }
      const L = lampOf(doc);
      g.light = { x: L.x, y: L.y, z: L.z, color: hexRGB(L.color) };
      g.setPlates(
        [f.width, f.height],
        plates.map((p, i) => ({ img: p.c, x: p.x / r, y: p.y / r, w: p.c.width / r, h: p.c.height / r, z: p.h, t: i && p.l ? thicknessOf(p.l) : 0, page: !i, id: p.l?.id })),
      );
      for (const p of plates) if (p.l && !shown.current.z.has(p.l.id)) shown.current.z.set(p.l.id, p.h);
      placed.current = plates.map((p, i) => ({ p, i, el: p.c, slices: [] }));
      geo.current = { r, k, put: () => {} };
      setBusy(false);
      if (first && !start) requestAnimationFrame(() => setTilt([-14, 10]));
      kick.current();
      return;
    }
    const el = stage.current;
    if (!el) return;
    const plates = buildPlates(doc, f, r);
    const shadows = buildShadows(doc, f, r, plates);
    el.replaceChildren();
    const put = (c: HTMLCanvasElement, x: number, y: number, z: number, cls: string, scale = 1) => {
      c.className = cls;
      c.style.left = `${(x / r) * k}px`;
      c.style.top = `${(y / r) * k}px`;
      c.style.width = `${(c.width / r / scale) * k}px`;
      c.style.height = `${(c.height / r / scale) * k}px`;
      c.style.setProperty('--z', String(z));
      el.appendChild(c);
    };
    geo.current = { r, k, put };
    placed.current = [];
    plates.forEach((p, i) => {
      const slices: HTMLCanvasElement[] = [];
      // la tranche : des copies assombries empilées sous la plaque, comme un carton découpé
      if (i && p.l) {
        const t = thicknessOf(p.l);
        const n = SLICES;
        for (let j = 0; j < n; j++) {
          const c = document.createElement('canvas');
          c.width = p.c.width;
          c.height = p.c.height;
          const x = c.getContext('2d')!;
          x.filter = `brightness(${0.42 + (0.4 * j) / n})`;
          x.drawImage(p.c, 0, 0);
          put(c, p.x, p.y, Math.max(0.0004, p.h - t + (t * j) / n) + i * 0.0015, 'px-plate px-slice');
          slices.push(c);
        }
      }
      put(p.c, p.x, p.y, p.h + i * 0.0015, i ? 'px-plate' : 'px-plate px-page');
      placed.current.push({ p, i, el: p.c, slices });
    });
    shadowEls.current = [];
    for (const s of shadows) {
      put(s.c, s.x, s.y, plates[s.on]!.h + s.on * 0.0015 + 0.0008, 'px-plate px-shadow', 0.5);
      shadowEls.current.push(s.c);
    }
    setBusy(false);
    // une légère inclinaison d'entrée montre tout de suite l'épaisseur
    if (first && !start) requestAnimationFrame(() => setTilt([-14, 10]));
  };
  useEffect(() => {
    const id = window.setTimeout(() => build(true), 30);
    return () => {
      clearTimeout(id);
      gl.current?.dispose();
      gl.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // le contenu change pendant la vue (objet ajouté, retouché, peint) : on refait les plaques ;
  // la hauteur seule ne compte pas, elle se règle en direct
  const contentKey = JSON.stringify([doc.layers.map(({ height: _h, inner: _i, ...rest }) => rest), doc.guides, doc.lamp, doc.light]);
  const builtKey = useRef(contentKey);
  useEffect(() => {
    if (busy || builtKey.current === contentKey) return;
    const id = window.setTimeout(() => {
      builtKey.current = contentKey;
      build(false);
    }, 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey, busy]);

  // WebGL : le canevas suit la taille de la vue ; l'image rejoint en douceur la vue demandée
  useEffect(() => {
    if (!useGl) return;
    const c = glCanvas.current;
    if (!c) return;
    let raf = 0;
    const frame = () => {
      raf = 0;
      const g = gl.current;
      if (!g) return;
      const S = shown.current;
      const T = wanted.current;
      let moving = false;
      const step = (a: number, b: number, k: number) => {
        if (Math.abs(b - a) < 1e-3) return b;
        moving = true;
        return a + (b - a) * k;
      };
      const k = drag.current ? 0.55 : 0.14;
      S.tilt = [step(S.tilt[0], T.tilt[0], k), step(S.tilt[1], T.tilt[1], k)];
      S.zoom = step(S.zoom, T.zoom, 0.2);
      S.lift = S.lift ? step(S.lift, T.lift, 0.2) : T.lift;
      for (const [id, z] of T.z) {
        const v = step(S.z.get(id) ?? z, z, heightRef.current ? 0.5 : 0.15);
        S.z.set(id, v);
        g.setLevel(id, v, T.t.get(id) ?? 0);
      }
      g.render({ tilt: S.tilt, zoom: S.zoom, lift: S.lift, selected: T.selected });
      if (moving) raf = requestAnimationFrame(frame);
    };
    kick.current = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const fit = () => {
      const b = c.getBoundingClientRect();
      const d = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.max(1, Math.round(b.width * d));
      c.height = Math.max(1, Math.round(b.height * d));
      kick.current();
    };
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    fit();
    return () => {
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // la vue demandée suit l'inclinaison, le zoom et l'écartement
  useEffect(() => {
    const T = wanted.current;
    T.tilt = tilt;
    T.zoom = zoom;
    T.lift = Math.min(f.width, f.height) * 0.12 * spread;
    kick.current();
  }, [tilt, zoom, spread, busy, f]);

  // les hauteurs suivent le document (réglage en direct) ; les ombres se refont au repos
  useEffect(() => {
    if (busy) return;
    if (gl.current) {
      const T = wanted.current;
      for (const l of doc.layers) {
        if (l.kind === 'surface') continue;
        T.z.set(l.id, topOf(l));
        T.t.set(l.id, thicknessOf(l));
      }
      T.selected = selected ?? null;
      kick.current();
      return;
    }
    const byId = new Map(doc.layers.map((l) => [l.id, l]));
    for (const P of placed.current) {
      if (!P.p.l) continue;
      const l = byId.get(P.p.l.id);
      if (!l) continue;
      P.p.l = l;
      P.p.h = topOf(l);
      P.el.style.setProperty('--z', String(P.p.h + P.i * 0.0015));
      const t = thicknessOf(l);
      P.slices.forEach((c, j) => c.style.setProperty('--z', String(Math.max(0.0004, P.p.h - t + (t * j) / P.slices.length) + P.i * 0.0015)));
      P.el.classList.toggle('px-sel', l.id === selected);
    }
    const id = window.setTimeout(() => {
      const g = geo.current;
      if (!g || heightDrag) return;
      for (const c of shadowEls.current) c.remove();
      shadowEls.current = [];
      const plates = placed.current.map((P) => P.p);
      for (const s of buildShadows(doc, f, g.r, plates)) {
        g.put(s.c, s.x, s.y, plates[s.on]!.h + s.on * 0.0015 + 0.0008, 'px-plate px-shadow', 0.5);
        shadowEls.current.push(s.c);
      }
    }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.layers, selected, busy, heightDrag]);

  /**
   * L'objet sous le doigt : le rayon de l'œil traverse les plaques de la plus haute à la plus basse ;
   * la première dont le pixel touché est plein l'emporte.
   */
  const pickAt = (cx: number, cy: number): string | null => {
    const g3 = gl.current;
    const cv = glCanvas.current;
    if (g3 && cv) {
      const b = cv.getBoundingClientRect();
      const S = shown.current;
      return g3.pickAt(((cx - b.left) / b.width) * cv.width, ((cy - b.top) / b.height) * cv.height, { tilt: S.tilt, zoom: S.zoom, lift: S.lift });
    }
    const host = stage.current?.parentElement;
    const g = geo.current;
    if (!host || !g) return null;
    const box = host.getBoundingClientRect();
    const P = 1800;
    const [sx, sy] = [cx - (box.left + box.width / 2), cy - (box.top + box.height / 2)];
    const [ax, ay] = [(tilt[1] * Math.PI) / 180, (tilt[0] * Math.PI) / 180];
    // M = échelle · rotateX · rotateY (repère CSS : y vers le bas, z vers l'œil)
    const M = (x: number, y: number, z: number): [number, number, number] => {
      const [x1, z1] = [x * Math.cos(ay) + z * Math.sin(ay), -x * Math.sin(ay) + z * Math.cos(ay)];
      const [y2, z2] = [y * Math.cos(ax) - z1 * Math.sin(ax), y * Math.sin(ax) + z1 * Math.cos(ax)];
      return [x1 * zoom, y2 * zoom, z2 * zoom];
    };
    const Minv = (x: number, y: number, z: number): [number, number, number] => {
      [x, y, z] = [x / zoom, y / zoom, z / zoom];
      const [y1, z1] = [y * Math.cos(ax) + z * Math.sin(ax), -y * Math.sin(ax) + z * Math.cos(ax)];
      return [x * Math.cos(ay) - z1 * Math.sin(ay), y1, x * Math.sin(ay) + z1 * Math.cos(ay)];
    };
    const lift = Math.min(size[0], size[1]) * 0.12 * spread;
    const n = M(0, 0, 1);
    const order = [...placed.current].filter((x) => x.p.l).sort((a, b) => b.p.h + b.i * 0.0015 - (a.p.h + a.i * 0.0015));
    for (const Q of order) {
      const z0 = (Q.p.h + Q.i * 0.0015) * lift;
      const o = M(0, 0, z0);
      // rayon : de l'œil (0, 0, P) vers le point de l'écran (sx, sy, 0)
      const d: [number, number, number] = [sx, sy, -P];
      const den = n[0] * d[0] + n[1] * d[1] + n[2] * d[2];
      if (Math.abs(den) < 1e-9) continue;
      const tt = (n[0] * o[0] + n[1] * o[1] + n[2] * (o[2] - P)) / den;
      const w = [d[0] * tt, d[1] * tt, P + d[2] * tt] as const;
      const [u, v] = Minv(w[0], w[1], w[2]);
      // repère de la plaque : pixels de rendu depuis son coin
      const px = ((u + size[0] / 2) / g.k) * g.r - Q.p.x;
      const py = ((v + size[1] / 2) / g.k) * g.r - Q.p.y;
      if (px < 0 || py < 0 || px >= Q.el.width || py >= Q.el.height) continue;
      const a = Q.el.getContext('2d')!.getImageData(Math.floor(px), Math.floor(py), 1, 1).data[3]!;
      if (a > 24) return Q.p.l!.id;
    }
    return null;
  };
  const tapAt = useRef<{ x: number; y: number } | null>(null);

  // tablette : on penche l'appareil, le document suit
  useEffect(() => {
    if (!gyro) return;
    let ref: [number, number] | null = null;
    const on = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      ref ??= [e.beta, e.gamma];
      const clamp = (v: number) => Math.max(-50, Math.min(50, v));
      setTilt([clamp((e.gamma - ref[1]) * 1.2), clamp(-(e.beta - ref[0]) * 1.2)]);
    };
    window.addEventListener('deviceorientation', on);
    return () => window.removeEventListener('deviceorientation', on);
  }, [gyro]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const askGyro = async () => {
    if (gyro) return setGyro(false);
    const D = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    try {
      if (D.requestPermission && (await D.requestPermission()) !== 'granted') return;
      setGyro(true);
    } catch {
      /* refusé : on reste au doigt et à la souris */
    }
  };

  const minPx = Math.min(size[0], size[1]);
  const selLayer = selected ? doc.layers.find((l) => l.id === selected && l.kind !== 'surface') : undefined;
  // ouverte d'un geste : dans l'atelier, sous ses barres et panneaux (l'édition reste là) ;
  // depuis le menu : posée sur la page entière
  const inline = !!start;
  const view = (
    <div
      className={`px3d ${inline ? 'px-inline' : ''} ${dragging || gyro ? 'dragging' : ''}`}
      onPointerDown={(e) => {
        if ((e.target as Element).closest('.px-bar')) return;
        const now = performance.now();
        if (now - lastTap.current < 300) {
          setTilt([0, 0]);
          setZoom(1);
          lastTap.current = 0;
          return;
        }
        lastTap.current = now;
        tapAt.current = { x: e.clientX, y: e.clientY };
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, t: tilt };
        setDragging(true);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const clamp = (v: number) => Math.max(-70, Math.min(70, v));
        setTilt([clamp(d.t[0] + (e.clientX - d.x) * 0.3), clamp(d.t[1] - (e.clientY - d.y) * 0.3)]);
      }}
      onPointerUp={(e) => {
        drag.current = null;
        setDragging(false);
        const t0 = tapAt.current;
        tapAt.current = null;
        if (t0 && onSelect && Math.hypot(e.clientX - t0.x, e.clientY - t0.y) < 6) {
          // un toucher : choisir l'objet (ou rien) ; un glisser : tourner
          onSelect(pickAt(e.clientX, e.clientY));
          return;
        }
        if (peek.current && Math.abs(tilt[0]) < 3 && Math.abs(tilt[1]) < 3) onClose();
      }}
      onPointerCancel={() => ((drag.current = null), setDragging(false))}
      onWheel={(e) => {
        // Maj + molette ou défilement horizontal : tourner ; molette : zoomer
        if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
          const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
          setTilt(([x, y]) => {
            const nx = Math.max(-70, Math.min(70, x + d * 0.15));
            if (peek.current && Math.abs(nx) < 1.5 && Math.abs(y) < 1.5) onClose();
            return [nx, y];
          });
        } else setZoom((z) => Math.max(0.4, Math.min(3, z * Math.exp(-e.deltaY * 0.0015))));
      }}
    >
      {useGl && <canvas ref={glCanvas} className="px-gl" />}
      <div
        ref={stage}
        className="px-stage"
        style={
          {
            width: size[0],
            height: size[1],
            '--lift': `${minPx * 0.12 * spread}px`,
            transform: `scale(${zoom}) rotateX(${tilt[1]}deg) rotateY(${tilt[0]}deg)`,
          } as React.CSSProperties
        }
      />
      {busy && <div className="px-busy">Mise en volume…</div>}
      {!inline && selLayer && onLevel && (
        <div className="px-height" onPointerDown={(e) => e.stopPropagation()}>
          <span className="px-hname">{selLayer.name}</span>
          <input
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={selLayer.height - (selLayer.inner ?? 0)}
            onPointerDown={() => setHeightDrag(true)}
            onPointerUp={() => setHeightDrag(false)}
            onChange={(e) => {
              const v = Number(e.target.value);
              onLevel(selLayer, Math.abs(v) < 0.03 ? 0 : Math.round(v * 100) / 100);
            }}
            aria-label="Hauteur"
          />
          <span className="px-hlabel">Hauteur {Math.round((selLayer.height - (selLayer.inner ?? 0)) * 100)}</span>
        </div>
      )}
      {!inline && (
        <div className="px-bar">
          <label className="px-spread" title="Écartement des couches : leur hauteur réelle, exagérée pour mieux voir">
            <span>Écartement</span>
            <input type="range" min={0} max={6} step={0.1} value={spread} onChange={(e) => setSpread(Number(e.target.value))} />
          </label>
          {'DeviceOrientationEvent' in window && (
            <button className={`chip ${gyro ? 'on' : ''}`} onClick={askGyro} title="Pencher la tablette pour faire tourner le document">
              Inclinaison
            </button>
          )}
          <button className="chip" onClick={() => (setTilt([0, 0]), setZoom(1))} title="Revenir de face (ou toucher deux fois)">
            De face
          </button>
          <button className="chip" onClick={onClose}>
            Retour
          </button>
        </div>
      )}
    </div>
  );
  return inline ? view : createPortal(view, document.body);
}

/**
 * Aperçu incliné, pendant le réglage de la hauteur : la page en petit, vue de biais, et les
 * plaques qui montent ou descendent avec le curseur. Les images se font une fois à l'ouverture,
 * seules les hauteurs suivent ensuite.
 */
export function HeightPeek({ doc, f, focus }: { doc: Doc; f: Format; focus: string[] }) {
  const stage = useRef<HTMLDivElement>(null);
  const els = useRef(new Map<string, HTMLCanvasElement>());
  const k = Math.min(170 / f.width, 190 / f.height);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => {
      const el = stage.current;
      if (!el) return;
      const r = k * Math.min(2, window.devicePixelRatio || 1);
      el.replaceChildren();
      els.current.clear();
      buildPlates(doc, f, r).forEach((p, i) => {
        const c = p.c;
        c.className = i ? 'px-plate' : 'px-plate px-page';
        c.style.left = `${(p.x / r) * k}px`;
        c.style.top = `${(p.y / r) * k}px`;
        c.style.width = `${(c.width / r) * k}px`;
        c.style.height = `${(c.height / r) * k}px`;
        c.style.setProperty('--z', String(p.h + i * 0.0015));
        c.dataset.i = String(i);
        if (p.l) {
          els.current.set(p.l.id, c);
          if (!focus.includes(p.l.id)) c.classList.add('px-dim');
          else {
            // l'ombre de l'objet réglé, posée sur la feuille : l'écart dit la hauteur
            const sh = document.createElement('canvas');
            sh.width = c.width;
            sh.height = c.height;
            sh.getContext('2d')!.drawImage(c, 0, 0);
            sh.className = 'px-plate hp-shadow';
            for (const k of ['left', 'top', 'width', 'height'] as const) sh.style[k] = c.style[k];
            sh.style.setProperty('--z', '0.0005');
            el.appendChild(sh);
          }
        }
        el.appendChild(c);
      });
      setReady(true);
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // les hauteurs suivent le curseur
  useEffect(() => {
    for (const l of doc.layers) {
      const c = els.current.get(l.id);
      if (c) c.style.setProperty('--z', String(Math.max(0, levelOf(l)) + Number(c.dataset.i) * 0.0015));
    }
  }, [doc.layers, ready]);
  const minPx = Math.min(f.width, f.height) * k;
  return (
    <div className="hpeek" aria-hidden>
      <div ref={stage} className="px-stage" style={{ width: f.width * k, height: f.height * k, '--lift': `${minPx * 0.9}px`, transform: 'rotateX(52deg) rotateZ(-22deg)' } as React.CSSProperties} />
    </div>
  );
}
