import { useState } from 'react';
import { Modal } from './compositions-ui';
import { formatOf, type Target } from './model';
import { thumbUrl, type ActivityProfile, type AtelierMeta, type Campaign } from './server';
import { channelsOf, formatsFor, targetKey, targetLabel } from './targets';
import { FmtGlyph, MediaIcon } from './targets-ui';

/** D'où part la nouvelle publication. */
export type PubSource = { pub: number } | { template: AtelierMeta } | 'blank';

const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * Nouvelle publication d'une composition : d'abord son format (les lignes du plan de la campagne
 * pas encore couvertes, sinon un réseau puis un de ses formats), puis ce dont elle part (une
 * publication voisine, un modèle de la campagne, une page vierge). Elle a ensuite ses propres objets.
 */
export function NewPublicationDialog(p: {
  targets: Target[];
  /** aperçu de chaque publication de la composition */
  previews?: string[];
  meta?: AtelierMeta;
  active: number;
  campaign?: Campaign;
  templates: AtelierMeta[];
  activity: ActivityProfile | null;
  onAdd: (t: Target, from: PubSource) => void;
  onClose: () => void;
}) {
  const channels = channelsOf(p.activity);
  const have = new Set(p.targets.map(targetKey));
  const seen = new Set<string>();
  // le plan dit quoi produire : ses lignes que la composition ne couvre pas encore
  const planned = [...(p.campaign?.plan ?? [])]
    .filter((it) => !it.published)
    .sort((a, b) => (a.date ?? '9').localeCompare(b.date ?? '9'))
    .map((it) => ({ it, t: { ...(it.channel ? { channel: it.channel } : {}), format: it.format, ...(it.palette ? { palette: it.palette } : {}) } as Target }))
    .filter(({ t }) => !have.has(targetKey(t)) && !seen.has(targetKey(t)) && !!seen.add(targetKey(t)));
  const [pick, setPick] = useState<Target | null>(planned[0]?.t ?? null);
  const [other, setOther] = useState(!planned.length);
  const [chan, setChan] = useState<string>(pick?.channel ?? channels[0]?.id ?? '');
  const [from, setFrom] = useState<PubSource>(p.targets.length ? { pub: p.active } : 'blank');
  const fromKey = (s: PubSource) => (s === 'blank' ? 'blank' : 'pub' in s ? `pub${s.pub}` : `tpl${s.template.id}`);
  const ch = channels.find((c) => c.id === chan);
  const label = (t: Target) => targetLabel(t, p.activity);
  const isPick = (t: Target) => !!pick && targetKey(pick) === targetKey(t);
  return (
    <Modal title="Nouvelle publication" onClose={p.onClose} wide>
      <div className="cp-sub">Son format</div>
      {planned.length > 0 && (
        <div className="np-plan">
          {planned.map(({ it, t }) => (
            <button
              key={it.id}
              className={`row np-row ${isPick(t) && !other ? 'on' : ''}`}
              onClick={() => {
                setPick(t);
                setOther(false);
              }}
              aria-pressed={isPick(t) && !other}
            >
              <span className="np-ico">
                <MediaIcon ch={channels.find((c) => c.id === t.channel)} size={18} />
              </span>
              <span>{label(t)}</span>
              <small>{[it.label, it.date ? day(it.date) : 'à dater'].filter(Boolean).join(' · ')}</small>
            </button>
          ))}
          <button
            className={`row np-row ${other ? 'on' : ''}`}
            onClick={() => {
              setOther(true);
              setPick(null);
            }}
            aria-pressed={other}
          >
            <span className="np-ico">＋</span>
            <span>Un autre format</span>
            <small>hors du plan</small>
          </button>
        </div>
      )}
      {!planned.length && <p className="fx-hint">{p.campaign ? 'Le plan de la campagne est déjà couvert : choisis un réseau, puis un format.' : 'Choisis un réseau, puis un format.'}</p>}
      {other && (
        <div className="np-other">
          <div className="np-chans" role="listbox" aria-label="Réseau">
            {[...channels, undefined].map((c) => (
              <button
                key={c?.id ?? ''}
                className={`np-chan ${(c?.id ?? '') === chan ? 'on' : ''}`}
                onClick={() => {
                  setChan(c?.id ?? '');
                  setPick(null);
                }}
                aria-selected={(c?.id ?? '') === chan}
              >
                <MediaIcon ch={c} size={18} />
                <span>{c?.name ?? 'Libre'}</span>
              </button>
            ))}
          </div>
          <div className="np-formats">
            {formatsFor(ch).map((f) => {
              const t: Target = { ...(chan ? { channel: chan } : {}), format: f.id };
              const dup = have.has(targetKey(t));
              return (
                <button key={f.id} className={`np-format ${isPick(t) ? 'on' : ''}`} onClick={() => setPick(t)} aria-pressed={isPick(t)} title={dup ? 'Déjà dans la composition : une seconde version' : f.title}>
                  <FmtGlyph id={f.id} />
                  <span>{f.title}</span>
                  {dup && <small>déjà là</small>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="cp-sub">Elle part de</div>
      <div className="cp-tpl-row np-from">
        {p.targets.map((t, i) => {
          const s: PubSource = { pub: i };
          const f = formatOf(t.format);
          const src = p.previews?.[i] ?? (p.meta ? thumbUrl(p.meta, i) : undefined);
          return (
            <button key={i} className={`cp-tpl ${fromKey(from) === fromKey(s) ? 'on' : ''}`} onClick={() => setFrom(s)} aria-pressed={fromKey(from) === fromKey(s)} title={`Copier ${label(t)}, recalée sur le nouveau format`}>
              <span className="np-thumb" style={{ aspectRatio: `${Math.min(1.8, Math.max(0.5, f.width / f.height))}` }}>
                {src ? <img src={src} alt="" loading="lazy" draggable={false} /> : null}
              </span>
              <span>{label(t)}</span>
            </button>
          );
        })}
        {p.templates
          .filter((m) => m.id !== p.meta?.id)
          .map((m) => {
            const s: PubSource = { template: m };
            return (
              <button key={m.id} className={`cp-tpl ${fromKey(from) === fromKey(s) ? 'on' : ''}`} onClick={() => setFrom(s)} aria-pressed={fromKey(from) === fromKey(s)} title={`Partir du modèle « ${m.title} »`}>
                <span className="np-thumb">
                  <img src={thumbUrl(m)} alt="" loading="lazy" draggable={false} />
                </span>
                <span>★ {m.title}</span>
              </button>
            );
          })}
        <button className={`cp-tpl ${from === 'blank' ? 'on' : ''}`} onClick={() => setFrom('blank')} aria-pressed={from === 'blank'}>
          <span className="np-thumb np-blank" />
          <span>Page vierge</span>
        </button>
      </div>
      <div className="sp-row">
        <p className="fx-hint sp-grow">Elle aura ses propres objets : la retoucher ne change pas ses voisines.</p>
        <button className="pf-btn primary" disabled={!pick} onClick={() => pick && p.onAdd(pick, from)}>
          Ajouter {pick ? label(pick) : 'la publication'}
        </button>
      </div>
    </Modal>
  );
}
