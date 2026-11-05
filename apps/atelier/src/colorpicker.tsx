import { useEffect, useRef, useState } from 'react';

/**
 * Éditeur de couleur et de dégradé dans la fenêtre de palette : un cercle des teintes
 * (teinte autour, pureté vers le bord), un curseur de luminosité, la barre du dégradé
 * avec ses teintes à toucher, et l'aperçu du résultat en bas à droite.
 * Les couleurs déjà choisies sont reportées sur le cercle, cerclées vif, pour y revenir d'un toucher.
 */

type HSV = { h: number; s: number; v: number };
const RECENT = 'ftd-atelier-recent-colors';

export function hexToHsv(hex: string): HSV {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1]!, 16) : 0;
  const [r, g, b] = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  const mx = Math.max(r, g, b);
  const d = mx - Math.min(r, g, b);
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: mx ? d / mx : 0, v: mx };
}
export function hsvToHex({ h, s, v }: HSV): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return (
    '#' +
    [f(5), f(3), f(1)]
      .map((x) =>
        Math.round(x * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT) ?? '[]');
  } catch {
    return [];
  }
}

export function GradientEditor({ stops, used, onChange }: { stops: string[]; used: string[]; onChange: (stops: string[], commit: boolean) => void }) {
  const [sel, setSel] = useState(0);
  const i = Math.min(sel, stops.length - 1);
  const cur = stops[i]!;
  // la teinte est gardée même quand la couleur passe au gris (pureté nulle) ou au noir
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(cur));
  useEffect(() => {
    if (hsvToHex(hsv) !== cur.toLowerCase()) setHsv(hexToHsv(cur));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, i]);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [hex, setHex] = useState(cur);
  useEffect(() => setHex(cur), [cur]);

  const wheel = useRef<HTMLDivElement>(null);
  const grab = useRef(false);
  const apply = (next: HSV, commit: boolean) => {
    setHsv(next);
    onChange(
      stops.map((x, j) => (j === i ? hsvToHex(next) : x)),
      commit,
    );
  };
  /** Mémorise la couleur arrêtée, pour la retrouver plus tard parmi les rappels. */
  const remember = (c: string) => {
    const list = [c, ...recent.filter((x) => x !== c)].slice(0, 12);
    setRecent(list);
    try {
      localStorage.setItem(RECENT, JSON.stringify(list));
    } catch {
      /* stockage indisponible */
    }
  };
  const fromWheel = (e: React.PointerEvent, commit: boolean) => {
    const r = wheel.current!.getBoundingClientRect();
    const [x, y] = [e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2];
    const s = Math.min(1, Math.hypot(x, y) / (r.width / 2));
    const h = ((Math.atan2(y, x) * 180) / Math.PI + 450) % 360;
    apply({ h, s, v: hsv.v || 1 }, commit);
  };
  // rappels : couleurs de la palette et dernières choisies, sans doublon
  const marks = [...new Set([...used, ...recent].map((c) => c.toLowerCase()))].filter((c) => /^#[0-9a-f]{6}$/.test(c));
  const at = (c: string) => {
    const m = hexToHsv(c);
    const a = ((m.h - 90) * Math.PI) / 180;
    return { left: `${50 + Math.cos(a) * m.s * 50}%`, top: `${50 + Math.sin(a) * m.s * 50}%` };
  };
  const pure = hsvToHex({ h: hsv.h, s: hsv.s, v: 1 });
  const grad = stops.length > 1 ? `linear-gradient(90deg, ${stops.join(',')})` : cur;

  return (
    <div className="cp">
      <div className="cp-top">
        <div
          ref={wheel}
          className="cp-wheel"
          style={{ ['--dim' as string]: String(1 - hsv.v) }}
          onPointerDown={(e) => {
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
            grab.current = true;
            fromWheel(e, true);
          }}
          onPointerMove={(e) => grab.current && fromWheel(e, false)}
          onPointerUp={() => {
            grab.current = false;
            remember(cur);
          }}
          onPointerCancel={() => (grab.current = false)}
        >
          {marks.map((c) => (
            <button
              key={c}
              className="cp-mark"
              style={{ ...at(c), background: c }}
              title={`Reprendre ${c}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                apply(hexToHsv(c), true);
              }}
            />
          ))}
          <span className="cp-cursor" style={{ ...at(pure), background: cur }} />
        </div>
        <div className="cp-side">
          <label className="cp-light">
            <span className="tb-label">Luminosité</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={hsv.v}
              style={{ background: `linear-gradient(90deg, #000, ${pure})` }}
              onPointerDown={() => onChange(stops, true)}
              onChange={(e) => apply({ ...hsv, v: Number(e.target.value) }, false)}
              onPointerUp={() => remember(cur)}
            />
          </label>
          <input
            className="cp-hex"
            value={hex}
            aria-label="Code de la couleur"
            onChange={(e) => {
              setHex(e.target.value);
              const v = e.target.value.trim().replace(/^([0-9a-f]{6})$/i, '#$1');
              if (/^#[0-9a-f]{6}$/i.test(v)) apply(hexToHsv(v), true);
            }}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <div className="cp-recall" aria-label="Couleurs déjà choisies">
            {marks.slice(0, 12).map((c) => (
              <button key={c} className={`cp-chip ${c === cur.toLowerCase() ? 'on' : ''}`} style={{ background: c }} onClick={() => apply(hexToHsv(c), true)} title={c} />
            ))}
          </div>
        </div>
      </div>
      <div className="cp-bottom">
        <div className="cp-bar-wrap">
          <div className="cp-bar" style={{ background: grad }}>
            {stops.map((c, j) => (
              <button
                key={j}
                className={`cp-stop ${j === i ? 'on' : ''}`}
                style={{ left: stops.length > 1 ? `${(j / (stops.length - 1)) * 100}%` : '50%', background: c }}
                onClick={() => setSel(j)}
                title={`Teinte ${j + 1}`}
              />
            ))}
          </div>
          <div className="cp-bar-tools">
            <button
              onClick={() => {
                // nouvelle teinte juste après celle choisie, un peu plus claire
                const n = hexToHsv(cur);
                const next = [...stops.slice(0, i + 1), hsvToHex({ ...n, v: Math.min(1, n.v + 0.25), s: n.s * 0.8 }), ...stops.slice(i + 1)];
                onChange(next, true);
                setSel(i + 1);
              }}
              title="Ajouter une teinte : deux teintes ou plus font un dégradé"
            >
              ＋ Teinte
            </button>
            {stops.length > 1 && (
              <button
                onClick={() => {
                  onChange(
                    stops.filter((_, j) => j !== i),
                    true,
                  );
                  setSel(Math.max(0, i - 1));
                }}
                title="Retirer la teinte choisie"
              >
                Retirer
              </button>
            )}
            {stops.length > 1 && (
              <button onClick={() => onChange([...stops].reverse(), true)} title="Inverser le dégradé">
                ⇄
              </button>
            )}
          </div>
        </div>
        <span className="cp-preview" style={{ background: stops.length > 1 ? `linear-gradient(135deg, ${stops.join(',')})` : cur }} title={stops.length > 1 ? 'Dégradé obtenu' : 'Couleur obtenue'} />
      </div>
    </div>
  );
}
