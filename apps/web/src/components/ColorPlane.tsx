import { gamutMap, gradientStops, hexToOklch, oklabToRgb8, oklchToHex, type Oklch } from '@ftd/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SunIcon } from './Icons';

/** Saturation (chroma OKLCH) au bord de la roue. */
const CMAX = 0.27;
const SIZE = 248;
const RES = 124; // résolution du calcul, agrandie à l'affichage

export type PickMode = 'point' | 'line' | 'harmony';

interface Props {
  /** Couleurs de la sélection : seules elles sont montrées sur la roue. */
  colors: string[];
  /** Couleur active de la sélection (repère). */
  active?: number;
  mode: PickMode;
  l: number;
  onL: (l: number) => void;
  steps: number;
  ramp: boolean;
  /** Toucher ou glisser (point, harmonie) ; `done` au lâcher. */
  onPick: (hex: string, done: boolean) => void;
  /** Ligne tracée (mode linéaire). */
  onGradient: (stops: string[]) => void;
}

type Pt = { x: number; y: number };

const toPlane = (p: Pt) => {
  const r = SIZE / 2;
  return { A: ((p.x - r) / r) * CMAX, B: ((r - p.y) / r) * CMAX };
};
const fromLch = (c: Oklch): Pt => {
  const r = SIZE / 2;
  const k = Math.min(c.c, CMAX) / CMAX;
  const a = (c.h * Math.PI) / 180;
  return { x: r + Math.cos(a) * k * r, y: r - Math.sin(a) * k * r };
};
/** Ramène un point glissé hors de la roue sur son bord. */
const clampDisc = (p: Pt): Pt => {
  const r = SIZE / 2;
  const d = Math.hypot(p.x - r, p.y - r);
  return d <= r ? p : { x: r + ((p.x - r) / d) * r, y: r + ((p.y - r) / d) * r };
};
const lchAt = (p: Pt, l: number): Oklch => {
  const { A, B } = toPlane(p);
  return { l, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
};

/**
 * Plan de couleur OKLCH : la roue montre teinte (angle) et saturation (rayon)
 * pour une clarté donnée. Les zones grises ne sont pas affichables.
 * Toucher choisit une couleur ; tracer une ligne donne un dégradé.
 */
export function ColorPlane({ colors, active, mode, l, onL, steps, ramp, onPick, onGradient }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [line, setLine] = useState<{ a: Pt; b: Pt } | null>(null);
  const drag = useRef<{ start: Pt; moved: boolean } | null>(null);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(RES, RES);
    for (let y = 0; y < RES; y++)
      for (let x = 0; x < RES; x++) {
        const i = (y * RES + x) * 4;
        const p = { x: ((x + 0.5) / RES) * SIZE, y: ((y + 0.5) / RES) * SIZE };
        const inDisc = Math.hypot(p.x - SIZE / 2, p.y - SIZE / 2) <= SIZE / 2;
        const { A, B } = toPlane(p);
        const rgb = inDisc ? oklabToRgb8(l, A, B) : null;
        if (rgb) {
          img.data[i] = rgb[0];
          img.data[i + 1] = rgb[1];
          img.data[i + 2] = rgb[2];
          img.data[i + 3] = 255;
        } else if (inDisc) {
          // hors gamut : gris de même clarté, très atténué
          const g = Math.round(255 * l);
          img.data.set([g, g, g, 40], i);
        }
      }
    ctx.putImageData(img, 0, 0);
  }, [l]);

  const ends = (seg: { a: Pt; b: Pt }): [Oklch, Oklch] => {
    const d = ramp ? 0.18 : 0;
    return [lchAt(seg.a, Math.min(0.98, l + d)), lchAt(seg.b, Math.max(0.05, l - d))];
  };
  useEffect(() => {
    if (mode !== 'line') setLine(null);
  }, [mode]);
  const stops = useMemo(() => (line ? gradientStops(...ends(line), steps) : null), [line, steps, ramp, l]);
  // nombre de teintes, clarté : la ligne tracée se recalcule en direct
  useEffect(() => {
    if (stops && !drag.current) onGradient(stops);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, ramp, l]);

  const local = (e: React.PointerEvent): Pt => {
    const r = (e.currentTarget as Element).getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * SIZE, y: ((e.clientY - r.top) / r.height) * SIZE };
  };

  const pick = (p: Pt) => oklchToHex(gamutMap(lchAt(clampDisc(p), l)));
  const pts = colors.map((hex) => fromLch(hexToOklch(hex)));

  return (
    <div className="color-plane">
      <div className="plane-wrap">
        <canvas ref={canvas} width={RES} height={RES} className="plane-canvas" />
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="plane-overlay"
          onPointerDown={(e) => {
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
            drag.current = { start: local(e), moved: false };
            if (mode !== 'line') onPick(pick(local(e)), false);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const p = local(e);
            if (mode !== 'line') {
              onPick(pick(p), false);
              return;
            }
            if (!d.moved && Math.hypot(p.x - d.start.x, p.y - d.start.y) < 8) return;
            d.moved = true;
            setLine({ a: d.start, b: p });
          }}
          onPointerUp={(e) => {
            const d = drag.current;
            drag.current = null;
            if (!d) return;
            if (mode !== 'line') onPick(pick(local(e)), true);
            else if (d.moved) {
              const seg = { a: d.start, b: local(e) };
              setLine(seg);
              onGradient(gradientStops(...ends(seg), steps));
            }
          }}
        >
          <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - 0.5} className="plane-rim" />
          {/* la sélection, dans son ordre : reliée en polygone (harmonie) ou en chemin */}
          {!line && pts.length > 1 &&
            (mode === 'harmony' ? (
              <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} className="plane-harmony" />
            ) : (
              <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} className="plane-path" />
            ))}
          {!line && active !== undefined && pts[active] && <circle cx={pts[active]!.x} cy={pts[active]!.y} r={12} className="plane-current" />}
          {!line && colors.map((hex, i) => <circle key={i} cx={pts[i]!.x} cy={pts[i]!.y} r={7} fill={hex} className="plane-color" />)}
          {line && stops && (
            <g pointerEvents="none">
              <line x1={line.a.x} y1={line.a.y} x2={line.b.x} y2={line.b.y} className="plane-line" />
              {stops.map((hex, i) => {
                const t = i / (stops.length - 1);
                return (
                  <circle
                    key={i}
                    cx={line.a.x + (line.b.x - line.a.x) * t}
                    cy={line.a.y + (line.b.y - line.a.y) * t}
                    r={5.5}
                    fill={hex}
                    className="plane-stop"
                  />
                );
              })}
            </g>
          )}
        </svg>
      </div>
      <div className="lightness">
        <SunIcon dim />
        <input
          type="range"
          min={0.08}
          max={0.98}
          step={0.01}
          value={l}
          onChange={(e) => onL(Number(e.target.value))}
          aria-label="Clarté"
          title={`Clarté ${Math.round(l * 100)} %`}
        />
        <SunIcon />
        <strong className="lightness-value">{Math.round(l * 100)}</strong>
      </div>
    </div>
  );
}
