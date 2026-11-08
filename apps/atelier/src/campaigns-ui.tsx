import { useState } from 'react';
import type { Campaign, CampaignInput, Operation } from './server';

const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' });

/** Choix de la campagne en cours, sa fiche courte, et la création d'une nouvelle. */
export function CampaignBar(p: {
  campaigns: Campaign[];
  current: string;
  setCurrent: (id: string) => void;
  canEdit: boolean;
  operations: Operation[];
  counts: Record<string, number>;
  create: (c: CampaignInput) => Promise<void>;
  update: (id: string, c: CampaignInput) => Promise<void>;
}) {
  // formulaire : nouvelle campagne, ou modification de celle suivie
  const [form, setForm] = useState<(CampaignInput & { id?: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cur = p.campaigns.find((c) => c.id === p.current);
  const open = p.campaigns.filter((c) => !c.closed);
  const closed = p.campaigns.filter((c) => c.closed);
  const opOf = (id?: string) => p.operations.find((o) => o.id === id);
  const isEvent = (id?: string) => !id || id === 'concert' || /concert|[ée]v[èe]nement|spectacle|festival|soir[ée]e/i.test(opOf(id)?.name ?? '');

  const submit = async () => {
    if (!form?.name?.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const { id, ...data } = form;
      if (id) await p.update(id, data);
      else await p.create(data);
      setForm(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const contact = form?.contact ?? {};
  const setContact = (k: 'name' | 'phone' | 'email', v: string) => form && setForm({ ...form, contact: { ...contact, [k]: v } });

  return (
    <div className="cp">
      <div className="cp-bar">
        <select className="pf-input cp-select" value={p.current} onChange={(e) => p.setCurrent(e.target.value)} aria-label="Campagne">
          <option value="">Toutes les compositions</option>
          {open.length > 0 && (
            <optgroup label="Campagnes en cours">
              {open.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({p.counts[c.id] ?? 0})
                </option>
              ))}
            </optgroup>
          )}
          {closed.length > 0 && (
            <optgroup label="Campagnes closes">
              {closed.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({p.counts[c.id] ?? 0})
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {p.canEdit && !form && (
          <button className="pf-btn cp-new" onClick={() => setForm({ name: '', operation: p.operations[0]?.id })} title="Nouvelle campagne">
            + Campagne
          </button>
        )}
      </div>

      {form && (
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
          {isEvent(form.operation) && (
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
          <div className="cp-row cp-btns">
            <button className="pf-btn" onClick={() => setForm(null)}>
              Annuler
            </button>
            <button className="pf-btn act-primary" disabled={busy || !form.name?.trim()} onClick={() => void submit()}>
              {form.id ? 'Enregistrer' : 'Créer la campagne'}
            </button>
          </div>
          {err && <p className="pf-note pf-err">{err}</p>}
        </div>
      )}

      {cur && !form && (
        <div className={`cp-info ${cur.closed ? 'closed' : ''}`}>
          <div className="cp-lines">
            <span>
              {[opOf(cur.operation)?.name, cur.kind].filter(Boolean).join(' · ') || 'Campagne'}
              {cur.closed && <em> · close</em>}
            </span>
            {(cur.date || cur.time || cur.place) && <span>{[cur.date && day(cur.date), cur.time && `accueil ${cur.time.replace(':', 'h')}`, cur.place].filter(Boolean).join(' · ')}</span>}
            {cur.contact && (
              <span>
                Réservation : {[cur.contact.name, cur.contact.phone].filter(Boolean).join(', ')}
                {cur.contact.email && (
                  <>
                    {cur.contact.name || cur.contact.phone ? ', ' : ''}
                    <a href={`mailto:${cur.contact.email}`}>{cur.contact.email}</a>
                  </>
                )}
              </span>
            )}
          </div>
          {p.canEdit && (
            <div className="cp-acts">
              <button className="ab-link" onClick={() => setForm({ id: cur.id, name: cur.name, operation: cur.operation, date: cur.date, place: cur.place, time: cur.time, kind: cur.kind, contact: cur.contact })}>
                Modifier
              </button>
              <button className="ab-link" onClick={() => void p.update(cur.id, { closed: !cur.closed })}>
                {cur.closed ? 'Rouvrir' : 'Clore'}
              </button>
            </div>
          )}
        </div>
      )}
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
