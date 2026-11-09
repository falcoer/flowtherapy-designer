import { useEffect, useMemo, useState } from 'react';
import { VoteButton, day } from './campaigns-ui';
import { ActivityMark } from './activity';
import { Icon } from './icons';
import { formatOf } from './model';
import { REVIEW_LABELS, thumbUrl, type ActivityProfile, type AtelierMeta, type Campaign, type Operation, type PlanItem, type Target } from './server';
import { channelsOf, targetLabel } from './targets';
import { MediaIcon } from './targets-ui';

const who = (e?: string) => (e ? e.split('@')[0] : '');
const when = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const short = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const today = () => new Date().toISOString().slice(0, 10);
const sameTarget = (a: Target, b: Target) => (a.channel ?? '') === (b.channel ?? '') && a.format === b.format;

/** Une publication d'une composition : un de ses rendus, et ce que le plan de la campagne en prévoit. */
interface Pub {
  target: Target;
  rows: PlanItem[];
}
type PubState = 'published' | 'late' | 'planned' | 'free';
const pubState = (p: Pub): PubState => {
  if (!p.rows.length) return 'free';
  if (p.rows.every((r) => r.published)) return 'published';
  if (p.rows.some((r) => !r.published && r.date && r.date < today())) return 'late';
  return 'planned';
};
const pubWhen = (p: Pub) => {
  const next = p.rows.find((r) => !r.published);
  if (!p.rows.length) return 'hors plan';
  const done = p.rows.find((r) => r.published);
  const pub = done?.published ? `publiée le ${short(done.published.slice(0, 10))}` : '';
  if (!next) return pub || 'publiée';
  const todo = next.date ? `${next.label ? `${next.label} ` : ''}${short(next.date)}` : 'à dater';
  return pub ? `${pub} · ${todo}` : todo;
};

/** Les publications d'une composition : ses rendus, reliés aux lignes du plan qui la retiennent. */
function pubsOf(m: AtelierMeta, targets: Target[], campaign: Campaign | undefined, suggested: AtelierMeta | undefined): Pub[] {
  const plan = campaign?.plan ?? [];
  const mine = (it: PlanItem) => it.composition === m.id || (!it.composition && suggested?.id === m.id);
  return targets.map((t) => ({ target: t, rows: plan.filter((it) => sameTarget(it, t) && mine(it)) }));
}

/** L'éventail des publications : une carte par rendu, à sa proportion, l'aperçu dedans, le média en pastille. */
function PubFan({ m, pubs, activity }: { m: AtelierMeta; pubs: Pub[]; activity: ActivityProfile | null }) {
  const channels = channelsOf(activity);
  const n = pubs.length;
  return (
    <span className="pub-fan" aria-label={`${n} publication${n > 1 ? 's' : ''}`}>
      {pubs.slice(0, 6).map((p, i) => {
        const f = formatOf(p.target.format);
        const ratio = Math.min(1.8, Math.max(0.5, f.width / f.height));
        const mid = (Math.min(n, 6) - 1) / 2;
        return (
          <span
            key={i}
            className={`pub-card ps-${pubState(p)}`}
            style={{ width: Math.round(34 * ratio), transform: `rotate(${(i - mid) * 7}deg)`, zIndex: i }}
            title={`${targetLabel(p.target, activity)} · ${pubWhen(p)}`}
          >
            <img src={thumbUrl(m)} alt="" loading="lazy" />
            <span className="pub-media">
              <MediaIcon ch={channels.find((c) => c.id === p.target.channel)} size={13} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * Menu des compositions : la campagne suivie en tête (changer d'un geste, la compléter au stylo pour
 * les responsables), ses compositions chacune avec l'éventail de ses publications, et la composition
 * choisie présentée à côté.
 */
export function CompositionsMenu(p: {
  campaigns: Campaign[];
  operations: Operation[];
  campaign?: Campaign;
  counts: Record<string, number>;
  activity: ActivityProfile | null;
  projects: AtelierMeta[];
  /** composition ouverte dans l'atelier (absente : page pas encore enregistrée) */
  current?: { id: string; title: string };
  currentTargets: Target[];
  saving: 'saved' | 'dirty' | 'saving' | 'error';
  canEdit: boolean;
  isAdmin: boolean;
  canVote: boolean;
  onPickCampaign: (id: string) => void;
  onAllCampaigns: () => void;
  onEditCampaign: () => void;
  onTitle: (t: string) => void;
  onSave: () => void;
  onSaveNew: () => void;
  onNew: () => void;
  onOpen: (m: AtelierMeta) => void;
  onVote: (m: AtelierMeta) => void;
  onDelete: (m: AtelierMeta) => void;
  onMessages: () => void;
  onPublish: () => void;
  onTemplate: (m: AtelierMeta, on: boolean) => void;
  /** montre une publication de la composition ouverte */
  onShowTarget: (i: number) => void;
  /** ouvre directement le changement de campagne */
  switchFirst?: boolean;
}) {
  const c = p.campaign;
  const [switching, setSwitching] = useState(!!p.switchFirst);
  useEffect(() => setSwitching(!!p.switchFirst), [p.switchFirst]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | undefined>(p.current?.id);
  const [armed, setArmed] = useState(false);
  useEffect(() => setArmed(false), [sel]);

  const norm = (s?: string) => (s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const list = useMemo(
    () =>
      p.projects
        .filter((m) => (c ? m.campaign === c.id : !m.campaign))
        .filter((m) => !q || norm(`${m.title} ${m.author ?? m.by ?? ''}`).includes(norm(q)))
        .sort((a, b) => (c ? (b.votes?.length ?? 0) - (a.votes?.length ?? 0) : 0) || b.updated.localeCompare(a.updated)),
    [p.projects, c, q],
  );
  // validation au global : la composition validée la mieux notée est retenue par défaut dans le plan
  const suggested = c ? p.projects.filter((m) => m.campaign === c.id).sort((a, b) => (b.votes?.length ?? 0) - (a.votes?.length ?? 0)).find((m) => m.review?.status === 'approved') : undefined;
  const targetsOf = (m: AtelierMeta): Target[] => (m.id === p.current?.id && p.currentTargets.length ? p.currentTargets : m.targets?.length ? m.targets : [{ format: m.formatId ?? 'a4' }]);
  const chosen = p.projects.find((m) => m.id === sel) ?? (p.current ? p.projects.find((m) => m.id === p.current!.id) : undefined) ?? list[0];
  const isCurrent = !!chosen && chosen.id === p.current?.id;
  const switchList = p.campaigns.filter((x) => !x.closed).sort((a, b) => (a.date && b.date ? a.date.localeCompare(b.date) : a.date ? -1 : b.date ? 1 : b.created.localeCompare(a.created)));
  const d = c?.date ? new Date(`${c.date}T12:00:00`) : null;
  const channels = channelsOf(p.activity);

  return (
    <div className="bubble projects-bubble cm-menu" onPointerDown={(e) => e.stopPropagation()}>
      <div className="cm-cols">
        <div className="cm-left">
          <div className="act-row act-current cm-head">
            <span className={`cm-date ${c ? '' : 'none'}`}>
              {d ? (
                <>
                  <b>{d.getDate()}</b>
                  <small>{d.toLocaleDateString('fr-FR', { month: 'short' })}</small>
                </>
              ) : (
                '—'
              )}
            </span>
            <span className="act-txt">
              <b>{c ? c.name : 'Hors campagne'}</b>
              <small>{c ? [p.operations.find((o) => o.id === c.operation)?.name ?? c.kind, c.time && `accueil ${c.time.replace(':', 'h')}`, c.place].filter(Boolean).join(' · ') || (c.date ? '' : 'pas encore de date') : 'les compositions sans campagne'}</small>
            </span>
            {c && p.isAdmin && (
              <button className="act-icon" onClick={p.onEditCampaign} title="Compléter la campagne : type, date, plan de publication" aria-label="Modifier la campagne">
                <Icon name="pen" />
              </button>
            )}
            <button className={`act-icon ${switching ? 'on' : ''}`} onClick={() => setSwitching(!switching)} title="Changer de campagne" aria-label="Changer de campagne">
              <Icon name="switch" />
            </button>
          </div>
          {switching && (
            <div className="act-switch">
              <button
                className={`act-row act-pick ${!c ? 'on' : ''}`}
                onClick={() => {
                  p.onPickCampaign('');
                  setSwitching(false);
                }}
              >
                <span className="cm-date small none">—</span>
                <span className="act-txt">
                  <b>Hors campagne</b>
                  <small>les compositions sans campagne</small>
                </span>
              </button>
              {switchList.map((x) => {
                const xd = x.date ? new Date(`${x.date}T12:00:00`) : null;
                return (
                  <button
                    key={x.id}
                    className={`act-row act-pick ${x.id === c?.id ? 'on' : ''}`}
                    onClick={() => {
                      p.onPickCampaign(x.id);
                      setSwitching(false);
                    }}
                  >
                    <span className="cm-date small">
                      {xd ? (
                        <>
                          <b>{xd.getDate()}</b>
                          <small>{xd.toLocaleDateString('fr-FR', { month: 'short' })}</small>
                        </>
                      ) : (
                        '—'
                      )}
                    </span>
                    <span className="act-txt">
                      <b>{x.name}</b>
                      <small>{[x.place, `${p.counts[x.id] ?? 0} composition${(p.counts[x.id] ?? 0) > 1 ? 's' : ''}`].filter(Boolean).join(' · ')}</small>
                    </span>
                  </button>
                );
              })}
              <button
                className="row"
                onClick={() => {
                  setSwitching(false);
                  p.onAllCampaigns();
                }}
              >
                <span>{p.canEdit ? 'Nouvelle campagne, campagnes closes…' : 'Campagnes closes, recherche…'}</span>
              </button>
            </div>
          )}

          <div className="cm-tools">
            <button className="pf-btn act-primary" onClick={p.onNew} disabled={!p.canEdit}>
              <Icon name="plus" /> Nouvelle
            </button>
            <input className="pf-input" type="search" placeholder="Chercher…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Chercher une composition" />
          </div>
          <div className="cm-list">
            {!p.current && (
              <div className="cm-row unsaved">
                <span className="cm-thumb empty" />
                <span className="cm-txt">
                  <b>Page non enregistrée</b>
                  <button className="ab-link" onClick={p.onSaveNew}>
                    Enregistrer cette page
                  </button>
                </span>
              </div>
            )}
            {list.map((m) => (
              <button key={m.id} className={`cm-row ${m.id === chosen?.id ? 'sel' : ''} ${m.id === p.current?.id ? 'cur' : ''}`} onClick={() => setSel(m.id)} onDoubleClick={() => m.id !== p.current?.id && p.onOpen(m)}>
                <img className="cm-thumb" src={thumbUrl(m)} alt="" loading="lazy" />
                <span className="cm-txt">
                  <b>{m.id === p.current?.id ? p.current.title : m.title}</b>
                  <small>
                    {[who(m.author ?? m.by), when(m.updated)].filter(Boolean).join(' · ')}
                    {m.votes?.length ? ` · ♥ ${m.votes.length}` : ''}
                    {m.messages ? ` · ${m.messages} msg` : ''}
                  </small>
                  {(m.review || c?.templates?.includes(m.id)) && (
                    <span className="cm-badges">
                      {m.review && <span className={`proj-badge st-${m.review.status}`}>{REVIEW_LABELS[m.review.status]}</span>}
                      {c?.templates?.includes(m.id) && <span className="proj-badge">★ modèle</span>}
                    </span>
                  )}
                </span>
                <PubFan m={m} pubs={pubsOf(m, targetsOf(m), c, suggested)} activity={p.activity} />
              </button>
            ))}
            {!list.length && <p className="fx-hint">{q ? 'Aucune composition ne correspond.' : c ? 'Aucune composition dans cette campagne pour l’instant.' : 'Aucune composition hors campagne.'}</p>}
          </div>
        </div>

        <div className="cm-right">
          {chosen ? (
            <>
              <img className="cm-preview" src={thumbUrl(chosen)} alt="" />
              {isCurrent ? (
                <input className="proj-title" value={p.current!.title} onChange={(e) => p.onTitle(e.target.value)} aria-label="Titre de la composition" />
              ) : (
                <b className="cm-title">{chosen.title}</b>
              )}
              <small className="cm-meta">
                {[who(chosen.author ?? chosen.by), when(chosen.updated)].filter(Boolean).join(' · ')}
                {isCurrent ? ' · ouverte' : ''}
              </small>
              <div className="cur-acts">
                {chosen.review && <span className={`proj-badge st-${chosen.review.status}`}>{REVIEW_LABELS[chosen.review.status]}</span>}
                {p.canVote && <VoteButton votes={chosen.votes ?? []} voted={!!chosen.voted} onVote={() => p.onVote(chosen)} />}
                {c && p.isAdmin && (
                  <button className={`cs-tpl ${c.templates?.includes(chosen.id) ? 'on' : ''}`} onClick={() => p.onTemplate(chosen, !c.templates?.includes(chosen.id))} title="Modèle de la campagne : chacun peut en partir">
                    {c.templates?.includes(chosen.id) ? '★ modèle' : '☆ modèle'}
                  </button>
                )}
                {p.canEdit && (
                  <button
                    className={`ld-del cm-del ${armed ? 'hot' : ''}`}
                    title={armed ? 'Toucher encore pour supprimer' : 'Supprimer'}
                    onClick={() => {
                      if (!armed) return setArmed(true);
                      setArmed(false);
                      p.onDelete(chosen);
                    }}
                  >
                    {armed ? 'Supprimer ?' : '×'}
                  </button>
                )}
              </div>

              <div className="b-sub">Publications</div>
              <div className="cm-pubs">
                {pubsOf(chosen, targetsOf(chosen), c, suggested).map((x, i) => (
                  <button key={i} className={`cm-pub ps-${pubState(x)}`} disabled={!isCurrent || !p.currentTargets.length} onClick={() => p.onShowTarget(i)} title={isCurrent ? 'Voir cette publication' : ''}>
                    <MediaIcon ch={channels.find((ch) => ch.id === x.target.channel)} size={18} />
                    <span>{targetLabel(x.target, p.activity)}</span>
                    <small>{pubWhen(x)}</small>
                  </button>
                ))}
              </div>

              <div className="cm-acts">
                {isCurrent ? (
                  <>
                    <button className="pf-btn" onClick={p.onSave} disabled={p.saving === 'saving'}>
                      {p.saving === 'saving' ? 'Enregistrement…' : p.saving === 'saved' ? 'Enregistrée' : 'Enregistrer'}
                    </button>
                    <button className="pf-btn" onClick={p.onMessages}>
                      Échanges
                    </button>
                    <button className="pf-btn act-primary" onClick={p.onPublish}>
                      Publier
                    </button>
                  </>
                ) : (
                  <button className="pf-btn act-primary" onClick={() => p.onOpen(chosen)}>
                    Ouvrir
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="fx-hint">Choisis une composition dans la liste, ou commence-en une nouvelle.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** La campagne dans la barre du haut : sa date, son nom, la prochaine échéance du plan et les retards. */
const SAVE_LABELS = { saved: 'Enregistrée', dirty: 'Modifications en attente', saving: 'Enregistrement…', error: 'Non enregistrée' } as const;

/**
 * Fil d'Ariane de la barre, en trois boutons : l'activité › la campagne (ou l'occasion hors campagne)
 * › le contenu ouvert, son nom et son type. Un point d'exclamation en indice de l'icône de la campagne
 * signale un problème (rendus en retard).
 */
export function TopCrumbs(p: {
  team?: { name: string; logo?: string } | null;
  campaign?: Campaign;
  /** occasion du document, montrée hors campagne (Logo, Bannières…) */
  occasion?: Operation;
  showCampaign: boolean;
  title?: string;
  kind: string;
  saving?: keyof typeof SAVE_LABELS;
  open: 'activity' | 'campaign' | 'content' | null;
  onActivity: () => void;
  onCampaign: () => void;
  onContent: () => void;
}) {
  const c = p.campaign;
  const t = today();
  const late = (c?.plan ?? []).filter((it) => !it.published && it.date && it.date < t).length;
  const d = c?.date ? new Date(`${c.date}T12:00:00`) : null;
  const mid = c ? c.name : (p.occasion?.name ?? 'Hors campagne');
  const alert = late ? `${late} rendu${late > 1 ? 's' : ''} en retard` : '';
  return (
    <nav className="crumbs" aria-label="Activité, campagne, contenu">
      <button className={`crumb first ${p.open === 'activity' ? 'on' : ''}`} onClick={p.onActivity} title={p.team ? `${p.team.name} : activité, profil, préférences` : 'Activité, profil, préférences'}>
        <ActivityMark team={p.team} size={24} />
        <span className="crumb-txt crumb-act">{p.team?.name ?? 'Atelier'}</span>
      </button>
      {p.showCampaign && (
        <button className={`crumb ${c ? '' : 'none'} ${p.open === 'campaign' ? 'on' : ''}`} onClick={p.onCampaign} title={c ? `${c.name}${c.date ? ` · ${day(c.date)}` : ''}${alert ? ` · ${alert}` : ''}` : `${mid} : choisir une campagne`}>
          <span className="crumb-icon">
            <span className={`cmp-date ${d ? '' : 'none'}`}>
              {d ? (
                <>
                  <b>{d.getDate()}</b>
                  <small>{d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}</small>
                </>
              ) : (
                '—'
              )}
            </span>
            {alert && (
              <span className="crumb-alert" aria-label={alert}>
                !
              </span>
            )}
          </span>
          <span className="crumb-txt">{mid}</span>
        </button>
      )}
      <button className={`crumb last current ${p.open === 'content' ? 'on' : ''}`} onClick={p.onContent} title={`${p.title ?? 'Page non enregistrée'} · ${p.kind}`}>
        <span className="crumb-txt crumb-two">
          <b>{p.title ?? 'Page non enregistrée'}</b>
          <small>{p.kind}</small>
        </span>
        {p.saving && <span className={`save-dot ${p.saving}`} title={SAVE_LABELS[p.saving]} />}
      </button>
    </nav>
  );
}
