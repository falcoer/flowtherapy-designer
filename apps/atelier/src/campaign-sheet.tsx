import { useState } from 'react';
import { CampaignForm, day } from './campaigns-ui';
import { FORMATS, formatOf } from './model';
import { REVIEW_LABELS, thumbUrl, type ActivityProfile, type AtelierMeta, type Campaign, type CampaignInput, type Operation, type PlanItem } from './server';
import { channelsOf, formatsFor, targetLabel } from './targets';
import { FmtGlyph, MediaIcon } from './targets-ui';

/** Délais par défaut avant l'évènement : affiche et post trois semaines avant, un rappel quelques jours avant ; la story au cas par cas. */
export const LEAD_DAYS = 21;
export const REMINDER_DAYS = 3;

export const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || 'rendu';
const uniqueId = (base: string, taken: PlanItem[]) => {
  let id = slug(base);
  for (let i = 2; taken.some((x) => x.id === id); i++) id = `${slug(base)}-${i}`;
  return id;
};

/** Plan prérempli par l'occasion : chaque rendu à trois semaines (la story sans date), puis un rappel sur le premier réseau social. */
export function planFromOperation(op: Operation | undefined, date: string | undefined, activity: ActivityProfile | null): PlanItem[] {
  if (!op) return [];
  const chans = channelsOf(activity);
  const out: PlanItem[] = [];
  for (const t of op.targets) {
    const story = t.format === 'story';
    out.push({ id: uniqueId(`${t.channel ?? ''}-${t.format}`, out), ...t, ...(date && !story ? { date: addDays(date, -LEAD_DAYS) } : {}) });
  }
  const social = op.targets.find((t) => t.format !== 'story' && chans.find((c) => c.id === t.channel)?.kind === 'social');
  if (social && date) out.push({ id: uniqueId(`${social.channel}-rappel`, out), ...social, label: 'rappel', date: addDays(date, -REMINDER_DAYS) });
  return out;
}

type StateKey = 'todo' | 'doing' | 'proposed' | 'changes' | 'ready' | 'published';
const STATE_LABELS: Record<StateKey, string> = { todo: 'à faire', doing: 'en cours', proposed: 'proposée', changes: 'à revoir', ready: 'prête', published: 'publiée' };
const stateOf = (it: PlanItem, m?: AtelierMeta): StateKey =>
  it.published ? 'published' : !m ? 'todo' : m.review?.status === 'approved' ? 'ready' : m.review?.status === 'changes' ? 'changes' : m.review?.status === 'proposed' ? 'proposed' : 'doing';

const who = (e?: string) => (e ? e.split('@')[0] : '');
const today = () => new Date().toISOString().slice(0, 10);

/** Fiche d'une campagne : ses infos, son plan de publication, les compositions proposées par les membres. */
export function CampaignSheet(p: {
  campaign: Campaign;
  operations: Operation[];
  activity: ActivityProfile | null;
  projects: AtelierMeta[];
  canEdit: boolean;
  current?: string;
  onSave: (c: CampaignInput) => Promise<void>;
  onOpen: (m: AtelierMeta) => void;
  onClose: () => void;
}) {
  const c = p.campaign;
  // le stylo ouvre la fiche pour la compléter : le formulaire d'abord
  const [editing, setEditing] = useState(p.canEdit);
  const [err, setErr] = useState('');
  const [adding, setAdding] = useState('');
  const op = p.operations.find((o) => o.id === c.operation);
  const plan = c.plan ?? [];
  const mine = p.projects.filter((m) => m.campaign === c.id).sort((a, b) => (b.votes?.length ?? 0) - (a.votes?.length ?? 0) || b.updated.localeCompare(a.updated));
  // validation au global : la composition validée la mieux notée est retenue par défaut
  const suggested = mine.find((m) => m.review?.status === 'approved');
  const save = (x: CampaignInput) => p.onSave(x).then(() => setErr(''), (e: Error) => setErr(e.message));
  const setPlan = (next: PlanItem[]) => void save({ plan: next });
  const patch = (id: string, x: Partial<PlanItem>) =>
    setPlan(
      plan.map((it) => {
        if (it.id !== id) return it;
        const n = { ...it, ...x };
        for (const k of Object.keys(x) as (keyof PlanItem)[]) if (x[k] === undefined || x[k] === '') delete n[k];
        return n;
      }),
    );
  const channels = channelsOf(p.activity);
  const choices = [...channels.flatMap((ch) => formatsFor(ch).map((f) => ({ key: `${ch.id}/${f.id}`, channel: ch.id, format: f.id }))), ...FORMATS.map((f) => ({ key: `/${f.id}`, channel: undefined, format: f.id }))];

  return (
    <div className="cp-modal-back" onPointerDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div className="cp-modal wide cs-modal" role="dialog" aria-label={`Campagne ${c.name}`} onPointerDown={(e) => e.stopPropagation()}>
        <div className="pf-head">
          <span className="b-title">Campagne · {c.name}</span>
          <button className="lamp-close" onClick={p.onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        {editing ? (
          <CampaignForm
            initial={{ id: c.id, name: c.name, operation: c.operation, date: c.date, place: c.place, time: c.time, kind: c.kind, contact: c.contact }}
            operations={p.operations}
            onCancel={() => setEditing(false)}
            onSubmit={async ({ id: _id, ...data }) => {
              await p.onSave(data);
              setEditing(false);
            }}
          />
        ) : (
          <section className="cs-info">
            <div className="cs-lines">
              <b>{c.name}</b>
              {(op || c.kind) && <span>{[op?.name, c.kind].filter(Boolean).join(' · ')}</span>}
              {(c.date || c.time || c.place) && <span>{[c.date && day(c.date), c.time && `accueil ${c.time.replace(':', 'h')}`, c.place].filter(Boolean).join(' · ')}</span>}
              {c.contact && (
                <span>
                  Réservation : {[c.contact.name, c.contact.phone].filter(Boolean).join(', ')}
                  {c.contact.email && (
                    <>
                      {c.contact.name || c.contact.phone ? ', ' : ''}
                      <a href={`mailto:${c.contact.email}`}>{c.contact.email}</a>
                    </>
                  )}
                </span>
              )}
            </div>
            {p.canEdit && (
              <button className="pf-btn" onClick={() => setEditing(true)}>
                Modifier
              </button>
            )}
          </section>
        )}

        <div className="cp-sub">Plan de publication</div>
        <div className="cs-plan">
          {plan.map((it) => {
            const chosen = it.composition ? p.projects.find((m) => m.id === it.composition) : suggested;
            const st = stateOf(it, chosen);
            const late = !it.published && !!it.date && it.date < today();
            const ch = channels.find((x) => x.id === it.channel);
            return (
              <div key={it.id} className={`cs-row st-${st} ${late ? 'late' : ''}`}>
                <span className="cs-target" title={targetLabel(it, p.activity)}>
                  <MediaIcon ch={ch} />
                  <FmtGlyph id={it.format} />
                  <span className="cs-tname">
                    {targetLabel(it, p.activity)}
                    {p.canEdit ? (
                      <input className="cs-label" value={it.label ?? ''} placeholder="précision…" onChange={(e) => patch(it.id, { label: e.target.value || undefined })} aria-label="Nature de la publication" />
                    ) : (
                      it.label && <small> · {it.label}</small>
                    )}
                  </span>
                </span>
                <input className="pf-input cs-date" type="date" value={it.date ?? ''} disabled={!p.canEdit} onChange={(e) => patch(it.id, { date: e.target.value || undefined })} aria-label="Date de publication" title={it.date ? '' : 'Pas encore de date'} />
                <select className="pf-input cs-compo" value={it.composition ?? ''} disabled={!p.canEdit} onChange={(e) => patch(it.id, { composition: e.target.value || undefined })} aria-label="Composition retenue">
                  <option value="">{suggested ? `${suggested.title} (validée)` : 'à choisir'}</option>
                  {mine.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                      {m.review ? ` · ${REVIEW_LABELS[m.review.status].toLowerCase()}` : ''}
                    </option>
                  ))}
                </select>
                <span className={`cs-state st-${st}`}>{late && st !== 'published' ? 'en retard' : STATE_LABELS[st]}</span>
                {p.canEdit && (
                  <span className="cs-acts">
                    {it.published ? (
                      <button className="ab-link" onClick={() => patch(it.id, { published: undefined, link: undefined })} title="Remettre à publier">
                        Annuler
                      </button>
                    ) : (
                      <button className="ab-link" disabled={!chosen} onClick={() => patch(it.id, { published: new Date().toISOString(), ...(it.composition || !chosen ? {} : { composition: chosen.id }) })} title={chosen ? 'Marquer ce rendu comme publié' : 'Choisis d’abord une composition'}>
                        Publiée
                      </button>
                    )}
                    <button className="cs-del" onClick={() => setPlan(plan.filter((x) => x.id !== it.id))} title="Retirer du plan" aria-label="Retirer du plan">
                      ×
                    </button>
                  </span>
                )}
                {it.published && (
                  <div className="cs-pub">
                    <span>Publiée le {new Date(it.published).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
                    {p.canEdit ? (
                      <input className="pf-input cs-link" type="url" placeholder="Lien de la publication" defaultValue={it.link ?? ''} onBlur={(e) => e.target.value !== (it.link ?? '') && patch(it.id, { link: e.target.value || undefined })} />
                    ) : null}
                    {it.link && (
                      <a className="ab-link" href={it.link} target="_blank" rel="noreferrer">
                        Voir
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!plan.length && <p className="fx-hint">Rien de prévu pour l’instant.</p>}
        </div>
        {p.canEdit && (
          <div className="cs-add">
            {!plan.length && op && (
              <button className="pf-btn act-primary" onClick={() => setPlan(planFromOperation(op, c.date, p.activity))}>
                Préremplir pour « {op.name} »
              </button>
            )}
            <select
              className="pf-input"
              value={adding}
              onChange={(e) => {
                const ch = choices.find((x) => x.key === e.target.value);
                setAdding('');
                if (!ch) return;
                const t = { ...(ch.channel ? { channel: ch.channel } : {}), format: ch.format };
                setPlan([...plan, { id: uniqueId(`${ch.channel ?? ''}-${ch.format}`, plan), ...t, ...(c.date && ch.format !== 'story' ? { date: addDays(c.date, -LEAD_DAYS) } : {}) }]);
              }}
              aria-label="Ajouter un rendu au plan"
            >
              <option value="">+ Ajouter un rendu…</option>
              {choices.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.channel ? targetLabel({ channel: x.channel, format: x.format }, p.activity) : `Libre · ${formatOf(x.format).title}`}
                </option>
              ))}
            </select>
          </div>
        )}
        {err && <p className="pf-err">{err}</p>}

      </div>
    </div>
  );
}
