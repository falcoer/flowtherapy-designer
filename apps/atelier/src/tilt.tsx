import { useRef } from 'react';

/**
 * Inclinaison : un plateau où l'on pousse un point hors du centre.
 * Le carré du milieu montre l'effet : penché (texte, un seul axe) ou mis en perspective (tampons, toutes directions).
 * x et y vont de -1 à 1 ; double toucher : à plat.
 */
export function TiltPad({
  label,
  x,
  y = 0,
  axis = 'both',
  display,
  onChange,
  size = 44,
}: {
  label: string;
  x: number;
  y?: number;
  axis?: 'x' | 'both';
  display: string;
  onChange: (x: number, y: number) => void;
  size?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef(0);
  const set = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    let nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    let ny = axis === 'x' ? 0 : ((e.clientY - r.top) / r.height) * 2 - 1;
    const m = Math.hypot(nx, ny);
    if (m > 1) [nx, ny] = [nx / m, ny / m];
    // le centre aimante le doigt
    if (Math.hypot(nx, ny) < 0.08) [nx, ny] = [0, 0];
    onChange(Math.round(nx * 100) / 100, Math.round(ny * 100) / 100);
  };
  // aperçu de l'effet sur un carré de demi-côté h
  const h = 9;
  const corners: Array<[number, number]> = [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ];
  let pts: Array<[number, number]>;
  if (axis === 'x') pts = corners.map(([a, b]) => [a - b * x * 0.6, b]);
  else {
    const k = Math.min(1, Math.hypot(x, y));
    const d = Math.atan2(y, x);
    const [c, s] = [Math.cos(d), Math.sin(d)];
    pts = corners.map(([a, b]) => {
      // le côté vers lequel on penche s'éloigne : plus étroit, et le carré s'écrase dans ce sens
      const along = (a * c + b * s) * (1 - k * 0.35);
      const across = (-a * s + b * c) * (1 - (k * 0.45 * (a * c + b * s)) / h);
      return [along * c - across * s, along * s + across * c];
    });
  }
  const R = size / 2;
  return (
    <div
      ref={ref}
      className={`tilt-pad ${axis === 'x' ? 'axis-x' : ''}`}
      style={{ width: size, height: size }}
      title={`${label} : ${display} (double toucher : à plat)`}
      onPointerDown={(e) => {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        const now = performance.now();
        if (now - last.current < 320) {
          onChange(0, 0);
          last.current = 0;
          return;
        }
        last.current = now;
        set(e);
      }}
      onPointerMove={(e) => e.buttons && set(e)}
    >
      <svg viewBox={`${-R} ${-R} ${size} ${size}`} aria-hidden>
        <circle className="tp-ring" r={R - 1.5} />
        {axis === 'x' ? <line className="tp-axis" x1={-R + 4} x2={R - 4} y1={0} y2={0} /> : <circle className="tp-axis" r={(R - 1.5) / 2} />}
        <polygon className="tp-card" points={pts.map((p) => p.join(',')).join(' ')} />
        <circle className="tp-dot" cx={x * (R - 6)} cy={y * (R - 6)} r={3.5} />
      </svg>
      <span className="tp-val">{display}</span>
    </div>
  );
}
