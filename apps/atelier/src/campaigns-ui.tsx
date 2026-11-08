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
  const [form, setForm] = useState<CampaignInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cur = p.campaigns.find((c) => c.id === p.current);
  const open = p.campaigns.filter((c) => !c.closed);
  const closed = p.campaigns.filter((c) => c.closed);
  const opName = (id?: string) => p.operations.find((o) => o.id === id)?.name;

  const submit = async () => {
    if (!form?.name?.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await p.create(form);
      setForm(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

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
          <input className="pf-input" autoFocus placeholder="Nom : Concert au Plan, sortie de l’album…" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && void submit()} />
          <div className="cp-row">
            <select className="pf-input" value={form.operation ?? ''} onChange={(e) => setForm({ ...form, operation: e.target.value || undefined })} aria-label="Occasion">
              <option value="">Sans occasion</option>
              {p.operations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <input className="pf-input" type="date" value={form.date ?? ''} onChange={(e) => setForm({ ...form, date: e.target.value || undefined })} aria-label="Date de l’évènement" />
          </div>
          <input className="pf-input" placeholder="Lieu (facultatif)" value={form.place ?? ''} onChange={(e) => setForm({ ...form, place: e.target.value })} />
          <div className="cp-row cp-btns">
            <button className="pf-btn" onClick={() => setForm(null)}>
              Annuler
            </button>
            <button className="pf-btn act-primary" disabled={busy || !form.name?.trim()} onClick={() => void submit()}>
              Créer la campagne
            </button>
          </div>
          {err && <p className="pf-note pf-err">{err}</p>}
        </div>
      )}

      {cur && !form && (
        <div className={`cp-info ${cur.closed ? 'closed' : ''}`}>
          <span>
            {[opName(cur.operation), cur.date && day(cur.date), cur.place].filter(Boolean).join(' · ') || 'Campagne'}
            {cur.closed && <em> · close</em>}
          </span>
          {p.canEdit && (
            <button className="ab-link" onClick={() => void p.update(cur.id, { closed: !cur.closed })}>
              {cur.closed ? 'Rouvrir' : 'Clore'}
            </button>
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
