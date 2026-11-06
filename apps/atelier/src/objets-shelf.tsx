/** Rayon Objets : les objets préparés, toucher pour poser au centre, glisser pour poser à l'endroit voulu. */
import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { RailScroll } from './library';
import { listObjets, removeObjet, type ObjetEntry } from './objets';

export function ObjetsShelf({ onInsert, onDragState }: { onInsert: (e: ObjetEntry, at?: { x: number; y: number }) => void; onDragState: (dragging: boolean) => void }) {
  const [items, setItems] = useState<ObjetEntry[] | null>(null);
  const [ghost, setGhost] = useState<{ item: ObjetEntry; x: number; y: number } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const press = useRef<{ item: ObjetEntry; x: number; y: number; drag: boolean } | null>(null);
  useEffect(() => {
    void listObjets().then(setItems);
  }, []);

  if (!items) return <div className="lib-empty">Chargement des objets…</div>;
  if (!items.length)
    return (
      <div className="lib-empty objets-empty">
        Aucun objet rangé pour l'instant. Prépare un objet sur la page (pièces, matières, hauteurs), puis touche <Icon name="library" /> à côté de son nom dans la liste des objets : il se range ici, prêt à être reposé
        tel quel.
      </div>
    );
  return (
    <>
      <RailScroll className="lib-grid shelf-objets">
        {items.map((it) => (
          <div key={it.id} className="objet-tile">
            <button
              className="lib-tile"
              title={`${it.title}${it.by ? `\nRangé par ${it.by}` : ''}${it.local ? '\nRangé dans ce navigateur' : ''}`}
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
              <span className="lib-name">{it.title}</span>
            </button>
            <button
              className={`objet-del ${confirm === it.id ? 'on' : ''}`}
              title={confirm === it.id ? 'Toucher encore pour retirer cet objet de la bibliothèque' : 'Retirer de la bibliothèque'}
              onClick={() => {
                if (confirm !== it.id) return setConfirm(it.id);
                setConfirm(null);
                void removeObjet(it).then(() => setItems((l) => (l ?? []).filter((x) => x.id !== it.id)));
              }}
            >
              <Icon name="trash" />
            </button>
          </div>
        ))}
      </RailScroll>
      {ghost && <img className="lib-ghost" src={ghost.item.thumb} alt="" style={{ left: ghost.x, top: ghost.y }} />}
    </>
  );
}
