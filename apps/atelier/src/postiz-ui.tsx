import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPostizAccounts, fetchPostizConfig, postizConnect, postizPublish, postizRemove, postizUnschedule, savePostizConfig, type Campaign, type PlanItem, type PostizAccount, type PostizAccounts } from './server';

/**
 * Comptes Postiz de l'activité : chargés une fois, relus au retour sur l'onglet et,
 * pendant une connexion, toutes les 4 s (l'autorisation se fait dans un autre onglet).
 */
export function usePostizAccounts(on: boolean) {
  const [data, setData] = useState<PostizAccounts | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const reload = useCallback(() => {
    if (!on) return;
    fetchPostizAccounts().then(
      (d) => (setData(d), setErr(null)),
      (e: Error) => setErr(e.message),
    );
  }, [on]);
  useEffect(() => {
    reload();
    const back = () => document.visibilityState === 'visible' && reload();
    window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', back);
    return () => (window.removeEventListener('focus', back), document.removeEventListener('visibilitychange', back));
  }, [reload]);
  useEffect(() => {
    if (!data?.pending) return;
    const t = window.setInterval(reload, 4000);
    return () => window.clearInterval(t);
  }, [data?.pending, reload]);
  return { data, err, reload };
}

/** Au retour de l'autorisation dans un onglet ouvert par la fiche : on le referme et on revient à la fiche. */
export function closePostizReturn() {
  const q = new URLSearchParams(window.location.search);
  if (!q.has('postiz') || !window.opener) return;
  try {
    (window.opener as Window).focus();
    window.close();
  } catch {
    /* onglet ouvert autrement : il reste ouvert sur l'atelier */
  }
}

/**
 * Les comptes d'un type de diffusion publiés par Postiz : on les relie par l'autorisation du réseau,
 * sans jamais voir Postiz ni de clé.
 */
export function PostizAccountsEditor(p: { channel: string; name: string; data: PostizAccounts; edit: boolean; reload: () => void }) {
  const list = p.data.accounts.filter((a) => a.channel === p.channel);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const waiting = p.data.pending === p.channel;

  const connect = async () => {
    setErr(null);
    setBusy(true);
    // fenêtre ouverte tout de suite (au geste), sinon Safari la bloque
    const w = window.open('', '_blank');
    try {
      const { url } = await postizConnect(p.channel);
      if (w) w.location.href = url;
      else window.location.assign(url);
      p.reload();
    } catch (e) {
      w?.close();
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    if (confirm !== id) return setConfirm(id);
    setConfirm(null);
    setBusy(true);
    try {
      await postizRemove(id);
      p.reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="act-conns wide">
      {list.map((a) => (
        <div key={a.id} className={`act-conn pz-acct ${a.disabled ? 'off' : ''}`}>
          <div className="act-conn-head">
            {a.picture ? <img className="act-avatar pz-pic" src={a.picture} alt="" referrerPolicy="no-referrer" /> : <span className="act-avatar pz-pic">{a.name.slice(0, 1).toUpperCase()}</span>}
            <span className="act-txt">
              <b>{a.name || 'Compte relié'}</b>
              <small>{a.disabled ? 'désactivé : à relier de nouveau' : a.profile ? `@${a.profile}` : 'relié'}</small>
            </span>
            {p.edit && (
              <button className="tm-remove" disabled={busy} onClick={() => void remove(a.id)} title="Détacher ce compte">
                {confirm === a.id ? 'Retirer ?' : '×'}
              </button>
            )}
          </div>
        </div>
      ))}
      {waiting && <p className="fx-hint">En attente de l’autorisation dans l’autre onglet…</p>}
      {err && <p className="pf-note err">{err}</p>}
      {p.edit && (
        <button className="pf-btn act-add" disabled={busy} onClick={() => void connect()}>
          + Relier un compte {p.name}
        </button>
      )}
      {!list.length && !p.edit && <p className="fx-hint">Aucun compte relié.</p>}
    </div>
  );
}

/** Configuration globale › Publication : adresse de Postiz et clé de son API (jamais relue). */
export function PostizTab() {
  const [url, setUrl] = useState('');
  const [keySet, setKeySet] = useState(false);
  const [key, setKey] = useState('');
  const [state, setState] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const loaded = useRef(false);

  const check = () =>
    fetchPostizAccounts().then(
      (d) => setState(d.enabled ? `Postiz répond : ${d.accounts.length} compte${d.accounts.length > 1 ? 's' : ''} relié${d.accounts.length > 1 ? 's' : ''} pour cette activité.` : 'Postiz n’est pas encore configuré.'),
      (e: Error) => setState(e.message),
    );
  useEffect(() => {
    fetchPostizConfig().then(
      (c) => {
        setUrl(c.url);
        setKeySet(c.keySet);
        loaded.current = true;
        if (c.url && c.keySet) void check();
      },
      (e: Error) => setErr(e.message),
    );
  }, []);
  const save = async (patch: { url?: string; key?: string | null }) => {
    setErr(null);
    try {
      const c = await savePostizConfig(patch);
      setUrl(c.url);
      setKeySet(c.keySet);
      setKey('');
      await check();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="cat-edit pz-config">
      <p className="fx-hint">Postiz publie aux dates prévues sur les réseaux. Les activités y relient leurs comptes depuis leur volet Médias, sans voir Postiz.</p>
      <label className="act-field">
        <span className="pf-group">Adresse de Postiz</span>
        <input className="pf-input" value={url} placeholder="https://postiz.exemple.fr" onChange={(e) => setUrl(e.target.value)} onBlur={() => loaded.current && void save({ url })} />
      </label>
      <div className="act-field">
        <span className="pf-group">Clé de l’API publique</span>
        <span className="act-secret">
          <input className="pf-input" type="password" autoComplete="new-password" value={key} placeholder={keySet ? 'enregistrée' : 'Postiz › Settings › Public API'} onChange={(e) => setKey(e.target.value)} />
          {keySet && (
            <button className="tm-remove" onClick={() => void save({ key: null })} title="Effacer la clé">
              ×
            </button>
          )}
        </span>
      </div>
      <div className="act-pal-actions">
        <button className="pf-btn act-primary" disabled={!key.trim()} onClick={() => void save({ url, key: key.trim() })}>
          Enregistrer la clé
        </button>
      </div>
      {state && <p className="pf-note">{state}</p>}
      {err && <p className="pf-note err">{err}</p>}
    </div>
  );
}

/** « 2026-11-15T10:00 » local, pour un champ datetime-local : la date du plan à 10 h, ou dans une heure si elle est passée. */
export function defaultWhen(date?: string, now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const local = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const planned = date ? new Date(`${date}T10:00:00`) : null;
  if (planned && planned.getTime() > now.getTime() + 5 * 60_000) return local(planned);
  const soon = new Date(now.getTime() + 60 * 60_000);
  soon.setMinutes(0, 0, 0);
  return local(soon);
}

const whenLabel = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Un élément du plan dans la bulle Publier : le programmer sur un compte relié (ou le publier tout de suite),
 * suivre son état, l'annuler tant qu'il n'est pas paru.
 */
export function PostizPlanActions(p: {
  campaign: string;
  item: PlanItem;
  accounts: PostizAccount[];
  owner: boolean;
  caption: string;
  composition?: string;
  /** rend l'image de la publication de cet élément ; null si la composition n'a pas ce rendu */
  render: () => Promise<Blob | null>;
  onCampaign: (c: Campaign) => void;
  toast: (m: string) => void;
}) {
  const it = p.item;
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState(() => defaultWhen(it.date));
  const [account, setAccount] = useState(p.accounts[0]?.id ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmNow, setConfirmNow] = useState(false);
  useEffect(() => {
    if (!p.accounts.some((a) => a.id === account)) setAccount(p.accounts[0]?.id ?? '');
  }, [p.accounts, account]);

  const send = async (now: boolean) => {
    if (now && !confirmNow) return setConfirmNow(true);
    setConfirmNow(false);
    setBusy(now ? 'Publication…' : 'Programmation…');
    try {
      const image = await p.render();
      if (!image && !p.caption.trim()) throw new Error('Rien à publier');
      const c = await postizPublish({ campaign: p.campaign, item: it.id, account, when: now ? 'now' : new Date(when).toISOString(), caption: p.caption, composition: p.composition, ...(image ? { image } : {}) });
      p.onCampaign(c);
      setOpen(false);
      p.toast(now ? 'Envoyée : elle paraît dans une minute' : `Programmée le ${whenLabel(new Date(when).toISOString())}`);
    } catch (e) {
      p.toast(`Impossible : ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };
  const cancel = async () => {
    setBusy('Annulation…');
    try {
      p.onCampaign(await postizUnschedule(p.campaign, it.id));
      p.toast('Programmation annulée');
    } catch (e) {
      p.toast(`Impossible : ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  if (it.published)
    return it.link ? (
      <a className="pub-done" href={it.link} target="_blank" rel="noreferrer">
        publiée ↗
      </a>
    ) : (
      <small className="pub-done">publiée</small>
    );
  if (busy) return <small className="fx-hint">{busy}</small>;
  if (it.postiz?.state === 'queue')
    return (
      <span className="pz-state">
        <small className="pz-queued" title="Postiz la publiera à cette date">
          programmée · {whenLabel(it.postiz.at)}
        </small>
        {p.owner && (
          <button className="ab-link" onClick={() => void cancel()}>
            Annuler
          </button>
        )}
      </span>
    );
  if (!p.owner) return it.postiz?.state === 'error' ? <small className="pf-note err">échec</small> : null;
  if (!p.accounts.length) return <small className="fx-hint">aucun compte relié</small>;
  if (!open)
    return (
      <span className="pz-state">
        {it.postiz?.state === 'error' && (
          <small className="pf-note err" title={it.postiz.error}>
            échec
          </small>
        )}
        <button className="ab-link" onClick={() => setOpen(true)}>
          {it.postiz?.state === 'error' ? 'Réessayer' : 'Programmer'}
        </button>
      </span>
    );
  return (
    <div className="pz-sched">
      {it.postiz?.state === 'error' && <p className="pf-note err">{it.postiz.error}</p>}
      {p.accounts.length > 1 && (
        <select className="pf-input" value={account} onChange={(e) => setAccount(e.target.value)}>
          {p.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      )}
      {p.accounts.length === 1 && <small className="fx-hint">sur {p.accounts[0].name}</small>}
      <input className="pf-input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      <div className="pz-sched-acts">
        <button className="ab-link" onClick={() => (setOpen(false), setConfirmNow(false))}>
          Fermer
        </button>
        <button className="pf-btn" onClick={() => void send(true)}>
          {confirmNow ? 'Vraiment maintenant ?' : 'Publier maintenant'}
        </button>
        <button className="pf-btn act-primary" disabled={!when || new Date(when).getTime() < Date.now()} onClick={() => void send(false)}>
          Programmer
        </button>
      </div>
    </div>
  );
}
