import { useEffect, useState } from 'react';
import { fetchMe, fetchSystem, reindexLibrary, restartServer, serverOnline, type Me, type SystemInfo } from './server';
import { MARK_KINDS, MARKS, type MarkGroup, type MarkKind } from './marks';
import { MarkLegend } from './marks-ui';
import { PointGrids } from './anchor-ui';
import { FRAME_TITLES, ANCHOR_FRAMES, type AnchorFrame } from '@ftd/core';
import { DENSITY_STEPS, type AnchorExtras } from './model';
import { setWarpMode, warpGPU, warpMode, type WarpMode } from './warp-gl';

const MARK_GROUPS: Array<[MarkGroup, string]> = [
  ['page', 'Page'],
  ['repartition', 'Répartition'],
  ['or', 'Nombre d’or'],
  ['armature', 'Armature harmonique'],
  ['objets', 'Repères des objets'],
];

export type Theme = 'auto' | 'light' | 'dark';
/** Le doigt : automatique (dessine tant qu'aucun stylet n'est vu), dessine toujours, ou déplace toujours. */
export type FingerMode = 'auto' | 'draw' | 'move';
type Tab = 'display' | 'system';

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

/** Formes animées : la surface qui se plie (couleur, dégradé, image, peinture) posée par la carte graphique, ou par morceaux. */
function WarpPref() {
  const [m, setM] = useState<WarpMode>(warpMode);
  const gpu = warpGPU();
  const state = gpu === 'hard' ? 'Carte graphique trouvée sur cet appareil.' : gpu === 'soft' ? 'Pas de vraie carte graphique sur cet appareil : le dessin par morceaux y est plus rapide.' : 'Cet appareil n’offre pas la carte graphique au navigateur.';
  const what = m === 'auto' ? 'La carte graphique quand l’appareil en a une, sinon le dessin par morceaux.' : m === 'gl' ? 'Toujours la carte graphique, même simulée (plus lent sans vraie carte).' : 'Toujours le dessin par morceaux, sans la carte graphique.';
  return (
    <>
      <div className="pf-group">Formes animées</div>
      <div className="pf-row pf-col">
        <span className="pf-txt">
          <b>Surface qui suit la forme</b>
          <small>
            {what} {state}
          </small>
        </span>
        <div className="seg pf-theme">
          {(
            [
              ['auto', 'Auto'],
              ['gl', 'Carte graphique'],
              ['2d', 'Par morceaux'],
            ] as const
          ).map(([k, n]) => (
            <button
              key={k}
              className={m === k ? 'on' : ''}
              onClick={() => {
                setWarpMode(k);
                setM(k);
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/**
 * Préférences : l'affichage pour soi, son compte, et l'état du serveur pour les administrateurs.
 * Hors ligne (démo), l'onglet Système le dit au lieu de rester vides.
 */
export function PrefsPanel(p: {
  points: AnchorExtras;
  setPoints: (v: AnchorExtras) => void;
  /** repères de placement, les mêmes pour tous les documents */
  reperes: { frame: AnchorFrame; density: number };
  setReperes: (v: { frame: AnchorFrame; density: number }) => void;
  online: boolean | null;
  tips: boolean;
  setTips: (v: boolean) => void;
  simple: boolean;
  setSimple: (v: boolean) => void;
  penRoll: boolean;
  setPenRoll: (v: boolean) => void;
  penTilt: boolean;
  setPenTilt: (v: boolean) => void;
  fingerMode: FingerMode;
  setFingerMode: (v: FingerMode) => void;
  /** Ce que ferait le doigt en automatique sur cet appareil : dessiner (aucun stylet vu, pas de souris). */
  fingerAuto: boolean;
  penSeen: boolean;
  theme: Theme;
  setTheme: (t: Theme) => void;
  lefty: boolean;
  setLefty: (v: boolean) => void;
  wheelHide: number | null;
  setWheelHide: (v: number | null) => void;
  guides: { on: boolean; color: string };
  setGuides: (v: { on: boolean; color: string }) => void;
  markColors: Partial<Record<MarkKind, string>>;
  setMarkColors: (c: Partial<Record<MarkKind, string>>) => void;
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
          <div className="pf-group">Roue du pinceau</div>
          <div className="pf-row pf-col">
            <span className="pf-txt">
              <b>Cacher la roue du pinceau</b>
              <small>Elle s'écarte sur le côté après ce délai sans y toucher, et revient au survol ou au toucher</small>
            </span>
            <div className="seg pf-theme">
              {(
                [
                  [null, 'Jamais'],
                  [5000, '5 s'],
                  [15000, '15 s'],
                  [30000, '30 s'],
                  [60000, '1 min'],
                ] as const
              ).map(([v, n]) => (
                <button key={n} className={p.wheelHide === v ? 'on' : ''} onClick={() => p.setWheelHide(v)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="pf-group">Repères</div>
          <Toggle label="Repères toujours visibles" hint="Sinon, ils n'apparaissent que pendant un déplacement" on={p.guides.on} set={(on) => p.setGuides({ ...p.guides, on })} />
          <div className="pf-row pf-col">
            <span className="pf-txt">
              <b>Repères de placement</b>
              <small>Les mêmes pour tous les documents : une composition s’adapte ainsi d’un format à l’autre.</small>
            </span>
            <div className="seg">
              {ANCHOR_FRAMES.filter((x) => x !== 'grid').map((x) => (
                <button key={x} className={p.reperes.frame === x ? 'on' : ''} onClick={() => p.setReperes({ ...p.reperes, frame: x as AnchorFrame })} title={FRAME_TITLES[x]}>
                  {x === 'repartition' ? '½ ⅓' : x === 'or' ? 'φ' : '✕'}
                </button>
              ))}
            </div>
            {p.reperes.frame === 'repartition' && (
              <>
                <div className="b-title">
                  Densité <span className="b-count">{['Demis', 'Tiers', 'Quarts', 'Sixièmes', 'Douzièmes', '24es'][p.reperes.density - 1]}</span>
                </div>
                <label className="density">
                  <span>−</span>
                  <input type="range" min={1} max={DENSITY_STEPS.length} step={1} value={p.reperes.density} onChange={(e) => p.setReperes({ ...p.reperes, density: Number(e.target.value) })} />
                  <span>+</span>
                </label>
              </>
            )}
          </div>
          <div className="pf-row pf-col">
            <span className="pf-txt">
              <b>Points d’accroche</b>
              <small>Les points de l’objet et de la page qui s’aimantent, dans toutes les compositions. Touche un point pour allumer ou éteindre sa famille.</small>
            </span>
            <PointGrids points={p.points} frame={p.reperes.frame} onChange={(k, v) => p.setPoints({ ...p.points, [k]: v })} />
          </div>
          <div className="pf-row pf-col">
            <span className="pf-txt">
              <b>Couleurs des repères</b>
              <small>Chaque ligne et chaque sorte de point a sa couleur ; un objet tenu à une marge ou posé sur un point en prend la couleur sur son bord</small>
            </span>
            {MARK_GROUPS.map(([g, title]) => (
              <div key={g} className="pf-marks">
                <span className="pf-marks-title">{title}</span>
                <MarkLegend kinds={MARK_KINDS.filter((k) => MARKS[k].group === g)} colors={p.markColors} onChange={p.setMarkColors} />
              </div>
            ))}
            {Object.keys(p.markColors).length > 0 && (
              <button className="pf-reset" onClick={() => p.setMarkColors({})}>
                Couleurs d’origine
              </button>
            )}
          </div>
          <div className="pf-group">Outils</div>
          <Toggle label="Mode simplifié" hint="Les réglages rares (Transformations, Rognage, Lueur, Semis) attendent un toucher sur « Plus » ; tous les outils restent là" on={p.simple} set={p.setSimple} />
          <div className="pf-group">Aide</div>
          <Toggle label="Astuces" hint="Textes d'aide, sous-titres des menus et bandeau d'état" on={p.tips} set={p.setTips} />
          <div className="pf-group">Main</div>
          <Toggle label="Gaucher" hint="Les outils passent à gauche et leurs réglages à droite" on={p.lefty} set={p.setLefty} />
          <div className="pf-group">Doigt</div>
          <div className="pf-row pf-col">
            <span className="pf-txt">
              <b>Le doigt tient l'outil</b>
              <small>
                {p.fingerMode === 'auto'
                  ? p.fingerAuto
                    ? 'Aucun stylet vu sur cet appareil : le doigt dessine, découpe et tamponne ; deux doigts déplacent la vue. Dès qu’un stylet touche l’écran, le doigt reprend le déplacement.'
                    : p.penSeen
                      ? 'Un stylet a été vu sur cet appareil : il tient l’outil et le doigt déplace les objets.'
                      : 'Souris ou pavé tactile : ils tiennent l’outil et le doigt déplace les objets.'
                  : p.fingerMode === 'draw'
                    ? 'Le doigt dessine comme le stylet, jusqu’au retour du stylet ; deux doigts déplacent la vue.'
                    : 'Le doigt déplace toujours les objets ; seuls le stylet et la souris tiennent l’outil.'}
              </small>
            </span>
            <div className="seg pf-theme">
              {(
                [
                  ['auto', 'Auto'],
                  ['draw', 'Dessine'],
                  ['move', 'Déplace'],
                ] as const
              ).map(([k, n]) => (
                <button key={k} className={p.fingerMode === k ? 'on' : ''} onClick={() => p.setFingerMode(k)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <WarpPref />
          <div className="pf-group">Stylet</div>
          <Toggle label="Rotation du stylet" hint="Tourner le crayon sur lui-même tourne les tampons" on={p.penRoll} set={p.setPenRoll} />
          <Toggle label="Inclinaison du stylet" hint="Pencher le crayon met les tampons en perspective" on={p.penTilt} set={p.setPenTilt} />
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
                  {sys.teams != null && (
                    <>
                      <dt>Équipes</dt>
                      <dd>{sys.teams}</dd>
                    </>
                  )}
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
