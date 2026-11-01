import { EFFECT_SPECS } from '@ftd/core';
import type React from 'react';
import { BlurIcon, ContrastIcon, DilutionIcon, HueIcon, OpacityIcon, SaturationIcon } from './Icons';

interface Props {
  /** Deltas de l'élément (ou du fond). */
  deltas: Record<string, number>;
  onChange: (key: string, value: number) => void;
  onReset: () => void;
}

const ICONS: Record<string, React.ReactNode> = {
  opacity: <OpacityIcon />,
  'fx.dilution': <DilutionIcon />,
  'fx.blur': <BlurIcon />,
  'fx.saturation': <SaturationIcon />,
  'fx.hue': <HueIcon />,
  'fx.contrast': <ContrastIcon />,
};

/** Effets d'un élément ou du fond : un curseur par effet, un appui sur la valeur la remet à zéro. */
export function EffectsPanel({ deltas, onChange, onReset }: Props) {
  const changed = EFFECT_SPECS.some((s) => (deltas[s.key] ?? s.neutral) !== s.neutral);
  return (
    <div className="fx-panel">
      {EFFECT_SPECS.map((s) => {
        const v = deltas[s.key] ?? s.neutral;
        const on = v !== s.neutral;
        // l'opacité se lit de 0 à 100 % : le curseur part de la gauche
        const fill = s.key === 'opacity' ? 1 + v : (v - s.min) / (s.max - s.min);
        const from = s.min < 0 && s.max > 0 ? 0.5 : 0;
        return (
          <label key={s.key} className={on ? 'fx-row on' : 'fx-row'} title={s.label}>
            <span className="fx-icon">{ICONS[s.key]}</span>
            <span className="fx-label">{s.label}</span>
            <input
              type="range"
              min={s.key === 'opacity' ? 0 : s.min}
              max={s.key === 'opacity' ? 1 : s.max}
              step={s.step}
              value={s.key === 'opacity' ? 1 + v : v}
              style={{ '--from': `${Math.min(from, fill) * 100}%`, '--to': `${Math.max(from, fill) * 100}%` } as React.CSSProperties}
              onChange={(e) => onChange(s.key, s.key === 'opacity' ? Number(e.target.value) - 1 : Number(e.target.value))}
            />
            <button
              type="button"
              className="fx-value"
              disabled={!on}
              title="Remettre à zéro"
              onClick={(e) => {
                e.preventDefault();
                onChange(s.key, s.neutral);
              }}
            >
              {s.describe(v)}
            </button>
          </label>
        );
      })}
      <button className="fx-reset" disabled={!changed} onClick={onReset}>
        Retirer tous les effets
      </button>
    </div>
  );
}
