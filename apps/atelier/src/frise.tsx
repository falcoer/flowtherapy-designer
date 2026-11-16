import { useState } from 'react';
import { ACCELS, animName, BRAKES, cycleName, cycleOf, gesturesOf, moveName, newMove, type Accel, type Brake, type Move, type Timing } from './anim';
import type { Layer } from './model';

/**
 * Frise générale : le déroulé de la vidéo, une ligne par objet. Sur chaque ligne remontent les animations
 * propres du sticker (déclarées par son générateur, répétées à chaque cycle) et les consignes de mouvement
 * de l'objet, des blocs que l'on pose, déplace et étire dans les périodes.
 */
export function Frise({
  layers,
  selected,
  timing,
  t,
  onSeek,
  onSelect,
  onMotion,
  settings,
}: {
  layers: Layer[];
  selected: string | null;
  timing: Timing;
  /** Temps courant (s). */
  t: number;
  onSeek: (t: number) => void;
  onSelect: (id: string) => void;
  /** Nouvelles consignes d'un objet ; `history` = une étape d'annulation. */
  onMotion: (id: string, motion: Move[], history: boolean) => void;
  /** Réglages du geste propre du sticker choisi (cycle, pales, départ…) : ouverts en touchant sa ligne. */
  settings?: React.ReactNode;
}) {
  const [pick, setPick] = useState<{ layer: string; move: string } | null>(null);
  // les animations se règlent objet par objet : la frise ne montre que celles de l'objet choisi
  const rows = layers.filter((l) => l.id === selected && l.kind !== 'surface');
  const total = timing.period * timing.count;
  const pct = (periods: number) => `${(periods / timing.count) * 100}%`;
  const owner = pick && pick.layer === selected ? layers.find((l) => l.id === pick.layer) : undefined;
  const move = owner?.motion?.find((m) => m.id === pick?.move);
  // geste propre du sticker choisi (par défaut tant qu'aucune consigne n'est choisie) : ses réglages s'ouvrent sous la frise
  const ownOn = !move;
  const pickOwn = (id: string) => {
    setPick(null);
    onSelect(id);
  };
  const snap = (v: number) => Math.round(v * 4) / 4;
  const set = (p: Partial<Move>, history = true) => {
    if (!owner || !move) return;
    onMotion(owner.id, (owner.motion ?? []).map((m) => (m.id === move.id ? { ...m, ...p } : m)), history);
  };
  /** Glisser un bloc : le corps le déplace, son bord droit l'étire ; calé au quart de période. */
  const grab = (e: React.PointerEvent<HTMLElement>, l: Layer, m: Move, edge: boolean) => {
    e.stopPropagation();
    const track = e.currentTarget.closest('.fr-track') as HTMLElement;
    const w = track.getBoundingClientRect().width;
    const x0 = e.clientX;
    const st = { moved: false };
    setPick({ layer: l.id, move: m.id });
    onSelect(l.id);
    e.currentTarget.setPointerCapture(e.pointerId);
    const el = e.currentTarget;
    const onMove = (ev: PointerEvent) => {
      const d = ((ev.clientX - x0) / w) * timing.count;
      if (!st.moved && Math.abs(ev.clientX - x0) < 4) return;
      const next = edge ? { len: Math.max(0.25, Math.min(timing.count - m.at, snap(m.len + d))) } : { at: Math.max(0, Math.min(timing.count - m.len, snap(m.at + d))) };
      onMotion(l.id, (l.motion ?? []).map((x) => (x.id === m.id ? { ...m, ...next } : x)), !st.moved);
      st.moved = true;
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
  return (
    <div className="frise">
      <div className="fr-rows">
        <div className="fr-row fr-ruler">
          <span className="fr-name" />
          <div
            className="fr-track"
            onPointerDown={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              onSeek(Math.max(0, Math.min(0.999, (e.clientX - r.left) / r.width)) * total);
            }}
            title="Toucher pour se placer dans la vidéo"
          >
            {Array.from({ length: timing.count }, (_, i) => (
              <span key={i} className="fr-period" style={{ left: pct(i), width: pct(1) }}>
                {timing.count <= 24 || i % 4 === 0 ? i + 1 : ''}
              </span>
            ))}
            <span className="fr-now" style={{ left: `${(t / total) * 100}%` }} />
          </div>
        </div>
        {rows.map((l) => {
          const a = l.anim && !l.cut ? l.anim : undefined;
          const c = a ? cycleOf(a, timing) : 0;
          const reps = a ? Math.min(240, Math.ceil(timing.count / c - 1e-6)) : 0;
          return (
            <div key={l.id} className={`fr-obj ${l.id === selected ? 'on' : ''}`}>
              {a &&
                gesturesOf(a).map((g, gi) => (
                  <div key={g.id} className="fr-row">
                    <button className="fr-name" onClick={() => pickOwn(l.id)} title={`${animName(a)} : animation propre du sticker, toucher pour la régler`}>
                      {gi === 0 && <b>{l.name}</b>}
                      <i>{g.name}</i>
                    </button>
                    <div className={`fr-track fr-gesture ${ownOn && l.id === selected ? 'on' : ''}`} onPointerDown={() => pickOwn(l.id)} title={`${g.name} : ${g.note ?? ''} (cycle ${cycleName(c)} période)${g.order ? ', ajoutée au mouvement de l’objet' : ''}. Toucher pour la régler`}>
                      {Array.from({ length: reps }, (_, i) => (
                        <span key={i} className={`fr-own ${g.order ? 'order' : ''}`} style={{ left: pct(i * c), width: pct(Math.min(c, timing.count - i * c)) }}>
                          {i === 0 ? g.note : ''}
                        </span>
                      ))}
                      <span className="fr-now" style={{ left: `${(t / total) * 100}%` }} />
                    </div>
                  </div>
                ))}
              <div className="fr-row">
                <button className="fr-name" onClick={() => onSelect(l.id)}>
                  {!a && <b>{l.name}</b>}
                  <i>Mouvement</i>
                </button>
                <div className="fr-track">
                  {Array.from({ length: timing.count - 1 }, (_, i) => (
                    <span key={i} className="fr-tick" style={{ left: pct(i + 1) }} />
                  ))}
                  {(l.motion ?? []).map((m) => (
                    <span
                      key={m.id}
                      className={`fr-move ${pick?.move === m.id ? 'on' : ''} ${m.back ? 'back' : ''}`}
                      style={{ left: pct(m.at), width: pct(m.len) }}
                      onPointerDown={(e) => grab(e, l, m, false)}
                      title="Consigne de mouvement : glisser pour la déplacer, tirer son bord droit pour l'étirer"
                    >
                      <em>{moveName(m)}</em>
                      <span className="fr-edge" onPointerDown={(e) => grab(e, l, m, true)} />
                    </span>
                  ))}
                  <span className="fr-now" style={{ left: `${(t / total) * 100}%` }} />
                </div>
                <button
                  className="fr-add"
                  onClick={() => {
                    const m = newMove(timing, t);
                    onMotion(l.id, [...(l.motion ?? []), m], true);
                    setPick({ layer: l.id, move: m.id });
                    onSelect(l.id);
                  }}
                  title="Ajouter une consigne de mouvement à l'instant affiché"
                  aria-label={`Ajouter une consigne à ${l.name}`}
                >
                  ＋
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {settings && ownOn && (
        <div className="fr-own-set">
          <b>{layers.find((l) => l.id === selected)?.name} · geste propre</b>
          {settings}
        </div>
      )}
      {owner && move && (
        <div className="fr-edit">
          <div className="fr-line">
            <b>{owner.name}</b>
            {num('Début', move.at + 1, (v) => {
              const at = Math.min(v - 1, timing.count - 0.25);
              set({ at, len: Math.min(move.len, timing.count - at) });
            }, { min: 1, max: timing.count, step: 0.25, title: 'Période où la consigne commence (1 = début de la vidéo)' })}
            {num('Durée', move.len, (v) => set({ len: Math.min(v, Math.max(0.25, timing.count - move.at)) }), { min: 0.25, max: timing.count, step: 0.25, unit: 'pér.', title: 'Durée de la consigne, en périodes' })}
            <label title="L'objet revient à son état de départ sur la seconde moitié">
              <input type="checkbox" checked={!!move.back} onChange={(e) => set({ back: e.target.checked || undefined })} />
              Aller-retour
            </label>
            <button
              className="fr-del"
              onClick={() => {
                onMotion(owner.id, (owner.motion ?? []).filter((m) => m.id !== move.id), true);
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
      )}
    </div>
  );
}
