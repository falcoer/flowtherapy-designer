import { useEffect, useState } from 'react';
import { fetchMe, fetchSystem, reindexLibrary, restartServer, serverOnline, type Me, type SystemInfo } from './server';

export type Theme = 'auto' | 'light' | 'dark';
type Tab = 'display' | 'account' | 'system';

const MODES: Record<Me['mode'], string> = { compte: 'Compte Google ou Apple', 'mot-de-passe': 'Accès partagé (mot de passe du groupe)', local: 'Poste local' };

/** Durée lisible : « 3 j 4 h », « 2 h 10 min », « 45 s ». */
function since(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d} j ${h} h` : h ? `${h} h ${m} min` : m ? `${m} min` : `${s} s`;
}
const mb = (n: number) => `${Math.round(n / 1048576)} Mo`;

function Toggle({ label, hint, on, set }: { label: string; hint: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="pf-row">
      <span className="pf-txt">
        <b>{label}</b>
        <small>{hint}</small>
      </span>
      <input type="checkbox" className="pf-switch" checked={on} onChange={(e) => set(e.target.checked)} />
    </label>
  );
}

/**
 * Préférences : l'affichage pour soi, son compte, et l'état du serveur pour les administrateurs.
 * Hors ligne (démo), les onglets Compte et Système le disent au lieu de rester vides.
 */
export function PrefsPanel(p: {
  online: boolean | null;
  tips: boolean;
  setTips: (v: boolean) => void;
  penRoll: boolean;
  setPenRoll: (v: boolean) => void;
  penTilt: boolean;
  setPenTilt: (v: boolean) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  lefty: boolean;
  setLefty: (v: boolean) => void;
  guides: { on: boolean; color: string };
  setGuides: (v: { on: boolean; color: string }) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('display');
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!p.online) return setMe(null);
    fetchMe().then(setMe, () => setMe(null));
  }, [p.online]);
  const loadSys = () => {
    setErr(null);
    fetchSystem().then(setSys, (e: Error) => setErr(e.message));
  };
  useEffect(() => {
    if (tab === 'system' && p.online && me?.admin) loadSys();
  }, [tab, p.online, me?.admin]);

  const restart = async () => {
    setConfirm(false);
    setBusy('Redémarrage…');
    try {
      await restartServer();
      // on attend que le serveur réponde à nouveau
      const t0 = Date.now();
      await new Promise((r) => setTimeout(r, 1500));
      while (!(await serverOnline()) && Date.now() - t0 < 60000) await new Promise((r) => setTimeout(r, 1000));
      setBusy(null);
      loadSys();
    } catch (e) {
      setBusy(null);
      setErr((e as Error).message);
    }
  };
  const reindex = async () => {
    setBusy('Réindexation…');
    try {
      const { count } = await reindexLibrary();
      setBusy(null);
      setErr(null);
      setSys((s) => (s ? { ...s, library: count } : s));
    } catch (e) {
      setBusy(null);
      setErr((e as Error).message);
    }
  };

  const showSystem = !p.online || !!me?.admin;
  return (
    <div className="bubble prefs-bubble" onPointerDown={(e) => e.stopPropagation()}>
      <div className="pf-head">
        <span className="b-title">Préférences</span>
        <button className="lamp-close" onClick={p.onClose} aria-label="Fermer">
          ×
        </button>
      </div>
      <div className="seg pf-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'display'} className={tab === 'display' ? 'on' : ''} onClick={() => setTab('display')}>
          Affichage
        </button>
        <button role="tab" aria-selected={tab === 'account'} className={tab === 'account' ? 'on' : ''} onClick={() => setTab('account')}>
          Compte
        </button>
        {showSystem && (
          <button role="tab" aria-selected={tab === 'system'} className={tab === 'system' ? 'on' : ''} onClick={() => setTab('system')}>
            Système
          </button>
        )}
      </div>

      {tab === 'display' && (
        <div className="pf-body">
          <div className="pf-group">Thème</div>
          <div className="seg pf-theme">
            {(
              [
                ['auto', 'Auto'],
                ['light', 'Clair'],
                ['dark', 'Sombre'],
              ] as const
            ).map(([k, n]) => (
              <button key={k} className={p.theme === k ? 'on' : ''} onClick={() => p.setTheme(k)}>
                {n}
              </button>
            ))}
          </div>
          <div className="pf-group">Repères</div>
          <Toggle label="Repères toujours visibles" hint="Sinon, ils n'apparaissent que pendant un déplacement" on={p.guides.on} set={(on) => p.setGuides({ ...p.guides, on })} />
          <div className="pf-row">
            <span className="pf-txt">
              <b>Couleur des repères</b>
            </span>
            <div className="guides-colors">
              {['#7a5cff', '#00b3c7', '#ff3b6b', '#1d1b22', '#ffffff'].map((c) => (
                <button key={c} className={p.guides.color === c ? 'on' : ''} style={{ background: c }} onClick={() => p.setGuides({ ...p.guides, color: c })} aria-label={`Couleur des repères ${c}`} />
              ))}
            </div>
          </div>
          <div className="pf-group">Aide</div>
          <Toggle label="Astuces" hint="Textes d'aide, sous-titres des menus et bandeau d'état" on={p.tips} set={p.setTips} />
          <div className="pf-group">Main</div>
          <Toggle label="Gaucher" hint="Les outils passent à gauche et leurs réglages à droite" on={p.lefty} set={p.setLefty} />
          <div className="pf-group">Stylet</div>
          <Toggle label="Rotation du stylet" hint="Tourner le crayon sur lui-même tourne les tampons" on={p.penRoll} set={p.setPenRoll} />
          <Toggle label="Inclinaison du stylet" hint="Pencher le crayon met les tampons en perspective" on={p.penTilt} set={p.setPenTilt} />
        </div>
      )}

      {tab === 'account' && (
        <div className="pf-body">
          {!p.online ? (
            <p className="pf-note">Hors ligne : la démo garde tout dans ce navigateur. Sur le site du groupe, ton compte s'affiche ici.</p>
          ) : me === undefined ? (
            <p className="pf-note">Chargement…</p>
          ) : !me ? (
            <p className="pf-note">Personne n'est connecté.</p>
          ) : (
            <>
              <div className="pf-user">
                <span className="pf-avatar">{(me.name ?? me.email ?? '?').slice(0, 1).toUpperCase()}</span>
                <span className="pf-txt">
                  <b>{me.name ?? me.email}</b>
                  {me.email && me.name && <small>{me.email}</small>}
                </span>
              </div>
              <dl className="pf-dl">
                <dt>Connexion</dt>
                <dd>{MODES[me.mode]}</dd>
                <dt>Rôle</dt>
                <dd>{me.admin ? 'Administrateur' : 'Membre'}</dd>
              </dl>
              {me.mode === 'compte' && (
                <a className="pf-btn" href="/auth/logout">
                  Se déconnecter
                </a>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'system' && (
        <div className="pf-body">
          {!p.online ? (
            <p className="pf-note">Serveur injoignable : cette démo tourne sans serveur. Sur le site du groupe, les administrateurs voient ici la version, l'état du serveur et peuvent le redémarrer.</p>
          ) : (
            <>
              {sys ? (
                <dl className="pf-dl">
                  <dt>Version</dt>
                  <dd>
                    {sys.version}
                    {sys.commit && <small> · {sys.commit}</small>}
                  </dd>
                  <dt>En marche depuis</dt>
                  <dd>{since(sys.uptime)}</dd>
                  <dt>Mémoire</dt>
                  <dd>{mb(sys.memory.rss)}</dd>
                  <dt>Bibliothèque</dt>
                  <dd>{sys.library} éléments</dd>
                  <dt>Compositions</dt>
                  <dd>{sys.ateliers}</dd>
                  <dt>Connexion</dt>
                  <dd>{MODES[sys.auth]}</dd>
                  <dt>Node</dt>
                  <dd>{sys.node}</dd>
                </dl>
              ) : (
                !err && <p className="pf-note">Chargement…</p>
              )}
              {err && <p className="pf-note pf-err">{err}</p>}
              {busy ? (
                <p className="pf-note">{busy}</p>
              ) : confirm ? (
                <div className="pf-confirm">
                  <span>Redémarrer le serveur ? Les autres membres seront coupés quelques secondes.</span>
                  <div className="pf-acts">
                    <button className="pf-btn" onClick={() => setConfirm(false)}>
                      Annuler
                    </button>
                    <button className="pf-btn danger" onClick={() => void restart()}>
                      Redémarrer
                    </button>
                  </div>
                </div>
              ) : (
                <div className="pf-acts">
                  <button className="pf-btn" onClick={loadSys}>
                    Actualiser
                  </button>
                  <button className="pf-btn" onClick={() => void reindex()}>
                    Réindexer la bibliothèque
                  </button>
                  <button className="pf-btn danger" disabled={!!sys && !sys.restartable} title={sys && !sys.restartable ? 'Le serveur ne tourne pas sous systemd' : undefined} onClick={() => setConfirm(true)}>
                    Redémarrer le serveur
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
