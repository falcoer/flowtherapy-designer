import type React from 'react';
import type { HarmonyKind } from '@ftd/core';

/** Petites icônes dessinées (traits en currentColor). */

const HARMONY_OFFSETS: Record<HarmonyKind, number[]> = {
  complementary: [0, 180],
  split: [0, 150, 210],
  triadic: [0, 120, 240],
  tetradic: [0, 90, 180, 270],
  analogous: [0, 30, -30],
  tints: [0],
};

/** Roue miniature : les points montrent où tombent les couleurs de l'harmonie. */
export function HarmonyIcon({ kind }: { kind: HarmonyKind }) {
  const pts = HARMONY_OFFSETS[kind].map((d) => {
    const a = ((d - 90) * Math.PI) / 180;
    return { x: 12 + Math.cos(a) * 8, y: 12 + Math.sin(a) * 8 };
  });
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      {kind === 'tints' ? (
        <>
          <circle cx="12" cy="6" r="2.4" fill="currentColor" fillOpacity="0.3" />
          <circle cx="12" cy="12" r="2.4" fill="currentColor" fillOpacity="0.6" />
          <circle cx="12" cy="18" r="2.4" fill="currentColor" />
        </>
      ) : (
        <>
          {pts.length > 2 && <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="1.2" />}
          {pts.length === 2 && <line x1={pts[0]!.x} y1={pts[0]!.y} x2={pts[1]!.x} y2={pts[1]!.y} stroke="currentColor" strokeWidth="1.2" />}
          {pts.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="2.4" fill="currentColor" />
          ))}
        </>
      )}
    </svg>
  );
}

export const TextIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
    <path d="M5 6h14M12 6v13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
  </svg>
);

export const BackgroundIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
    <rect x="4" y="4" width="16" height="16" rx="3" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

export const GradientFillIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
    <defs>
      <linearGradient id="gfi" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="currentColor" stopOpacity="0.05" />
        <stop offset="1" stopColor="currentColor" stopOpacity="0.9" />
      </linearGradient>
    </defs>
    <rect x="4" y="4" width="16" height="16" rx="3" fill="url(#gfi)" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

export const SaveIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
    <path d="M7 4h10v16l-5-4-5 4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M12 8v5M9.5 10.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

/** Clair → foncé : demi-disque. */
export const RampIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
    <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 4.5a7.5 7.5 0 0 1 0 15z" fill="currentColor" />
  </svg>
);

export const SunIcon = ({ dim }: { dim?: boolean }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
    <circle cx="12" cy="12" r={dim ? 3.5 : 4.5} fill={dim ? 'none' : 'currentColor'} stroke="currentColor" strokeWidth="1.8" />
    {!dim &&
      [0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
        const r = (a * Math.PI) / 180;
        return <line key={a} x1={12 + Math.cos(r) * 7} y1={12 + Math.sin(r) * 7} x2={12 + Math.cos(r) * 9.5} y2={12 + Math.sin(r) * 9.5} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />;
      })}
  </svg>
);

export const PaletteIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="8.5" cy="9" r="1.7" fill="currentColor" />
    <circle cx="13" cy="7.5" r="1.7" fill="currentColor" />
    <circle cx="16.5" cy="11" r="1.7" fill="currentColor" />
  </svg>
);

export function GradientTypeIcon({ type }: { type: 'linear' | 'radial' | 'sphere' }) {
  const id = `gt-${type}`;
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <defs>
        {type === 'linear' ? (
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.05" />
            <stop offset="1" stopColor="currentColor" />
          </linearGradient>
        ) : (
          <radialGradient id={id} {...(type === 'sphere' ? { cx: 0.35, cy: 0.35, fx: 0.35, fy: 0.35, r: 0.75 } : { cx: 0.5, cy: 0.5, r: 0.5 })}>
            <stop offset="0" stopColor="currentColor" stopOpacity="0.05" />
            <stop offset="1" stopColor="currentColor" />
          </radialGradient>
        )}
      </defs>
      {type === 'linear' ? (
        <rect x="4" y="4" width="16" height="16" rx="3" fill={`url(#${id})`} stroke="currentColor" strokeWidth="1.5" />
      ) : (
        <circle cx="12" cy="12" r="8.5" fill={`url(#${id})`} stroke="currentColor" strokeWidth="1.5" />
      )}
    </svg>
  );
}

export const ShapeIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
    <circle cx="9" cy="10" r="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <rect x="11" y="11" width="9" height="9" rx="1.5" fill="currentColor" fillOpacity="0.35" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

export const RotateIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
    <path d="M18 12a6 6 0 1 1-2-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M16.5 3.5v4.2h-4.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const SolidIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
    <rect x="4" y="4" width="16" height="16" rx="3" fill="currentColor" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const I = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);
export const DuplicateIcon = () => (
  <I>
    <rect x="8" y="8" width="11" height="11" rx="2" />
    <path d="M5 15V6a1 1 0 0 1 1-1h9" />
  </I>
);
export const FrontIcon = () => (
  <I>
    <rect x="4" y="9" width="10" height="10" rx="1.5" strokeOpacity="0.45" />
    <rect x="9" y="4" width="10" height="10" rx="1.5" fill="currentColor" fillOpacity="0.35" />
  </I>
);
export const BackIcon = () => (
  <I>
    <rect x="9" y="4" width="10" height="10" rx="1.5" strokeOpacity="0.45" />
    <rect x="4" y="9" width="10" height="10" rx="1.5" fill="currentColor" fillOpacity="0.35" />
  </I>
);
export const TrashIcon = () => (
  <I>
    <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />
  </I>
);
export const StyleIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
    <text x="12" y="17" textAnchor="middle" fontSize="15" fontWeight="700" fontFamily="Georgia, serif" fill="currentColor">
      Aa
    </text>
  </svg>
);
export const DropIcon = () => (
  <I>
    <path d="M12 4c3 4 5.5 6.6 5.5 9.5a5.5 5.5 0 0 1-11 0C6.5 10.6 9 8 12 4z" fill="currentColor" fillOpacity="0.3" />
  </I>
);

/* Effets */
export const EffectsIcon = () => (
  <I>
    <path d="M12 3.5l1.9 4.6 4.6 1.9-4.6 1.9-1.9 4.6-1.9-4.6-4.6-1.9 4.6-1.9z" fill="currentColor" fillOpacity="0.25" />
    <path d="M18.5 15.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z" />
  </I>
);
export const OpacityIcon = () => (
  <I>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" fillOpacity="0.5" stroke="none" />
  </I>
);
export const DilutionIcon = () => (
  <I>
    <path d="M9 3.5c2 2.7 3.6 4.4 3.6 6.4a3.6 3.6 0 0 1-7.2 0c0-2 1.6-3.7 3.6-6.4z" fill="currentColor" fillOpacity="0.55" />
    <path d="M4 17c2.7-1.3 5.3 1.3 8 0s5.3 1.3 8 0M4 20.5c2.7-1.3 5.3 1.3 8 0s5.3 1.3 8 0" strokeOpacity="0.55" />
  </I>
);
export const BlurIcon = () => (
  <I>
    <circle cx="12" cy="12" r="3.5" fill="currentColor" fillOpacity="0.6" stroke="none" />
    <circle cx="12" cy="12" r="6" strokeOpacity="0.45" strokeDasharray="2 2.4" />
    <circle cx="12" cy="12" r="8.6" strokeOpacity="0.25" strokeDasharray="1.5 3" />
  </I>
);
export const SaturationIcon = () => (
  <I>
    <path d="M4 18h16L20 6z" fill="currentColor" fillOpacity="0.3" />
  </I>
);
export const HueIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
    <circle cx="12" cy="12" r="7.5" fill="none" stroke="url(#hue-ring)" strokeWidth="3.4" />
    <defs>
      <linearGradient id="hue-ring" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#e5484d" />
        <stop offset="0.35" stopColor="#f5d90a" />
        <stop offset="0.65" stopColor="#30a46c" />
        <stop offset="1" stopColor="#3e63dd" />
      </linearGradient>
    </defs>
  </svg>
);
export const ContrastIcon = () => (
  <I>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" stroke="none" />
  </I>
);
export const ShadowIcon = () => (
  <I>
    <rect x="8" y="8" width="11" height="11" rx="2.5" fill="currentColor" fillOpacity="0.35" stroke="none" />
    <rect x="5" y="5" width="11" height="11" rx="2.5" />
  </I>
);
export const SoftIcon = () => (
  <I>
    <rect x="6" y="6" width="12" height="12" rx="3" strokeDasharray="2 2.5" strokeOpacity="0.7" />
    <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" fillOpacity="0.4" stroke="none" />
  </I>
);
export const ReliefIcon = () => (
  <I>
    <rect x="4.5" y="6.5" width="15" height="11" rx="3.5" />
    <path d="M7 9.5c0-.6.4-1 1-1h8" strokeOpacity="0.5" />
    <path d="M17 14.5c0 .6-.4 1-1 1H8" strokeWidth="2.6" />
  </I>
);
export const LightIcon = () => (
  <I>
    <circle cx="8" cy="8" r="3" fill="currentColor" fillOpacity="0.3" />
    <path d="M8 2.5v1.2M2.5 8h1.2M4.1 4.1l.9.9M12 12l6.5 6.5M15 18.5h3.5V15" />
  </I>
);
