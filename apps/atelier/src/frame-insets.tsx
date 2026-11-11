import { useRef, useState } from 'react';
import { MAX_MARGIN, MAX_ZONE, type Insets } from '@ftd/core';
import { Knob } from './knob';
import { markColor } from './marks';

/**
 * Marge et zone d'intérêt d'un support, réglées sur une petite page :
 * deux cadres emboîtés (la zone toujours dans la marge), un côté choisi en touchant
 * la page (ou les quatre à la fois), un potard pour sa valeur. On peut aussi tirer
 * un côté directement sur la page. Valeurs en fraction du petit côté du format.
 */

type Side = keyof Insets;
const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];
const SIDE_LABEL: Record<Side, string> = { top: 'Haut', right: 'Droite', bottom: 'Bas', left: 'Gauche' };
export { MAX_MARGIN, MAX_ZONE };
const pct = (v: number) => `${Math.round(v * 1000) / 10} %`;
const same = (a: Insets, b: Insets) => SIDES.every((s) => Math.abs(a[s] - b[s]) < 1e-4);

export function FrameInsets(p: {
  /** proportions de la page dessinée (le format) */
  width: number;
  height: number;
  margins: Insets;
  /** absente : la zone se confond avec la marge */
  zone?: Insets;
  onChange: (margins: Insets, zone: Insets | undefined) => void;
}) {
  const [which, setWhich] = useState<'margin' | 'zone'>('margin');
  const [side, setSide] = useState<Side | 'all'>('all');
  const drag = useRef<{ side: Side; id: number } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const m = p.margins;
  const z = p.zone ?? m;
  const cur = which === 'margin' ? m : z;
  const max = which === 'margin' ? MAX_MARGIN : MAX_ZONE;

  const apply = (sides: Side[], v: number) => {
    const nm = { ...m };
    const nz = { ...z };
    for (const s of sides) {
      if (which === 'margin') {
        nm[s] = Math.max(0, Math.min(MAX_MARGIN, v));
        // la marge qui avance pousse la zone devant elle
        nz[s] = Math.max(nz[s], nm[s]);
      } else nz[s] = Math.max(nm[s], Math.min(MAX_ZONE, v));
    }
    p.onChange(nm, same(nz, nm) ? undefined : nz);
  };
  const sides = side === 'all' ? SIDES : [side];
  const vals = sides.map((s) => cur[s]);
  const value = vals.reduce((a, b) => a + b, 0) / vals.length;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const shown = hi - lo > 1e-4 ? `${pct(lo)} à ${pct(hi)}` : pct(value);

  // page dessinée : 92 px sur son grand côté
  const big = Math.max(p.width, p.height);
  const W = (92 * p.width) / big;
  const H = (92 * p.height) / big;
  const k = Math.min(W, H);
  const rect = (x: Insets) => ({ x: x.left * k, y: x.top * k, width: Math.max(0, W - (x.left + x.right) * k), height: Math.max(0, H - (x.top + x.bottom) * k) });
  const line = (x: Insets, s: Side) => {
    const r = rect(x);
    return s === 'top'
      ? { x1: r.x, y1: r.y, x2: r.x + r.width, y2: r.y }
      : s === 'bottom'
        ? { x1: r.x, y1: r.y + r.height, x2: r.x + r.width, y2: r.y + r.height }
        : s === 'left'
          ? { x1: r.x, y1: r.y, x2: r.x, y2: r.y + r.height }
          : { x1: r.x + r.width, y1: r.y, x2: r.x + r.width, y2: r.y + r.height };
  };
  // un triangle par côté, du bord au centre, pour le choisir ou le tirer
  const cx = W / 2;
  const cy = H / 2;
  const tri: Record<Side, string> = {
    top: `0,0 ${W},0 ${cx},${cy}`,
    right: `${W},0 ${W},${H} ${cx},${cy}`,
    bottom: `0,${H} ${W},${H} ${cx},${cy}`,
    left: `0,0 ${cx},${cy} 0,${H}`,
  };
  const fromEdge = (s: Side, e: React.PointerEvent) => {
    const b = svg.current!.getBoundingClientRect();
    const x = ((e.clientX - b.left) / b.width) * W;
    const y = ((e.clientY - b.top) / b.height) * H;
    const d = s === 'top' ? y : s === 'bottom' ? H - y : s === 'left' ? x : W - x;
    return Math.round((d / k) * 200) / 200;
  };
  const cM = markColor('margin');
  const cZ = markColor('zone');
  const edited = which === 'margin' ? m : z;

  return (
    <div className="fi">
      <svg
        ref={svg}
        className="fi-page"
        viewBox={`-3 -3 ${W + 6} ${H + 6}`}
        style={{ width: W + 6, height: H + 6 }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d && d.id === e.pointerId) apply([d.side], fromEdge(d.side, e));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <rect className="fi-sheet" x={0} y={0} width={W} height={H} rx={3} />
        {p.zone && <rect {...rect(z)} fill={cZ} fillOpacity={0.18} stroke={cZ} strokeWidth={1.2} strokeDasharray="2 2.5" />}
        <rect {...rect(m)} fill="none" stroke={cM} strokeWidth={1.2} strokeDasharray="4 3" />
        {sides.map((s) => (
          <line key={s} {...line(edited, s)} stroke={which === 'margin' ? cM : cZ} strokeWidth={3} strokeLinecap="round" />
        ))}
        {SIDES.map((s) => (
          <polygon
            key={s}
            className={`fi-hit ${side === s ? 'on' : ''}`}
            points={tri[s]}
            onPointerDown={(e) => {
              (e.currentTarget.ownerSVGElement ?? e.currentTarget).setPointerCapture?.(e.pointerId);
              setSide(s);
              drag.current = { side: s, id: e.pointerId };
            }}
          >
            <title>{SIDE_LABEL[s]}</title>
          </polygon>
        ))}
        <rect className={`fi-hit fi-all ${side === 'all' ? 'on' : ''}`} x={cx - W * 0.17} y={cy - H * 0.17} width={W * 0.34} height={H * 0.34} rx={3} onPointerDown={() => setSide('all')}>
          <title>Les quatre côtés</title>
        </rect>
      </svg>
      <div className="fi-ctl">
        <div className="seg fi-which" role="tablist">
          <button role="tab" aria-selected={which === 'margin'} className={which === 'margin' ? 'on' : ''} onClick={() => setWhich('margin')}>
            <i style={{ borderColor: cM }} />
            Marge
          </button>
          <button role="tab" aria-selected={which === 'zone'} className={which === 'zone' ? 'on' : ''} onClick={() => setWhich('zone')}>
            <i className="fi-dot-zone" style={{ borderColor: cZ, background: `${cZ}33` }} />
            Zone d’intérêt
          </button>
        </div>
        <div className="fi-dial">
          <Knob label={`${which === 'margin' ? 'Marge' : 'Zone'} ${side === 'all' ? 'tous côtés' : SIDE_LABEL[side].toLowerCase()}`} value={Math.max(0, Math.min(1, value / max))} fmt={() => shown} onChange={(v) => apply(sides, Math.round(v * max * 200) / 200)} />
          <div className="fi-val">
            <button className={`fi-even ${side === 'all' ? 'on' : ''}`} onClick={() => setSide(side === 'all' ? 'top' : 'all')} title="Même écart sur les quatre côtés, ou côté par côté">
              {side === 'all' ? 'Tous les côtés' : SIDE_LABEL[side]}
            </button>
            <output>{shown}</output>
          </div>
        </div>
      </div>
    </div>
  );
}
