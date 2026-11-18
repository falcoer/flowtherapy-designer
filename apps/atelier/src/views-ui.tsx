import type { Layer } from './model';
import { loadImage, setView, showView, viewsOf, VIEWS, VIEW_NAMES, type ViewKind } from './views';

/**
 * Les vues d'un personnage en plusieurs angles, en rangée : toucher une vue la montre, ＋ ajoute l'image d'une vue
 * qui manque (image par image). Une photo habillée d'un squelette peut ainsi devenir un personnage à plusieurs vues.
 */
export function ViewRow({ l, patch, onToast }: { l: Layer; patch: (p: Partial<Layer>, history?: boolean) => void; onToast?: (t: string) => void }) {
  const all = viewsOf(l);
  const add = async (v: ViewKind, f: File) => {
    try {
      patch(setView(l, v, await loadImage(f, 1600)));
      onToast?.(`Vue ${VIEW_NAMES[v].toLowerCase()} ajoutée`);
    } catch {
      onToast?.('Cette image ne peut pas être lue ici : essaie en PNG ou JPEG');
    }
  };
  return (
    <div className="view-row" role="group" aria-label="Vues du personnage">
      {VIEWS.map((v) => {
        const has = all.find((x) => x.view === v);
        const on = (l.view ?? (all.length ? undefined : 'face')) === v || (!all.length && v === 'face');
        if (has)
          return (
            <button key={v} className={`view-chip ${on ? 'on' : ''}`} onClick={() => patch(showView(l, v))} title={`Montrer la vue ${VIEW_NAMES[v].toLowerCase()}`}>
              <span className="view-thumb" style={{ backgroundImage: `url("${has.src}")` }} />
              {VIEW_NAMES[v]}
            </button>
          );
        if (on)
          return (
            <span key={v} className="view-chip on">
              <span className="view-thumb" style={{ backgroundImage: `url("${l.src}")` }} />
              {VIEW_NAMES[v]}
            </span>
          );
        return (
          <label key={v} className="view-chip add" title={`Ajouter l’image de la vue ${VIEW_NAMES[v].toLowerCase()}`}>
            <span className="view-thumb">＋</span>
            {VIEW_NAMES[v]}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void add(v, f);
              }}
            />
          </label>
        );
      })}
    </div>
  );
}
