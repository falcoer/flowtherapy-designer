import { useEffect, useRef, useState } from 'react';
import type { Layer } from './model';
import { ensureFont, fontFamily, fontList, fontOf, loadFonts, type TextStyle } from './text';

const WEIGHTS = ['Extra-fin', 'Très fin', 'Fin', 'Normal', 'Medium', 'Demi-gras', 'Gras', 'Extra-gras', 'Noir'];
export const weightName = (w: number) => WEIGHTS[Math.max(0, Math.min(8, Math.round(w / 100) - 1))]!;

/**
 * Barre de texte, sous la page quand un texte est choisi : on écrit (clavier ou stylet,
 * l'écriture manuscrite de l'iPad est convertie en texte), on choisit la police dans
 * un ruban d'aperçus, l'italique, l'alignement, et la graisse au curseur.
 */
export function TextBar({ layer, editing, setEditing, onChange }: { layer: Layer; editing: boolean; setEditing: (v: boolean) => void; onChange: (next: Partial<TextStyle>, history: boolean) => void }) {
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
    </div>
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
