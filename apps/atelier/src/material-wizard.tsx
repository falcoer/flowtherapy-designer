import { useEffect, useMemo, useRef, useState } from 'react';
import { fxPreview } from './App';
import { Attrs, choicesOf, itemsOf, removal, type Section } from './coupe';
import { fxOf, newFx } from './fx';
import { MATERIAL_TYPES, presetFx } from './material-presets';
import type { Format } from '@ftd/core';
import type { Doc, Layer } from './model';
import { addEntry, applyPatch, listOf, matterSwatch, varnishOf, varnishSwatch, type MatterKind } from './palettes';

type Tab = 'support' | 'coat' | 'depth' | 'edge';
const TABS: Array<[Tab, string]> = [
  ['support', 'Matière'],
  ['coat', 'Vernis'],
  ['depth', 'Volume'],
  ['edge', 'Bords'],
];
interface Card {
  id: string;
  name: string;
  hint?: string;
  patch: Partial<Layer>;
  on?: boolean;
}

/**
 * Assistant (baguette magique de l'outil multicouche) : tout l'objet se règle ici, section par section —
 * matière, vernis, volume, bords. On choisit sur des aperçus de l'objet, puis tous les réglages du choix
 * s'ouvrent dessous. Matières et vernis s'ajoutent aux palettes « Mes matières » et « Mes vernis ».
 * La boîte ne masque pas la page : on voit l'objet changer.
 */
export function MaterialWizard({
  layer: l,
  doc,
  f,
  patch,
  onDoc,
  onClose,
  onToast,
  start,
}: {
  /** Onglet ouvert d'emblée (l'emplacement touché dans les attributs). */
  start?: Tab;
  layer: Layer;
  doc: Doc;
  f: Format;
  patch: (p: Partial<Layer>, history?: boolean) => void;
  onDoc: (fn: (d: Doc) => Doc) => void;
  onClose: () => void;
  onToast: (msg: string, undoable?: boolean) => void;
}) {
  const tabs = TABS.filter(([t]) => l.kind !== 'surface' || t === 'support' || t === 'coat');
  const [tab, setTab] = useState<Tab>(start && tabs.some(([t]) => t === start) ? start : 'support');
  const startType = MATERIAL_TYPES.find((t) => t.presets.some((p) => p.name === l.material?.preset)) ?? MATERIAL_TYPES.find((t) => t.presets.some((p) => p.fx === l.material?.id)) ?? MATERIAL_TYPES[0]!;
  const [type, setType] = useState(startType.id);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  // les cartes de la section : l'objet avec ce choix appliqué
  const cards: Card[] = useMemo(() => {
    if (tab === 'support') {
      const base = (id: string) => (l.material?.id === id ? l.material : newFx(id as never));
      return MATERIAL_TYPES.find((t) => t.id === type)!.presets.map((p) => {
        const d = fxOf(p.fx)!;
        return {
          id: `p-${p.name}`,
          name: p.name,
          hint: p.hint,
          on: l.material?.preset === p.name,
          patch: { material: presetFx(p, base(p.fx)), ...(d.transparent && l.material?.id !== p.fx ? { opacity: d.transparent } : {}) },
        };
      });
    }
    const out: Card[] = choicesOf(l, tab, doc).map((c) => ({ id: c.id, name: c.name, patch: c.patch }));
    if (tab === 'coat' && varnishOf(l)) out.unshift({ id: 'none', name: 'Sans vernis', patch: { fx: (l.fx ?? []).filter((x) => fxOf(x.id)?.group !== 'lumiere') } });
    return out;
  }, [tab, type, l, doc]);

  // vignettes : une par tâche, après une pause dans les réglages (un potard qu'on tourne ne les relance pas à chaque pas)
  const thumbs = useRef(new Map<string, string>());
  const [, tick] = useState(0);
  const sig = JSON.stringify([tab, type, l.material, l.fx, l.volume, l.border, l.glow, l.trim, l.bevel, l.extrude, l.guide, l.w, l.h]);
  const lastSig = useRef(sig);
  if (lastSig.current !== sig) {
    lastSig.current = sig;
    thumbs.current = new Map();
  }
  useEffect(() => {
    let stop = false;
    let timer = 0;
    const todo = cards.slice();
    const step = () => {
      if (stop) return;
      const c = todo.shift();
      if (!c) return;
      if (!thumbs.current.has(c.id)) thumbs.current.set(c.id, fxPreview(l, doc, f, l.fx, `mw-${c.id}`, () => tick((n) => n + 1), c.patch));
      tick((n) => n + 1);
      timer = window.setTimeout(step, 0);
    };
    timer = window.setTimeout(step, 260);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const items = itemsOf(l, doc).filter((x) => x.sec === (tab as Section));
  const kind: MatterKind | null = tab === 'support' ? 'material' : tab === 'coat' ? 'varnish' : null;
  const mine = kind ? listOf(doc, kind) : [];
  const fx = kind === 'material' ? l.material : kind === 'varnish' ? varnishOf(l) : undefined;
  const entry = fx?.ref ? mine.find((x) => x.id === fx.ref) : undefined;
  const pick = (c: Card) => {
    patch(c.patch);
    onToast(`${c.name} sur « ${l.name} »`, true);
  };

  return (
    <div className="mw" role="dialog" aria-label="Assistant">
      <div className="mw-h">
        <span className="mw-wand">
          <WandGlyph />
        </span>
        <div>
          <b>Assistant</b>
          <small>« {l.name} » : choisis sur les aperçus, puis règle tout en dessous.</small>
        </div>
        <button className="mw-x" onClick={onClose} aria-label="Fermer">
          ×
        </button>
      </div>
      <div className="mw-tabs" role="tablist">
        {tabs.map(([t, name]) => (
          <button key={t} role="tab" aria-selected={t === tab} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>
            {name}
          </button>
        ))}
      </div>
      <div className="mw-body">
        {kind && (
          <div className="mw-mine">
            <span className="mw-lbl">{kind === 'material' ? 'Mes matières' : 'Mes vernis'}</span>
            <div className="mw-chips">
              {mine.map((e) => (
                <button
                  key={e.id}
                  className={`mw-chip ${fx?.ref === e.id ? 'on' : ''}`}
                  title={`Poser « ${e.name} »`}
                  onClick={() => {
                    patch(applyPatch(l, kind, e));
                    onToast(`« ${l.name} » prend « ${e.name} »`, true);
                  }}
                >
                  <span className={`sw ${kind === 'material' ? 'shape-matter' : 'shape-varnish'}`} style={{ background: kind === 'material' ? matterSwatch(e.fx) : varnishSwatch(e.fx), backgroundSize: 'cover' }} />
                  {e.name}
                </button>
              ))}
              {fx && !entry && (
                <button
                  className="mw-chip add"
                  onClick={() => {
                    const name = fx.preset ?? fxOf(fx.id)?.name ?? 'Réglage';
                    onDoc((d) => addEntry(d, l.id, kind, name));
                    onToast(`« ${name} » ajouté à ${kind === 'material' ? 'Mes matières' : 'Mes vernis'}`);
                  }}
                  title="Garder ce réglage dans la palette : il se pose ensuite d'un geste sur d'autres objets"
                >
                  ＋ Ajouter à la palette
                </button>
              )}
            </div>
            {entry && (
              <small className="mw-linked">
                Lié à « {entry.name} » : les réglages ci-dessous changent tous les objets qui le portent.{' '}
                <button className="mw-unlink" onClick={() => patch(kind === 'material' ? { material: { ...l.material!, ref: undefined } } : { fx: (l.fx ?? []).map((x) => (x === fx ? { ...x, ref: undefined } : x)) })}>
                  Délier cet objet
                </button>
              </small>
            )}
          </div>
        )}
        {tab === 'support' && (
          <div className="mw-types">
            {MATERIAL_TYPES.map((t) => (
              <button key={t.id} className={t.id === type ? 'on' : ''} onClick={() => setType(t.id)}>
                {t.name}
              </button>
            ))}
          </div>
        )}
        {cards.length > 0 && (
          <div className="mw-grid">
            {cards.map((c) => {
              const src = thumbs.current.get(c.id);
              return (
                <button key={c.id} className={`mw-card ${c.on ? 'on' : ''}`} onClick={() => pick(c)} title={c.hint ? `${c.name} : ${c.hint}` : c.name}>
                  <span className="mw-sw" style={src ? { backgroundImage: `url(${src})` } : undefined} />
                  <span className="mw-nm">{c.name}</span>
                  {c.hint && <span className="mw-hint">{c.hint}</span>}
                </button>
              );
            })}
          </div>
        )}
        {items.map((it) => (
          <div key={it.key} className="mw-attrs">
            {it.removable && (
              <button className="mw-rm" onClick={() => patch(removal(l, it.key))} aria-label={`Retirer ${it.name}`} title={`Retirer ${it.name}`}>
                ×
              </button>
            )}
            <Attrs layer={l} doc={doc} item={it} patch={patch} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function WandGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 20 14.5 9.5M13 8l3 3M17 3v3M15.5 4.5h3M20.5 9v2M19.5 10h2M10 3v2M9 4h2" />
    </svg>
  );
}
