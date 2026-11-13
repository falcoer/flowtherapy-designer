import { useEffect, useRef, useState } from 'react';
import type { ElementSheet, ElementStore, KnobSheet } from '@ftd/core';
import { burnLayers, paintStroke } from './brush';
import { ELEMENTS, EXTRA_OK, elementList, extraStrokes, knobRange, presetOf, strokeParams, type ElementDef, type KnobDef, type Params } from './elements';
import { passKind } from './fresh';
import { Icon } from './icons';
import type { Guide, Stroke } from './model';

/**
 * Configuration globale › Éléments : les fiches d'origine (cachées ou non dans la roue) et les copies
 * qu'un gérant en tire. Une copie garde le moteur et le rendu de sa fiche d'origine ; elle choisit son
 * nom, sa famille, ses potards (montrés, simplifiés, bornés ou figés), ses outils et ses jeux de
 * paramètres. Les traits déjà peints gardent leurs réglages : changer une fiche ne les touche pas.
 */

const ENGINE: Record<string, string> = { acrylic: 'Étalage', roller: 'Étalage', aquarelle: 'Lavis', glitter: 'Jet', branch: 'Ramification', burn: 'Contagion' };
const ICONS = [...new Set(ELEMENTS.flatMap((e) => [e.icon, ...(e.tools?.map((t) => t.icon) ?? [])]))];
const SPILLS = new Set(['hair', 'branch', 'glitter']);
const INK: Guide = { name: 'Essai', type: 'color', color: '#c2410c' };

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
const freshId = (name: string, taken: Set<string>) => {
  const b = slug(name) || 'element';
  let id = b;
  for (let n = 2; taken.has(id); n++) id = `${b}-${n}`;
  return id;
};
const pct = (v: number) => `${Math.round(v * 100)}`;

export function ElementsTab(p: { store: ElementStore; setStore: (s: ElementStore) => void; guide?: Guide }) {
  const { store } = p;
  const all = elementList(store);
  const [sel, setSel] = useState<string>(all[0]!.id);
  const def = all.find((d) => d.id === sel) ?? all[0]!;
  const sheet = store.sheets.find((s) => s.id === def.id);
  const hidden = store.hidden.includes(def.id);
  const families = [...new Set(all.map((d) => d.family))];

  const setSheet = (patch: Partial<ElementSheet>) => sheet && p.setStore({ ...store, sheets: store.sheets.map((s) => (s.id === sheet.id ? { ...s, ...patch } : s)) });
  const duplicate = () => {
    const taken = new Set(all.map((d) => d.id));
    const name = `${def.name} (copie)`;
    const id = freshId(name, taken);
    const copy: ElementSheet = sheet
      ? { ...sheet, id, name, knobs: sheet.knobs.map((k) => ({ ...k })), presets: sheet.presets.map((x) => ({ ...x, values: { ...x.values } })) }
      : { id, base: def.base, name, family: def.family, icon: def.icon, hint: def.hint, knobs: [], presets: def.presets.map((x) => ({ name: x.name, values: { ...x.values } as Record<string, number> })) };
    p.setStore({ ...store, sheets: [...store.sheets, copy] });
    setSel(id);
  };

  return (
    <div className="cat-cols">
      <div className="cat-list">
        {families.map((f) => (
          <div key={f} className="el-fam">
            <div className="pf-group">{f}</div>
            {all
              .filter((d) => d.family === f)
              .map((d) => (
                <button key={d.id} className={`act-row act-pick ${d.id === sel ? 'on' : ''} ${store.hidden.includes(d.id) ? 'el-hidden' : ''}`} onClick={() => setSel(d.id)}>
                  <span className="el-ico">
                    <Icon name={d.icon} />
                  </span>
                  <span className="act-txt">
                    <b>{d.name}</b>
                    <small>
                      {d.copy ? `copie · ${ELEMENTS.find((e) => e.id === d.base)?.name}` : 'd’origine'}
                      {store.hidden.includes(d.id) ? ' · cachée' : ''}
                    </small>
                  </span>
                </button>
              ))}
          </div>
        ))}
      </div>

      <div className="cat-edit">
        <TestArea
          def={def}
          guide={p.guide}
          onKeep={sheet ? (values) => setSheet({ presets: [...sheet.presets, { name: `Jeu ${sheet.presets.length + 1}`, values: values as Record<string, number> }] }) : undefined}
        />
        <div className="act-checks">
          <button className={`act-check ${hidden ? '' : 'on'}`} onClick={() => p.setStore({ ...store, hidden: hidden ? store.hidden.filter((x) => x !== def.id) : [...store.hidden, def.id] })} title="Les traits déjà peints restent, cachée ou non">
            {hidden ? 'Cachée dans la roue' : 'Proposée dans la roue'}
          </button>
          <button className="act-check" onClick={duplicate}>
            Dupliquer
          </button>
        </div>
        {sheet ? (
          <SheetEditor def={def} sheet={sheet} families={families} set={setSheet} />
        ) : (
          <p className="pf-note">
            Fiche d’origine, livrée avec l’application : moteur {ENGINE[def.brush] ?? def.brush}. On ne peut que la cacher ou la dupliquer, puis modifier la copie.
          </p>
        )}
        {sheet && (
          <button
            className="ab-link act-danger"
            onClick={() => {
              p.setStore({ hidden: store.hidden.filter((x) => x !== sheet.id), sheets: store.sheets.filter((s) => s.id !== sheet.id) });
              setSel(def.base);
            }}
          >
            Retirer cette copie (les traits déjà peints restent)
          </button>
        )}
      </div>
    </div>
  );
}

/** Une ligne de potard dans la fiche d'une copie : montré, simplifié ou figé, nom et bornes. */
function KnobRow(p: { k: KnobDef; ks: KnobSheet | undefined; set: (ks: KnobSheet | null) => void }) {
  const { k, ks } = p;
  const [lo0, hi0] = knobRange(k);
  const mode = ks?.fixed !== undefined ? 'fixed' : (ks?.main ?? k.main) ? 'main' : 'more';
  const lo = ks?.lo ?? lo0;
  const hi = ks?.hi ?? hi0;
  const put = (patch: Partial<KnobSheet>) => {
    const next: KnobSheet = { ...(ks ?? { key: k.key }), ...patch };
    for (const x of Object.keys(next) as Array<keyof KnobSheet>) if (next[x] === undefined) delete next[x];
    p.set(Object.keys(next).length > 1 ? next : null);
  };
  return (
    <div className="el-knob">
      <div className="el-knob-head">
        <input className="pf-input" value={ks?.label ?? k.label} onChange={(e) => put({ label: e.target.value === k.label ? undefined : e.target.value })} aria-label={`Nom du potard ${k.label}`} />
        <div className="seg">
          <button className={mode === 'main' ? 'on' : ''} onClick={() => put({ main: k.main ? undefined : true, fixed: undefined })} title="Montré aussi en Mode simplifié">
            Simplifié
          </button>
          <button className={mode === 'more' ? 'on' : ''} onClick={() => put({ main: k.main ? false : undefined, fixed: undefined })} title="Montré seulement en mode complet">
            Complet
          </button>
          <button className={mode === 'fixed' ? 'on' : ''} onClick={() => put({ fixed: Math.max(lo0, Math.min(hi0, k.toggle ? 1 : (lo0 + hi0) / 2)), main: undefined, lo: undefined, hi: undefined })} title="Caché : la valeur reste figée">
            Figé
          </button>
        </div>
      </div>
      {mode === 'fixed' ? (
        k.toggle ? (
          <div className="act-checks">
            <button className={`act-check ${ks!.fixed! > 0.5 ? 'on' : ''}`} onClick={() => put({ fixed: ks!.fixed! > 0.5 ? 0 : 1 })}>
              {ks!.fixed! > 0.5 ? k.toggle.on : k.toggle.off}
            </button>
          </div>
        ) : (
          <label className="el-range">
            <span>Valeur</span>
            <input type="range" min={lo0} max={hi0} step={0.01} value={ks!.fixed!} onChange={(e) => put({ fixed: Number(e.target.value) })} />
            <span>{k.fmt ? k.fmt(ks!.fixed!) : pct(ks!.fixed!)}</span>
          </label>
        )
      ) : (
        !k.toggle && (
          <div className="el-bounds">
            <label className="el-range">
              <span>De</span>
              <input type="range" min={lo0} max={hi0} step={0.01} value={lo} onChange={(e) => put({ lo: Math.min(Number(e.target.value), hi - 0.05), hi })} />
              <span>{k.fmt ? k.fmt(lo) : pct(lo)}</span>
            </label>
            <label className="el-range">
              <span>À</span>
              <input type="range" min={lo0} max={hi0} step={0.01} value={hi} onChange={(e) => put({ hi: Math.max(Number(e.target.value), lo + 0.05), lo })} />
              <span>{k.fmt ? k.fmt(hi) : pct(hi)}</span>
            </label>
          </div>
        )
      )}
    </div>
  );
}

function SheetEditor(p: { def: ElementDef; sheet: ElementSheet; families: string[]; set: (patch: Partial<ElementSheet>) => void }) {
  const { sheet, set } = p;
  const base = ELEMENTS.find((e) => e.id === sheet.base)!;
  const wet = passKind({ brush: base.brush, matter: base.matter });
  return (
    <>
      <div className="act-field">
        <span className="pf-group">Identité</span>
        <input className="pf-input" value={sheet.name} onChange={(e) => set({ name: e.target.value })} aria-label="Nom" placeholder="Nom" />
        <input className="pf-input" list="el-families" value={sheet.family} onChange={(e) => set({ family: e.target.value })} aria-label="Famille" placeholder="Famille" />
        <datalist id="el-families">
          {p.families.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
        <input className="pf-input" value={sheet.hint} onChange={(e) => set({ hint: e.target.value })} aria-label="Phrase d’aide" placeholder="Phrase d’aide" />
        <div className="el-icons">
          {ICONS.map((i) => (
            <button key={i} className={`btn small ${sheet.icon === i ? 'on' : ''}`} onClick={() => set({ icon: i })} aria-label={`Icône ${i}`}>
              <Icon name={i} />
            </button>
          ))}
        </div>
      </div>
      <p className="pf-note">
        Moteur et rendu de {base.name} ({ENGINE[base.brush] ?? base.brush}) : une copie les garde, elle règle seulement ce qu’on en montre.
      </p>
      {base.tools && (
        <div className="act-field">
          <span className="pf-group">Outils</span>
          <div className="act-checks">
            {base.tools.map((t) => {
              const on = !sheet.tools || sheet.tools.includes(t.key);
              const cur = sheet.tools ?? base.tools!.map((x) => x.key);
              return (
                <button key={t.key} className={`act-check ${on ? 'on' : ''}`} onClick={() => set({ tools: on ? (cur.length > 1 ? cur.filter((x) => x !== t.key) : cur) : [...cur, t.key] })}>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {base.knobs.length > 0 && (
        <div className="act-field">
          <span className="pf-group">Potards</span>
          {base.knobs.map((k) => (
            <KnobRow
              key={k.key}
              k={k}
              ks={sheet.knobs.find((x) => x.key === k.key)}
              set={(ks) => set({ knobs: [...sheet.knobs.filter((x) => x.key !== k.key), ...(ks ? [ks] : [])].sort((a, b) => base.knobs.findIndex((x) => x.key === a.key) - base.knobs.findIndex((x) => x.key === b.key)) })}
            />
          ))}
        </div>
      )}
      {(wet || SPILLS.has(base.brush)) && (
        <div className="act-field">
          <span className="pf-group">Comportement</span>
          <div className="act-checks">
            {wet && (
              <button className={`act-check ${sheet.pass !== false ? 'on' : ''}`} onClick={() => set({ pass: sheet.pass === false ? undefined : false })} title="Passe vivante : les traits restent frais et se mêlent jusqu’au séchage">
                Passe vivante
              </button>
            )}
            {SPILLS.has(base.brush) && (
              <button className={`act-check ${sheet.spill !== false ? 'on' : ''}`} onClick={() => set({ spill: sheet.spill === false ? undefined : false })} title="Déborder : l’encre peut sortir de la forme">
                Déborder permis
              </button>
            )}
          </div>
        </div>
      )}
      <ExtraField sheet={sheet} base={base} set={set} />
      <div className="act-field">
        <span className="pf-group">Jeux de paramètres</span>
        {sheet.presets.length === 0 && <p className="pf-note">Aucun : règle les potards dans la zone d’essai, puis garde-les en jeu.</p>}
        {sheet.presets.map((ps, i) => (
          <div key={i} className="el-preset">
            <input className="pf-input" value={ps.name} onChange={(e) => set({ presets: sheet.presets.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} aria-label="Nom du jeu" />
            <button className="btn small" disabled={i === 0} onClick={() => set({ presets: [ps, ...sheet.presets.filter((_, j) => j !== i)] })} title="En premier : ce sont les réglages de départ">
              <Icon name="up" />
            </button>
            <button className="btn small" onClick={() => set({ presets: sheet.presets.filter((_, j) => j !== i) })} title="Retirer ce jeu">
              ×
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

/** Second moteur d'une copie : un autre élément posé sur le même geste, dosé ou non par un potard. */
function ExtraField(p: { sheet: ElementSheet; base: ElementDef; set: (patch: Partial<ElementSheet>) => void }) {
  const { sheet, base, set } = p;
  const ex = sheet.extra;
  const choices = ELEMENTS.filter((e) => EXTRA_OK(e.id) && e.id !== base.id);
  const el = ex && ELEMENTS.find((e) => e.id === ex.element);
  const doses = base.knobs.filter((k) => !k.toggle);
  const put = (patch: Partial<NonNullable<ElementSheet['extra']>>) => ex && set({ extra: { ...ex, ...patch } });
  return (
    <div className="act-field">
      <span className="pf-group">Second moteur</span>
      <div className="act-checks">
        <button className={`act-check ${!ex ? 'on' : ''}`} onClick={() => set({ extra: undefined })}>
          Aucun
        </button>
        {choices.map((e) => (
          <button key={e.id} className={`act-check ${ex?.element === e.id ? 'on' : ''}`} onClick={() => set({ extra: { element: e.id, size: ex?.size ?? 1, ...(ex?.dose ? { dose: ex.dose, from: ex.from ?? 0 } : {}) } })}>
            {e.name}
          </button>
        ))}
      </div>
      {ex && el && (
        <>
          {el.presets.length > 1 && (
            <div className="act-checks">
              {el.presets.map((ps, i) => (
                <button key={ps.name} className={`act-check ${(ex.preset ?? el.presets[0]!.name) === ps.name ? 'on' : ''}`} onClick={() => put({ preset: i === 0 ? undefined : ps.name })}>
                  {ps.name}
                </button>
              ))}
            </div>
          )}
          <label className="el-range">
            <span>Taille</span>
            <input type="range" min={0.2} max={3} step={0.05} value={ex.size} onChange={(e) => put({ size: Number(e.target.value) })} />
            <span>{pct(ex.size)}</span>
          </label>
          {doses.length > 0 && (
            <div className="act-checks">
              <span className="pf-note">Dosé par</span>
              <button className={`act-check ${!ex.dose ? 'on' : ''}`} onClick={() => put({ dose: undefined, from: undefined })}>
                toujours entier
              </button>
              {doses.map((k) => (
                <button key={k.key} className={`act-check ${ex.dose === k.key ? 'on' : ''}`} onClick={() => put({ dose: k.key, from: ex.from ?? 0 })}>
                  {sheet.knobs.find((x) => x.key === k.key)?.label ?? k.label}
                </button>
              ))}
            </div>
          )}
          {ex.dose && (
            <label className="el-range">
              <span>À partir de</span>
              <input type="range" min={0} max={0.95} step={0.01} value={ex.from ?? 0} onChange={(e) => put({ from: Number(e.target.value) })} />
              <span>{pct(ex.from ?? 0)}</span>
            </label>
          )}
          <p className="pf-note">
            {el.name} est posé sur le même geste{ex.dose ? ', de plus en plus fort au-delà du seuil' : ''}. Il apparaît quand le trait est fini.
          </p>
        </>
      )}
    </div>
  );
}

/** Zone d'essai : on y trace des traits avec la fiche en cours, sans rien enregistrer. */
function TestArea(p: { def: ElementDef; guide?: Guide; onKeep?: (values: Params) => void }) {
  const { def } = p;
  const cv = useRef<HTMLCanvasElement>(null);
  const [vals, setVals] = useState<Params>({ ...(def.presets[0]?.values ?? {}) });
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const cur = useRef<Stroke | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    setVals({ ...(def.presets[0]?.values ?? {}) });
    setStrokes([]);
    // une copie modifiée garde ses traits d'essai, une autre fiche repart d'une page blanche
  }, [def.id]);
  const dark = def.matter === 'light' || def.matter === 'spark' || def.ramify === 'bolt' || def.base === 'fire';
  const guide = p.guide ?? INK;
  const draw = () => {
    const c = cv.current;
    if (!c) return;
    const x = c.getContext('2d')!;
    const t = { pw: c.width, ph: c.height, pxPerMin: c.height };
    x.clearRect(0, 0, c.width, c.height);
    const list = [...strokes, ...(cur.current ? [cur.current] : [])].map((s) => ({ ...s, ...strokeParams(def, vals), grow: 1 }));
    const extras = list.flatMap((s) => extraStrokes(def, s, vals));
    if (def.brush === 'burn') {
      // la brûlure consume la couche : une feuille de papier à brûler
      x.fillStyle = dark ? '#17161b' : '#fff';
      x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = '#efe6d3';
      x.fillRect(10, 10, c.width - 20, c.height - 20);
      if (!list.length) return;
      // le second moteur d'un feu vole avec les flammes, au-dessus de la feuille
      const b = burnLayers(list, [guide], t, () => true, (px, py) => px > 10 && py > 10 && px < c.width - 10 && py < c.height - 10, extras);
      x.drawImage(b.edge, 0, 0);
      x.save();
      x.globalCompositeOperation = 'destination-out';
      x.drawImage(b.hole, 0, 0);
      x.globalCompositeOperation = 'destination-over';
      x.fillStyle = dark ? '#17161b' : '#fff';
      x.fillRect(0, 0, c.width, c.height);
      x.restore();
      if (b.flame) x.drawImage(b.flame.c, b.flame.x * c.width, b.flame.y * c.height, b.flame.w * c.width, b.flame.h * c.height);
      return;
    }
    if (dark) {
      x.fillStyle = '#17161b';
      x.fillRect(0, 0, c.width, c.height);
    }
    for (const s of [...list, ...extras]) paintStroke(x, s, [guide], t);
  };
  useEffect(draw);
  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, p: e.pressure > 0 && e.pointerType === 'pen' ? e.pressure : 0.7 };
  };
  const preset = presetOf(def, vals);
  return (
    <div className="el-test">
      <div className="el-test-top">
      <canvas
        ref={cv}
        width={560}
        height={200}
        className="el-test-canvas"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          cur.current = { brush: def.brush, guide: 0, size: 0.13, opacity: 1, seed: Math.floor(Math.random() * 1e9), pts: [at(e)] };
          tick((n) => n + 1);
        }}
        onPointerMove={(e) => {
          if (!cur.current) return;
          cur.current.pts.push(at(e));
          tick((n) => n + 1);
        }}
        onPointerUp={() => {
          const s = cur.current;
          cur.current = null;
          if (s) setStrokes((l) => [...l, s]);
        }}
        onPointerCancel={() => (cur.current = null)}
      />
      <div className="el-test-bar">
        <span className="pf-note">Zone d’essai : trace un trait</span>
        {def.presets.map((ps, i) => (
          <button key={i} className={`act-check ${preset === i ? 'on' : ''}`} onClick={() => setVals({ ...vals, ...ps.values })}>
            {ps.name}
          </button>
        ))}
        <button className="ab-link" onClick={() => setStrokes([])}>
          Effacer
        </button>
      </div>
      </div>
      {def.knobs.length > 0 && (
        <div className="el-bounds">
          {def.knobs.map((k) => {
            const [lo, hi] = knobRange(k);
            const v = vals[k.key] ?? lo;
            return k.toggle ? (
              <button key={k.key} className={`act-check ${v > 0.5 ? 'on' : ''}`} onClick={() => setVals({ ...vals, [k.key]: v > 0.5 ? 0 : 1 })}>
                {k.label}
              </button>
            ) : (
              <label key={k.key} className="el-range">
                <span>{k.zone ? `${k.label} · ${k.zone(v)}` : k.label}</span>
                <input type="range" min={lo} max={hi} step={0.01} value={Math.max(lo, Math.min(hi, v))} onChange={(e) => setVals({ ...vals, [k.key]: Number(e.target.value) })} />
                <span>{k.fmt ? k.fmt(v) : pct(v)}</span>
              </label>
            );
          })}
        </div>
      )}
      {p.onKeep && preset < 0 && (
        <button className="pf-btn" onClick={() => p.onKeep!(vals)}>
          Garder ces réglages comme jeu de paramètres
        </button>
      )}
    </div>
  );
}

