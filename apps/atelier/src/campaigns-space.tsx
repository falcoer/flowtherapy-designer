import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CaptionTools } from './caption-tools';
import { CampaignForm, VoteButton } from './campaigns-ui';
import { HistoryPanel, PubFan, campaignHistory, pubsOf } from './compositions-menu';
import { ActivityMark } from './activity';
import { Icon } from './icons';
import { formatOf } from './model';
import { REVIEW_LABELS, ROLE_LABELS, thumbUrl, type ActivityEvent, type ActivityProfile, type AtelierMeta, type Campaign, type CampaignInput, type Operation, type PlanItem, type PostizAccounts, type Target, type TeamRef } from './server';
import { LEAD_DAYS, addDays, planChoices, planFromOperation, uniquePlanId } from './campaign-sheet';
import { PostizPlanActions } from './postiz-ui';
import { CONTACT_KINDS, channelsOf, contactsOf, targetLabel } from './targets';
import { MediaIcon } from './targets-ui';

/*
 * Espace des campagnes, en plein écran sous la barre du haut : la liste des campagnes, puis une
 * campagne en onglets, son plan de publication d'abord (sa page principale). Chaque geste a un
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
export type SpaceTab = 'comps' | 'plan' | 'write' | 'settings' | 'history';
type Tab = SpaceTab;

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
  onSave: (c: CampaignInput) => Promise<void>;
  /** enregistre le plan sans bruit (retouches sur place) */
  onPlan: (plan: PlanItem[]) => void;
  publishing?: PlanPublishing;
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

  // le plan de publication est la page principale d'une campagne ; « Sans campagne » n'a que ses compositions
  const tabs: Array<[Tab, string, number | null]> = [
    ...(c ? ([['plan', 'Plan de publication', plan.length]] as Array<[Tab, string, number | null]>) : []),
    ['comps', 'Compositions', mine.length],
    ...(c
      ? ([
          ['write', 'Rédaction', null],
          ['settings', 'Paramètres', null],
        ] as Array<[Tab, string, number | null]>)
      : []),
    ['history', 'Historique', null],
  ];
  const tab = !c && (p.tab === 'plan' || p.tab === 'write' || p.tab === 'settings') ? 'comps' : p.tab;

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

      {tab === 'plan' && c && <PlanTab c={c} projects={mine} suggested={suggested} activity={p.activity} operations={p.operations} canEdit={p.canEdit} targetsOf={targetsOf} titleOf={titleOf} onOpen={p.onOpen} onPlan={p.onPlan} onWrite={() => p.onTab('write')} publishing={p.publishing} />}

      {tab === 'write' && c && <WritingTab key={c.id} c={c} activity={p.activity} canEdit={p.canEdit} onSave={p.onSave} />}

      {tab === 'settings' && c && (
        <div className="sp-settings">
          {p.canEdit ? (
            <CampaignForm
              key={c.id}
              initial={{ id: c.id, name: c.name, operation: c.operation, date: c.date, place: c.place, time: c.time, kind: c.kind, contact: c.contact }}
              operations={p.operations}
              onCancel={() => p.onTab('comps')}
              onSubmit={async ({ id: _id, ...data }) => {
                await p.onSave(data);
              }}
            />
          ) : (
            <div className="sp-info">
              <b>{c.name}</b>
              <span>{subOf(c, p.operations)}</span>
              {c.date && <span>{new Date(`${c.date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>}
              {c.contact && <span>Réservation : {[c.contact.name, c.contact.phone, c.contact.email].filter(Boolean).join(', ')}</span>}
            </div>
          )}
        </div>
      )}

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

/** Ce que la page de la campagne sait de la diffusion : les comptes reliés, et de quoi rendre une publication. */
export interface PlanPublishing {
  accounts: PostizAccounts | null;
  err: string | null;
  /** responsable de l'équipe : lui seul programme */
  owner: boolean;
  /** l'image d'une ligne du plan rendue d'après sa composition, et le texte qui l'accompagne */
  render: (m: AtelierMeta, it: PlanItem) => Promise<{ image: Blob | null; caption: string }>;
  onCampaign: (c: Campaign) => void;
  toast: (m: string) => void;
}

/**
 * Le plan de publication, page principale de la campagne : chaque ligne se règle sur place (date,
 * précision, composition retenue), se programme ou part tout de suite, ou se marque publiée.
 */
function PlanTab(p: {
  c: Campaign;
  projects: AtelierMeta[];
  suggested?: AtelierMeta;
  activity: ActivityProfile | null;
  operations: Operation[];
  canEdit: boolean;
  targetsOf: (m: AtelierMeta) => Target[];
  titleOf: (m: AtelierMeta) => string;
  onOpen: (m: AtelierMeta, target?: number) => void;
  onPlan: (plan: PlanItem[]) => void;
  onWrite: () => void;
  publishing?: PlanPublishing;
}) {
  const t = today();
  const [adding, setAdding] = useState('');
  const channels = channelsOf(p.activity);
  const plan = p.c.plan ?? [];
  const op = p.operations.find((o) => o.id === p.c.operation);
  const rows = [...plan].sort((a, b) => (a.date && b.date ? a.date.localeCompare(b.date) : a.date ? -1 : b.date ? 1 : 0));
  const groupOf = (it: PlanItem) => (it.date ? new Date(`${it.date}T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : 'Sans date');
  const stateOf = (it: PlanItem, m?: AtelierMeta): RowState => {
    if (it.published) return 'published';
    if (it.postiz?.state === 'error') return 'error';
    if (it.postiz?.state === 'queue') return 'scheduled';
    if (it.date && it.date < t) return 'late';
    if (!m) return 'pick';
    return m.review?.status ?? 'draft';
  };
  const patch = (id: string, x: Partial<PlanItem>) =>
    p.onPlan(
      plan.map((it) => {
        if (it.id !== id) return it;
        const n = { ...it, ...x };
        for (const k of Object.keys(x) as (keyof PlanItem)[]) if (x[k] === undefined || x[k] === '') delete n[k];
        return n;
      }),
    );
  const pz = p.publishing?.accounts;
  const choices = planChoices(p.activity);
  let last = '';
  return (
    <div className="sp-plan">
      <div className="sp-row">
        <p className="fx-hint sp-grow">
          Une ligne par publication prévue : sa date, la composition retenue, puis on la programme ou on la publie tout de suite. Le texte envoyé est celui de la composition, sinon celui de la{' '}
          <button className="ab-link sp-inline-link" onClick={p.onWrite}>
            Rédaction
          </button>
          .
        </p>
      </div>
      {!rows.length && (
        <p className="fx-hint">
          Rien de prévu pour l’instant.
          {p.canEdit ? ' Ajoute les publications ci-dessous.' : ''}
        </p>
      )}
      {rows.map((it) => {
        const m = it.composition ? p.projects.find((x) => x.id === it.composition) : p.suggested;
        const ts = m ? p.targetsOf(m) : [];
        const idx = ts.findIndex((x) => (x.channel ?? '') === (it.channel ?? '') && x.format === it.format);
        const st = stateOf(it, m);
        const g = groupOf(it);
        const head = g !== last;
        last = g;
        const f = formatOf(it.format);
        const at = it.postiz?.at ? new Date(it.postiz.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
        const locked = !p.canEdit || !!it.published || it.postiz?.state === 'queue';
        const canPz = !!pz?.enabled && !!pz.providers[it.channel ?? ''] && (!!it.postiz || pz.accounts.some((a) => a.channel === it.channel));
        const pub = p.publishing;
        return (
          <div key={it.id} className="sp-plan-item">
            {head && <div className="sp-plan-group">{g}</div>}
            <div className={`sp-plan-row sp-st-${st}`}>
              <span className="sp-when">
                {locked ? (
                  it.date ? (
                    <>
                      <b>{short(it.date)}</b>
                      <small>{at || new Date(`${it.date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short' })}</small>
                    </>
                  ) : (
                    <small>à dater</small>
                  )
                ) : (
                  <input className="sp-plan-date" type="date" value={it.date ?? ''} onChange={(e) => patch(it.id, { date: e.target.value || undefined })} aria-label="Date de publication" title={it.date ? 'Changer la date' : 'Pas encore de date'} />
                )}
              </span>
              <button className="sp-plan-thumb" style={{ aspectRatio: `${Math.min(1.8, Math.max(0.5, f.width / f.height))}` }} disabled={!m} onClick={() => m && p.onOpen(m, idx >= 0 ? idx : 0)} title={m ? `Ouvrir « ${p.titleOf(m)} » sur cette publication` : 'Choisis d’abord une composition'}>
                {m && <img src={thumbUrl(m, idx >= 0 ? idx : undefined)} alt="" loading="lazy" draggable={false} />}
              </button>
              <span className="sp-txt">
                <b>
                  <MediaIcon ch={channels.find((x) => x.id === it.channel)} size={15} /> {targetLabel(it, p.activity)}
                  {p.canEdit && !locked ? (
                    <input key={`${it.id}:${it.label ?? ''}`} className="sp-plan-label" defaultValue={it.label ?? ''} placeholder="précision…" onBlur={(e) => e.target.value.trim() !== (it.label ?? '') && patch(it.id, { label: e.target.value.trim() || undefined })} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} aria-label="Précision (annonce, rappel…)" />
                  ) : it.label ? (
                    <small> · {it.label}</small>
                  ) : null}
                </b>
                {p.canEdit && !locked ? (
                  <select className="sp-plan-compo" value={it.composition ?? ''} onChange={(e) => patch(it.id, { composition: e.target.value || undefined })} aria-label="Composition retenue">
                    <option value="">{p.suggested ? `${p.titleOf(p.suggested)} · retenue par défaut` : 'composition à choisir…'}</option>
                    {p.projects.map((x) => (
                      <option key={x.id} value={x.id}>
                        {p.titleOf(x)}
                        {x.review ? ` · ${REVIEW_LABELS[x.review.status].toLowerCase()}` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <small>{m ? `${p.titleOf(m)}${!it.composition ? ' · retenue par défaut' : ''}` : 'composition à choisir'}</small>
                )}
              </span>
              <StagePill stage={(st === 'late' || st === 'error' || st === 'pick' ? 'changes' : st) as Stage}>{ROW_LABELS[st]}</StagePill>
              <span className="sp-plan-acts">
                {m && pub && canPz && !it.published ? (
                  <PostizPlanActions
                    campaign={p.c.id}
                    item={it}
                    accounts={pz!.accounts.filter((a) => a.channel === it.channel && !a.disabled)}
                    owner={pub.owner}
                    caption=""
                    composition={m.id}
                    render={() => pub.render(m, it)}
                    onCampaign={pub.onCampaign}
                    toast={pub.toast}
                  />
                ) : it.published ? (
                  <>
                    {it.link ? (
                      <a className="pub-done" href={it.link} target="_blank" rel="noreferrer">
                        publiée ↗
                      </a>
                    ) : (
                      <small className="pub-done">le {short(it.published.slice(0, 10))}</small>
                    )}
                    {p.canEdit && !it.postiz && (
                      <button className="ab-link" onClick={() => patch(it.id, { published: undefined, link: undefined })} title="Remettre à publier">
                        Annuler
                      </button>
                    )}
                  </>
                ) : (
                  p.canEdit && (
                    <button className="ab-link" disabled={!m} onClick={() => m && patch(it.id, { published: new Date().toISOString(), composition: it.composition ?? m.id })} title={m ? 'Publiée à la main, hors du Designer' : 'Choisis d’abord une composition'}>
                      Marquer publiée
                    </button>
                  )
                )}
                {p.canEdit && !it.postiz && (
                  <button className="cs-del" onClick={() => p.onPlan(plan.filter((x) => x.id !== it.id))} title="Retirer du plan" aria-label="Retirer du plan">
                    ×
                  </button>
                )}
              </span>
            </div>
          </div>
        );
      })}
      {p.canEdit && (
        <div className="cs-add sp-plan-add">
          {!plan.length && op && (
            <button className="pf-btn act-primary" onClick={() => p.onPlan(planFromOperation(op, p.c.date, p.activity))}>
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
              p.onPlan([...plan, { id: uniquePlanId(`${ch.channel ?? ''}-${ch.format}`, plan), ...(ch.channel ? { channel: ch.channel } : {}), format: ch.format, ...(p.c.date && ch.format !== 'story' ? { date: addDays(p.c.date, -LEAD_DAYS) } : {}) }]);
            }}
            aria-label="Ajouter une publication au plan"
          >
            <option value="">＋ Ajouter une publication…</option>
            {choices.map((x) => (
              <option key={x.key} value={x.key}>
                {x.channel ? targetLabel({ channel: x.channel, format: x.format }, p.activity) : `Libre · ${formatOf(x.format).title}`}
              </option>
            ))}
          </select>
        </div>
      )}
      {p.publishing?.err && <p className="pf-note err">Publication programmée indisponible : {p.publishing.err}</p>}
      {pz && !pz.enabled && <p className="fx-hint pz-note">La publication programmée n’est pas configurée (Configuration globale › Publication) : on marque les lignes publiées à la main.</p>}
      {pz?.enabled && plan.length > 0 && !pz.accounts.length && <p className="fx-hint pz-note">Pour programmer, relie d’abord un compte dans la fiche de l’activité › Médias.</p>}
    </div>
  );
}

// ——— dans l'atelier ———

/** Bulle de conversation de la barre, remplie de la couleur de l'étape, avec le nombre de messages : elle ouvre le dialogue de l'état et des messages. */
export function StageButton(p: { meta?: AtelierMeta; campaign?: Campaign; owner: boolean; count: number; on: boolean; onClick: () => void }) {
  const stage = stageOf(p.meta, p.campaign);
  const next: Record<Stage, string> = { draft: 'à proposer', proposed: p.owner ? 'à valider' : 'en attente des responsables', changes: 'à corriger', approved: 'à programmer', scheduled: '', published: '' };
  const msgs = p.count ? ` · ${p.count} message${p.count > 1 ? 's' : ''}` : '';
  return (
    <button className={`btn msg-btn sp-stage-btn st-${stage} ${p.on ? 'on' : ''}`} onClick={p.onClick} title={`${STAGE_LABELS[stage]}${next[stage] ? `, ${next[stage]}` : ''}${msgs} : l’état de la composition et ses messages`} aria-label={`État et messages : ${STAGE_LABELS[stage]}`} aria-expanded={p.on}>
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z" fill="var(--stage)" />
      </svg>
      {p.count > 0 && <span className="msg-count">{p.count > 99 ? '99+' : p.count}</span>}
    </button>
  );
}

/** Le circuit de la composition, de son brouillon à sa publication, et la dernière note des responsables ou de l'auteur. */
export function StageTrack(p: { meta?: AtelierMeta; campaign?: Campaign }) {
  const m = p.meta;
  const stage = stageOf(m, p.campaign);
  const at = stage === 'changes' ? 1 : (['draft', 'proposed', 'approved', 'scheduled', 'published'] as Stage[]).indexOf(stage);
  const r = m?.review;
  return (
    <div className="sp-stage-track">
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
    </div>
  );
}

/** Rédaction de la campagne : le texte qui accompagne ses publications, ses mots-dièse, son lien. */
function WritingTab(p: { c: Campaign; activity: ActivityProfile | null; canEdit: boolean; onSave: (c: CampaignInput) => Promise<void> }) {
  const [caption, setCaption] = useState(p.c.caption ?? '');
  const [hashtags, setHashtags] = useState(p.c.hashtags ?? '');
  const [link, setLink] = useState(p.c.link ?? '');
  const area = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => setMsg(''), [caption, hashtags, link]);
  const dirty = caption !== (p.c.caption ?? '') || hashtags !== (p.c.hashtags ?? '') || link !== (p.c.link ?? '');
  const linkOk = !link.trim() || /^https?:\/\/\S+$/.test(link.trim());
  const mentions = contactsOf(p.activity).map((x) => ({ name: x.label || CONTACT_KINDS[x.kind], text: x.value }));
  const post = campaignCaption({ caption, hashtags, link });
  const save = async () => {
    setBusy(true);
    try {
      await p.onSave({ caption, hashtags, link: link.trim() });
      setMsg('Enregistré');
    } catch (e) {
      setMsg(`Impossible : ${(e as Error).message}`);
    }
    setBusy(false);
  };
  return (
    <div className="sp-write">
      <div className="sp-write-form">
        <label className="sp-field">
          <span>Texte d’accompagnement</span>
          {p.canEdit && <CaptionTools area={area} value={caption} onChange={setCaption} />}
          <textarea ref={area} className="pf-input" rows={7} value={caption} disabled={!p.canEdit} placeholder="L’annonce commune aux publications : la date, le lieu, ce qui attend le public…" onChange={(e) => setCaption(e.target.value)} />
        </label>
        {p.canEdit && mentions.length > 0 && (
          <div className="pub-mentions">
            {mentions.map((m) => (
              <button key={`${m.name}/${m.text}`} className="pub-mention" title={m.text} onClick={() => setCaption((t) => `${t.trimEnd()}${t ? '\n' : ''}${m.text}`)}>
                + {m.name}
              </button>
            ))}
          </div>
        )}
        <label className="sp-field">
          <span>Mots-dièse</span>
          <input className="pf-input" value={hashtags} disabled={!p.canEdit} placeholder="#concert #risorangis" onChange={(e) => setHashtags(e.target.value)} />
        </label>
        <label className="sp-field">
          <span>Lien (billetterie, évènement…)</span>
          <input className={`pf-input ${linkOk ? '' : 'bad'}`} type="url" value={link} disabled={!p.canEdit} placeholder="https://…" onChange={(e) => setLink(e.target.value)} />
          {!linkOk && <small className="pf-err">Un lien commence par https://</small>}
        </label>
        {p.canEdit && (
          <div className="sp-row">
            <button className="sp-btn primary" disabled={!dirty || busy || !linkOk} onClick={() => void save()}>
              Enregistrer
            </button>
            {msg && <small className="fx-hint">{msg}</small>}
          </div>
        )}
      </div>
      <div className="sp-write-preview">
        <span className="sp-field-k">Aperçu du post</span>
        <div className="sp-post">{post || <span className="fx-hint">Le texte, les mots-dièse et le lien s’assemblent ici.</span>}</div>
        <small className="fx-hint">{post.length} caractères. Chaque composition part de ce texte dans Publier, et peut l’adapter.</small>
      </div>
    </div>
  );
}

/** Le texte d'une publication tel que la campagne le propose : l'annonce, puis le lien, puis les mots-dièse. */
export function campaignCaption(c: Pick<Campaign, 'caption' | 'hashtags' | 'link'>): string {
  return [c.caption?.trim(), c.link?.trim(), c.hashtags?.trim()].filter(Boolean).join('\n\n');
}

/**
 * Sous l'activité du fil d'Ariane : la fiche de l'activité en premier, puis les cinq dernières campagnes
 * ouvertes et l'accès à toutes. Les deux flèches remplacent la liste des campagnes par les autres activités.
 */
export function CampaignPicker(p: {
  team: TeamRef;
  teams: TeamRef[];
  /** l'administrateur crée les activités : il a toujours les deux flèches */
  admin: boolean;
  campaigns: Campaign[];
  recent: string[];
  current?: string;
  operations: Operation[];
  onActivity: () => void;
  onTeam: (id: string) => void;
  /** créer une activité (administrateur) puis y passer */
  onCreateTeam: (name: string) => void;
  onOpen: (id: string) => void;
  onAll: () => void;
  onClose: () => void;
}) {
  const [teams, setTeams] = useState(false);
  const [newName, setNewName] = useState('');
  const byId = new Map(p.campaigns.map((c) => [c.id, c]));
  const t = today();
  const list = p.recent.map((id) => byId.get(id)).filter((c): c is Campaign => !!c && !c.closed);
  // premières visites : les prochaines campagnes complètent la liste
  for (const c of p.campaigns.filter((x) => !x.closed && (!x.date || x.date >= t)).sort((a, b) => (a.date ?? '9').localeCompare(b.date ?? '9')))
    if (list.length < 5 && !list.includes(c)) list.push(c);
  const others = p.teams.filter((x) => x.id !== p.team.id).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return (
    <>
      <div className="sp-picker-back" onPointerDown={p.onClose} />
      <div className="bubble sp-picker" role="dialog" aria-label="Activité et campagnes récentes" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sp-pick-head">
          <button className="sp-pick sp-pick-team" onClick={p.onActivity} title="Fiche de l’activité">
            <ActivityMark team={p.team} size={36} />
            <span className="sp-txt">
              <b>{p.team.name}</b>
              <small>Fiche de l’activité{p.team.kind ? ` · ${p.team.kind}` : ''}</small>
            </span>
          </button>
          {(others.length > 0 || p.admin) && (
            <button className={`act-icon ${teams ? 'on' : ''}`} onClick={() => setTeams(!teams)} title={teams ? 'Revenir aux campagnes' : 'Choisir une autre activité'} aria-label="Changer d’activité" aria-pressed={teams}>
              <Icon name="switch" />
            </button>
          )}
        </div>
        {teams ? (
          <>
            <div className="b-sub">Autres activités</div>
            {others.map((x) => (
              <button key={x.id} className="sp-pick" onClick={() => p.onTeam(x.id)}>
                <ActivityMark team={x} size={28} />
                <span className="sp-txt">
                  <b>{x.name}</b>
                  <small>{[x.kind, ROLE_LABELS[x.role]].filter(Boolean).join(' · ')}</small>
                </span>
              </button>
            ))}
            {!others.length && <p className="fx-hint">Aucune autre activité pour l’instant.</p>}
            {p.admin && (
              <form
                className="act-new"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newName.trim()) p.onCreateTeam(newName.trim());
                }}
              >
                <input className="pf-input" placeholder="Créer une nouvelle activité…" value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="Nom de la nouvelle activité" />
                <button className="act-icon cm-add" type="submit" disabled={!newName.trim()} title="Créer l’activité" aria-label="Créer l’activité">
                  <Icon name="plus" />
                </button>
              </form>
            )}
          </>
        ) : (
          <>
            <div className="b-sub">Campagnes récentes</div>
            {list.slice(0, 5).map((c) => (
              <button key={c.id} className={`sp-pick ${c.id === p.current ? 'on' : ''}`} onClick={() => p.onOpen(c.id)}>
                <DateTile c={c} small />
                <span className="sp-txt">
                  <b>{c.name}</b>
                  <small>{subOf(c, p.operations)}</small>
                </span>
                {c.id === p.current && <span className="sp-pick-cur">en cours</span>}
              </button>
            ))}
            {!list.length && <p className="fx-hint">Aucune campagne ouverte pour l’instant.</p>}
            <button className="sp-pick-all" onClick={p.onAll}>
              <Icon name="plus" /> Toutes les campagnes…
            </button>
          </>
        )}
      </div>
    </>
  );
}
