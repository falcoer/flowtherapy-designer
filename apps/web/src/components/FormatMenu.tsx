import type { Format } from '@ftd/core';
import { useEffect, useRef, useState } from 'react';

interface Props {
  formats: Format[];
  /** Formats du projet, dans l'ordre (le premier est le format principal). */
  used: string[];
  current: string;
  /** Marge de la grille du projet, fraction du petit côté. */
  margin: number;
  onSelect: (id: string) => void;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}

const BOX = 34;

/**
 * Icône d'un format : proportions exactes, marge en pointillés, et taille
 * relative aux autres formats de même unité (papier en mm, écran en px).
 */
export function FormatIcon({ format, all, margin }: { format: Format; all: Format[]; margin: number }) {
  const peers = all.filter((f) => f.unit === format.unit);
  const longest = Math.max(...peers.map((f) => Math.max(f.width, f.height)));
  const k = (BOX - 2) / longest;
  // les plus petits formats restent lisibles
  const scale = Math.max(k, 12 / Math.min(format.width, format.height));
  const w = format.width * scale;
  const h = format.height * scale;
  const m = Math.min(w, h) * margin;
  const x = (BOX - w) / 2;
  const y = (BOX - h) / 2;
  return (
    <svg viewBox={`0 0 ${BOX} ${BOX}`} width={BOX} height={BOX} className="format-icon" aria-hidden>
      <rect x={x} y={y} width={w} height={h} rx={1.5} className="fi-page" />
      {m > 0.8 && <rect x={x + m} y={y + m} width={w - 2 * m} height={h - 2 * m} className="fi-margin" />}
    </svg>
  );
}

const size = (f: Format) => `${f.width} × ${f.height} ${f.unit}`;
const TARGET: Record<Format['target'], string> = { print: 'Impression', social: 'Réseaux', mail: 'Mail', web: 'Web' };

/** Liste déroulante des formats : ceux du projet, puis ceux qu'on peut ajouter. */
export function FormatMenu({ formats, used, current, margin, onSelect, onAdd, onRemove }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  const cur = formats.find((f) => f.id === current);
  const mine = used.map((id) => formats.find((f) => f.id === id)).filter((f): f is Format => !!f);
  const others = formats.filter((f) => !used.includes(f.id));

  const row = (f: Format, inProject: boolean) => (
    <li key={f.id} className={f.id === current ? 'on' : ''}>
      <button
        className="fm-item"
        onClick={() => {
          if (!inProject) onAdd(f.id);
          onSelect(f.id);
          setOpen(false);
        }}
      >
        <FormatIcon format={f} all={formats} margin={margin} />
        <span className="fm-text">
          <strong>{f.title}</strong>
          <small>
            {size(f)} · {TARGET[f.target]}
          </small>
        </span>
        {!inProject && <span className="fm-add">＋</span>}
        {inProject && f.id === used[0] && <span className="fm-main" title="Format principal : les autres s'en déduisent">★</span>}
      </button>
      {inProject && used.length > 1 && f.id !== used[0] && (
        <button className="fm-remove" title="Retirer ce format du projet" onClick={() => onRemove(f.id)}>
          ✕
        </button>
      )}
    </li>
  );

  return (
    <div className="format-menu" ref={ref}>
      <button className={open ? 'fm-current on' : 'fm-current'} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {cur && <FormatIcon format={cur} all={formats} margin={margin} />}
        <span className="fm-text">
          <strong>{cur?.title ?? current}</strong>
          {cur && <small>{size(cur)}</small>}
        </span>
        <span className="fm-chevron">⌄</span>
      </button>
      {/* accès direct aux formats du projet */}
      <div className="fm-quick">
        {mine
          .filter((f) => f.id !== current)
          .map((f) => (
            <button key={f.id} className="fm-quick-btn" onClick={() => onSelect(f.id)} title={`${f.title} · ${size(f)}`}>
              <FormatIcon format={f} all={formats} margin={margin} />
            </button>
          ))}
      </div>
      {open && (
        <div className="fm-pop glass">
          <p className="fm-head">Formats du projet</p>
          <ul>{mine.map((f) => row(f, true))}</ul>
          {others.length > 0 && (
            <>
              <p className="fm-head">Ajouter un format</p>
              <ul>{others.map((f) => row(f, false))}</ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
