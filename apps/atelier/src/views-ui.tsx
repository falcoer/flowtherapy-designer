import { useState } from 'react';
import type { Layer } from './model';
import { cutOf } from './scene';
import { baseOf, keyFor, leftViews, loadImage, setView, showView, turned, viewsOf, VIEWS, VIEW_NAMES, type ViewKind } from './views';

/**
 * Les vues d'un personnage en plusieurs angles, en rangée : toucher une vue la montre, ＋ ajoute l'image d'une vue
 * qui manque (image par image). Une photo habillée d'un squelette peut ainsi devenir un personnage à plusieurs vues.
 */
export function ViewRow({ l, patch, onToast }: { l: Layer; patch: (p: Partial<Layer>, history?: boolean) => void; onToast?: (t: string) => void }) {
  const all = viewsOf(l);
  // un objet sans vues : un seul bouton, la rangée s'ouvre à la demande
  const [open, setOpen] = useState(false);
  if (!all.length && !open)
    return (
      <button className="view-open" onClick={() => setOpen(true)} title="Donner à l’objet plusieurs angles de vue : face, trois-quarts, profil, dos">
        ＋ Angles de vue
      </button>
    );
  const shape = l.kind !== 'photo';
  // une forme : la nouvelle vue part du contour actuel et se montre tout de suite, pour la redécouper ou la modeler
  const addShape = (v: ViewKind) => {
    const cut = l.cut ?? cutOf(l);
    const next = { ...l, ...setView(l, v, { src: '', ratio: l.w / l.h, cut }, cut) } as Layer;
    patch({ ...setView(l, v, { src: '', ratio: l.w / l.h, cut }, cut), ...showView(next, v) });
    onToast?.(`Vue ${VIEW_NAMES[v].toLowerCase()} : elle part du contour actuel, redécoupe-la ou modèle-la`);
  };
  const add = async (v: ViewKind, f: File) => {
    try {
      patch(setView(l, v, await loadImage(f, 1600)));
      onToast?.(`Vue ${VIEW_NAMES[v].toLowerCase()} ajoutée`);
    } catch {
      onToast?.('Cette image ne peut pas être lue ici : essaie en PNG ou JPEG');
    }
  };
  // le sens où regarde l'objet : les vues tournées vers la gauche manquantes se tirent en miroir de celles de droite
  const left = l.facing === 'gauche';
  const face = async () => {
    const to = left ? undefined : 'gauche';
    const extra = to ? await leftViews(all) : [];
    const views = [...all, ...extra].map((x) => (x.view === l.view ? { ...x, src: '' } : x));
    const next = { ...l, views, facing: to } as Layer;
    const want = keyFor(baseOf(l.view ?? 'face'), to);
    patch({ views, facing: to, ...(views.some((x) => x.view === want) ? showView(next, want) : {}) });
    onToast?.(to ? 'Il regarde vers la gauche : profil et trois-quarts en miroir, s’ils n’ont pas leur propre vue' : 'Il regarde vers la droite');
  };
  const canTurn = all.some((x) => turned(x.view));
  return (
    <div className="view-row" role="group" aria-label="Vues du personnage">
      {canTurn && (
        <button className="view-chip" onClick={() => void face()} title="Sens où il regarde, de profil et de trois-quarts : la marche de côté va de ce côté">
          <span className="view-thumb">{left ? '←' : '→'}</span>
          {left ? 'À gauche' : 'À droite'}
        </button>
      )}
      {VIEWS.map((v) => {
        // une vue tournée se montre dans le sens où regarde l'objet (celle de gauche si elle existe)
        const has = all.find((x) => x.view === keyFor(v, l.facing)) ?? all.find((x) => x.view === v);
        const on = all.length ? baseOf(l.view ?? 'face') === v : v === 'face';
        if (has)
          return (
            <button key={v} className={`view-chip ${on ? 'on' : ''}`} onClick={() => patch(showView(l, has.view))} title={`Montrer la vue ${VIEW_NAMES[v].toLowerCase()}`}>
              {has.src ? <span className="view-thumb" style={{ backgroundImage: `url("${has.src}")` }} /> : <CutThumb d={has.cut ?? cutOf(l)} />}
              {VIEW_NAMES[v]}
            </button>
          );
        if (on)
          return (
            <span key={v} className="view-chip on">
              {l.src ? <span className="view-thumb" style={{ backgroundImage: `url("${l.src}")` }} /> : <CutThumb d={l.cut ?? cutOf(l)} />}
              {VIEW_NAMES[v]}
            </span>
          );
        if (shape)
          return (
            <button key={v} className="view-chip add" onClick={() => addShape(v)} title={`Ajouter la vue ${VIEW_NAMES[v].toLowerCase()}, à partir du contour actuel`}>
              <span className="view-thumb">＋</span>
              {VIEW_NAMES[v]}
            </button>
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

/** Vignette d'une vue de forme : son contour. */
function CutThumb({ d }: { d: string }) {
  return (
    <span className="view-thumb">
      <svg viewBox="-0.05 -0.05 1.1 1.1" width="44" height="54" preserveAspectRatio="xMidYMid meet" aria-hidden>
        <path d={d} fill="currentColor" fillRule="evenodd" />
      </svg>
    </span>
  );
}
