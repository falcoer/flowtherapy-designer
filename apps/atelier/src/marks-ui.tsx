import { MARKS, markColor, type MarkKind } from './marks';

/**
 * Légende des repères : une pastille par sorte de point ou de ligne. Avec
 * `onChange`, chaque pastille ouvre le choix de sa couleur (préférences).
 */
export function MarkLegend({
  kinds,
  colors,
  onChange,
}: {
  kinds: MarkKind[];
  colors: Partial<Record<MarkKind, string>>;
  onChange?: (c: Partial<Record<MarkKind, string>>) => void;
}) {
  return (
    <div className={`mark-legend ${onChange ? 'edit' : ''}`}>
      {kinds.map((k) => {
        const m = MARKS[k];
        const c = colors[k] ?? m.color;
        return (
          <label key={k} className={`mark ${m.soon ? 'soon' : ''}`} title={m.hint}>
            <span className={`mark-dot ${m.group === 'page' ? 'line' : ''}`} style={{ background: markColor(k) }}>
              {onChange && (
                <input
                  type="color"
                  value={c}
                  onChange={(e) => {
                    const next = { ...colors };
                    if (e.target.value.toLowerCase() === m.color.toLowerCase()) delete next[k];
                    else next[k] = e.target.value;
                    onChange(next);
                  }}
                  aria-label={`Couleur : ${m.label}`}
                />
              )}
            </span>
            <span className="mark-name">
              {m.label}
              {onChange && <small>{m.soon ? `${m.hint} (à venir)` : m.hint}</small>}
            </span>
          </label>
        );
      })}
    </div>
  );
}
