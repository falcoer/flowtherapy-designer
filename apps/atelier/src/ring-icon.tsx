import { useId } from 'react';
import { RING, VIEW_NAMES } from './views';

/**
 * L'anneau des vues, dessiné comme une icône : un anneau au sol vu de biais, plus épais devant qu'au fond.
 * Dessin dans un repère fixe (100 × 30) : centre (50, 15), demi-axes 44 et 11 ; la moitié du fond se dessine
 * sous l'illustration, celle de devant par-dessus.
 */
export const RING_BOX = { cx: 50, cy: 15, rx: 44, ry: 11 };
// bord intérieur : plus étroit et plus aplati, l'anneau paraît épais devant et fin au fond
const IN = { rx: 35, ry: 6, dy: -1.6 };

/** Point de l'anneau à un angle (degrés) : 0 devant, 90 à droite, 180 au fond, 270 à gauche. */
export const ringPoint = (deg: number, r: { rx: number; ry: number; dy?: number } = RING_BOX) => {
  const t = (deg * Math.PI) / 180;
  return { x: RING_BOX.cx + r.rx * Math.sin(t), y: RING_BOX.cy + (r.dy ?? 0) + r.ry * Math.cos(t) };
};

/** Point au milieu de la bande, où se posent les pastilles des vues. */
export const ringMid = (deg: number) => ringPoint(deg, { rx: (RING_BOX.rx + IN.rx) / 2, ry: (RING_BOX.ry + IN.ry) / 2, dy: IN.dy / 2 });

/** Moitié de bande entre deux angles : bord extérieur à l'aller, intérieur au retour. */
function band(a: number, b: number) {
  const pts: string[] = [];
  for (let d = a; d <= b + 1e-6; d += 5) {
    const p = ringPoint(d);
    pts.push(`${p.x.toFixed(2)},${p.y.toFixed(2)}`);
  }
  for (let d = b; d >= a - 1e-6; d -= 5) {
    const p = ringPoint(d, IN);
    pts.push(`${p.x.toFixed(2)},${p.y.toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}
const BACK = band(90, 270);
const FRONT = `${band(-90, 0)}${band(0, 90)}`;

/** Les deux moitiés de l'anneau, en éléments SVG du repère de l'icône (à placer dans un svg ou un g transformé). */
export function RingBand({ half }: { half: 'back' | 'front' }) {
  const id = useId().replace(/:/g, '');
  if (half === 'back') return <path className="ri-back" d={BACK} />;
  return (
    <>
      <defs>
        <linearGradient id={`ri-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.55" stopColor="var(--accent)" />
          <stop offset="1" stopColor="color-mix(in srgb, var(--accent) 70%, #000)" />
        </linearGradient>
      </defs>
      <path className="ri-front" d={FRONT} fill={`url(#ri-${id})`} />
    </>
  );
}

/** Icône complète, pour une vignette : bande et pastilles des vues (`views` : celles qui existent, `on` : la montrée). */
export function RingIcon({ views, on, onPick, className }: { views: string[]; on?: string; onPick?: (v: string) => void; className?: string }) {
  return (
    <span className={`ring-icon ${className ?? ''}`}>
      <svg className="ri-under" viewBox="0 0 100 30" aria-hidden>
        <RingBand half="back" />
      </svg>
      <svg className="ri-over" viewBox="0 0 100 30">
        <RingBand half="front" />
        {Object.entries(RING).map(([v, deg]) => {
          const p = ringMid(deg);
          const has = views.includes(v);
          const far = deg > 90 && deg < 270;
          return (
            <circle
              key={v}
              className={`ri-dot ${v === on ? 'on' : ''} ${has ? '' : 'off'}`}
              cx={p.x}
              cy={p.y}
              r={v === on ? 4.2 : far ? 2.2 : 3}
              onPointerDown={(e) => has && onPick && e.stopPropagation()}
              onClick={(e) => {
                if (!has || !onPick) return;
                e.stopPropagation();
                onPick(v);
              }}
            >
              <title>{VIEW_NAMES[v]}</title>
            </circle>
          );
        })}
      </svg>
    </span>
  );
}
