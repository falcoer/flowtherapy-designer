import { useRef, useState } from 'react';
import { jointsText, RIG_BONES, RIG_JOINTS, RIG_NAMES, rigJoints, TEMPLATE_WIDTH, templateOf, type Anim } from './anim';
import type { BoxMap } from './gradient-ui';

type Pt = [number, number];

/**
 * Poignées du squelette posé dans un objet (vue des os) : chaque articulation se glisse sur l'image, au repos.
 * Les os se redessinent pendant le glissé ; tout le glissé fait un seul pas d'annulation. `frame` : la boîte actuelle dans
 * le repère d'origine (objet modelé), où les articulations se gardent.
 */
export function RigOverlay({ anim, map, frame, onChange }: { anim: Anim; map: BoxMap; frame?: [number, number, number, number]; onChange: (a: Anim, commit: boolean) => void }) {
  const [fa, fb, fc, fd] = frame ?? [0, 0, 1, 1];
  const [W, H] = [fc - fa || 1, fd - fb || 1];
  const J = rigJoints(anim);
  const last = useRef(J);
  last.current = J;
  const drag = useRef<number | null>(null);
  const moved = useRef(false);
  const scr = ([u, v]: Pt) => map.toScreen((u - fa) / W, (v - fb) / H);
  const P = J.map(scr);
  // le gabarit (silhouette en pose A) à la hauteur de la boîte : on cadre la photo dessus, puis on y cale les articulations
  const [guide, setGuide] = useState(true);
  const T = templateOf(anim).map(scr);
  const [top, bottom] = [scr([fa + W / 2, fb]), scr([fa + W / 2, fb + H])];
  const tall = Math.hypot(bottom.x - top.x, bottom.y - top.y);
  const fit = () => onChange({ ...anim, j: jointsText(templateOf(anim)) }, true);
  const grab = (i: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = i;
  };
  const move = (e: React.PointerEvent) => {
    const i = drag.current;
    if (i === null) return;
    const q = map.fromScreen(e.clientX, e.clientY);
    const next = last.current.map((p, k): Pt => (k === i ? [fa + q.x * W, fb + q.y * H] : p));
    // le premier pas du glissé garde la pose d'avant pour l'annulation ; les suivants passent sans historique
    onChange({ ...anim, j: jointsText(next) }, !moved.current);
    moved.current = true;
  };
  const drop = () => {
    drag.current = null;
    moved.current = false;
  };
  // côté gauche et droit de l'image : deux teintes, pour ne pas confondre les bras quand ils se croisent
  const side = (k: string) => (k.endsWith('L') ? 'l' : k.endsWith('R') ? 'r' : 'c');
  return (
    <div className="grad-overlay rig-overlay">
      <svg aria-hidden>
        {guide && (
          <g className="rig-guide">
            {RIG_BONES.map(([p, c], i) => {
              const [A, B] = [T[RIG_JOINTS.indexOf(p)]!, T[RIG_JOINTS.indexOf(c)]!];
              return i === 0 ? <circle key={i} cx={B.x} cy={B.y} r={TEMPLATE_WIDTH[0]! * tall} /> : <line key={i} x1={A.x} y1={A.y} x2={B.x} y2={B.y} strokeWidth={2 * TEMPLATE_WIDTH[i]! * tall} />;
            })}
          </g>
        )}
        {RIG_BONES.map(([p, c], i) => {
          const [A, B] = [P[RIG_JOINTS.indexOf(p)]!, P[RIG_JOINTS.indexOf(c)]!];
          return <line key={i} x1={A.x} y1={A.y} x2={B.x} y2={B.y} className={`rig-bone ${side(c)}`} />;
        })}
      </svg>
      {RIG_JOINTS.map((k, i) => (
        <span
          key={k}
          className={`rig-pt ${side(k)}`}
          style={{ left: P[i]!.x, top: P[i]!.y }}
          title={`${RIG_NAMES[k]} : glisse-la sur l’image`}
          onPointerDown={grab(i)}
          onPointerMove={move}
          onPointerUp={drop}
          onPointerCancel={drop}
        >
          <em>{RIG_NAMES[k]}</em>
        </span>
      ))}
      <div className="rig-bar" style={{ left: top.x, top: top.y }}>
        <button className={guide ? 'on' : ''} onClick={() => setGuide(!guide)} title="Silhouette en pose A : cadre la photo dessus">
          Gabarit
        </button>
        <button onClick={fit} title="Pose les articulations sur le gabarit">
          Caler sur le gabarit
        </button>
      </div>
    </div>
  );
}
