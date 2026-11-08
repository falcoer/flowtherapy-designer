import { useState } from 'react';
import { VoteButton } from './campaigns-ui';
import { REVIEW_LABELS, thumbUrl, type AtelierMeta, type Campaign, type Operation } from './server';

const who = (e?: string) => (e ? e.split('@')[0] : '');
const when = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="cp-modal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`cp-modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title} onPointerDown={(e) => e.stopPropagation()}>
        <div className="pf-head">
          <span className="b-title">{title}</span>
          <button className="lamp-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Nouvelle composition : page vierge, une occasion (ses cibles), un modèle de la campagne, ou la copie d'une autre composition. */
export function NewCompositionDialog(p: {
  campaign?: Campaign;
  operations: Operation[];
  templates: AtelierMeta[];
  others: AtelierMeta[];
  campaigns: Campaign[];
  targetsLabel: (op: Operation) => string;
  onBlank: () => void;
  onOperation: (op: Operation) => void;
  onCopy: (m: AtelierMeta) => void;
  onClose: () => void;
}) {
  const [importing, setImporting] = useState(false);
  const [q, setQ] = useState('');
  const others = p.others.filter((m) => !q || `${m.title} ${p.campaigns.find((c) => c.id === m.campaign)?.name ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal title={p.campaign ? `Nouvelle composition · ${p.campaign.name}` : 'Nouvelle composition'} onClose={p.onClose}>
      {importing ? (
        <>
          <p className="pf-note">Une copie est créée{p.campaign ? ` dans « ${p.campaign.name} »` : ''} ; l’original reste en place.</p>
          <input className="pf-input" type="search" placeholder="Chercher…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="cp-picker">
            {others.map((m) => (
              <button key={m.id} className="proj-open" onClick={() => p.onCopy(m)}>
                <img src={thumbUrl(m)} alt="" loading="lazy" />
                <span className="proj-name">{m.title}</span>
                <small>{p.campaigns.find((c) => c.id === m.campaign)?.name ?? 'Hors campagne'}</small>
              </button>
            ))}
            {!others.length && <p className="fx-hint">Rien à importer.</p>}
          </div>
          <button className="pf-btn" onClick={() => setImporting(false)}>
            ← Retour
          </button>
        </>
      ) : (
        <>
          <button className="row" onClick={p.onBlank}>
            <span>Page vierge</span>
            <small>même format et palette</small>
          </button>
          {p.operations.map((op) => (
            <button key={op.id} className="row" onClick={() => p.onOperation(op)}>
              <span>{op.name}</span>
              <small>{p.targetsLabel(op)}</small>
            </button>
          ))}
          {p.templates.length > 0 && (
            <>
              <div className="cp-sub">Partir d’un modèle de la campagne</div>
              <div className="cp-tpl-row">
                {p.templates.map((m) => (
                  <button key={m.id} className="cp-tpl" onClick={() => p.onCopy(m)} title={`Partir de « ${m.title} »`}>
                    <img src={thumbUrl(m)} alt="" loading="lazy" />
                    <span>{m.title}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {p.others.length > 0 && (
            <button className="row" onClick={() => setImporting(true)}>
              <span>Copier une autre composition</span>
              <small>d’une autre campagne</small>
            </button>
          )}
        </>
      )}
    </Modal>
  );
}

/** Les compositions d'une campagne (ou de toute l'activité) : aperçu, auteur, date, note ; charger ou supprimer. */
export function LoadDialog(p: {
  campaign?: Campaign;
  campaigns: Campaign[];
  projects: AtelierMeta[];
  current?: string;
  canDelete: boolean;
  canVote: boolean;
  onOpen: (m: AtelierMeta) => void;
  onVote: (m: AtelierMeta) => void;
  onDelete: (m: AtelierMeta) => void;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<'campaign' | 'all'>(p.campaign ? 'campaign' : 'all');
  const [sort, setSort] = useState<'votes' | 'date'>(p.campaign ? 'votes' : 'date');
  const [q, setQ] = useState('');
  const [armed, setArmed] = useState<string | null>(null);
  const list = p.projects
    .filter((m) => scope === 'all' || m.campaign === p.campaign?.id)
    .filter((m) => !q || `${m.title} ${m.by ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (sort === 'votes' ? (b.votes?.length ?? 0) - (a.votes?.length ?? 0) : 0) || b.updated.localeCompare(a.updated));
  return (
    <Modal title="Compositions" onClose={p.onClose} wide>
      <div className="ld-tools">
        {p.campaign && (
          <div className="seg ld-scope">
            <button className={scope === 'campaign' ? 'on' : ''} onClick={() => setScope('campaign')}>
              {p.campaign.name}
            </button>
            <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>
              Toutes
            </button>
          </div>
        )}
        <input className="pf-input" type="search" placeholder="Chercher un titre, un auteur…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="pf-input ld-sort" value={sort} onChange={(e) => setSort(e.target.value as 'votes' | 'date')} aria-label="Trier">
          <option value="votes">Les mieux notées</option>
          <option value="date">Les plus récentes</option>
        </select>
      </div>
      <div className="ld-list">
        {list.map((m) => (
          <div key={m.id} className={`ld-row ${m.id === p.current ? 'on' : ''}`}>
            <button className="ld-open" onClick={() => p.onOpen(m)} title={`Charger « ${m.title} »`}>
              <img src={thumbUrl(m)} alt="" loading="lazy" />
              <span className="ld-txt">
                <b>{m.title}</b>
                <small>
                  {[who(m.by), when(m.updated), scope === 'all' && (p.campaigns.find((c) => c.id === m.campaign)?.name ?? 'hors campagne')].filter(Boolean).join(' · ')}
                </small>
                {m.review && <span className={`proj-badge st-${m.review.status}`}>{REVIEW_LABELS[m.review.status]}</span>}
              </span>
            </button>
            {p.canVote && <VoteButton votes={m.votes ?? []} voted={!!m.voted} onVote={() => p.onVote(m)} />}
            {p.canDelete && (
              <button
                className={`ld-del ${armed === m.id ? 'hot' : ''}`}
                title={armed === m.id ? 'Toucher encore pour supprimer' : 'Supprimer'}
                onClick={() => {
                  if (armed !== m.id) return setArmed(m.id);
                  setArmed(null);
                  p.onDelete(m);
                }}
              >
                {armed === m.id ? 'Supprimer ?' : '×'}
              </button>
            )}
          </div>
        ))}
        {!list.length && <p className="fx-hint">{scope === 'campaign' ? 'Aucune composition dans cette campagne pour l’instant.' : 'Aucune composition.'}</p>}
      </div>
    </Modal>
  );
}
