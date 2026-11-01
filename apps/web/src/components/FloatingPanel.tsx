import { useEffect, useRef, useState, type ReactNode } from 'react';

export type Dock = 'left' | 'right' | null;

interface Props {
  id: string;
  icon: ReactNode;
  label: string;
  children: ReactNode;
  onClose: () => void;
  onDock?: (dock: Dock) => void;
  defaultDock?: Dock;
}

interface State {
  dock: Dock;
  x: number;
  y: number;
}

const SNAP = 72; // px du bord pour s'accrocher

function load(id: string, dock: Dock): State {
  try {
    const s = JSON.parse(localStorage.getItem(`ftd-panel-${id}`) ?? '');
    if (s && typeof s.x === 'number') return s;
  } catch {
    /* stockage indisponible */
  }
  return { dock, x: 0, y: 0 };
}

/**
 * Panneau flottant : on le déplace par sa poignée ; lâché près d'un bord,
 * il s'y accroche sur toute la hauteur.
 */
export function FloatingPanel({ id, icon, label, children, onClose, onDock, defaultDock = 'right' }: Props) {
  const [st, setSt] = useState<State>(() => load(id, defaultDock));
  const [drag, setDrag] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(`ftd-panel-${id}`, JSON.stringify(st));
    } catch {
      /* stockage indisponible */
    }
    onDock?.(st.dock);
  }, [st, id, onDock]);
  useEffect(() => () => onDock?.(null), [onDock]);

  const parent = () => ref.current?.parentElement?.getBoundingClientRect() ?? new DOMRect(0, 0, innerWidth, innerHeight);

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const r = ref.current!.getBoundingClientRect();
    const p = parent();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDrag({ x: r.left - p.left, y: r.top - p.top, dx: e.clientX - r.left, dy: e.clientY - r.top });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = parent();
    setDrag({ ...drag, x: e.clientX - p.left - drag.dx, y: e.clientY - p.top - drag.dy });
  };
  const onUp = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = parent();
    const w = ref.current!.offsetWidth;
    const dock: Dock = e.clientX - p.left < SNAP + 80 ? 'left' : p.right - e.clientX < SNAP ? 'right' : null;
    const x = Math.max(8, Math.min(p.width - w - 8, drag.x));
    const y = Math.max(8, Math.min(p.height - 120, drag.y));
    setSt({ dock, x, y });
    setDrag(null);
  };

  const style = drag ? { left: drag.x, top: drag.y } : st.dock ? undefined : { left: st.x, top: st.y };
  const cls = `float-panel glass ${drag ? 'dragging' : st.dock ? `docked-${st.dock}` : 'floating'}`;

  return (
    <aside ref={ref} className={cls} style={style} aria-label={label}>
      <header className="float-head" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} title="Glisser pour déplacer ; contre un bord pour l'accrocher">
        <span className="float-grip" aria-hidden>
          ⠿
        </span>
        <span className="float-icon" aria-hidden>
          {icon}
        </span>
        <span className="float-actions">
          <button className="icon-btn" onClick={() => setSt((s) => ({ ...s, dock: s.dock === 'left' ? 'right' : 'left' }))} title="Changer de côté">
            ⇄
          </button>
          <button className="icon-btn" onClick={onClose} title="Fermer">
            ✕
          </button>
        </span>
      </header>
      <div className="float-body">{children}</div>
    </aside>
  );
}
