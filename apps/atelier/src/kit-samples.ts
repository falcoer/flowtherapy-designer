/**
 * Objets d'exemple, dessinés comme on les importerait : un groupe par pièce, `data-name` pour son
 * nom, la couleur du dessin, et facultativement `data-volume`, `data-axis` (degrés) et `data-lift`.
 */
export const KIT_SAMPLES: Array<{ id: string; name: string; svg: string }> = [
  {
    id: 'voiture',
    name: 'Voiture',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 170">
  <g data-name="Carrosserie" fill="#c0392b" data-volume="cylinder" data-axis="90" data-amount="0.45">
    <path d="M20 118 L20 96 Q22 81 50 77 L120 71 L163 40 Q174 32 195 32 L268 32 Q290 32 305 46 L333 72 L368 80 Q385 84 385 100 L385 120 Q385 130 374 130 L30 130 Q20 130 20 118 Z"/>
  </g>
  <g data-name="Vitres" fill="#a9d4ef" data-lift="0.02" data-volume="cushion" data-amount="0.4">
    <path d="M150 71 L175 46 Q182 40 196 40 L240 40 L240 70 Z"/>
    <path d="M250 40 L268 40 Q284 40 297 52 L316 70 L250 70 Z"/>
  </g>
  <g data-name="Phares" fill="#ffe9a0" data-lift="0.03" data-volume="dome">
    <ellipse cx="372" cy="93" rx="9" ry="6"/>
    <rect x="21" y="88" width="9" height="12" rx="3"/>
  </g>
  <g data-name="Pare-chocs" fill="#8a8f99" data-lift="0.03" data-volume="cylinder" data-axis="90" data-amount="0.8">
    <rect x="356" y="112" width="34" height="12" rx="5"/>
    <rect x="12" y="112" width="30" height="12" rx="5"/>
  </g>
  <g data-name="Pneus" fill="#22222a" data-lift="0.05" data-volume="cushion" data-amount="0.9">
    <circle cx="95" cy="130" r="30"/>
    <circle cx="308" cy="130" r="30"/>
  </g>
  <g data-name="Jantes" fill="#d5d8de" data-lift="0.07" data-volume="cone" data-amount="0.35">
    <circle cx="95" cy="130" r="14"/>
    <circle cx="308" cy="130" r="14"/>
  </g>
</svg>`,
  },
  {
    id: 'montagne',
    name: 'Montagne',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260">
  <g data-name="Roche" fill="#6b6f80" data-volume="cone" data-amount="0.45">
    <polygon points="0,260 120,80 170,130 230,40 330,170 400,110 400,260"/>
  </g>
  <g data-name="Neige" fill="#f4f6fb" data-lift="0.02" data-volume="cushion" data-amount="0.5">
    <polygon points="230,40 264,84 250,80 240,92 228,82 214,92 201,84"/>
    <polygon points="120,80 150,110 140,106 130,116 120,106 110,114 100,110"/>
  </g>
  <g data-name="Prairie" fill="#6d8f4e" data-lift="0.04" data-volume="cushion" data-amount="0.6">
    <path d="M0 260 L0 214 Q100 194 200 214 T400 204 L400 260 Z"/>
  </g>
</svg>`,
  },
  {
    id: 'guitare',
    name: 'Guitare',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 420">
  <g data-name="Corps" fill="#c8762e" data-volume="dome" data-amount="0.35">
    <path d="M80 230 C40 230 20 255 28 285 C34 305 20 315 18 340 C14 385 45 410 80 410 C115 410 146 385 142 340 C140 315 126 305 132 285 C140 255 120 230 80 230 Z"/>
  </g>
  <g data-name="Touche" fill="#4a2c17" data-lift="0.02" data-volume="cylinder" data-axis="0" data-amount="0.4">
    <rect x="70" y="58" width="20" height="262"/>
  </g>
  <g data-name="Tête" fill="#4a2c17" data-lift="0.02" data-volume="cushion" data-amount="0.5">
    <path d="M66 62 L61 12 Q80 0 99 12 L94 62 Z"/>
  </g>
  <g data-name="Micros" fill="#26262c" data-lift="0.04" data-volume="cushion" data-amount="0.7">
    <rect x="58" y="296" width="44" height="13" rx="3"/>
    <rect x="58" y="328" width="44" height="13" rx="3"/>
  </g>
  <g data-name="Chevalet" fill="#3a3a42" data-lift="0.04" data-volume="cylinder" data-axis="90" data-amount="0.6">
    <rect x="56" y="368" width="48" height="10" rx="3"/>
  </g>
  <g data-name="Mécaniques" fill="#d5d8de" data-lift="0.04" data-volume="dome">
    <circle cx="56" cy="22" r="5"/><circle cx="56" cy="38" r="5"/><circle cx="56" cy="54" r="5"/>
    <circle cx="104" cy="22" r="5"/><circle cx="104" cy="38" r="5"/><circle cx="104" cy="54" r="5"/>
  </g>
</svg>`,
  },
];
