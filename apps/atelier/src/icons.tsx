/** Icônes au trait, 24 × 24, couleur du texte. */
const PATHS: Record<string, string> = {
  fit: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  scissors: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.1 7.9 20 18M8.1 16.1 20 6',
  brush: 'M18.4 3.6a2 2 0 0 1 2.8 2.8l-8.5 8.5-2.8-2.8zM9.2 13.4l1.4 1.4a3 3 0 0 1-1 4.9c-1.7.7-4.1.6-5.6.3.9-1 1-2.2 1.2-3.4a3 3 0 0 1 4-3.2z',
  move: 'M12 3v18M3 12h18M12 3 9.5 5.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5',
  layers: 'M12 3 2.5 8 12 13l9.5-5zM2.5 12.5 12 17.5l9.5-5M2.5 16.5 12 21.5l9.5-5',
  sun: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeoff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.8M6.6 6.6A16.6 16.6 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  height: 'M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
  photo: 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  magnet: 'M6 3v8a6 6 0 0 0 12 0V3h-4v8a2 2 0 0 1-4 0V3zM6 7h4M14 7h4',
  'edge-contrast': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 3v18M12 3a9 9 0 0 1 0 18z',
  'edge-color': 'M8 9a3.5 3.5 0 1 0 0-.01zM16 9a3.5 3.5 0 1 0 0-.01zM12 16a3.5 3.5 0 1 0 0-.01z',
  'edge-both': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 3v18M16.5 9.5a1.5 1.5 0 1 0 0-.01zM16.5 14.5a1.5 1.5 0 1 0 0-.01z',
  'border-none': 'M7 7h10v10H7zM4 20 20 4',
  'border-round': 'M7 7h10v10H7zM9 3h6a6 6 0 0 1 6 6v6a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6V9a6 6 0 0 1 6-6z',
  'border-straight': 'M7 7h10v10H7zM3 3h18v18H3z',
  'border-torn': 'M7 7h10v10H7zM3 4l3-1 2 2 3-2 2 1 3-1 2 2 3-1v3l-1 3 1 2-1 3 1 3-1 3-3-1-2 1-3-1-2 2-3-2-2 1-3-1 1-3-1-2 1-3-1-3z',
  import: 'M12 3v12M7 10l5 5 5-5M4 17v3h16v-3',
};

export function Icon({ name }: { name: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}
