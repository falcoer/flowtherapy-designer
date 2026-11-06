import { useRef, useState } from 'react';

export type Tip = 'round' | 'flat' | 'triangle';

interface Props {
  /** Taille, de 0 à 1, et son affichage. */
  size: number;
  sizeText: string;
  onSize: (v: number) => void;
  /** Intensité, de 0 à 1 (absente : pas de jauge). */
  intensity?: number;
  onIntensity?: (v: number) => void;
  /** Rotation, en radians (absente : la pointe ne tourne pas). */
  rotation?: number;
  onRotation?: (a: number) => void;
  /** Inclinaison, x et y de -1 à 1 (absente : pas d'inclinaison). */
  tilt?: [number, number];
  onTilt?: (x: number, y: number) => void;
  /** Empreinte montrée au centre : une pointe, ou l'image d'un tampon. */
  tip?: Tip;
  /** Choix de la forme de pointe, sous la roue (absent : pas de choix, comme pour les tampons). */
  onTip?: (t: Tip) => void;
  stamp?: string;
  /** Pendant un réglage de la pointe (taille, rotation, inclinaison) et au lâcher : montrer l'empreinte en vraie grandeur sur la page. */
  onSizing?: (on: boolean) => void;
}

const S = 176;
const C = S / 2;
const RING = 78; // jauge d'intensité
const MAXF = 54; // rayon de l'empreinte à taille maximale
const MINF = 7;
const A0 = (-135 * Math.PI) / 180; // la jauge va de -135° à +135° (0 en haut)
const A1 = (135 * Math.PI) / 180;

const fr = (v: number) => MINF + v * (MAXF - MINF);
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
/** Point à l'angle a (0 en haut, sens horaire) et au rayon r. */
const at = (a: number, r: number): [number, number] => [C + Math.sin(a) * r, C - Math.cos(a) * r];
const arc = (a: number, b: number, r: number) => {
  const [x0, y0] = at(a, r);
  const [x1, y1] = at(b, r);
  return `M${x0} ${y0}A${r} ${r} 0 ${b - a > Math.PI ? 1 : 0} 1 ${x1} ${y1}`;
};

/** Points d'une empreinte en pointillés, pour l'allure « nuage de points ». */
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

/**
 * Roue du pinceau : une seule palette pour le modelage, le dessin et les tampons.
 * Gestes : faire glisser le long de l'anneau règle l'intensité ; tirer le bord de l'empreinte règle la taille
 * (vers l'extérieur ou l'intérieur) et la rotation (en tournant) ; pousser le point du centre l'incline.
 * Double toucher : sur l'anneau, l'intensité revient au neutre ; ailleurs, la rotation et l'inclinaison reviennent à zéro.
 */
export function BrushWheel(p: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef<{ zone: 'ring' | 'edge' | 'tilt'; x: number; y: number; lock?: 'size' | 'rot'; a0: number; rot0: number } | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const lastTap = useRef<{ t: number; zone: string }>({ t: 0, zone: '' });
  const rot = p.rotation ?? 0;
  const [tx, ty] = p.tilt ?? [0, 0];
  const R = fr(p.size);

  const local = (e: React.PointerEvent) => {
    const b = ref.current!.getBoundingClientRect();
    const k = S / b.width;
    return [(e.clientX - b.left) * k - C, (e.clientY - b.top) * k - C] as const;
  };
  const angle = (x: number, y: number) => Math.atan2(x, -y);

  const apply = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const [x, y] = local(e);
    if (d.zone === 'ring' && p.onIntensity) {
      const a = clamp(angle(x, y), A0, A1);
      p.onIntensity(Math.round(((a - A0) / (A1 - A0)) * 100) / 100);
      setActive(`Intensité ${Math.round(((a - A0) / (A1 - A0)) * 100)} %`);
    } else if (d.zone === 'tilt' && p.onTilt) {
      let [u, v] = [x / (MAXF * 0.9), y / (MAXF * 0.9)];
      const m = Math.hypot(u, v);
      if (m > 1) [u, v] = [u / m, v / m];
      if (Math.hypot(u, v) < 0.08) [u, v] = [0, 0];
      p.onTilt(Math.round(u * 100) / 100, Math.round(v * 100) / 100);
      setActive(`Inclinaison ${Math.round(Math.hypot(u, v) * 100)} %`);
    } else if (d.zone === 'edge') {
      // le geste choisit son sens dès les premiers pixels : tirer (taille) ou tourner (rotation)
      if (!d.lock) {
        const moved = Math.hypot(x - d.x, y - d.y);
        if (moved < 5) return;
        const radial = Math.abs((x - d.x) * d.x + (y - d.y) * d.y) / (Math.hypot(d.x, d.y) || 1);
        d.lock = p.onRotation && radial < moved * 0.6 ? 'rot' : 'size';
        p.onSizing?.(true);
      }
      if (d.lock === 'size') {
        const v = clamp((Math.hypot(x, y) - MINF) / (MAXF - MINF));
        p.onSize(Math.round(v * 100) / 100);
        setActive(`Taille ${p.sizeText}`);
      } else if (p.onRotation) {
        let a = d.rot0 + angle(x, y) - d.a0;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        const deg = (a * 180) / Math.PI;
        const snap = Math.round(deg / 15) * 15;
        if (Math.abs(deg - snap) < 3) a = (snap * Math.PI) / 180;
        p.onRotation(a);
        setActive(`Rotation ${Math.round((a * 180) / Math.PI)}°`);
      }
    }
  };

  const down = (e: React.PointerEvent) => {
    const [x, y] = local(e);
    const r = Math.hypot(x, y);
    const tiltAt = [tx * MAXF * 0.9, ty * MAXF * 0.9];
    let zone: 'ring' | 'edge' | 'tilt' | null = null;
    if (p.onIntensity && r >= RING - 12 && r <= C) zone = 'ring';
    else if (p.onTilt && Math.hypot(x - tiltAt[0]!, y - tiltAt[1]!) < 15) zone = 'tilt';
    else if (r < RING - 12) zone = 'edge';
    if (!zone) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const now = performance.now();
    if (now - lastTap.current.t < 320 && lastTap.current.zone === zone) {
      // double toucher : au neutre
      if (zone === 'ring') p.onIntensity?.(0.85);
      else {
        // ailleurs sur la roue : la pointe revient droite et à plat
        p.onRotation?.(0);
        p.onTilt?.(0, 0);
      }
      lastTap.current = { t: 0, zone: '' };
      return;
    }
    lastTap.current = { t: now, zone };
    drag.current = { zone, x, y, a0: angle(x, y), rot0: rot };
    if (zone === 'tilt') p.onSizing?.(true);
    // sur l'anneau, le toucher règle tout de suite ; ailleurs, on attend le sens du geste
    if (zone !== 'edge') apply(e);
  };

  // empreinte : tournée, puis mise en perspective vers l'inclinaison
  const k = Math.min(1, Math.hypot(tx, ty));
  const dir = Math.atan2(ty, tx);
  const persp = k > 0.02 ? `rotate(${(dir * 180) / Math.PI}) scale(${1 - k * 0.35} 1) rotate(${(-dir * 180) / Math.PI})` : '';
  const dots = p.stamp ? [] : stipple(p.tip ?? 'round', R, p.intensity ?? 0.8);
  const ia = p.intensity !== undefined ? A0 + p.intensity * (A1 - A0) : A0;
  const knob = at(rot, R);
  const ticks = Array.from({ length: 28 }, (_, i) => A0 + (i / 27) * (A1 - A0));
  return (
    <div className="brush-wheel">
      <svg
        ref={ref}
        viewBox={`0 0 ${S} ${S}`}
        onPointerDown={down}
        onPointerMove={(e) => e.buttons && apply(e)}
        onPointerUp={() => {
          if (drag.current?.lock || drag.current?.zone === 'tilt') p.onSizing?.(false);
          drag.current = null;
          setActive(null);
        }}
        onPointerCancel={() => {
          if (drag.current?.lock || drag.current?.zone === 'tilt') p.onSizing?.(false);
          drag.current = null;
          setActive(null);
        }}
      >
        <defs>
          <pattern id="bw-grid" width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="3" r="0.55" className="bw-grid-dot" />
          </pattern>
        </defs>
        {/* couronne pleine, centre transparent : on voit la page à travers */}
        <circle cx={C} cy={C} r={C - 1} className="bw-center" />
        <circle cx={C} cy={C} r={(C - 1 + RING - 13) / 2} className="bw-disc" strokeWidth={C - 1 - (RING - 13)} />
        <circle cx={C} cy={C} r={RING - 13} fill="url(#bw-grid)" />
        {/* cercles de taille repères */}
        <circle cx={C} cy={C} r={MAXF} className="bw-guide" />
        <circle cx={C} cy={C} r={fr(0.5)} className="bw-guide faint" />
        {p.intensity !== undefined && (
          <>
            {ticks.map((a, i) => {
              const [x0, y0] = at(a, RING + 6);
              const [x1, y1] = at(a, RING + (i % 9 === 0 ? 11 : 9));
              return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} className={`bw-tick ${a <= ia + 1e-6 ? 'on' : ''}`} />;
            })}
            <path d={arc(A0, A1, RING)} className="bw-track" />
            {p.intensity > 0.005 && <path d={arc(A0, ia, RING)} className="bw-level" />}
            <circle cx={at(ia, RING)[0]} cy={at(ia, RING)[1]} r={5} className="bw-knob" />
          </>
        )}
        <g transform={`translate(${C} ${C}) ${persp} rotate(${(rot * 180) / Math.PI})`}>
          {p.stamp ? (
            <image href={p.stamp} x={-R} y={-R} width={R * 2} height={R * 2} opacity={0.35 + 0.65 * (p.intensity ?? 1)} />
          ) : (
            dots.map(([x, y, o], i) => <circle key={i} cx={x} cy={y} r={0.95} className="bw-dot" opacity={o} />)
          )}
          {p.stamp || (p.tip ?? 'round') === 'round' ? <circle r={R} className="bw-edge" /> : null}
        </g>
        {/* poignée : tirer pour la taille, tourner pour la rotation */}
        <line x1={C} y1={C} x2={knob[0]} y2={knob[1]} className="bw-spoke" />
        <circle cx={knob[0]} cy={knob[1]} r={4.5} className="bw-handle" />
        {p.onTilt && (
          <>
            <circle cx={C} cy={C} r={MAXF * 0.9} className="bw-guide faint dashed" />
            {/* pastille d'inclinaison : à pousser hors du centre */}
            <g transform={`translate(${C + tx * MAXF * 0.9} ${C + ty * MAXF * 0.9})`} className="bw-tilt-g">
              <circle r={8} className="bw-tilt" />
              <path d="M-12 0h-3M12 0h3M0 -12v-3M0 12v3" className="bw-tilt-cross" />
              <circle r={2} className="bw-tilt-dot" />
            </g>
          </>
        )}
        <text x={C} y={S - 18} className="bw-label">
          {active ?? `Ø ${p.sizeText}${p.onRotation ? ` · ${Math.round((rot * 180) / Math.PI)}°` : ''}`}
        </text>
        {p.intensity !== undefined && !active && (
          <text x={C} y={S - 7} className="bw-label faint">
            INT {Math.round(p.intensity * 100)}
            {p.onTilt ? ` · INCL ${Math.round(k * 100)}` : ''}
          </text>
        )}
      </svg>
      {p.onTip && (
        <div className="bw-tips">
          {(
            [
              ['round', 'Ronde', 'M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10z'],
              ['flat', 'Plate', 'M4 10.5h16v3H4z'],
              ['triangle', 'Triangle', 'M12 6l6 10.5H6z'],
            ] as const
          ).map(([t, name, d]) => (
            <button key={t} className={(p.tip ?? 'round') === t ? 'on' : ''} onClick={() => p.onTip!(t)} title={`Pointe ${name.toLowerCase()}`} aria-label={`Pointe ${name.toLowerCase()}`}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                <path d={d} fill="currentColor" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
