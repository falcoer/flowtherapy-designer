import { useMemo, useState, type ReactNode } from 'react';
import { ActivityMark } from './activity';
import { CampaignForm, VoteButton } from './campaigns-ui';
import { HistoryPanel, PubFan, campaignHistory, pubsOf } from './compositions-menu';
import { Icon } from './icons';
import { formatOf } from './model';
import { thumbUrl, type ActivityEvent, type ActivityProfile, type AtelierMeta, type Campaign, type CampaignInput, type Operation, type PlanItem, type Target } from './server';
import { channelsOf, targetLabel } from './targets';
import { MediaIcon } from './targets-ui';

/*
 * Espace des campagnes, en plein écran sous la barre du haut : la liste des campagnes, puis une
 * campagne en trois onglets (compositions, plan de publication, historique). Chaque geste a un
 * bouton écrit ; un seul toucher ouvre une campagne ou une composition.
 */

const today = () => new Date().toISOString().slice(0, 10);
const norm = (s?: string) => (s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const who = (e?: string) => (e ? e.split('@')[0] : '');
const short = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const plural = (n: number, one: string, many = `${one}s`) => (n ? `${n} ${n > 1 ? many : one}` : `aucune ${one}`);

/** Où en est une composition, de son brouillon à sa publication. */
export type Stage = 'draft' | 'proposed' | 'changes' | 'approved' | 'scheduled' | 'published';
export const STAGE_LABELS: Record<Stage, string> = { draft: 'Brouillon', proposed: 'Proposée', changes: 'À revoir', approved: 'Validée', scheduled: 'Programmée', published: 'Publiée' };
export function stageOf(m: AtelierMeta | undefined, c: Campaign | undefined): Stage {
  if (!m) return 'draft';
  // publiée quand tout ce que le plan lui confie est paru ; programmée tant qu'il reste des envois prévus chez Postiz
  const rows = (c?.plan ?? []).filter((it) => it.composition === m.id);
  if (rows.length && rows.every((it) => it.published)) return 'published';
  if (rows.some((it) => !it.published && it.postiz?.state === 'queue')) return 'scheduled';
  return m.review?.status ?? 'draft';
}
export function StagePill({ stage, children }: { stage: Stage; children?: ReactNode }) {
  return <span className={`sp-pill st-${stage}`}>{children ?? STAGE_LABELS[stage]}</span>;
}

/** Tuile de date d'une campagne : jour et mois, un calendrier vide sans date, un tiret hors campagne. */
function DateTile({ c, small }: { c?: Campaign; small?: boolean }) {
  const d = c?.date ? new Date(`${c.date}T12:00:00`) : null;
  return (
    <span className={`sp-date ${small ? 'small' : ''} ${d ? '' : 'none'}`} title={c && !d ? 'Pas encore de date' : undefined}>
      {d ? (
        <>
          <b>{d.getDate()}</b>
          <small>{d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}</small>
        </>
      ) : c ? (
        <Icon name="calendar" />
      ) : (
        '—'
      )}
    </span>
  );
}

const subOf = (c: Campaign, ops: Operation[]) => [ops.find((o) => o.id === c.operation)?.name ?? c.kind, c.time && `accueil ${c.time.replace(':', 'h')}`, c.place, !c.date && 'pas encore de date'].filter(Boolean).join(' · ');

/** La prochaine chose à faire dans une campagne, et sa couleur. */
function nextStep(c: Campaign | undefined, comps: AtelierMeta[]): { tone: 'late' | 'warn' | 'info' | 'ok' | 'muted'; text: string } {
  const t = today();
  const plan = c?.plan ?? [];
  const late = plan.filter((it) => !it.published && it.date && it.date < t);
  if (late.length) return { tone: 'late', text: `${plural(late.length, 'publication')} en retard` };
  const changes = comps.find((m) => m.review?.status === 'changes');
  if (changes) return { tone: 'warn', text: `« ${changes.title} » est à revoir` };
  const proposed = comps.find((m) => m.review?.status === 'proposed');
  if (proposed) return { tone: 'info', text: `« ${proposed.title} » attend la validation` };
  if (!comps.length) return { tone: 'muted', text: 'Commencer par une composition' };
  const next = plan.filter((it) => !it.published && it.date).sort((a, b) => a.date!.localeCompare(b.date!))[0];
  if (next) return { tone: 'ok', text: `Prochaine publication le ${short(next.date!)}` };
  if (c && plan.length && plan.every((it) => it.published)) return { tone: 'ok', text: 'Tout est publié' };
  return { tone: 'muted', text: 'Rien d’urgent' };
}

/** Barre d'avancement : une part par étape des compositions. */
function StageBar({ comps, c }: { comps: AtelierMeta[]; c?: Campaign }) {
  const order: Stage[] = ['published', 'scheduled', 'approved', 'proposed', 'changes', 'draft'];
  const n = comps.map((m) => stageOf(m, c));
  return (
    <span className="sp-bar" aria-hidden>
      {order.map((s) => {
        const k = n.filter((x) => x === s).length;
        return k ? <span key={s} className={`st-${s}`} style={{ flex: k }} /> : null;
      })}
    </span>
  );
}

// ——— liste des campagnes ———

type HomeFilter = 'next' | 'past' | 'nodate';
export function CampaignsHome(p: {
  campaigns: Campaign[];
  operations: Operation[];
  projects: AtelierMeta[];
  canEdit: boolean;
  onOpen: (id: string) => void;
  create: (c: CampaignInput) => Promise<Campaign>;
}) {
  const [filter, setFilter] = useState<HomeFilter>('next');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const t = today();
  const isPast = (c: Campaign) => !!c.closed || (!!c.date && c.date < t);
  const sets: Record<HomeFilter, Campaign[]> = {
    next: p.campaigns.filter((c) => !isPast(c)),
    past: p.campaigns.filter(isPast),
    nodate: p.campaigns.filter((c) => !c.date && !c.closed),
  };
  const list = sets[filter]
    .filter((c) => !q || norm(`${c.name} ${c.place ?? ''} ${c.kind ?? ''}`).includes(norm(q)))
    .sort((a, b) => (filter === 'past' ? (b.date ?? '').localeCompare(a.date ?? '') : a.date && b.date ? a.date.localeCompare(b.date) : a.date ? -1 : b.date ? 1 : b.created.localeCompare(a.created)));
  const loose = p.projects.filter((m) => !m.campaign);

  const card = (c: Campaign | undefined) => {
    const comps = p.projects.filter((m) => (c ? m.campaign === c.id : !m.campaign)).sort((a, b) => b.updated.localeCompare(a.updated));
    const plan = c?.plan ?? [];
    const queued = plan.filter((it) => !it.published && it.postiz?.state === 'queue').length;
    const done = plan.filter((it) => it.published).length;
    const step = nextStep(c, comps);
    return (
      <button key={c?.id ?? ''} className={`sp-card sp-camp ${c ? '' : 'loose'}`} onClick={() => p.onOpen(c?.id ?? '')}>
        <span className="sp-camp-head">
          <DateTile c={c} />
          <span className="sp-txt">
            <b>{c ? c.name : 'Hors campagne'}</b>
            <small>{c ? subOf(c, p.operations) : 'les compositions sans campagne'}</small>
          </span>
        </span>
        <span className="sp-thumbs">
          {comps.slice(0, 4).map((m, i) => (
            <img key={m.id} src={thumbUrl(m)} alt="" loading="lazy" draggable={false} style={{ zIndex: i, transform: `rotate(${(i - Math.min(comps.length, 4) / 2 + 0.5) * 5}deg)` }} />
          ))}
          {!comps.length && <small>Pas encore de composition</small>}
        </span>
        <StageBar comps={comps} c={c} />
        <small className="sp-line">{[plural(comps.length, 'composition'), queued && plural(queued, 'publication programmée', 'publications programmées'), done && plural(done, 'publication parue', 'publications parues')].filter(Boolean).join(' · ')}</small>
        <span className={`sp-next tone-${step.tone}`}>
          <i />
          {step.text}
        </span>
        <span className="sp-open">Ouvrir ›</span>
      </button>
    );
  };

  return (
    <div className="sp-page">
      <div className="sp-row sp-title-row">
        <h1>Campagnes</h1>
        {p.canEdit && (
          <button className="sp-btn primary" onClick={() => setCreating(true)}>
            <Icon name="plus" /> Nouvelle campagne
          </button>
        )}
      </div>
      <div className="sp-row">
        <div className="sp-chips" role="radiogroup" aria-label="Campagnes à montrer">
          {(
            [
              ['next', 'À venir'],
              ['past', 'Passées'],
              ['nodate', 'Sans date'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} role="radio" aria-checked={filter === k} className={`sp-chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>
              {l} <small>{sets[k].length}</small>
            </button>
          ))}
        </div>
        <input className="pf-input sp-search" type="search" placeholder="Chercher une campagne, un lieu…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Chercher une campagne" />
      </div>
      <div className="sp-grid">
        {list.map((c) => card(c))}
        {filter === 'next' && !q && (loose.length > 0 || !list.length) && card(undefined)}
      </div>
      {!list.length && q && <p className="fx-hint">Aucune campagne ne correspond.</p>}

      {creating && (
        <div className="cp-modal-back" onPointerDown={(e) => e.target === e.currentTarget && setCreating(false)}>
          <div className="cp-modal" role="dialog" aria-label="Nouvelle campagne" onPointerDown={(e) => e.stopPropagation()}>
            <div className="pf-head">
              <span className="b-title">Nouvelle campagne</span>
              <button className="lamp-close" onClick={() => setCreating(false)} aria-label="Fermer">
                ×
              </button>
            </div>
            <CampaignForm
              initial={{ name: '', operation: p.operations[0]?.id }}
              operations={p.operations}
              onCancel={() => setCreating(false)}
              onSubmit={async ({ id: _id, ...data }) => {
                const c = await p.create(data);
                setCreating(false);
                p.onOpen(c.id);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ——— une campagne ———

const FILTERS = [
  { id: 'all', label: 'Toutes' },
  { id: 'mine', label: 'Les miennes' },
  { id: 'proposed', label: 'Proposées' },
  { id: 'approved', label: 'Validées' },
  { id: 'changes', label: 'À revoir' },
  { id: 'templates', label: 'Modèles' },
] as const;
type FilterId = (typeof FILTERS)[number]['id'];
type Tab = 'comps' | 'plan' | 'history';

export function CampaignPage(p: {
  campaign?: Campaign;
  campaigns: Campaign[];
  operations: Operation[];
  projects: AtelierMeta[];
  activity: ActivityProfile | null;
  /** composition ouverte dans l'atelier, et ses publications telles qu'elles sont en ce moment */
  current?: { id: string; title: string };
  currentTargets: Target[];
  events: ActivityEvent[] | null;
  me: string;
  canEdit: boolean;
  isAdmin: boolean;
  canVote: boolean;
  tab: Tab;
  onTab: (t: Tab) => void;
  onSheet: () => void;
  onClose: (closed: boolean) => void;
  onNew: () => void;
  onOpen: (m: AtelierMeta, target?: number) => void;
  onVote: (m: AtelierMeta) => void;
  onTemplate: (m: AtelierMeta, on: boolean) => void;
  onRename: (m: AtelierMeta, title: string) => Promise<void>;
  onDuplicate: (m: AtelierMeta) => void;
  onDelete: (m: AtelierMeta) => void;
}) {
  const c = p.campaign;
  const [filter, setFilter] = useState<FilterId>('all');
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState<string | null>(null);
  const [headMenu, setHeadMenu] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const t = today();

  const inCampaign = (m: AtelierMeta) => (c ? m.campaign === c.id : !m.campaign);
  const titleOf = (m: AtelierMeta) => (m.id === p.current?.id ? p.current.title : m.title);
  const mine = p.projects.filter(inCampaign);
  const suggested = c ? [...mine].sort((a, b) => (b.votes?.length ?? 0) - (a.votes?.length ?? 0)).find((m) => m.review?.status === 'approved') : undefined;
  const targetsOf = (m: AtelierMeta): Target[] => (m.id === p.current?.id && p.currentTargets.length ? p.currentTargets : m.targets?.length ? m.targets : [{ format: m.formatId ?? 'a4' }]);
  const keep = (m: AtelierMeta) => {
    switch (filter) {
      case 'mine':
        return (m.author ?? m.by) === p.me;
      case 'proposed':
      case 'approved':
      case 'changes':
        return m.review?.status === filter;
      case 'templates':
        return !!c?.templates?.includes(m.id);
      default:
        return true;
    }
  };
  const list = useMemo(
    () =>
      mine
        .filter(keep)
        .filter((m) => !q || norm(`${titleOf(m)} ${m.author ?? m.by ?? ''}`).includes(norm(q)))
        .sort((a, b) => (c ? (b.votes?.length ?? 0) - (a.votes?.length ?? 0) : 0) || b.updated.localeCompare(a.updated)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.projects, c, q, filter, p.me, p.current?.title],
  );

  // à faire : ce qui attend quelqu'un dans la campagne
  const plan = c?.plan ?? [];
  const late = plan.filter((it) => !it.published && it.date && it.date < t);
  const todo: Array<{ key: string; tone: string; text: ReactNode; act: string; go: () => void }> = [];
  if (late.length) todo.push({ key: 'late', tone: 'late', text: `${plural(late.length, 'publication')} en retard dans le plan`, act: 'Voir le plan', go: () => p.onTab('plan') });
  for (const m of mine.filter((x) => x.review?.status === 'changes' && (!p.isAdmin || (x.author ?? x.by) === p.me)).slice(0, 2))
    todo.push({
      key: `c-${m.id}`,
      tone: 'warn',
      text: (
        <>
          <b>{who(m.review?.reviewedBy) || 'Un responsable'}</b> a renvoyé « {titleOf(m)} »{m.review?.reviewNote ? ` : « ${m.review.reviewNote} »` : ''}
        </>
      ),
      act: 'Ouvrir',
      go: () => p.onOpen(m),
    });
  if (p.isAdmin)
    for (const m of mine.filter((x) => x.review?.status === 'proposed').slice(0, 2))
      todo.push({ key: `p-${m.id}`, tone: 'info', text: `« ${titleOf(m)} » attend ta validation`, act: 'Ouvrir', go: () => p.onOpen(m) });

  const tabs: Array<[Tab, string, number | null]> = [
    ['comps', 'Compositions', mine.length],
    ...(c ? ([['plan', 'Plan de publication', plan.length]] as Array<[Tab, string, number]>) : []),
    ['history', 'Historique', null],
  ];
  const tab = !c && p.tab === 'plan' ? 'comps' : p.tab;

  const compCard = (m: AtelierMeta) => {
    const tpl = !!c?.templates?.includes(m.id);
    const pubs = pubsOf(m, targetsOf(m), c, suggested);
    const stage = stageOf(m, c);
    const open = () => {
      if (menu || renaming?.id === m.id) return;
      p.onOpen(m);
    };
    return (
      <div
        key={m.id}
        className={`sp-card sp-comp ${m.id === p.current?.id ? 'cur' : ''}`}
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && (e.preventDefault(), open())}
        aria-label={`Ouvrir « ${titleOf(m)} »`}
      >
        <span className="sp-fan">
          <PubFan m={m} pubs={pubs} activity={p.activity} size={pubs.length > 4 ? 64 : 80} />
        </span>
        <span className="sp-comp-head">
          {renaming?.id === m.id ? (
            <input
              className="pf-input sp-rename"
              autoFocus
              value={renaming.title}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setRenaming({ id: m.id, title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setRenaming(null);
              }}
              onBlur={() => {
                const next = renaming.title.trim();
                setRenaming(null);
                if (next && next !== titleOf(m)) void p.onRename(m, next);
              }}
              aria-label="Nouveau titre"
            />
          ) : (
            <b>{titleOf(m)}</b>
          )}
          <StagePill stage={stage} />
        </span>
        <small className="sp-line">
          {[plural(pubs.length, 'publication'), m.messages ? plural(m.messages, 'message') : '', who(m.author ?? m.by), short(m.updated.slice(0, 10))].filter(Boolean).join(' · ')}
        </small>
        <span className="sp-comp-foot" onClick={(e) => e.stopPropagation()}>
          <button className="sp-btn primary sm" onClick={() => p.onOpen(m)}>
            {m.id === p.current?.id ? 'Revenir' : 'Ouvrir'}
          </button>
          {p.canVote ? <VoteButton votes={m.votes ?? []} voted={!!m.voted} onVote={() => p.onVote(m)} /> : !!m.votes?.length && <span className="vote">♥ {m.votes.length}</span>}
          {tpl && (
            <span className="cm-star on" title="Modèle de la campagne : chacun peut en partir">
              ★
            </span>
          )}
          <span className="sp-grow" />
          {p.canEdit && (
            <button
              className={`sp-more ${menu === m.id ? 'on' : ''}`}
              onClick={() => {
                setConfirm(null);
                setMenu(menu === m.id ? null : m.id);
              }}
              aria-label="Plus d’actions"
              aria-expanded={menu === m.id}
              title="Renommer, dupliquer, modèle, supprimer"
            >
              <Icon name="more" />
            </button>
          )}
        </span>
        {menu === m.id && (
          <span className="sp-menu" role="menu" onClick={(e) => e.stopPropagation()}>
            {confirm === m.id ? (
              <>
                <span className="sp-menu-q">Supprimer « {titleOf(m)} » et ses publications ?</span>
                <button
                  className="danger"
                  role="menuitem"
                  onClick={() => {
                    setMenu(null);
                    setConfirm(null);
                    p.onDelete(m);
                  }}
                >
                  <Icon name="trash" /> Supprimer
                </button>
                <button role="menuitem" onClick={() => setConfirm(null)}>
                  Annuler
                </button>
              </>
            ) : (
              <>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenu(null);
                    setRenaming({ id: m.id, title: titleOf(m) });
                  }}
                >
                  <Icon name="pen" /> Renommer
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenu(null);
                    p.onDuplicate(m);
                  }}
                >
                  <Icon name="duplicate" /> Dupliquer
                </button>
                {c && p.isAdmin && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenu(null);
                      p.onTemplate(m, !tpl);
                    }}
                  >
                    <span className="sp-star">{tpl ? '☆' : '★'}</span> {tpl ? 'Ne plus en faire un modèle' : 'En faire un modèle'}
                  </button>
                )}
                <button className="danger" role="menuitem" onClick={() => setConfirm(m.id)}>
                  <Icon name="trash" /> Supprimer…
                </button>
              </>
            )}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="sp-page" onClick={() => (menu || headMenu) && (setMenu(null), setHeadMenu(false), setConfirm(null))}>
      <div className="sp-camp-top">
        <DateTile c={c} />
        <span className="sp-txt">
          <h1>{c ? c.name : 'Hors campagne'}</h1>
          <small>{c ? subOf(c, p.operations) : 'les compositions sans campagne'}</small>
        </span>
        {c && (
          <span className="sp-head-acts">
            <button className="sp-btn" onClick={p.onSheet} title="Infos de l’évènement, contact, plan de publication">
              {p.canEdit ? (
                <>
                  <Icon name="pen" /> Modifier la campagne
                </>
              ) : (
                'Fiche de la campagne'
              )}
            </button>
            {p.canEdit && (
              <span className="sp-rel">
                <button
                  className={`sp-more ${headMenu ? 'on' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setHeadMenu(!headMenu);
                  }}
                  aria-label="Plus d’actions sur la campagne"
                  aria-expanded={headMenu}
                >
                  <Icon name="more" />
                </button>
                {headMenu && (
                  <span className="sp-menu right" role="menu">
                    <button
                      role="menuitem"
                      onClick={() => {
                        setHeadMenu(false);
                        p.onClose(!c.closed);
                      }}
                    >
                      {c.closed ? 'Rouvrir la campagne' : 'Clore la campagne'}
                    </button>
                  </span>
                )}
              </span>
            )}
          </span>
        )}
      </div>

      <div className="sp-tabs" role="tablist">
        {tabs.map(([k, l, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`sp-tab ${tab === k ? 'on' : ''}`} onClick={() => p.onTab(k)}>
            {l}
            {n !== null && <small>{n}</small>}
          </button>
        ))}
      </div>

      {tab === 'comps' && (
        <>
          {todo.length > 0 && (
            <div className="sp-todo">
              {todo.map((x) => (
                <div key={x.key} className={`sp-todo-row tone-${x.tone}`}>
                  <span className="sp-todo-txt">
                    <b className="sp-todo-k">À faire</b> {x.text}
                  </span>
                  <button className="sp-btn sm" onClick={x.go}>
                    {x.act}
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="sp-row">
            <div className="sp-chips" role="radiogroup" aria-label="Compositions à montrer">
              {FILTERS.filter((x) => x.id !== 'templates' || c).map((x) => (
                <button key={x.id} role="radio" aria-checked={filter === x.id} className={`sp-chip ${filter === x.id ? 'on' : ''}`} onClick={() => setFilter(x.id)}>
                  {x.label}
                </button>
              ))}
            </div>
            <input className="pf-input sp-search" type="search" placeholder="Chercher une composition…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Chercher une composition" />
          </div>
          <div className="sp-grid">
            {list.map(compCard)}
            {p.canEdit && filter === 'all' && !q && (
              <button className="sp-card sp-new" onClick={p.onNew}>
                <Icon name="plus" />
                <b>Nouvelle composition</b>
                <small>page blanche, modèle ou copie</small>
              </button>
            )}
          </div>
          {!list.length && (q || filter !== 'all') && <p className="fx-hint">Aucune composition ne correspond.</p>}
        </>
      )}

      {tab === 'plan' && c && <PlanTab c={c} projects={mine} suggested={suggested} activity={p.activity} canEdit={p.canEdit} targetsOf={targetsOf} titleOf={titleOf} onOpen={p.onOpen} onSheet={p.onSheet} />}

      {tab === 'history' && (
        <div className="sp-history">
          <HistoryPanel
            items={campaignHistory(p.events, c)}
            events={p.events}
            me={p.me}
            campaigns={p.campaigns}
            activity={p.activity}
            folded={false}
            empty="Rien encore : les compositions, messages, votes, validations et publications de la campagne s’inscriront ici."
          />
        </div>
      )}
    </div>
  );
}

/** État d'une ligne du plan, du point de vue de la publication. */
type RowState = 'published' | 'scheduled' | 'error' | 'late' | Stage | 'pick';
const ROW_LABELS: Record<RowState, string> = { ...STAGE_LABELS, approved: 'Prête', error: 'Erreur', late: 'En retard', pick: 'À choisir' };

function PlanTab(p: {
  c: Campaign;
  projects: AtelierMeta[];
  suggested?: AtelierMeta;
  activity: ActivityProfile | null;
  canEdit: boolean;
  targetsOf: (m: AtelierMeta) => Target[];
  titleOf: (m: AtelierMeta) => string;
  onOpen: (m: AtelierMeta, target?: number) => void;
  onSheet: () => void;
}) {
  const t = today();
  const channels = channelsOf(p.activity);
  const rows = [...(p.c.plan ?? [])].sort((a, b) => (a.date && b.date ? a.date.localeCompare(b.date) : a.date ? -1 : b.date ? 1 : 0));
  const groupOf = (it: PlanItem) => (it.date ? new Date(`${it.date}T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : 'Sans date');
  const stateOf = (it: PlanItem, m?: AtelierMeta): RowState => {
    if (it.published) return 'published';
    if (it.postiz?.state === 'error') return 'error';
    if (it.postiz?.state === 'queue') return 'scheduled';
    if (it.date && it.date < t) return 'late';
    if (!m) return 'pick';
    return m.review?.status ?? 'draft';
  };
  let last = '';
  return (
    <div className="sp-plan">
      <div className="sp-row">
        <p className="fx-hint sp-grow">Une ligne par publication prévue. La toucher ouvre la composition sur cette publication ; on programme depuis Publier.</p>
        {p.canEdit && (
          <button className="sp-btn sm" onClick={p.onSheet}>
            <Icon name="pen" /> Modifier le plan
          </button>
        )}
      </div>
      {!rows.length && <p className="fx-hint">Rien de prévu pour l’instant.{p.canEdit ? ' « Modifier le plan » ajoute des dates et des rendus.' : ''}</p>}
      {rows.map((it) => {
        const m = it.composition ? p.projects.find((x) => x.id === it.composition) : p.suggested;
        const ts = m ? p.targetsOf(m) : [];
        const idx = ts.findIndex((x) => (x.channel ?? '') === (it.channel ?? '') && x.format === it.format);
        const st = stateOf(it, m);
        const g = groupOf(it);
        const head = g !== last;
        last = g;
        const f = formatOf(it.format);
        const when = it.date ? new Date(`${it.date}T12:00:00`) : null;
        const at = it.postiz?.at ? new Date(it.postiz.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
        return (
          <div key={it.id} className="sp-plan-item">
            {head && <div className="sp-plan-group">{g}</div>}
            <button className={`sp-plan-row sp-st-${st}`} onClick={() => (m ? p.onOpen(m, idx >= 0 ? idx : 0) : p.canEdit && p.onSheet())} disabled={!m && !p.canEdit}>
              <span className="sp-when">
                {when ? (
                  <>
                    <b>{when.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</b>
                    <small>{at || when.toLocaleDateString('fr-FR', { weekday: 'short' })}</small>
                  </>
                ) : (
                  <small>à dater</small>
                )}
              </span>
              <span className="sp-plan-thumb" style={{ aspectRatio: `${Math.min(1.8, Math.max(0.5, f.width / f.height))}` }}>
                {m && <img src={thumbUrl(m, idx >= 0 ? idx : undefined)} alt="" loading="lazy" draggable={false} />}
              </span>
              <span className="sp-txt">
                <b>
                  <MediaIcon ch={channels.find((x) => x.id === it.channel)} size={15} /> {targetLabel(it, p.activity)}
                  {it.label ? <small> · {it.label}</small> : null}
                </b>
                <small>{m ? `${p.titleOf(m)}${!it.composition ? ' · retenue par défaut' : ''}` : 'composition à choisir'}</small>
              </span>
              <StagePill stage={(st === 'late' || st === 'error' || st === 'pick' ? 'changes' : st) as Stage}>{ROW_LABELS[st]}</StagePill>
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ——— dans l'atelier ———

/**
 * Gauche de la barre : la marque de l'activité (son menu), le retour vers la campagne (ou vers la
 * liste des campagnes), et le titre de la composition ouverte (son menu).
 */
export function BackNav(p: {
  team?: { name: string; logo?: string } | null;
  /** où ramène le bouton retour : la campagne de la composition, sinon la liste */
  campaign?: Campaign;
  showCampaign: boolean;
  /** dans l'espace des campagnes : seulement la marque, et le retour à la liste depuis une campagne */
  space: 'campaigns' | 'campaign' | null;
  title?: string;
  saving?: 'saved' | 'dirty' | 'saving' | 'error';
  activityOn: boolean;
  titleOn: boolean;
  onActivity: () => void;
  onBack: () => void;
  onTitle: () => void;
}) {
  const c = p.campaign;
  const late = (c?.plan ?? []).filter((it) => !it.published && it.date && it.date < today()).length;
  return (
    <nav className="sp-nav" aria-label="Navigation">
      <button className={`sp-mark ${p.activityOn ? 'on' : ''} ${p.space === 'campaigns' ? 'wide' : ''}`} onClick={p.onActivity} title={p.team ? `${p.team.name} : activité` : 'Activité'}>
        <ActivityMark team={p.team} size={26} />
        {p.space === 'campaigns' && <span>{p.team?.name ?? 'Atelier'}</span>}
      </button>
      {p.space === 'campaign' && (
        <button className="sp-back" onClick={p.onBack}>
          <Icon name="back" />
          <span>Campagnes</span>
        </button>
      )}
      {!p.space && p.showCampaign && (
        <button className="sp-back" onClick={p.onBack} title={c ? `Revenir à la campagne « ${c.name} »` : 'Revenir aux campagnes'}>
          <Icon name="back" />
          <span className="sp-back-txt">{c ? c.name : 'Campagnes'}</span>
          {late > 0 && (
            <span className="crumb-alert" aria-label={`${late} rendu${late > 1 ? 's' : ''} en retard`}>
              !
            </span>
          )}
        </button>
      )}
      {!p.space && (
        <button className={`sp-title ${p.titleOn ? 'on' : ''}`} onClick={p.onTitle} title="La composition : titre, publications, historique">
          <span>{p.title ?? 'Page non enregistrée'}</span>
          {p.saving === 'error' && (
            <span className="crumb-alert inline" aria-label="Non enregistrée">
              !
            </span>
          )}
        </button>
      )}
    </nav>
  );
}

/** Les publications de la composition en onglets sous la barre : toucher change la page affichée, ⚙ la règle, ＋ en ajoute une. */
export function PubTabs(p: { targets: Target[]; active: number; activity: ActivityProfile | null; editing: boolean; canEdit: boolean; onShow: (i: number) => void; onEdit: () => void; onAdd: () => void }) {
  const channels = channelsOf(p.activity);
  return (
    <div className="sp-pubs" role="tablist" aria-label="Publications de la composition" onPointerDown={(e) => e.stopPropagation()}>
      {p.targets.map((t, i) => {
        const f = formatOf(t.format);
        const r = Math.min(1.6, Math.max(0.55, f.width / f.height));
        const on = i === p.active;
        return (
          <span key={i} className={`sp-pub ${on ? 'on' : ''}`}>
            <button role="tab" aria-selected={on} className="sp-pub-main" onClick={() => (on ? p.onEdit() : p.onShow(i))} title={on ? 'Régler cette publication' : `Afficher ${targetLabel(t, p.activity)}`}>
              <MediaIcon ch={channels.find((c) => c.id === t.channel)} size={15} />
              <span className="sp-glyph" style={{ width: Math.round(13 * Math.min(1, r)), height: Math.round(13 / Math.max(1, r)) }} />
              <span className="sp-pub-name">{targetLabel(t, p.activity)}</span>
            </button>
            {on && (
              <button className={`sp-gear ${p.editing ? 'on' : ''}`} onClick={p.onEdit} title="Régler cette publication : réseau, format, résolution, variante, marges" aria-label="Régler cette publication">
                <Icon name="settings" />
              </button>
            )}
          </span>
        );
      })}
      {p.canEdit && (
        <button className="sp-pub-add" onClick={p.onAdd} title="Ajouter une publication à la composition">
          <Icon name="plus" />
          <span>Publication</span>
        </button>
      )}
    </div>
  );
}

/** Pastille d'état de la composition : l'étape, et en la touchant le circuit et l'action suivante. */
export function StageButton(p: {
  meta?: AtelierMeta;
  campaign?: Campaign;
  open: boolean;
  owner: boolean;
  canPropose: boolean;
  onToggle: () => void;
  onStep: (a: 'propose' | 'approve' | 'changes') => void;
  onPublish: () => void;
  onMessages: () => void;
}) {
  const m = p.meta;
  const stage = stageOf(m, p.campaign);
  const order: Stage[] = ['draft', 'proposed', 'approved', 'scheduled', 'published'];
  const at = stage === 'changes' ? 1 : order.indexOf(stage);
  const next: Record<Stage, string> = { draft: 'Proposer', proposed: p.owner ? 'Valider' : 'En attente', changes: 'À corriger', approved: 'Programmer', scheduled: 'Programmée', published: '' };
  const r = m?.review;
  return (
    <span className="sp-rel">
      <button className={`sp-stage ${p.open ? 'on' : ''}`} onClick={p.onToggle} title="Où en est la composition, et l’étape suivante" aria-expanded={p.open}>
        <StagePill stage={stage} />
        {next[stage] && <span className="sp-stage-next">{next[stage]} ›</span>}
      </button>
      {p.open && (
        <div className="bubble sp-stage-pop" onPointerDown={(e) => e.stopPropagation()}>
          <div className="sp-row">
            <b className="sp-grow">Où en est « {m?.title ?? 'la page'} »</b>
            <StagePill stage={stage} />
          </div>
          {stage === 'changes' && r?.reviewNote && (
            <div className="sp-quote">
              <b>{who(r.reviewedBy) || 'Responsable'}</b> : « {r.reviewNote} »
            </div>
          )}
          {stage === 'proposed' && r?.note && (
            <div className="sp-quote info">
              <b>{who(r.proposedBy)}</b> : « {r.note} »
            </div>
          )}
          <ol className="sp-track">
            {['Brouillon', 'Proposée', 'Validée', 'Programmée', 'Publiée'].map((l, i) => (
              <li key={l} className={i < at ? 'done' : i === at ? 'now' : ''}>
                <i>{i < at ? '✓' : i + 1}</i>
                <span>{i === at && stage === 'changes' ? 'Proposée · à revoir' : l}</span>
              </li>
            ))}
          </ol>
          <div className="sp-row">
            {!m && <p className="fx-hint">Enregistre la page pour la proposer.</p>}
            {m && (stage === 'draft' || stage === 'changes') && p.canPropose && (
              <button className="sp-btn primary" onClick={() => p.onStep('propose')}>
                {stage === 'changes' ? 'Proposer à nouveau' : 'Proposer aux responsables'}
              </button>
            )}
            {m && stage === 'proposed' && p.owner && (
              <>
                <button className="sp-btn primary" onClick={() => p.onStep('approve')}>
                  Valider
                </button>
                <button className="sp-btn" onClick={() => p.onStep('changes')}>
                  Demander une retouche
                </button>
              </>
            )}
            {m && stage === 'proposed' && !p.owner && <p className="fx-hint">Les responsables ont reçu la proposition.</p>}
            {m && (stage === 'approved' || stage === 'scheduled' || stage === 'published') && (
              <button className={`sp-btn ${stage === 'approved' ? 'primary' : ''}`} onClick={p.onPublish}>
                {stage === 'approved' ? 'Programmer les publications' : 'Voir la publication'}
              </button>
            )}
            {m && (
              <button className="sp-btn ghost" onClick={p.onMessages}>
                Échanges
              </button>
            )}
          </div>
        </div>
      )}
    </span>
  );
}
