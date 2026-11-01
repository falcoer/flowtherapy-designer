import { DELTA_SPECS, deltaSpec, type DeltaSpec, type Placed } from '@ftd/core';

interface Props {
  element: Placed;
  kind: 'image' | 'text' | 'missing';
  activeKey: string | null;
  fonts: Array<{ id: string; family: string }>;
  onFont: (font: string) => void;
  onPick: (key: string) => void;
  onChange: (key: string, value: number) => void;
  onRemove: () => void;
  /** Ouvre la palette pour choisir la couleur du texte. */
  onColor: () => void;
}

const TEXT_ONLY = ['color.hue', 'color.lightness', 'color.chroma'];

/**
 * Pastilles d'attributs de l'élément sélectionné, puis curseur centré :
 * on fait dévier l'attribut autour de sa valeur de base (0 = valeur d'origine).
 */
export function AttributeBar({ element, kind, activeKey, fonts, onFont, onPick, onChange, onRemove, onColor }: Props) {
  const specs = DELTA_SPECS.filter((s) => kind === 'text' || !TEXT_ONLY.includes(s.key));
  const spec = activeKey ? deltaSpec(activeKey) : undefined;
  const value = activeKey ? (element.deltas[activeKey] ?? 0) : 0;

  return (
    <div className="attr-bar glass">
      <div className="attr-chips">
        <span className="attr-title">{element.id}</span>
        {kind === 'text' && (
          <select className="chip" value={element.style.font ?? ''} onChange={(e) => onFont(e.target.value)} aria-label="Police">
            <option value="">Police par défaut</option>
            {fonts.map((f) => (
              <option key={f.id} value={f.id}>
                {f.family}
              </option>
            ))}
          </select>
        )}
        {kind === 'text' && (
          <button className="chip" onClick={onColor}>
            Couleur
          </button>
        )}
        {specs.map((s) => {
          const v = element.deltas[s.key] ?? 0;
          return (
            <button key={s.key} className={`chip ${activeKey === s.key ? 'on' : ''} ${v ? 'changed' : ''}`} onClick={() => onPick(s.key)}>
              {s.label}
            </button>
          );
        })}
        <button className="chip danger" onClick={onRemove}>
          Supprimer
        </button>
      </div>
      {spec && <DeltaSlider spec={spec} value={value} onChange={(v) => onChange(spec.key, v)} />}
    </div>
  );
}

/** Curseur centré : 0 au milieu, double-clic ou pastille de valeur pour revenir à 0. */
export function DeltaSlider({ spec, value, onChange }: { spec: DeltaSpec; value: number; onChange: (v: number) => void }) {
  return (
        <div className="delta">
          <span className="delta-min">{spec.describe(spec.min)}</span>
          <div className="delta-track">
            <input
              type="range"
              min={spec.min}
              max={spec.max}
              step={spec.step}
              value={value}
              onChange={(e) => onChange(Number(e.target.value))}
              onDoubleClick={() => onChange(0)}
              aria-label={spec.label}
            />
            <span className="delta-zero" style={{ left: `${((0 - spec.min) / (spec.max - spec.min)) * 100}%` }} />
          </div>
          <span className="delta-max">{spec.describe(spec.max)}</span>
          <button className="delta-value" onClick={() => onChange(0)} title="Revenir à 0">
            {spec.describe(value)}
          </button>
        </div>
  );
}
