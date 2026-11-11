import { useRef, useState } from 'react';
import type { Doc, Layer } from './model';
import { applyPatch, listOf, matterSwatch, removeEntry, renameEntry, varnishOf, varnishSwatch, type MatterKind } from './palettes';

/**
 * Rangée « Mes matières » ou « Mes vernis » du volet Palette : toucher une pastille la pose sur l'objet
 * choisi, la glisser la pose sur l'objet visé ; double toucher pour la renommer ou la retirer.
 */
export function MatterRow({
  doc,
  kind,
  sel,
  onDoc,
  onToast,
  targetAt,
}: {
  doc: Doc;
  kind: MatterKind;
  sel?: Layer;
  onDoc: (f: (d: Doc) => Doc) => void;
  onToast: (msg: string) => void;
  /** L'objet sous ce point de l'écran (lâcher d'une pastille). */
  targetAt: (x: number, y: number) => Layer | undefined;
}) {
  const list = listOf(doc, kind);
  const [ghost, setGhost] = useState<{ x: number; y: number; bg: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const drag = useRef<{ id: string; x: number; y: number; on: boolean } | null>(null);
  const last = useRef<{ id: string; t: number } | null>(null);
  const label = kind === 'material' ? 'Mes matières' : 'Mes vernis';
  const what = kind === 'material' ? 'matière' : 'vernis';
  const bgOf = (id: string) => {
    const e = list.find((x) => x.id === id)!;
    return kind === 'material' ? matterSwatch(e.fx) : varnishSwatch(e.fx);
  };
  const put = (l: Layer | undefined, id: string) => {
    const e = list.find((x) => x.id === id);
    if (!l || !e) return;
    onDoc((d) => ({ ...d, layers: d.layers.map((x) => (x.id === l.id ? { ...x, ...applyPatch(x, kind, e) } : x)) }));
    onToast(`« ${l.name} » prend ${kind === 'material' ? 'la matière' : 'le vernis'} « ${e.name} »`);
  };
  const cur = sel && (kind === 'material' ? sel.material?.ref : varnishOf(sel)?.ref);
  const ed = editing ? list.find((x) => x.id === editing) : undefined;
  return (
    <section className={`pal-sec matter ${kind}`}>
      <span className="pal-sec-label">{label}</span>
      <div className="guides">
        {list.map((e) => (
          <div
            key={e.id}
            role="button"
            tabIndex={0}
            className={`guide matter-chip ${cur === e.id ? 'on' : ''}`}
            title={`${e.name} : touche pour la poser sur l’objet choisi, glisse-la sur un objet, double toucher pour la renommer`}
            onPointerDown={(ev) => {
              (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
              drag.current = { id: e.id, x: ev.clientX, y: ev.clientY, on: false };
            }}
            onPointerMove={(ev) => {
              const d = drag.current;
              if (!d) return;
              if (!d.on && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 8) d.on = true;
              if (d.on) setGhost({ x: ev.clientX, y: ev.clientY, bg: bgOf(d.id) });
            }}
            onPointerUp={(ev) => {
              const d = drag.current;
              drag.current = null;
              setGhost(null);
              if (!d) return;
              if (d.on) return put(targetAt(ev.clientX, ev.clientY), d.id);
              const now = performance.now();
              if (last.current && last.current.id === e.id && now - last.current.t < 400) {
                last.current = null;
                setEditing(e.id);
                return;
              }
              last.current = { id: e.id, t: now };
              if (sel && sel.kind !== 'surface') put(sel, e.id);
            }}
            onPointerCancel={() => {
              drag.current = null;
              setGhost(null);
            }}
          >
            <span className="sw" style={{ background: bgOf(e.id), backgroundSize: 'cover' }} />
          </div>
        ))}
        {list.length === 0 && <small className="pal-empty">Ajoute {kind === 'material' ? 'une matière' : 'un vernis'} depuis l’assistant (baguette magique de l’outil multicouche).</small>}
      </div>
      {ed && (
        <div className="matter-edit">
          <input
            autoFocus
            defaultValue={ed.name}
            aria-label={`Nom du ${what}`}
            onFocus={(ev) => ev.currentTarget.select()}
            onKeyDown={(ev) => {
              ev.stopPropagation();
              if (ev.key === 'Enter') ev.currentTarget.blur();
              if (ev.key === 'Escape') setEditing(null);
            }}
            onBlur={(ev) => {
              const name = ev.currentTarget.value.trim();
              if (name && name !== ed.name) onDoc((d) => renameEntry(d, kind, ed.id, name));
            }}
          />
          <button
            className="chip"
            onClick={() => {
              onDoc((d) => removeEntry(d, kind, ed.id));
              setEditing(null);
              onToast(`« ${ed.name} » retiré de la palette : les objets gardent leur réglage`);
            }}
          >
            Retirer
          </button>
          <button className="chip" onClick={() => setEditing(null)}>
            OK
          </button>
        </div>
      )}
      {ghost && <span className="drag-dot matter-dot" style={{ left: ghost.x, top: ghost.y, background: ghost.bg, backgroundSize: 'cover' }} />}
    </section>
  );
}
