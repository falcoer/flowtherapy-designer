import { PaletteEditor } from './colorpicker';
import { cssShaped } from './gradient';
import { GradStyleRow } from './gradient-ui';
import { guideColor, shapeOf, type Blend, type GradStyle, type Guide } from './model';

/** Pastille d'une couleur ou d'un dégradé, dessinée comme sur la page. */
export const swatch = (g: Guide | undefined) => (g?.type === 'gradient' ? cssShaped(g.stops, g.blend, shapeOf(g)) : guideColor(g));

/** Boîte de dialogue d'une couleur : son nom, son éditeur (plan, teintes, harmonies, transition, forme du dégradé). */
export function ColorDialog({ guide, onChange, onClose, onRemove, kind, className }: { guide: Guide; onChange: (g: Guide, commit: boolean) => void; onClose: () => void; onRemove?: () => void; kind?: string; className?: string }) {
  const stops = guide.type === 'gradient' ? guide.stops : [guide.color];
  const keep = { ...(guide.from ? { from: guide.from } : {}) };
  return (
    <div className={`color-dialog ${className ?? ''}`} role="dialog" aria-label={`Couleur ${guide.name}`}>
      <button className="lamp-close cd-close" onClick={onClose} aria-label="Fermer">
        ×
      </button>
      <PaletteEditor
        stops={stops}
        blend={guide.type === 'gradient' ? (guide.blend ?? 'smooth') : 'smooth'}
        head={
          <div className="cd-head">
            <span className="cd-sw" style={{ background: swatch(guide) }} />
            <input
              className="gname-input"
              value={guide.name}
              aria-label="Nom de la couleur"
              onChange={(e) => onChange({ ...guide, name: e.target.value }, false)}
              onBlur={() => onChange(guide, true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                e.stopPropagation();
              }}
            />
            {kind && <small className="cd-kind">{kind}</small>}
            {onRemove && (
              <button className="cd-remove" onClick={onRemove} title="Retirer cette couleur">
                Retirer
              </button>
            )}
          </div>
        }
        extra={guide.type === 'gradient' ? <GradStyleRow style={guide.shape} onChange={(shape: GradStyle) => onChange({ ...guide, shape }, true)} /> : undefined}
        onBlend={(blend: Blend) => guide.type === 'gradient' && onChange({ ...guide, blend }, true)}
        onChange={(next, commit) =>
          onChange(
            next.length > 1
              ? { name: guide.name, type: 'gradient', stops: next, ...(guide.type === 'gradient' && guide.blend ? { blend: guide.blend } : {}), ...(guide.type === 'gradient' && guide.shape ? { shape: guide.shape } : {}), ...keep }
              : { name: guide.name, type: 'color', color: next[0]!, ...keep },
            commit,
          )
        }
      />
    </div>
  );
}
