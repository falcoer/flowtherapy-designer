import { useState, type PointerEvent as RPointerEvent } from 'react';
import { ACCELS, actsOf, BRAKES, gesturesOf, moveName, newAct, newMove, withActs, type Accel, type Act, type Anim, type Brake, type Gesture, type Move, type Timing } from './anim';
import type { Layer } from './model';

/**
 * Frise de l'objet choisi : le déroulé de la vidéo, une ligne par animation. Le mouvement de l'objet et chaque geste
 * propre de son sticker se posent à la demande (＋, ou en touchant leur ligne), autant de fois qu'il faut :
 * des blocs que l'on déplace et étire dans les périodes. Les réglages du bloc choisi s'ouvrent dessous ;
 * sa place et sa durée ne se règlent que sur la ligne.
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

export function Frise({
  layers,
  selected,
  timing,
  t,
  onSeek,
  onMotion,
  onAnim,
  settings,
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
  /** Réglages du sticker : ceux du geste posé choisi, ou sans geste ceux de sa forme. */
  settings?: (act: Act | null) => React.ReactNode;
}) {
  const [pick, setPick] = useState<{ layer: string; kind: 'move' | 'act'; id: string } | null>(null);
  const [menu, setMenu] = useState(false);
  // lignes gardées à l'écran même vides : celles que l'on vient de vider restent pour y reposer un bloc
  const [kept, setKept] = useState<{ layer: string; lines: string[] }>({ layer: '', lines: [] });
  const me = layers.find((l) => l.id === selected && l.kind !== 'surface');
  const total = timing.period * timing.count;
  const pct = (periods: number) => `${(periods / timing.count) * 100}%`;
  const a = me?.anim && !me.cut ? me.anim : undefined;
  const gestures = a ? gesturesOf(a) : [];
  const acts = a ? actsOf(a, timing) : [];
  const moves = me?.motion ?? [];
  const mine = pick && pick.layer === me?.id ? pick : null;
  const move = mine?.kind === 'move' ? moves.find((m) => m.id === mine.id) : undefined;
  const act = mine?.kind === 'act' ? acts.find((x) => x.id === mine.id) : undefined;
  const lines = me && kept.layer === me.id ? kept.lines : [];
  const shown = (line: string) => lines.includes(line) || (line === 'move' ? moves.length > 0 : acts.some((x) => x.g === line));
  const keep = (line: string) => me && setKept({ layer: me.id, lines: lines.includes(line) ? lines : [...lines, line] });
  const nowAt = Math.max(0, Math.min(timing.count - 0.05, t / timing.period));

  /** Pose une consigne de mouvement à un instant (en périodes). */
  const addMove = (at: number) => {
    if (!me) return;
    const m = { ...newMove(timing, 0), at, len: Math.min(1, timing.count - at) };
    onMotion(me.id, [...moves, m], true);
    setPick({ layer: me.id, kind: 'move', id: m.id });
    keep('move');
  };
  /** Pose un geste du sticker à un instant : les gestes d'un sticker d'avant s'inscrivent d'abord dans ses données. */
  const addAct = (g: Gesture, at: number) => {
    if (!me || !a) return;
    const full = withActs(a, timing);
    const x = newAct(full, g, at, timing);
    onAnim(me.id, { ...full, acts: [...(full.acts ?? []), x] }, true);
    setPick({ layer: me.id, kind: 'act', id: x.id });
    keep(g.id);
  };
  /** Toucher une ligne hors de ses blocs : un bloc s'y pose, calé au quart de période. */
  const onLine = (e: RPointerEvent<HTMLElement>, add: (at: number) => void) => {
    if (e.target !== e.currentTarget) return;
    const r = e.currentTarget.getBoundingClientRect();
    const at = Math.round(((e.clientX - r.left) / r.width) * timing.count * 4) / 4;
    add(Math.max(0, Math.min(timing.count - 0.25, at)));
  };
  /**
   * Glisser un bloc : le corps le déplace, son bord droit l'étire. `put` reçoit sa nouvelle place ;
   * `base` donne la place de départ, relue après le premier geste (un sticker d'avant change alors d'identifiants).
   */
  const grab = (e: RPointerEvent<HTMLElement>, b: { at: number; len: number }, edge: boolean, step: number, put: (at: number, len: number, history: boolean) => void) => {
    e.stopPropagation();
    const track = e.currentTarget.closest('.fr-track') as HTMLElement;
    const w = track.getBoundingClientRect().width;
    const x0 = e.clientX;
    let moved = false;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const snap = (v: number) => Math.round(v / step) * step;
    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - x0) < 4) return;
      const d = ((ev.clientX - x0) / w) * timing.count;
      if (edge) put(b.at, Math.max(step, Math.min(timing.count - b.at, snap(b.len + d))), !moved);
      else put(Math.max(0, Math.min(timing.count - b.len, snap(b.at + d))), b.len, !moved);
      moved = true;
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  };
  const grabMove = (e: RPointerEvent<HTMLElement>, m: Move, edge: boolean) => {
    if (!me) return;
    setPick({ layer: me.id, kind: 'move', id: m.id });
    grab(e, m, edge, 0.25, (at, len, h) => onMotion(me.id, moves.map((x) => (x.id === m.id ? { ...m, at, len } : x)), h));
  };
  const grabAct = (e: RPointerEvent<HTMLElement>, x: Act, edge: boolean) => {
    if (!me || !a) return;
    // sticker d'avant : ses gestes s'inscrivent dans ses données au premier geste, le bloc garde sa place dans la liste
    const full = withActs(a, timing);
    const k = acts.indexOf(x);
    const id = full.acts![k]!.id;
    setPick({ layer: me.id, kind: 'act', id });
    grab(e, x, edge, 0.05, (at, len, h) => onAnim(me.id, { ...full, acts: full.acts!.map((y, j) => (j === k ? { ...y, at: Math.round(at * 100) / 100, len: Math.round(len * 100) / 100 } : y)) }, h));
    if (full !== a) onAnim(me.id, full, true);
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
  return (
    <div className="frise">
      <div className="fr-rows">
        <div className="fr-row fr-ruler">
          <span className="fr-name fr-adder">
            <button className="fr-add" onClick={() => setMenu((m) => !m)} aria-expanded={menu} title="Ajouter une animation à l'instant affiché : un mouvement de l'objet, ou un geste propre du sticker">
              ＋ Animation
            </button>
            {menu && (
              <>
                <span className="fr-menu-veil" onPointerDown={() => setMenu(false)} />
                <span className="fr-menu" role="menu">
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      addMove(Math.floor(nowAt + 1e-6));
                    }}
                  >
                    <b>Mouvement</b>
                    <i>déplacer, tourner, grandir, monter</i>
                  </button>
                  {gestures.map((g) => (
                    <button
                      key={g.id}
                      role="menuitem"
                      onClick={() => {
                        setMenu(false);
                        addAct(g, Math.round(nowAt * 4) / 4);
                      }}
                    >
                      <b>{g.name}</b>
                      <i>{g.note}</i>
                    </button>
                  ))}
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
        <div className="fr-obj on">
          {shown('move') && (
            <div className="fr-row">
              <span className="fr-name">
                <i>Mouvement</i>
              </span>
              <div className="fr-track fr-line-add" onPointerDown={(e) => onLine(e, addMove)} title="Mouvement de l'objet : toucher la ligne pour en poser un ici">
                {ticks}
                {moves.map((m) => (
                  <span
                    key={m.id}
                    className={`fr-move ${move?.id === m.id ? 'on' : ''} ${m.back ? 'back' : ''}`}
                    style={{ left: pct(m.at), width: pct(m.len) }}
                    onPointerDown={(e) => grabMove(e, m, false)}
                    title="Glisser pour déplacer, tirer le bord droit pour étirer"
                  >
                    <em>{moveName(m)}</em>
                    <span className="fr-edge" onPointerDown={(e) => grabMove(e, m, true)} />
                  </span>
                ))}
                {now}
              </div>
            </div>
          )}
          {gestures.filter((g) => shown(g.id)).map((g) => (
            <div key={g.id} className="fr-row">
              <span className="fr-name">
                <i>{g.name}</i>
              </span>
              <div className="fr-track fr-line-add" onPointerDown={(e) => onLine(e, (at) => addAct(g, at))} title={`${g.name} : toucher la ligne pour en poser un ici`}>
                {ticks}
                {acts
                  .filter((x) => x.g === g.id)
                  .map((x) => (
                    <span
                      key={x.id}
                      className={`fr-own ${g.order ? 'order' : ''} ${act?.id === x.id ? 'on' : ''}`}
                      style={{ left: pct(x.at), width: pct(Math.min(x.len, timing.count - x.at)) }}
                      onPointerDown={(e) => grabAct(e, x, false)}
                      title="Glisser pour déplacer, tirer le bord droit pour étirer"
                    >
                      <em>{g.note}</em>
                      <span className="fr-edge" onPointerDown={(e) => grabAct(e, x, true)} />
                    </span>
                  ))}
                {now}
              </div>
            </div>
          ))}
          {!shown('move') && !gestures.some((g) => shown(g.id)) && <p className="cp-note fr-empty">Aucune animation sur cet objet : ＋ Animation en pose une à l’instant affiché.</p>}
        </div>
      </div>
      {act && actGesture && a && (
        <div className="fr-own-set">
          <div className="fr-line">
            <b>{actGesture.name}</b>
            <button
              className="fr-del"
              onClick={() => {
                onAnim(me.id, { ...a, acts: acts.filter((x) => x.id !== act.id) }, true);
                setPick(null);
                keep(act.g);
              }}
            >
              Supprimer
            </button>
          </div>
          {settings?.(act)}
        </div>
      )}
      {!act && !move && a && settings && <div className="fr-own-set">{settings(null)}</div>}
      {move && (
        <div className="fr-edit">
          <div className="fr-line">
            <b>Mouvement</b>
            <label title="L'objet revient à son état de départ sur la seconde moitié">
              <input type="checkbox" checked={!!move.back} onChange={(e) => set({ back: e.target.checked || undefined })} />
              Aller-retour
            </label>
            <button
              className="fr-del"
              onClick={() => {
                onMotion(me.id, moves.filter((m) => m.id !== move.id), true);
                setPick(null);
                keep('move');
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
      )}
    </div>
  );
}
