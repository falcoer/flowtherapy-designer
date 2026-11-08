import { useEffect, useRef } from 'react';
import { shapedFill } from './gradient';
import { DEFAULT_SHAPE, type Blend, type GradMode, type GradShape } from './model';

/**
 * Forme d'un dégradé : le mode, et un repère où l'on glisse le centre et la poignée de l'axe
 * (angle et étendue), avec les répétitions marquées sur l'axe.
 */

const MODES: Array<[GradMode, string]> = [
  ['linear', 'Linéaire'],
  ['radial', 'Radial'],
  ['conic', 'Conique'],
  ['diamond', 'Diamant'],
];
const MODE_HINTS: Record<GradMode, string> = {
  linear: 'le long d’un axe : glisse la poignée pour l’angle et la longueur',
  radial: 'en cercle depuis le centre : la poignée règle le rayon',
  conic: 'autour du centre, comme une roue : la poignée règle le départ',
  diamond: 'en losange depuis le centre : la poignée règle l’angle et la taille',
};

/** Longueur de la poignée (en fraction du repère) pour une étendue donnée. */
function reach(s: GradShape): number {
  const a = (s.angle * Math.PI) / 180;
  if (s.mode === 'linear') return ((Math.abs(Math.cos(a)) + Math.abs(Math.sin(a))) / 2) * s.spread;
  if (s.mode === 'radial') return (Math.SQRT2 / 2) * s.spread;
  if (s.mode === 'conic') return 0.32;
  return 0.5 * s.spread;
}

const snapAngle = (deg: number) => {
  const r = Math.round(deg / 15) * 15;
  return Math.abs(r - deg) < 4 ? r : Math.round(deg);
};

export function GradientFrame({ stops, blend, shape, onChange }: { stops: string[]; blend: Blend; shape?: GradShape; onChange: (s: GradShape, commit: boolean) => void }) {
  const s = shape ?? DEFAULT_SHAPE;
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<'center' | 'handle' | null>(null);
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const fill = shapedFill(ctx, { name: '', type: 'gradient', stops, blend, shape: s }, { x0: 0, y0: 0, x1: c.width, y1: c.height });
    ctx.clearRect(0, 0, c.width, c.height);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, c.width, c.height);
    }
  }, [stops, blend, s]);
  const at = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return {
      u: (e.clientX - r.left) / r.width,
      v: (e.clientY - r.top) / r.height,
    };
  };
  const a = (s.angle * Math.PI) / 180;
  const d = reach(s);
  const hx = s.cx + Math.cos(a) * d;
  const hy = s.cy + Math.sin(a) * d;
  // pour le linéaire, l'axe va d'une extrémité à l'autre ; ailleurs, du centre à la poignée
  const ax = s.mode === 'linear' ? s.cx - Math.cos(a) * d : s.cx;
  const ay = s.mode === 'linear' ? s.cy - Math.sin(a) * d : s.cy;
  const n = Math.max(1, Math.round(s.repeat));
  const ticks = Array.from({ length: n + 1 }, (_, k) => k / n);
  const set = (patch: Partial<GradShape>, commit = true) => onChange({ ...s, ...patch }, commit);
  return (
    <div className="gf">
      <div className="seg gf-modes">
        {MODES.map(([m, name]) => (
          <button key={m} className={s.mode === m ? 'on' : ''} onClick={() => set({ mode: m })} title={MODE_HINTS[m]}>
            <ModeGlyph mode={m} />
            {name}
          </button>
        ))}
      </div>
      <div className="gf-body">
        <div
          ref={box}
          className="gf-frame"
          onPointerDown={(e) => {
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
            const p = at(e);
            const r = box.current!.getBoundingClientRect();
            const near = (x: number, y: number) => Math.hypot((p.u - x) * r.width, (p.v - y) * r.height) < 18;
            drag.current = near(hx, hy) ? 'handle' : 'center';
            if (drag.current === 'center' && !near(s.cx, s.cy)) set({ cx: p.u, cy: p.v }, false);
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const p = at(e);
            if (drag.current === 'center') {
              // le centre s'aimante au milieu et aux bords du repère
              const sn = (x: number) => [0, 0.5, 1].find((k) => Math.abs(k - x) < 0.03) ?? Math.max(-0.25, Math.min(1.25, x));
              set({ cx: sn(p.u), cy: sn(p.v) }, false);
              return;
            }
            const dx = p.u - s.cx;
            const dy = p.v - s.cy;
            const angle = snapAngle(((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360);
            const len = Math.hypot(dx, dy);
            const unit = reach({ ...s, angle, spread: 1 });
            set(s.mode === 'conic' ? { angle } : { angle, spread: Math.max(0.1, Math.min(3, len / unit)) }, false);
          }}
          onPointerUp={() => {
            if (drag.current) onChange(s, true);
            drag.current = null;
          }}
          onPointerCancel={() => (drag.current = null)}
        >
          <canvas ref={canvas} width={160} height={160} />
          <svg viewBox="0 0 100 100" aria-hidden>
            {/* repère : axes du cadre et du centre */}
            <line x1="50" y1="0" x2="50" y2="100" className="gf-grid" />
            <line x1="0" y1="50" x2="100" y2="50" className="gf-grid" />
            <line x1={s.cx * 100} y1="0" x2={s.cx * 100} y2="100" className="gf-axis0" />
            <line x1="0" y1={s.cy * 100} x2="100" y2={s.cy * 100} className="gf-axis0" />
            {(s.mode === 'radial' || s.mode === 'diamond') &&
              ticks.slice(1).map((t) =>
                s.mode === 'radial' ? (
                  s.ellipse ? (
                    <ellipse key={t} cx={s.cx * 100} cy={s.cy * 100} rx={50 * Math.SQRT2 * s.spread * t} ry={50 * Math.SQRT2 * s.spread * t} className="gf-ring" />
                  ) : (
                    <circle key={t} cx={s.cx * 100} cy={s.cy * 100} r={d * 100 * t} className="gf-ring" />
                  )
                ) : (
                  <polygon
                    key={t}
                    className="gf-ring"
                    points={[0, 90, 180, 270]
                      .map((q) => {
                        const b = a + (q * Math.PI) / 180;
                        return `${(s.cx + Math.cos(b) * d * t) * 100},${(s.cy + Math.sin(b) * d * t) * 100}`;
                      })
                      .join(' ')}
                  />
                ),
              )}
            {s.mode === 'conic' &&
              ticks.slice(0, -1).map((t) => {
                const b = a + t * 2 * Math.PI;
                return <line key={t} x1={s.cx * 100} y1={s.cy * 100} x2={(s.cx + Math.cos(b) * 0.45) * 100} y2={(s.cy + Math.sin(b) * 0.45) * 100} className="gf-ring" />;
              })}
            <line x1={ax * 100} y1={ay * 100} x2={hx * 100} y2={hy * 100} className="gf-line" />
            {s.mode === 'linear' &&
              ticks.map((t) => {
                const x = ax + (hx - ax) * t;
                const y = ay + (hy - ay) * t;
                return (
                  <line
                    key={t}
                    x1={(x - Math.sin(a) * 0.035) * 100}
                    y1={(y + Math.cos(a) * 0.035) * 100}
                    x2={(x + Math.sin(a) * 0.035) * 100}
                    y2={(y - Math.cos(a) * 0.035) * 100}
                    className="gf-tick"
                  />
                );
              })}
            {s.mode === 'linear' && <circle cx={ax * 100} cy={ay * 100} r="2.4" className="gf-start" />}
          </svg>
          <span className="gf-pt center" style={{ left: `${s.cx * 100}%`, top: `${s.cy * 100}%` }} title="Centre : glisse-le" />
          <span
            className="gf-pt handle"
            style={{
              left: `${hx * 100}%`,
              top: `${hy * 100}%`,
              background: stops[stops.length - 1],
            }}
            title="Poignée : angle et étendue"
          />
        </div>
        <div className="gf-side">
          <label className="gf-num" title="Angle (aimanté tous les 15°)">
            <span className="tb-label">Angle</span>
            <input type="number" min={0} max={359} value={Math.round(s.angle)} onChange={(e) => set({ angle: ((Number(e.target.value) % 360) + 360) % 360 })} />
          </label>
          {s.mode !== 'conic' && (
            <label className="gf-num" title="Étendue : 100 % = la boîte de l'objet">
              <span className="tb-label">Étendue</span>
              <input
                type="number"
                min={10}
                max={300}
                step={5}
                value={Math.round(s.spread * 100)}
                onChange={(e) =>
                  set({
                    spread: Math.max(0.1, Math.min(3, Number(e.target.value) / 100)),
                  })
                }
              />
            </label>
          )}
          <div className="gf-num">
            <span className="tb-label">Répétitions</span>
            <div className="gf-step">
              <button onClick={() => set({ repeat: Math.max(1, n - 1) })} disabled={n <= 1} aria-label="Moins">
                −
              </button>
              <b>{n}</b>
              <button onClick={() => set({ repeat: Math.min(12, n + 1) })} disabled={n >= 12} aria-label="Plus">
                +
              </button>
            </div>
          </div>
          <button
            className={`gf-toggle ${s.mirror ? 'on' : ''}`}
            aria-pressed={!!s.mirror}
            disabled={n < 2}
            onClick={() => set({ mirror: !s.mirror })}
            title="Un passage sur deux à l'envers : pas de coupure entre les répétitions"
          >
            Alterné
          </button>
          {s.mode === 'radial' && (
            <button className={`gf-toggle ${s.ellipse ? 'on' : ''}`} aria-pressed={!!s.ellipse} onClick={() => set({ ellipse: !s.ellipse })} title="Cercle, ou ellipse qui suit la forme de l'objet">
              {s.ellipse ? 'Ellipse' : 'Cercle'}
            </button>
          )}
          <button className="gf-reset" onClick={() => onChange({ ...DEFAULT_SHAPE, mode: s.mode }, true)} title="Centre au milieu, angle et étendue d'origine, un passage">
            Recentrer
          </button>
        </div>
      </div>
    </div>
  );
}

function ModeGlyph({ mode }: { mode: GradMode }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 } as const;
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
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
