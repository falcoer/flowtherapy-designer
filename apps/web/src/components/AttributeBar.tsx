import { DELTA_SPECS, deltaSpec, type Placed } from '@ftd/core';

interface Props {
  element: Placed;
  kind: 'image' | 'text' | 'missing';
  activeKey: string | null;
  onPick: (key: string) => void;
  onChange: (key: string, value: number) => void;
  onRemove: () => void;
}

const TEXT_ONLY = ['color.hue', 'color.lightness', 'color.chroma'];

/**
 * Pastilles d'attributs de l'élément sélectionné, puis curseur centré :
 * on fait dévier l'attribut autour de sa valeur de base (0 = valeur d'origine).
 */
export function AttributeBar({ element, kind, activeKey, onPick, onChange, onRemove }: Props) {
  const specs = DELTA_SPECS.filter((s) => kind === 'text' || !TEXT_ONLY.includes(s.key));
  const spec = activeKey ? deltaSpec(activeKey) : undefined;
  const value = activeKey ? (element.deltas[activeKey] ?? 0) : 0;

  return (
    <div className="attr-bar glass">
      <div className="attr-chips">
        <span className="attr-title">{element.id}</span>
        {specs.map((s) => {
          const v = element.deltas[s.key] ?? 0;
          return (
            <button key={s.key} className={`chip ${activeKey === s.key ? 'on' : ''} ${v ? 'changed' : ''}`} onClick={() => onPick(s.key)}>
              {s.label}
            </button>
          );
        })}
        <button className="chip danger" onClick={onRemove}>
          Retirer
        </button>
      </div>
      {spec && (
        <div className="delta">
          <span className="delta-min">{spec.describe(spec.min)}</span>
          <div className="delta-track">
            <input
              type="range"
              min={spec.min}
              max={spec.max}
              step={spec.step}
              value={value}
              onChange={(e) => onChange(spec.key, Number(e.target.value))}
              onDoubleClick={() => onChange(spec.key, 0)}
              aria-label={spec.label}
            />
            <span className="delta-zero" style={{ left: `${((0 - spec.min) / (spec.max - spec.min)) * 100}%` }} />
          </div>
          <span className="delta-max">{spec.describe(spec.max)}</span>
          <button className="delta-value" onClick={() => onChange(spec.key, 0)} title="Revenir à 0">
            {spec.describe(value)}
          </button>
        </div>
      )}
    </div>
  );
}
