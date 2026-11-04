import { useEffect, useMemo, useRef, useState } from 'react';

/** Élément de la bibliothèque du groupe, tel que l'index de l'atelier le décrit. */
export interface LibItem {
  id: string;
  title: string;
  tags: string[];
  shelf: Shelf;
  src: string;
  thumb: string;
  w: number;
  h: number;
  description?: string;
  credit?: string;
  date?: string;
  /** Silhouette d'une image à fond transparent, en coordonnées 0..1 : devient sa découpe. */
  rings?: Array<Array<[number, number]>>;
  /** Traits noirs à recolorer avec la couleur choisie (décors à la craie). */
  tint?: boolean;
  vector?: boolean;
}
export type Shelf = 'photos' | 'illustrations' | 'decors' | 'logos';

export const SHELVES: Array<[Shelf | 'formes', string]> = [
  ['formes', 'Formes'],
  ['photos', 'Photos'],
  ['illustrations', 'Illustrations'],
  ['decors', 'Décors'],
  ['logos', 'Logos'],
];

/** Filtres rapides proposés par rayon (étiquettes présentes dans l'index). */
const FILTERS: Partial<Record<Shelf, Array<[string, string]>>> = {
  photos: [
    ['groupe', 'Groupe'],
    ['betty', 'Betty'],
    ['jenni', 'Jenni'],
    ['lauris', 'Lauris'],
    ['concert', 'Concert'],
    ['portrait', 'Portrait'],
    ['noir-et-blanc', 'Noir et blanc'],
    ['plein-air', 'Plein air'],
  ],
  illustrations: [
    ['alpaga', 'Alpagas'],
    ['paysage', 'Paysages'],
  ],
  logos: [
    ['flow-therapy', 'Flow Therapy'],
    ['presse', 'Presse'],
    ['qr', 'QR code'],
  ],
};

let cache: Promise<LibItem[]> | null = null;
/** L'index est chargé une fois, à la première ouverture du tiroir. */
export function loadLibrary(): Promise<LibItem[]> {
  cache ??= fetch('library/index.json')
    .then((r) => (r.ok ? r.json() : { items: [] }))
    .then((d: { items: LibItem[] }) => d.items)
    .catch(() => []);
  return cache;
}

/** Rayon d'images de la bibliothèque : toucher pour poser au centre, glisser pour poser à l'endroit voulu. */
export function LibraryShelf({ shelf, onInsert, onDragState }: { shelf: Shelf; onInsert: (item: LibItem, at?: { x: number; y: number }) => void; onDragState: (dragging: boolean) => void }) {
  const [items, setItems] = useState<LibItem[] | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ item: LibItem; x: number; y: number } | null>(null);
  const press = useRef<{ item: LibItem; x: number; y: number; drag: boolean } | null>(null);
  useEffect(() => {
    void loadLibrary().then(setItems);
  }, []);
  useEffect(() => setTag(null), [shelf]);
  const list = useMemo(() => (items ?? []).filter((x) => x.shelf === shelf && (!tag || x.tags.includes(tag))), [items, shelf, tag]);
  const filters = (FILTERS[shelf] ?? []).filter(([t]) => (items ?? []).some((x) => x.shelf === shelf && x.tags.includes(t)));

  if (!items) return <div className="lib-empty">Chargement de la bibliothèque…</div>;
  if (!items.length) return <div className="lib-empty">Bibliothèque indisponible ici.</div>;
  return (
    <>
      {filters.length > 0 && (
        <div className="lib-filters">
          {filters.map(([t, label]) => (
            <button key={t} className={tag === t ? 'on' : ''} onClick={() => setTag(tag === t ? null : t)}>
              {label}
            </button>
          ))}
        </div>
      )}
      <div className={`lib-grid shelf-${shelf}`}>
        {list.map((it) => (
          <button
            key={it.id}
            className="lib-tile"
            title={[it.title, it.description, it.credit && `Photo : ${it.credit}`].filter(Boolean).join('\n')}
            onPointerDown={(e) => {
              (e.currentTarget as Element).setPointerCapture(e.pointerId);
              press.current = { item: it, x: e.clientX, y: e.clientY, drag: false };
            }}
            onPointerMove={(e) => {
              const p = press.current;
              if (!p) return;
              if (!p.drag && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) {
                p.drag = true;
                onDragState(true);
              }
              if (p.drag) setGhost({ item: p.item, x: e.clientX, y: e.clientY });
            }}
            onPointerUp={(e) => {
              const p = press.current;
              press.current = null;
              setGhost(null);
              if (!p) return;
              if (!p.drag) return onInsert(p.item);
              onDragState(false);
              const el = document.elementFromPoint(e.clientX, e.clientY);
              if (el?.tagName === 'CANVAS') onInsert(p.item, { x: e.clientX, y: e.clientY });
            }}
            onPointerCancel={() => {
              press.current = null;
              setGhost(null);
              onDragState(false);
            }}
          >
            <span className="lib-thumb">
              <img src={it.thumb} alt="" draggable={false} loading="lazy" />
            </span>
            <span className="lib-name">{it.title.replace(/^(Craie|Presse) : /, '')}</span>
          </button>
        ))}
      </div>
      {ghost && <img className="lib-ghost" src={ghost.item.thumb} alt="" style={{ left: ghost.x, top: ghost.y }} />}
    </>
  );
}
