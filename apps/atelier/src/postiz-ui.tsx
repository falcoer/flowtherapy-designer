import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPostizAccounts, fetchPostizConfig, postizConnect, postizRemove, savePostizConfig, type PostizAccounts } from './server';

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
