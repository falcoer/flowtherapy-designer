import { useEffect, useRef, useState } from 'react';
import { MEDIA_KINDS, formatMargins, type Catalog, type MediaKind, type MediaType } from '@ftd/core';
import { DEFAULT_FORMATS, type Format } from '@ftd/core';
import { fetchCatalog, saveCatalog } from './server';
import { FrameInsets } from './frame-insets';
import { MediaIcon } from './targets-ui';

/**
 * Catalogue du site, pour ses administrateurs : les formats et les types de diffusion communs à toutes les activités.
 * Chaque activité coche ensuite, dans sa fiche, les types qui la concernent.
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
  const [tab, setTab] = useState<'media' | 'formats'>('media');
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
        <span className="b-title">Catalogue du site</span>
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
      </div>
      {!cat && !err && <p className="pf-note">Chargement…</p>}
      {cat && (
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
