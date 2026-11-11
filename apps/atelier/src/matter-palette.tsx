import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dots, Range } from './coupe';
import { FX, fxGuides, fxKnobs, fxOf, newFx, type Fx } from './fx';
import { MATERIAL_TYPES, presetFx } from './material-presets';
import type { Doc, Layer, PaletteMatter } from './model';
import { applyPatch, listOf, matterSwatch, newEntry, removeEntry, updateEntry, usersOf, varnishOf, varnishSwatch, type MatterKind } from './palettes';

const shape = (k: MatterKind) => (k === 'material' ? 'shape-matter' : 'shape-varnish');
const swatchOf = (k: MatterKind, fx: Fx) => (k === 'material' ? matterSwatch(fx) : varnishSwatch(fx));

/** La corbeille de la barre du haut, sous ce point ? (une marge pour le doigt) */
function overTrash(x: number, y: number): HTMLElement | null {
  const el = document.querySelector<HTMLElement>('.btn.trash');
  const r = el?.getBoundingClientRect();
  return r && x > r.left - 14 && x < r.right + 14 && y > r.top - 14 && y < r.bottom + 14 ? el! : null;
}

/**
 * Palette « Mes matières » ou « Mes vernis » (un onglet du volet Palette). Toucher une pastille la pose sur
 * l'objet choisi, la glisser la pose sur l'objet visé. Bouton Modifier actif seulement : toucher une pastille
 * ouvre sa boîte, ＋ en ajoute une, la glisser sur la corbeille la retire.
 */
export function MatterRow({
  doc,
  kind,
  edit,
  sel,
  onDoc,
  onDocLive,
  onToast,
  targetAt,
}: {
  doc: Doc;
  kind: MatterKind;
  /** Bouton Modifier de la palette actif. */
  edit: boolean;
  sel?: Layer;
  /** Changement du document, avec une étape d'annulation. */
  onDoc: (f: (d: Doc) => Doc) => void;
  /** Changement en cours (un potard qu'on tourne), sans étape. */
  onDocLive: (f: (d: Doc) => Doc) => void;
  onToast: (msg: string, undoable?: boolean) => void;
  /** L'objet sous ce point de l'écran (lâcher d'une pastille). */
  targetAt: (x: number, y: number) => Layer | undefined;
}) {
  const list = listOf(doc, kind);
  const [ghost, setGhost] = useState<{ x: number; y: number; bg: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  useEffect(() => {
    if (!edit) setEditing(null);
  }, [edit]);
  const drag = useRef<{ id: string; x: number; y: number; on: boolean } | null>(null);
  const hot = useRef<HTMLElement | null>(null);
  const put = (l: Layer | undefined, e: PaletteMatter) => {
    if (!l) return;
    onDoc((d) => ({ ...d, layers: d.layers.map((x) => (x.id === l.id ? { ...x, ...applyPatch(x, kind, e) } : x)) }));
    onToast(`« ${l.name} » prend ${kind === 'material' ? 'la matière' : 'le vernis'} « ${e.name} »`, true);
  };
  const heat = (el: HTMLElement | null) => {
    if (hot.current === el) return;
    hot.current?.classList.remove('hot', 'armed');
    el?.classList.add('hot', 'armed');
    hot.current = el;
  };
  const cur = sel && (kind === 'material' ? sel.material?.ref : varnishOf(sel)?.ref);
  const ed = editing ? list.find((x) => x.id === editing) : undefined;
  const add = () => {
    // une nouvelle entrée : celle de l'objet choisi s'il en a une, sinon un point de départ courant
    const from = sel && (kind === 'material' ? sel.material : varnishOf(sel));
    const p = MATERIAL_TYPES[0]!.presets[0]!;
    const fx = from ?? (kind === 'material' ? presetFx(p, newFx(p.fx)) : newFx('satin'));
    const name = from?.preset ?? (from ? fxOf(from.id)?.name : undefined) ?? (kind === 'material' ? p.name : fxOf('satin')!.name);
    const made = newEntry(doc, kind, name, fx);
    onDoc(() => made.doc);
    setEditing(made.id);
  };
  return (
    <section className={`pal-sec matter ${kind}`}>
      {list.length === 0 && !edit && <p className="pal-hint">Aucun{kind === 'material' ? 'e matière' : ' vernis'} : touche Modifier pour en ajouter.</p>}
      <div className="guides">
        {list.map((e) => (
          <div
            key={e.id}
            role="button"
            tabIndex={0}
            className={`guide matter-chip ${shape(kind)} ${cur === e.id ? 'on' : ''}`}
            title={edit ? `${e.name} : touche pour la modifier, glisse-la sur la corbeille pour la retirer` : `${e.name} : touche pour la poser sur l’objet choisi, ou glisse-la sur un objet`}
            onPointerDown={(ev) => {
              (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
              drag.current = { id: e.id, x: ev.clientX, y: ev.clientY, on: false };
            }}
            onPointerMove={(ev) => {
              const d = drag.current;
              if (!d) return;
              if (!d.on && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 8) d.on = true;
              if (!d.on) return;
              setGhost({ x: ev.clientX, y: ev.clientY, bg: swatchOf(kind, e.fx) });
              heat(edit ? overTrash(ev.clientX, ev.clientY) : null);
            }}
            onPointerUp={(ev) => {
              const d = drag.current;
              drag.current = null;
              setGhost(null);
              heat(null);
              if (!d) return;
              if (d.on) {
                if (edit && overTrash(ev.clientX, ev.clientY)) {
                  const n = usersOf(doc, kind, e.id);
                  onDoc((x) => removeEntry(x, kind, e.id));
                  if (editing === e.id) setEditing(null);
                  onToast(`« ${e.name} » retiré de la palette${n ? ` : ${n > 1 ? `les ${n} objets gardent` : 'l’objet garde'} son réglage` : ''}`, true);
                  return;
                }
                return put(targetAt(ev.clientX, ev.clientY), e);
              }
              if (edit) return setEditing(e.id);
              if (sel && (kind === 'varnish' || sel.kind !== 'surface')) put(sel, e);
            }}
            onPointerCancel={() => {
              drag.current = null;
              setGhost(null);
              heat(null);
            }}
          >
            <span className={`sw ${shape(kind)}`} style={{ background: swatchOf(kind, e.fx), backgroundSize: 'cover' }} />
          </div>
        ))}
        {edit && (
          <button className={`guide add matter-add ${shape(kind)}`} onClick={add} title={kind === 'material' ? 'Nouvelle matière (celle de l’objet choisi, s’il en a une)' : 'Nouveau vernis (celui de l’objet choisi, s’il en a un)'}>
            <span className="sw plus">＋</span>
          </button>
        )}
      </div>
      {/* hors de la bulle (qui défile) : sur iPad, un élément fixe dans une zone qui défile y reste coupé et passe sous les panneaux */}
      {ed && createPortal(<MatterDialog doc={doc} kind={kind} entry={ed} onDoc={onDoc} onDocLive={onDocLive} onClose={() => setEditing(null)} />, document.body)}
      {ghost && createPortal(<span className={`drag-dot matter-dot ${shape(kind)}`} style={{ left: ghost.x, top: ghost.y, background: ghost.bg, backgroundSize: 'cover' }} />, document.body)}
    </section>
  );
}

/**
 * Boîte d'une matière ou d'un vernis de la palette, sur le modèle de la boîte de couleur : son nom,
 * son choix (matière réelle par type, ou sorte de vernis) et tous ses réglages. Les objets liés suivent.
 */
export function MatterDialog({
  doc,
  kind,
  entry: e,
  onDoc,
  onDocLive,
  onClose,
}: {
  doc: Doc;
  kind: MatterKind;
  entry: PaletteMatter;
  onDoc: (f: (d: Doc) => Doc) => void;
  onDocLive: (f: (d: Doc) => Doc) => void;
  onClose: () => void;
}) {
  // une étape d'annulation par geste : la première retouche l'ouvre, les suivantes (sans pause) la complètent
  const step = useRef(0);
  const set = (next: { name?: string; fx?: Fx }, live = false) => {
    const now = performance.now();
    const fresh = !live || now - step.current > 700;
    step.current = live ? now : 0;
    (fresh ? onDoc : onDocLive)((d) => updateEntry(d, kind, e.id, next));
  };
  const [name, setName] = useState(e.name);
  useEffect(() => setName(e.name), [e.id, e.name]);
  useEffect(() => {
    const key = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const def = fxOf(e.fx.id)!;
  const startType = MATERIAL_TYPES.find((t) => t.presets.some((p) => p.fx === e.fx.id && p.name === e.name)) ?? MATERIAL_TYPES.find((t) => t.presets.some((p) => p.fx === e.fx.id)) ?? MATERIAL_TYPES[0]!;
  const [type, setType] = useState(startType.id);
  const users = usersOf(doc, kind, e.id);
  // le nom suit le choix tant qu'il est celui d'une matière ou d'un vernis tout fait
  const auto = (n: string) => MATERIAL_TYPES.some((t) => t.presets.some((p) => p.name === n)) || FX.some((d) => d.name === n);
  const choose = (fx: Fx, label: string) => set({ fx, ...(auto(e.name) ? { name: label } : {}) });
  const slots = fxGuides(def, e.fx);
  const knobs = fxKnobs(def, e.fx);
  return (
    <div className="color-dialog matter-dialog" role="dialog" aria-label={`${kind === 'material' ? 'Matière' : 'Vernis'} ${e.name}`}>
      <button className="lamp-close cd-close" onClick={onClose} aria-label="Fermer">
        ×
      </button>
      <div className="cd-head">
        <span className={`cd-sw ${shape(kind)}`} style={{ background: swatchOf(kind, e.fx), backgroundSize: 'cover' }} />
        <input
          className="gname-input"
          value={name}
          aria-label={kind === 'material' ? 'Nom de la matière' : 'Nom du vernis'}
          onChange={(ev) => setName(ev.target.value)}
          onBlur={() => name.trim() && name.trim() !== e.name && set({ name: name.trim() })}
          onKeyDown={(ev) => {
            ev.stopPropagation();
            if (ev.key === 'Enter') ev.currentTarget.blur();
          }}
        />
        <small className="cd-kind">{users ? `${users} objet${users > 1 ? 's' : ''}` : 'aucun objet'}</small>
      </div>
      {kind === 'material' ? (
        <>
          <div className="mw-types">
            {MATERIAL_TYPES.map((t) => (
              <button key={t.id} className={t.id === type ? 'on' : ''} onClick={() => setType(t.id)}>
                {t.name}
              </button>
            ))}
          </div>
          <div className="md-grid">
            {MATERIAL_TYPES.find((t) => t.id === type)!.presets.map((p) => {
              const fx = presetFx(p, e.fx.id === p.fx ? e.fx : newFx(p.fx));
              return (
                <button key={p.name} className={`md-card ${e.name === p.name ? 'on' : ''}`} onClick={() => choose(fx, p.name)} title={`${p.name} : ${p.hint}`}>
                  <span className="sw shape-matter" style={{ background: matterSwatch(fx), backgroundSize: 'cover' }} />
                  <span>{p.name}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="md-grid">
          {FX.filter((d) => d.group === 'lumiere').map((d) => {
            const fx = e.fx.id === d.id ? e.fx : newFx(d.id);
            return (
              <button key={d.id} className={`md-card ${e.fx.id === d.id ? 'on' : ''}`} onClick={() => choose(fx, d.name)}>
                <span className="sw shape-varnish" style={{ background: varnishSwatch(fx) }} />
                <span>{d.name}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="md-knobs">
        {def.slots.map((sl, i) => (
          <Dots key={i} label={sl.label} value={slots[i]!} doc={doc} onPick={(g) => set({ fx: { ...e.fx, guides: slots.map((v, j) => (j === i ? g : v)) } })} />
        ))}
        <div className="md-dials">
          <Range label={def.amountLabel ?? 'Intensité'} unit={def.amountUnit} value={e.fx.amount} onChange={(v) => set({ fx: { ...e.fx, amount: Math.round(v * 100) / 100 } }, true)} />
          {def.knobs?.map((kn) => (
            <Range
              key={kn.key}
              label={kn.label}
              value={knobs[kn.key]!}
              display={kn.angle ? `${Math.round(knobs[kn.key]! * 180) % 180}°` : undefined}
              onChange={(v) => set({ fx: { ...e.fx, knobs: { ...knobs, [kn.key]: kn.angle ? Math.round(v * 36) / 36 : Math.round(v * 100) / 100 } } }, true)}
            />
          ))}
        </div>
      </div>
      <p className="md-note">
        {kind === 'material' ? 'La matière ne porte pas de couleur : chaque objet garde la sienne.' : 'Un seul vernis par objet.'} Glisse la pastille sur la corbeille pour la retirer de la palette.
      </p>
    </div>
  );
}
