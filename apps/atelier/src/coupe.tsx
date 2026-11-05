import type { Format } from '@ftd/core';
import { useEffect, useMemo, useState } from 'react';
import { BORDER_TYPES, fxPreview, GLOW_TYPES, swatch } from './App';
import { FX, fxGuides, fxOf, MATERIALS, newFx, type Fx, type FxGroup, type FxId } from './fx';
import { Icon } from './icons';
import { lookGuides, lookOf, LOOKS, type LookId, type LookSettings } from './looks';
import type { Doc, Layer } from './model';

/**
 * Coupe de l'objet : ses couches lues comme l'objet posé, du dessus au dessous.
 * Bords tout autour, vernis par-dessus, image (et son filtre) avec les transformations
 * en parallèle, support (la matière) dessous. Un aperçu éclaté montre chaque couche rendue.
 */
export type Section = 'edge' | 'coat' | 'image' | 'transform' | 'support';

interface Item {
  sec: Section;
  /** border, bevel, glow, look, draw, paint, material, fx:<index dans l.fx> */
  key: string;
  name: string;
  bg: string;
  removable: boolean;
}

const groupOf = (x: Fx) => fxOf(x.id)?.group;

/** Ce que fait chaque choix, en quelques mots, et sa famille dans la liste. */
const HINTS: Record<string, [string, string]> = {
  mono: ['Couleur', 'une seule teinte de la palette'],
  bw: ['Couleur', 'noir et blanc franc, grain'],
  duotone: ['Couleur', 'ombres et lumières en deux teintes'],
  tritone: ['Couleur', 'trois teintes, des ombres aux lumières'],
  vintage: ['Pellicule', 'tons jaunis, contraste doux'],
  polaroid: ['Pellicule', 'instantané délavé, blancs crème'],
  kodachrome: ['Pellicule', 'couleurs denses, rouges profonds'],
  chrome: ['Pellicule', 'couleurs retenues, ciels froids'],
  cross: ['Pellicule', 'couleurs décalées, vert et magenta'],
  bleach: ['Pellicule', 'désaturé, très contrasté, métallique'],
  matte: ['Pellicule', 'noirs levés, image voilée'],
  pastel: ['Lumière', 'tons clairs et tendres'],
  highkey: ['Lumière', 'très lumineux, ombres effacées'],
  lowkey: ['Lumière', 'très sombre, lumières isolées'],
  hdr: ['Lumière', 'détails poussés partout'],
  golden: ['Lumière', 'soleil bas, chaud et doré'],
  moody: ['Lumière', 'sombre, désaturé, dramatique'],
  cold: ['Ambiance', 'bleuté, froid'],
  warm: ['Ambiance', 'orangé, chaleureux'],
  cyber: ['Ambiance', 'néons cyan et magenta, nuit'],
  synth: ['Ambiance', 'violet et rose années 80'],
  cartoon: ['Dessin', 'aplats et contours noirs'],
  manga: ['Dessin', 'encre noire, trames, hachures'],
  sketch: ['Dessin', 'traits au crayon sur papier'],
  pencil: ['Dessin', 'crayon, ombres en dégradé de palette'],
  halftone: ['', 'points d’imprimerie, comme une affiche'],
  riso: ['', 'deux encres décalées, grain d’impression'],
  posterize: ['', 'quelques aplats de couleur'],
  gradmap: ['', 'les clairs et sombres repeints en dégradé'],
  gloss: ['', 'reflet de vernis côté lumière'],
  satin: ['', 'lueur douce, sans éclat'],
  'matte-varnish': ['', 'voile poudré, aucun reflet'],
  liquid: ['', 'couche épaisse et fraîche, surface qui ondule'],
  glazed: ['', 'lisse comme un glaçage, reflets nets'],
  glacis: ['', 'couche transparente teintée, densité réglable'],
  grain: ['', 'grain fin de papier'],
  kraft: ['', 'papier brun à fibres'],
  watercolor: ['', 'papier épais, grain marqué'],
  corrugated: ['', 'ondulations de carton'],
  newsprint: ['', 'papier gris, fibres et taches'],
  canvas: ['', 'tissage de toile'],
  wood: ['', 'veines de bois'],
  metal: ['', 'métal brossé, reflets en lignes'],
  felt: ['', 'feutre doux et duveteux'],
  glass: ['', 'transparent, reflets nets'],
  plexi: ['', 'transparent, couleur franche'],
  ice: ['', 'givrée, fêlures'],
  smoke: ['', 'volutes, on voit à travers'],
  hologram: ['', 'irisé, lignes de balayage'],
};
const fxIn = (l: Layer, g: FxGroup) => (l.fx ?? []).map((x, i) => ({ x, i })).filter(({ x }) => groupOf(x) === g);

function itemsOf(l: Layer, doc: Doc): Item[] {
  const out: Item[] = [];
  const g = (i: number) => swatch(doc.guides[i]);
  if (l.kind !== 'surface') {
    if (l.border) out.push({ sec: 'edge', key: 'border', name: BORDER_TYPES.find((x) => x[0] === l.border!.style)![1], bg: g(l.border.guide), removable: true });
    if ((l.bevel ?? 0) > 0.001) out.push({ sec: 'edge', key: 'bevel', name: 'Biseau', bg: 'linear-gradient(135deg,#fff,#8a849a)', removable: true });
    if (l.glow) out.push({ sec: 'edge', key: 'glow', name: GLOW_TYPES.find((x) => x[0] === l.glow!.style)![1], bg: `radial-gradient(circle, #fff 20%, ${swatch(doc.guides[l.glow.guide])} 60%)`, removable: true });
  }
  for (const { x, i } of fxIn(l, 'lumiere')) out.push({ sec: 'coat', key: `fx:${i}`, name: fxOf(x.id)!.name, bg: 'linear-gradient(135deg,#fff,#c9c3d6)', removable: true });
  if (l.kind === 'photo') {
    if (l.look?.style) out.push({ sec: 'image', key: 'look', name: lookOf(l.look.style)!.name, bg: 'linear-gradient(135deg,#2b3a8c,#9b4f9e,#ee6b5b)', removable: true });
  } else out.push({ sec: 'image', key: 'paint', name: doc.guides[l.guide]?.name ?? 'Couleur', bg: g(l.guide), removable: false });
  for (const { x, i } of fxIn(l, 'effet')) out.push({ sec: 'transform', key: `fx:${i}`, name: fxOf(x.id)!.name, bg: 'radial-gradient(circle,#1c1b3a 30%,#e3a83c 34%) 0 0/6px 6px', removable: true });
  if (l.material) out.push({ sec: 'support', key: 'material', name: fxOf(l.material.id)!.name, bg: 'repeating-linear-gradient(45deg,#c79a63 0 3px,#b0814d 3px 6px)', removable: true });
  return out;
}

/** Ce qu'on retire quand on touche la croix d'un élément. */
function removal(l: Layer, key: string): Partial<Layer> {
  if (key === 'border') return { border: undefined };
  if (key === 'bevel') return { bevel: 0 };
  if (key === 'glow') return { glow: undefined };
  if (key === 'material') return { material: undefined };
  if (key === 'look' || key === 'draw') {
    const look = { ...(l.look ?? { guides: [], mix: 1 }) } as LookSettings;
    if (key === 'look') {
      look.style = undefined;
      look.guides = [];
    } else look.draw = undefined;
    return { look: look.style || look.draw ? look : undefined };
  }
  const i = Number(key.slice(3));
  const fx = (l.fx ?? []).filter((_, j) => j !== i);
  return { fx: fx.length ? fx : undefined };
}

/** Ce qu'on peut ajouter dans chaque section, avec la retouche qui l'applique. */
function choicesOf(l: Layer, sec: Section): Array<{ id: string; name: string; patch: Partial<Layer>; focus: string }> {
  const fxAdd = (g: FxGroup) =>
    FX.filter((d) => d.group === g && !(l.fx ?? []).some((x) => x.id === d.id)).map((d) => ({
      id: d.id,
      name: d.name,
      patch: { fx: [...(l.fx ?? []), newFx(d.id)] },
      focus: `fx:${(l.fx ?? []).length}`,
    }));
  if (sec === 'edge')
    return [
      ...BORDER_TYPES.filter((x) => x[0] && x[0] !== l.border?.style).map(([st, name]) => ({
        id: `b-${st}`,
        name,
        patch: { border: { style: st!, guide: l.border?.guide ?? 0, guide2: l.border?.guide2 ?? 1, width: l.border?.width ?? 0.012 } },
        focus: 'border',
      })),
      ...((l.bevel ?? 0) > 0.001 ? [] : [{ id: 'bevel', name: 'Biseau', patch: { bevel: 0.5 }, focus: 'bevel' }]),
      ...GLOW_TYPES.filter((x) => x[0] && x[0] !== l.glow?.style).map(([st, name]) => ({
        id: `g-${st}`,
        name,
        patch: { glow: { style: st!, guide: l.glow?.guide ?? 3, distance: l.glow?.distance ?? 0.1, width: l.glow?.width ?? 0.4 } },
        focus: 'glow',
      })),
    ];
  if (sec === 'coat') return fxAdd('lumiere');
  if (sec === 'transform') return fxAdd('effet');
  if (sec === 'support')
    return MATERIALS()
      .filter((d) => d.id !== l.material?.id && !(d.transparent && l.kind === 'surface'))
      .map((d) => ({ id: d.id, name: d.name, patch: { material: newFx(d.id), ...(d.transparent ? { opacity: d.transparent } : {}) }, focus: 'material' }));
  if (l.kind !== 'photo') return [];
  const look = l.look ?? { guides: [], mix: 1 };
  return [
    ...LOOKS.filter((d) => d.id !== look.style).map((d) => ({
      id: d.id,
      name: d.name,
      patch: { look: { ...look, style: d.id as LookId, guides: d.slots.map((x) => x.def), mix: look.mix ?? 1 } },
      focus: 'look',
    })),
  ];
}

const SECTIONS: Array<{ sec: Section; name: string; role: string; empty: string; slab: string }> = [
  { sec: 'edge', name: 'Bords', role: 'tout autour', empty: 'Aucun', slab: 's-edge' },
  { sec: 'coat', name: 'Vernis', role: 'par-dessus', empty: 'Aucun', slab: 's-coat' },
  { sec: 'image', name: 'Image', role: 'et son filtre', empty: 'Originale', slab: 's-image' },
  { sec: 'transform', name: 'Transformations', role: 'en parallèle', empty: 'Aucune', slab: 's-fx' },
  { sec: 'support', name: 'Support', role: 'la matière', empty: 'Papier', slab: 's-support' },
];

/** Couches de l'aperçu éclaté, de la plus basse à la plus haute. */
function pliesOf(l: Layer): Array<{ id: string; name: string; sec: Section; patch: Partial<Layer> }> {
  const bare = { border: undefined, glow: undefined, bevel: 0 } as Partial<Layer>;
  const effects = (l.fx ?? []).filter((x) => groupOf(x) === 'effet');
  const coat = (l.fx ?? []).filter((x) => groupOf(x) === 'lumiere');
  const out: Array<{ id: string; name: string; sec: Section; patch: Partial<Layer> }> = [
    {
      id: 'support',
      name: l.material ? fxOf(l.material.id)!.name : 'Support',
      sec: 'support',
      patch: { ...bare, kind: l.kind === 'photo' ? 'support' : l.kind, src: undefined, look: undefined, fx: undefined, strokes: [], guide: l.kind === 'photo' ? 0 : l.guide },
    },
    { id: 'image', name: l.kind === 'photo' ? 'Image' : 'Peinture', sec: 'image', patch: { ...bare, material: undefined, fx: undefined } },
  ];
  if (effects.length) out.push({ id: 'transform', name: 'Transformations', sec: 'transform', patch: { ...bare, material: undefined, fx: effects } });
  if (coat.length) out.push({ id: 'coat', name: 'Vernis', sec: 'coat', patch: { border: undefined, glow: undefined } });
  out.push({ id: 'result', name: 'Résultat', sec: 'edge', patch: {} });
  return out;
}

export function CoupePanel({
  layer: l,
  doc,
  f,
  patch,
  onClose,
  onToast,
}: {
  layer: Layer;
  doc: Doc;
  f: Format;
  patch: (p: Partial<Layer>, history?: boolean) => void;
  onClose: () => void;
  onToast: (msg: string, undoable?: boolean) => void;
}) {
  const [focus, setFocus] = useState<string | null>(null);
  const [adding, setAdding] = useState<Section | null>(null);
  const [tick, bump] = useState(0);
  const items = itemsOf(l, doc);
  const reload = () => bump((n) => n + 1);

  // aperçu éclaté, recalculé un instant après le dernier réglage (le geste reste fluide)
  const [plies, setPlies] = useState<Array<{ id: string; name: string; sec: Section; src: string }>>([]);
  // aperçu optionnel : choix gardé d'une ouverture à l'autre
  const [exploded, setExploded] = useState(() => {
    try {
      return localStorage.getItem('ftd-atelier-plies') !== 'off';
    } catch {
      return true;
    }
  });
  const toggleExploded = () => {
    setExploded((v) => {
      try {
        localStorage.setItem('ftd-atelier-plies', v ? 'off' : 'on');
      } catch {
        /* stockage indisponible */
      }
      return !v;
    });
  };
  useEffect(() => {
    if (!exploded) return;
    const t = setTimeout(() => setPlies(pliesOf(l).map((p) => ({ ...p, src: fxPreview(l, doc, f, l.fx, `ply-${p.id}`, reload, p.patch) }))), 140);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [l, doc.guides, doc.light, doc.lamp, f, tick, exploded]);

  // vignettes des choix de la section ouverte : l'objet avec ce choix appliqué
  const choices = adding ? choicesOf(l, adding) : [];
  const hintOf = (id: string) => HINTS[id] ?? HINTS[id.replace(/^[bg]-/, '')] ?? ['', ''];
  const edgeGroup = (id: string) => (id.startsWith('b-') ? 'Bord' : id.startsWith('g-') ? 'Lueur' : 'Relief');
  const thumbs = useMemo(() => {
    const out: Record<string, string> = {};
    for (const c of choices) out[c.id] = fxPreview(l, doc, f, l.fx, `add-${c.id}`, reload, c.patch);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adding, l, doc.guides, doc.light, doc.lamp, f, tick]);

  const sections = SECTIONS.filter((s) => (l.kind === 'surface' ? s.sec !== 'edge' && s.sec !== 'image' : true));
  const card = (s: (typeof SECTIONS)[number]) => {
    const mine = items.filter((x) => x.sec === s.sec);
    const can = choicesOf(l, s.sec).length > 0;
    return (
      <div key={s.sec} className={`cp-card ${adding === s.sec ? 'open' : ''}`}>
        <div className="cp-h">
          <span className={`slab ${s.slab}`} />
          <span className="cn">{s.name}</span>
          {can && (
            <button className="cp-add" onClick={() => setAdding(adding === s.sec ? null : s.sec)} title={`Ajouter : ${s.name}`} aria-label={`Ajouter : ${s.name}`}>
              <Icon name="plus" />
            </button>
          )}
        </div>
        <div className="cp-items">
          {mine.length ? (
            mine.map((it) => (
              <span key={it.key} className={`cp-item ${focus === it.key ? 'on' : ''}`}>
                <button className="cp-nm" onClick={() => setFocus(focus === it.key ? null : it.key)}>
                  <span className="sw" style={{ background: it.bg }} />
                  <span className="nm">{it.name}</span>
                </button>
                {it.removable && (
                  <button
                    className="x"
                    title={`Retirer ${it.name}`}
                    aria-label={`Retirer ${it.name}`}
                    onClick={() => {
                      patch(removal(l, it.key));
                      if (focus === it.key || focus?.startsWith('fx:')) setFocus(null);
                      onToast(`${it.name} retiré`, true);
                    }}
                  >
                    ×
                  </button>
                )}
              </span>
            ))
          ) : (
            <span className="cp-empty">{s.empty}</span>
          )}
        </div>
        {adding === s.sec && (
          <div className="cp-pick-wrap">
            {(() => {
              const list = choicesOf(l, s.sec);
              const groups: string[] = [];
              const fam = (id: string) => (s.sec === 'edge' ? edgeGroup(id) : hintOf(id)[0]);
              for (const c of list) if (!groups.includes(fam(c.id))) groups.push(fam(c.id));
              return groups.map((gname) => (
                <div key={gname || 'all'}>
                  {gname && <div className="cp-fam">{gname}</div>}
                  <div className="cp-pick">
                    {list
                      .filter((c) => fam(c.id) === gname)
                      .map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            patch(c.patch);
                            setFocus(c.focus);
                            setAdding(null);
                          }}
                        >
                          <span className="thumb">{thumbs[c.id] && <img src={thumbs[c.id]} alt="" />}</span>
                          <b>{c.name}</b>
                          {hintOf(c.id)[1] && <small>{hintOf(c.id)[1]}</small>}
                        </button>
                      ))}
                  </div>
                </div>
              ));
            })()}
          </div>
        )}
      </div>
    );
  };
  const byKey = (k: Section) => sections.find((s) => s.sec === k);
  const focused = items.find((x) => x.key === focus);
  return (
    <aside className="coupe" aria-label={`Coupe de « ${l.name} »`}>
      <div className="cp-head">
        <div className="cp-title">
          <b>{l.name}</b>
          <small>
            {l.kind === 'photo' ? 'Photo' : l.kind === 'surface' ? 'Surface de fond' : 'Forme'} · {items.filter((x) => x.removable).length} élément{items.filter((x) => x.removable).length > 1 ? 's' : ''}
          </small>
        </div>
        <button className={`cp-bench cp-toggle ${exploded ? 'on' : ''}`} onClick={toggleExploded} aria-pressed={exploded} title="Afficher ou masquer l'aperçu éclaté des couches de l'objet">
          Aperçu
        </button>
        <button className="cp-bench" disabled title="Établi : préparer l'objet en plein écran et l'enregistrer dans la bibliothèque (bientôt)">
          Établi
        </button>
        <button className="cp-close" onClick={onClose} aria-label="Fermer">
          ×
        </button>
      </div>
      <div className="cp-scroll">
        {exploded && (
          <div className="plies" aria-hidden>
            <div className="plies-3d">
              {plies.map((p, k) => (
                <button key={p.id} className="ply" style={{ transform: `translate(-50%, -50%) translateZ(${k * Math.min(26, 96 / Math.max(1, plies.length - 1))}px)` }} onClick={() => setAdding(null)}>
                  <img src={p.src} alt="" />
                </button>
              ))}
            </div>
            <ol className="ply-names">
              {[...plies].reverse().map((p) => (
                <li key={p.id}>{p.name}</li>
              ))}
            </ol>
          </div>
        )}
        {/* les bords font le tour de l'objet : colonne à gauche de la coupe */}
        <div className={byKey('edge') ? 'cp-body' : ''}>
          {byKey('edge') && card(byKey('edge')!)}
          <div className="cp-stack">
            <span className="side-tag">dessus</span>
            {byKey('coat') && card(byKey('coat')!)}
            <div className={byKey('image') ? 'cp-pair' : ''}>
              {byKey('image') && card(byKey('image')!)}
              {card(byKey('transform')!)}
            </div>
            {card(byKey('support')!)}
            <span className="side-tag">dessous</span>
          </div>
        </div>
      </div>
      {focused && <Attrs layer={l} doc={doc} item={focused} patch={patch} />}
    </aside>
  );
}

function Dots({ label, value, doc, onPick }: { label: string; value: number; doc: Doc; onPick: (i: number) => void }) {
  return (
    <div className="cp-row colors">
      <span>{label}</span>
      <div className="dots">
        {doc.guides.map((g, i) => (
          <button key={i} className={i === value ? 'on' : ''} style={{ background: swatch(g) }} title={g.name} aria-label={g.name} onClick={() => onPick(i)} />
        ))}
      </div>
    </div>
  );
}

function Range({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="cp-row">
      <span>{label}</span>
      <input type="range" min={0} max={1} step={0.01} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <output>{Math.round(value * 100)}</output>
    </label>
  );
}

/** Réglages de l'élément touché, en bas de la coupe. */
function Attrs({ layer: l, doc, item, patch }: { layer: Layer; doc: Doc; item: Item; patch: (p: Partial<Layer>, history?: boolean) => void }) {
  const live = (p: Partial<Layer>) => patch(p, false);
  let body: React.ReactNode = null;
  const fxRows = (x: Fx, set: (x: Fx, history?: boolean) => void, amountLabel = 'Intensité') => {
    const def = fxOf(x.id)!;
    const slots = fxGuides(def, x);
    return (
      <>
        {def.slots.map((sl, i) => (
          <Dots key={i} label={sl.label} value={slots[i]!} doc={doc} onPick={(g) => set({ ...x, guides: slots.map((v, j) => (j === i ? g : v)) })} />
        ))}
        <Range label={def.amountLabel ?? amountLabel} value={x.amount} onChange={(v) => set({ ...x, amount: Math.round(v * 100) / 100 }, false)} />
      </>
    );
  };
  if (item.key === 'border' && l.border) {
    const bd = l.border;
    body = (
      <>
        <Dots label={bd.style === 'double' ? 'Intérieur' : 'Couleur'} value={bd.guide} doc={doc} onPick={(i) => patch({ border: { ...bd, guide: i } })} />
        {bd.style === 'double' && <Dots label="Extérieur" value={bd.guide2 ?? 1} doc={doc} onPick={(i) => patch({ border: { ...bd, guide2: i } })} />}
        <Range label="Largeur" value={Math.sqrt((bd.width - 0.002) / 0.198)} onChange={(v) => live({ border: { ...bd, width: 0.002 + Math.round(v * v * 198) / 1000 } })} />
      </>
    );
  } else if (item.key === 'bevel') body = <Range label="Relief" value={l.bevel ?? 0} onChange={(v) => live({ bevel: Math.max(0.05, Math.round(v * 100) / 100) })} />;
  else if (item.key === 'glow' && l.glow) {
    const gl = l.glow;
    body = (
      <>
        <Dots label="Couleur" value={gl.guide} doc={doc} onPick={(i) => patch({ glow: { ...gl, guide: i } })} />
        <Range label="Distance" value={gl.distance} onChange={(v) => live({ glow: { ...gl, distance: Math.round(v * 100) / 100 } })} />
        <Range label="Largeur" value={gl.width} onChange={(v) => live({ glow: { ...gl, width: Math.round(v * 100) / 100 } })} />
      </>
    );
  } else if (item.key === 'paint') body = <Dots label="Couleur" value={l.guide} doc={doc} onPick={(i) => patch({ guide: i })} />;
  else if (item.key === 'material' && l.material)
    body = (
      <>
        {fxRows(l.material, (x, h) => patch({ material: x }, h))}
        {fxOf(l.material.id)?.transparent && <Range label="Opacité" value={l.opacity ?? 1} onChange={(v) => live({ opacity: Math.max(0.05, Math.round(v * 100) / 100) })} />}
      </>
    );
  else if (item.key === 'look' && l.look?.style) {
    const look = l.look;
    const def = lookOf(look.style)!;
    const slots = lookGuides(def, look);
    body = (
      <>
        {def.slots.map((sl, i) => (
          <Dots key={i} label={sl.label} value={slots[i]!} doc={doc} onPick={(g) => patch({ look: { ...look, guides: slots.map((v, j) => (j === i ? g : v)) } })} />
        ))}
        <Range label="Mélange" value={look.mix} onChange={(v) => live({ look: { ...look, mix: Math.round(v * 100) / 100 } })} />
      </>
    );
  } else if (item.key.startsWith('fx:')) {
    const i = Number(item.key.slice(3));
    const x = l.fx?.[i];
    if (x) body = fxRows(x, (y, h) => patch({ fx: l.fx!.map((z, j) => (j === i ? y : z)) }, h));
  }
  const secName = SECTIONS.find((s) => s.sec === item.sec)!.name;
  return (
    <section className="cp-attrs">
      <div className="cp-attrs-h">
        <b>{item.name}</b>
        <small>{secName}</small>
      </div>
      {body}
    </section>
  );
}
