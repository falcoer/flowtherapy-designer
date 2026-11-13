import { useRef, useState } from 'react';

/** Petits dessins des potards : ce que règle chacun (repère 16 × 16, centré sur 8,8). */
const KNOB_GLYPHS: Array<[RegExp, string, boolean?]> = [
  [/^seuil/i, 'M8 2.5a5.5 5.5 0 0 0 0 11z M8 2.5a5.5 5.5 0 0 1 0 11 5.5 5.5 0 0 1 0-11z', true],
  [/^lissage/i, 'M2 11c2-1 2-5 4-5s2 3 4 3 3-4 4-5'],
  [/^densit/i, 'M4 4h.01M8 4h.01M12 4h.01M4 8h.01M8 8h.01M12 8h.01M4 12h.01M8 12h.01M12 12h.01'],
  [/^écart/i, 'M5.5 8h.01M10.5 8h.01M3 5.5 1.5 8 3 10.5M13 5.5 14.5 8 13 10.5'],
  [/^ramification/i, 'M8 14V8M8 8 4.5 3.5M8 8l3.5-4.5M8 10.5 5 8.5M8 10l3-2.5'],
  [/^chaos/i, 'M2 10l2.5-5 2 7 2.5-9 2 8 2-4 1 2'],
  [/^taille noyau/i, 'M8 6.3a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4zM8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z'],
  [/^longueur/i, 'M4 13.5c1-3.5 1-7 0-11M8 13.5V2.5M12 13.5c-1-3.5-1-7 0-11'],
  [/^frisure/i, 'M2 9c0-3 3-3 3 0s3 3 3 0 3-3 3 0 3 3 3 0'],
  [/^roussi/i, 'M8 14c-2.6 0-4-1.8-4-3.9 0-1.9 1.2-3 1.9-4.5.4 1 1 1.6 1.6 1.8C7.3 5.3 8 3.6 9.5 2c.4 2.6 2.5 4.4 2.5 7.2 0 2.9-1.6 4.8-4 4.8zM8 14c-1 0-1.6-.8-1.6-1.7 0-1.1 1-1.7 1.6-2.8.6 1.1 1.6 1.7 1.6 2.8 0 .9-.6 1.7-1.6 1.7z'],
  [/^mélange/i, 'M6 3.5a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM10 4.5a4 4 0 1 1 0 8 4 4 0 0 1 0-8z'],
  [/^dessin/i, 'M3 13l.8-3L10.5 3.3l2.2 2.2L6 12.2zM9.3 4.5l2.2 2.2'],
  [/^intensit/i, 'M8 2.5c2.8 3.6 4 5.6 4 7.5a4 4 0 0 1-8 0c0-1.9 1.2-3.9 4-7.5z'],
  [/^bord/i, 'M3 3h10v10H3zM5.5 5.5h5v5h-5z'],
  [/^biseau/i, 'M2.5 2.5h11v11h-11zM5.5 5.5h5v5h-5zM2.5 2.5l3 3M13.5 2.5l-3 3M2.5 13.5l3-3M13.5 13.5l-3-3'],
  [/^distance/i, 'M6 6h4v4H6zM2.5 2.5h3M10.5 2.5h3M2.5 13.5h3M10.5 13.5h3M2.5 2.5v3M2.5 10.5v3M13.5 2.5v3M13.5 10.5v3'],
  [/^largeur/i, 'M2 8h12M4 5.5 1.5 8 4 10.5M12 5.5 14.5 8 12 10.5M8 4v8'],
  [/^graisse/i, 'M4 3h4.5a2.5 2.5 0 0 1 0 5H4zM4 8h5a2.5 2.5 0 0 1 0 5H4zM6 3v10'],
  [/^resserrage/i, 'M2 3.5 8 8l-6 4.5M8 8h6M10.5 5.5l3.5-1M10.5 10.5l3.5 1'],
  [/^cumul/i, 'M5 5h.01M9.5 3.5h.01M12 6.5h.01M7.5 7.5h.01M3 13c0-2 2.2-3.5 5-3.5s5 1.5 5 3.500z'],
  [/^courbure/i, 'M2 11Q8 3 14 11'],
  [/^espacement/i, 'M5 3v10M11 3v10M1.5 8h2M12.5 8h2M7 8h2'],
  [/^interligne/i, 'M3 4h10M3 12h10M8 6v4M6.5 7.2 8 5.8l1.5 1.4M6.5 8.8 8 10.2l1.5-1.4'],
];

/** Potard : tourne d'un geste (glisser vers le haut ou vers la droite pour monter),
 *  le libellé et le niveau s'affichent en surbrillance à côté tant qu'on le tient.
 *  Sa jauge est celle de la roue du pinceau : des segments de 6 h à 3 h, par la gauche et le haut.
 *  Double appui : retour au neutre pour un réglage à deux sens. */
export function Knob({ label, value, onChange, center, fmt }: { label: string; value: number; onChange: (v: number) => void; center?: boolean; fmt?: (v: number) => string }) {
  const drag = useRef<{ x: number; y: number; v: number; id: number } | null>(null);
  const lastTap = useRef(0);
  const [held, setHeld] = useState(false);
  const N = 12;
  const A0 = Math.PI; // 6 h
  const A1 = 2.5 * Math.PI; // 3 h
  const [r0, r1] = [16, 21.5];
  const at = (a: number, r: number) => [22 + Math.sin(a) * r, 22 - Math.cos(a) * r].map((n) => n.toFixed(2)).join(' ');
  const seg = (a: number, b: number) => `M${at(a, r1)}A${r1} ${r1} 0 0 1 ${at(b, r1)}L${at(b, r0)}A${r0} ${r0} 0 0 0 ${at(a, r0)}Z`;
  const lit = (i: number) => {
    const [lo, hi] = [i / N, (i + 1) / N];
    if (!center) return hi <= value + 1e-6 ? 'on' : (lo + hi) / 2 <= value ? 'half' : '';
    // à deux sens : du milieu vers la valeur
    const [a, b] = value >= 0.5 ? [0.5, value] : [value, 0.5];
    return lo >= a - 1e-6 && hi <= b + 1e-6 ? 'on' : (lo + hi) / 2 > a && (lo + hi) / 2 < b ? 'half' : '';
  };
  const glyph = KNOB_GLYPHS.find(([re]) => re.test(label));
  const shown = fmt ? fmt(value) : center ? `${value >= 0.5 ? '+' : '−'}${Math.round(Math.abs(value - 0.5) * 200)}` : `${Math.round(value * 100)} %`;
  const end = () => {
    drag.current = null;
    setHeld(false);
  };
  return (
    <div
      className={`knob ${held ? 'held' : ''}`}
      title={label}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      aria-valuetext={shown}
      onKeyDown={(e) => {
        // au clavier : flèches (Maj pour aller plus vite), Début et Fin
        const k = e.key;
        const d = e.shiftKey ? 0.1 : 0.02;
        const v = k === 'ArrowUp' || k === 'ArrowRight' ? value + d : k === 'ArrowDown' || k === 'ArrowLeft' ? value - d : k === 'Home' ? 0 : k === 'End' ? 1 : null;
        if (v === null) return;
        e.preventDefault();
        e.stopPropagation();
        onChange(Math.max(0, Math.min(1, v)));
      }}
      onPointerDown={(e) => {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        const now = performance.now();
        if (center && now - lastTap.current < 320) onChange(0.5);
        lastTap.current = now;
        drag.current = { x: e.clientX, y: e.clientY, v: value, id: e.pointerId };
        setHeld(true);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        // 180 px de geste pour toute la course ; le crayon règle plus finement
        const span = e.pointerType === 'pen' ? 320 : 180;
        let v = Math.max(0, Math.min(1, d.v + (d.y - e.clientY + (e.clientX - d.x)) / span));
        if (center && Math.abs(v - 0.5) < 0.03) v = 0.5;
        if (v !== value) onChange(v);
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <svg viewBox="0 0 44 44" aria-hidden>
        {Array.from({ length: N }, (_, i) => {
          const a = A0 + (i / N) * (A1 - A0);
          const b = A0 + ((i + 1) / N) * (A1 - A0);
          return <path key={i} className={`kn-seg ${lit(i)}`} d={seg(a + 0.035, b - 0.035)} />;
        })}
        {center && <path className="kn-zero" d={`M${at((A0 + A1) / 2, r0 - 1.5)}L${at((A0 + A1) / 2, r1 + 1.5)}`} />}
        <circle className="kn-cap" cx="22" cy="22" r="13.5" />
        {glyph && <path className={`kn-glyph ${glyph[2] ? 'filled' : ''}`} d={glyph[1]} transform="translate(11.6 11.6) scale(1.3)" />}
      </svg>
      {held && (
        <span className="kn-tag">
          <b>{label}</b>
          <span>{shown}</span>
        </span>
      )}
    </div>
  );
}
