import { useEffect, useRef, useState } from 'react';
import { MEDIA_KINDS, formatMargins, type Catalog, type MediaKind, type MediaType } from '@ftd/core';
import { DEFAULT_FORMATS, FONT_KIND_LABELS, FONT_KINDS, FREE_FONTS, fontAllowed, type FontKind, type FontUse, type Format } from '@ftd/core';
import { fetchCatalog, installFont, removeFont, saveCatalog } from './server';
import { ensureFont, fontFamily, fontList, loadFonts, reloadFonts, type FontInfo } from './text';
import { FrameInsets } from './frame-insets';
import { MediaIcon } from './targets-ui';

/**
 * Configuration globale, pour les administrateurs du site : formats, types de diffusion et polices
 * communs à toutes les activités. Chaque activité coche ensuite, dans sa fiche, les types qui la concernent.
 */

const KIND_LABELS: Record<MediaKind, string> = { social: 'Réseau social', affichage: 'Imprimé', impression: 'Impression', email: 'E-mail', site: 'Site web', streaming: 'Streaming' };
const TARGET_LABELS: Record<Format['target'], string> = { print: 'Impression', social: 'Réseaux', web: 'Web', mail: 'E-mail' };
const BUILTIN = new Set(DEFAULT_FORMATS.map((f) => f.id));
const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
const fresh = (base: string, taken: string[]) => {
  let id = slug(base) || 'nouveau';
  for (let n = 2; taken.includes(id); n++) id = `${slug(base) || 'nouveau'}-${n}`;
  return id;
};
const size = (f: Format) => `${f.width} × ${f.height}${f.unit === 'mm' ? ' mm' : ''}`;

export function CatalogPanel(p: { onClose: () => void; onSaved: (c: Catalog) => void }) {
  const [cat, setCat] = useState<Catalog | null>(null);
  const [tab, setTab] = useState<'media' | 'formats' | 'fonts'>('media');
  const [sel, setSel] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<Catalog | null>(null);

  useEffect(() => {
    fetchCatalog().then(
      (c) => (setCat(c), setSel(c.media[0]?.id ?? null)),
      (e: Error) => setErr(e.message),
    );
  }, []);
  const flush = async () => {
    window.clearTimeout(timer.current);
    const c = pending.current;
    if (!c) return;
    pending.current = null;
    setStatus('Enregistrement…');
    try {
      const r = await saveCatalog(c);
      p.onSaved(r.catalog);
      if (!pending.current) setStatus('Enregistré');
    } catch (e) {
      setErr((e as Error).message);
      setStatus('Non enregistré');
    }
  };
  useEffect(() => () => void flush(), []);
  const put = (c: Catalog) => {
    setCat(c);
    pending.current = c;
    setStatus('Modifié…');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 700);
  };

  const media = cat?.media ?? [];
  const formats = cat?.formats ?? [];
  const curM = tab === 'media' ? media.find((m) => m.id === sel) : undefined;
  const curF = tab === 'formats' ? formats.find((f) => f.id === sel) : undefined;
  const setM = (patch: Partial<MediaType>) => cat && curM && put({ ...cat, media: media.map((m) => (m.id === curM.id ? { ...m, ...patch } : m)) });
  const setF = (patch: Partial<Format>) => cat && curF && put({ ...cat, formats: formats.map((f) => (f.id === curF.id ? { ...f, ...patch } : f)) });

  return (
    <div className="bubble cat-panel" onPointerDown={(e) => e.stopPropagation()}>
      <div className="pf-head">
        <span className="b-title">Configuration globale</span>
        {status && <span className="act-status">{status}</span>}
        <button className="lamp-close" onClick={p.onClose} aria-label="Fermer">
          ×
        </button>
      </div>
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={tab === 'media'} className={tab === 'media' ? 'on' : ''} onClick={() => (setTab('media'), setSel(media[0]?.id ?? null))}>
          Types de diffusion
        </button>
        <button role="tab" aria-selected={tab === 'formats'} className={tab === 'formats' ? 'on' : ''} onClick={() => (setTab('formats'), setSel(formats[0]?.id ?? null))}>
          Formats
        </button>
        <button role="tab" aria-selected={tab === 'fonts'} className={tab === 'fonts' ? 'on' : ''} onClick={() => setTab('fonts')}>
          Polices
        </button>
      </div>
      {!cat && !err && <p className="pf-note">Chargement…</p>}
      {cat && tab === 'fonts' && <FontsTab uses={cat.fonts ?? {}} setUses={(fonts) => put({ ...cat, fonts })} onErr={setErr} />}
      {cat && tab !== 'fonts' && (
        <div className="cat-cols">
          <div className="cat-list">
            {tab === 'media'
              ? media.map((m) => (
                  <button key={m.id} className={`act-row act-pick ${m.id === sel ? 'on' : ''}`} onClick={() => setSel(m.id)}>
                    <MediaIcon ch={{ id: m.id, name: m.name, kind: m.kind, formats: m.formats }} size={24} />
                    <span className="act-txt">
                      <b>{m.name}</b>
                      <small>{m.default ? 'coché d’office' : KIND_LABELS[m.kind]}</small>
                    </span>
                  </button>
                ))
              : formats.map((f) => (
                  <button key={f.id} className={`act-row act-pick ${f.id === sel ? 'on' : ''}`} onClick={() => setSel(f.id)}>
                    <span className="cat-shape" style={{ aspectRatio: `${f.width} / ${f.height}` }} />
                    <span className="act-txt">
                      <b>{f.title}</b>
                      <small>{size(f)}</small>
                    </span>
                  </button>
                ))}
            <button
              className="pf-btn act-add"
              onClick={() => {
                if (tab === 'media') {
                  const id = fresh('Nouveau type', media.map((m) => m.id));
                  put({ ...cat, media: [...media, { id, name: 'Nouveau type', kind: 'social', formats: [], fields: { account: true } }] });
                  setSel(id);
                } else {
                  const id = fresh('Nouveau format', formats.map((f) => f.id));
                  put({ ...cat, formats: [...formats, { id, title: 'Nouveau format', width: 1080, height: 1080, unit: 'px', target: 'social' }] });
                  setSel(id);
                }
              }}
            >
              + {tab === 'media' ? 'Type de diffusion' : 'Format'}
            </button>
          </div>

          {curM && (
            <div className="cat-edit">
              <label className="act-field">
                <span className="pf-group">Nom</span>
                <input className="pf-input" value={curM.name} onChange={(e) => setM({ name: e.target.value })} />
              </label>
              <div className="act-field">
                <span className="pf-group">Famille</span>
                <div className="act-checks">
                  {MEDIA_KINDS.map((k) => (
                    <button key={k} className={`act-check ${curM.kind === k ? 'on' : ''}`} onClick={() => setM({ kind: k })}>
                      {KIND_LABELS[k]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="act-field">
                <span className="pf-group">Formats</span>
                <div className="act-checks">
                  {formats.map((f) => {
                    const on = curM.formats.includes(f.id);
                    return (
                      <button key={f.id} className={`act-check ${on ? 'on' : ''}`} onClick={() => setM({ formats: on ? curM.formats.filter((x) => x !== f.id) : [...curM.formats, f.id] })} title={size(f)}>
                        {f.title}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="act-field">
                <span className="pf-group">Ce que l’activité renseigne</span>
                <div className="act-checks">
                  {(
                    [
                      ['account', 'Compte'],
                      ['api', 'API + secret'],
                      ['folder', 'Dossier partagé'],
                    ] as const
                  ).map(([k, label]) => (
                    <button key={k} className={`act-check ${curM.fields[k] ? 'on' : ''}`} onClick={() => setM({ fields: { ...curM.fields, [k]: !curM.fields[k] || undefined } })}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="act-checks">
                <button className={`act-check ${curM.default ? 'on' : ''}`} onClick={() => setM({ default: !curM.default || undefined })}>
                  Coché d’office pour une nouvelle activité
                </button>
              </div>
              <button
                className="ab-link act-danger"
                onClick={() => {
                  put({ ...cat, media: media.filter((m) => m.id !== curM.id) });
                  setSel(media.find((m) => m.id !== curM.id)?.id ?? null);
                }}
              >
                Retirer ce type
              </button>
            </div>
          )}

          {curF && (
            <div className="cat-edit">
              <label className="act-field">
                <span className="pf-group">Nom</span>
                <input className="pf-input" value={curF.title} onChange={(e) => setF({ title: e.target.value })} />
              </label>
              <div className="act-field">
                <span className="pf-group">Taille</span>
                <div className="cat-size">
                  <input className="pf-input" type="number" min={1} value={curF.width} onChange={(e) => setF({ width: Number(e.target.value) || 1 })} aria-label="Largeur" />
                  <span>×</span>
                  <input className="pf-input" type="number" min={1} value={curF.height} onChange={(e) => setF({ height: Number(e.target.value) || 1 })} aria-label="Hauteur" />
                  <div className="seg">
                    {(['px', 'mm'] as const).map((u) => (
                      <button key={u} className={curF.unit === u ? 'on' : ''} onClick={() => setF({ unit: u, ...(u === 'mm' ? { dpi: curF.dpi ?? 300 } : { dpi: undefined }) })}>
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {curF.unit === 'mm' && (
                <label className="act-field">
                  <span className="pf-group">Résolution d’export (dpi)</span>
                  <input className="pf-input" type="number" min={72} max={1200} value={curF.dpi ?? 300} onChange={(e) => setF({ dpi: Number(e.target.value) || 300 })} />
                </label>
              )}
              <div className="act-field">
                <span className="pf-group">Usage</span>
                <div className="act-checks">
                  {(Object.keys(TARGET_LABELS) as Format['target'][]).map((t) => (
                    <button key={t} className={`act-check ${curF.target === t ? 'on' : ''}`} onClick={() => setF({ target: t })}>
                      {TARGET_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="act-field">
                <span className="pf-group">Marge et zone d’intérêt</span>
                <FrameInsets width={curF.width} height={curF.height} margins={formatMargins(curF)} zone={curF.zone} onChange={(margins, zone) => setF({ margins, zone })} />
              </div>
              {!BUILTIN.has(curF.id) && (
                <button
                  className="ab-link act-danger"
                  onClick={() => {
                    put({ ...cat, formats: formats.filter((f) => f.id !== curF.id), media: media.map((m) => ({ ...m, formats: m.formats.filter((x) => x !== curF.id) })) });
                    setSel(formats.find((f) => f.id !== curF.id)?.id ?? null);
                  }}
                >
                  Retirer ce format
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {err && <p className="pf-note pf-err">{err}</p>}
    </div>
  );
}

const SAMPLE = 'Flow Therapy en concert';
const NEW = '+';
const useLabel = (u: Record<string, FontUse>, id: string) => {
  const on = [fontAllowed(u, id, 'compositions') && 'Compositions', fontAllowed(u, id, 'branding') && 'Activités'].filter(Boolean);
  return on.length ? on.join(' · ') : 'désactivée';
};

/** Polices : livrées avec l'application ou installées ici, chacune proposée ou non aux compositions et au style des activités. */
function FontsTab(p: { uses: Record<string, FontUse>; setUses: (u: Record<string, FontUse>) => void; onErr: (m: string | null) => void }) {
  const [list, setList] = useState<FontInfo[]>(fontList());
  const [sel, setSel] = useState<string>(list[0]?.id ?? NEW);
  const [, bump] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState<FontKind | null>(null);
  const sorted = [...list].sort((a, b) => a.family.localeCompare(b.family));
  useEffect(() => {
    void loadFonts().then((l) => (setList([...l]), setSel((s) => (s === NEW || l.some((f) => f.id === s) ? s : (l[0]?.id ?? NEW)))));
  }, []);
  useEffect(() => {
    // chaque police arrivée redessine sa ligne
    let live = true;
    list.forEach((f) => void ensureFont(f.id).then(() => live && bump((n) => n + 1)));
    return () => void (live = false);
  }, [list]);

  const cur = list.find((f) => f.id === sel);
  const toggle = (id: string, use: keyof FontUse) => {
    const u = { ...(p.uses[id] ?? {}) };
    if (fontAllowed(p.uses, id, use)) u[use] = false;
    else delete u[use];
    const next = { ...p.uses };
    if (Object.keys(u).length) next[id] = u;
    else delete next[id];
    p.setUses(next);
  };
  const install = async (body: { name?: string; url?: string; dir?: string }, label: string) => {
    setBusy(label);
    p.onErr(null);
    try {
      const r = await installFont(body);
      const l = await reloadFonts();
      setList([...l]);
      setSel(r.font.id);
      setName('');
      setUrl('');
    } catch (e) {
      p.onErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const have = new Set(list.map((f) => key(f.family)));
  const free = FREE_FONTS.filter((f) => !have.has(key(f.family)) && (!kind || f.kind === kind));

  return (
    <div className="cat-cols">
      <div className="cat-list">
        {sorted.map((f) => (
          <button key={f.id} className={`act-row act-pick ${f.id === sel ? 'on' : ''}`} onClick={() => setSel(f.id)}>
            <span className="act-txt">
              <b className="cat-font-name" style={{ fontFamily: `${fontFamily(f.id)}, Inter, sans-serif` }}>
                {f.family}
              </b>
              <small>{useLabel(p.uses, f.id)}</small>
            </span>
          </button>
        ))}
        <button className={`pf-btn act-add ${sel === NEW ? 'on' : ''}`} onClick={() => setSel(NEW)}>
          + Police
        </button>
      </div>

      {cur && (
        <div className="cat-edit">
          <div className="cat-font-sample" style={{ fontFamily: `${fontFamily(cur.id)}, Inter, sans-serif` }}>
            {SAMPLE}
          </div>
          <div className="act-checks">
            <button className={`act-check ${fontAllowed(p.uses, cur.id, 'compositions') ? 'on' : ''}`} onClick={() => toggle(cur.id, 'compositions')}>
              Compositions
            </button>
            <button className={`act-check ${fontAllowed(p.uses, cur.id, 'branding') ? 'on' : ''}`} onClick={() => toggle(cur.id, 'branding')}>
              Style des activités
            </button>
          </div>
          <p className="pf-note">
            {cur.license ?? 'Licence à vérifier'}
            {cur.url && (
              <>
                {' · '}
                <a href={cur.url} target="_blank" rel="noreferrer">
                  source
                </a>
              </>
            )}
            {' · '}
            {cur.installed ? 'installée' : 'livrée avec l’application'}
          </p>
          {cur.installed && (
            <button
              className="ab-link act-danger"
              onClick={async () => {
                try {
                  await removeFont(cur.id);
                  const l = await reloadFonts();
                  setList([...l]);
                  setSel(l[0]?.id ?? NEW);
                } catch (e) {
                  p.onErr((e as Error).message);
                }
              }}
            >
              Retirer cette police
            </button>
          )}
        </div>
      )}

      {sel === NEW && (
        <div className="cat-edit">
          <form
            className="cat-font-add"
            onSubmit={(e) => {
              e.preventDefault();
              if (url.trim() && !busy) void install({ name, url }, name || url);
            }}
          >
            <input className="pf-input" placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="pf-input" type="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
            <button className="pf-btn" disabled={!url.trim() || !!busy}>
              {busy ? 'Installation…' : 'Installer'}
            </button>
          </form>
          <div className="pf-group">Polices libres</div>
          <div className="act-checks">
            <button className={`act-check ${!kind ? 'on' : ''}`} onClick={() => setKind(null)}>
              Toutes
            </button>
            {FONT_KINDS.map((k) => (
              <button key={k} className={`act-check ${kind === k ? 'on' : ''}`} onClick={() => setKind(kind === k ? null : k)}>
                {FONT_KIND_LABELS[k]}
              </button>
            ))}
          </div>
          <div className="cat-free">
            {free.map((f) => (
              <button key={f.dir} className="act-check" disabled={!!busy} onClick={() => void install({ dir: f.dir }, f.family)}>
                {busy === f.family ? 'Installation…' : `+ ${f.family}`}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
