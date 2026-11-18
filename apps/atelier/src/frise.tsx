import { Fragment, useEffect, useState, type PointerEvent as RPointerEvent } from 'react';
import { ACCELS, actsOf, animOf, BRAKES, generatorOf, gesturesOf, moveName, newAct, newAnim, newMove, withActs, type Accel, type Act, type Anim, type Brake, type Gesture, type Move, type Timing } from './anim';
import { Fan } from './fan';
import type { Layer } from './model';

/**
 * Frise de l'objet choisi : le déroulé de la vidéo, une ligne par animation posée. Chaque mouvement de l'objet et chaque
 * geste propre de son sticker se pose à la demande (＋ Animation), autant de fois qu'il faut, et prend sa propre ligne :
 * un bloc que l'on déplace et étire dans les périodes, ou que l'on place en touchant sa ligne. Les réglages de la ligne
 * choisie s'ouvrent dessous ; place et durée ne se règlent que sur la ligne.
 */
/** Se placer dans la vidéo en touchant une piste, puis en glissant dessus : la piste garde le doigt jusqu'au lâcher. */
export function scrub(e: RPointerEvent<HTMLElement>, total: number, seek: (t: number) => void) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  if (!r.width) return;
  const at = (x: number) => seek(Math.max(0, Math.min(0.999, (x - r.left) / r.width)) * total);
  e.preventDefault();
  at(e.clientX);
  const id = e.pointerId;
  try {
    el.setPointerCapture(id);
  } catch {
    /* doigt déjà levé */
  }
  const move = (ev: PointerEvent) => ev.pointerId === id && at(ev.clientX);
  const end = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', end);
    el.removeEventListener('pointercancel', end);
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

/** Vignette du squelette : une silhouette en os. */
const RIG_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="4.5" r="2.2" />
    <path d="M12 7v7M12 9l-4.5 3.5L6 16M12 9l4.5 3.5L18 16M12 14l-3 4.5V21M12 14l3 4.5V21" />
  </svg>
);
const MOVE_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />
  </svg>
);

/** Vignette d'un geste dans le choix : le sticker entier, pris au milieu du geste. Un texte (pas de forme à lui) garde une lettre. */
function gestureIcon(a0: Anim, g: Gesture, tm: Timing) {
  // un objet habillé d'un squelette : la vignette montre l'humanoïde qui fait le geste
  const a: Anim = a0.kind === 'rig' ? { ...newAnim(generatorOf('humanoid')!), acts: [] } : a0;
  const gen = generatorOf(a);
  if (gen && gen.on !== 'text')
    try {
      const whole: Anim = { ...a, acts: [] };
      delete whole.part;
      const act = { ...newAct(whole, g, 0, tm), len: 2 };
      const u = g.loop ? 0.3 : 0.5;
      const d = gen.cut(whole, 0, (id) => (id === g.id ? u : 0), { each: (id) => (id === g.id ? [{ act, u, turns: 0.3, of: 2, a: { ...whole, ...act } }] : []) });
      const r = gen.ratio(whole);
      if (d && !d.includes('NaN'))
        return (
          <svg className="fr-fan-ico" viewBox="0 0 1 1" preserveAspectRatio="none" style={{ width: 30 * Math.min(1, r), height: 30 * Math.min(1, 1 / r) }}>
            <path d={d} fill="currentColor" fillRule="evenodd" />
          </svg>
        );
    } catch {
      /* pas de vignette : la lettre */
    }
  return <b className="fr-fan-letter">{g.name.slice(0, 1)}</b>;
}

export function Frise({
  layers,
  selected,
  timing,
  t,
  onSeek,
  onMotion,
  onAnim,
  onRig,
  settings,
  head,
  onShown,
}: {
  layers: Layer[];
  selected: string | null;
  timing: Timing;
  /** Temps courant (s). */
  t: number;
  onSeek: (t: number) => void;
  onSelect?: (id: string) => void;
  /** Nouvelles consignes d'un objet ; `history` = une étape d'annulation. */
  onMotion: (id: string, motion: Move[], history: boolean) => void;
  /** Nouvelles données du sticker d'un objet (ses gestes posés). */
  onAnim: (id: string, anim: Anim, history: boolean) => void;
  /** Pose (true) ou retire (false) un squelette dans l'objet (photo, forme) : on l'habille, ses gestes s'offrent ensuite ici. */
  onRig?: (id: string, on: boolean) => void;
  /** Réglages du sticker : ceux du geste posé choisi, ou sans geste ceux de sa forme. */
  settings?: (act: Act | null) => React.ReactNode;
  /** Commandes de lecture (celles de la barre d'animation), en tête du panneau, fixes au défilement. */
  head?: React.ReactNode;
  /** Le panneau s'affiche ou disparaît : la barre flottante s'efface tant qu'il est là. */
  onShown?: (on: boolean) => void;
}) {
  useEffect(() => {
    onShown?.(true);
    return () => onShown?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [pick, setPick] = useState<{ layer: string; kind: 'move' | 'act'; id: string } | null>(null);
  const [menu, setMenu] = useState(false);
  const me = layers.find((l) => l.id === selected && l.kind !== 'surface');
  const total = timing.period * timing.count;
  const pct = (periods: number) => `${(periods / timing.count) * 100}%`;
  // le sticker de l'objet, ou les gestes d'un texte (vides tant qu'aucun n'est posé)
  const a = me ? animOf(me) : undefined;
  const gestures = a ? gesturesOf(a) : [];
  const acts = a ? actsOf(a, timing) : [];
  const moves = me?.motion ?? [];
  const mine = pick && pick.layer === me?.id ? pick : null;
  const move = mine?.kind === 'move' ? moves.find((m) => m.id === mine.id) : undefined;
  const act = mine?.kind === 'act' ? acts.find((x) => x.id === mine.id) : undefined;
  const nowAt = Math.max(0, Math.min(timing.count - 0.05, t / timing.period));

  /** Pose une consigne de mouvement à un instant (en périodes) : elle prend sa ligne. */
  const addMove = (at: number) => {
    if (!me) return;
    const m = { ...newMove(timing, 0), at, len: Math.min(1, timing.count - at) };
    onMotion(me.id, [...moves, m], true);
    setPick({ layer: me.id, kind: 'move', id: m.id });
  };
  /** Pose un geste du sticker à un instant, sur sa ligne : les gestes d'un sticker d'avant s'inscrivent d'abord dans ses données. */
  const addAct = (g: Gesture, at: number) => {
    if (!me || !a) return;
    const full = withActs(a, timing);
    const x = newAct(full, g, at, timing);
    onAnim(me.id, { ...full, acts: [...(full.acts ?? []), x] }, true);
    setPick({ layer: me.id, kind: 'act', id: x.id });
  };
  /**
   * Suit le doigt sur une ligne : le corps du bloc le déplace, son bord droit l'étire. La ligne garde le doigt
   * jusqu'au lâcher (c'est elle qui écoute, pas le bloc : il peut se redessiner sans couper le geste).
   */
  const follow = (e: RPointerEvent<HTMLElement>, b: { at: number; len: number }, edge: boolean, step: number, put: (at: number, len: number, history: boolean) => void, moved = false) => {
    const track = (e.currentTarget.closest('.fr-track') ?? e.currentTarget) as HTMLElement;
    const w = track.getBoundingClientRect().width;
    if (!w) return;
    const x0 = e.clientX;
    const id = e.pointerId;
    try {
      track.setPointerCapture(id);
    } catch {
      /* doigt déjà levé */
    }
    const snap = (v: number) => Math.round(v / step) * step;
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== id || (!moved && Math.abs(ev.clientX - x0) < 4)) return;
      const d = ((ev.clientX - x0) / w) * timing.count;
      if (edge) put(b.at, Math.max(step, Math.min(timing.count - b.at, snap(b.len + d))), !moved);
      else put(Math.max(0, Math.min(timing.count - b.len, snap(b.at + d))), b.len, !moved);
      moved = true;
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      track.removeEventListener('pointermove', onMove);
      track.removeEventListener('pointerup', onUp);
      track.removeEventListener('pointercancel', onUp);
    };
    track.addEventListener('pointermove', onMove);
    track.addEventListener('pointerup', onUp);
    track.addEventListener('pointercancel', onUp);
  };
  /**
   * Geste sur la ligne d'un bloc. Sur le bloc : le déplacer ; sur son bord : l'étirer ;
   * ailleurs sur la ligne : le bloc vient s'y placer (début au doigt), puis suit le doigt.
   */
  const onLine = (e: RPointerEvent<HTMLElement>, b: { at: number; len: number }, step: number, put: (at: number, len: number, history: boolean) => void) => {
    e.preventDefault();
    const hit = e.target as HTMLElement;
    if (hit.closest('.fr-edge')) return follow(e, b, true, step, put);
    if (hit.closest('.fr-blk')) return follow(e, b, false, step, put);
    const r = e.currentTarget.getBoundingClientRect();
    const at = Math.max(0, Math.min(timing.count - b.len, Math.round((((e.clientX - r.left) / r.width) * timing.count) / step) * step));
    put(at, b.len, true);
    follow(e, { at, len: b.len }, false, step, put, true);
  };
  const lineMove = (e: RPointerEvent<HTMLElement>, m: Move) => {
    if (!me) return;
    setPick({ layer: me.id, kind: 'move', id: m.id });
    onLine(e, m, 0.25, (at, len, h) => onMotion(me.id, moves.map((x) => (x.id === m.id ? { ...m, at, len } : x)), h));
  };
  const lineAct = (e: RPointerEvent<HTMLElement>, x: Act) => {
    if (!me || !a) return;
    // sticker d'avant : ses gestes s'inscrivent dans ses données au premier geste, avec les mêmes identifiants
    const full = withActs(a, timing);
    setPick({ layer: me.id, kind: 'act', id: x.id });
    const r2 = (v: number) => Math.round(v * 100) / 100;
    onLine(e, x, 0.05, (at, len, h) => onAnim(me.id, { ...full, acts: full.acts!.map((y) => (y.id === x.id ? { ...y, at: r2(at), len: r2(len) } : y)) }, h));
  };
  const set = (p: Partial<Move>, history = true) => {
    if (!me || !move) return;
    onMotion(me.id, moves.map((m) => (m.id === move.id ? { ...m, ...p } : m)), history);
  };
  const num = (label: string, value: number, on: (v: number) => void, o: { min?: number; max?: number; step?: number; unit?: string; title?: string } = {}) => (
    <label title={o.title}>
      {label}
      <input
        type="number"
        inputMode="decimal"
        min={o.min}
        max={o.max}
        step={o.step ?? 1}
        value={Math.round(value * 1000) / 1000}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(v)) on(Math.max(o.min ?? -Infinity, Math.min(o.max ?? Infinity, v)));
        }}
      />
      {o.unit}
    </label>
  );
  const now = <span className="fr-now" style={{ left: `${(t / total) * 100}%` }} />;
  const ticks = Array.from({ length: timing.count - 1 }, (_, i) => <span key={i} className="fr-tick" style={{ left: pct(i + 1) }} />);
  const actGesture = act ? gestures.find((g) => g.id === act.g) : undefined;
  if (!me) return null;
  // les réglages du bloc choisi s'ouvrent sous sa ligne, sans titre : la ligne dit déjà de quoi il s'agit
  const actSet = act && actGesture && a && (
    <div className="fr-own-set fr-under">
      {settings?.(act)}
      <button
        className="fr-del"
        onClick={() => {
          onAnim(me.id, { ...a, acts: acts.filter((x) => x.id !== act.id) }, true);
          setPick(null);
        }}
      >
        Supprimer
      </button>
    </div>
  );
  const moveSet = move && (
        <div className="fr-edit fr-under">
          <div className="fr-line">
            <label title="L'objet revient à son état de départ sur la seconde moitié">
              <input type="checkbox" checked={!!move.back} onChange={(e) => set({ back: e.target.checked || undefined })} />
              Aller-retour
            </label>
            <button
              className="fr-del"
              onClick={() => {
                onMotion(me.id, moves.filter((m) => m.id !== move.id), true);
                setPick(null);
              }}
            >
              Supprimer
            </button>
          </div>
          <div className="fr-line">
            {num('Déplacement →', (move.dx ?? 0) * 100, (v) => set({ dx: v / 100 || undefined }), { min: -200, max: 200, step: 5, unit: '%', title: 'Vers la droite, en pourcentage de la largeur de la page (négatif = vers la gauche)' })}
            {num('↓', (move.dy ?? 0) * 100, (v) => set({ dy: v / 100 || undefined }), { min: -200, max: 200, step: 5, unit: '%', title: 'Vers le bas, en pourcentage de la hauteur de la page (négatif = vers le haut)' })}
            {num('Rotation', move.rot ?? 0, (v) => set({ rot: v || undefined }), { min: -50, max: 50, step: 0.25, unit: 'tr', title: 'En tours ; négatif = sens inverse des aiguilles' })}
            {num('Taille', (move.scale ?? 1) * 100, (v) => set({ scale: v === 100 ? undefined : v / 100 }), { min: 5, max: 800, step: 10, unit: '%', title: 'Taille à l’arrivée (100 = inchangée)' })}
            {num('Hauteur', (move.lift ?? 0) * 100, (v) => set({ lift: v / 100 || undefined }), { min: -100, max: 100, step: 5, title: 'Hauteur ajoutée au-dessus de la page : l’ombre s’allonge, la mise au point change' })}
          </div>
          <div className="fr-line">
            <label>
              Accélération
              <select value={move.accel ?? 'linear'} onChange={(e) => set({ accel: e.target.value as Accel })}>
                {ACCELS.map(([k, n]) => (
                  <option key={k} value={k}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Freinage
              <select value={move.brake ?? 'sharp'} onChange={(e) => set({ brake: e.target.value as Brake })}>
                {BRAKES.map(([k, n]) => (
                  <option key={k} value={k}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      );
  return (
    <div className="frise">
      <div className="fr-rows">
        {/* en tête, fixes quand on fait défiler les lignes : la lecture, les réglages de la vidéo et la règle */}
        <div className="fr-sticky">
        {head && <div className="fr-head">{head}</div>}
        <div className="fr-row fr-ruler">
          <span className="fr-name fr-adder">
            <button className="fr-add" onClick={() => setMenu((m) => !m)} aria-expanded={menu} title="Ajouter une animation à l'instant affiché : un mouvement de l'objet, ou un de ses gestes propres (sticker, texte)">
              ＋ Animation
            </button>
            {menu && (
              <>
                <span className="fr-menu-veil" onPointerDown={() => setMenu(false)} />
                {/* le choix se déroule à l'horizontale depuis le bouton, comme celui des brosses */}
                <span className="fr-fan">
                  <Fan
                    dir="right"
                    items={[
                      { key: '', icon: MOVE_ICON, label: 'Mouvement', hint: 'déplacer, tourner, grandir, monter' },
                      ...gestures.map((g) => ({ key: g.id, icon: a ? gestureIcon(a, g, timing) : null, label: g.name, hint: g.note })),
                      // une photo, une forme sans animation : on peut y poser un squelette (l'habiller) ; puis l'en retirer
                      ...(onRig && me && !a && (me.kind === 'photo' || (me.kind === 'shape' && !me.text)) ? [{ key: '#rig', icon: RIG_ICON, label: 'Squelette', hint: 'habiller un humanoïde avec cet objet' }] : []),
                      ...(onRig && me && a?.kind === 'rig' ? [{ key: '#unrig', icon: RIG_ICON, label: 'Sans squelette', hint: 'retirer les os de l’objet' }] : []),
                    ]}
                    onPick={(k) => {
                      setMenu(false);
                      if (k === '#rig' || k === '#unrig') return me && onRig?.(me.id, k === '#rig');
                      const g = gestures.find((x) => x.id === k);
                      if (g) addAct(g, Math.round(nowAt * 4) / 4);
                      else addMove(Math.floor(nowAt + 1e-6));
                    }}
                  />
                </span>
              </>
            )}
          </span>
          <div className="fr-track" onPointerDown={(e) => scrub(e, total, onSeek)} title="Toucher ou glisser pour se placer dans la vidéo">
            {Array.from({ length: timing.count }, (_, i) => (
              <span key={i} className="fr-period" style={{ left: pct(i), width: pct(1) }}>
                {timing.count <= 24 || i % 4 === 0 ? i + 1 : ''}
              </span>
            ))}
            {now}
          </div>
        </div>
        </div>
        <div className="fr-obj on">
          {/* une ligne par animation posée : chaque mouvement, puis chaque geste du sticker, avec ses réglages dessous */}
          {moves.map((m) => (
            <Fragment key={m.id}>
              <div className={`fr-row ${move?.id === m.id ? 'on' : ''}`}>
                <button className="fr-name" onClick={() => setPick({ layer: me.id, kind: 'move', id: m.id })}>
                  <i>Mouvement</i>
                </button>
                <div className="fr-track fr-line-put" onPointerDown={(e) => lineMove(e, m)} title="Glisser le bloc pour le déplacer, tirer son bord droit pour l'étirer ; toucher la ligne ailleurs l'y place">
                  {ticks}
                  <span className={`fr-blk fr-move ${move?.id === m.id ? 'on' : ''} ${m.back ? 'back' : ''}`} style={{ left: pct(m.at), width: pct(m.len) }}>
                    <em>{moveName(m)}</em>
                    <span className="fr-edge" />
                  </span>
                  {now}
                </div>
              </div>
              {move?.id === m.id && moveSet}
            </Fragment>
          ))}
          {acts.map((x) => {
            const g = gestures.find((y) => y.id === x.g);
            if (!g) return null;
            return (
              <Fragment key={x.id}>
                <div className={`fr-row ${act?.id === x.id ? 'on' : ''}`}>
                  <button className="fr-name" onClick={() => setPick({ layer: me.id, kind: 'act', id: x.id })}>
                    <i>{g.name}</i>
                  </button>
                  <div className="fr-track fr-line-put" onPointerDown={(e) => lineAct(e, x)} title="Glisser le bloc pour le déplacer, tirer son bord droit pour l'étirer ; toucher la ligne ailleurs l'y place">
                    {ticks}
                    <span className={`fr-blk fr-own ${g.order ? 'order' : ''} ${act?.id === x.id ? 'on' : ''}`} style={{ left: pct(x.at), width: pct(Math.min(x.len, timing.count - x.at)) }}>
                      <em>{g.note}</em>
                      <span className="fr-edge" />
                    </span>
                    {now}
                  </div>
                </div>
                {act?.id === x.id && actSet}
              </Fragment>
            );
          })}
          {!moves.length && !acts.length && <p className="cp-note fr-empty">Aucune animation sur cet objet : ＋ Animation en pose une à l’instant affiché.</p>}
        </div>
      </div>
      {!act && !move && a && settings && (() => {
        const own = settings(null);
        return own ? <div className="fr-own-set">{own}</div> : null;
      })()}
    </div>
  );
}
