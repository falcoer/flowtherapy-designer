import { useEffect, useRef, useState } from 'react';
import type { Layer } from './model';
import { ensureFont, fontFamily, fontList, fontOf, loadFonts, swashWidth, WARPS, type SwashEnd, type TextStyle, type WarpKind } from './text';

/** Outil Prolonger : on dessine depuis une lettre, le trait devient une partie des lettres. */
export interface SwashTool {
  on: boolean;
  /** Tracer un prolongement, ou modeler le contour (tirer de l'intérieur, repousser de l'extérieur). */
  mode: 'draw' | 'mold' | 'orn';
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
  toolsOnly,
  onStyle,
}: {
  layer: Layer;
  editing: boolean;
  setEditing: (v: boolean) => void;
  onChange: (next: Partial<TextStyle>, history: boolean) => void;
  swash: SwashTool;
  setSwash: (s: SwashTool) => void;
  /** Mode attributs : seulement les outils du texte, en barre au-dessus de la page. */
  toolsOnly?: boolean;
  /** Ouvre le style du texte (police, graisse, inclinaison) dans le volet des attributs. */
  onStyle?: () => void;
}) {
  const t = layer.text!;
  const area = useRef<HTMLTextAreaElement>(null);
  // mode attributs : le contenu se replie dans une section qu'on ouvre au besoin
  const [showContent, setShowContent] = useState(false);
  const [draft, setDraft] = useLazyText(t.content, (v) => change({ content: v }, 'content'));
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
    <div className={`text-bar ${toolsOnly ? 'tools-only' : ''}`} onPointerDown={(e) => e.stopPropagation()}>
      {(!toolsOnly || showContent) && (
        <textarea
          ref={area}
          className="tb-area"
          rows={rows}
          value={draft}
          placeholder="Écris ici, au clavier ou au stylet"
          spellCheck
          style={{ fontFamily: `${fontFamily(t.font)}, Inter, sans-serif`, fontWeight: t.weight, fontStyle: t.italic ? 'italic' : 'normal', textAlign: t.align }}
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          onChange={(e) => setDraft(e.target.value)}
        />
      )}
      {!toolsOnly && (
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
      )}
      {!toolsOnly && (
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
      )}
      <div className="tb-row">
        {toolsOnly && (
          <>
            <button className={`tb-btn tb-content ${showContent ? 'on' : ''}`} onClick={() => setShowContent(!showContent)} title="Contenu : modifier le texte">
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M5 6h10M10 6v12M15 14h5M15 18h4" />
              </svg>
            </button>
            {onStyle && (
              <button className="tb-btn tb-style" onClick={onStyle} title="Style : police, graisse, inclinaison, espacement">
                <span style={{ fontFamily: `${fontFamily(t.font)}, Inter, sans-serif`, fontSize: 18 }}>Aa</span>
              </button>
            )}
          </>
        )}
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
            <button
              className="tb-btn tb-mode"
              onClick={() => setSwash({ ...swash, mode: swash.mode === 'orn' ? 'mold' : 'orn' })}
              title={swash.mode === 'orn' ? 'Plume : un trait fin, plein et délié (toucher pour revenir à Modeler)' : 'Modeler : tirer de l’intérieur, repousser de l’extérieur (toucher pour passer à la Plume)'}
            >
              {swash.mode === 'orn' ? (
                <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 20c1-5 3-9 8-13l5 5c-4 5-8 7-13 8z" />
                  <path d="M4 20l6-6" />
                  <circle cx="11.5" cy="12.5" r="1.3" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 4c-3 3-3 8 0 10s3 6 6 6 7-4 5-8-4-3-5-6-3-4-6-2z" />
                  <path d="M12 9l3-3" strokeDasharray="2 2" />
                </svg>
              )}
              <small>{swash.mode === 'orn' ? 'Plume' : 'Modeler'}</small>
            </button>
            <label className="tb-slider">
              <span className="tb-label">Taille</span>
              {swash.mode === 'orn' ? (
                <input type="range" min={0.01} max={0.3} step={0.005} value={swash.w ?? swashWidth(t.weight) * 0.8} onChange={(e) => setSwash({ ...swash, w: Number(e.target.value) })} />
              ) : (
                <input type="range" min={0.06} max={1} step={0.01} value={swash.r} onChange={(e) => setSwash({ ...swash, r: Number(e.target.value) })} />
              )}
            </label>
            <button
              className="tb-btn tb-regular"
              onClick={() => onChange({ molds: [...(t.molds ?? []), { pts: [], r: 0, smooth: 0.035 }] }, true)}
              title="Lisser : seules les parties modelées s'adoucissent (à répéter pour lisser plus)"
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
        ) : toolsOnly ? null : (
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

/**
 * Saisie fluide : le champ garde sa valeur à lui et le rendu (lourd : tracé des lettres) ne suit
 * qu'après une courte pause, ou dès qu'on quitte le champ.
 */
export function useLazyText(value: string, commit: (v: string) => void, delay = 350): [string, (v: string) => void] {
  const [draft, setDraftState] = useState(value);
  const timer = useRef(0);
  const pending = useRef<string | null>(null);
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => {
    // changement venu d'ailleurs (annuler, autre texte) : on le reprend
    if (pending.current === null) setDraftState(value);
  }, [value]);
  const flush = () => {
    window.clearTimeout(timer.current);
    if (pending.current !== null) {
      const v = pending.current;
      pending.current = null;
      commitRef.current(v);
    }
  };
  useEffect(() => flush, []);
  const setDraft = (v: string) => {
    setDraftState(v);
    pending.current = v;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, delay);
  };
  return [draft, setDraft];
}

/** Changement rapide du texte, dans une bulle ouverte d'un double toucher. */
export function QuickText({ layer, onChange, onClose }: { layer: Layer; onChange: (next: Partial<TextStyle>, history: boolean) => void; onClose: () => void }) {
  const t = layer.text!;
  const first = useRef(true);
  const [draft, setDraft] = useLazyText(t.content, (v) => {
    onChange({ content: v }, first.current);
    first.current = false;
  });
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const id = setTimeout(() => {
      area.current?.focus();
      area.current?.select();
    }, 60);
    return () => clearTimeout(id);
  }, [layer.id]);
  const multi = draft.includes('\n');
  return (
    <div className="quick-text" onPointerDown={(e) => e.stopPropagation()}>
      <textarea
        ref={area}
        className="tb-area"
        rows={Math.min(4, Math.max(1, draft.split('\n').length))}
        value={draft}
        spellCheck
        style={{ fontFamily: `${fontFamily(t.font)}, Inter, sans-serif`, fontWeight: t.weight, fontStyle: t.italic ? 'italic' : 'normal', textAlign: t.align }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      />
      <div className="qt-row">
        {multi && (
          <div className="seg tb-align">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} className={t.align === a ? 'on' : ''} onClick={() => onChange({ align: a }, true)} title={{ left: 'À gauche', center: 'Centré', right: 'À droite' }[a]}>
                <AlignGlyph a={a} />
              </button>
            ))}
          </div>
        )}
        <button className="qt-ok" onClick={onClose}>
          OK
        </button>
      </div>
    </div>
  );
}

/** Bulle de contenu de la section Texte : saisie multiligne et alignement. */
export function TextContent({ text: t, onChange }: { text: TextStyle; onChange: (next: Partial<TextStyle>, history: boolean) => void }) {
  const first = useRef(true);
  const [draft, setDraft] = useLazyText(t.content, (v) => {
    onChange({ content: v }, first.current);
    first.current = false;
  });
  const lines = draft.split('\n').length;
  return (
    <div className="text-bubble">
      <textarea
        className="tb-area"
        rows={Math.min(5, Math.max(2, lines))}
        value={draft}
        spellCheck
        placeholder="Votre texte (Entrée pour une nouvelle ligne)"
        style={{ fontFamily: `${fontFamily(t.font)}, Inter, sans-serif`, fontWeight: t.weight, fontStyle: t.italic ? 'italic' : 'normal', textAlign: t.align }}
        onFocus={() => (first.current = true)}
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="seg tb-align" title={lines > 1 ? undefined : 'L’alignement agit sur un texte de plusieurs lignes'}>
        {(['left', 'center', 'right'] as const).map((a) => (
          <button key={a} className={t.align === a ? 'on' : ''} onClick={() => onChange({ align: a }, true)} title={{ left: 'À gauche', center: 'Centré', right: 'À droite' }[a]}>
            <AlignGlyph a={a} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** Section Déformation du texte (volet des attributs) : enveloppe et courbure. */
export function TextWarp({ text: t, onChange }: { text: TextStyle; onChange: (next: Partial<TextStyle>, history: boolean) => void }) {
  const first = useRef(true);
  return (
    <div className="text-warp">
      <span className="cp-sub">Déformation</span>
      <div className="seg tb-warps">
        {WARPS.map((w) => (
          <button key={w.id} className={(t.warp?.kind ?? 'none') === w.id ? 'on' : ''} onClick={() => onChange({ warp: w.id === 'none' ? undefined : { kind: w.id, amount: t.warp?.amount || 0.5 } }, true)} title={w.name}>
            <WarpGlyph k={w.id} />
          </button>
        ))}
      </div>
      {t.warp && (
        <label className="cp-row">
          <span>Courbure</span>
          <input
            type="range"
            min={-1}
            max={1}
            step={0.02}
            value={t.warp.amount}
            onPointerDown={() => (first.current = true)}
            onChange={(e) => {
              onChange({ warp: { ...t.warp!, amount: Number(e.target.value) } }, first.current);
              first.current = false;
            }}
          />
          <output>{Math.round(t.warp.amount * 100)}</output>
        </label>
      )}
    </div>
  );
}
