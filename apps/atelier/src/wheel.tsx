import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Fan, useOutside, type FanItem } from './fan';

export type Tip = 'round' | 'flat' | 'triangle';

interface Props {
  /** Taille, de 0 à 1, et son affichage. */
  size: number;
  sizeText: string;
  onSize: (v: number) => void;
  /** Intensité, de 0 à 1 (absente : jauge éteinte). */
  intensity?: number;
  onIntensity?: (v: number) => void;
  /** Rotation, en radians (absente : pas de flèche). */
  rotation?: number;
  onRotation?: (a: number) => void;
  /** Perspective, x et y de -1 à 1 (absente : cadran éteint). */
  tilt?: [number, number];
  onTilt?: (x: number, y: number) => void;
  /** Empreinte montrée au centre : une pointe, ou l'image d'un tampon. */
  tip?: Tip;
  stamp?: string;
  /**
   * Choix du pinceau, en bas à gauche, à la même place dans tous les modes :
   * un toucher passe au suivant ; double toucher ou appui long ouvre le choix.
   */
  pick?: { face: ReactNode; title: string; next?: () => void; choices?: (close: () => void) => ReactNode; options?: FanItem[]; onOption?: (key: string) => void };
  /** Côté de l'écran où la roue est posée (et vers lequel elle s'écarte). */
  side?: 'left' | 'right';
  /** Après combien de temps sans y toucher la roue s'écarte (ms) ; absent : jamais. */
  hideAfter?: number | null;
  /** Légendes (mode astuces). */
  tips?: boolean;
  /** Pendant un réglage de la pointe (taille, rotation, perspective) et au lâcher : montrer l'empreinte en vraie grandeur sur la page. */
  onSizing?: (on: boolean) => void;
}

/** Bas de la barre du haut, marge comprise. */
const TOPBAR = 64;

// repère : 0 en haut, sens horaire
const S = 264;
const C = 128; // centre de la roue
const RO = 92; // bord extérieur de la jauge
const RI = 64; // bord intérieur de la jauge (dedans : la taille)
const MAXF = 52; // rayon de l'empreinte à taille maximale
const MINF = 6;
// jauge d'intensité sur 3/4 de tour : de 0 % en bas à 100 % à droite, par la gauche et le haut
const A0 = Math.PI;
const A1 = 2.5 * Math.PI;
const SEG = 18;
// cadran de perspective, en bas à droite ; choix du pinceau, en bas à gauche
// leur côté dépend de la main : le choix du pinceau reste du côté visible quand la roue s'écarte
const BY = C + RO * 0.74;
const BX = RO * 0.74;
const TR = 32;
// la flèche de rotation tourne au-delà des bulles du bas, pour rester visible
const RA = RO + 20;

const fr = (v: number) => MINF + v * (MAXF - MINF);
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const at = (a: number, r: number, cx = C, cy = C): [number, number] => [cx + Math.sin(a) * r, cy - Math.cos(a) * r];
/** Secteur de couronne entre deux angles. */
const band = (a: number, b: number, r0: number, r1: number) => {
  const [x0, y0] = at(a, r1);
  const [x1, y1] = at(b, r1);
  const [x2, y2] = at(b, r0);
  const [x3, y3] = at(a, r0);
  const big = b - a > Math.PI ? 1 : 0;
  return `M${x0} ${y0}A${r1} ${r1} 0 ${big} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${big} 0 ${x3} ${y3}Z`;
};
/** Angle du point sur la jauge, ramené entre 0 % et 100 % (le creux renvoie au bout le plus proche). */
const gaugeT = (a: number) => {
  let t = ((((a - Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) + Math.PI;
  if (t > A1) t = t > A1 + (3 * Math.PI - A1) / 2 ? A0 : A1;
  return (t - A0) / (A1 - A0);
};

/** Points d'une empreinte en pointillés. */
function stipple(tip: Tip, r: number, density: number) {
  const out: Array<[number, number, number]> = [];
  const step = Math.max(3.2, 6.5 - density * 3);
  for (let y = -r; y <= r; y += step)
    for (let x = -r; x <= r; x += step) {
      const [u, v] = [x / r, y / r];
      // mêmes silhouettes que les pointes peintes : lame, triangle pointe en haut, rond
      const inside = tip === 'flat' ? Math.abs(u) <= 1 && Math.abs(v) <= 0.22 : tip === 'triangle' ? v <= 0.5 && Math.abs(u) <= ((v + 1) / 1.5) * 0.866 : u * u + v * v <= 1;
      if (!inside) continue;
      const edge = tip === 'round' ? Math.sqrt(u * u + v * v) : 0.6;
      out.push([x, y, 0.35 + 0.65 * density * (0.55 + 0.45 * edge)]);
    }
  return out;
}

type Zone = 'size' | 'ring' | 'rot' | 'tilt' | 'edge';

/**
 * Roue du pinceau : une seule palette pour le modelage, le dessin et les tampons.
 * La flèche extérieure tourne la pointe ; la jauge (3/4 de tour) règle l'intensité ;
 * le milieu règle la taille (glisser vers le haut ou la droite pour grossir, vers le bas ou la gauche pour réduire) ; en bas à gauche le choix du pinceau, en bas à droite la perspective.
 */
export function BrushWheel(p: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef<{ zone: Zone; a0: number; rot0: number; r0: number; v0: number; x0: number; y0: number } | null>(null);
  // roue posée à gauche : le pinceau à droite (visible), la perspective à gauche ; l'inverse pour un gaucher
  const left = (p.side ?? 'left') === 'left';
  const TX = left ? C - BX : C + BX;
  const TY = BY;
  const PX = left ? C + BX : C - BX;
  const PY = BY;
  // écartée sur le côté ; elle revient au survol ou au toucher, puis repart
  const [out, setOut] = useState(true);
  const away = useRef<number | null>(null);
  // rangée d'un glissement : elle reste sur le côté jusqu'au prochain survol ou toucher
  const stowed = useRef(false);
  const comeBack = () => {
    stowed.current = false;
    if (away.current) clearTimeout(away.current);
    away.current = null;
    setOut(true);
  };
  const leaveSoon = () => {
    if (away.current) clearTimeout(away.current);
    if (stowed.current) return;
    if (!p.hideAfter) return setOut(true);
    const ms = p.hideAfter;
    away.current = window.setTimeout(() => {
      if (!drag.current) setOut(false);
    }, ms);
  };
  // au réglage du délai (et à l'arrivée) : le compte à rebours repart
  useEffect(() => {
    leaveSoon();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.hideAfter]);
  useEffect(
    () => () => {
      if (away.current) clearTimeout(away.current);
    },
    [],
  );
  // petit écran : dès qu'on touche la page, la roue s'écarte pour lui laisser la place
  useEffect(() => {
    if (!p.hideAfter) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('canvas.stage')) return;
      if (!window.matchMedia('(max-width: 560px)').matches) return;
      if (away.current) clearTimeout(away.current);
      away.current = null;
      if (!drag.current) setOut(false);
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [p.hideAfter]);
  const [active, setActive] = useState<string | null>(null);
  const lastTap = useRef<{ t: number; zone: string }>({ t: 0, zone: '' });
  const rot = p.rotation ?? 0;
  const [tx, ty] = p.tilt ?? [0, 0];
  const R = fr(p.size);

  const local = (e: React.PointerEvent) => {
    const b = ref.current!.getBoundingClientRect();
    const k = S / b.width;
    return [(e.clientX - b.left) * k, (e.clientY - b.top) * k] as const;
  };
  const angle = (x: number, y: number) => Math.atan2(x - C, -(y - C));

  const apply = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const [x, y] = local(e);
    if (d.zone === 'edge') {
      // bord extérieur : un glissement vers le côté range la roue ; sinon, c'est la rotation
      const [dx, dy] = [x - d.x0, y - d.y0];
      const toward = left ? -dx : dx;
      if (toward > 36 && toward > Math.abs(dy) * 1.5) {
        drag.current = null;
        setActive(null);
        p.onSizing?.(false);
        if (away.current) clearTimeout(away.current);
        away.current = null;
        stowed.current = true;
        setOut(false);
        return;
      }
      if (Math.hypot(dx, dy) < 10 || (toward > 0 && toward > Math.abs(dy) * 1.5)) return;
      if (!p.onRotation) return;
      d.zone = 'rot';
      p.onSizing?.(true);
    }
    if (d.zone === 'ring' && p.onIntensity) {
      const v = Math.round(gaugeT(angle(x, y)) * 100) / 100;
      p.onIntensity(v);
      setActive(`Intensité ${Math.round(v * 100)} %`);
    } else if (d.zone === 'tilt' && p.onTilt) {
      let [u, v] = [(x - TX) / (TR * 0.8), (y - TY) / (TR * 0.8)];
      const m = Math.hypot(u, v);
      if (m > 1) [u, v] = [u / m, v / m];
      if (Math.hypot(u, v) < 0.1) [u, v] = [0, 0];
      p.onTilt(Math.round(u * 100) / 100, Math.round(v * 100) / 100);
      setActive(`Perspective ${Math.round(Math.hypot(u, v) * 100)} %`);
    } else if (d.zone === 'rot' && p.onRotation) {
      let a = d.rot0 + angle(x, y) - d.a0;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      const deg = (a * 180) / Math.PI;
      const snap = Math.round(deg / 15) * 15;
      if (Math.abs(deg - snap) < 3) a = (snap * Math.PI) / 180;
      p.onRotation(a);
      setActive(`Rotation ${Math.round((a * 180) / Math.PI)}°`);
    } else if (d.zone === 'size') {
      // relatif, depuis la taille actuelle : vers le haut ou la droite elle grandit, vers le bas ou la gauche elle diminue
      const v = clamp(d.v0 + (x - d.x0 - (y - d.y0)) / ((MAXF - MINF) * 1.6));
      p.onSize(Math.round(v * 100) / 100);
      setActive(`Taille ${p.sizeText}`);
    }
  };

  const down = (e: React.PointerEvent) => {
    const [x, y] = local(e);
    const r = Math.hypot(x - C, y - C);
    let zone: Zone | null = null;
    const [ax0, ay0] = at(rot, RA);
    if (p.onRotation && Math.hypot(x - ax0, y - ay0) < 18) zone = 'rot';
    else if (Math.hypot(x - TX, y - TY) <= TR) zone = p.onTilt ? 'tilt' : null;
    else if (r < RI) zone = 'size';
    else if (r <= RO) zone = p.onIntensity ? 'ring' : null;
    else if (r <= RA + 18) zone = 'edge';
    if (!zone) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const now = performance.now();
    if (now - lastTap.current.t < 320 && lastTap.current.zone === zone) {
      // double toucher : au neutre (au milieu : la pointe revient droite et à plat)
      if (zone === 'ring') p.onIntensity?.(0.85);
      else if (zone === 'tilt') p.onTilt?.(0, 0);
      else {
        p.onRotation?.(0);
        p.onTilt?.(0, 0);
      }
      lastTap.current = { t: 0, zone: '' };
      return;
    }
    lastTap.current = { t: now, zone };
    drag.current = { zone, a0: angle(x, y), rot0: rot, r0: r, v0: p.size, x0: x, y0: y };
    if (zone !== 'ring' && zone !== 'edge') p.onSizing?.(true);
    // la rotation et la taille se règlent en glissant ; la jauge et la perspective, dès le toucher
    if (zone === 'ring' || zone === 'tilt') apply(e);
  };
  const up = (e?: React.PointerEvent) => {
    if (drag.current && drag.current.zone !== 'ring') p.onSizing?.(false);
    drag.current = null;
    setActive(null);
    if (!e || e.pointerType !== 'mouse') leaveSoon();
  };

  // empreinte : tournée, puis mise en perspective
  const k = Math.min(1, Math.hypot(tx, ty));
  const dir = Math.atan2(ty, tx);
  const persp = `rotate(${(dir * 180) / Math.PI}deg) scale(${1 - k * 0.35}, 1) rotate(${(-dir * 180) / Math.PI}deg)`;
  const dots = p.stamp ? [] : stipple(p.tip ?? 'round', R, p.intensity ?? 0.8);
  const level = p.intensity ?? 0;
  const segs = Array.from({ length: SEG }, (_, i) => [A0 + (i / SEG) * (A1 - A0), A0 + ((i + 1) / SEG) * (A1 - A0)] as const);
  // plan en perspective : un carré écrasé vers la direction choisie
  const h = 15;
  const plane = (
    [
      [-h, -h],
      [h, -h],
      [h, h],
      [-h, h],
    ] as Array<[number, number]>
  ).map(([a, b]) => {
    const [c, s] = [Math.cos(dir), Math.sin(dir)];
    const along = (a * c + b * s) * (1 - k * 0.35);
    const across = (-a * s + b * c) * (1 - (k * 0.45 * (a * c + b * s)) / h);
    return [TX + along * c - across * s, TY + along * s + across * c];
  });
  return (
    <div
      className={`brush-wheel side-${left ? 'left' : 'right'} ${out ? '' : 'away'}`}
      onPointerEnter={(e) => e.pointerType !== 'touch' && comeBack()}
      onPointerLeave={(e) => {
        // la roue file sous la souris en se rangeant : ce départ-là ne compte pas
        if (stowed.current) return void (e.pointerType !== 'touch' && (stowed.current = false));
        if (e.pointerType !== 'touch' && !drag.current) leaveSoon();
      }}
      onPointerDownCapture={comeBack}
    >
      <svg ref={ref} className={active ? 'live' : ''} viewBox={`0 0 ${S} ${S}`} onPointerDown={down} onPointerMove={(e) => e.buttons && apply(e)} onPointerUp={up} onPointerCancel={up}>
        {/* jauge d'intensité : 3/4 de tour en segments */}
        <circle cx={C} cy={C} r={RO} className="bw-disc" />
        {segs.map(([a, b], i) => (
          <path key={i} d={band(a + 0.012, b - 0.012, RI + 3, RO - 3)} className={`bw-seg ${p.intensity === undefined ? 'off' : (i + 1) / SEG <= level + 1e-6 ? 'on' : (i + 0.5) / SEG <= level ? 'half' : ''}`} />
        ))}
        {p.tips && (
          <>
            <text x={at(A0 + 0.16, RO + 12)[0]} y={at(A0 + 0.16, RO + 12)[1] + 3} className="bw-label faint">
              0 %
            </text>
            <text x={at(A1 - 0.16, RO + 14)[0] + 4} y={at(A1 - 0.16, RO + 14)[1] + 3} className="bw-label faint">
              100 %
            </text>
          </>
        )}
        {/* milieu : la taille, l'empreinte à l'échelle */}
        <circle cx={C} cy={C} r={RI} className="bw-center" />
        <circle cx={C} cy={C} r={MAXF} className="bw-guide faint dashed" />
        <g className="bw-fp" style={{ transform: `translate(${C}px, ${C}px) ${persp} rotate(${(rot * 180) / Math.PI}deg)` }}>
          {p.stamp ? (
            <image href={p.stamp} x={-R} y={-R} width={R * 2} height={R * 2} opacity={0.35 + 0.65 * (p.intensity ?? 1)} />
          ) : (
            dots.map(([x, y, o], i) => <circle key={i} cx={x} cy={y} r={0.95} className="bw-dot" opacity={o} />)
          )}
          <circle r={R} className="bw-edge" />
        </g>
        <text x={C} y={C + RI - 8} className="bw-label">
          {active ?? `Ø ${p.sizeText}`}
        </text>
        {/* perspective, en bas à droite */}
        <g className={`bw-tilt-pad ${p.onTilt ? '' : 'off'}`}>
          <circle cx={TX} cy={TY} r={TR} className="bw-pad" />
          <polygon points={plane.map((q) => q.join(',')).join(' ')} className="bw-plane" />
          {p.onTilt && <circle cx={TX + tx * TR * 0.8} cy={TY + ty * TR * 0.8} r={5.5} className="bw-tilt" />}
        </g>
        {/* rotation : même convention que les objets de la page, un axe pointillé et sa pastille */}
        <g className={`bw-arrow-g ${p.onRotation ? '' : 'off'}`} style={{ transform: `translate(${C}px, ${C}px) rotate(${(rot * 180) / Math.PI}deg)` }}>
          <line x1={0} y1={-RI + 4} x2={0} y2={-RA + 11} className="bw-axis" />
          <circle cx={0} cy={-RA} r={11} className="bw-rot" />
          <path d="M-4.76 -1.55 A5 5 0 1 1 1.55 4.76" transform={`translate(0 ${-RA})`} className="bw-rot-ico" />
        </g>
        {p.tips && (
          <g className="bw-legend">
            <text x={at(-0.62, RO + 10)[0]} y={at(-0.62, RO + 10)[1]} textAnchor="end">
              Intensité
            </text>
            <text x={C} y={C - RI + 14}>
              Taille
            </text>
            <text x={TX} y={TY + TR + 12}>
              {p.onTilt ? 'Inclinaison' : ''}
            </text>
            {p.onRotation && (
              <text x={at(rot, RA + 20)[0]} y={at(rot, RA + 20)[1] + 3}>
                Rotation
              </text>
            )}
          </g>
        )}
      </svg>
      {p.pick && (p.pick.options ? <FanPicker {...p.pick} at={[PX / S, PY / S]} dir={left ? 'right' : 'left'} /> : <Picker {...p.pick} at={[PX / S, PY / S]} />)}
    </div>
  );
}

/** Choix court : un toucher déploie l'éventail depuis le bouton, un autre le replie. */
function FanPicker({ face, title, options, onOption, at: [px, py], dir }: NonNullable<Props['pick']> & { at: [number, number]; dir: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const fan = useRef<HTMLDivElement>(null);
  useOutside(open, [btn, fan], () => setOpen(false));
  return (
    <>
      <button
        ref={btn}
        className={`bw-pick ${open ? 'on' : ''}`}
        style={{ left: `${px * 100}%`, top: `${py * 100}%` }}
        title={`${title} (toucher : choisir)`}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {face}
      </button>
      {open && (
        <div ref={fan} className={`fan-at bw-fan-at ${dir}`} style={dir === 'right' ? { left: `${px * 100}%`, top: `${py * 100}%` } : { right: `${(1 - px) * 100}%`, top: `${py * 100}%` }}>
          <Fan
            items={options!}
            dir={dir}
            onPick={(k) => {
              onOption?.(k);
              setOpen(false);
            }}
          />
        </div>
      )}
    </>
  );
}

/** Le choix du pinceau : toucher pour passer au suivant, double toucher ou appui long pour choisir. */
function Picker({ face, title, next, choices, at: [px, py] }: NonNullable<Props['pick']> & { at: [number, number] }) {
  const [open, setOpen] = useState(false);
  const press = useRef<{ timer: number; long: boolean } | null>(null);
  const single = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (single.current) clearTimeout(single.current);
    },
    [],
  );
  return (
    <>
      <button
        className={`bw-pick ${open ? 'on' : ''}`}
        style={{ left: `${px * 100}%`, top: `${py * 100}%` }}
        title={`${title} (toucher : suivant ; double toucher ou appui long : choisir)`}
        aria-label={title}
        onPointerDown={() => {
          const st = { timer: 0, long: false };
          st.timer = window.setTimeout(() => {
            st.long = true;
            if (choices) setOpen(true);
          }, 480);
          press.current = st;
        }}
        onPointerUp={() => {
          const st = press.current;
          press.current = null;
          if (!st) return;
          clearTimeout(st.timer);
          if (st.long) return;
          if (single.current) {
            // deuxième toucher : on ouvre le choix au lieu de passer au suivant
            clearTimeout(single.current);
            single.current = null;
            if (choices) setOpen(true);
            return;
          }
          if (open) return setOpen(false);
          single.current = window.setTimeout(() => {
            single.current = null;
            next?.();
          }, 260);
        }}
        onPointerLeave={() => {
          if (press.current) clearTimeout(press.current.timer);
          press.current = null;
        }}
      >
        {face}
      </button>
      {open && choices && (
        <div
          className="bw-choices"
          ref={(el) => {
            // sous la barre du haut, comme les bulles palette et lumière
            if (!el?.parentElement) return;
            el.style.maxHeight = `${Math.max(160, el.parentElement.getBoundingClientRect().top - 10 - TOPBAR)}px`;
          }}
        >
          <div className="b-title">{title}</div>
          {choices(() => setOpen(false))}
        </div>
      )}
    </>
  );
}
