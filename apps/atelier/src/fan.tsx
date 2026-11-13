/**
 * Éventail : une barre qui se déploie depuis le bouton de sélection, chaque élément arrivant l'un
 * après l'autre. Un toucher sur un élément le choisit et referme. Au-delà de 8 éléments, la barre
 * défile (doigt, molette ou trackpad) et s'ouvre sur l'élément choisi. Quand les éléments portent une
 * famille, l'éventail les range en lignes, une par famille, son nom en tête : tout se voit d'un coup.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

export interface FanItem {
  key: string;
  icon: ReactNode;
  label: string;
  hint?: string;
  on?: boolean;
  /** Famille : les éléments d'une même famille partagent une ligne. */
  group?: string;
}

/** La barre seule ; `dir` : côté vers lequel elle s'ouvre. */
export function Fan({ items, onPick, dir, style }: { items: FanItem[]; onPick: (key: string) => void; dir: 'left' | 'right'; style?: CSSProperties }) {
  const groups = items.some((it) => it.group) ? [...new Set(items.map((it) => it.group ?? ''))] : null;
  const scroll = !groups && items.length > 8;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!scroll || !el) return;
    // ouvre sur l'élément choisi
    const on = el.querySelector<HTMLElement>('.fan-item.on');
    if (on) el.scrollLeft = on.offsetLeft - el.clientWidth / 2 + on.offsetWidth / 2;
    // la molette verticale fait défiler la barre
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [scroll]);
  const item = (it: FanItem, i: number) => (
    <button
      key={it.key}
      role="menuitemradio"
      aria-checked={!!it.on}
      className={`fan-item ${it.on ? 'on' : ''}`}
      style={{ '--i': Math.min(i, 10) } as CSSProperties}
      title={it.hint ? `${it.label} : ${it.hint}` : it.label}
      onClick={() => onPick(it.key)}
    >
      <span className="fan-ico">{it.icon}</span>
      <small>{it.label}</small>
    </button>
  );
  if (groups)
    return (
      <div ref={ref} className={`fan fan-${dir} fan-groups`} style={style} role="menu" onPointerDown={(e) => e.stopPropagation()}>
        {groups.map((g, r) => (
          <div key={g} className="fan-row" role="group" aria-label={g}>
            <span className="fan-group">{g}</span>
            {items.filter((it) => (it.group ?? '') === g).map((it, i) => item(it, r + i))}
          </div>
        ))}
      </div>
    );
  return (
    <div ref={ref} className={`fan fan-${dir} ${scroll ? 'fan-scroll' : ''}`} style={style} role="menu" onPointerDown={(e) => e.stopPropagation()}>
      {items.map(item)}
    </div>
  );
}

/** Ferme quand on touche ailleurs que dans `keep`. */
export function useOutside(open: boolean, keep: Array<React.RefObject<HTMLElement | null>>, close: () => void) {
  const cb = useRef(close);
  cb.current = close;
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (keep.some((r) => r.current?.contains(t))) return;
      cb.current();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && cb.current();
    // au tour suivant : le toucher qui ouvre ne referme pas
    const id = window.setTimeout(() => {
      window.addEventListener('pointerdown', down, true);
      window.addEventListener('keydown', esc);
    });
    return () => {
      clearTimeout(id);
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', esc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

/** Bouton de la barre latérale qui déploie son éventail vers la page. */
export function FanButton({ face, title, items, onPick, dir }: { face: ReactNode; title: string; items: FanItem[]; onPick: (key: string) => void; dir: 'left' | 'right' }) {
  const [open, setOpen] = useState<number | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const fan = useRef<HTMLDivElement>(null);
  useOutside(open !== null, [btn, fan], () => setOpen(null));
  return (
    <>
      <button
        ref={btn}
        className={`btn small ${open !== null ? 'on' : ''}`}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open !== null}
        onClick={() => {
          const b = btn.current;
          setOpen(open !== null || !b ? null : b.offsetTop + b.offsetHeight / 2);
        }}
      >
        {face}
      </button>
      {open !== null && (
        <div ref={fan} className="fan-at" style={{ top: open }}>
          <Fan
            items={items}
            dir={dir}
            onPick={(k) => {
              onPick(k);
              setOpen(null);
            }}
          />
        </div>
      )}
    </>
  );
}
