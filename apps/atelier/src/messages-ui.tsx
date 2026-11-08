import { useEffect, useRef, useState } from 'react';
import type { Target } from './model';
import { deleteMessage, listMessages, postMessage, reactMessage, REVIEW_LABELS, type ActivityProfile, type AtelierMessage, type AtelierMeta } from './server';
import { channelsOf, targetKey, targetLabel } from './targets';
import { MediaIcon } from './targets-ui';

export const SMILEYS = ['👍', '❤️', '😂', '😮', '🎉', '🔥', '👀', '🙏'];

const who = (m: AtelierMessage) => m.name || m.by.split('@')[0];
const when = (d: string) => {
  const t = new Date(d);
  const today = new Date().toDateString() === t.toDateString();
  return today ? t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : t.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' + t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

/** Bouton de la barre : une bulle avec le nombre de messages en indice. */
export function MessagesButton({ count, on, onClick }: { count: number; on: boolean; onClick: () => void }) {
  return (
    <button className={`btn msg-btn ${on ? 'on' : ''}`} onClick={onClick} title={count ? `${count} message${count > 1 ? 's' : ''} sur cette composition` : 'Messages sur cette composition'}>
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z" />
      </svg>
      {count > 0 && <span className="msg-count">{count > 99 ? '99+' : count}</span>}
    </button>
  );
}

/** Les messages d'une composition : chacun rattaché au rendu (cible) qu'on regardait, des smileys, et la zone pour écrire. */
export function MessagesDialog(p: {
  atelier: string;
  title: string;
  me: string;
  owner: boolean;
  targets: Target[];
  active: number;
  activity: ActivityProfile | null;
  /** état de validation de la composition, et ce que la personne peut en faire */
  review?: AtelierMeta['review'];
  canPropose: boolean;
  canReview: boolean;
  onStep: (action: 'propose' | 'approve' | 'changes') => Promise<void>;
  onShowTarget: (i: number) => void;
  onCount: (n: number) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<AtelierMessage[] | null>(null);
  const [text, setText] = useState('');
  const [picking, setPicking] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const cur = p.targets[p.active];
  const channels = channelsOf(p.activity);

  const take = (l: AtelierMessage[]) => {
    setList(l);
    p.onCount(l.filter((m) => !m.kind).length);
  };
  const [busy, setBusy] = useState(false);
  // proposer ou répondre : ce qu'on vient d'écrire accompagne l'e-mail, puis l'étape s'inscrit dans le fil
  const step = async (action: 'propose' | 'approve' | 'changes') => {
    setBusy(true);
    try {
      if (text.trim()) {
        await postMessage(p.atelier, text.trim(), cur);
        setText('');
      }
      await p.onStep(action);
      take(await listMessages(p.atelier));
    } catch (e) {
      fail(e as Error);
    } finally {
      setBusy(false);
    }
  };
  const fail = (e: Error) => setErr(e.message);
  useEffect(() => {
    let alive = true;
    const load = () => listMessages(p.atelier).then((l) => alive && take(l), fail);
    void load();
    // les autres écrivent aussi : on relit de temps en temps
    const t = setInterval(load, 20000);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.atelier]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [list?.length]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    postMessage(p.atelier, t, cur).then(take, (e: Error) => {
      setText(t);
      fail(e);
    });
  };
  const react = (m: AtelierMessage, emoji: string) => {
    setPicking(null);
    const on = !m.reactions.some((r) => r.emoji === emoji && r.mine);
    reactMessage(p.atelier, m.id, emoji, on).then(take, fail);
  };
  const targetChip = (t: Target) => {
    const i = p.targets.findIndex((x) => targetKey(x) === targetKey(t));
    const label = targetLabel(t, p.activity);
    return (
      <button className={`msg-target ${i === p.active ? 'on' : ''}`} disabled={i < 0} onClick={() => i >= 0 && p.onShowTarget(i)} title={i < 0 ? 'Cette cible n’est plus dans la composition' : `Afficher ${label}`}>
        <MediaIcon ch={channels.find((c) => c.id === t.channel)} size={16} />
        <span>{label}</span>
      </button>
    );
  };

  return (
    <div className="cp-modal-back" onPointerDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div className="cp-modal msg-modal" role="dialog" aria-label="Messages" onPointerDown={(e) => e.stopPropagation()}>
        <div className="pf-head">
          <span className="b-title">Messages · {p.title}</span>
          <button className="lamp-close" onClick={p.onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <div className="msg-state">
          {p.review ? <span className={`proj-badge st-${p.review.status}`}>{REVIEW_LABELS[p.review.status]}</span> : <span className="msg-state-none">Pas encore proposée</span>}
          <span className="msg-state-acts">
            {p.canPropose && (
              <button className="pf-btn" disabled={busy} onClick={() => void step('propose')} title="Prévenir les responsables par e-mail ; ton message en cours accompagne la proposition">
                Proposer aux responsables
              </button>
            )}
            {p.canReview && (
              <>
                <button className="pf-btn" disabled={busy} onClick={() => void step('changes')} title="Renvoyer à l’auteur ; ton message en cours l’accompagne">
                  À revoir
                </button>
                <button className="pf-btn primary" disabled={busy} onClick={() => void step('approve')} title="Valider la composition ; l’auteur est prévenu">
                  Valider
                </button>
              </>
            )}
          </span>
        </div>
        <div className="msg-list">
          {list === null && <p className="fx-hint">Chargement…</p>}
          {list?.length === 0 && <p className="fx-hint">Pas encore de message. Dis ce que tu penses de ce rendu.</p>}
          {list?.map((m) => {
            const mine = m.by === p.me;
            if (m.kind)
              return (
                <div key={m.id} className={`msg-step st-${m.kind}`}>
                  <span>
                    <b>{mine ? 'Tu as' : `${who(m)} a`}</b> {m.kind === 'proposed' ? 'proposé la composition aux responsables' : m.kind === 'approved' ? 'validé la composition' : 'demandé une retouche'}
                  </span>
                  <small>{when(m.at)}</small>
                </div>
              );
            return (
              <div key={m.id} className={`msg ${mine ? 'mine' : ''}`}>
                {m.picture ? <img className="msg-av" src={m.picture} alt="" referrerPolicy="no-referrer" /> : <span className="msg-av">{who(m).slice(0, 1).toUpperCase()}</span>}
                <div className="msg-body">
                  <div className="msg-head">
                    <b>{mine ? 'Moi' : who(m)}</b>
                    <small>{when(m.at)}</small>
                    {m.target && targetChip(m.target)}
                    {(mine || p.owner) && (
                      <button className="msg-del" title="Retirer ce message" onClick={() => deleteMessage(p.atelier, m.id).then(take, fail)}>
                        ×
                      </button>
                    )}
                  </div>
                  <p className="msg-text">{m.text}</p>
                  <div className="msg-reacts">
                    {m.reactions.map((r) => (
                      <button key={r.emoji} className={`msg-react ${r.mine ? 'on' : ''}`} onClick={() => react(m, r.emoji)} title={r.by.map((e) => e.split('@')[0]).join(', ')}>
                        {r.emoji} {r.by.length}
                      </button>
                    ))}
                    <span className="msg-pick">
                      <button className="msg-react add" onClick={() => setPicking(picking === m.id ? null : m.id)} title="Ajouter un smiley" aria-label="Ajouter un smiley">
                        ☺︎+
                      </button>
                      {picking === m.id && (
                        <span className="msg-smileys">
                          {SMILEYS.map((e) => (
                            <button key={e} onClick={() => react(m, e)}>
                              {e}
                            </button>
                          ))}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={end} />
        </div>
        {err && <p className="pf-err">{err}</p>}
        <div className="msg-new">
          {cur && (
            <div className="msg-about">
              <span>À propos de</span>
              {targetChip(cur)}
            </div>
          )}
          <div className="msg-compose">
            <textarea
              className="pf-input"
              rows={2}
              value={text}
              placeholder="Écrire un message…"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button className="pf-btn primary" onClick={send} disabled={!text.trim()}>
              Envoyer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
