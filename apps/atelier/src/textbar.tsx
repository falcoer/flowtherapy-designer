import { useEffect, useRef, useState } from 'react';
import { fontFamily, type SwashEnd, type TextStyle, type WarpKind } from './text';

/** Outil Prolonger : on dessine depuis une lettre, le trait devient une partie des lettres. */
export interface SwashTool {
  on: boolean;
  /** Tracer un prolongement, ou modeler le contour (tirer de l'intérieur, repousser de l'extérieur). */
  mode: 'draw' | 'mold' | 'orn' | 'relief';
  /** Relief : bosser (absent), creuser ou niveler (aplanir à la hauteur où le geste commence). */
  sculpt?: 'raise' | 'dig' | 'level';
  /** Rayon du modelage, en corps. */
  r: number;
  end: SwashEnd;
  /** Épaisseur choisie, en corps (null : celle d'un fût à la graisse du texte). */
  w: number | null;
  /** Force du modelage, de 0 à 1 (absente : 1). */
  k?: number;
  /** Forme de la pointe du modelage, et son angle à l'écran (radians). */
  tip?: 'round' | 'flat' | 'triangle';
  rot?: number;
  /** Plume : sa pointe (absente : plate, le bec à 45°) et son angle à l'écran. */
  ornTip?: 'round' | 'flat' | 'triangle';
  ornRot?: number;
  /** Relief : sa pointe (absente : ronde) et son angle à l'écran. */
  reliefTip?: 'round' | 'flat' | 'triangle';
  reliefRot?: number;
}

const WEIGHTS = ['Extra-fin', 'Très fin', 'Fin', 'Normal', 'Medium', 'Demi-gras', 'Gras', 'Extra-gras', 'Noir'];
export const weightName = (w: number) => WEIGHTS[Math.max(0, Math.min(8, Math.round(w / 100) - 1))]!;

/** L'enveloppe dessinée : le haut et le bas du bloc de lettres. */
export function WarpGlyph({ k }: { k: WarpKind | 'none' }) {
  const top = { none: 'M2 4H20', arc: 'M2 7Q11 -1 20 7', wave: 'M2 6C6 0 9 0 11 5S16 10 20 4', bulge: 'M2 6Q11 -2 20 6', persp: 'M2 6L20 1' }[k];
  const bot = { none: 'M2 14H20', arc: 'M2 16Q11 8 20 16', wave: 'M2 15C6 9 9 9 11 14S16 19 20 13', bulge: 'M2 13Q11 21 20 13', persp: 'M2 12L20 17' }[k];
  return (
    <svg width="22" height="18" viewBox="0 0 22 18" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d={top} />
      <path d={bot} />
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

/** Bulle de contenu de la section Texte : saisie multiligne et alignement. */
export function TextContent({ text: t, onChange }: { text: TextStyle; onChange: (next: Partial<TextStyle>, history: boolean) => void }) {
  const first = useRef(true);
  const [draft, setDraft] = useLazyText(t.content, (v) => {
    onChange({ content: v }, first.current);
    first.current = false;
  });
  const lines = draft.split('\n').length;
  // ouvert d'un double toucher ou d'un texte neuf : on écrit tout de suite (le texte choisi se remplace)
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const id = setTimeout(() => {
      const a = area.current;
      if (!a || document.activeElement === a) return;
      a.focus();
      a.select();
    }, 60);
    return () => clearTimeout(id);
  }, []);
  return (
    <div className="text-bubble">
      <textarea
        ref={area}
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

