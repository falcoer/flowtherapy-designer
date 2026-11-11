import { useEffect, useMemo, useRef, useState } from 'react';
import { applyPixelFx, fxOf, newFx, type Fx } from './fx';
import { MATERIAL_TYPES, presetFx, type MaterialPreset } from './material-presets';
import { guideColor, type Guide } from './model';

/** Vignettes des matières réelles, gardées d'une ouverture à l'autre (par matière et couleur de l'objet). */
const thumbs = new Map<string, string>();
function thumbOf(p: MaterialPreset, guides: Guide[], color: string): string {
  const key = `${p.name}|${p.tone ? '' : color}`;
  const hit = thumbs.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 144;
  c.height = 96;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  const img = x.getImageData(0, 0, c.width, c.height);
  applyPixelFx(img, [presetFx(p, newFx(p.fx))], guides, 480, 0.5, -0.8);
  x.putImageData(img, 0, 0);
  const url = c.toDataURL('image/jpeg', 0.82);
  thumbs.set(key, url);
  return url;
}

/**
 * Assistant matières (baguette magique du Support) : on choisit le type de matière, puis une matière
 * réelle (Chêne, Laiton, Velours de scène…) qui se pose aussitôt sur l'objet avec ses réglages et sa teinte.
 * La boîte reste ouverte pour comparer sur la page.
 */
export function MaterialWizard({ current, guides, color, onPick, onClose }: { current?: Fx; guides: Guide[]; color: string; onPick: (p: MaterialPreset) => void; onClose: () => void }) {
  const startType = MATERIAL_TYPES.find((t) => t.presets.some((p) => p.name === current?.preset)) ?? MATERIAL_TYPES.find((t) => t.presets.some((p) => p.fx === current?.id)) ?? MATERIAL_TYPES[0]!;
  const [type, setType] = useState(startType.id);
  const presets = MATERIAL_TYPES.find((t) => t.id === type)!.presets;
  // vignettes calculées une à une, sans bloquer l'ouverture
  const [, tick] = useState(0);
  useEffect(() => {
    let stop = false;
    let i = 0;
    const step = () => {
      if (stop) return;
      const p = presets.find((q) => !thumbs.has(`${q.name}|${q.tone ? '' : color}`));
      if (!p || i++ > 40) return;
      thumbOf(p, guides, color);
      tick((n) => n + 1);
      setTimeout(step, 0);
    };
    const t = setTimeout(step, 30);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [presets, guides, color]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const on = useMemo(() => current?.preset, [current]);
  // l'onglet du type ouvert reste en vue (téléphone : la rangée défile)
  const tabs = useRef<HTMLDivElement>(null);
  useEffect(() => tabs.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }), [type]);
  return (
    <div className="mw-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mw" role="dialog" aria-label="Assistant matières">
        <div className="mw-h">
          <span className="mw-wand">
            <WandGlyph />
          </span>
          <div>
            <b>Assistant matières</b>
            <small>Choisis un type, puis une matière réelle : elle se pose sur l’objet avec sa teinte.</small>
          </div>
          <button className="mw-x" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <div className="mw-types" role="tablist" ref={tabs}>
          {MATERIAL_TYPES.map((t) => (
            <button key={t.id} role="tab" aria-selected={t.id === type} className={t.id === type ? 'on' : ''} onClick={() => setType(t.id)}>
              {t.name}
            </button>
          ))}
        </div>
        <div className="mw-grid">
          {presets.map((p) => {
            const src = thumbs.get(`${p.name}|${p.tone ? '' : color}`);
            return (
              <button key={p.name} className={`mw-card ${on === p.name ? 'on' : ''}`} onClick={() => onPick(p)} title={`${p.name} : ${p.hint} (${fxOf(p.fx)?.name})`}>
                <span className="mw-sw" style={src ? { backgroundImage: `url(${src})` } : { background: p.tone ?? color }} />
                <span className="mw-nm">{p.name}</span>
                <span className="mw-hint">{p.hint}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Couleur de l'objet pour les vignettes : son guide au milieu. */
export const layerColor = (guides: Guide[], i: number) => (guides[i] ? guideColor(guides[i]!, 0.5) : '#bdb6a8');

export function WandGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 20 14.5 9.5M13 8l3 3M17 3v3M15.5 4.5h3M20.5 9v2M19.5 10h2M10 3v2M9 4h2" />
    </svg>
  );
}
