import { useEffect, useRef, useState } from 'react';
import type { Layer } from './model';
import { ensureFont, fontFamily, fontList, fontOf, loadFonts, swashWidth, WARPS, type SwashEnd, type TextStyle, type WarpKind } from './text';

/** Outil Prolonger : on dessine depuis une lettre, le trait devient une partie des lettres. */
export interface SwashTool {
  on: boolean;
  /** Tracer un prolongement, ou modeler le contour (tirer de l'intérieur, repousser de l'extérieur). */
  mode: 'draw' | 'mold';
  /** Rayon du modelage, en corps. */
  r: number;
  end: SwashEnd;
  /** Épaisseur choisie, en corps (null : celle d'un fût à la graisse du texte). */
  w: number | null;
}

const WEIGHTS = ['Extra-fin', 'Très fin', 'Fin', 'Normal', 'Medium', 'Demi-gras', 'Gras', 'Extra-gras', 'Noir'];
export const weightName = (w: number) => WEIGHTS[Math.max(0, Math.min(8, Math.round(w / 100) - 1))]!;

/**
 * Barre de texte, sous la page quand un texte est choisi : on écrit (clavier ou stylet,
 * l'écriture manuscrite de l'iPad est convertie en texte), on choisit la police dans
 * un ruban d'aperçus, l'italique, l'alignement, et la graisse au curseur.
 */
export function TextBar({
  layer,
  editing,
  setEditing,
  onChange,
  swash,
  setSwash,
}: {
  layer: Layer;
  editing: boolean;
  setEditing: (v: boolean) => void;
  onChange: (next: Partial<TextStyle>, history: boolean) => void;
  swash: SwashTool;
  setSwash: (s: SwashTool) => void;
}) {
  const t = layer.text!;
  const area = useRef<HTMLTextAreaElement>(null);
  const [, setReady] = useState(0);
  // une seule étape d'annulation par séance d'écriture ou de réglage
  const session = useRef<string | null>(null);
  const change = (next: Partial<TextStyle>, key: string) => {
    const first = session.current !== key;
    session.current = key;
    onChange(next, first);
  };
  useEffect(() => {
    session.current = null;
  }, [layer.id]);
  // toutes les polices, pour que le ruban montre chacune dans sa forme
  useEffect(() => {
    void loadFonts().then((all) => Promise.all(all.map((x) => ensureFont(x.id))).then(() => setReady((n) => n + 1)));
  }, []);
  useEffect(() => {
    if (!editing) return;
    // après le geste en cours : le toucher qui a ouvert la barre ne doit pas lui reprendre la main
    const id = setTimeout(() => {
      const a = area.current;
      if (!a || document.activeElement === a) return;
      a.focus();
      a.select();
    }, 60);
    return () => clearTimeout(id);
  }, [editing, layer.id]);
  const fi = fontOf(t.font);
  const variable = fi.files.some((x) => x.weightMax);
  const rows = Math.min(4, Math.max(1, t.content.split('\n').length));

  return (
    <div className="text-bar" onPointerDown={(e) => e.stopPropagation()}>
      <textarea
        ref={area}
        className="tb-area"
        rows={rows}
        value={t.content}
        placeholder="Écris ici, au clavier ou au stylet"
        spellCheck
        style={{ fontFamily: `${fontFamily(t.font)}, Inter, sans-serif`, fontWeight: t.weight, fontStyle: t.italic ? 'italic' : 'normal', textAlign: t.align }}
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
        onChange={(e) => change({ content: e.target.value }, 'content')}
      />
      <div className="tb-fonts" role="listbox" aria-label="Police">
        {fontList().map((x) => (
          <button key={x.id} role="option" aria-selected={x.id === t.font} className={x.id === t.font ? 'on' : ''} onClick={() => change({ font: x.id }, `font`)} title={x.family}>
            <span className="tb-aa" style={{ fontFamily: `${fontFamily(x.id)}, Inter, sans-serif` }}>
              Aa
            </span>
            <span className="tb-fname">{x.family}</span>
          </button>
        ))}
      </div>
      <div className="tb-row">
        <button className={`tb-btn tb-italic ${t.italic ? 'on' : ''}`} onClick={() => change({ italic: !t.italic }, 'italic')} title="Italique">
          I
        </button>
        <div className="seg tb-align">
          {(['left', 'center', 'right'] as const).map((a) => (
            <button key={a} className={t.align === a ? 'on' : ''} onClick={() => change({ align: a }, 'align')} title={{ left: 'À gauche', center: 'Centré', right: 'À droite' }[a]}>
              <AlignGlyph a={a} />
            </button>
          ))}
        </div>
        <label className="tb-slider">
          <span className="tb-label">
            Graisse <b>{weightName(t.weight)}</b>
            {!variable && <small> · simulée</small>}
          </span>
          <input type="range" min={100} max={900} step={10} value={t.weight} onChange={(e) => change({ weight: Number(e.target.value) }, 'weight')} />
        </label>
        <label className="tb-slider narrow">
          <span className="tb-label">Espacement</span>
          <input type="range" min={-0.1} max={0.5} step={0.01} value={t.tracking ?? 0} onChange={(e) => change({ tracking: Number(e.target.value) }, 'tracking')} />
        </label>
      </div>
      <div className="tb-row">
        <button
          className={`tb-btn tb-swash ${swash.on ? 'on' : ''}`}
          onClick={() => {
            setSwash({ ...swash, on: !swash.on });
            if (!swash.on) area.current?.blur();
          }}
          title="Modeler : de l'intérieur on tire le trait, de l'extérieur on le repousse"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M5 19V6h6M5 12h4" />
            <path d="M11 6c4 0 8 1 9 4s-3 7-8 9" strokeWidth="1.4" />
          </svg>
        </button>
        {swash.on ? (
          <>
            <label className="tb-slider">
              <span className="tb-label">Taille</span>
              <input type="range" min={0.06} max={1} step={0.01} value={swash.r} onChange={(e) => setSwash({ ...swash, r: Number(e.target.value) })} />
            </label>
            <button
              className="tb-btn tb-regular"
              onClick={() => onChange({ molds: [...(t.molds ?? []), { pts: [], r: 0, smooth: 0.035 }] }, true)}
              title="Régulariser : lisse le contour, retire les accrocs, égalise les pleins (à répéter pour lisser plus)"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 16c2-1 2.5-3 4-3s2 2.5 3.5 2.5S12 12 13.5 12 15 14 16.5 14" strokeDasharray="2 2" />
                <path d="M3 9c4-3 10-3 18 0" />
                <path d="M18 3l.7 1.6 1.6.7-1.6.7L18 7.6l-.7-1.6-1.6-.7 1.6-.7z" fill="currentColor" stroke="none" />
              </svg>
            </button>
            {!!(t.swashes?.length || t.molds?.length) && (
              <button className="tb-btn tb-clear" onClick={() => onChange({ swashes: [], molds: [] }, true)} title="Retirer tous les prolongements et modelages">
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            )}
          </>
        ) : (
          <>
            <div className="seg tb-warps">
              {WARPS.map((w) => (
                <button
                  key={w.id}
                  className={(t.warp?.kind ?? 'none') === w.id ? 'on' : ''}
                  onClick={() => onChange({ warp: w.id === 'none' ? undefined : { kind: w.id, amount: t.warp?.amount || 0.5 } }, true)}
                  title={w.name}
                >
                  <WarpGlyph k={w.id} />
                </button>
              ))}
            </div>
            {t.warp && (
              <label className="tb-slider narrow">
                <span className="tb-label">Courbure</span>
                <input type="range" min={-1} max={1} step={0.02} value={t.warp.amount} onChange={(e) => change({ warp: { ...t.warp!, amount: Number(e.target.value) } }, 'warp')} />
              </label>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** L'enveloppe dessinée : le haut et le bas du bloc de lettres. */
function WarpGlyph({ k }: { k: WarpKind | 'none' }) {
  const top = { none: 'M2 4H20', arc: 'M2 7Q11 -1 20 7', wave: 'M2 6C6 0 9 0 11 5S16 10 20 4', bulge: 'M2 6Q11 -2 20 6', persp: 'M2 6L20 1' }[k];
  const bot = { none: 'M2 14H20', arc: 'M2 16Q11 8 20 16', wave: 'M2 15C6 9 9 9 11 14S16 19 20 13', bulge: 'M2 13Q11 21 20 13', persp: 'M2 12L20 17' }[k];
  return (
    <svg width="22" height="18" viewBox="0 0 22 18" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d={top} />
      <path d={bot} />
    </svg>
  );
}

function EndGlyph({ e }: { e: SwashEnd }) {
  return (
    <svg width="26" height="14" viewBox="0 0 26 14" aria-hidden fill="currentColor">
      {e === 'point' && <path d="M2 4.5Q14 4 24 7Q14 10 2 9.5Z" />}
      {e === 'ball' && (
        <>
          <path d="M2 4.5Q12 5 18 6V8Q12 9 2 9.5Z" />
          <circle cx="20" cy="7" r="4" />
        </>
      )}
      {e === 'flat' && <rect x="2" y="4.5" width="22" height="5" />}
    </svg>
  );
}

function AlignGlyph({ a }: { a: 'left' | 'center' | 'right' }) {
  const lines = [16, 10, 14];
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden>
      {lines.map((w, i) => {
        const x = a === 'left' ? 1 : a === 'right' ? 17 - w : (18 - w) / 2;
        return <rect key={i} x={x} y={1 + i * 5} width={w} height="2" rx="1" fill="currentColor" />;
      })}
    </svg>
  );
}
