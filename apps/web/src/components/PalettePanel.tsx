import { contrastRatio, gradientCss, harmonies, hexToOklch, type Gradient, type GradientType, type HarmonyKind, type PaletteElement } from '@ftd/core';
import { useEffect, useRef, useState } from 'react';
import { ColorPlane, type PickMode } from './ColorPlane';
import {
  BackgroundIcon,
  BandsIcon,
  ChevronIcon,
  GradientTypeIcon,
  HarmonyIcon,
  LineToolIcon,
  PlusIcon,
  PointIcon,
  RampIcon,
  RotateIcon,
  ShapeIcon,
  SolidIcon,
  TextIcon,
} from './Icons';

const KINDS: Array<[HarmonyKind, string]> = [
  ['complementary', 'Complémentaire'],
  ['split', 'Complémentaires adjacentes'],
  ['triadic', 'Triade'],
  ['tetradic', 'Tétrade'],
  ['analogous', 'Analogues'],
  ['tints', 'Clair / foncé'],
];
type Fill = 'solid' | GradientType;
const FILLS: Array<[Fill, string]> = [
  ['solid', 'Uni'],
  ['linear', 'Linéaire'],
  ['radial', 'Radial'],
  ['sphere', 'Sphérique'],
];
/** Paliers proposés : 0 = lissé. */
const BANDS = [0, 2, 3, 4, 5, 6, 8];

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
  /** Sélection de couleurs en cours (ordonnée), gardée quand le panneau se ferme. */
  selection: string[] | null;
  onSelection: (colors: string[]) => void;
  onPalette: (id: string) => void;
  /** Couleur unie (efface le dégradé de la cible). */
  onColor: (target: 'element' | 'background', value: string) => void;
  onGradient: (target: 'element' | 'background', g: Gradient) => void;
  onSavePalette: (title: string, colors: string[]) => Promise<void>;
}

const refOf = (c: PaletteElement['colors'][number], i: number) => `palette.${c.role ?? c.name ?? i + 1}`;
const next = <T,>(list: Array<[T, string]>, v: T) => list[(list.findIndex(([k]) => k === v) + 1) % list.length]![0];
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x.toLowerCase() === b[i]!.toLowerCase());
const strip = (colors: string[]) => (colors.length > 1 ? `linear-gradient(90deg, ${colors.map((c, i) => `${c} ${(i / colors.length) * 100}% ${((i + 1) / colors.length) * 100}%`).join(', ')})` : colors[0] ?? 'transparent');

/**
 * Panneau couleur, de haut en bas : palettes (charger, enregistrer), application
 * (uni ou dégradé), outils de sélection, sélection en cours, espace de couleur.
 * Une palette est une sélection ordonnée de couleurs.
 */
export function PalettePanel(props: Props) {
  const { palette, palettes, element } = props;
  const [target, setTarget] = useState<'element' | 'background'>(element ? 'element' : 'background');
  useEffect(() => setTarget(element ? 'element' : 'background'), [element?.id]);
  const aim = element ? target : 'background';

  const colors = palette?.colors ?? [];
  const paletteHexes = colors.map((c) => c.hex);
  const sel = props.selection ?? paletteHexes;
  const setSel = props.onSelection;

  const [mode, setMode] = useState<PickMode>('point');
  const [kind, setKind] = useState<HarmonyKind>('complementary');
  const [active, setActive] = useState<number | undefined>(undefined);
  const [l, setL] = useState(0.72);
  const [steps, setSteps] = useState(5);
  const [ramp, setRamp] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');

  const resolve = (v: string | undefined) => {
    if (!v) return undefined;
    const i = colors.findIndex((c, j) => refOf(c, j) === v);
    return i >= 0 ? colors[i]!.hex : v;
  };
  // une couleur de la palette du projet reste liée à la palette (palette.N)
  const valueOf = (hex: string) => {
    const i = colors.findIndex((c) => c.hex.toLowerCase() === hex.toLowerCase());
    return i >= 0 ? refOf(colors[i]!, i) : hex;
  };
  const currentValue = aim === 'element' ? props.elementColor : props.background;
  const currentGradient = aim === 'element' ? props.elementGradient : props.backgroundGradient;
  const currentHex = resolve(currentValue);
  const fill: Fill = currentGradient?.type ?? 'solid';
  const [angle, setAngle] = useState(currentGradient?.angle ?? 180);
  const [bands, setBands] = useState(currentGradient?.bands ?? 0);
  useEffect(() => {
    setAngle(currentGradient?.angle ?? 180);
    setBands(currentGradient?.bands ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aim, element?.id]);

  const apply = (hex: string) => props.onColor(aim, valueOf(hex));
  const pushGradient = (type: GradientType, stops: string[], a = angle, b = bands) => {
    if (stops.length < 2) return;
    props.onGradient(aim, { type, stops, angle: a, ...(b ? { bands: b } : {}) });
  };
  // en dégradé, toute modification de la sélection s'applique en direct
  const updateSel = (list: string[]) => {
    setSel(list);
    if (fill !== 'solid') pushGradient(fill, list);
  };

  const cycleFill = () => {
    const f = next(FILLS, fill);
    if (f === 'solid') apply(sel[active ?? 0] ?? currentHex ?? '#7a5cff');
    else if (sel.length >= 2) pushGradient(f, sel);
  };

  // la clarté suit la couleur active
  useEffect(() => {
    const hex = active !== undefined ? sel[active] : undefined;
    if (hex) setL(hexToOklch(hex).l);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const onPick = (hex: string, done: boolean) => {
    if (mode === 'harmony') {
      updateSel([hex, ...harmonies(hex)[kind]]);
      setActive(0);
    } else {
      const list = [...sel];
      let i = active;
      if (i === undefined || i >= list.length) {
        list.push(hex);
        i = list.length - 1;
        setActive(i);
      } else list[i] = hex;
      updateSel(list);
    }
    if (done && fill === 'solid') apply(hex);
  };

  // glisser une pastille pour la déplacer dans la sélection
  const dragFrom = useRef<number | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const indexAt = (x: number) => {
    const items = Array.from(stripRef.current?.querySelectorAll<HTMLElement>('.sel-swatch') ?? []);
    const i = items.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return x < r.right;
    });
    return i < 0 ? items.length - 1 : i;
  };

  const other = resolve(aim === 'element' ? props.background : props.elementColor) ?? colors.find((c) => c.role === 'fond')?.hex;
  const ratio = element?.kind === 'text' && !currentGradient && currentHex && other && /^#/.test(currentHex) && /^#/.test(other) ? contrastRatio(currentHex, other) : null;
  const match = palettes.find((p) => same(sel, p.colors.map((c) => c.hex)));
  const named = match ? (match.title ?? match.id) : 'Sélection';

  return (
    <div className="color-panel">
      {/* 1. palettes : déployer la liste, enregistrer la sélection */}
      <div className="pal-bar">
        <button className={`pal-current ${listOpen ? 'on' : ''}`} onClick={() => (setListOpen((o) => !o), setSaveOpen(false))} aria-expanded={listOpen}>
          <span className="pal-strip" style={{ background: strip(sel) }} />
          <span className="pal-name">
            {named}
            {!match && <em> · non enregistrée</em>}
          </span>
          <ChevronIcon />
        </button>
        <button
          className={`tool ${saveOpen ? 'on' : ''}`}
          disabled={sel.length === 0}
          onClick={() => {
            setName(`Palette ${palettes.length + 1}`);
            setSaveOpen((o) => !o);
            setListOpen(false);
          }}
          title="Enregistrer la sélection comme palette"
        >
          <PlusIcon />
        </button>
        {listOpen && (
          <div className="pal-pop glass" role="listbox" aria-label="Palettes">
            {palettes.map((p) => (
              <div key={p.id} className={`pal-row ${same(sel, p.colors.map((c) => c.hex)) ? 'on' : ''}`}>
                <button
                  role="option"
                  aria-selected={same(sel, p.colors.map((c) => c.hex))}
                  onClick={() => {
                    updateSel(p.colors.map((c) => c.hex));
                    setActive(undefined);
                    setListOpen(false);
                  }}
                  title="Charger dans la sélection"
                >
                  <span className="pal-strip" style={{ background: strip(p.colors.map((c) => c.hex)) }} />
                  <span className="pal-name">{p.title ?? p.id}</span>
                  <span className="pal-count">{p.colors.length}</span>
                </button>
                <button
                  className={`pal-star ${p.id === palette?.id ? 'on' : ''}`}
                  onClick={() => props.onPalette(p.id)}
                  title={p.id === palette?.id ? 'Palette du projet' : 'Utiliser comme palette du projet (les couleurs liées suivent)'}
                >
                  {p.id === palette?.id ? '★' : '☆'}
                </button>
              </div>
            ))}
          </div>
        )}
        {saveOpen && (
          <form
            className="pal-pop pal-bubble glass"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!name.trim()) return;
              await props.onSavePalette(name.trim(), sel);
              setSaveOpen(false);
            }}
          >
            <span className="pal-strip big" style={{ background: strip(sel) }} />
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Nom de la palette" />
            <div className="pal-actions">
              <button type="button" className="chip" onClick={() => setSaveOpen(false)}>
                Annuler
              </button>
              <button type="submit" className="chip on">
                Enregistrer
              </button>
            </div>
          </form>
        )}
      </div>

      {/* 2. application : cible, uni ou dégradé, paliers, orientation */}
      <div className="cp-line cp-apply">
        <div className="seg-icons" role="group" aria-label="Appliquer à">
          <button className={aim === 'element' ? 'on' : ''} disabled={!element} onClick={() => setTarget('element')} title={element ? `Élément « ${element.id} »` : 'Sélectionne un texte ou une forme'}>
            {element?.kind === 'shape' ? <ShapeIcon /> : <TextIcon />}
          </button>
          <button className={aim === 'background' ? 'on' : ''} onClick={() => setTarget('background')} title="Fond">
            <BackgroundIcon />
          </button>
        </div>
        <button className={`tool fill ${fill !== 'solid' ? 'on' : ''}`} onClick={cycleFill} title={`Remplissage : ${FILLS.find(([k]) => k === fill)![1]} (toucher pour changer)`}>
          {fill === 'solid' ? <SolidIcon /> : <GradientTypeIcon type={fill} />}
        </button>
        <button
          className={`tool ${bands ? 'on' : ''}`}
          disabled={fill === 'solid'}
          onClick={() => {
            const b = BANDS[(BANDS.indexOf(bands) + 1) % BANDS.length]!;
            setBands(b);
            if (fill !== 'solid') pushGradient(fill, currentGradient?.stops ?? sel, angle, b);
          }}
          title={bands ? `${bands} paliers` : 'Lissé'}
        >
          <BandsIcon n={bands || undefined} />
          {bands > 0 && <span className="tool-badge">{bands}</span>}
        </button>
        <button
          className="tool"
          disabled={fill === 'solid' || fill === 'radial'}
          onClick={() => {
            const a = (angle + 45) % 360;
            setAngle(a);
            if (fill !== 'solid') pushGradient(fill, currentGradient?.stops ?? sel, a);
          }}
          title={`Orientation ${angle}°`}
        >
          <RotateIcon />
        </button>
        <span
          className="cp-current"
          style={{ background: currentGradient ? gradientCss(currentGradient) : (currentHex ?? 'transparent') }}
          title={currentGradient ? 'Dégradé appliqué' : `Couleur appliquée ${currentHex ?? ''}`}
        />
        {ratio !== null && (
          <span className={`cp-contrast ${ratio >= 4.5 ? 'ok' : ratio >= 3 ? 'mid' : 'low'}`} title="Contraste texte / fond (4,5 conseillé)">
            {ratio.toFixed(1)}
          </span>
        )}
      </div>

      {/* 3. outils de sélection */}
      <div className="cp-line cp-modes">
        <div className="seg-icons" role="group" aria-label="Outil de sélection">
          <button className={mode === 'point' ? 'on' : ''} onClick={() => setMode('point')} title="Point : toucher la roue ajoute ou modifie une couleur">
            <PointIcon />
          </button>
          <button className={mode === 'line' ? 'on' : ''} onClick={() => setMode('line')} title="Linéaire : tracer une ligne sur la roue">
            <LineToolIcon />
          </button>
          <button
            className={mode === 'harmony' ? 'on' : ''}
            onClick={() => (mode === 'harmony' ? setKind(next(KINDS, kind)) : setMode('harmony'))}
            title={`Harmonie : ${KINDS.find(([k]) => k === kind)![1]}${mode === 'harmony' ? ' (toucher pour changer)' : ''}`}
          >
            <HarmonyIcon kind={kind} />
          </button>
        </div>
        {mode === 'line' && (
          <>
            <button className="tool num" onClick={() => setSteps((s) => (s >= 9 ? 2 : s + 1))} title="Nombre de couleurs sur la ligne">
              {steps}
            </button>
            <button className={`tool ${ramp ? 'on' : ''}`} onClick={() => setRamp((r) => !r)} title="Du clair au foncé">
              <RampIcon />
            </button>
          </>
        )}
        <span className="cp-mode-hint">{mode === 'point' ? 'Toucher la roue' : mode === 'line' ? 'Tracer une ligne' : KINDS.find(([k]) => k === kind)![1]}</span>
      </div>

      {/* 4. sélection en cours : toucher = appliquer et éditer, glisser = réordonner */}
      <div className="sel-strip" ref={stripRef}>
        {sel.map((hex, i) => (
          <span key={i} className={`sel-swatch ${active === i ? 'active' : ''} ${fill === 'solid' && currentHex?.toLowerCase() === hex.toLowerCase() ? 'on' : ''}`}>
            <button
              style={{ background: hex }}
              title={hex}
              onPointerDown={(e) => {
                dragFrom.current = i;
                (e.currentTarget as Element).setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const from = dragFrom.current;
                if (from === null) return;
                const to = indexAt(e.clientX);
                if (to === from) return;
                const list = [...sel];
                const [c] = list.splice(from, 1);
                list.splice(to, 0, c!);
                dragFrom.current = to;
                setActive(to);
                updateSel(list);
              }}
              onPointerUp={() => (dragFrom.current = null)}
              onClick={() => {
                setActive(i);
                if (fill === 'solid') apply(hex);
              }}
            />
            {active === i && (
              <button
                className="sel-x"
                aria-label="Retirer de la sélection"
                onClick={() => {
                  updateSel(sel.filter((_, j) => j !== i));
                  setActive(undefined);
                }}
              >
                ✕
              </button>
            )}
          </span>
        ))}
        <button className={`sel-add ${active === undefined || active >= sel.length ? 'on' : ''}`} onClick={() => (setActive(undefined), setMode('point'))} title="Ajouter une couleur (puis toucher la roue)">
          <PlusIcon />
        </button>
      </div>

      {/* 5. espace de couleur et clarté */}
      <ColorPlane colors={sel} active={active} mode={mode} l={l} onL={setL} steps={steps} ramp={ramp} onPick={onPick} onGradient={(stops) => (updateSel(stops), setActive(undefined))} />
      {active !== undefined && sel[active] && (
        <label className="hex-row">
          <span className="hex-dot" style={{ background: sel[active] }} />
          <input
            key={sel[active]}
            defaultValue={sel[active]}
            spellCheck={false}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (/^#?[0-9a-f]{6}$/i.test(v)) onPick(v.startsWith('#') ? v.toLowerCase() : `#${v.toLowerCase()}`, true);
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            aria-label="Code de la couleur"
          />
        </label>
      )}
    </div>
  );
}
