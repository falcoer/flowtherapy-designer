import { gamutMap, gradientStops, hexToOklch, oklabToRgb8, oklchToHex, type Oklch } from '@ftd/core';
import { useEffect, useMemo, useRef, useState } from 'react';

/** Saturation (chroma OKLCH) au bord de la roue. */
const CMAX = 0.27;
const SIZE = 248;
const RES = 124; // résolution du calcul, agrandie à l'affichage

interface Props {
  /** Couleurs de la palette, placées sur la roue. */
  colors: string[];
  /** Couleur de base des harmonies (dessinées en pointillés). */
  harmony: string[];
  onPick: (hex: string) => void;
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
const lchAt = (p: Pt, l: number): Oklch => {
  const { A, B } = toPlane(p);
  return { l, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
};

/**
 * Plan de couleur OKLCH : la roue montre teinte (angle) et saturation (rayon)
 * pour une clarté donnée. Les zones grises ne sont pas affichables.
 * Toucher choisit une couleur ; tracer une ligne donne un dégradé.
 */
export function ColorPlane({ colors, harmony, onPick, onGradient }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [l, setL] = useState(0.72);
  const [steps, setSteps] = useState(5);
  const [ramp, setRamp] = useState(false);
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
  const stops = useMemo(() => (line ? gradientStops(...ends(line), steps) : null), [line, steps, ramp, l]);
  useEffect(() => {
    if (stops && !drag.current) onGradient(stops);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops]);

  const local = (e: React.PointerEvent): Pt => {
    const r = (e.currentTarget as Element).getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * SIZE, y: ((e.clientY - r.top) / r.height) * SIZE };
  };

  const harmonyPts = harmony.map((hex) => fromLch(hexToOklch(hex)));

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
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const p = local(e);
            if (!d.moved && Math.hypot(p.x - d.start.x, p.y - d.start.y) < 8) return;
            d.moved = true;
            setLine({ a: d.start, b: p });
          }}
          onPointerUp={(e) => {
            const d = drag.current;
            drag.current = null;
            if (!d) return;
            if (d.moved) {
              const seg = { a: d.start, b: local(e) };
              setLine(seg);
              onGradient(gradientStops(...ends(seg), steps));
            } else {
              setLine(null);
              onPick(oklchToHex(gamutMap(lchAt(d.start, l))));
            }
          }}
        >
          <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - 0.5} className="plane-rim" />
          {harmonyPts.length > 1 && <polygon points={harmonyPts.map((p) => `${p.x},${p.y}`).join(' ')} className="plane-harmony" />}
          {harmonyPts.map((p, i) => (
            <circle key={`h${i}`} cx={p.x} cy={p.y} r={4} className="plane-harmony-dot" />
          ))}
          {colors.map((hex, i) => {
            const p = fromLch(hexToOklch(hex));
            return <circle key={i} cx={p.x} cy={p.y} r={7} fill={hex} className="plane-color" />;
          })}
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
      <label className="plane-row">
        <span>Clarté</span>
        <input type="range" min={0.08} max={0.98} step={0.01} value={l} onChange={(e) => setL(Number(e.target.value))} />
        <strong>{Math.round(l * 100)} %</strong>
      </label>
      <div className="plane-row">
        <span>Dégradé</span>
        <div className="stepper">
          <button onClick={() => setSteps((s) => Math.max(2, s - 1))} disabled={steps <= 2} aria-label="Moins d'étapes">
            −
          </button>
          <strong>{steps}</strong>
          <button onClick={() => setSteps((s) => Math.min(9, s + 1))} disabled={steps >= 9} aria-label="Plus d'étapes">
            +
          </button>
        </div>
        <label className="plane-check">
          <input type="checkbox" checked={ramp} onChange={(e) => setRamp(e.target.checked)} /> clair → foncé
        </label>
      </div>
      <p className="hint">Touche la roue pour choisir une couleur, trace une ligne pour obtenir un dégradé.</p>
    </div>
  );
}
