import { extraOn, type AnchorExtras } from './model';
import type { AnchorFrame } from '@ftd/core';

type Key = keyof AnchorExtras;

/** Un groupe de points qu'un toucher allume ou éteint ensemble. */
function Family({ pts, on, off, title, toggle }: { pts: Array<[number, number]>; on: boolean; off?: boolean; title: string; toggle: () => void }) {
  return (
    <g className={`pt-fam ${on ? 'on' : ''} ${off ? 'off' : ''}`} onClick={off ? undefined : toggle} role="button" aria-pressed={on} aria-label={title}>
      <title>{title}</title>
      {pts.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={8} className="pt-hit" />
          <circle cx={x} cy={y} r={3.2} className="pt-dot" />
        </g>
      ))}
    </g>
  );
}

/**
 * Grilles de sélection des points d'accroche : l'objet (ses sommets, le milieu de ses côtés,
 * le centre toujours) et la page (sommets, milieux des côtés, points des bords).
 * Un toucher sur un point allume ou éteint toute sa famille.
 */
export function PointGrids({ points, frame, onChange }: { points: AnchorExtras | undefined; frame: AnchorFrame; onChange: (k: Key, v: boolean) => void }) {
  const is = (k: Key) => extraOn(points, k);
  const fam = (k: Key, pts: Array<[number, number]>, title: string, off?: boolean) => (
    <Family pts={pts} on={is(k) && !off} off={off} title={off ? `${title} (avec la répartition ½ ⅓ seulement)` : title} toggle={() => onChange(k, !is(k))} />
  );
  // objet : un rectangle au milieu
  const [ox, oy, ow, oh] = [18, 14, 44, 34];
  // page : son bord et le cadre des marges
  const [px, py, pw, ph, m] = [12, 3, 56, 56, 12];
  const rect = (x: number, y: number, w: number, h: number) => ({
    corners: [
      [x, y],
      [x + w, y],
      [x, y + h],
      [x + w, y + h],
    ] as Array<[number, number]>,
    sides: [
      [x + w / 2, y],
      [x + w / 2, y + h],
      [x, y + h / 2],
      [x + w, y + h / 2],
    ] as Array<[number, number]>,
  });
  const o = rect(ox, oy, ow, oh);
  const pg = rect(px, py, pw, ph);
  const mg = rect(px + m, py + m, pw - 2 * m, ph - 2 * m);
  // points des bords : un par demi-côté, pour l'idée (les vrais suivent la densité)
  const edges: Array<[number, number]> = [
    [px + pw / 4, py],
    [px + (pw * 3) / 4, py],
    [px + pw / 4, py + ph],
    [px + (pw * 3) / 4, py + ph],
    [px, py + ph / 4],
    [px, py + (ph * 3) / 4],
    [px + pw, py + ph / 4],
    [px + pw, py + (ph * 3) / 4],
  ];
  return (
    <div className="pt-grids">
      <figure className="pt-grid">
        <svg viewBox="0 0 80 62">
          <rect x={ox} y={oy} width={ow} height={oh} rx={3} className="pt-shape" />
          <circle cx={ox + ow / 2} cy={oy + oh / 2} r={3.6} className="pt-dot fixed">
            <title>Le centre s’accroche toujours</title>
          </circle>
          {fam('objCorners', o.corners, 'Sommets de l’objet')}
          {fam('objSides', o.sides, 'Milieux des côtés de l’objet')}
        </svg>
        <figcaption>L’objet</figcaption>
      </figure>
      <figure className="pt-grid">
        <svg viewBox="0 0 80 62">
          <rect x={px} y={py} width={pw} height={ph} className="pt-page" />
          <rect x={px + m} y={py + m} width={pw - 2 * m} height={ph - 2 * m} className="pt-margin" />
          {fam('corners', [...pg.corners, ...mg.corners], 'Sommets de la page et de la marge')}
          {fam('sides', [...pg.sides, ...mg.sides], 'Milieux des côtés de la page et de la marge')}
          {fam('edges', edges, 'Points des bords : les lignes de partage touchent les bords', frame !== 'repartition')}
        </svg>
        <figcaption>La page</figcaption>
      </figure>
    </div>
  );
}
