import { contrastRatio, harmonies, hexToOklch, type HarmonyKind, type PaletteElement } from '@ftd/core';
import { useEffect, useState } from 'react';
import { ColorPlane } from './ColorPlane';
import { BackgroundIcon, GradientFillIcon, HarmonyIcon, RampIcon, SaveIcon, TextIcon } from './Icons';

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
  onGradientBackground: (stops: string[]) => void;
  onSavePalette: (stops: string[]) => void;
}

/** Référence vers une couleur de palette : par rôle si elle en a un, sinon par nom. */
const refOf = (c: PaletteElement['colors'][number], i: number) => `palette.${c.role ?? c.name ?? i + 1}`;

/**
 * Composant couleur : plan OKLCH au centre, cible (texte / fond), palette,
 * harmonies et dégradé. Les éléments référencent la palette par rôle
 * (palette.fond, palette.texte…) : changer de palette recolore tout.
 */
export function PalettePanel(props: Props) {
  const { palette, palettes, textSelected } = props;
  const [picked, setPicked] = useState(0);
  const [kind, setKind] = useState<HarmonyKind>('triadic');
  const [gradient, setGradient] = useState<string[] | null>(null);
  const [l, setL] = useState(0.72);
  const [steps, setSteps] = useState(5);
  const [ramp, setRamp] = useState(false);
  const [target, setTarget] = useState<'text' | 'background'>(textSelected ? 'text' : 'background');
  useEffect(() => setTarget(textSelected ? 'text' : 'background'), [textSelected]);
  const aim = textSelected ? target : 'background';
  const apply = (value: string) => (aim === 'text' ? props.onTextColor(value) : props.onBackground(value));
  const currentValue = aim === 'text' ? props.textColor : props.background;

  const colors = palette?.colors ?? [];
  const resolve = (v: string | undefined) => {
    if (!v) return undefined;
    const ref = colors.findIndex((c, i) => refOf(c, i) === v);
    return ref >= 0 ? colors[ref]!.hex : v;
  };
  const currentHex = resolve(currentValue);
  // harmonies autour de la couleur appliquée, sinon de la couleur de palette choisie
  const base = (currentHex && /^#/.test(currentHex) ? currentHex : undefined) ?? colors[picked]?.hex ?? colors[0]?.hex ?? '#7a5cff';
  const h = harmonies(base);
  const other = resolve(aim === 'text' ? props.background : props.textColor) ?? colors.find((c) => c.role === 'fond')?.hex;
  const ratio = currentHex && other && /^#/.test(currentHex) && /^#/.test(other) ? contrastRatio(currentHex, other) : null;

  const pick = (value: string, hex: string) => {
    apply(value);
    setL(hexToOklch(hex).l);
  };

  return (
    <div className="color-panel">
      <div className="cp-top">
        <div className="seg-icons" role="group" aria-label="Appliquer à">
          <button className={aim === 'text' ? 'on' : ''} disabled={!textSelected} onClick={() => setTarget('text')} title={textSelected ? `Texte « ${textSelected} »` : 'Sélectionne un texte'}>
            <TextIcon />
          </button>
          <button className={aim === 'background' ? 'on' : ''} onClick={() => setTarget('background')} title="Fond">
            <BackgroundIcon />
          </button>
        </div>
        <span className="cp-current" style={{ background: currentHex ?? 'transparent' }} title={currentHex} />
        {ratio !== null && (
          <span className={`cp-contrast ${ratio >= 4.5 ? 'ok' : ratio >= 3 ? 'mid' : 'low'}`} title="Contraste avec l'autre plan (4,5 conseillé pour du texte)">
            {ratio.toFixed(1)}
          </span>
        )}
      </div>

      <ColorPlane
        colors={colors.map((c) => c.hex)}
        harmony={[base, ...h[kind]]}
        current={currentHex}
        l={l}
        onL={setL}
        steps={steps}
        ramp={ramp}
        onPick={(hex) => apply(hex)}
        onGradient={setGradient}
      />

      <div className="cp-row">
        <select className="cp-palette" value={palette?.id ?? ''} onChange={(e) => props.onPalette(e.target.value)} title="Palette du projet">
          {!palette && <option value="">—</option>}
          {palettes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title ?? p.id}
            </option>
          ))}
        </select>
      </div>
      <div className="cp-swatches">
        {colors.map((c, i) => {
          const ref = refOf(c, i);
          return (
            <button
              key={i}
              className={`cp-swatch ${currentValue === ref ? 'on' : ''} ${i === picked ? 'base' : ''}`}
              style={{ background: c.hex }}
              title={`${c.name ?? c.hex}${c.role ? ` · ${c.role}` : ''}`}
              onClick={() => {
                setPicked(i);
                pick(ref, c.hex);
              }}
            >
              {c.role && <span className="cp-role">{c.role[0]!.toUpperCase()}</span>}
            </button>
          );
        })}
      </div>

      <div className="cp-harmony">
        <div className="cp-kinds">
          {(Object.keys(h) as HarmonyKind[]).map((k) => (
            <button key={k} className={k === kind ? 'on' : ''} onClick={() => setKind(k)} title={LABELS[k]}>
              <HarmonyIcon kind={k} />
            </button>
          ))}
        </div>
        <div className="cp-swatches small">
          {h[kind].map((hex) => (
            <button key={hex} className={`cp-swatch ${currentValue === hex ? 'on' : ''}`} style={{ background: hex }} title={hex} onClick={() => pick(hex, hex)} />
          ))}
        </div>
      </div>

      <div className="cp-gradient">
        <div className="cp-strip" style={{ background: gradient ? `linear-gradient(90deg, ${gradient.join(', ')})` : undefined }} title={gradient ? undefined : 'Trace une ligne sur la roue'}>
          {gradient?.map((hex, i) => <button key={i} style={{ background: hex }} title={hex} onClick={() => apply(hex)} />)}
        </div>
        <div className="cp-tools">
          <div className="stepper" title="Nombre de teintes">
            <button onClick={() => setSteps((s) => Math.max(2, s - 1))} disabled={steps <= 2} aria-label="Moins de teintes">
              −
            </button>
            <strong>{steps}</strong>
            <button onClick={() => setSteps((s) => Math.min(9, s + 1))} disabled={steps >= 9} aria-label="Plus de teintes">
              +
            </button>
          </div>
          <button className={`tool ${ramp ? 'on' : ''}`} onClick={() => setRamp((r) => !r)} title="Du clair au foncé">
            <RampIcon />
          </button>
          <button className="tool" disabled={!gradient} onClick={() => gradient && props.onGradientBackground(gradient)} title="Dégradé en fond">
            <GradientFillIcon />
          </button>
          <button className="tool" disabled={!gradient} onClick={() => gradient && props.onSavePalette(gradient)} title="Enregistrer comme palette">
            <SaveIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
