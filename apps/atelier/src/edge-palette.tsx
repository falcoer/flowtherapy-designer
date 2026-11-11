import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BORDER_TYPES, GLOW_TYPES } from './App';
import { Attrs, type Item } from './coupe';
import { guideColor, type Doc, type Layer, type PaletteEdge } from './model';
import { borderDefaults } from './targets';

/**
 * Palette de bords (« Mes bords ») : un bord, une lueur ou un rognage nommé, avec tous ses réglages.
 * Une entrée se dépose sur un objet (ou sur un emplacement de l'onglet Bord des attributs) : elle y remplit
 * l'emplacement de sa sorte. Contrairement aux matières, l'objet en reçoit une copie (pas de lien).
 */
export type EdgeKind = 'border' | 'glow' | 'trim';
/** Les trois emplacements de bord d'un objet, de l'intérieur vers l'extérieur. */
export const EDGE_SLOTS: Array<[EdgeKind, string]> = [
  ['trim', 'Rognage'],
  ['border', 'Bord'],
  ['glow', 'Lueur'],
];
export const edgeKind = (e: Pick<PaletteEdge, 'border' | 'glow'>): EdgeKind => (e.border ? 'border' : e.glow ? 'glow' : 'trim');
/** Ce qu'on change sur l'objet pour lui poser l'entrée. */
export const edgePatch = (e: PaletteEdge): Partial<Layer> => {
  const k = edgeKind(e);
  return { [k]: e[k] } as Partial<Layer>;
};
/** Nom par défaut d'un réglage de bord. */
export function edgeName(k: EdgeKind, e: Pick<Layer, 'border' | 'glow'>) {
  if (k === 'border' && e.border) return BORDER_TYPES.find((x) => x[0] === e.border!.style)?.[1] ?? 'Bord';
  if (k === 'glow' && e.glow) return GLOW_TYPES.find((x) => x[0] === e.glow!.style)?.[1] ?? 'Lueur';
  return 'Rognage';
}
/** Réglage de départ de chaque sorte. */
export function edgeFresh(k: EdgeKind, doc: Doc): Pick<PaletteEdge, 'border' | 'glow' | 'trim'> {
  if (k === 'border') return { border: { style: 'round', ...borderDefaults('round', undefined, doc.guides), width: 0.012 } };
  if (k === 'glow') return { glow: { style: 'neon', guide: 3 < doc.guides.length ? 3 : 0, distance: 0.1, width: 0.4 } };
  return { trim: { blur: 0.25, float: 0.3, zigzag: 0 } };
}
const uid = () => `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Pastille carrée d'un bord : un objet gris clair et son bord, sa lueur ou son rognage, dans ses couleurs. */
export function EdgeGlyph({ edge: e, doc, size = 32 }: { edge: Pick<PaletteEdge, 'border' | 'glow' | 'trim'>; doc: Doc; size?: number }) {
  const id = useId().replace(/:/g, '');
  const col = (i: number) => guideColor(doc.guides[i], 0.5);
  const body = '#d9d4e2';
  const k = edgeKind(e);
  let art: React.ReactNode = null;
  if (k === 'border' && e.border) {
    const b = e.border;
    const w = 1.2 + Math.min(1, Math.sqrt(Math.max(0, b.width - 0.002) / 0.198)) * 5;
    const c = col(b.guide);
    if (b.style === 'double')
      art = (
        <>
          <rect x="5" y="5" width="22" height="22" rx="5" fill={body} stroke={col(b.guide2 ?? 1)} strokeWidth={w} />
          <rect x={5 + w} y={5 + w} width={22 - 2 * w} height={22 - 2 * w} rx="3" fill={body} stroke={c} strokeWidth={w * 0.8} />
        </>
      );
    else if (b.style === 'torn') art = <path d="M5 6l4 1 3-1 4 2 3-2 4 1 3 0-1 4 1 3-1 4 1 3-1 4-3 0-4 1-3-1-4 1-3-1-4 1 1-4-1-3 1-4-1-3 1-4z" fill={body} stroke={c} strokeWidth={w} strokeLinejoin="round" />;
    else if (b.style === 'burst') art = <path d="M16 2l3 7 7-3-3 7 7 3-7 3 3 7-7-3-3 7-3-7-7 3 3-7-7-3 7-3-3-7 7 3z" fill={body} stroke={c} strokeWidth={w * 0.7} strokeLinejoin="round" />;
    else if (b.style === 'stamp')
      art = (
        <>
          <rect x="5" y="5" width="22" height="22" fill={c} />
          <rect x="5" y="5" width="22" height="22" fill="none" stroke="var(--chrome-solid, #fff)" strokeWidth="2.2" strokeDasharray="0.1 3.2" strokeLinecap="round" />
          <rect x={5 + w} y={5 + w} width={22 - 2 * w} height={22 - 2 * w} fill={body} />
        </>
      );
    else art = <rect x="5" y="5" width="22" height="22" rx={b.style === 'round' ? 6 : 0} fill={body} stroke={c} strokeWidth={w} />;
  } else if (k === 'glow' && e.glow) {
    const g = e.glow;
    art = (
      <>
        <defs>
          <filter id={`gl${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={1.2 + g.width * 2.5} />
          </filter>
        </defs>
        <rect x="7" y="7" width="18" height="18" rx="4" fill="none" stroke={col(g.guide)} strokeWidth={3 + g.width * 3} filter={`url(#gl${id})`} />
        <rect x="9" y="9" width="14" height="14" rx="3" fill={body} />
      </>
    );
  } else if (e.trim) {
    const t = e.trim;
    const n = 6;
    const a = t.zigzag > 0.01 ? 1 + t.zigzag * 2.5 : 0;
    let d = 'M6 6';
    for (let i = 1; i <= n; i++) d += `L${6 + (20 * (i - 0.5)) / n} ${6 + (i % 2 ? a : 0)}L${6 + (20 * i) / n} 6`;
    d += 'L26 26L6 26Z';
    art = (
      <>
        <defs>
          <filter id={`tr${id}`}>
            <feGaussianBlur stdDeviation={t.blur * 1.6} />
          </filter>
        </defs>
        <path d={d} fill={body} stroke="#8a849a" strokeWidth="0.8" filter={t.blur > 0.02 ? `url(#tr${id})` : undefined} transform={`rotate(${t.float * 8} 16 16)`} />
      </>
    );
  }
  return (
    <svg className="edge-glyph" width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      {art}
    </svg>
  );
}

/** La corbeille de la barre du haut, sous ce point ? (une marge pour le doigt) */
function overTrash(x: number, y: number): HTMLElement | null {
  const el = document.querySelector<HTMLElement>('.btn.trash');
  const r = el?.getBoundingClientRect();
  return r && x > r.left - 14 && x < r.right + 14 && y > r.top - 14 && y < r.bottom + 14 ? el! : null;
}
/** Un emplacement de bord des attributs sous ce point (data-drop="edge-<sorte>"). */
const slotAt = (x: number, y: number) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-drop^="edge-"]') ?? null;

/**
 * Onglet « Bords » du volet Palette. Toucher une pastille la pose sur l'objet choisi, la glisser la pose sur
 * l'objet visé (ou sur un emplacement de l'onglet Bord des attributs). Modifier actif : toucher ouvre sa boîte,
 * ＋ en ajoute une (le bord de l'objet choisi, s'il en a un), la glisser sur la corbeille la retire.
 */
export function EdgeRow({
  doc,
  edit,
  sel,
  onDoc,
  onDocLive,
  onToast,
  targetAt,
}: {
  doc: Doc;
  edit: boolean;
  sel?: Layer;
  onDoc: (f: (d: Doc) => Doc) => void;
  onDocLive: (f: (d: Doc) => Doc) => void;
  onToast: (msg: string, undoable?: boolean) => void;
  targetAt: (x: number, y: number) => Layer | undefined;
}) {
  const list = doc.edges ?? [];
  const [ghost, setGhost] = useState<{ x: number; y: number; e: PaletteEdge } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  useEffect(() => {
    if (!edit) setEditing(null);
  }, [edit]);
  const drag = useRef<{ id: string; x: number; y: number; on: boolean } | null>(null);
  const hot = useRef<HTMLElement | null>(null);
  const heat = (el: HTMLElement | null) => {
    if (hot.current === el) return;
    hot.current?.classList.remove('hot', 'armed');
    el?.classList.add('hot', 'armed');
    hot.current = el;
  };
  const put = (l: Layer | undefined, e: PaletteEdge) => {
    if (!l) return;
    if (l.kind === 'surface') return onToast('La surface de fond n’a pas de bord');
    onDoc((d) => ({ ...d, layers: d.layers.map((x) => (x.id === l.id ? { ...x, ...edgePatch(e) } : x)) }));
    onToast(`« ${l.name} » prend ${{ border: 'le bord', glow: 'la lueur', trim: 'le rognage' }[edgeKind(e)]} « ${e.name} »`, true);
  };
  const add = () => {
    // le premier bord de l'objet choisi qui n'est pas déjà dans la palette, sinon un bord arrondi
    const same = (k: EdgeKind, v: unknown) => list.some((x) => JSON.stringify(x[k]) === JSON.stringify(v));
    const k = sel && sel.kind !== 'surface' ? (['border', 'glow', 'trim'] as const).find((k) => sel[k] && !same(k, sel[k])) : undefined;
    const spec = k && sel ? { [k]: sel[k] } : edgeFresh('border', doc);
    const kind = edgeKind(spec);
    const e: PaletteEdge = { id: uid(), name: edgeName(kind, spec), ...spec };
    onDoc((d) => ({ ...d, edges: [...(d.edges ?? []), e] }));
    setEditing(e.id);
  };
  const ed = editing ? list.find((x) => x.id === editing) : undefined;
  return (
    <section className="pal-sec matter edges">
      {list.length === 0 && !edit && <p className="pal-hint">Aucun bord : touche Modifier pour en ajouter.</p>}
      <div className="guides">
        {list.map((e) => (
          <div
            key={e.id}
            role="button"
            tabIndex={0}
            className="guide edge-chip"
            title={edit ? `${e.name} : touche pour le modifier, glisse-le sur la corbeille pour le retirer` : `${e.name} : touche pour le poser sur l’objet choisi, ou glisse-le sur un objet`}
            onPointerDown={(ev) => {
              (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
              drag.current = { id: e.id, x: ev.clientX, y: ev.clientY, on: false };
            }}
            onPointerMove={(ev) => {
              const d = drag.current;
              if (!d) return;
              if (!d.on && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 8) d.on = true;
              if (!d.on) return;
              setGhost({ x: ev.clientX, y: ev.clientY, e });
              heat(edit ? overTrash(ev.clientX, ev.clientY) : slotAt(ev.clientX, ev.clientY));
            }}
            onPointerUp={(ev) => {
              const d = drag.current;
              drag.current = null;
              setGhost(null);
              heat(null);
              if (!d) return;
              if (d.on) {
                if (edit && overTrash(ev.clientX, ev.clientY)) {
                  onDoc((x) => ({ ...x, edges: (x.edges ?? []).filter((y) => y.id !== e.id) }));
                  if (editing === e.id) setEditing(null);
                  onToast(`« ${e.name} » retiré de la palette`, true);
                  return;
                }
                return put(targetAt(ev.clientX, ev.clientY), e);
              }
              if (edit) return setEditing(e.id);
              if (sel) put(sel, e);
            }}
            onPointerCancel={() => {
              drag.current = null;
              setGhost(null);
              heat(null);
            }}
          >
            <span className="sw shape-edge">
              <EdgeGlyph edge={e} doc={doc} />
            </span>
          </div>
        ))}
        {edit && (
          <button className="guide add edge-add" onClick={add} title="Nouveau bord (celui de l’objet choisi, s’il en a un)">
            <span className="sw plus shape-edge">＋</span>
          </button>
        )}
      </div>
      {ed && createPortal(<EdgeDialog doc={doc} entry={ed} onDoc={onDoc} onDocLive={onDocLive} onClose={() => setEditing(null)} />, document.body)}
      {ghost &&
        createPortal(
          <span className="drag-dot edge-dot" style={{ left: ghost.x, top: ghost.y }}>
            <EdgeGlyph edge={ghost.e} doc={doc} size={34} />
          </span>,
          document.body,
        )}
    </section>
  );
}

/** Boîte d'un bord de la palette : son nom, sa sorte (bord, lueur, rognage), son style et tous ses réglages. */
export function EdgeDialog({ doc, entry: e, onDoc, onDocLive, onClose }: { doc: Doc; entry: PaletteEdge; onDoc: (f: (d: Doc) => Doc) => void; onDocLive: (f: (d: Doc) => Doc) => void; onClose: () => void }) {
  const step = useRef(0);
  const set = (next: Partial<PaletteEdge>, live = false) => {
    const now = performance.now();
    const fresh = !live || now - step.current > 700;
    step.current = live ? now : 0;
    (fresh ? onDoc : onDocLive)((d) => ({ ...d, edges: (d.edges ?? []).map((x) => (x.id === e.id ? { ...x, ...next } : x)) }));
  };
  const [name, setName] = useState(e.name);
  useEffect(() => setName(e.name), [e.id, e.name]);
  useEffect(() => {
    const key = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const k = edgeKind(e);
  // le nom suit le style tant qu'il est celui d'un style tout fait
  const auto = (n: string) => n === 'Rognage' || n === 'Bord' || n === 'Lueur' || BORDER_TYPES.some((x) => x[1] === n) || GLOW_TYPES.some((x) => x[1] === n);
  const choose = (spec: Pick<PaletteEdge, 'border' | 'glow' | 'trim'>) => {
    const kk = edgeKind(spec);
    set({ border: undefined, glow: undefined, trim: undefined, ...spec, ...(auto(e.name) ? { name: edgeName(kk, spec) } : {}) });
  };
  // les réglages : ceux des attributs, posés sur un objet fictif qui ne porte que ce bord
  const fake = { id: 'edge', name: e.name, kind: 'shape', guide: 0, strokes: [], border: e.border, glow: e.glow, trim: e.trim } as unknown as Layer;
  const item: Item = { sec: 'edge', key: k, name: e.name, bg: '', removable: false };
  return (
    <div className="color-dialog matter-dialog edge-dialog" role="dialog" aria-label={`Bord ${e.name}`}>
      <button className="lamp-close cd-close" onClick={onClose} aria-label="Fermer">
        ×
      </button>
      <div className="cd-head">
        <span className="cd-sw shape-edge">
          <EdgeGlyph edge={e} doc={doc} size={40} />
        </span>
        <input
          className="gname-input"
          value={name}
          aria-label="Nom du bord"
          onChange={(ev) => setName(ev.target.value)}
          onBlur={() => name.trim() && name.trim() !== e.name && set({ name: name.trim() })}
          onKeyDown={(ev) => {
            ev.stopPropagation();
            if (ev.key === 'Enter') ev.currentTarget.blur();
          }}
        />
      </div>
      <div className="mw-types">
        {EDGE_SLOTS.map(([kk, nm]) => (
          <button key={kk} className={kk === k ? 'on' : ''} onClick={() => kk !== k && choose(edgeFresh(kk, doc))}>
            {nm}
          </button>
        ))}
      </div>
      {k !== 'trim' && (
        <div className="md-grid">
          {(k === 'border' ? BORDER_TYPES : GLOW_TYPES)
            .filter((x) => x[0])
            .map(([st, nm, hint]) => {
              const spec =
                k === 'border'
                  ? { border: { ...e.border!, style: st as NonNullable<Layer['border']>['style'], ...borderDefaults(st!, e.border, doc.guides) } }
                  : { glow: { ...e.glow!, style: st as NonNullable<Layer['glow']>['style'] } };
              const on = k === 'border' ? e.border?.style === st : e.glow?.style === st;
              return (
                <button key={st} className={`md-card ${on ? 'on' : ''}`} onClick={() => choose(spec)} title={`${nm} : ${hint}`}>
                  <span className="sw shape-edge">
                    <EdgeGlyph edge={spec} doc={doc} size={38} />
                  </span>
                  <span>{nm}</span>
                </button>
              );
            })}
        </div>
      )}
      <div className="md-knobs">
        <Attrs bare layer={fake} doc={doc} item={item} patch={(p, h) => set(p as Partial<PaletteEdge>, h === false)} />
      </div>
      <p className="md-note">Déposé sur un objet, il remplit l’emplacement « {EDGE_SLOTS.find((x) => x[0] === k)![1]} » de l’onglet Bord. Glisse la pastille sur la corbeille pour la retirer de la palette.</p>
    </div>
  );
}
