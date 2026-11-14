import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { CaptionTools } from './caption-tools';
import { CampaignForm, VoteButton } from './campaigns-ui';
import { HistoryPanel, PubFan, campaignHistory, pubsOf } from './compositions-menu';
import { ActivityMark } from './activity';
import { Icon } from './icons';
import { formatOf } from './model';
import { ROLE_LABELS, thumbUrl, type ActivityEvent, type ActivityProfile, type AtelierMeta, type Campaign, type CampaignInput, type CampaignText, type Operation, type PlanItem, type PostizAccounts, type Target, type TeamRef } from './server';
import { addPlanRow, campaignCaption, patchStep, planChoices, planFromOperation, planSteps, uniquePlanId, type PlanStep } from './plan';

export { campaignCaption };
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
  /** enregistre le plan sans bruit (retouches sur place), et les textes de la campagne quand le plan en crée un */
  onPlan: (plan: PlanItem[], texts?: CampaignText[]) => void;
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
  // Rédaction : le texte montré (« main » : le texte principal)
  const [textSel, setTextSel] = useState('main');
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

      {tab === 'plan' && c && (
        <PlanTab
          c={c}
          projects={mine}
          suggested={suggested}
          activity={p.activity}
          operations={p.operations}
          canEdit={p.canEdit}
          targetsOf={targetsOf}
          titleOf={titleOf}
          onOpen={p.onOpen}
          onPlan={p.onPlan}
          onWrite={(id) => {
            setTextSel(id ?? 'main');
            p.onTab('write');
          }}
          onNew={p.onNew}
          publishing={p.publishing}
        />
      )}

      {tab === 'write' && c && <WritingTab key={c.id} c={c} activity={p.activity} canEdit={p.canEdit} sel={textSel} onSel={setTextSel} onSave={p.onSave} />}

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

/** Ce qu'on tient pour le déposer sur une zone : une composition ou un texte de la campagne. */
type Held = { kind: 'comp' | 'text'; id: string };
const relDay = (event: string | undefined, d: string | undefined) => {
  if (!event || !d) return '';
  const n = Math.round((Date.parse(`${event}T12:00:00Z`) - Date.parse(`${d}T12:00:00Z`)) / 86_400_000);
  return n === 0 ? 'Jour J' : n > 0 ? `J−${n}` : `J+${-n}`;
};

/**
 * Le plan de publication, page principale de la campagne, en étapes nommées et datées. Chaque étape
 * montre ses zones en pointillés : une par publication (réseau, format), où déposer une composition,
 * et une pour son texte. Les éléments se glissent depuis la colonne de droite, ou se touchent puis se
 * posent ; chaque publication se programme ensuite, part tout de suite, ou se marque publiée.
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
  onPlan: (plan: PlanItem[], texts?: CampaignText[]) => void;
  /** ouvre la Rédaction, sur un texte donné */
  onWrite: (text?: string) => void;
  onNew: () => void;
  publishing?: PlanPublishing;
}) {
  const t = today();
  const c = p.c;
  const [adding, setAdding] = useState('');
  // ce qu'on a touché pour le poser, ce qu'on glisse, et la zone survolée
  const [held, setHeld] = useState<Held | null>(null);
  const [dragging, setDragging] = useState<(Held & { label: string; img?: string }) | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const channels = channelsOf(p.activity);
  const plan = c.plan ?? [];
  const texts = c.texts ?? [];
  const steps = planSteps(plan);
  const op = p.operations.find((o) => o.id === c.operation);
  const pz = p.publishing?.accounts;
  const pub = p.publishing;
  const choices = planChoices(p.activity);
  const free = (it: PlanItem) => !it.published && it.postiz?.state !== 'queue';
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
  /** Pose un élément : une composition sur une publication (ou sur toutes les publications libres de l'étape), un texte sur l'étape. */
  const place = (item: Held, where: string) => {
    const i = where.indexOf(':');
    const [kind, id] = [where.slice(0, i), where.slice(i + 1)];
    if (item.kind === 'comp') {
      if (kind === 'comp') patch(id, { composition: item.id });
      else if (kind === 'step') p.onPlan(patchStep(plan, id, { composition: item.id }, free));
    } else if (kind === 'text' || kind === 'step') p.onPlan(patchStep(plan, id, { text: item.id }));
  };
  const zoneAt = (x: number, y: number, kind: Held['kind']) => {
    const el = document.elementFromPoint(x, y);
    const z = el?.closest<HTMLElement>(`[data-zone^="${kind}:"]`);
    if (z) return z.dataset.zone!;
    const s = el?.closest<HTMLElement>('[data-step]');
    return s ? `step:${s.dataset.step}` : null;
  };
  /** Prend un élément de la colonne : glissé, il suit le doigt jusqu'à une zone ; simplement touché, il attend qu'on touche sa zone. */
  const grab = (e: ReactPointerEvent<HTMLElement>, item: Held, label: string, img?: string) => {
    if (!p.canEdit || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const [x0, y0, id] = [e.clientX, e.clientY, e.pointerId];
    let on = false;
    let cur: string | null = null;
    // près du haut ou du bas de la page, elle défile pour atteindre les étapes hors de l'écran
    const root = ghost.current?.parentElement;
    const scroller = root?.closest<HTMLElement>('.sp-space');
    const tray = root?.querySelector<HTMLElement>('.sp-tray');
    let [x, y, edge, raf, away] = [x0, y0, 0, 0, false];
    const aim = () => {
      const z = zoneAt(x, y, item.kind);
      if (z !== cur) setOver((cur = z));
    };
    const tick = () => {
      if (edge && scroller) {
        scroller.scrollTop += edge * 14;
        aim();
      }
      raf = requestAnimationFrame(tick);
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      if (!on) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 8) return;
        on = true;
        setHeld(null);
        setDragging({ ...item, label, img });
        raf = requestAnimationFrame(tick);
      }
      ev.preventDefault();
      [x, y] = [ev.clientX, ev.clientY];
      if (ghost.current) ghost.current.style.transform = `translate(${x}px, ${y}px)`;
      if (scroller) {
        const r = scroller.getBoundingClientRect();
        // sur écran étroit le bandeau des éléments est collé en bas : la page défile juste au-dessus de lui
        const low = tray && getComputedStyle(tray).flexDirection === 'row' ? tray.getBoundingClientRect().top : r.bottom;
        // le défilement n'entre en jeu qu'une fois l'élément sorti du bord d'où il part, et d'autant plus vite qu'on s'approche du bord
        const raw = y < r.top + 56 ? (y - r.top - 56) / 56 : y > low ? 0 : y > low - 56 ? (y - low + 56) / 56 : 0;
        if (!raw && y <= low) away = true;
        edge = away ? Math.max(-1, raw) : 0;
      }
      aim();
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (on) {
        if (ev.type === 'pointerup' && cur) place(item, cur);
        setDragging(null);
        setOver(null);
      } else if (ev.type === 'pointerup') setHeld((h) => (h?.kind === item.kind && h.id === item.id ? null : item));
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };
  const moving = dragging ?? held;
  /** Une zone qui attend ce qu'on tient : la toucher l'y pose. */
  const zoneProps = (zone: string, kind: Held['kind'], open: boolean) => {
    const can = open && moving?.kind === kind;
    return {
      'data-zone': open ? zone : undefined,
      className: `${can ? 'can' : ''} ${over === zone ? 'over' : ''}`,
      onClickCapture:
        can && held
          ? (e: ReactMouseEvent) => {
              e.stopPropagation();
              e.preventDefault();
              place(held, zone);
              setHeld(null);
            }
          : undefined,
    };
  };
  const writeFor = (s: PlanStep) => {
    const id = uniquePlanId(s.name || 'texte', texts, 'texte');
    p.onPlan(patchStep(plan, s.key, { text: id }), [...texts, { id, name: s.name || 'Texte', text: '' }]);
    p.onWrite(id);
  };
  const addSelect = (label: string, step?: PlanStep) => (
    <select
      className={step ? 'sp-zone-add' : 'pf-input'}
      value={step ? '' : adding}
      onChange={(e) => {
        const ch = choices.find((x) => x.key === e.target.value);
        setAdding('');
        if (ch) p.onPlan(addPlanRow(plan, { ...(ch.channel ? { channel: ch.channel } : {}), format: ch.format }, step));
      }}
      aria-label={step ? `Ajouter une publication à l’étape ${step.name}` : 'Nouvelle étape : sa première publication'}
    >
      <option value="">{label}</option>
      {choices.map((x) => (
        <option key={x.key} value={x.key}>
          {x.channel ? targetLabel({ channel: x.channel, format: x.format }, p.activity) : `Libre · ${formatOf(x.format).title}`}
        </option>
      ))}
    </select>
  );

  const pubZone = (it: PlanItem) => {
    const chosen = it.composition ? p.projects.find((x) => x.id === it.composition) : undefined;
    const m = chosen ?? p.suggested;
    const ts = m ? p.targetsOf(m) : [];
    const idx = ts.findIndex((x) => (x.channel ?? '') === (it.channel ?? '') && x.format === it.format);
    const st = stateOf(it, m);
    const f = formatOf(it.format);
    const open = p.canEdit && free(it);
    const canPz = !!pz?.enabled && !!pz.providers[it.channel ?? ''] && (!!it.postiz || pz.accounts.some((a) => a.channel === it.channel));
    const z = zoneProps(`comp:${it.id}`, 'comp', open);
    return (
      <div key={it.id} {...z} className={`sp-zone sp-st-${st} ${chosen ? 'filled' : ''} ${z.className}`}>
        <div className="sp-zone-head">
          <MediaIcon ch={channels.find((x) => x.id === it.channel)} size={15} />
          <span>{targetLabel(it, p.activity)}</span>
          {p.canEdit && !it.postiz && (
            <button className="cs-del" onClick={() => p.onPlan(plan.filter((x) => x.id !== it.id))} title="Retirer cette publication du plan" aria-label={`Retirer ${targetLabel(it, p.activity)} du plan`}>
              ×
            </button>
          )}
        </div>
        {m ? (
          <div className={`sp-zone-body ${chosen ? '' : 'dflt'}`}>
            <button className="sp-plan-thumb" style={{ aspectRatio: `${Math.min(1.8, Math.max(0.5, f.width / f.height))}` }} onClick={() => p.onOpen(m, idx >= 0 ? idx : 0)} title={`Ouvrir « ${p.titleOf(m)} » sur cette publication`}>
              <img src={thumbUrl(m, idx >= 0 ? idx : undefined)} alt="" loading="lazy" draggable={false} />
            </button>
            <span className="sp-txt">
              <b>{p.titleOf(m)}</b>
              {!chosen && <small>validée, retenue par défaut</small>}
              {idx < 0 && <small>pas encore dans ce format</small>}
            </span>
          </div>
        ) : (
          <div className="sp-zone-empty">{open ? 'Dépose une composition ici' : 'Pas de composition'}</div>
        )}
        <div className="sp-zone-acts">
          <StagePill stage={(st === 'late' || st === 'error' || st === 'pick' ? 'changes' : st) as Stage}>{ROW_LABELS[st]}</StagePill>
          {m && pub && canPz && !it.published ? (
            <PostizPlanActions campaign={c.id} item={it} accounts={pz!.accounts.filter((a) => a.channel === it.channel && !a.disabled)} owner={pub.owner} caption="" composition={m.id} render={() => pub.render(m, it)} onCampaign={pub.onCampaign} toast={pub.toast} />
          ) : it.published ? (
            <>
              {it.link ? (
                <a className="pub-done" href={it.link} target="_blank" rel="noreferrer">
                  voir ↗
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
            p.canEdit &&
            m && (
              <button className="ab-link" onClick={() => patch(it.id, { published: new Date().toISOString(), composition: it.composition ?? m.id })} title="Publiée à la main, hors du Designer">
                Marquer publiée
              </button>
            )
          )}
          {open && chosen && (
            <button className="ab-link" onClick={() => patch(it.id, { composition: undefined })} title="Vider la zone">
              Retirer
            </button>
          )}
        </div>
      </div>
    );
  };

  const textZone = (s: PlanStep) => {
    const x = s.text ? texts.find((y) => y.id === s.text) : undefined;
    const z = zoneProps(`text:${s.key}`, 'text', p.canEdit);
    return (
      <div {...z} className={`sp-zone sp-zone-text ${x ? 'filled' : ''} ${z.className}`}>
        <div className="sp-zone-head">
          <Icon name="pen" />
          <span>Texte</span>
        </div>
        {x ? (
          <button className="sp-zone-quote" onClick={() => p.onWrite(x.id)} title="Ouvrir ce texte dans la Rédaction">
            <b>{x.name}</b>
            <small>{x.text.trim() || 'pas encore rédigé'}</small>
          </button>
        ) : (
          <div className="sp-zone-empty">
            {p.canEdit ? 'Dépose un texte ici' : 'Pas de texte propre'}
            <small>sinon : le texte de la composition, ou le texte principal</small>
          </div>
        )}
        {p.canEdit && (
          <div className="sp-zone-acts">
            {x ? (
              <button className="ab-link" onClick={() => p.onPlan(patchStep(plan, s.key, { text: undefined }))} title="Vider la zone">
                Retirer
              </button>
            ) : (
              <button className="ab-link" onClick={() => writeFor(s)}>
                Écrire {s.name ? `« ${s.name} »` : 'ce texte'}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const trayItem = (item: Held, label: string, sub: string, img?: string) => {
    const on = held?.kind === item.kind && held.id === item.id;
    return (
      <div
        key={`${item.kind}:${item.id}`}
        role="button"
        tabIndex={0}
        aria-pressed={on}
        className={`sp-tray-item ${item.kind} ${on ? 'on' : ''} ${dragging?.kind === item.kind && dragging.id === item.id ? 'drag' : ''}`}
        onPointerDown={(e) => grab(e, item, label, img)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setHeld(on ? null : item))}
        title="Glisse sur une zone en pointillés, ou touche puis touche la zone"
      >
        {item.kind === 'comp' ? <img src={img} alt="" loading="lazy" draggable={false} /> : <Icon name="pen" />}
        <span className="sp-txt">
          <b>{label}</b>
          <small>{sub}</small>
        </span>
      </div>
    );
  };

  return (
    <div className={`sp-plan ${p.canEdit ? 'edit' : ''} ${moving ? `moving-${moving.kind}` : ''}`}>
      <div className="sp-steps">
        {!steps.length && <p className="fx-hint">Rien de prévu pour l’instant.{p.canEdit ? ' Crée une première étape ci-dessous.' : ''}</p>}
        {steps.map((s) => {
          const late = s.date && s.date < t && s.rows.some((it) => !it.published);
          return (
            <section key={s.rows[0]!.id} className={`sp-step ${over === `step:${s.key}` ? 'over' : ''}`} data-step={p.canEdit ? s.key : undefined}>
              <header className="sp-step-head">
                {p.canEdit ? (
                  <input
                    key={s.name}
                    className="sp-step-name"
                    defaultValue={s.name}
                    placeholder="Nom de l’étape (annonce, rappel…)"
                    onBlur={(e) => e.target.value.trim() !== s.name && p.onPlan(patchStep(plan, s.key, { label: e.target.value.trim() || undefined }))}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    aria-label="Nom de l’étape"
                  />
                ) : (
                  <b className="sp-step-name">{s.name || 'Étape'}</b>
                )}
                {relDay(c.date, s.date) && <small className={`sp-step-rel ${late ? 'late' : ''}`}>{relDay(c.date, s.date)}</small>}
                {p.canEdit ? (
                  <input className="sp-plan-date" type="date" value={s.date ?? ''} onChange={(e) => p.onPlan(patchStep(plan, s.key, { date: e.target.value || undefined }))} aria-label={`Date de l’étape ${s.name}`} title={s.date ? 'Changer la date' : 'Pas encore de date'} />
                ) : (
                  <span className="sp-step-date">{s.date ? short(s.date) : 'à dater'}</span>
                )}
              </header>
              <div className="sp-zones">
                {s.rows.map(pubZone)}
                {textZone(s)}
                {p.canEdit && addSelect('＋ Publication…', s)}
              </div>
            </section>
          );
        })}
        {p.canEdit && (
          <div className="cs-add sp-plan-add">
            {!plan.length && op && (
              <button className="pf-btn act-primary" onClick={() => p.onPlan(planFromOperation(op, c.date, p.activity))}>
                Préremplir les étapes de « {op.name} »
              </button>
            )}
            {addSelect('＋ Nouvelle étape : choisir sa première publication…')}
          </div>
        )}
        {pub?.err && <p className="pf-note err">Publication programmée indisponible : {pub.err}</p>}
        {pz && !pz.enabled && <p className="fx-hint pz-note">La publication programmée n’est pas configurée (Configuration globale › Publication) : on marque les publications à la main.</p>}
        {pz?.enabled && plan.length > 0 && !pz.accounts.length && <p className="fx-hint pz-note">Pour programmer, relie d’abord un compte dans la fiche de l’activité › Médias.</p>}
      </div>
      {p.canEdit && (
        <aside className="sp-tray" aria-label="Éléments à déposer">
          <p className="fx-hint sp-tray-hint">{held ? 'Touche maintenant une zone en pointillés.' : 'Glisse un élément sur une zone en pointillés.'}</p>
          <div className="sp-tray-k">Compositions</div>
          <div className="sp-tray-list">
            {p.projects.map((m) => trayItem({ kind: 'comp', id: m.id }, p.titleOf(m), STAGE_LABELS[stageOf(m, c)], thumbUrl(m)))}
            <button className="sp-tray-new" onClick={p.onNew}>
              ＋ Composition
            </button>
          </div>
          <div className="sp-tray-k">Textes</div>
          <div className="sp-tray-list">
            {texts.map((x) => trayItem({ kind: 'text', id: x.id }, x.name, x.text.trim() || 'pas encore rédigé'))}
            <button className="sp-tray-new" onClick={() => p.onWrite()}>
              ＋ Texte
            </button>
          </div>
        </aside>
      )}
      <div ref={ghost} className={`sp-ghost ${dragging ? `on ${dragging.kind}` : ''}`} aria-hidden>
        {dragging?.img ? <img src={dragging.img} alt="" /> : <Icon name="pen" />}
        <b>{dragging?.label}</b>
      </div>
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
function WritingTab(p: { c: Campaign; activity: ActivityProfile | null; canEdit: boolean; sel: string; onSel: (id: string) => void; onSave: (c: CampaignInput) => Promise<void> }) {
  const [caption, setCaption] = useState(p.c.caption ?? '');
  const [hashtags, setHashtags] = useState(p.c.hashtags ?? '');
  const [link, setLink] = useState(p.c.link ?? '');
  // les textes nommés, à déposer sur les étapes du plan (« Rappel »…) ; le texte principal sert aux autres
  const [texts, setTexts] = useState<CampaignText[]>(p.c.texts ?? []);
  const area = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => setMsg(''), [caption, hashtags, link, texts]);
  const cur = texts.find((x) => x.id === p.sel);
  const body = cur ? cur.text : caption;
  const setBody = (v: string) => (cur ? setTexts((l) => l.map((x) => (x.id === cur.id ? { ...x, text: v } : x))) : setCaption(v));
  const dirty = caption !== (p.c.caption ?? '') || hashtags !== (p.c.hashtags ?? '') || link !== (p.c.link ?? '') || JSON.stringify(texts) !== JSON.stringify(p.c.texts ?? []);
  const linkOk = !link.trim() || /^https?:\/\/\S+$/.test(link.trim());
  const mentions = contactsOf(p.activity).map((x) => ({ name: x.label || CONTACT_KINDS[x.kind], text: x.value }));
  const post = campaignCaption({ hashtags, link }, body);
  const usedBy = cur ? planSteps(p.c.plan ?? []).filter((s) => s.text === cur.id).map((s) => s.name || 'étape sans nom') : [];
  const save = async () => {
    setBusy(true);
    try {
      await p.onSave({ caption, hashtags, link: link.trim(), texts });
      setMsg('Enregistré');
    } catch (e) {
      setMsg(`Impossible : ${(e as Error).message}`);
    }
    setBusy(false);
  };
  return (
    <div className="sp-write">
      <div className="sp-write-form">
        <div className="sp-chips" role="radiogroup" aria-label="Texte à rédiger">
          <button role="radio" aria-checked={!cur} className={`sp-chip ${cur ? '' : 'on'}`} onClick={() => p.onSel('main')}>
            Texte principal
          </button>
          {texts.map((x) => (
            <button key={x.id} role="radio" aria-checked={cur?.id === x.id} className={`sp-chip ${cur?.id === x.id ? 'on' : ''}`} onClick={() => p.onSel(x.id)}>
              {x.name || 'Sans nom'}
            </button>
          ))}
          {p.canEdit && texts.length < 20 && (
            <button
              className="sp-chip sp-chip-add"
              onClick={() => {
                const id = uniquePlanId('texte', texts, 'texte');
                setTexts((l) => [...l, { id, name: `Texte ${l.length + 1}`, text: '' }]);
                p.onSel(id);
              }}
            >
              ＋ Texte
            </button>
          )}
        </div>
        {cur && (
          <div className="sp-row">
            <label className="sp-field sp-grow">
              <span>Nom du texte</span>
              <input className="pf-input" value={cur.name} maxLength={60} disabled={!p.canEdit} placeholder="Annonce, rappel…" onChange={(e) => setTexts((l) => l.map((x) => (x.id === cur.id ? { ...x, name: e.target.value } : x)))} />
            </label>
            {p.canEdit && (
              <button
                className="sp-btn sm"
                onClick={() => {
                  setTexts((l) => l.filter((x) => x.id !== cur.id));
                  p.onSel('main');
                }}
                title={usedBy.length ? `Il quittera aussi ${usedBy.join(', ')}` : undefined}
              >
                Supprimer ce texte
              </button>
            )}
          </div>
        )}
        <label className="sp-field">
          <span>{cur ? 'Texte' : 'Texte d’accompagnement'}</span>
          {p.canEdit && <CaptionTools area={area} value={body} onChange={setBody} />}
          <textarea ref={area} className="pf-input" rows={7} value={body} maxLength={2200} disabled={!p.canEdit} placeholder={cur ? 'Ce que dit cette étape : le rappel, les dernières places…' : 'L’annonce commune aux publications : la date, le lieu, ce qui attend le public…'} onChange={(e) => setBody(e.target.value)} />
        </label>
        <small className="fx-hint">
          {cur
            ? usedBy.length
              ? `Déposé sur ${usedBy.join(', ')} dans le plan de publication.`
              : 'Pas encore dans le plan : dépose-le sur une étape du plan de publication.'
            : 'Sert aux étapes du plan qui n’ont pas de texte à elles.'}
        </small>
        {p.canEdit && mentions.length > 0 && (
          <div className="pub-mentions">
            {mentions.map((m) => (
              <button key={`${m.name}/${m.text}`} className="pub-mention" title={m.text} onClick={() => setBody(`${body.trimEnd()}${body ? '\n' : ''}${m.text}`)}>
                + {m.name}
              </button>
            ))}
          </div>
        )}
        <label className="sp-field">
          <span>Mots-dièse (ajoutés à tous les textes)</span>
          <input className="pf-input" value={hashtags} disabled={!p.canEdit} placeholder="#concert #risorangis" onChange={(e) => setHashtags(e.target.value)} />
        </label>
        <label className="sp-field">
          <span>Lien (billetterie, évènement… ; ajouté à tous les textes)</span>
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
        <span className="sp-field-k">Aperçu du post{cur ? ` « ${cur.name} »` : ''}</span>
        <div className="sp-post">{post || <span className="fx-hint">Le texte, les mots-dièse et le lien s’assemblent ici.</span>}</div>
        <small className="fx-hint">{post.length} caractères.{cur ? '' : ' Chaque composition part de ce texte dans Publier, et peut l’adapter.'}</small>
      </div>
    </div>
  );
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
