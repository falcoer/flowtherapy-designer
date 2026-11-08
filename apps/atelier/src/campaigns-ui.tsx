import { useMemo, useState } from 'react';
import { thumbUrl, type AtelierMeta, type Campaign, type CampaignInput, type Operation } from './server';

const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' });
const dayShort = (d: string) => {
  const x = new Date(`${d}T12:00:00`);
  return { d: x.toLocaleDateString('fr-FR', { day: 'numeric' }), m: x.toLocaleDateString('fr-FR', { month: 'short' }), y: x.getFullYear() };
};
const isEventOp = (ops: Operation[], id?: string) => !id || id === 'concert' || /concert|[ée]v[èe]nement|spectacle|festival|soir[ée]e/i.test(ops.find((o) => o.id === id)?.name ?? '');

/** Formulaire d'une campagne : nom, occasion, date ; pour un évènement, prestation, accueil, lieu, contact réservation. */
function CampaignForm(p: { initial: CampaignInput & { id?: string }; operations: Operation[]; onCancel: () => void; onSubmit: (c: CampaignInput & { id?: string }) => Promise<void> }) {
  const [form, setForm] = useState(p.initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const contact = form.contact ?? {};
  const setContact = (k: 'name' | 'phone' | 'email', v: string) => setForm({ ...form, contact: { ...contact, [k]: v } });
  const submit = async () => {
    if (!form.name?.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await p.onSubmit(form);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="cp-form">
      <input className="pf-input" autoFocus placeholder="Nom : Concert au Plan, sortie de l’album…" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <div className="cp-row">
        <select className="pf-input" value={form.operation ?? ''} onChange={(e) => setForm({ ...form, operation: e.target.value || undefined })} aria-label="Occasion">
          <option value="">Sans occasion</option>
          {p.operations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <input className="pf-input" type="date" value={form.date ?? ''} onChange={(e) => setForm({ ...form, date: e.target.value || undefined })} aria-label="Date" title="Date" />
      </div>
      {isEventOp(p.operations, form.operation) && (
        <>
          <div className="cp-sub">Évènement</div>
          <div className="cp-row">
            <input className="pf-input" list="cp-kinds" placeholder="Type de prestation" value={form.kind ?? ''} onChange={(e) => setForm({ ...form, kind: e.target.value })} aria-label="Type de prestation" />
            <label className="cp-time">
              <span>Accueil</span>
              <input className="pf-input" type="time" value={form.time ?? ''} onChange={(e) => setForm({ ...form, time: e.target.value || undefined })} aria-label="Heure d’accueil" />
            </label>
          </div>
          <datalist id="cp-kinds">
            {['Concert', 'Showcase', 'DJ set', 'Concert acoustique', 'Bal', 'Festival', 'Résidence', 'Atelier'].map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
          <input className="pf-input" placeholder="Lieu" value={form.place ?? ''} onChange={(e) => setForm({ ...form, place: e.target.value })} aria-label="Lieu" />
          <div className="cp-sub">Contact réservation</div>
          <input className="pf-input" placeholder="Nom" value={contact.name ?? ''} onChange={(e) => setContact('name', e.target.value)} aria-label="Nom du contact" />
          <div className="cp-row">
            <input className="pf-input" type="tel" placeholder="Téléphone" value={contact.phone ?? ''} onChange={(e) => setContact('phone', e.target.value)} aria-label="Téléphone du contact" />
            <input className="pf-input" type="email" placeholder="Adresse e-mail" value={contact.email ?? ''} onChange={(e) => setContact('email', e.target.value)} aria-label="E-mail du contact" />
          </div>
        </>
      )}
      <div className="cp-btns">
        <button className="pf-btn" onClick={p.onCancel}>
          Annuler
        </button>
        <button className="pf-btn act-primary" disabled={busy || !form.name?.trim()} onClick={() => void submit()}>
          {form.id ? 'Enregistrer' : 'Créer la campagne'}
        </button>
      </div>
      {err && <p className="pf-note pf-err">{err}</p>}
    </div>
  );
}

type State = 'open' | 'closed' | 'all';

/** Fenêtre des campagnes : filtrer (nom, lieu, état, dates), créer, modifier, clore, et choisir celle sur laquelle on travaille. */
export function CampaignDialog(p: {
  campaigns: Campaign[];
  current: string;
  counts: Record<string, number>;
  operations: Operation[];
  canEdit: boolean;
  onPick: (id: string) => void;
  onClose: () => void;
  create: (c: CampaignInput) => Promise<void>;
  update: (id: string, c: CampaignInput) => Promise<void>;
}) {
  const [q, setQ] = useState('');
  const [state, setState] = useState<State>('open');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [form, setForm] = useState<(CampaignInput & { id?: string }) | null>(null);
  const norm = (s?: string) => (s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

  const shown = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    return p.campaigns
      .filter((c) => (state === 'all' ? true : state === 'open' ? !c.closed : !!c.closed))
      .filter((c) => !from || (c.date ?? '') >= from)
      .filter((c) => !to || (!!c.date && c.date <= to))
      .filter((c) => words.every((w) => norm(`${c.name} ${c.place ?? ''} ${c.kind ?? ''}`).includes(w)))
      .sort((a, b) => (a.date && b.date ? a.date.localeCompare(b.date) : a.date ? -1 : b.date ? 1 : b.created.localeCompare(a.created)));
  }, [p.campaigns, q, state, from, to]);

  return (
    <div className="cp-modal-back" onPointerDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div className="cp-modal" role="dialog" aria-label="Campagnes" onPointerDown={(e) => e.stopPropagation()}>
        <div className="pf-head">
          <span className="b-title">Campagnes</span>
          <button className="lamp-close" onClick={p.onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        {form ? (
          <CampaignForm
            initial={form}
            operations={p.operations}
            onCancel={() => setForm(null)}
            onSubmit={async ({ id, ...data }) => {
              if (id) await p.update(id, data);
              else await p.create(data);
              setForm(null);
              if (!id) p.onClose();
            }}
          />
        ) : (
          <>
            <div className="cp-filters">
              <input className="pf-input cp-search" type="search" placeholder="Chercher un nom, un lieu…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Chercher" />
              <div className="seg cp-state" role="tablist">
                {(
                  [
                    ['open', 'En cours'],
                    ['closed', 'Closes'],
                    ['all', 'Toutes'],
                  ] as const
                ).map(([k, l]) => (
                  <button key={k} role="tab" aria-selected={state === k} className={state === k ? 'on' : ''} onClick={() => setState(k)}>
                    {l}
                  </button>
                ))}
              </div>
              <div className="cp-dates">
                <label>
                  <span>Du</span>
                  <input className="pf-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </label>
                <label>
                  <span>au</span>
                  <input className="pf-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </label>
                {(from || to || q) && (
                  <button
                    className="ab-link"
                    onClick={() => {
                      setFrom('');
                      setTo('');
                      setQ('');
                    }}
                  >
                    Effacer
                  </button>
                )}
              </div>
            </div>

            <div className="cp-actions">
              {p.canEdit && (
                <button className="pf-btn act-primary" onClick={() => setForm({ name: '', operation: p.operations[0]?.id })}>
                  + Nouvelle campagne
                </button>
              )}
              <button className="pf-btn" disabled title="Bientôt : import depuis le gestionnaire de planning">
                Importer d’un agenda
              </button>
            </div>

            <div className="cp-list">
              <button className={`cp-item cp-none ${p.current === '' ? 'on' : ''}`} onClick={() => p.onPick('')}>
                <span className="cp-date">—</span>
                <span className="cp-main">
                  <b>Hors campagne</b>
                  <small>toutes les compositions de l’activité</small>
                </span>
              </button>
              {shown.map((c) => {
                const d = c.date ? dayShort(c.date) : null;
                return (
                  <div key={c.id} className={`cp-item ${c.id === p.current ? 'on' : ''} ${c.closed ? 'closed' : ''}`}>
                    <button className="cp-pick" onClick={() => p.onPick(c.id)} title={`Travailler sur « ${c.name} »`}>
                      <span className="cp-date">
                        {d ? (
                          <>
                            <b>{d.d}</b>
                            <small>{d.m}</small>
                          </>
                        ) : (
                          '—'
                        )}
                      </span>
                      <span className="cp-main">
                        <b>{c.name}</b>
                        <small>
                          {[c.place, `${p.counts[c.id] ?? 0} composition${(p.counts[c.id] ?? 0) > 1 ? 's' : ''}`, c.closed && 'close'].filter(Boolean).join(' · ')}
                        </small>
                      </span>
                    </button>
                    {p.canEdit && (
                      <span className="cp-row-acts">
                        <button className="ab-link" onClick={() => setForm({ id: c.id, name: c.name, operation: c.operation, date: c.date, place: c.place, time: c.time, kind: c.kind, contact: c.contact })}>
                          Modifier
                        </button>
                        <button className="ab-link" onClick={() => void p.update(c.id, { closed: !c.closed })}>
                          {c.closed ? 'Rouvrir' : 'Clore'}
                        </button>
                      </span>
                    )}
                  </div>
                );
              })}
              {!shown.length && <p className="pf-note">Aucune campagne ne correspond.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Présentation de la campagne suivie, dans le menu des compositions. */
export function CampaignSummary({ campaign, onOpen }: { campaign?: Campaign; onOpen: () => void }) {
  if (!campaign)
    return (
      <div className="cp-summary empty">
        <span>Aucune campagne choisie : toutes les compositions.</span>
        <button className="pf-btn" onClick={onOpen}>
          Choisir une campagne
        </button>
      </div>
    );
  const c = campaign;
  return (
    <div className={`cp-summary ${c.closed ? 'closed' : ''}`}>
      <div className="cp-lines">
        <b className="cp-name">
          {c.name}
          {c.closed && <em> · close</em>}
        </b>
        {(c.date || c.place) && <span>{[c.date && day(c.date), c.place].filter(Boolean).join(' · ')}</span>}
      </div>
      <button className="pf-btn" onClick={onOpen} title="Choisir, créer ou clore une campagne">
        Changer
      </button>
    </div>
  );
}

/** Vote d'un membre pour une composition : un cœur et le nombre de voix. */
export function VoteButton({ votes, voted, onVote }: { votes: string[]; voted: boolean; onVote: () => void }) {
  const who = votes.map((v) => v.split('@')[0]).join(', ');
  return (
    <button className={`vote ${voted ? 'on' : ''}`} onClick={onVote} title={voted ? `Retirer ma voix${who ? ` (${who})` : ''}` : `Voter pour cette composition${who ? ` (${who})` : ''}`} aria-pressed={voted}>
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
        <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 7.9 3.6 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.6 3.4 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" fill={voted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
      <span>{votes.length}</span>
    </button>
  );
}
