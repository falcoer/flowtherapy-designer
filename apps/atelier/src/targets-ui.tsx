import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FORMATS, formatOf, type Target } from './model';
import { exportSize } from './export';
import { palettesOf, type ActivityProfile, type Channel, type Palette } from './server';
import { channelsOf, formatsFor, paletteFor, paletteGuides, targetKey, targetLabel } from './targets';

/** Logo d'un média : Facebook et Instagram reconnus par leur nom, sinon un pictogramme selon le type. */
export function MediaIcon({ ch, size = 22 }: { ch?: Channel; size?: number }) {
  const n = `${ch?.id ?? ''} ${ch?.name ?? ''}`.toLowerCase();
  const svg = (children: ReactNode) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="media-icon">
      {children}
    </svg>
  );
  if (n.includes('facebook'))
    return svg(
      <>
        <rect x="2" y="2" width="20" height="20" rx="6" fill="#1877f2" />
        <path d="M13.4 21v-6.6h2.2l.35-2.6h-2.55v-1.6c0-.75.22-1.25 1.3-1.25h1.35V6.6c-.24-.03-1.04-.1-1.97-.1-1.95 0-3.28 1.19-3.28 3.37v1.93H8.6v2.6h2.2V21z" fill="#fff" />
      </>,
    );
  if (n.includes('instagram'))
    return svg(
      <>
        <defs>
          <linearGradient id="ig-g" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#feda75" />
            <stop offset=".35" stopColor="#fa7e1e" />
            <stop offset=".65" stopColor="#d62976" />
            <stop offset="1" stopColor="#4f5bd5" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#ig-g)" />
        <rect x="6" y="6" width="12" height="12" rx="3.6" fill="none" stroke="#fff" strokeWidth="1.7" />
        <circle cx="12" cy="12" r="2.9" fill="none" stroke="#fff" strokeWidth="1.7" />
        <circle cx="15.6" cy="8.4" r="1" fill="#fff" />
      </>,
    );
  const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (ch?.kind) {
    case 'affichage':
      return svg(
        <>
          <rect x="5" y="2.5" width="14" height="19" rx="1.5" {...line} />
          <path d="M8 7h8M8 10h5M8 17h8" {...line} />
        </>,
      );
    case 'impression':
      return svg(
        <>
          <path d="M7 8V3h10v5M7 17H4.5V9.5A1.5 1.5 0 0 1 6 8h12a1.5 1.5 0 0 1 1.5 1.5V17H17" {...line} />
          <rect x="7" y="13" width="10" height="8" {...line} />
        </>,
      );
    case 'email':
      return svg(
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" {...line} />
          <path d="m3.5 6 8.5 7 8.5-7" {...line} />
        </>,
      );
    case 'site':
      return svg(
        <>
          <circle cx="12" cy="12" r="9" {...line} />
          <path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z" {...line} />
        </>,
      );
    case 'social':
      return svg(<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z" {...line} />);
    default:
      return svg(<rect x="3.5" y="3.5" width="17" height="17" rx="3" {...line} strokeDasharray="3 2.5" />);
  }
}

/** Le format dessiné à ses proportions. */
export function FmtGlyph({ id, size = 22 }: { id: string; size?: number }) {
  const f = formatOf(id);
  const k = (size - 3) / Math.max(f.width, f.height);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <rect x={(size - f.width * k) / 2} y={(size - f.height * k) / 2} width={f.width * k} height={f.height * k} rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/** Une variante en un seul dégradé, le fond à gauche. */
export const variantGradient = (pal?: Palette) => {
  const cs = pal ? paletteGuides(pal).flatMap((g) => (g.type === 'color' ? [g.color] : g.stops)) : [];
  if (!cs.length) return 'repeating-linear-gradient(45deg, var(--line) 0 4px, transparent 4px 8px)';
  if (cs.length === 1) return cs[0]!;
  return `linear-gradient(90deg, ${cs.map((c, i) => `${c} ${Math.round((i / (cs.length - 1)) * 100)}%`).join(', ')})`;
};
export const VariantBar = ({ pal, wide }: { pal?: Palette; wide?: boolean }) => <span className={`variant-bar ${wide ? 'wide' : ''}`} style={{ background: variantGradient(pal) }} />;

interface Opt {
  id: string;
  icon: ReactNode;
  label: string;
}

/** Liste déroulante à pictogrammes : le bouton montre le choix, la liste s'ouvre dessous. */
function Combo({ value, options, onChange, label, grow }: { value: string; options: Opt[]; onChange: (id: string) => void; label: string; grow?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
  }, [open]);
  const cur = options.find((o) => o.id === value) ?? options[0];
  return (
    <div className={`cb ${grow ? 'grow' : ''}`} ref={ref}>
      <button className={`cb-btn ${open ? 'on' : ''}`} onClick={() => setOpen(!open)} title={`${label} : ${cur?.label ?? ''}`} aria-label={label} aria-expanded={open}>
        {cur?.icon}
        <span className="cb-caret">▾</span>
      </button>
      {open && (
        <div className="cb-list" role="listbox" aria-label={label}>
          {options.map((o) => (
            <button
              key={o.id}
              role="option"
              aria-selected={o.id === value}
              className={o.id === value ? 'on' : ''}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
            >
              {o.icon}
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Cibles du document : une ligne par cible (média, format, variante), et l'ajout sur une ligne. */
export function TargetsPanel(p: { targets: Target[]; active: number; activity: ActivityProfile | null; onShow: (i: number) => void; onRemove: (i: number) => void; onAdd: (t: Target) => void }) {
  const channels = channelsOf(p.activity);
  const palettes = palettesOf(p.activity);
  const [chId, setChId] = useState(channels[0]?.id ?? '');
  const [fmt, setFmt] = useState('');
  const [pal, setPal] = useState('');
  const ch = channels.find((c) => c.id === chId);
  const fs = formatsFor(ch);
  const format = fs.some((f) => f.id === fmt) ? fmt : fs[0]!.id;
  const t: Target = { ...(ch ? { channel: ch.id } : {}), format, ...(pal ? { palette: pal } : {}) };
  const dup = p.targets.some((x) => targetKey(x) === targetKey(t));
  const mediaPal = paletteFor(ch ? { channel: ch.id, format } : undefined, p.activity);

  return (
    <>
      {p.targets.map((x, i) => {
        const c = channels.find((y) => y.id === x.channel);
        const v = paletteFor(x, p.activity);
        return (
          <div key={i} className={`tg-line ${i === p.active ? 'on' : ''}`}>
            <button className="tg-show" onClick={() => p.onShow(i)} title={`${targetLabel(x, p.activity)}${v ? ` · ${v.name}` : ''}`}>
              <MediaIcon ch={c} />
              <FmtGlyph id={x.format} />
              <span className="tg-name">{targetLabel(x, p.activity)}</span>
              <small className="tg-px">{(({ w, h }) => `${w} × ${h}`)(exportSize(formatOf(x.format)))}</small>
              <VariantBar pal={v} />
            </button>
            <button className="tm-remove" title="Retirer cette cible" onClick={() => p.onRemove(i)}>
              ×
            </button>
          </div>
        );
      })}
      <div className="tg-line tg-new">
        <Combo
          label="Média"
          value={chId}
          onChange={setChId}
          options={[...channels.map((c) => ({ id: c.id, icon: <MediaIcon ch={c} />, label: c.name })), { id: '', icon: <MediaIcon />, label: 'Libre (tous formats)' }]}
        />
        <Combo label="Format" value={format} onChange={setFmt} options={(ch ? fs : FORMATS).map((f) => ({ id: f.id, icon: <FmtGlyph id={f.id} />, label: f.title }))} />
        <Combo
          grow
          label="Variante"
          value={pal}
          onChange={setPal}
          options={[
            { id: '', icon: <VariantBar pal={mediaPal} wide />, label: `Celle du média${mediaPal ? ` (${mediaPal.name})` : ''}` },
            ...palettes.map((q) => ({ id: q.id, icon: <VariantBar pal={q} wide />, label: q.name })),
          ]}
        />
        <button className="tg-plus" disabled={dup} onClick={() => p.onAdd(t)} title={dup ? 'Cette cible est déjà dans la liste' : 'Ajouter cette cible'} aria-label="Ajouter la cible">
          +
        </button>
      </div>
    </>
  );
}
