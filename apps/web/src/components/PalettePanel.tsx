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

interface Props {
  palette: PaletteElement | undefined;
  palettes: PaletteElement[];
  /** Texte sélectionné : la couleur choisie s'y applique. */
  textSelected: string | null;
  textColor: string | undefined;
  background: string | undefined;
  onPalette: (id: string) => void;
  onTextColor: (value: string) => void;
  onBackground: (value: string) => void;
}

/** Référence vers une couleur de palette : par rôle si elle en a un, sinon par nom. */
const refOf = (c: PaletteElement['colors'][number], i: number) => `palette.${c.role ?? c.name ?? i + 1}`;

/**
 * Palette du projet. Les éléments référencent ses couleurs par rôle
 * (palette.fond, palette.texte…) : changer de palette recolore tout.
 */
export function PalettePanel(props: Props) {
  const { palette, palettes, textSelected } = props;
  const [picked, setPicked] = useState(0);
  const [target, setTarget] = useState<'text' | 'background'>(textSelected ? 'text' : 'background');
  const aim = textSelected ? target : 'background';
  const apply = (value: string) => (aim === 'text' ? props.onTextColor(value) : props.onBackground(value));
  const currentValue = aim === 'text' ? props.textColor : props.background;

  const base = palette?.colors[picked]?.hex ?? palette?.colors[0]?.hex ?? '#7a5cff';
  const fond = palette?.colors.find((c) => c.role === 'fond')?.hex;
  const h = harmonies(base);

  return (
    <div className="palette-panel">
      <label className="field">
        <span>Palette du projet</span>
        <select className="chip" value={palette?.id ?? ''} onChange={(e) => props.onPalette(e.target.value)}>
          {!palette && <option value="">Aucune</option>}
          {palettes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title ?? p.id}
            </option>
          ))}
        </select>
      </label>

      <div className="segmented">
        <button className={aim === 'text' ? 'on' : ''} disabled={!textSelected} onClick={() => setTarget('text')}>
          Texte{textSelected ? ` « ${textSelected} »` : ''}
        </button>
        <button className={aim === 'background' ? 'on' : ''} onClick={() => setTarget('background')}>
          Fond
        </button>
      </div>
      {!textSelected && <p className="hint">Sélectionne un texte pour changer sa couleur.</p>}

      {palette && (
        <div className="swatch-list">
          {palette.colors.map((c, i) => {
            const ref = refOf(c, i);
            return (
              <button
                key={i}
                className={currentValue === ref ? 'swatch-row on' : 'swatch-row'}
                onClick={() => {
                  setPicked(i);
                  apply(ref);
                }}
              >
                <span className="swatch" style={{ background: c.hex }} />
                <span className="swatch-name">{c.name ?? c.hex}</span>
                {c.role && <span className="swatch-role">{c.role}</span>}
              </button>
            );
          })}
        </div>
      )}
      {fond && base !== fond && <p className="hint">Contraste de « {palette?.colors[picked]?.name} » sur le fond : {contrastRatio(base, fond).toFixed(1)} : 1</p>}

      <p className="section-title">Harmonies autour de « {palette?.colors[picked]?.name ?? base} »</p>
      <p className="hint">Touche une couleur pour l'essayer.</p>
      {(Object.keys(h) as HarmonyKind[]).map((k) => (
        <div key={k} className="harmony">
          <span>{LABELS[k]}</span>
          <div className="swatches small">
            {h[k].map((hex) => (
              <button key={hex} className={currentValue === hex ? 'swatch on' : 'swatch'} style={{ background: hex }} title={hex} onClick={() => apply(hex)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
