import { shapeGeometry, type LibraryElement } from '@ftd/core';
import { useRef } from 'react';
import { thumbUrl } from '../api';

const TYPES = [
  { id: '', label: 'Tout' },
  { id: 'image', label: 'Images' },
  { id: 'text', label: 'Textes' },
  { id: 'shape', label: 'Formes' },
  { id: 'palette', label: 'Palettes' },
  { id: 'font', label: 'Polices' },
];

interface Props {
  results: LibraryElement[];
  query: string;
  type: string;
  tags: Array<{ tag: string; count: number }>;
  activeTag: string;
  uploading: boolean;
  onQuery: (q: string) => void;
  onType: (t: string) => void;
  onTag: (t: string) => void;
  onUpload: (files: File[]) => void;
  onClose: () => void;
  /** Début d'un glisser depuis une vignette (doigt, stylet ou souris). */
  onDragStart: (el: LibraryElement, e: React.PointerEvent) => void;
  onApplyPalette: (id: string) => void;
}

/** Seul panneau ouvert en mode insertion : recherche en haut, vignettes sur le côté. */
export function InsertPanel(props: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
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
        <div className="panel-actions">
          <button className="chip primary" onClick={() => fileInput.current?.click()} disabled={props.uploading}>
            {props.uploading ? 'Import…' : 'Importer des fichiers'}
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            accept="image/*,.svg,.ttf,.otf,.woff,.woff2"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              if (files.length) props.onUpload(files);
            }}
          />
        </div>
        {props.tags.length > 0 && (
          <div className="tag-cloud">
            {props.tags.slice(0, 16).map((t) => (
              <button key={t.tag} className={props.activeTag === t.tag ? 'chip small on' : 'chip small'} onClick={() => props.onTag(props.activeTag === t.tag ? '' : t.tag)}>
                {t.tag}
              </button>
            ))}
          </div>
        )}
        <p className="hint">Glisse un élément sur un point d'ancrage, ou hors du format pour l'attacher au document.</p>
        <ul className="thumbs">
          {props.results.map((el) => (
            <li
              key={`${el.type}/${el.id}`}
              className="thumb"
              onPointerDown={(e) => (el.type === 'image' || el.type === 'text' || el.type === 'shape') && props.onDragStart(el, e)}
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
  if (el.type === 'image') return <img className="preview" src={thumbUrl(el)} alt="" draggable={false} loading="lazy" />;
  if (el.type === 'font')
    return (
      <div className="preview preview-font" style={{ fontFamily: `"${el.family}"` }}>
        Aa
      </div>
    );
  if (el.type === 'text') return <div className="preview preview-text">{el.body.trim()}</div>;
  if (el.type === 'palette')
    return (
      <div className="preview preview-palette">
        {el.colors.map((c, i) => (
          <span key={i} style={{ background: c.hex }} />
        ))}
      </div>
    );
  if (el.type === 'shape') {
    const g = shapeGeometry(el.shape, 14, 10, 52, 44, el.radius ?? 0);
    const Tag = g.tag;
    return (
      <svg className="preview preview-shape" viewBox="0 0 80 64">
        <Tag {...g.attrs} fill="currentColor" />
      </svg>
    );
  }
  return <div className="preview">{el.type}</div>;
}
