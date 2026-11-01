import type { LibraryElement } from '@ftd/core';
import { fileUrl } from '../api';

const TYPES = [
  { id: '', label: 'Tout' },
  { id: 'image', label: 'Images' },
  { id: 'text', label: 'Textes' },
  { id: 'palette', label: 'Palettes' },
];

interface Props {
  results: LibraryElement[];
  query: string;
  type: string;
  onQuery: (q: string) => void;
  onType: (t: string) => void;
  onClose: () => void;
  /** Début d'un glisser depuis une vignette (doigt, stylet ou souris). */
  onDragStart: (el: LibraryElement, e: React.PointerEvent) => void;
  onApplyPalette: (id: string) => void;
}

/** Seul panneau ouvert en mode insertion : recherche en haut, vignettes sur le côté. */
export function InsertPanel(props: Props) {
  return (
    <>
      <div className="search-bar glass">
        <input
          type="search"
          placeholder="Rechercher par nom, tag, texte…"
          value={props.query}
          onChange={(e) => props.onQuery(e.target.value)}
          autoFocus
        />
        <div className="chips">
          {TYPES.map((t) => (
            <button key={t.id} className={props.type === t.id ? 'chip on' : 'chip'} onClick={() => props.onType(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <button className="icon-btn" onClick={props.onClose} aria-label="Fermer">
          ✕
        </button>
      </div>
      <aside className="side-panel glass">
        <p className="hint">Glisse un élément sur un point d'ancrage, ou hors du format pour l'attacher au document.</p>
        <ul className="thumbs">
          {props.results.map((el) => (
            <li
              key={`${el.type}/${el.id}`}
              className="thumb"
              onPointerDown={(e) => el.type !== 'palette' && props.onDragStart(el, e)}
              onClick={() => el.type === 'palette' && props.onApplyPalette(el.id)}
            >
              <Preview el={el} />
              <div className="thumb-meta">
                <strong>{el.title ?? el.id}</strong>
                <span>{el.tags.join(' · ')}</span>
              </div>
            </li>
          ))}
          {props.results.length === 0 && <li className="empty">Aucun résultat</li>}
        </ul>
      </aside>
    </>
  );
}

export function Preview({ el }: { el: LibraryElement }) {
  if (el.type === 'image') return <img className="preview" src={fileUrl(el.source)} alt="" draggable={false} />;
  if (el.type === 'text') return <div className="preview preview-text">{el.body.trim()}</div>;
  if (el.type === 'palette')
    return (
      <div className="preview preview-palette">
        {el.colors.map((c, i) => (
          <span key={i} style={{ background: c.hex }} />
        ))}
      </div>
    );
  return <div className="preview">{el.type}</div>;
}
