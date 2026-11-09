import { useMemo, useRef, useState, type ReactNode } from 'react';
import { VoteButton, day } from './campaigns-ui';
import { ActivityMark } from './activity';
import { Icon } from './icons';
import { formatOf } from './model';
import { REVIEW_LABELS, thumbUrl, type ActivityEvent, type ActivityProfile, type AtelierMeta, type Campaign, type Operation, type PlanItem, type Target } from './server';
import { channelsOf, targetLabel } from './targets';
import { MediaIcon } from './targets-ui';
import { FEED_ICONS, feedDay, feedLine, feedTime } from './feed-ui';

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
function PubFan({ m, pubs, activity, size = 38 }: { m: AtelierMeta; pubs: Pub[]; activity: ActivityProfile | null; /** hauteur d'une carte */ size?: number }) {
  const channels = channelsOf(activity);
  const n = pubs.length;
  return (
    <span className="pub-fan" style={size !== 38 ? { height: size + 8, paddingLeft: Math.round(size * 0.4) } : undefined} aria-label={`${n} publication${n > 1 ? 's' : ''}`}>
      {pubs.slice(0, 6).map((p, i) => {
        const f = formatOf(p.target.format);
        const ratio = Math.min(1.8, Math.max(0.5, f.width / f.height));
        const mid = (Math.min(n, 6) - 1) / 2;
        return (
          <span
            key={i}
            className={`pub-card ps-${pubState(p)}`}
            style={{ width: Math.round(size * 0.9 * ratio), ...(size !== 38 ? { height: size, marginLeft: -Math.round(size * 0.3) } : {}), transform: `rotate(${(i - mid) * 7}deg)`, zIndex: i }}
            title={`${targetLabel(p.target, activity)} · ${pubWhen(p)}`}
          >
            <img src={thumbUrl(m)} alt="" loading="lazy" draggable={false} />
            <span className="pub-media">
              <MediaIcon ch={channels.find((c) => c.id === p.target.channel)} size={13} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

const dmy = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
/** Où en est une composition : publiée (d'après le plan de la campagne), sinon son étape de validation, et sa date. */
function statusOf(m: AtelierMeta, c: Campaign | undefined): { kind: string; label: string; at: string } | null {
  const pub = (c?.plan ?? [])
    .filter((it) => it.composition === m.id && it.published)
    .map((it) => it.published!)
    .sort()
    .pop();
  if (pub) return { kind: 'published', label: 'Publiée', at: pub };
  const r = m.review;
  if (!r) return null;
  if (r.status === 'proposed') return { kind: r.status, label: REVIEW_LABELS.proposed, at: r.proposedAt };
  return { kind: r.status, label: REVIEW_LABELS[r.status], at: r.reviewedAt ?? r.proposedAt };
}

/** Largeur de la corbeille découverte en glissant une ligne vers la gauche. */
const SWIPE = 84;

/** Filtres de la liste des compositions. */
const FILTERS = [
  { id: 'all', label: 'Toutes' },
  { id: 'mine', label: 'Les miennes' },
  { id: 'proposed', label: 'Proposées' },
  { id: 'approved', label: 'Validées' },
  { id: 'changes', label: 'À revoir' },
  { id: 'templates', label: 'Modèles' },
] as const;
type FilterId = (typeof FILTERS)[number]['id'];

/** Une ligne de l'historique : un évènement du fil, ou une publication faite d'après le plan. */
type HistoryItem = { kind: 'event'; e: ActivityEvent; at: string } | { kind: 'published'; item: PlanItem; at: string };

/**
 * Menu de la campagne : son détail sur toute la largeur (la liste des campagnes s'ouvre par les deux
 * flèches, le stylo la complète pour les responsables) ; à gauche ses compositions, filtrées et
 * cherchées, chacune avec l'éventail de ses publications (double toucher pour l'ouvrir) ; à droite
 * l'historique des actions menées sur la campagne.
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
  /** fil de l'activité, d'où vient l'historique */
  events: ActivityEvent[] | null;
  me: string;
  canEdit: boolean;
  isAdmin: boolean;
  canVote: boolean;
  onPickCampaign: (id: string) => void;
  onAllCampaigns: () => void;
  onEditCampaign: () => void;
  onSaveNew: () => void;
  onNew: () => void;
  onOpen: (m: AtelierMeta) => void;
  onVote: (m: AtelierMeta) => void;
  onDelete: (m: AtelierMeta) => void;
  onTemplate: (m: AtelierMeta, on: boolean) => void;
}) {
  const c = p.campaign;
  const [switching, setSwitching] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<FilterId>('all');
  const [filtering, setFiltering] = useState(false);
  const [sel, setSel] = useState<string | undefined>(p.current?.id);
  // glisser une ligne vers la gauche (doigt, ou deux doigts sur le trackpad) découvre la corbeille, comme sur Mac et iPhone ;
  // la ligne se resserre (le titre s'abrège) plutôt que de sortir du cadre
  const [swiped, setSwiped] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number } | null>(null);
  const gesture = useRef<{ id: string; x: number; y: number; base: number; on: boolean } | null>(null);
  const swipedNow = useRef(false);
  const wheel = useRef<{ id: string; sum: number; t: number } | null>(null);
  const offsetOf = (id: string) => (drag?.id === id ? drag.dx : swiped === id ? -SWIPE : 0);
  const swipeHandlers = (id: string) =>
    p.canEdit
      ? {
          onPointerDown: (e: React.PointerEvent) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            gesture.current = { id, x: e.clientX, y: e.clientY, base: swiped === id ? -SWIPE : 0, on: false };
          },
          onPointerMove: (e: React.PointerEvent) => {
            const g = gesture.current;
            if (!g || g.id !== id) return;
            const dx = e.clientX - g.x;
            if (!g.on) {
              if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(e.clientY - g.y)) return;
              g.on = true;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              if (swiped && swiped !== id) setSwiped(null);
            }
            setDrag({ id, dx: Math.max(-SWIPE - 24, Math.min(0, g.base + dx)) });
          },
          onPointerUp: () => {
            const g = gesture.current;
            gesture.current = null;
            if (!g?.on) return;
            swipedNow.current = true;
            setTimeout(() => (swipedNow.current = false), 0);
            setSwiped((drag?.dx ?? 0) < -SWIPE / 2 ? id : null);
            setDrag(null);
          },
          onPointerCancel: () => {
            gesture.current = null;
            setDrag(null);
          },
          onWheel: (e: React.WheelEvent) => {
            if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
            const now = Date.now();
            const w = wheel.current && wheel.current.id === id && now - wheel.current.t < 250 ? wheel.current : { id, sum: 0, t: now };
            w.sum += e.deltaX;
            w.t = now;
            wheel.current = w;
            if (w.sum > 40) setSwiped(id);
            else if (w.sum < -40) setSwiped((x) => (x === id ? null : x));
          },
        }
      : {};
  // double toucher (ou double clic) : ouvre la composition
  const lastTap = useRef<{ id: string; at: number } | null>(null);

  const norm = (s?: string) => (s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const inCampaign = (m: AtelierMeta) => (c ? m.campaign === c.id : !m.campaign);
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
      p.projects
        .filter(inCampaign)
        .filter(keep)
        .filter((m) => !q || norm(`${m.title} ${m.author ?? m.by ?? ''}`).includes(norm(q)))
        .sort((a, b) => (c ? (b.votes?.length ?? 0) - (a.votes?.length ?? 0) : 0) || b.updated.localeCompare(a.updated)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.projects, c, q, filter, p.me],
  );
  // validation au global : la composition validée la mieux notée est retenue par défaut dans le plan
  const suggested = c ? p.projects.filter((m) => m.campaign === c.id).sort((a, b) => (b.votes?.length ?? 0) - (a.votes?.length ?? 0)).find((m) => m.review?.status === 'approved') : undefined;
  const targetsOf = (m: AtelierMeta): Target[] => (m.id === p.current?.id && p.currentTargets.length ? p.currentTargets : m.targets?.length ? m.targets : [{ format: m.formatId ?? 'a4' }]);
  const switchList = p.campaigns.filter((x) => !x.closed).sort((a, b) => (a.date && b.date ? a.date.localeCompare(b.date) : a.date ? -1 : b.date ? 1 : b.created.localeCompare(a.created)));
  const d = c?.date ? new Date(`${c.date}T12:00:00`) : null;
  const channels = channelsOf(p.activity);

  // historique : ce que l'équipe a fait sur la campagne (ou sur les compositions hors campagne)
  const history: HistoryItem[] = [
    ...(p.events ?? []).filter((e) => (c ? e.inCampaign === c.id || (e.type === 'campaign' && e.campaign === c.id) : !!e.atelier && !e.inCampaign)).map((e) => ({ kind: 'event' as const, e, at: e.at })),
    ...(c?.plan ?? []).filter((it) => it.published).map((item) => ({ kind: 'published' as const, item, at: item.published! })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const fold = useHistoryFold();

  const tap = (m: AtelierMeta) => {
    if (swipedNow.current) return;
    if (swiped) return setSwiped(null);
    const now = Date.now();
    const again = lastTap.current?.id === m.id && now - lastTap.current.at < 400;
    lastTap.current = again ? null : { id: m.id, at: now };
    setSel(m.id);
    // double toucher : la composition s'ouvre sur sa première publication, avec son menu
    if (again) p.onOpen(m);
  };

  return (
    <div className={`bubble projects-bubble cm-menu ${fold.on ? 'folded' : ''}`} onPointerDown={(e) => e.stopPropagation()}>
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
        <button className={`act-icon ${switching ? 'on' : ''}`} onClick={() => setSwitching(!switching)} title="Changer de campagne" aria-label="Changer de campagne" aria-expanded={switching}>
          <Icon name="switch" />
        </button>
      </div>
      {switching && <div className="cm-switch-back" onPointerDown={() => setSwitching(false)} />}
      {switching && (
        <div className="act-switch cm-switch" role="dialog" aria-label="Changer de campagne">
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

      <div className={`cm-cols ${fold.on ? 'folded' : ''}`}>
        <div className="cm-left">
          <div className="cm-tools">
            <button className={`act-icon cm-filter ${filter !== 'all' || filtering ? 'on' : ''}`} onClick={() => setFiltering(!filtering)} title={`Filtrer : ${FILTERS.find((x) => x.id === filter)!.label.toLowerCase()}`} aria-label="Filtrer les compositions" aria-expanded={filtering}>
              <Icon name="funnel" />
            </button>
            <input className="pf-input" type="search" placeholder="Chercher…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Chercher une composition" />
            {p.canEdit && (
              <button
                className="act-icon cm-del-sel"
                disabled={!list.some((m) => m.id === sel)}
                onClick={() => sel && setSwiped(swiped === sel ? null : sel)}
                title="Supprimer la composition choisie"
                aria-label="Supprimer la composition choisie"
              >
                <Icon name="trash" />
              </button>
            )}
            <button className="act-icon cm-add" onClick={p.onNew} disabled={!p.canEdit} title="Nouvelle composition" aria-label="Nouvelle composition">
              <Icon name="plus" />
            </button>
          </div>
          {filtering && (
            <div className="cm-filters" role="radiogroup" aria-label="Filtre">
              {FILTERS.filter((x) => x.id !== 'templates' || c).map((x) => (
                <button key={x.id} role="radio" aria-checked={filter === x.id} className={`cm-chip ${filter === x.id ? 'on' : ''}`} onClick={() => setFilter(x.id)}>
                  {x.label}
                </button>
              ))}
            </div>
          )}
          <div className="cm-list">
            {!p.current && (
              <div className="cm-row unsaved">
                <span className="cm-txt">
                  <b>Page non enregistrée</b>
                  <button className="ab-link" onClick={p.onSaveNew}>
                    Enregistrer cette page
                  </button>
                </span>
              </div>
            )}
            {list.map((m) => {
              const on = m.id === sel;
              const cur = m.id === p.current?.id;
              const tpl = !!c?.templates?.includes(m.id);
              const st = statusOf(m, c);
              return (
                <div key={m.id} className={`cm-swipe ${swiped === m.id ? 'open' : ''}`}>
                  {p.canEdit && (
                    <button
                      className="cm-swipe-del"
                      tabIndex={swiped === m.id ? 0 : -1}
                      onClick={() => {
                        setSwiped(null);
                        p.onDelete(m);
                      }}
                      aria-label={`Supprimer « ${m.title} »`}
                    >
                      <Icon name="trash" />
                      <span>Supprimer</span>
                    </button>
                  )}
                <div className={`cm-item ${on ? 'sel' : ''} ${drag?.id === m.id ? 'dragging' : ''}`} style={{ marginRight: offsetOf(m.id) ? -offsetOf(m.id) : undefined }}
                  {...swipeHandlers(m.id)}
                  onClickCapture={(e) => {
                    // fin d'un glissé, ou corbeille découverte : le toucher referme seulement
                    if (!swipedNow.current && !swiped) return;
                    e.stopPropagation();
                    if (!swipedNow.current) setSwiped(null);
                  }}
                >
                  <button className={`cm-row ${cur ? 'cur' : ''}`} onClick={() => tap(m)} title="Toucher deux fois pour ouvrir la composition et ses publications">
                    <span className="cm-txt">
                      <b>{cur ? p.current!.title : m.title}</b>
                      <small>
                        {[who(m.author ?? m.by), when(m.updated)].filter(Boolean).join(' · ')}
                        {m.messages ? ` · ${m.messages} msg` : ''}
                      </small>
                    </span>
                  </button>
                  {/* l'éventail prend toute la hauteur de la ligne, à droite */}
                  <span className="cm-fan" onClick={() => tap(m)}>
                    <PubFan m={m} pubs={pubsOf(m, targetsOf(m), c, suggested)} activity={p.activity} size={64} />
                  </span>
                  {/* une ligne alignée : où en est la composition, ses voix, modèle */}
                  <div className="cm-line">
                    {st && <span className={`proj-badge st-${st.kind}`}>{st.label} le {dmy(st.at)}</span>}
                    {p.canVote ? (
                      <VoteButton votes={m.votes ?? []} voted={!!m.voted} onVote={() => p.onVote(m)} />
                    ) : (
                      !!m.votes?.length && <span className="vote">♥ {m.votes.length}</span>
                    )}
                    {c && p.isAdmin ? (
                      <button className={`cm-star ${tpl ? 'on' : ''}`} onClick={() => p.onTemplate(m, !tpl)} aria-pressed={tpl} title={tpl ? 'Modèle de la campagne : chacun peut en partir. Toucher pour retirer.' : 'En faire un modèle de la campagne : chacun pourra en partir'}>
                        {tpl ? '★' : '☆'}
                      </button>
                    ) : (
                      tpl && (
                        <span className="cm-star on" title="Modèle de la campagne">
                          ★
                        </span>
                      )
                    )}
                  </div>
                </div>
                </div>
              );
            })}
            {!list.length && <p className="fx-hint">{q || filter !== 'all' ? 'Aucune composition ne correspond.' : c ? 'Aucune composition dans cette campagne pour l’instant.' : 'Aucune composition hors campagne.'}</p>}
          </div>
        </div>

        <HistoryPanel
          items={history}
          events={p.events}
          me={p.me}
          campaigns={p.campaigns}
          activity={p.activity}
          folded={fold.on}
          onFold={fold.toggle}
          empty="Rien encore : les compositions, messages, votes, validations et publications de la campagne s’inscriront ici."
        />
      </div>
    </div>
  );
}

/** L'historique se replie (préférence gardée sur l'appareil) : le menu se resserre sur sa colonne de gauche. */
const FOLD_KEY = 'ftd.historyFolded';
function useHistoryFold() {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(FOLD_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setOn((x) => {
      try {
        localStorage.setItem(FOLD_KEY, x ? '0' : '1');
      } catch {
        /* stockage indisponible : le pli vaut pour cette fois */
      }
      return !x;
    });
  return { on, toggle };
}

/** Colonne de droite : l'historique, ou, replié, une languette pour le rouvrir. */
function HistoryPanel(p: { items: HistoryItem[]; events: ActivityEvent[] | null; me: string; campaigns: Campaign[]; activity: ActivityProfile | null; folded: boolean; onFold: () => void; empty: string; title?: string }) {
  if (p.folded)
    return (
      <button className="cm-hist-tab" onClick={p.onFold} title="Afficher l’historique" aria-label="Afficher l’historique" aria-expanded={false}>
        <span aria-hidden>‹</span>
        <span className="cm-hist-tab-txt">{p.title ?? 'Historique'}</span>
        {!!p.items.length && <small>{p.items.length}</small>}
      </button>
    );
  let lastDay = '';
  return (
    <div className="cm-right cm-history">
      <div className="cm-hist-head">
        <div className="b-sub">{p.title ?? 'Historique'}</div>
        <button className="cm-fold" onClick={p.onFold} title="Replier l’historique" aria-label="Replier l’historique" aria-expanded>
          ›
        </button>
      </div>
      {p.events === null && <p className="fx-hint">L’historique s’affiche avec une activité en ligne.</p>}
      {p.events !== null && !p.items.length && <p className="fx-hint">{p.empty}</p>}
      {p.items.map((h, i) => {
        const dd = feedDay(h.at);
        const head = dd !== lastDay;
        lastDay = dd;
        return (
          <div key={i}>
            {head && <div className="cp-sub feed-day">{dd}</div>}
            <div className="feed-row cm-hist">
              <span className="feed-ic">{h.kind === 'event' ? FEED_ICONS[h.e.type] : '🚀'}</span>
              <span className="feed-txt">
                {h.kind === 'event' ? (
                  feedLine({ ...h.e, inCampaign: undefined }, p.me, p.campaigns, p.activity)
                ) : (
                  <>
                    <b>{targetLabel(h.item, p.activity)}</b>
                    {h.item.label ? ` · ${h.item.label}` : ''} publiée
                  </>
                )}
              </span>
              <small>{feedTime(h.at)}</small>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Menu de la composition (3e niveau du fil d'Ariane) : son titre (double toucher pour le changer),
 * où elle en est, et ses publications en grand éventail ; toucher une carte l'affiche dans l'espace
 * de travail. À droite, l'historique de la composition.
 */
export function CompositionMenu(p: {
  /** fiche de la composition (absente : page pas encore enregistrée) */
  meta?: AtelierMeta;
  current?: { id: string; title: string };
  targets: Target[];
  /** publication affichée */
  active: number;
  campaign?: Campaign;
  campaigns: Campaign[];
  projects: AtelierMeta[];
  activity: ActivityProfile | null;
  events: ActivityEvent[] | null;
  me: string;
  canEdit: boolean;
  isAdmin: boolean;
  canVote: boolean;
  onTitle: (t: string) => void;
  onShow: (i: number) => void;
  onPublications: () => void;
  onCampaign: () => void;
  onSaveNew: () => void;
  onVote: (m: AtelierMeta) => void;
  onTemplate: (m: AtelierMeta, on: boolean) => void;
}) {
  const m = p.meta;
  const c = p.campaign && m?.campaign === p.campaign.id ? p.campaign : undefined;
  const [renaming, setRenaming] = useState(false);
  const lastTap = useRef(0);
  const fold = useHistoryFold();
  const channels = channelsOf(p.activity);
  const suggested = c ? p.projects.filter((x) => x.campaign === c.id).sort((a, b) => (b.votes?.length ?? 0) - (a.votes?.length ?? 0)).find((x) => x.review?.status === 'approved') : undefined;
  const pubs = m ? pubsOf(m, p.targets, c, suggested) : p.targets.map((target) => ({ target, rows: [] }));
  const st = m ? statusOf(m, c) : null;
  const tpl = !!(m && c?.templates?.includes(m.id));
  const title = p.current?.title ?? 'Page non enregistrée';
  const n = pubs.length;
  const mid = (n - 1) / 2;
  // l'éventail s'ouvre davantage quand il y a peu de cartes
  const spread = n > 1 ? Math.min(9, 40 / (n - 1)) : 0;
  const history: HistoryItem[] = m
    ? [
        ...(p.events ?? []).filter((e) => e.atelier === m.id).map((e) => ({ kind: 'event' as const, e, at: e.at })),
        ...(c?.plan ?? []).filter((it) => it.published && it.composition === m.id).map((item) => ({ kind: 'published' as const, item, at: item.published! })),
      ].sort((a, b) => b.at.localeCompare(a.at))
    : [];
  const tapTitle = () => {
    if (!p.current || !p.canEdit) return;
    const now = Date.now();
    if (now - lastTap.current < 400) setRenaming(true);
    lastTap.current = now;
  };
  const card = (pub: Pub, i: number): ReactNode => {
    const f = formatOf(pub.target.format);
    const ratio = Math.min(1.8, Math.max(0.5, f.width / f.height));
    const h = 132;
    const on = i === p.active;
    return (
      <button
        key={i}
        className={`pub-card big ps-${pubState(pub)} ${on ? 'on' : ''}`}
        style={{ width: Math.round(h * ratio), height: h, transform: `rotate(${(i - mid) * spread}deg) translateY(${on ? -14 : 0}px)`, zIndex: on ? 50 : i }}
        onClick={() => p.onShow(i)}
        title={`${targetLabel(pub.target, p.activity)} · ${pubWhen(pub)}`}
        aria-label={`Afficher ${targetLabel(pub.target, p.activity)}`}
        aria-pressed={on}
      >
        {m ? <img src={thumbUrl(m)} alt="" loading="lazy" draggable={false} /> : <span className="pub-blank" />}
        <span className="pub-media">
          <MediaIcon ch={channels.find((x) => x.id === pub.target.channel)} size={18} />
        </span>
      </button>
    );
  };
  return (
    <div className={`bubble projects-bubble cm-menu comp-menu ${fold.on ? 'folded' : ''}`} onPointerDown={(e) => e.stopPropagation()}>
      <div className="act-row act-current cm-head">
        <span className="act-txt">
          {renaming && p.current ? (
            <input
              className="pf-input cm-rename"
              autoFocus
              value={p.current.title}
              onChange={(e) => p.onTitle(e.target.value)}
              onBlur={() => setRenaming(false)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && setRenaming(false)}
              aria-label="Titre de la composition"
            />
          ) : (
            <b className="cm-name" onClick={tapTitle} title={p.current && p.canEdit ? 'Toucher deux fois pour renommer' : undefined}>
              {title}
            </b>
          )}
          <small>
            {[m && who(m.author ?? m.by), m && when(m.updated), `${n} publication${n > 1 ? 's' : ''}`].filter(Boolean).join(' · ')}
            {m?.messages ? ` · ${m.messages} msg` : ''}
          </small>
          {m && (
            <div className="cm-line comp-line">
              {st && <span className={`proj-badge st-${st.kind}`}>{st.label} le {dmy(st.at)}</span>}
              {p.canVote ? <VoteButton votes={m.votes ?? []} voted={!!m.voted} onVote={() => p.onVote(m)} /> : !!m.votes?.length && <span className="vote">♥ {m.votes.length}</span>}
              {c && p.isAdmin ? (
                <button className={`cm-star ${tpl ? 'on' : ''}`} onClick={() => p.onTemplate(m, !tpl)} aria-pressed={tpl} title={tpl ? 'Modèle de la campagne : chacun peut en partir. Toucher pour retirer.' : 'En faire un modèle de la campagne : chacun pourra en partir'}>
                  {tpl ? '★' : '☆'}
                </button>
              ) : (
                tpl && <span className="cm-star on" title="Modèle de la campagne">★</span>
              )}
            </div>
          )}
        </span>
        <button className="act-icon" onClick={p.onCampaign} title={c ? `Revenir à la campagne « ${c.name} »` : 'Revenir aux compositions'} aria-label="Revenir à la campagne">
          <Icon name="up" />
        </button>
      </div>
      <div className={`cm-cols ${fold.on ? 'folded' : ''}`}>
        <div className="cm-left">
          {!p.current && (
            <div className="cm-row unsaved">
              <span className="cm-txt">
                <b>Page non enregistrée</b>
                <button className="ab-link" onClick={p.onSaveNew}>
                  Enregistrer cette page
                </button>
              </span>
            </div>
          )}
          {/* les publications en grand éventail : toucher une carte l'affiche dans l'espace de travail */}
          <div className="comp-fan">{n ? pubs.map(card) : <p className="fx-hint">Aucune publication : ajoute la première.</p>}</div>
          <div className="cm-pubs">
            {pubs.map((pub, i) => {
              const f = formatOf(pub.target.format);
              return (
                <button key={i} className={`cm-pub ps-${pubState(pub)} ${i === p.active ? 'on' : ''}`} onClick={() => p.onShow(i)} aria-pressed={i === p.active}>
                  <MediaIcon ch={channels.find((x) => x.id === pub.target.channel)} size={16} />
                  <span>{targetLabel(pub.target, p.activity)}</span>
                  <em className="tg-px">
                    {pub.target.width ?? f.width}×{Math.round(((pub.target.width ?? f.width) * f.height) / f.width)}
                  </em>
                  <small>{pubWhen(pub)}</small>
                </button>
              );
            })}
          </div>
          <button className="pf-btn comp-pubs-btn" onClick={p.onPublications}>
            <Icon name="plus" /> Publications…
          </button>
        </div>
        <HistoryPanel
          items={history}
          events={p.events}
          me={p.me}
          campaigns={p.campaigns}
          activity={p.activity}
          folded={fold.on}
          onFold={fold.toggle}
          title="Historique de la composition"
          empty="Rien encore : les messages, votes, validations et publications de la composition s’inscriront ici."
        />
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
  /** ce que couvre la composition : le nombre de ses publications */
  kind: string;
  /** vignette de la composition (sur téléphone, à la place du nom) */
  thumb?: string;
  /** seul l'échec d'enregistrement se signale (point d'exclamation) */
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
        {p.thumb && <img className="crumb-thumb" src={p.thumb} alt="" />}
        <span className="crumb-txt crumb-two">
          <b>{p.title ?? 'Page non enregistrée'}</b>
          <small>{p.kind}</small>
        </span>
        {p.saving === 'error' && (
          <span className="crumb-alert inline" title={SAVE_LABELS.error} aria-label={SAVE_LABELS.error}>
            !
          </span>
        )}
      </button>
    </nav>
  );
}
