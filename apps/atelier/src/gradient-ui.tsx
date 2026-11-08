import { useRef } from 'react';
import { DEFAULT_SHAPE, type GradMode, type GradShape } from './model';

/**
 * Mise en place d'un dégradé sur l'objet choisi : une barre (mode, répétitions, alterné, ellipse)
 * et un repère posé sur l'objet même, où l'on glisse le centre et la poignée de l'axe (angle, étendue).
 * Le réglage est propre à l'objet (Layer.grad) ; la palette ne garde que les teintes.
 */

const MODES: Array<[GradMode, string, string]> = [
  ['linear', 'Linéaire', 'le long d’un axe'],
  ['radial', 'Radial', 'en cercle depuis le centre'],
  ['conic', 'Conique', 'autour du centre, comme une roue'],
  ['diamond', 'Diamant', 'en losange depuis le centre'],
];

type P = { x: number; y: number };
/** Passage de la boîte de l'objet (u, v en 0..1) à l'écran, et retour. */
export interface BoxMap {
  toScreen: (u: number, v: number) => P;
  fromScreen: (x: number, y: number) => P;
  /** Proportions de la boîte (largeur / hauteur). */
  ar: number;
}

const unit = (ar: number) => ({ wx: ar >= 1 ? 1 : ar, hy: ar >= 1 ? 1 / ar : 1 });

/** Longueur de la poignée dans le repère orthonormé de l'objet (l'unité est son plus grand côté). */
function reach(s: GradShape, ar: number): number {
  const { wx, hy } = unit(ar);
  const a = (s.angle * Math.PI) / 180;
  if (s.mode === 'linear') return ((Math.abs(wx * Math.cos(a)) + Math.abs(hy * Math.sin(a))) / 2) * s.spread;
  if (s.mode === 'radial') return (Math.hypot(wx, hy) / 2) * s.spread;
  if (s.mode === 'conic') return Math.min(wx, hy) * 0.35;
  return ((wx + hy) / 2) * s.spread;
}
/** Point (X, Y) du repère orthonormé autour du centre → boîte (u, v). */
const uvOf = (s: GradShape, ar: number, X: number, Y: number) => {
  const { wx, hy } = unit(ar);
  return { x: s.cx + X / wx, y: s.cy + Y / hy };
};
const snapAngle = (deg: number) => {
  const r = Math.round(deg / 15) * 15;
  return (Math.abs(r - deg) < 4 ? r : Math.round(deg)) % 360;
};

export function GradientBar({ shape, onChange, frame, setFrame }: { shape?: GradShape; onChange: (s: GradShape, commit: boolean) => void; frame: boolean; setFrame: (b: boolean) => void }) {
  const s = shape ?? DEFAULT_SHAPE;
  const n = Math.max(1, Math.round(s.repeat));
  const set = (patch: Partial<GradShape>) => onChange({ ...s, ...patch }, true);
  return (
    <div className="grad-bar" role="toolbar" aria-label="Dégradé de l'objet">
      <span className="grad-bar-title">Dégradé</span>
      <div className="grad-modes">
        {MODES.map(([m, name, hint]) => (
          <button key={m} className={s.mode === m ? 'on' : ''} onClick={() => set({ mode: m })} title={`${name} : ${hint}`} aria-label={name}>
            <ModeGlyph mode={m} />
          </button>
        ))}
      </div>
      <div className="grad-step" title="Répétitions">
        <button onClick={() => set({ repeat: Math.max(1, n - 1) })} disabled={n <= 1} aria-label="Moins de répétitions">
          −
        </button>
        <b>×{n}</b>
        <button onClick={() => set({ repeat: Math.min(12, n + 1) })} disabled={n >= 12} aria-label="Plus de répétitions">
          +
        </button>
      </div>
      <button className={`grad-tog ${s.mirror ? 'on' : ''}`} aria-pressed={!!s.mirror} disabled={n < 2} onClick={() => set({ mirror: !s.mirror })} title="Un passage sur deux à l'envers">
        Alterné
      </button>
      {s.mode === 'radial' && (
        <button className={`grad-tog ${s.ellipse ? 'on' : ''}`} aria-pressed={!!s.ellipse} onClick={() => set({ ellipse: !s.ellipse })} title="Cercle, ou ellipse qui suit la forme de l'objet">
          {s.ellipse ? 'Ellipse' : 'Cercle'}
        </button>
      )}
      <span className="grad-angle" title="Angle (aimanté tous les 15°)">
        {Math.round(s.angle)}°
      </span>
      <button className={`grad-tog grad-frame-btn ${frame ? 'on' : ''}`} aria-pressed={frame} onClick={() => setFrame(!frame)} title="Afficher le repère sur l'objet : centre et axe à glisser">
        Repère
      </button>
      <button className="grad-tog plain" onClick={() => onChange({ ...DEFAULT_SHAPE, mode: s.mode }, true)} title="Centre au milieu, angle et étendue d'origine, un passage">
        Recentrer
      </button>
    </div>
  );
}

/** Le repère posé sur l'objet : axes du centre, axe ou anneaux du dégradé, répétitions, centre et poignée à glisser. */
export function GradientOverlay({ shape, map, color, onChange }: { shape?: GradShape; map: BoxMap; color: string; onChange: (s: GradShape, commit: boolean) => void }) {
  const s = shape ?? DEFAULT_SHAPE;
  const drag = useRef<'center' | 'handle' | null>(null);
  const last = useRef(s);
  last.current = s;
  const { ar } = map;
  const a = (s.angle * Math.PI) / 180;
  const d = reach(s, ar);
  const ell = s.mode === 'radial' && s.ellipse;
  const uvAt = (X: number, Y: number) => (ell ? { x: s.cx + (X / d) * 0.5 * Math.SQRT2 * s.spread, y: s.cy + (Y / d) * 0.5 * Math.SQRT2 * s.spread } : uvOf(s, ar, X, Y));
  const scr = (X: number, Y: number) => {
    const q = uvAt(X, Y);
    return map.toScreen(q.x, q.y);
  };
  const C = map.toScreen(s.cx, s.cy);
  const H = scr(Math.cos(a) * d, Math.sin(a) * d);
  const A = s.mode === 'linear' ? scr(-Math.cos(a) * d, -Math.sin(a) * d) : C;
  const n = Math.max(1, Math.round(s.repeat));
  const ticks = Array.from({ length: n + 1 }, (_, k) => k / n);
  // axes du centre, le long des côtés de l'objet
  const ax1 = [map.toScreen(s.cx, -0.15), map.toScreen(s.cx, 1.15)];
  const ax2 = [map.toScreen(-0.15, s.cy), map.toScreen(1.15, s.cy)];
  const ring = (t: number) => {
    const pts: P[] = [];
    if (s.mode === 'diamond') for (const q of [0, 90, 180, 270, 0]) pts.push(scr(Math.cos(a + (q * Math.PI) / 180) * d * t, Math.sin(a + (q * Math.PI) / 180) * d * t));
    else for (let k = 0; k <= 48; k++) pts.push(scr(Math.cos((k / 48) * 2 * Math.PI) * d * t, Math.sin((k / 48) * 2 * Math.PI) * d * t));
    return pts.map((p) => `${p.x},${p.y}`).join(' ');
  };
  const move = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const p = map.fromScreen(e.clientX, e.clientY);
    const cur = last.current;
    if (drag.current === 'center') {
      const sn = (x: number) => [0, 0.5, 1].find((k) => Math.abs(k - x) < 0.03) ?? Math.max(-0.5, Math.min(1.5, x));
      onChange({ ...cur, cx: sn(p.x), cy: sn(p.y) }, false);
      return;
    }
    const { wx, hy } = unit(ar);
    const X = (p.x - cur.cx) * (ell ? 1 : wx);
    const Y = (p.y - cur.cy) * (ell ? 1 : hy);
    const angle = snapAngle(((Math.atan2(Y, X) * 180) / Math.PI + 360) % 360);
    const len = Math.hypot(X, Y);
    const base = ell ? 0.5 * Math.SQRT2 : reach({ ...cur, angle, spread: 1 }, ar);
    onChange(cur.mode === 'conic' ? { ...cur, angle } : { ...cur, angle, spread: Math.max(0.1, Math.min(3, len / base)) }, false);
  };
  const grab = (k: 'center' | 'handle') => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = k;
  };
  const drop = () => {
    if (drag.current) onChange(last.current, true);
    drag.current = null;
  };
  return (
    <div className="grad-overlay">
      <svg aria-hidden>
        <line x1={ax1[0]!.x} y1={ax1[0]!.y} x2={ax1[1]!.x} y2={ax1[1]!.y} className="go-axis0" />
        <line x1={ax2[0]!.x} y1={ax2[0]!.y} x2={ax2[1]!.x} y2={ax2[1]!.y} className="go-axis0" />
        {(s.mode === 'radial' || s.mode === 'diamond') && ticks.slice(1).map((t) => <polyline key={t} points={ring(t)} className="go-ring" />)}
        {s.mode === 'conic' &&
          ticks.slice(0, -1).map((t) => {
            const b = a + t * 2 * Math.PI;
            const E = scr(Math.cos(b) * d * 1.6, Math.sin(b) * d * 1.6);
            return <line key={t} x1={C.x} y1={C.y} x2={E.x} y2={E.y} className="go-ring" />;
          })}
        <line x1={A.x} y1={A.y} x2={H.x} y2={H.y} className="go-line" />
        {s.mode === 'linear' &&
          ticks.map((t) => {
            const x = A.x + (H.x - A.x) * t;
            const y = A.y + (H.y - A.y) * t;
            const L = Math.hypot(H.x - A.x, H.y - A.y) || 1;
            const nx = (-(H.y - A.y) / L) * 7;
            const ny = ((H.x - A.x) / L) * 7;
            return <line key={t} x1={x - nx} y1={y - ny} x2={x + nx} y2={y + ny} className="go-tick" />;
          })}
        {s.mode === 'linear' && <circle cx={A.x} cy={A.y} r="4" className="go-start" />}
      </svg>
      <span className="go-pt center" style={{ left: C.x, top: C.y }} title="Centre du dégradé : glisse-le" onPointerDown={grab('center')} onPointerMove={move} onPointerUp={drop} onPointerCancel={drop} />
      <span className="go-pt handle" style={{ left: H.x, top: H.y, background: color }} title="Poignée : angle et étendue" onPointerDown={grab('handle')} onPointerMove={move} onPointerUp={drop} onPointerCancel={drop} />
    </div>
  );
}

function ModeGlyph({ mode }: { mode: GradMode }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 } as const;
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden>
      {mode === 'linear' && (
        <>
          <rect x="2" y="2" width="12" height="12" rx="2" {...p} />
          <path d="M5 2v12M8 2v12M11 2v12" {...p} strokeWidth={1} opacity={0.6} />
        </>
      )}
      {mode === 'radial' && (
        <>
          <circle cx="8" cy="8" r="6" {...p} />
          <circle cx="8" cy="8" r="3" {...p} strokeWidth={1} opacity={0.6} />
        </>
      )}
      {mode === 'conic' && (
        <>
          <circle cx="8" cy="8" r="6" {...p} />
          <path d="M8 8V2M8 8l5.2 3M8 8l-5.2 3" {...p} strokeWidth={1} opacity={0.6} />
        </>
      )}
      {mode === 'diamond' && (
        <>
          <path d="M8 1.5L14.5 8 8 14.5 1.5 8z" {...p} />
          <path d="M8 4.8L11.2 8 8 11.2 4.8 8z" {...p} strokeWidth={1} opacity={0.6} />
        </>
      )}
    </svg>
  );
}
