import { contrastRatio, harmonies, type HarmonyKind, type PaletteElement } from '@ftd/core';
import { useState } from 'react';

const LABELS: Record<HarmonyKind, string> = {
  complementary: 'Complémentaire',
  split: 'Complémentaires adjacentes',
  triadic: 'Triade',
  tetradic: 'Tétrade',
  analogous: 'Analogues',
  tints: 'Clair / foncé',
};

/** Palette du projet et suggestions de l'assistant pour la couleur choisie. */
export function PalettePanel({ palette }: { palette: PaletteElement }) {
  const [picked, setPicked] = useState(0);
  const base = palette.colors[picked]?.hex ?? palette.colors[0]!.hex;
  const fond = palette.colors.find((c) => c.role === 'fond')?.hex;
  const h = harmonies(base);
  return (
    <div className="palette-panel">
      <div className="swatches">
        {palette.colors.map((c, i) => (
          <button
            key={i}
            className={i === picked ? 'swatch on' : 'swatch'}
            style={{ background: c.hex }}
            onClick={() => setPicked(i)}
            title={`${c.name ?? c.hex}${c.role ? ` (${c.role})` : ''}`}
          />
        ))}
      </div>
      {fond && base !== fond && <p className="hint">Contraste sur le fond : {contrastRatio(base, fond).toFixed(1)} : 1</p>}
      {(Object.keys(h) as HarmonyKind[]).map((k) => (
        <div key={k} className="harmony">
          <span>{LABELS[k]}</span>
          <div className="swatches small">
            {h[k].map((hex) => (
              <span key={hex} className="swatch" style={{ background: hex }} title={hex} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
