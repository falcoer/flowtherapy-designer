import { gradientStops, harmonies, hexToOklch, maxChroma, oklabToRgb8, oklchToHex, type Oklch } from '@ftd/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Blend } from './model';

/**
 * Éditeur de couleur de la palette : un plan carré (teinte en largeur, clarté en hauteur),
 * en grille de cases ou en spectre continu ; la saturation du plan se règle au curseur.
 * Toucher remplace la teinte choisie, double toucher en ajoute une, tracer une ligne prend
 * plusieurs couleurs d'un coup (un dégradé), garder le doigt appuyé propose les harmonies.
 * À droite, les teintes du guide en tuiles, dans leur ordre, à réordonner en glissant.
 */

type Pt = { x: number; y: number };
const RES = 120;
/** Grille : une colonne de gris puis les teintes, 9 clartés. */
const ROWS = 9;

export type PlaneMode = 'grid' | 'spectrum';
/** Nature du plan : saturation, clarté moyenne, contraste (étendue des clartés), étendue des teintes, cases de la grille. */
export interface Plane {
  mode: PlaneMode;
  sat: number;
  light: number;
  contrast: number;
  /** Étendue des teintes en degrés (360 = toutes), centrée sur hue0. */
  hues: number;
  hue0: number;
  cols: number;
}
const PLANE = 'ftd-atelier-plane';
const DEFAULT: Plane = { mode: 'grid', sat: 0.85, light: 0.5, contrast: 1, hues: 360, hue0: 180, cols: 12 };

const range = (p: Plane) => {
  const c = 0.15 + 0.7 * p.light;
  const w = 0.15 + 0.7 * p.contrast;
  return [Math.min(0.98, c + w / 2), Math.max(0.05, c - w / 2)] as const;
};
const hueAt = (p: Plane, u: number) => (((p.hue0 - p.hues / 2 + u * p.hues) % 360) + 360) % 360;
/** Couleur d'un point du plan (u, v en 0..1). */
function colorAt(u: number, v: number, p: Plane): Oklch {
  const [top, bot] = range(p);
  const lAt = (t: number) => top - t * (top - bot);
  const cu = Math.max(0, Math.min(1, u));
  if (p.mode === 'grid') {
    const n = p.cols + 1;
    const col = Math.min(n - 1, Math.floor(cu * n));
    const row = Math.min(ROWS - 1, Math.max(0, Math.floor(v * ROWS)));
    const l = lAt((row + 0.5) / ROWS);
    if (col === 0) return { l, c: 0, h: 0 };
    const h = hueAt(p, p.hues >= 360 ? (col - 1) / p.cols : (col - 0.5) / p.cols);
    return { l, c: p.sat * maxChroma(l, h), h };
  }
  const l = lAt(Math.max(0, Math.min(1, v)));
  const h = hueAt(p, cu);
  return { l, c: p.sat * maxChroma(l, h), h };
}
/** Place d'une couleur sur le plan ; null si le plan ne la montre pas. */
function placeOf(hex: string, p: Plane): Pt | null {
  const c = hexToOklch(hex);
  const [top, bot] = range(p);
  const v = (top - c.l) / (top - bot);
  if (v < -0.05 || v > 1.05) return null;
  const vv = Math.max(0, Math.min(1, v));
  const grey = c.c < 0.02;
  let u = ((((c.h - (p.hue0 - p.hues / 2)) % 360) + 360) % 360) / p.hues;
  if (!grey && u > 1.001) return null;
  if (p.mode === 'grid') {
    const n = p.cols + 1;
    const col = grey ? 0 : 1 + Math.min(p.cols - 1, p.hues >= 360 ? Math.round(u * p.cols) % p.cols : Math.floor(u * p.cols));
    return { x: (col + 0.5) / n, y: (Math.min(ROWS - 1, Math.floor(vv * ROWS)) + 0.5) / ROWS };
  }
  if (grey) u = 0;
  return { x: u, y: vv };
}

const HARMONIES: Array<[keyof ReturnType<typeof harmonies>, string]> = [
  ['complementary', 'Duo complémentaire'],
  ['triadic', 'Trio (triade)'],
  ['tetradic', 'Quatuor (tétrade)'],
  ['split', 'Complémentaires voisines'],
  ['analogous', 'Analogues'],
  ['tints', 'Camaïeu'],
];

export function PaletteEditor({ stops, blend, onBlend, onChange: emit }: { stops: string[]; blend: Blend; onBlend: (b: Blend) => void; onChange: (stops: string[], commit: boolean) => void }) {
  // pendant un glissé, la page n'est repeinte qu'une fois par image affichée
  const pending = useRef<{ stops: string[]; raf: number } | null>(null);
  const onChange = (next: string[], commit: boolean) => {
    if (commit) {
      if (pending.current) cancelAnimationFrame(pending.current.raf);
      pending.current = null;
      emit(next, true);
      return;
    }
    if (pending.current) {
      pending.current.stops = next;
      return;
    }
    pending.current = {
      stops: next,
      raf: requestAnimationFrame(() => {
        const p = pending.current;
        pending.current = null;
        if (p) emit(p.stops, false);
      }),
    };
  };
  const [pl, setPlaneRaw] = useState<Plane>(() => {
    try {
      return { ...DEFAULT, ...JSON.parse(localStorage.getItem(PLANE) ?? '{}'), cols: DEFAULT.cols };
    } catch {
      return DEFAULT;
    }
  });
  const setPlane = (patch: Partial<Plane>) =>
    setPlaneRaw((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(PLANE, JSON.stringify(next));
      } catch {
        /* stockage indisponible */
      }
      return next;
    });
  const mode = pl.mode;
  const setMode = (m: PlaneMode) => setPlane({ mode: m });
  // un tracé prend cinq couleurs, le passage de l'une à l'autre se règle par la transition
  const steps = 5;
  const [sel, setSel] = useState(0);
  const i = Math.min(sel, stops.length - 1);
  const [line, setLine] = useState<{ a: Pt; b: Pt } | null>(null);
  const [harm, setHarm] = useState<{ base: string; at: Pt } | null>(null);
  const plane = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const press = useRef<{ start: Pt; moved: boolean; held: boolean; timer: number; before: string[] } | null>(null);
  const lastTap = useRef<{ t: number; p: Pt; before: string[] } | null>(null);

  // le plan, repeint quand la saturation ou le mode change
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(RES, RES);
    for (let y = 0; y < RES; y++)
      for (let x = 0; x < RES; x++) {
        const c = colorAt((x + 0.5) / RES, (y + 0.5) / RES, pl);
        const hr = (c.h * Math.PI) / 180;
        const rgb = oklabToRgb8(c.l, c.c * Math.cos(hr), c.c * Math.sin(hr)) ?? [128, 128, 128];
        img.data.set([rgb[0], rgb[1], rgb[2], 255], (y * RES + x) * 4);
      }
    ctx.putImageData(img, 0, 0);
  }, [pl]);

  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = plane.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) };
  };
  const hexAt = (p: Pt) => oklchToHex(colorAt(p.x, p.y, pl));
  const lineStops = (a: Pt, b: Pt) => gradientStops(colorAt(a.x, a.y, pl), colorAt(b.x, b.y, pl), steps);
  const setAt = (j: number, c: string, commit: boolean) =>
    onChange(
      stops.map((x, k) => (k === j ? c : x)),
      commit,
    );

  const marks = useMemo(() => stops.map((c) => placeOf(c, pl)), [stops, pl]);
  const harmSets = harm ? HARMONIES.map(([k, name]) => ({ name, colors: [harm.base, ...harmonies(harm.base)[k]] })) : [];

  return (
    <div className="pe">
      <div className="pe-head">
        <div className="seg pe-mode">
          <button className={mode === 'grid' ? 'on' : ''} onClick={() => setMode('grid')}>
            Grille
          </button>
          <button className={mode === 'spectrum' ? 'on' : ''} onClick={() => setMode('spectrum')}>
            Spectre
          </button>
        </div>
      </div>
      <div
        ref={plane}
        className={`pe-plane ${mode}`}
        onPointerDown={(e) => {
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          const p = local(e);
          setHarm(null);
          const timer = window.setTimeout(() => {
            const d = press.current;
            if (!d || d.moved) return;
            d.held = true;
            // doigt gardé : la teinte choisie reste comme avant, on propose ses harmonies
            onChange(d.before, false);
            setHarm({ base: hexAt(d.start), at: d.start });
          }, 520);
          press.current = { start: p, moved: false, held: false, timer, before: stops };
          setAt(i, hexAt(p), true);
        }}
        onPointerMove={(e) => {
          const d = press.current;
          if (!d || d.held) return;
          const p = local(e);
          const r = plane.current!.getBoundingClientRect();
          if (!d.moved && Math.hypot((p.x - d.start.x) * r.width, (p.y - d.start.y) * r.height) > 10) {
            d.moved = true;
            clearTimeout(d.timer);
          }
          if (d.moved) {
            setLine({ a: d.start, b: p });
            onChange(lineStops(d.start, p), false);
          }
        }}
        onPointerUp={(e) => {
          const d = press.current;
          press.current = null;
          if (!d) return;
          clearTimeout(d.timer);
          setLine(null);
          if (d.held || d.moved) {
            if (d.moved) setSel(0);
            lastTap.current = null;
            return;
          }
          // double toucher : la couleur s'ajoute au lieu de remplacer
          const now = performance.now();
          const lt = lastTap.current;
          const p = local(e);
          if (lt && now - lt.t < 380 && Math.hypot(p.x - lt.p.x, p.y - lt.p.y) < 0.05) {
            lastTap.current = null;
            onChange([...lt.before, hexAt(p)], false);
            setSel(lt.before.length);
            return;
          }
          lastTap.current = { t: now, p, before: d.before };
        }}
        onPointerCancel={() => {
          if (press.current) clearTimeout(press.current.timer);
          press.current = null;
          setLine(null);
        }}
      >
        <canvas ref={canvas} width={RES} height={RES} />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {!line && marks.filter(Boolean).length > 1 && <polyline points={marks.flatMap((m) => (m ? [`${m.x * 100},${m.y * 100}`] : [])).join(' ')} className="pe-path" />}
          {line && <line x1={line.a.x * 100} y1={line.a.y * 100} x2={line.b.x * 100} y2={line.b.y * 100} className="pe-line" />}
        </svg>
        {!line && marks.map((m, j) => m && <span key={j} className={`pe-mark ${j === i ? 'on' : ''}`} style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, background: stops[j] }} />)}
        {harm &&
          harmSets[0] &&
          [...new Set(harmSets.flatMap((s) => s.colors.slice(1)))].map((c) => {
            const m = placeOf(c, pl);
            if (!m) return null;
            return <span key={c} className="pe-mark ghost" style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, background: c }} />;
          })}
      </div>
      {harm && (
        <div className="pe-harm">
          {harmSets.map((s) => (
            <button
              key={s.name}
              onClick={() => {
                onChange(s.colors, true);
                setSel(0);
                setHarm(null);
              }}
            >
              <span className="pe-harm-sw">
                {s.colors.map((c, k) => (
                  <i key={k} style={{ background: c }} />
                ))}
              </span>
              {s.name}
            </button>
          ))}
          <button className="pe-harm-x" onClick={() => setHarm(null)} aria-label="Fermer les harmonies">
            ✕
          </button>
        </div>
      )}
      <div className="pe-bottom">
        <div className="pe-sliders">
          {(
            [
              ['sat', 'Saturation', 0, 1, 0.01, 'grises → vives'],
              ['light', 'Clarté', 0, 1, 0.01, 'sombres → claires'],
              ['contrast', 'Contraste', 0, 1, 0.01, 'proches → du blanc au noir'],
              ['hues', 'Teintes', 30, 360, 5, 'autour de la couleur choisie → toutes'],
            ] as const
          ).map(([k, name, min, max, step, hint]) => (
            <label key={k} title={hint}>
              <span className="tb-label">{name}</span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={pl[k]}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  // étendue réduite : les teintes se resserrent autour de la couleur choisie
                  setPlane(k === 'hues' ? { hues: v, hue0: v >= 360 ? 180 : hexToOklch(stops[i]!).h } : { [k]: v });
                }}
              />
            </label>
          ))}
        </div>
        <div className="pe-right">
          <Tiles stops={stops} sel={i} setSel={setSel} onChange={onChange} />
          <div className="pe-blend">
            <span className="tb-label">Transition</span>
            <div className="seg">
              {(
                [
                  ['smooth', 'Douce'],
                  ['soft', 'Faible'],
                  ['hard', 'Sans'],
                ] as const
              ).map(([k, name]) => (
                <button key={k} className={blend === k ? 'on' : ''} disabled={stops.length < 2} onClick={() => onBlend(k)}>
                  {name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Teintes du guide en tuiles : toucher pour choisir, glisser pour réordonner, ＋ pour en ajouter. */
function Tiles({ stops, sel, setSel, onChange }: { stops: string[]; sel: number; setSel: (i: number) => void; onChange: (stops: string[], commit: boolean) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ from: number; x: number; y: number; on: boolean } | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const indexAt = (x: number, y: number) => {
    const tiles = [...(box.current?.querySelectorAll('.pe-tile') ?? [])];
    let best = -1;
    let bd = Infinity;
    tiles.forEach((t, k) => {
      const r = t.getBoundingClientRect();
      const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      if (d < bd) [bd, best] = [d, k];
    });
    return best;
  };
  return (
    <div className="pe-tiles-wrap">
      <div className="pe-tiles" ref={box}>
        {stops.map((c, k) => (
          <button
            key={k}
            className={`pe-tile ${k === sel ? 'on' : ''} ${k === dragging ? 'lift' : ''}`}
            style={{ background: c }}
            title={c}
            onPointerDown={(e) => {
              (e.currentTarget as Element).setPointerCapture(e.pointerId);
              drag.current = { from: k, x: e.clientX, y: e.clientY, on: false };
              setSel(k);
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              if (!d.on && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) {
                d.on = true;
                onChange(stops, true);
              }
              if (!d.on) return;
              setDragging(d.from);
              const to = indexAt(e.clientX, e.clientY);
              if (to >= 0 && to !== d.from) {
                const next = [...stops];
                const [m] = next.splice(d.from, 1);
                next.splice(to, 0, m!);
                onChange(next, false);
                d.from = to;
                setSel(to);
                setDragging(to);
              }
            }}
            onPointerUp={() => {
              drag.current = null;
              setDragging(null);
            }}
            onPointerCancel={() => {
              drag.current = null;
              setDragging(null);
            }}
          >
            {k === sel && stops.length > 1 && (
              <span
                className="pe-tile-x"
                role="button"
                aria-label="Retirer cette teinte"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onChange(
                    stops.filter((_, j) => j !== k),
                    true,
                  );
                  setSel(Math.max(0, k - 1));
                }}
              >
                ×
              </span>
            )}
          </button>
        ))}
        <button
          className="pe-tile add"
          onClick={() => {
            const c = hexToOklch(stops[sel]!);
            onChange([...stops.slice(0, sel + 1), oklchToHex({ ...c, l: Math.min(0.97, c.l + 0.15) }), ...stops.slice(sel + 1)], true);
            setSel(sel + 1);
          }}
          title="Ajouter une teinte (ou double toucher sur le plan)"
        >
          ＋
        </button>
      </div>
    </div>
  );
}
