import { useState } from 'react';
import { thumbUrl, type AtelierMeta, type Campaign, type Operation } from './server';


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

/** Nouvelle composition : dans une campagne, ses rendus (l'occasion est celle de la campagne) ou un de ses modèles ;
 *  hors campagne, une occasion au choix ; toujours une page vierge ou la copie d'une autre composition. */
export function NewCompositionDialog(p: {
  campaign?: Campaign;
  /** les rendus de la campagne suivie, prêts à composer */
  campaignOp?: Operation;
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
          {p.campaignOp && (
            <button className="row primary" onClick={() => p.onOperation(p.campaignOp!)}>
              <span>Les rendus de la campagne</span>
              <small>{p.targetsLabel(p.campaignOp)}</small>
            </button>
          )}
          <button className="row" onClick={p.onBlank}>
            <span>Page vierge</span>
            <small>même format et palette</small>
          </button>
          {!p.campaign && p.operations.map((op) => (
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
