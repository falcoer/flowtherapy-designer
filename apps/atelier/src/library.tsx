import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchOrientedItems } from './server';
import { RingIcon } from './ring-icon';
import { otherSide } from './views';

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
  /** Illustration orientée : une image par vue (face, trois-quarts, profil, dos, et leurs versions gauche). */
  views?: Array<{ view: string; src: string; thumb: string; w: number; h: number }>;
  /** La vue choisie sur l'anneau de la vignette, montrée à la pose. */
  view?: string;
}
export type Shelf = 'photos' | 'illustrations' | 'logos';

export type DrawerShelf = Shelf | 'objets' | 'formes' | 'textes';
export const SHELVES: Array<[DrawerShelf, string]> = [
  ['objets', 'Objets'],
  ['textes', 'Textes'],
  ['formes', 'Formes'],
  ['photos', 'Photos'],
  ['illustrations', 'Illustrations'],
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
    ['tremplin', 'Tremplin'],
    ['radio', 'Radio'],
  ],
  illustrations: [
    ['personnage', 'Personnages'],
    ['alpaga', 'Alpagas'],
    ['paysage', 'Paysages'],
    ['affiche-psyche', 'Affiche psyché'],
    ['decor', 'Décors'],
    ['fond', 'Fonds'],
  ],
  logos: [
    ['flow-therapy', 'Flow Therapy'],
    ['presse', 'Presse'],
    ['qr', 'QR code'],
  ],
};

let cache: Promise<{ items: LibItem[]; fonts?: import('./text').FontInfo[] }> | null = null;
/** L'index (images et polices) est chargé une fois. */
export function loadIndex() {
  cache ??= fetch('library/index.json')
    .then((r) => (r.ok ? r.json() : { items: [] }))
    .catch(() => ({ items: [] }));
  return cache;
}
/** Images de la bibliothèque, chargées à la première ouverture du tiroir. */
export const loadLibrary = (): Promise<LibItem[]> => loadIndex().then((d) => d.items ?? []);

let added: Promise<LibItem[]> | null = null;
/** Illustrations orientées importées depuis l'atelier (sur le serveur), relues après chaque import. */
const loadAdded = () => (added ??= fetchOrientedItems().catch(() => []));
export const refreshAdded = () => {
  added = null;
};

/** Rayon d'images de la bibliothèque : toucher pour poser au centre, glisser pour poser à l'endroit voulu. */
/**
 * `onDropAt` : une vignette lâchée ailleurs que sur le fond de la page (palette, attributs, forme) ; true si elle
 * y a été prise (en revêtement). `onDragAt` : le doigt pendant le glisser (null à la fin), pour éclairer la cible.
 */
export function LibraryShelf({
  shelf,
  onInsert,
  onDragState,
  onDropAt,
  onDragAt,
}: {
  shelf: Shelf;
  onInsert: (item: LibItem, at?: { x: number; y: number }) => void;
  onDragState: (dragging: boolean) => void;
  onDropAt?: (item: LibItem, x: number, y: number) => boolean;
  onDragAt?: (x: number | null, y?: number) => void;
}) {
  const [items, setItems] = useState<LibItem[] | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ item: LibItem; x: number; y: number } | null>(null);
  // vue choisie sur l'anneau de chaque illustration orientée
  const [turned, setTurned] = useState<Record<string, string>>({});
  const pick = (it: LibItem): LibItem => {
    const want = turned[it.id];
    // une vue tournée sans image à elle : celle de l'autre côté, retournée (en miroir à la pose)
    const v = it.views?.find((x) => x.view === want) ?? it.views?.find((x) => want && x.view === otherSide(want));
    return v ? { ...it, view: want, thumb: v.thumb } : it;
  };
  const mirrored = (it: LibItem) => !!turned[it.id] && !!otherSide(turned[it.id]!) && !it.views?.some((x) => x.view === turned[it.id]);
  const ringOf = (it: LibItem) => {
    const has = new Set(it.views!.map((v) => v.view));
    return [...new Set([...has, ...[...has].map(otherSide).filter((k): k is string => !!k)])];
  };
  const press = useRef<{ item: LibItem; x: number; y: number; drag: boolean } | null>(null);
  useEffect(() => {
    void Promise.all([loadLibrary(), loadAdded()]).then(([lib, more]) => {
      // une illustration importée puis versée dans la bibliothèque au déploiement n'apparaît qu'une fois
      const known = new Set(lib.map((x) => x.id));
      setItems([...more.filter((x) => !known.has(x.id)), ...lib]);
    });
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
      <RailScroll className={`lib-grid shelf-${shelf}`}>
        {list.map((it) => (
          <button
            key={it.id}
            className="lib-tile"
            title={[it.title, it.description, it.credit && `Photo : ${it.credit}`].filter(Boolean).join('\n')}
            onPointerDown={(e) => {
              (e.currentTarget as Element).setPointerCapture(e.pointerId);
              press.current = { item: pick(it), x: e.clientX, y: e.clientY, drag: false };
            }}
            onPointerMove={(e) => {
              const p = press.current;
              if (!p) return;
              if (!p.drag && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) {
                p.drag = true;
                onDragState(true);
              }
              if (p.drag) {
                setGhost({ item: p.item, x: e.clientX, y: e.clientY });
                onDragAt?.(e.clientX, e.clientY);
              }
            }}
            onPointerUp={(e) => {
              const p = press.current;
              press.current = null;
              setGhost(null);
              if (!p) return;
              if (!p.drag) return onInsert(p.item);
              onDragState(false);
              onDragAt?.(null);
              if (onDropAt?.(p.item, e.clientX, e.clientY)) return;
              const el = document.elementFromPoint(e.clientX, e.clientY);
              if (el?.tagName === 'CANVAS') onInsert(p.item, { x: e.clientX, y: e.clientY });
            }}
            onPointerCancel={() => {
              press.current = null;
              setGhost(null);
              onDragState(false);
              onDragAt?.(null);
            }}
          >
            <span className={`lib-thumb ${it.views?.length ? 'oriented' : ''}`}>
              <img src={pick(it).thumb} alt="" draggable={false} loading="lazy" className={mirrored(it) ? 'mirror' : ''} />
              {!!it.views?.length && <RingIcon views={ringOf(it)} on={turned[it.id] ?? it.views[0]!.view} onPick={(v) => setTurned((t) => ({ ...t, [it.id]: v }))} />}
            </span>
            <span className="lib-name">{it.title.replace(/^(Craie|Presse) : /, '')}</span>
          </button>
        ))}
      </RailScroll>
      {ghost && <img className="lib-ghost" src={ghost.item.thumb} alt="" style={{ left: ghost.x, top: ghost.y }} />}
    </>
  );
}

/** Zone défilante flanquée d'une barre de défilement toujours visible (le doigt sur une tablette n'en montre aucune). */
export function RailScroll({ className, children }: { className: string; children: React.ReactNode }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, size: 1 });
  const measure = () => {
    const g = gridRef.current;
    if (!g) return;
    const max = g.scrollHeight - g.clientHeight;
    const next = { top: max > 0 ? g.scrollTop / max : 0, size: g.scrollHeight ? Math.min(1, g.clientHeight / g.scrollHeight) : 1 };
    setView((v) => (Math.abs(v.top - next.top) < 1e-4 && Math.abs(v.size - next.size) < 1e-4 ? v : next));
  };
  useEffect(() => {
    measure();
    const g = gridRef.current;
    if (!g) return;
    const ro = new ResizeObserver(measure);
    ro.observe(g);
    // les vignettes chargées agrandissent la grille
    const imgs = [...g.querySelectorAll('img')];
    imgs.forEach((i) => i.addEventListener('load', measure));
    return () => {
      ro.disconnect();
      imgs.forEach((i) => i.removeEventListener('load', measure));
    };
  });
  return (
    <div className="lib-scroll">
      <div className={className} ref={gridRef} onScroll={measure}>
        {children}
      </div>
      <ScrollRail grid={gridRef} view={view} />
    </div>
  );
}

/** Barre de défilement toujours visible, à faire glisser au doigt ou à toucher pour sauter. */
function ScrollRail({ grid, view }: { grid: React.RefObject<HTMLDivElement | null>; view: { top: number; size: number } }) {
  const rail = useRef<HTMLDivElement>(null);
  const grab = useRef<{ y: number; top: number } | null>(null);
  if (view.size >= 0.999) return null;
  const thumb = Math.max(0.12, view.size);
  const scrollTo = (t: number) => {
    const g = grid.current;
    if (g) g.scrollTop = Math.max(0, Math.min(1, t)) * (g.scrollHeight - g.clientHeight);
  };
  return (
    <div
      ref={rail}
      className="lib-rail"
      onPointerDown={(e) => {
        const r = rail.current!.getBoundingClientRect();
        const y = (e.clientY - r.top) / r.height;
        const t0 = view.top * (1 - thumb);
        // hors du curseur : on y saute, puis on peut glisser
        if (y < t0 || y > t0 + thumb) scrollTo((y - thumb / 2) / (1 - thumb));
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        const g = grid.current!;
        grab.current = { y: e.clientY, top: g.scrollTop };
      }}
      onPointerMove={(e) => {
        const g0 = grab.current;
        const g = grid.current;
        if (!g0 || !g) return;
        const r = rail.current!.getBoundingClientRect();
        const k = (g.scrollHeight - g.clientHeight) / (r.height * (1 - thumb));
        g.scrollTop = g0.top + (e.clientY - g0.y) * k;
      }}
      onPointerUp={() => (grab.current = null)}
      onPointerCancel={() => (grab.current = null)}
    >
      <span className="lib-rail-thumb" style={{ top: `${view.top * (1 - thumb) * 100}%`, height: `${thumb * 100}%` }} />
    </div>
  );
}
