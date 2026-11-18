import { useRef, useState } from 'react';
import type { BoxMap } from './gradient-ui';
import { RingBand, ringMid, RING_BOX } from './ring-icon';
import type { Layer } from './model';
import { cutOf } from './scene';
import { baseOf, keyFor, leftViews, loadImage, nearestView, RING, ringViews, setView, showView, turnTo, turned, viewsOf, VIEWS, VIEW_NAMES, type ViewKind } from './views';

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

type P = { x: number; y: number };

/**
 * L'anneau en perspective posé sous une illustration orientée : un cercle au sol vu de biais, avec une marque par vue
 * (face devant, profils sur les côtés, dos au fond). On glisse la poignée autour, ou on touche une marque : l'objet
 * se tourne vers la vue la plus proche. Les vues de gauche qui manquent se tirent en miroir de celles de droite.
 */
export function ViewRing({ l, map, onChange }: { l: Layer; map: BoxMap; onChange: (p: Partial<Layer>, history: boolean) => void }) {
  const [drag, setDrag] = useState<number | null>(null);
  const busy = useRef(false);
  const step = useRef(0);
  const keys = ringViews(l);
  if (keys.length < 2) return null;
  // le sol : centre au pied de l'objet, grand axe sur sa largeur, petit axe vers l'avant (le bas de l'objet), aplati
  const c = map.toScreen(0.5, 1);
  const r = map.toScreen(1.05, 1);
  const a = { x: r.x - c.x, y: r.y - c.y };
  const len = Math.max(24, Math.hypot(a.x, a.y));
  const ax = { x: (a.x / Math.max(1e-6, Math.hypot(a.x, a.y))) * len, y: (a.y / Math.max(1e-6, Math.hypot(a.x, a.y))) * len };
  const down = map.toScreen(0.5, 1.2);
  // l'avant est du côté du bas de l'objet, même tourné ou retourné
  let n = { x: -ax.y, y: ax.x };
  if (n.x * (down.x - c.x) + n.y * (down.y - c.y) < 0) n = { x: -n.x, y: -n.y };
  const b = { x: n.x * 0.3, y: n.y * 0.3 };
  const at = (deg: number): P => {
    const t = (deg * Math.PI) / 180;
    return { x: c.x + ax.x * Math.sin(t) + b.x * Math.cos(t), y: c.y + ax.y * Math.sin(t) + b.y * Math.cos(t) };
  };
  // angle d'un point de l'écran : on résout p − c = ax·sin + b·cos
  const angleOf = (x: number, y: number) => {
    const dx = x - c.x;
    const dy = y - c.y;
    const det = ax.x * b.y - ax.y * b.x || 1e-6;
    const s = (dx * b.y - dy * b.x) / det;
    const co = (ax.x * dy - ax.y * dx) / det;
    return ((Math.atan2(s, co) * 180) / Math.PI + 360) % 360;
  };
  const cur = l.view && RING[l.view] !== undefined ? l.view : 'face';
  const go = async (k: string | null) => {
    if (!k || k === l.view || busy.current) return;
    busy.current = true;
    try {
      const p = await turnTo(l, k);
      // un seul pas d'annulation pour tout un tour de poignée
      if (Object.keys(p).length) onChange(p, step.current++ === 0);
    } finally {
      busy.current = false;
    }
  };
  // l'anneau-icône (repère 100 × 30) posé sur l'ellipse du sol : x → grand axe, y → petit axe
  const sx = { x: ax.x / RING_BOX.rx, y: ax.y / RING_BOX.rx };
  const sy = { x: b.x / RING_BOX.ry, y: b.y / RING_BOX.ry };
  const m = `matrix(${sx.x} ${sx.y} ${sy.x} ${sy.y} ${c.x - sx.x * RING_BOX.cx - sy.x * RING_BOX.cy} ${c.y - sx.y * RING_BOX.cx - sy.y * RING_BOX.cy})`;
  // une marque au milieu de la bande de l'icône
  const mark = (deg: number) => {
    const q = ringMid(deg);
    return { x: c.x + sx.x * (q.x - RING_BOX.cx) + sy.x * (q.y - RING_BOX.cy), y: c.y + sx.y * (q.x - RING_BOX.cx) + sy.y * (q.y - RING_BOX.cy) };
  };
  const h = mark(drag ?? RING[cur]!);
  return (
    <div className="grad-overlay view-ring">
      <svg>
        <g transform={m}>
          <RingBand half="back" />
          <RingBand half="front" />
        </g>
      </svg>
      {Object.keys(RING).map((k) => {
        const p = mark(RING[k]!);
        const ok = keys.includes(k);
        return (
          <button
            key={k}
            className={`vr-mark ${k === cur ? 'on' : ''} ${ok ? '' : 'off'} ${RING[k]! > 90 && RING[k]! < 270 ? 'far' : ''}`}
            style={{ left: p.x, top: p.y }}
            disabled={!ok}
            title={ok ? `Montrer la vue ${VIEW_NAMES[k]!.toLowerCase()}` : `Pas de vue ${VIEW_NAMES[k]!.toLowerCase()}`}
            aria-label={VIEW_NAMES[k]}
            onClick={() => {
              step.current = 0;
              void go(k);
            }}
          />
        );
      })}
            <div
        className="vr-handle"
        style={{ left: h.x, top: h.y }}
        title="Glisser autour de l’anneau pour tourner l’objet"
        onPointerDown={(e) => {
          e.stopPropagation();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          step.current = 0;
          setDrag(RING[cur]!);
        }}
        onPointerMove={(e) => {
          if (drag === null) return;
          const d = angleOf(e.clientX, e.clientY);
          setDrag(d);
          void go(nearestView(keys, d));
        }}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
      >
        <span style={{ transform: `rotate(${Math.atan2(h.y - c.y, h.x - c.x)}rad)` }} />
      </div>
    </div>
  );
}
