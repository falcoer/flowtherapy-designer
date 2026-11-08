import type { ActivityProfile, ActivityEvent, Campaign, PlanItem } from './server';
import { targetLabel } from './targets';

const who = (e: { by: string; name?: string }, me: string) => (e.by === me ? 'Tu' : e.name?.split(' ')[0] || e.by.split('@')[0] || 'Quelqu’un');
const time = (d: string) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const dayOf = (d: string) => {
  const x = new Date(d);
  const t = new Date();
  const y = new Date(t.getTime() - 864e5);
  if (x.toDateString() === t.toDateString()) return 'Aujourd’hui';
  if (x.toDateString() === y.toDateString()) return 'Hier';
  return x.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
};
const shortDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

/** Rendus du plan dont la date est passée sans publication. */
export function overdueOf(campaigns: Campaign[]): Array<{ campaign: Campaign; item: PlanItem }> {
  const today = new Date().toISOString().slice(0, 10);
  return campaigns.filter((c) => !c.closed).flatMap((c) => (c.plan ?? []).filter((it) => !it.published && !!it.date && it.date < today).map((item) => ({ campaign: c, item })));
}

/** Nombre de nouveautés des autres depuis la dernière visite du fil, plus les retards. */
export const unreadCount = (events: ActivityEvent[], seen: string, me: string, late: number) => events.filter((e) => e.at > seen && e.by !== me).length + late;

/** Bouton de la barre : une cloche, le nombre de nouveautés en indice. */
export function FeedButton({ count, on, onClick }: { count: number; on: boolean; onClick: () => void }) {
  return (
    <button className={`btn msg-btn ${on ? 'on' : ''}`} onClick={onClick} title={count ? `${count} nouveauté${count > 1 ? 's' : ''} dans l’activité` : 'Fil de l’activité'}>
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
        <path d="M10 20.5a2 2 0 0 0 4 0" />
      </svg>
      {count > 0 && <span className="msg-count">{count > 99 ? '99+' : count}</span>}
    </button>
  );
}

function line(e: ActivityEvent, me: string, campaigns: Campaign[], activity: ActivityProfile | null) {
  const w = who(e, me);
  const t = e.title ? `« ${e.title} »` : '';
  const s = w === 'Tu' ? 'as' : 'a';
  switch (e.type) {
    case 'message':
      return (
        <>
          <b>{w}</b> {s} écrit sur {t}
          {e.target ? ` (${targetLabel(e.target, activity)})` : ''} : <q>{e.text}</q>
        </>
      );
    case 'proposed':
      return (
        <>
          <b>{w}</b> {s} proposé {t} aux responsables
        </>
      );
    case 'approved':
      return (
        <>
          <b>{w}</b> {s} validé {t}
        </>
      );
    case 'changes':
      return (
        <>
          <b>{w}</b> {s} demandé une retouche sur {t}
        </>
      );
    case 'vote':
      return (
        <>
          <b>{w}</b> {s} aimé {t}
        </>
      );
    case 'composition':
      return (
        <>
          <b>{w}</b> {s} créé {t}
          {e.inCampaign ? ` dans « ${campaigns.find((c) => c.id === e.inCampaign)?.name ?? ''} »` : ''}
        </>
      );
    case 'campaign':
      return (
        <>
          <b>{w}</b> {s} lancé la campagne « {e.text} »
        </>
      );
  }
}

const ICON: Record<ActivityEvent['type'], string> = { message: '💬', proposed: '📨', approved: '✅', changes: '✏️', vote: '❤️', composition: '🎨', campaign: '📣' };

/** Fil de l'activité : retards du plan, puis ce qui s'est passé, jour par jour ; un toucher ouvre ce dont il parle. */
export function FeedDialog(p: {
  events: ActivityEvent[] | null;
  seen: string;
  me: string;
  campaigns: Campaign[];
  activity: ActivityProfile | null;
  onEvent: (e: ActivityEvent) => void;
  onCampaign: (id: string) => void;
  onClose: () => void;
}) {
  const late = overdueOf(p.campaigns);
  let lastDay = '';
  return (
    <div className="cp-modal-back" onPointerDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div className="cp-modal feed-modal" role="dialog" aria-label="Fil de l’activité" onPointerDown={(e) => e.stopPropagation()}>
        <div className="pf-head">
          <span className="b-title">Fil de l’activité</span>
          <button className="lamp-close" onClick={p.onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        {late.length > 0 && (
          <div className="feed-late">
            <div className="cp-sub">En retard</div>
            {late.map(({ campaign, item }) => (
              <button key={`${campaign.id}/${item.id}`} className="feed-row late" onClick={() => p.onCampaign(campaign.id)}>
                <span className="feed-ic">⏰</span>
                <span className="feed-txt">
                  {targetLabel(item, p.activity)}
                  {item.label ? ` · ${item.label}` : ''} pour « {campaign.name} », prévu le {shortDay(item.date!)}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="feed-list">
          {p.events === null && <p className="fx-hint">Chargement…</p>}
          {p.events?.length === 0 && <p className="fx-hint">Rien encore : les messages, votes et validations de l’équipe apparaîtront ici.</p>}
          {p.events?.map((e, i) => {
            const d = dayOf(e.at);
            const head = d !== lastDay;
            lastDay = d;
            return (
              <div key={`${e.type}-${e.at}-${i}`}>
                {head && <div className="cp-sub feed-day">{d}</div>}
                <button className={`feed-row ${e.at > p.seen && e.by !== p.me ? 'new' : ''}`} onClick={() => p.onEvent(e)}>
                  <span className="feed-ic">{ICON[e.type]}</span>
                  <span className="feed-txt">{line(e, p.me, p.campaigns, p.activity)}</span>
                  <small>{time(e.at)}</small>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
