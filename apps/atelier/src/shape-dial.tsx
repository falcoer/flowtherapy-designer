import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Pas du geste (px de glissé pour passer au choix suivant) et écart des choix sur la bande. */
const STEP = 28;
const VIS = 52;

/** Une forme dessinée par sa découpe (coordonnées 0..1 de sa boîte), à ses proportions, dans un carré. */
export function ShapeFace({ d, ratio }: { d: string; ratio: number }) {
  const [w, h] = ratio >= 1 ? [1, 1 / ratio] : [ratio, 1];
  return (
    <svg className="sd-face" viewBox="-0.04 -0.04 1.08 1.08" aria-hidden>
      <path d={d} transform={`translate(${(1 - w) / 2} ${(1 - h) / 2}) scale(${w} ${h})`} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

/**
 * Choix d'un type (forme d'aile, de bec, une espèce toute prête) : une bulle de la taille d'un potard montre le choix en cours.
 * On la tient et on glisse à droite ou à gauche : les choix défilent en bande sous le doigt, chacun dessiné tel qu'il rendrait,
 * comme la teinte. Toucher passe au suivant. `value` = −1 quand aucun choix ne correspond (réglages faits à la main) : la bulle montre alors `current`.
 */
export function ChoiceDial({ label, items, value, current, none = 'Sur mesure', onPick, title }: {
  label: string;
  items: { name: string; face: ReactNode }[];
  value: number;
  current?: ReactNode;
  none?: string;
  onPick: (i: number) => void;
  title?: string;
}) {
  const n = items.length;
  const pick = useRef(onPick);
  pick.current = onPick;
  const cur = useRef(value);
  cur.current = value;
  const drag = useRef<{ id: number; x0: number; i0: number; moved: boolean } | null>(null);
  const [strip, setStrip] = useState<{ cx: number; top: number; d: number } | null>(null);
  const go = (k: number) => {
    const c = Math.max(0, Math.min(n - 1, k));
    if (c !== cur.current) {
      cur.current = c;
      pick.current(c);
    }
  };
  const end = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setStrip(null);
    if (!d.moved && e.type === 'pointerup') go(cur.current < 0 ? 0 : (cur.current + 1) % n);
  };
  const it = value >= 0 ? items[value] : undefined;
  // sur la bande, sans choix reconnu, la bande se cale sur le premier
  const pos = Math.max(0, value);
  return (
    <div className="cp-dial cp-tint cp-shape" title={title ?? `${label} : glisser à droite ou à gauche pour choisir, toucher pour le suivant`}>
      <button
        className={`tint-b ${strip ? 'held' : ''}`}
        aria-label={`${label} : ${it?.name ?? none}`}
        onPointerDown={(e) => {
          if (e.button) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { id: e.pointerId, x0: e.clientX, i0: Math.max(0, cur.current), moved: false };
          const r = e.currentTarget.getBoundingClientRect();
          setStrip({ cx: r.left + r.width / 2, top: r.top + r.height / 2, d: r.width });
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          const dx = e.clientX - d.x0;
          if (Math.abs(dx) > 6) d.moved = true;
          if (d.moved) go(d.i0 + Math.round(dx / STEP));
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') go(cur.current - 1);
          else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') go(cur.current + 1);
          else if (e.key === 'Enter' || e.key === ' ') go(cur.current < 0 ? 0 : (cur.current + 1) % n);
          else return;
          e.preventDefault();
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="sd-in">{it?.face ?? current}</span>
      </button>
      <span className="cp-dial-l">{label}</span>
      <output>{it?.name ?? none}</output>
      {strip &&
        createPortal(
          <div className="tint-strip shape-strip" style={{ top: strip.top, left: strip.cx, ['--tint-d' as string]: `${strip.d}px` }} aria-hidden>
            <div className="tint-band">
              <div className="tint-reel" style={{ transform: `translateX(${-(pos + 0.5) * VIS}px)` }}>
                {items.map((x, i) => {
                  const k = Math.abs(i - pos);
                  return (
                    <span key={i} className={`sd-it ${i === value ? 'on' : ''}`} style={{ filter: k > 1 ? `blur(${Math.min(2, (k - 1) * 0.8)}px)` : undefined }}>
                      {x.face}
                    </span>
                  );
                })}
              </div>
            </div>
            <span className="tint-lens sd-lens">{it?.face ?? current}</span>
            <b>{it?.name ?? none}</b>
          </div>,
          document.body,
        )}
    </div>
  );
}
