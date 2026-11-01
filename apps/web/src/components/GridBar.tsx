import type { GridSpec } from '@ftd/core';

interface Props {
  grid: GridSpec;
  onChange: (grid: GridSpec) => void;
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="stepper">
      <span>{label}</span>
      <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`${label} : moins`}>
        −
      </button>
      <strong>{value}</strong>
      <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`${label} : plus`}>
        +
      </button>
    </div>
  );
}

/** Réglages de la grille du projet : identiques sur tous les formats. */
export function GridBar({ grid, onChange }: Props) {
  return (
    <div className="grid-bar glass">
      <Stepper label="Colonnes" value={grid.cols} min={1} max={24} onChange={(cols) => onChange({ ...grid, cols })} />
      <Stepper label="Rangées" value={grid.rows} min={1} max={24} onChange={(rows) => onChange({ ...grid, rows })} />
      <label className="grid-margin">
        <span>Marge</span>
        <input
          type="range"
          min={0}
          max={0.2}
          step={0.005}
          value={grid.margin}
          onChange={(e) => onChange({ ...grid, margin: Number(e.target.value) })}
        />
        <strong>{Math.round(grid.margin * 1000) / 10} %</strong>
      </label>
      <label className="grid-margin">
        <span>Gouttière</span>
        <input
          type="range"
          min={0}
          max={0.05}
          step={0.0025}
          value={grid.gutter}
          onChange={(e) => onChange({ ...grid, gutter: Number(e.target.value) })}
        />
        <strong>{Math.round(grid.gutter * 1000) / 10} %</strong>
      </label>
    </div>
  );
}
