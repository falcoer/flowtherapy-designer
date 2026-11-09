import { useEffect, useMemo, useRef, useState } from 'react';
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
  onTitle: (t: string) => void;
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
  // le titre de la composition ouverte se renomme sur place, d'un double toucher
  const [renaming, setRenaming] = useState(false);
  useEffect(() => setRenaming(false), [sel]);
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
  let lastDay = '';

  const tap = (m: AtelierMeta) => {
    if (swipedNow.current) return;
    if (swiped) return setSwiped(null);
    const now = Date.now();
    const again = lastTap.current?.id === m.id && now - lastTap.current.at < 400;
    lastTap.current = again ? null : { id: m.id, at: now };
    setSel(m.id);
    if (again) (m.id === p.current?.id ? setRenaming(true) : p.onOpen(m));
  };

  return (
    <div className="bubble projects-bubble cm-menu" onPointerDown={(e) => e.stopPropagation()}>
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

      <div className="cm-cols">
        <div className="cm-left">
          <div className="cm-tools">
            <button className={`act-icon cm-filter ${filter !== 'all' || filtering ? 'on' : ''}`} onClick={() => setFiltering(!filtering)} title={`Filtrer : ${FILTERS.find((x) => x.id === filter)!.label.toLowerCase()}`} aria-label="Filtrer les compositions" aria-expanded={filtering}>
              <Icon name="funnel" />
            </button>
            <input className="pf-input" type="search" placeholder="Chercher…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Chercher une composition" />
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
                <div className={`cm-item ${on ? 'sel' : ''} ${drag?.id === m.id ? 'dragging' : ''}`} style={{ marginRight: offsetOf(m.id) ? -offsetOf(m.id) : undefined }} {...swipeHandlers(m.id)}>
                  {cur && renaming ? (
                    <div className="cm-row cur">
                      <span className="cm-txt">
                        <input
                          className="pf-input cm-rename"
                          autoFocus
                          value={p.current!.title}
                          onChange={(e) => p.onTitle(e.target.value)}
                          onBlur={() => setRenaming(false)}
                          onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && setRenaming(false)}
                          aria-label="Titre de la composition"
                        />
                      </span>
                      <PubFan m={m} pubs={pubsOf(m, targetsOf(m), c, suggested)} activity={p.activity} />
                    </div>
                  ) : (
                  <button className={`cm-row ${cur ? 'cur' : ''}`} onClick={() => tap(m)} title={cur ? 'Composition ouverte : toucher deux fois pour la renommer' : 'Toucher deux fois pour ouvrir'}>
                    <span className="cm-txt">
                      <b>{cur ? p.current!.title : m.title}</b>
                      <small>
                        {[who(m.author ?? m.by), when(m.updated)].filter(Boolean).join(' · ')}
                        {m.votes?.length ? ` · ♥ ${m.votes.length}` : ''}
                        {m.messages ? ` · ${m.messages} msg` : ''}
                      </small>
                      {(m.review || tpl) && (
                        <span className="cm-badges">
                          {m.review && <span className={`proj-badge st-${m.review.status}`}>{REVIEW_LABELS[m.review.status]}</span>}
                          {tpl && <span className="proj-badge">★ modèle</span>}
                        </span>
                      )}
                    </span>
                    <PubFan m={m} pubs={pubsOf(m, targetsOf(m), c, suggested)} activity={p.activity} />
                  </button>
                  )}
                  {on && (
                    <div className="cm-row-acts">
                      {p.canVote && <VoteButton votes={m.votes ?? []} voted={!!m.voted} onVote={() => p.onVote(m)} />}
                      {c && p.isAdmin && (
                        <button className={`cs-tpl ${tpl ? 'on' : ''}`} onClick={() => p.onTemplate(m, !tpl)} title="Modèle de la campagne : chacun peut en partir">
                          {tpl ? '★ modèle' : '☆ modèle'}
                        </button>
                      )}
                      {!cur && (
                        <button className="pf-btn act-primary cm-open" onClick={() => p.onOpen(m)}>
                          Ouvrir
                        </button>
                      )}
                    </div>
                  )}
                </div>
                </div>
              );
            })}
            {!list.length && <p className="fx-hint">{q || filter !== 'all' ? 'Aucune composition ne correspond.' : c ? 'Aucune composition dans cette campagne pour l’instant.' : 'Aucune composition hors campagne.'}</p>}
          </div>
        </div>

        <div className="cm-right cm-history">
          <div className="b-sub">Historique</div>
          {p.events === null && <p className="fx-hint">L’historique s’affiche avec une activité en ligne.</p>}
          {p.events !== null && !history.length && <p className="fx-hint">Rien encore : les compositions, messages, votes, validations et publications de la campagne s’inscriront ici.</p>}
          {history.map((h, i) => {
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
