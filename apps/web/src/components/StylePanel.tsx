import type { Placed } from '@ftd/core';

interface Props {
  element: Placed;
  kind: 'image' | 'text' | 'shape' | 'missing';
  fonts: Array<{ id: string; family: string }>;
  onStyle: (patch: Partial<Placed['style']>) => void;
  onOpacity: (delta: number) => void;
}

const ALIGN_ICONS: Array<['start' | 'middle' | 'end', string, string]> = [
  ['start', 'M5 7h14M5 12h9M5 17h12', 'Aligné à gauche'],
  ['middle', 'M5 7h14M7.5 12h9M6 17h12', 'Centré'],
  ['end', 'M5 7h14M10 12h9M7 17h12', 'Aligné à droite'],
];

/** Polices toujours disponibles (chargées par l'application) ; une police de la bibliothèque s'y ajoute. */
const BUILTIN = [
  { id: 'Agbalumo', family: 'Agbalumo' },
  { id: 'Inter', family: 'Inter' },
  { id: 'Georgia', family: 'Georgia' },
];

/** Police et style (texte) ; opacité pour tous les éléments. */
export function StylePanel({ element, kind, fonts, onStyle, onOpacity }: Props) {
  const opacity = 1 + (element.deltas.opacity ?? 0);
  const weight = element.style.weight ?? 400;
  const align = element.style.align ?? 'middle';
  return (
    <div className="style-panel">
      {kind === 'text' && (
        <>
          <div className="font-list" role="listbox" aria-label="Police">
            {[{ id: '', family: 'Par défaut' }, ...BUILTIN.filter((b) => !fonts.some((f) => f.family === b.family)), ...fonts].map((f) => (
              <button
                key={f.id}
                className={(element.style.font ?? '') === f.id ? 'on' : ''}
                style={{ fontFamily: f.id ? `"${f.family}"` : 'var(--font-display)' }}
                onClick={() => onStyle({ font: f.id || undefined })}
              >
                {f.family}
              </button>
            ))}
          </div>
          <div className="cp-line">
            <div className="seg-icons">
              {[400, 700].map((w) => (
                <button key={w} className={weight === w ? 'on' : ''} onClick={() => onStyle({ weight: w === 400 ? undefined : w })} title={w === 700 ? 'Gras' : 'Normal'}>
                  <span style={{ fontWeight: w, fontFamily: 'Georgia, serif', fontSize: 16 }}>B</span>
                </button>
              ))}
            </div>
            <div className="seg-icons">
              {ALIGN_ICONS.map(([a, d, title]) => (
                <button key={a} className={align === a ? 'on' : ''} onClick={() => onStyle({ align: a })} title={title}>
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                    <path d={d} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <label className="opacity-row" title="Opacité">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" fillOpacity="0.5" />
        </svg>
        <input type="range" min={0} max={1} step={0.01} value={opacity} onChange={(e) => onOpacity(Number(e.target.value) - 1)} />
        <strong>{Math.round(opacity * 100)} %</strong>
      </label>
    </div>
  );
}
