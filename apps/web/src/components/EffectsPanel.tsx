import { DEPTH_SPECS, EFFECT_SPECS, type EffectSpec } from '@ftd/core';
import type React from 'react';
import { BlurIcon, ContrastIcon, DilutionIcon, HueIcon, LightIcon, OpacityIcon, ReliefIcon, SaturationIcon, ShadowIcon, SoftIcon } from './Icons';

interface Props {
  /** Deltas de l'élément (ou du fond). */
  deltas: Record<string, number>;
  onChange: (key: string, value: number) => void;
  onReset: () => void;
  /** Effets de volume (éléments seulement, pas le fond). */
  depth?: { color: string | undefined; swatches: Array<{ value: string; hex: string; name?: string }>; onColor: (value: string | undefined) => void };
}

const ICONS: Record<string, React.ReactNode> = {
  opacity: <OpacityIcon />,
  'fx.dilution': <DilutionIcon />,
  'fx.blur': <BlurIcon />,
  'fx.saturation': <SaturationIcon />,
  'fx.hue': <HueIcon />,
  'fx.contrast': <ContrastIcon />,
  'fx.shadow': <ShadowIcon />,
  'fx.shadowSoft': <SoftIcon />,
  'fx.relief': <ReliefIcon />,
  'fx.light': <LightIcon />,
};

/** Effets d'un élément ou du fond : un curseur par effet, un appui sur la valeur la remet à zéro. */
export function EffectsPanel({ deltas, onChange, onReset, depth }: Props) {
  const specs = depth ? [...EFFECT_SPECS, ...DEPTH_SPECS] : EFFECT_SPECS;
  const changed = specs.some((s) => (deltas[s.key] ?? s.neutral) !== s.neutral);
  const hasDepth = (deltas['fx.shadow'] ?? 0) > 0 || (deltas['fx.relief'] ?? 0) > 0;

  const row = (s: EffectSpec, disabled = false) => {
    const v = deltas[s.key] ?? s.neutral;
    const on = v !== s.neutral;
    // l'opacité se lit de 0 à 100 % : le curseur part de la gauche
    const fill = s.key === 'opacity' ? 1 + v : (v - s.min) / (s.max - s.min);
    const from = s.min < 0 && s.max > 0 ? 0.5 : 0;
    return (
      <label key={s.key} className={`fx-row ${on ? 'on' : ''} ${disabled ? 'off' : ''}`} title={s.label}>
        <span className="fx-icon">{ICONS[s.key]}</span>
        <span className="fx-label">{s.label}</span>
        <input
          type="range"
          disabled={disabled}
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
  };

  return (
    <div className="fx-panel">
      {EFFECT_SPECS.map((s) => row(s))}
      {depth && (
        <>
          <div className="fx-section">Volume</div>
          {row(DEPTH_SPECS[0]!)}
          {row(DEPTH_SPECS[1]!, !(deltas['fx.shadow'] ?? 0))}
          {row(DEPTH_SPECS[2]!)}
          {row(DEPTH_SPECS[3]!, !hasDepth)}
          <div className={`fx-swatches ${deltas['fx.shadow'] ? '' : 'off'}`} role="radiogroup" aria-label="Couleur de l'ombre">
            <span className="fx-label">Couleur de l’ombre</span>
            <div>
              {depth.swatches.map((c) => (
                <button
                  key={c.value}
                  role="radio"
                  aria-checked={(depth.color ?? '#000000') === c.value}
                  className={(depth.color ?? '#000000') === c.value ? 'on' : ''}
                  style={{ background: c.hex }}
                  title={c.name ?? c.hex}
                  onClick={() => depth.onColor(c.value === '#000000' ? undefined : c.value)}
                />
              ))}
              <label className="fx-custom" title="Autre couleur">
                <input
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(depth.color ?? '') ? depth.color : '#000000'}
                  onChange={(e) => depth.onColor(e.target.value)}
                />
              </label>
            </div>
          </div>
        </>
      )}
      <button className="fx-reset" disabled={!changed} onClick={onReset}>
        Retirer tous les effets
      </button>
    </div>
  );
}
