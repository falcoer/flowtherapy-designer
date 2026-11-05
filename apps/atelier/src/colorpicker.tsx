import { gradientStops, harmonies, hexToOklch, maxChroma, oklabToRgb8, oklchToHex, type Oklch } from '@ftd/core';
import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Éditeur de couleur de la palette : un plan carré (teinte en largeur, clarté en hauteur),
 * en grille de cases ou en spectre continu ; la saturation du plan se règle au curseur.
 * Toucher remplace la teinte choisie, double toucher en ajoute une, tracer une ligne prend
 * plusieurs couleurs d'un coup (un dégradé), garder le doigt appuyé propose les harmonies.
 * À droite, les teintes du guide en tuiles, dans leur ordre, à réordonner en glissant.
 */

type Pt = { x: number; y: number };
const RES = 120;
/** Grille : 12 teintes et une colonne de gris, 9 clartés. */
const COLS = 13;
const ROWS = 9;
const L_TOP = 0.97;
const L_BOT = 0.12;

export type PlaneMode = 'grid' | 'spectrum';
const MODE = 'ftd-atelier-plane-mode';

const lAt = (v: number) => L_TOP - v * (L_TOP - L_BOT);
/** Couleur d'un point du plan (u, v en 0..1) pour une saturation relative. */
function colorAt(u: number, v: number, sat: number, mode: PlaneMode): Oklch {
  if (mode === 'grid') {
    const col = Math.min(COLS - 1, Math.max(0, Math.floor(u * COLS)));
    const row = Math.min(ROWS - 1, Math.max(0, Math.floor(v * ROWS)));
    const l = lAt((row + 0.5) / ROWS);
    if (col === 0) return { l, c: 0, h: 0 };
    const h = ((col - 1) / (COLS - 1)) * 360;
    return { l, c: sat * maxChroma(l, h), h };
  }
  const l = lAt(v);
  const h = Math.max(0, Math.min(1, u)) * 360;
  return { l, c: sat * maxChroma(l, h), h };
}
/** Place d'une couleur sur le plan. */
function placeOf(hex: string, mode: PlaneMode): Pt {
  const c = hexToOklch(hex);
  const v = Math.max(0, Math.min(1, (L_TOP - c.l) / (L_TOP - L_BOT)));
  if (mode === 'grid') {
    const col = c.c < 0.02 ? 0 : 1 + (Math.round((c.h / 360) * (COLS - 1)) % (COLS - 1));
    return { x: (col + 0.5) / COLS, y: (Math.min(ROWS - 1, Math.floor(v * ROWS)) + 0.5) / ROWS };
  }
  return { x: c.h / 360, y: v };
}

const HARMONIES: Array<[keyof ReturnType<typeof harmonies>, string]> = [
  ['complementary', 'Duo complémentaire'],
  ['triadic', 'Trio (triade)'],
  ['tetradic', 'Quatuor (tétrade)'],
  ['split', 'Complémentaires voisines'],
  ['analogous', 'Analogues'],
  ['tints', 'Camaïeu'],
];

export function PaletteEditor({ stops, onChange }: { stops: string[]; onChange: (stops: string[], commit: boolean) => void }) {
  const [mode, setModeRaw] = useState<PlaneMode>(() => {
    try {
      return (localStorage.getItem(MODE) as PlaneMode | null) ?? 'grid';
    } catch {
      return 'grid';
    }
  });
  const setMode = (m: PlaneMode) => {
    setModeRaw(m);
    try {
      localStorage.setItem(MODE, m);
    } catch {
      /* stockage indisponible */
    }
  };
  const [sat, setSat] = useState(0.85);
  const [steps, setSteps] = useState(5);
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
        const c = colorAt((x + 0.5) / RES, (y + 0.5) / RES, sat, mode);
        const hr = (c.h * Math.PI) / 180;
        const rgb = oklabToRgb8(c.l, c.c * Math.cos(hr), c.c * Math.sin(hr)) ?? [128, 128, 128];
        img.data.set([rgb[0], rgb[1], rgb[2], 255], (y * RES + x) * 4);
      }
    ctx.putImageData(img, 0, 0);
  }, [sat, mode]);

  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = plane.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) };
  };
  const hexAt = (p: Pt) => oklchToHex(colorAt(p.x, p.y, sat, mode));
  const lineStops = (a: Pt, b: Pt) => gradientStops(colorAt(a.x, a.y, sat, mode), colorAt(b.x, b.y, sat, mode), steps);
  const setAt = (j: number, c: string, commit: boolean) =>
    onChange(
      stops.map((x, k) => (k === j ? c : x)),
      commit,
    );

  const marks = useMemo(() => stops.map((c) => placeOf(c, mode)), [stops, mode]);
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
          {!line && marks.length > 1 && <polyline points={marks.map((m) => `${m.x * 100},${m.y * 100}`).join(' ')} className="pe-path" />}
          {line && <line x1={line.a.x * 100} y1={line.a.y * 100} x2={line.b.x * 100} y2={line.b.y * 100} className="pe-line" />}
        </svg>
        {!line && marks.map((m, j) => <span key={j} className={`pe-mark ${j === i ? 'on' : ''}`} style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, background: stops[j] }} />)}
        {harm &&
          harmSets[0] &&
          [...new Set(harmSets.flatMap((s) => s.colors.slice(1)))].map((c) => {
            const m = placeOf(c, mode);
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
          <label>
            <span className="tb-label">Saturation</span>
            <input type="range" min={0} max={1} step={0.01} value={sat} onChange={(e) => setSat(Number(e.target.value))} />
          </label>
          <label>
            <span className="tb-label">
              Couleurs par tracé <b>{steps}</b>
            </span>
            <input type="range" min={2} max={9} step={1} value={steps} onChange={(e) => setSteps(Number(e.target.value))} />
          </label>
        </div>
        <Tiles stops={stops} sel={i} setSel={setSel} onChange={onChange} />
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
      <span className="pe-preview" style={{ background: stops.length > 1 ? `linear-gradient(90deg, ${stops.join(',')})` : stops[0] }} title="Résultat" />
    </div>
  );
}
