import { useEffect, useRef, useState, type ReactNode } from 'react';
import { exportSize, FORMATS, formatOf, type Margins, type Target } from './model';
import { FrameInsets } from './frame-insets';
import { palettesOf, type ActivityProfile, type Channel, type Palette } from './server';
import { channelsOf, framesOf, formatsFor, paletteFor, paletteGuides, targetKey, targetLabel } from './targets';

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
  if (n.includes('youtube'))
    return svg(
      <>
        <rect x="1.5" y="5" width="21" height="14.5" rx="4.2" fill="#ff0000" />
        <path d="M10 9v6.5l5.6-3.25z" fill="#fff" />
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
    case 'video':
      return svg(
        <>
          <rect x="2.5" y="5" width="19" height="14" rx="3.5" {...line} />
          <path d="M10 9.2v5.6l4.8-2.8z" {...line} />
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
function Combo({ value, options, onChange, label, grow, text }: { value: string; options: Opt[]; onChange: (id: string) => void; label: string; grow?: boolean; text?: boolean }) {
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
        {text && <span className="cb-label">{cur?.label}</span>}
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

const r3 = (v: number) => Math.round(v * 1000);
const sameMargins = (a: Margins, b: Margins) => r3(a.top) === r3(b.top) && r3(a.right) === r3(b.right) && r3(a.bottom) === r3(b.bottom) && r3(a.left) === r3(b.left);
/**
 * Deux publications identiques : même média, format, variante, marges et résolution effectives
 * (marges du média quand la publication n'a pas les siennes, résolution native quand elle n'en fixe pas).
 */
export const samePublication = (a: Target, b: Target, channels: Channel[] = []) => {
  const ch = (t: Target) => channels.find((c) => c.id === t.channel);
  const m = (t: Target) => framesOf(t, ch(t)).margins;
  const z = (t: Target) => framesOf(t, ch(t)).zone ?? m(t);
  const w = (t: Target) => t.width ?? exportSize(formatOf(t.format)).w;
  return targetKey(a) === targetKey(b) && sameMargins(m(a), m(b)) && sameMargins(z(a), z(b)) && w(a) === w(b);
};
/** Choix de la variante de couleurs de la publication affichée (dans la palette) : celle du réseau, ou une variante de l'activité. */
export function VariantPick(p: { current: Target; activity: ActivityProfile | null; onApply: (t: Target) => void }) {
  const cfg = p.current;
  const ch = channelsOf(p.activity).find((c) => c.id === cfg.channel);
  const mediaPal = paletteFor(ch ? { channel: ch.id, format: cfg.format } : undefined, p.activity);
  return (
    <Combo
      text
      grow
      label="Variante"
      value={cfg.palette ?? ''}
      onChange={(id) => {
        const next = { ...cfg, palette: id || undefined };
        if (!next.palette) delete next.palette;
        p.onApply(next);
      }}
      options={[{ id: '', icon: <VariantBar pal={mediaPal} wide />, label: mediaPal ? `Par défaut · ${mediaPal.name}` : 'Par défaut' }, ...palettesOf(p.activity).map((q) => ({ id: q.id, icon: <VariantBar pal={q} wide />, label: q.name }))]}
    />
  );
}

/**
 * Édition de la publication affichée : son réseau, son format, sa résolution, sa variante et ses
 * marge et sa zone d'intérêt (FrameInsets, le même réglage que le catalogue), puis ses repères. Chaque réglage s'applique
 * aussitôt au document et à la publication.
 */
export function PublicationsPanel(p: {
  /** réglages de la publication affichée */
  current: Target;
  activity: ActivityProfile | null;
  onApply: (t: Target) => void;
  /** repères de positionnement de la publication courante (type, densité, points d'accroche) */
  guides?: ReactNode;
}) {
  const channels = channelsOf(p.activity);
  const cfg = p.current;
  const ch = channels.find((c) => c.id === cfg.channel);
  const f = formatOf(cfg.format);
  const native = exportSize(f);
  const size = exportSize(f, cfg.width);
  const { margins, zone } = framesOf(cfg, ch);
  const set = (x: Partial<Target>) => {
    const next = { ...cfg, ...x };
    for (const k of Object.keys(next) as (keyof Target)[]) if (next[k] === undefined) delete next[k];
    p.onApply(next);
  };

  return (
    <>
      <div className="pub-form">
        <div className="pub-field">
          <span>Réseau</span>
          <Combo
            text
            label="Réseau"
            value={cfg.channel ?? ''}
            onChange={(id) => {
              const c = channels.find((y) => y.id === id);
              const fs = formatsFor(c);
              set({ channel: id || undefined, format: fs.some((x) => x.id === cfg.format) ? cfg.format : fs[0]!.id, margins: undefined, zone: undefined });
            }}
            options={[...channels.map((c) => ({ id: c.id, icon: <MediaIcon ch={c} />, label: c.name })), { id: '', icon: <MediaIcon />, label: 'Libre' }]}
          />
        </div>
        <div className="pub-field">
          <span>Format</span>
          <Combo text label="Format" value={cfg.format} onChange={(id) => set({ format: id, width: undefined, margins: undefined, zone: undefined })} options={(ch ? formatsFor(ch) : FORMATS).map((x) => ({ id: x.id, icon: <FmtGlyph id={x.id} />, label: x.title }))} />
        </div>
        <label className="pub-field">
          <span>Résolution</span>
          <span className="pub-res">
            <input
              className="pf-input"
              type="number"
              min={100}
              max={8000}
              step={10}
              value={size.w}
              onChange={(e) => {
                const w = Number(e.target.value);
                if (w >= 100 && w <= 8000) set({ width: w === native.w ? undefined : w });
              }}
              aria-label="Largeur en pixels"
            />
            <small>× {size.h} px</small>
          </span>
        </label>
        <div className="pub-field wide">
          <span>Marge et zone d’intérêt</span>
          <FrameInsets width={f.width} height={f.height} margins={margins} zone={zone} onChange={(m, z) => set({ margins: m, zone: z })} />
        </div>
      </div>
      {p.guides}
    </>
  );
}
