import { contrastRatio, gradientCss, harmonies, hexToOklch, type Gradient, type GradientType, type HarmonyKind, type PaletteElement } from '@ftd/core';
import { useEffect, useState } from 'react';
import { ColorPlane } from './ColorPlane';
import { BackgroundIcon, GradientFillIcon, GradientTypeIcon, HarmonyIcon, RampIcon, RotateIcon, SaveIcon, ShapeIcon, TextIcon } from './Icons';

const KINDS: Array<[HarmonyKind, string]> = [
  ['complementary', 'Complémentaire'],
  ['split', 'Complémentaires adjacentes'],
  ['triadic', 'Triade'],
  ['tetradic', 'Tétrade'],
  ['analogous', 'Analogues'],
  ['tints', 'Clair / foncé'],
];
const TYPES: Array<[GradientType, string]> = [
  ['linear', 'Linéaire'],
  ['radial', 'Radial'],
  ['sphere', 'Sphérique'],
];

export interface ColorTarget {
  /** Élément sélectionné (texte ou forme), ou null : seul le fond est disponible. */
  element: { id: string; kind: 'text' | 'shape' } | null;
  elementColor?: string;
  elementGradient?: Gradient;
  background?: string;
  backgroundGradient?: Gradient;
}

interface Props extends ColorTarget {
  palette: PaletteElement | undefined;
  palettes: PaletteElement[];
  onPalette: (id: string) => void;
  /** Couleur unie (efface le dégradé de la cible). */
  onColor: (target: 'element' | 'background', value: string) => void;
  onGradient: (target: 'element' | 'background', g: Gradient) => void;
  onSavePalette: (stops: string[]) => void;
}

const refOf = (c: PaletteElement['colors'][number], i: number) => `palette.${c.role ?? c.name ?? i + 1}`;
const next = <T,>(list: Array<[T, string]>, v: T) => list[(list.findIndex(([k]) => k === v) + 1) % list.length]![0];

/**
 * Composant couleur compact : cible, plan OKLCH, palette, harmonie, dégradé.
 * Tout passe par des icônes (infobulles au survol ou à l'appui long).
 */
export function PalettePanel(props: Props) {
  const { palette, palettes, element } = props;
  const [target, setTarget] = useState<'element' | 'background'>(element ? 'element' : 'background');
  useEffect(() => setTarget(element ? 'element' : 'background'), [element?.id]);
  const aim = element ? target : 'background';

  const [picked, setPicked] = useState(0);
  const [kind, setKind] = useState<HarmonyKind>('triadic');
  const [l, setL] = useState(0.72);
  const [steps, setSteps] = useState(5);
  const [ramp, setRamp] = useState(false);
  const [stops, setStops] = useState<string[] | null>(null);
  const [gType, setGType] = useState<GradientType>('linear');
  const [angle, setAngle] = useState(180);
  // une fois appliqué, le dégradé suit les réglages en direct
  const [live, setLive] = useState(false);
  useEffect(() => setLive(false), [aim, element?.id]);

  const gradient: Gradient | null = stops ? { type: gType, stops, angle } : null;
  useEffect(() => {
    if (live && gradient) props.onGradient(aim, gradient);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, stops, gType, angle]);

  const colors = palette?.colors ?? [];
  const resolve = (v: string | undefined) => {
    if (!v) return undefined;
    const i = colors.findIndex((c, j) => refOf(c, j) === v);
    return i >= 0 ? colors[i]!.hex : v;
  };
  const currentValue = aim === 'element' ? props.elementColor : props.background;
  const currentGradient = aim === 'element' ? props.elementGradient : props.backgroundGradient;
  const currentHex = resolve(currentValue);
  const apply = (value: string) => {
    setLive(false);
    props.onColor(aim, value);
  };

  const base = (currentHex && /^#/.test(currentHex) ? currentHex : undefined) ?? colors[picked]?.hex ?? '#7a5cff';
  const h = harmonies(base);
  const other = resolve(aim === 'element' ? props.background : props.elementColor) ?? colors.find((c) => c.role === 'fond')?.hex;
  const ratio = element?.kind === 'text' && currentHex && other && /^#/.test(currentHex) && /^#/.test(other) ? contrastRatio(currentHex, other) : null;

  return (
    <div className="color-panel">
      <div className="cp-top">
        <div className="seg-icons" role="group" aria-label="Appliquer à">
          <button className={aim === 'element' ? 'on' : ''} disabled={!element} onClick={() => setTarget('element')} title={element ? `Élément « ${element.id} »` : 'Sélectionne un texte ou une forme'}>
            {element?.kind === 'shape' ? <ShapeIcon /> : <TextIcon />}
          </button>
          <button className={aim === 'background' ? 'on' : ''} onClick={() => setTarget('background')} title="Fond">
            <BackgroundIcon />
          </button>
        </div>
        <span
          className="cp-current"
          style={{ background: currentGradient ? gradientCss(currentGradient) : (currentHex ?? 'transparent') }}
          title={currentGradient ? 'Dégradé' : currentHex}
        />
        {ratio !== null && (
          <span className={`cp-contrast ${ratio >= 4.5 ? 'ok' : ratio >= 3 ? 'mid' : 'low'}`} title="Contraste texte / fond (4,5 conseillé)">
            {ratio.toFixed(1)}
          </span>
        )}
      </div>

      <ColorPlane
        colors={colors.map((c) => c.hex)}
        harmony={[base, ...h[kind]]}
        current={currentGradient ? undefined : currentHex}
        l={l}
        onL={setL}
        steps={steps}
        ramp={ramp}
        onPick={apply}
        onGradient={setStops}
      />

      <div className="cp-line">
        {colors.map((c, i) => {
          const ref = refOf(c, i);
          return (
            <button
              key={i}
              className={`cp-swatch ${currentValue === ref && !currentGradient ? 'on' : ''}`}
              style={{ background: c.hex }}
              title={`${c.name ?? c.hex}${c.role ? ` · ${c.role}` : ''}`}
              onClick={() => {
                setPicked(i);
                setL(hexToOklch(c.hex).l);
                apply(ref);
              }}
            >
              {c.role && <span className="cp-role">{c.role[0]!.toUpperCase()}</span>}
            </button>
          );
        })}
        <label className="tool cp-pal-pick" title={`Palette : ${palette?.title ?? '—'}`}>
          ⌄
          <select value={palette?.id ?? ''} onChange={(e) => props.onPalette(e.target.value)} aria-label="Palette du projet">
            {!palette && <option value="">—</option>}
            {palettes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title ?? p.id}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="cp-line">
        <button className="tool on" onClick={() => setKind(next(KINDS, kind))} title={`Harmonie : ${KINDS.find(([k]) => k === kind)![1]} (toucher pour changer)`}>
          <HarmonyIcon kind={kind} />
        </button>
        {h[kind].map((hex) => (
          <button key={hex} className={`cp-swatch small ${currentValue === hex ? 'on' : ''}`} style={{ background: hex }} title={hex} onClick={() => apply(hex)} />
        ))}
      </div>

      <div className="cp-strip" style={{ background: gradient ? gradientCss({ ...gradient, type: 'linear', angle: 90 }) : undefined }} title={gradient ? undefined : 'Trace une ligne sur la roue'}>
        {stops?.map((hex, i) => <button key={i} style={{ background: hex }} title={hex} onClick={() => apply(hex)} />)}
      </div>
      <div className="cp-line cp-tools">
        <button className="tool" onClick={() => setGType(next(TYPES, gType))} title={`Type : ${TYPES.find(([k]) => k === gType)![1]} (toucher pour changer)`}>
          <GradientTypeIcon type={gType} />
        </button>
        <button className="tool" disabled={gType === 'radial'} onClick={() => setAngle((a) => (a + 45) % 360)} title={`Orientation ${angle}°`}>
          <RotateIcon />
        </button>
        <button className="tool num" onClick={() => setSteps((s) => (s >= 9 ? 2 : s + 1))} title="Nombre de teintes">
          {steps}
        </button>
        <button className={`tool ${ramp ? 'on' : ''}`} onClick={() => setRamp((r) => !r)} title="Du clair au foncé">
          <RampIcon />
        </button>
        <span className="cp-sep" />
        <button
          className={`tool ${live ? 'on' : ''}`}
          disabled={!gradient}
          onClick={() => {
            if (!gradient) return;
            props.onGradient(aim, gradient);
            setLive(true);
          }}
          title={aim === 'element' ? 'Appliquer le dégradé à l’élément' : 'Appliquer le dégradé au fond'}
        >
          <GradientFillIcon />
        </button>
        <button className="tool" disabled={!stops} onClick={() => stops && props.onSavePalette(stops)} title="Enregistrer comme palette">
          <SaveIcon />
        </button>
      </div>
    </div>
  );
}
