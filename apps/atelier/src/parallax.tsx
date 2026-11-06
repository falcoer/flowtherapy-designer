/**
 * Vue 3D : chaque couche devient une plaque posée à sa hauteur au-dessus de la feuille.
 * On fait pivoter le document (souris, doigt, inclinaison de la tablette) et les couches glissent
 * les unes sur les autres. Le navigateur fait la perspective (CSS 3D) ; au passage à WebGL, les
 * plaques et leurs hauteurs se reprennent telles quelles.
 */
import type { Format } from '@ftd/core';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Doc, Layer } from './model';
import { opacityOf } from './fx';
import { drawLampTint, drawLayers, forgetPaint, levelOf, renderOrder, shadowVector } from './scene';
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
    drawLayers(one.ctx, { ...doc, layers: [{ ...l, height: 0, inner: 0 }] }, f, { scale: r, onImage: () => {} });
    const b = crop(one.c);
    if (!b) continue;
    const c = document.createElement('canvas');
    c.width = b.w;
    c.height = b.h;
    c.getContext('2d')!.drawImage(one.c, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    plates.push({ c, x: b.x, y: b.y, h: Math.max(0, levelOf(l)), l });
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

export function ParallaxView({ doc, f, onClose, start }: { doc: Doc; f: Format; onClose: () => void; start?: [number, number] }) {
  const stage = useRef<HTMLDivElement>(null);
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

  // le document se construit une fois à l'ouverture
  useEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const k = Math.min((vw * 0.72) / f.width, (vh * 0.7) / f.height);
    const r = k * Math.min(2, window.devicePixelRatio || 1);
    setSize([f.width * k, f.height * k]);
    const id = window.setTimeout(() => {
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
      plates.forEach((p, i) => put(p.c, p.x, p.y, p.h + i * 0.0015, i ? 'px-plate' : 'px-plate px-page'));
      for (const s of shadows) put(s.c, s.x, s.y, plates[s.on]!.h + s.on * 0.0015 + 0.0008, 'px-plate px-shadow', 0.5);
      setBusy(false);
      // une légère inclinaison d'entrée montre tout de suite l'épaisseur
      if (!start) requestAnimationFrame(() => setTilt([-14, 10]));
    }, 30);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  // posée sur la page entière, hors des cadres de l'atelier
  return createPortal(
    <div
      className={`px3d ${dragging || gyro ? 'dragging' : ''}`}
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
      onPointerUp={() => {
        drag.current = null;
        setDragging(false);
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
    </div>,
    document.body,
  );
}
