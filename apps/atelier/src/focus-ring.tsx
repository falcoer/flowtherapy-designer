import { useRef, type ReactNode } from 'react';
import type { Doc, Layer, SceneLook } from './model';

/**
 * Scène › Objectif, façon appareil photo : une bague de mise au point (les objets défilent
 * sous le repère, à leur hauteur ; ceux hors de la zone nette se floutent comme sur la page)
 * et une bague d'ouverture crantée (f/16 … f/1.4) avec son diaphragme.
 */

export type Camera = NonNullable<SceneLook['camera']>;

const heightOf = (l: Layer) => (l.kind === 'surface' ? 0 : l.height - (l.inner ?? 0));
/** Hauteur mise au point : celle de l'objet visé, sinon la hauteur libre de la bague, sinon la feuille. */
export const focusHeight = (doc: Doc, cam: Camera) => {
  const t = cam.focus ? doc.layers.find((x) => x.id === cam.focus) : undefined;
  return t ? heightOf(t) : (cam.at ?? 0);
};
/** Même loi que dofRadius (scene.ts), en part du petit côté de la page. */
const blurShare = (aperture: number, dh: number) => aperture * Math.abs(dh) * 0.035;
/** En dessous de ce flou (part du petit côté), l'œil voit net : bord de la zone nette. */
const SHARP = 0.0015;

const F_STOPS = [16, 11, 8, 5.6, 4, 2.8, 2, 1.4];
const apOf = (f: number) => Math.log(16 / f) / Math.log(16 / 1.4);
export const fOf = (a: number) => 16 * Math.pow(1.4 / 16, a);

export function FocusRing({ doc, cam, selected, onCam, onSelect, thumb }: { doc: Doc; cam: Camera; selected?: string; onCam: (p: Partial<Camera>) => void; onSelect: (id: string) => void; thumb: (l: Layer) => ReactNode }) {
  const objs = doc.layers.filter((x) => x.kind !== 'surface' && x.visible);
  const hs = [0, ...objs.map(heightOf)];
  const lo = Math.min(...hs);
  const hi = Math.max(...hs);
  // l'échelle couvre tous les objets, avec un peu d'air ; au moins une petite course pour tourner la bague
  const span = Math.max(0.16, (hi - lo) * 1.25);
  const fh = focusHeight(doc, cam);
  /** Position (en % de la bague) d'une hauteur, le repère de mise au point étant au milieu. */
  const xOf = (h: number) => 50 + ((h - fh) / span) * 60;
  const sharpHalf = cam.aperture < 0.01 ? Infinity : SHARP / (cam.aperture * 0.035);
  const bandW = Math.min(100, ((2 * sharpHalf) / span) * 60);
  // objets à la même hauteur : une seule pile (la feuille sous celle de hauteur 0)
  const marks: Array<{ h: number; ls: Layer[]; page: boolean }> = [];
  for (const l of [...objs].sort((a, b) => heightOf(a) - heightOf(b))) {
    const h = heightOf(l);
    const m = marks.find((x) => Math.abs(x.h - h) < 0.0005);
    if (m) m.ls.push(l);
    else marks.push({ h, ls: [l], page: false });
  }
  const zero = marks.find((m) => Math.abs(m.h) < 0.0005);
  if (zero) zero.page = true;
  else marks.push({ h: 0, ls: [], page: true });
  /** L'objet d'une pile qui prend la mise au point : celui déjà net, sinon le sélectionné, sinon le premier. */
  const pick = (m: (typeof marks)[number]) => m.ls.find((x) => x.id === cam.focus) ?? m.ls.find((x) => x.id === selected) ?? (m.page ? undefined : m.ls[0]);
  const drag = useRef<{ x: number; w: number; h0: number; moved: boolean } | null>(null);
  const ring = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 3) d.moved = true;
    if (!d.moved) return;
    // la bague tourne avec le doigt : l'échelle glisse sous le repère
    let h = d.h0 - (dx / (d.w * 0.6)) * span;
    // butées : la bague s’arrête aux objets le plus bas et le plus haut
    h = Math.max(lo, Math.min(hi, h));
    // aimant : un objet (ou la feuille) proche du repère prend la mise au point
    const near = marks.reduce<(typeof marks)[number] | null>((b, m) => (Math.abs(m.h - h) < (6 / (d.w * 0.6)) * span && (!b || Math.abs(m.h - h) < Math.abs(b.h - h)) ? m : b), null);
    if (near) {
      const l = pick(near);
      onCam({ focus: l?.id, at: l ? undefined : 0, follow: false });
    }
    else onCam({ focus: undefined, at: Math.round(h * 1000) / 1000, follow: false });
  };
  const target = cam.focus ? objs.find((x) => x.id === cam.focus) : undefined;
  const label = target ? `« ${target.name} »` : Math.abs(fh) < 0.001 ? 'la feuille' : fh > 0 ? 'au-dessus de la feuille' : 'sous la feuille';
  const sel = selected ? objs.find((x) => x.id === selected) : undefined;
  return (
    <div className="fr">
      <div className="fr-head">
        <span className="fr-now">
          Net sur <b>{label}</b>
        </span>
        <button
          className={`chip fr-af ${cam.follow ? 'on' : ''}`}
          aria-pressed={!!cam.follow}
          title="Mise au point automatique : l'objet sélectionné sur la page devient l'objet net"
          onClick={() => onCam(cam.follow ? { follow: false } : { follow: true, ...(sel ? { focus: sel.id, at: undefined } : {}) })}
        >
          <svg viewBox="0 0 20 20" aria-hidden>
            <path d="M2 6V2h4M14 2h4v4M18 14v4h-4M6 18H2v-4" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="10" cy="10" r="2.4" fill="currentColor" />
          </svg>
          AF sélection
        </button>
      </div>
      <div
        className="fr-ring"
        role="slider"
        aria-label="Bague de mise au point"
        aria-valuetext={label}
        aria-valuenow={Math.round(fh * 1000) / 1000}
        style={{ backgroundPositionX: `${-(fh / span) * 400}px` }}
        tabIndex={0}
        onKeyDown={(e) => {
          // clavier : flèches = pile voisine (plus basse / plus haute), Début / Fin = butées
          const order = [...marks].sort((a, b) => a.h - b.h);
          let m: (typeof marks)[number] | undefined;
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') m = [...order].reverse().find((x) => x.h < fh - 0.0005);
          else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') m = order.find((x) => x.h > fh + 0.0005);
          else if (e.key === 'Home') m = order[0];
          else if (e.key === 'End') m = order[order.length - 1];
          else return;
          e.preventDefault();
          if (!m) return;
          const l = pick(m);
          onCam({ focus: l?.id, at: l ? undefined : 0, follow: false });
        }}
        onPointerDown={(e) => {
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, w: e.currentTarget.getBoundingClientRect().width, h0: fh, moved: false };
        }}
        onPointerMove={ring}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d || d.moved) return;
          // simple toucher sur une pile : elle devient nette ; touchée de nouveau, l'objet suivant de la pile (puis la feuille)
          const k = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-mark]')?.dataset.mark;
          const m = k !== undefined ? marks[Number(k)] : undefined;
          if (!m) return;
          const seq: Array<Layer | undefined> = [...m.ls, ...(m.page ? [undefined] : [])];
          const cur = seq.findIndex((x) => (x ? x.id === cam.focus : !cam.focus && Math.abs(fh) < 0.001));
          const next = cur < 0 ? (pick(m) ?? seq[0]) : seq[(cur + 1) % seq.length];
          onCam({ focus: next?.id, at: next ? undefined : 0, follow: false });
          if (next) onSelect(next.id);
        }}
        onPointerCancel={() => (drag.current = null)}
      >
        <i className={`fr-band ${bandW >= 100 ? 'all' : ''}`} style={{ width: `${bandW}%` }} />
        <i className="fr-index" />
        {marks.map((m, k) => {
          const x = xOf(m.h);
          if (x < -8 || x > 108) return null;
          const b = blurShare(cam.aperture, m.h - fh);
          const px = Math.min(4, (b / SHARP) * 1.2);
          const focused = m.ls.find((l) => l.id === cam.focus);
          const on = !!focused || (m.page && !cam.focus && Math.abs(fh) < 0.001);
          // en tête de pile : l'objet net, sinon le sélectionné, sinon le premier
          const top = focused ?? m.ls.find((l) => l.id === selected) ?? m.ls[0];
          const shown = top ? [top, ...m.ls.filter((l) => l !== top)].slice(0, 3).reverse() : [];
          const names = [...m.ls.map((l) => l.name), ...(m.page ? ['Feuille'] : [])];
          return (
            <span
              key={k}
              data-mark={k}
              className={`fr-mark ${on ? 'on' : ''} ${top && top.id === selected ? 'sel' : ''}`}
              style={{ left: `${x}%`, zIndex: on ? 5 : 2, filter: px > 0.3 ? `blur(${px.toFixed(1)}px)` : undefined }}
              title={names.join(', ')}
            >
              {m.page && !shown.length && <i className="fr-sheet" />}
              {m.page && shown.length > 0 && <i className="fr-sheet under" />}
              {shown.map((l, i) => (
                <span key={l.id} className="fr-disc" style={{ transform: `translate(${(shown.length - 1 - i) * -5}px, ${(shown.length - 1 - i) * -4}px)` }}>
                  {thumb(l)}
                </span>
              ))}
              {names.length > 1 && <em className="fr-count">{names.length}</em>}
            </span>
          );
        })}
        <span className="fr-scale" aria-hidden>
          {Array.from({ length: 21 }, (_, i) => {
            const h = lo - span * 0.1 + (i / 20) * (hi - lo + span * 0.2);
            const x = xOf(h);
            return x < 0 || x > 100 ? null : <i key={i} style={{ left: `${x}%` }} className={i % 5 === 0 ? 'big' : ''} />;
          })}
        </span>
      </div>
      <Aperture value={cam.aperture} onChange={(aperture) => onCam({ aperture })} />
    </div>
  );
}

/** Diaphragme : six lames qui se ferment quand le nombre f monte. */
function Iris({ a }: { a: number }) {
  const r = 3 + a * 9;
  const pts = Array.from({ length: 6 }, (_, i) => {
    const t = (i / 6) * Math.PI * 2 + a * 0.9;
    return `${(14 + Math.cos(t) * r).toFixed(2)},${(14 + Math.sin(t) * r).toFixed(2)}`;
  }).join(' ');
  return (
    <svg className="fr-iris" viewBox="0 0 28 28" aria-hidden>
      <circle cx="14" cy="14" r="13" fill="currentColor" opacity="0.9" />
      <polygon points={pts} fill="var(--chrome-solid, #222)" />
      {Array.from({ length: 6 }, (_, i) => {
        const t = (i / 6) * Math.PI * 2 + a * 0.9;
        const x1 = 14 + Math.cos(t) * r;
        const y1 = 14 + Math.sin(t) * r;
        const t2 = t + 1.6;
        return <line key={i} x1={x1} y1={y1} x2={14 + Math.cos(t2) * 13} y2={14 + Math.sin(t2) * 13} stroke="rgba(0,0,0,.35)" strokeWidth="0.8" />;
      })}
    </svg>
  );
}

/** Bague d'ouverture crantée : on glisse le long des nombres f, avec un cran sur chacun. */
function Aperture({ value, onChange }: { value: number; onChange: (a: number) => void }) {
  const drag = useRef<DOMRect | null>(null);
  const set = (x: number) => {
    const b = drag.current;
    if (!b) return;
    let a = Math.max(0, Math.min(1, (x - b.left - 14) / (b.width - 28)));
    const snap = F_STOPS.map(apOf).find((s) => Math.abs(s - a) < 0.035);
    if (snap !== undefined) a = snap;
    onChange(Math.round(a * 1000) / 1000);
  };
  const f = fOf(value);
  return (
    <div className="fr-ap">
      <Iris a={value} />
      <div
        className="fr-stops"
        role="slider"
        aria-label="Ouverture"
        tabIndex={0}
        onKeyDown={(e) => {
          // clavier : flèches = cran voisin, Début / Fin = f/16 / f/1.4
          const stops = F_STOPS.map(apOf);
          let a: number | undefined;
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') a = stops.find((x) => x > value + 0.01);
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') a = [...stops].reverse().find((x) => x < value - 0.01);
          else if (e.key === 'Home') a = 0;
          else if (e.key === 'End') a = 1;
          else return;
          e.preventDefault();
          if (a !== undefined) onChange(Math.round(a * 1000) / 1000);
        }}
        aria-valuetext={value < 0.01 ? 'f/16, tout net' : `f/${f.toFixed(1).replace('.0', '')}`}
        onPointerDown={(e) => {
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          drag.current = e.currentTarget.getBoundingClientRect();
          set(e.clientX);
        }}
        onPointerMove={(e) => set(e.clientX)}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        {F_STOPS.map((s) => {
          const a = apOf(s);
          return (
            <span key={s} className={`fr-stop ${Math.abs(a - value) < 0.02 ? 'on' : ''}`} style={{ left: `calc(14px + (100% - 28px) * ${a})` }}>
              {s}
            </span>
          );
        })}
        <i className="fr-ap-mark" style={{ left: `calc(14px + (100% - 28px) * ${value})` }} />
      </div>
      <output className="fr-ap-out">
        {value < 0.01 ? 'tout net' : `f/${f.toFixed(1).replace('.0', '')}`}
        <small>{value < 0.01 ? 'profondeur infinie' : value < 0.35 ? 'grande profondeur' : value < 0.7 ? 'profondeur moyenne' : 'zone nette courte'}</small>
      </output>
    </div>
  );
}
