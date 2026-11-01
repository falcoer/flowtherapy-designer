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
