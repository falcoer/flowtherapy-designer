import { useState, type RefObject } from 'react';

/**
 * Le texte d'accompagnement d'un post : Facebook et Instagram n'acceptent pas de mise en forme, le gras et
 * l'italique passent donc par les lettres « mathématiques » d'Unicode (𝗴𝗿𝗮𝘀, 𝘪𝘵𝘢𝘭𝘪𝘲𝘶𝘦), que les réseaux affichent
 * telles quelles. Les accents restent posés sur la lettre (é = e + accent combinant).
 */
export type CaptionStyle = 'bold' | 'italic';

const RANGES: Record<CaptionStyle, { upper: number; lower: number; digit?: number }> = {
  bold: { upper: 0x1d5d4, lower: 0x1d5ee, digit: 0x1d7ec },
  italic: { upper: 0x1d608, lower: 0x1d622 },
};

const styleOf = (cp: number): { style: CaptionStyle; plain: string } | null => {
  for (const style of ['bold', 'italic'] as const) {
    const r = RANGES[style];
    if (cp >= r.upper && cp < r.upper + 26) return { style, plain: String.fromCharCode(65 + cp - r.upper) };
    if (cp >= r.lower && cp < r.lower + 26) return { style, plain: String.fromCharCode(97 + cp - r.lower) };
    if (r.digit && cp >= r.digit && cp < r.digit + 10) return { style, plain: String.fromCharCode(48 + cp - r.digit) };
  }
  return null;
};

/** Le texte revenu en lettres ordinaires (accents recomposés). */
export function plainCaption(s: string): string {
  return Array.from(s, (ch) => styleOf(ch.codePointAt(0)!)?.plain ?? ch)
    .join('')
    .normalize('NFC');
}

/** Le texte dans le style demandé ; s'il y est déjà en entier, il revient en lettres ordinaires. */
export function styleCaption(s: string, style: CaptionStyle): string {
  const letters = Array.from(s).filter((ch) => /[\p{L}\p{N}]/u.test(plainCaption(ch)));
  if (letters.length && letters.every((ch) => styleOf(ch.codePointAt(0)!)?.style === style)) return plainCaption(s);
  const r = RANGES[style];
  return Array.from(plainCaption(s).normalize('NFD'), (ch) => {
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90) return String.fromCodePoint(r.upper + c - 65);
    if (c >= 97 && c <= 122) return String.fromCodePoint(r.lower + c - 97);
    if (r.digit && c >= 48 && c <= 57) return String.fromCodePoint(r.digit + c - 48);
    return ch;
  }).join('');
}

const EMOJIS = ['🎶', '🎵', '🎸', '🥁', '🎹', '🎤', '🎧', '🎷', '🎺', '🎻', '🔥', '✨', '💫', '⭐', '🌙', '☀️', '🌈', '🌊', '🌿', '🌸', '❤️', '💜', '💛', '🧡', '🙌', '👏', '🤘', '💃', '🕺', '🎉', '🥳', '🍻', '🍷', '📍', '📅', '🕗', '🎟️', '👉', '⬇️', '✅', '📣', '📸', '🎬', '🙏', '😍', '😎', '🤩', '😉'];

/** Barre au-dessus d'un texte d'accompagnement : gras, italique, émojis, à l'endroit du curseur. */
export function CaptionTools(p: { area: RefObject<HTMLTextAreaElement | null>; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [emojis, setEmojis] = useState(false);
  const range = () => {
    const el = p.area.current;
    return el ? [el.selectionStart, el.selectionEnd] : [p.value.length, p.value.length];
  };
  const put = (text: string, from: number, to: number, select: boolean) => {
    p.onChange(p.value.slice(0, from) + text + p.value.slice(to));
    // le curseur reste sur ce qu'on vient de changer
    requestAnimationFrame(() => {
      const el = p.area.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(select ? from : from + text.length, from + text.length);
    });
  };
  const style = (s: CaptionStyle) => {
    const [a, b] = range();
    if (a === b) return;
    put(styleCaption(p.value.slice(a, b), s), a, b, true);
  };
  return (
    <div className="cap-tools">
      <button type="button" className="cap-btn" disabled={p.disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => style('bold')} title="Gras : sélectionne un passage, puis touche (encore une fois pour l’enlever)" aria-label="Gras">
        <b>G</b>
      </button>
      <button type="button" className="cap-btn" disabled={p.disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => style('italic')} title="Italique : sélectionne un passage, puis touche (encore une fois pour l’enlever)" aria-label="Italique">
        <i>I</i>
      </button>
      <button type="button" className={`cap-btn ${emojis ? 'on' : ''}`} disabled={p.disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => setEmojis(!emojis)} title="Émojis" aria-label="Émojis" aria-expanded={emojis}>
        🙂
      </button>
      {emojis && (
        <div className="cap-emojis" role="listbox" aria-label="Émojis">
          {EMOJIS.map((e) => (
            <button
              type="button"
              key={e}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => {
                const [a, b] = range();
                put(e, a, b, false);
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
