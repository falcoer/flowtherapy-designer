/**
 * Objets en pièces, dessinés comme on les importerait : un groupe par pièce, `data-name` pour son
 * nom, la couleur du dessin, et facultativement `data-volume`, `data-axis` (degrés), `data-amount`
 * et `data-lift`. La clé est celle de la forme qu'ils remplacent dans le rayon Formes.
 */
export const KITS: Record<string, { name: string; svg: string }> = {
  tree: {
    name: 'Arbre',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260">
  <g data-name="Tronc" fill="#7a5230" data-volume="cylinder" data-amount="0.6" data-axis="0"><rect x="88" y="120" width="24" height="138" rx="4"/></g>
  <g data-name="Feuillage" fill="#4f8a3c" data-volume="dome" data-amount="0.45" data-lift="0.03"><circle cx="100" cy="85" r="72"/><circle cx="52" cy="128" r="46"/><circle cx="148" cy="128" r="46"/></g>
</svg>`,
  },
  fir: {
    name: 'Sapin',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 260">
  <g data-name="Tronc" fill="#7a5230" data-volume="cylinder" data-amount="0.6" data-axis="0"><rect x="80" y="210" width="20" height="48" rx="3"/></g>
  <g data-name="Étages" fill="#2f6b45" data-volume="cone" data-amount="0.35" data-lift="0.03"><polygon points="90,8 140,80 40,80"/><polygon points="90,52 156,142 24,142"/><polygon points="90,110 172,222 8,222"/></g>
</svg>`,
  },
  palm: {
    name: 'Palmier',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 260">
  <g data-name="Tronc" fill="#8b6a42" data-volume="cylinder" data-amount="0.6" data-axis="0"><path d="M104 258 Q98 170 112 82 L126 84 Q114 170 124 258 Z"/></g>
  <g data-name="Palmes" fill="#3f8f4a" data-volume="cone" data-amount="0.3" data-lift="0.03"><ellipse cx="170" cy="80" rx="54" ry="13" transform="rotate(195 118 80)"/><ellipse cx="170" cy="80" rx="54" ry="13" transform="rotate(225 118 80)"/><ellipse cx="170" cy="80" rx="54" ry="13" transform="rotate(258 118 80)"/><ellipse cx="170" cy="80" rx="54" ry="13" transform="rotate(290 118 80)"/><ellipse cx="170" cy="80" rx="54" ry="13" transform="rotate(322 118 80)"/><ellipse cx="170" cy="80" rx="54" ry="13" transform="rotate(350 118 80)"/><ellipse cx="170" cy="80" rx="54" ry="13" transform="rotate(20 118 80)"/></g>
  <g data-name="Noix" fill="#6b4a2b" data-volume="dome" data-amount="0.7" data-lift="0.05"><circle cx="112" cy="92" r="8"/><circle cx="126" cy="94" r="8"/></g>
</svg>`,
  },
  cactus: {
    name: 'Cactus',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 262">
  <g data-name="Corps" fill="#4f9a5a" data-volume="cylinder" data-amount="0.6" data-axis="0"><rect x="80" y="22" width="40" height="214" rx="20"/></g>
  <g data-name="Bras" fill="#4f9a5a" data-volume="cylinder" data-amount="0.6" data-axis="0" data-lift="0.01"><rect x="30" y="95" width="24" height="70" rx="12"/><rect x="30" y="143" width="60" height="22" rx="11"/><rect x="146" y="60" width="24" height="72" rx="12"/><rect x="110" y="110" width="60" height="22" rx="11"/></g>
  <g data-name="Fleur" fill="#e8578a" data-volume="dome" data-amount="0.6" data-lift="0.04"><circle cx="100" cy="20" r="11"/></g>
  <g data-name="Pot" fill="#b5653a" data-volume="cushion" data-amount="0.4" data-lift="0.02"><path d="M58 222 L142 222 L133 262 L67 262 Z"/></g>
</svg>`,
  },
  flower: {
    name: 'Fleur',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 262">
  <g data-name="Tige" fill="#4f8a3c" data-volume="cylinder" data-amount="0.6" data-axis="0"><rect x="76" y="90" width="8" height="172" rx="4"/></g>
  <g data-name="Feuilles" fill="#5aa04a" data-volume="cone" data-amount="0.4" data-lift="0.01"><ellipse cx="58" cy="192" rx="24" ry="9" transform="rotate(-30 58 192)"/><ellipse cx="102" cy="166" rx="24" ry="9" transform="rotate(30 102 166)"/></g>
  <g data-name="Pétales" fill="#f2a7c3" data-volume="dome" data-amount="0.4" data-lift="0.03"><circle cx="110.0" cy="70.0" r="24"/><circle cx="95.0" cy="96.0" r="24"/><circle cx="65.0" cy="96.0" r="24"/><circle cx="50.0" cy="70.0" r="24"/><circle cx="65.0" cy="44.0" r="24"/><circle cx="95.0" cy="44.0" r="24"/></g>
  <g data-name="Cœur" fill="#f6c945" data-volume="dome" data-amount="0.6" data-lift="0.05"><circle cx="80" cy="70" r="17"/></g>
</svg>`,
  },
  sun: {
    name: 'Soleil',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
  <g data-name="Rayons" fill="#f5b335" data-volume="cone" data-amount="0.3"><polygon points="120,6 131,42 109,42" transform="rotate(0 120 120)"/><polygon points="120,6 131,42 109,42" transform="rotate(30 120 120)"/><polygon points="120,6 131,42 109,42" transform="rotate(60 120 120)"/><polygon points="120,6 131,42 109,42" transform="rotate(90 120 120)"/><polygon points="120,6 131,42 109,42" transform="rotate(120 120 120)"/><polygon points="120,6 131,42 109,42" transform="rotate(150 120 120)"/><polygon points="120,6 131,42 109,42" transform="rotate(180 120 120)"/><polygon points="120,6 131,42 109,42" transform="rotate(210 120 120)"/><polygon points="120,6 131,42 109,42" transform="rotate(240 120 120)"/><polygon points="120,6 131,42 109,42" transform="rotate(270 120 120)"/><polygon points="120,6 131,42 109,42" transform="rotate(300 120 120)"/><polygon points="120,6 131,42 109,42" transform="rotate(330 120 120)"/></g>
  <g data-name="Disque" fill="#f8d24a" data-volume="dome" data-amount="0.5" data-lift="0.03"><circle cx="120" cy="120" r="70"/></g>
</svg>`,
  },
  mountain: {
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
  house: {
    name: 'Maison',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220">
  <g data-name="Murs" fill="#e9d8b8" data-volume="cushion" data-amount="0.3"><rect x="30" y="100" width="160" height="118"/></g>
  <g data-name="Toit" fill="#b5452f" data-volume="cone" data-amount="0.3" data-lift="0.02"><rect x="148" y="38" width="22" height="50"/><polygon points="14,106 110,24 206,106"/></g>
  <g data-name="Porte" fill="#7a5230" data-volume="cushion" data-amount="0.4" data-lift="0.02"><rect x="94" y="150" width="32" height="68" rx="3"/></g>
  <g data-name="Fenêtres" fill="#a9d4ef" data-volume="cushion" data-amount="0.4" data-lift="0.02"><rect x="44" y="124" width="36" height="30" rx="2"/><rect x="140" y="124" width="36" height="30" rx="2"/></g>
</svg>`,
  },
  building: {
    name: 'Immeuble',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 262">
  <g data-name="Façade" fill="#c9c3b6" data-volume="cushion" data-amount="0.25"><rect x="10" y="30" width="120" height="232"/></g>
  <g data-name="Toit" fill="#6b6f80" data-volume="cylinder" data-amount="0.6" data-axis="90" data-lift="0.02"><rect x="4" y="18" width="132" height="16" rx="3"/></g>
  <g data-name="Fenêtres" fill="#a9d4ef" data-volume="cushion" data-amount="0.4" data-lift="0.02"><rect x="25" y="50" width="20" height="22" rx="2"/><rect x="60" y="50" width="20" height="22" rx="2"/><rect x="95" y="50" width="20" height="22" rx="2"/><rect x="25" y="80" width="20" height="22" rx="2"/><rect x="60" y="80" width="20" height="22" rx="2"/><rect x="95" y="80" width="20" height="22" rx="2"/><rect x="25" y="110" width="20" height="22" rx="2"/><rect x="60" y="110" width="20" height="22" rx="2"/><rect x="95" y="110" width="20" height="22" rx="2"/><rect x="25" y="140" width="20" height="22" rx="2"/><rect x="60" y="140" width="20" height="22" rx="2"/><rect x="95" y="140" width="20" height="22" rx="2"/><rect x="25" y="170" width="20" height="22" rx="2"/><rect x="60" y="170" width="20" height="22" rx="2"/><rect x="95" y="170" width="20" height="22" rx="2"/><rect x="25" y="200" width="20" height="22" rx="2"/><rect x="60" y="200" width="20" height="22" rx="2"/><rect x="95" y="200" width="20" height="22" rx="2"/></g>
  <g data-name="Porte" fill="#55555f" data-volume="cushion" data-amount="0.4" data-lift="0.02"><rect x="55" y="226" width="30" height="36" rx="2"/></g>
</svg>`,
  },
  car: {
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
  van: {
    name: 'Fourgon',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 195">
  <g data-name="Carrosserie" fill="#e8e8ea" data-volume="cylinder" data-amount="0.4" data-axis="90"><path d="M20 160 L20 30 Q20 20 30 20 L250 20 Q262 20 270 28 L330 95 L372 105 Q385 108 385 125 L385 160 Z"/></g>
  <g data-name="Vitres" fill="#a9d4ef" data-volume="cushion" data-amount="0.4" data-lift="0.02"><path d="M258 32 L265 32 L318 95 L258 95 Z"/><rect x="190" y="32" width="54" height="56" rx="4"/></g>
  <g data-name="Phares" fill="#ffe9a0" data-volume="dome" data-lift="0.03"><ellipse cx="376" cy="118" rx="8" ry="6"/></g>
  <g data-name="Pare-chocs" fill="#8a8f99" data-volume="cylinder" data-amount="0.8" data-axis="90" data-lift="0.03"><rect x="358" y="150" width="34" height="12" rx="5"/><rect x="12" y="150" width="28" height="12" rx="5"/></g>
  <g data-name="Pneus" fill="#22222a" data-volume="cushion" data-amount="0.9" data-lift="0.05"><circle cx="90" cy="162" r="30"/><circle cx="310" cy="162" r="30"/></g>
  <g data-name="Jantes" fill="#d5d8de" data-volume="cone" data-amount="0.35" data-lift="0.07"><circle cx="90" cy="162" r="14"/><circle cx="310" cy="162" r="14"/></g>
</svg>`,
  },
  truck: {
    name: 'Camion',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 205">
  <g data-name="Châssis" fill="#3a3a42" data-volume="cylinder" data-amount="0.6" data-axis="90"><rect x="15" y="150" width="410" height="16" rx="3"/></g>
  <g data-name="Benne" fill="#d5d8de" data-volume="cushion" data-amount="0.3" data-lift="0.01"><rect x="15" y="20" width="275" height="134" rx="4"/></g>
  <g data-name="Cabine" fill="#c0392b" data-volume="cylinder" data-amount="0.4" data-axis="90" data-lift="0.01"><path d="M300 162 L300 40 Q300 30 310 30 L360 30 Q372 30 380 45 L415 100 Q425 105 425 120 L425 162 Z"/></g>
  <g data-name="Vitres" fill="#a9d4ef" data-volume="cushion" data-amount="0.4" data-lift="0.03"><path d="M318 44 L360 44 L390 95 L318 95 Z"/></g>
  <g data-name="Phares" fill="#ffe9a0" data-volume="dome" data-lift="0.03"><circle cx="417" cy="125" r="6"/></g>
  <g data-name="Pneus" fill="#22222a" data-volume="cushion" data-amount="0.9" data-lift="0.05"><circle cx="70" cy="170" r="28"/><circle cx="130" cy="170" r="28"/><circle cx="360" cy="170" r="28"/></g>
  <g data-name="Jantes" fill="#d5d8de" data-volume="cone" data-amount="0.35" data-lift="0.07"><circle cx="70" cy="170" r="13"/><circle cx="130" cy="170" r="13"/><circle cx="360" cy="170" r="13"/></g>
</svg>`,
  },
  moto: {
    name: 'Moto',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 195">
  <g data-name="Pneus" fill="#22222a" data-volume="cushion" data-amount="0.9" data-lift="0.05"><circle cx="60" cy="148" r="44"/><circle cx="240" cy="148" r="44"/></g>
  <g data-name="Jantes" fill="#d5d8de" data-volume="cone" data-amount="0.35" data-lift="0.07"><circle cx="60" cy="148" r="20"/><circle cx="240" cy="148" r="20"/></g>
  <g data-name="Cadre" fill="#c0392b" data-volume="cylinder" data-amount="0.6" data-axis="90" data-lift="0.02"><path d="M60 148 L120 96 L190 96 L240 148 L228 153 L184 111 L126 111 L72 155 Z"/></g>
  <g data-name="Réservoir" fill="#c0392b" data-volume="dome" data-amount="0.5" data-lift="0.04"><ellipse cx="152" cy="86" rx="40" ry="18"/></g>
  <g data-name="Selle" fill="#26262c" data-volume="cushion" data-amount="0.5" data-lift="0.05"><path d="M92 82 Q118 70 134 78 L130 92 L96 92 Z"/></g>
  <g data-name="Guidon" fill="#3a3a42" data-volume="cylinder" data-amount="0.5" data-lift="0.05"><path d="M200 98 L215 56 L236 50 L238 57 L221 62 L209 100 Z"/></g>
  <g data-name="Phare" fill="#ffe9a0" data-volume="dome" data-lift="0.06"><circle cx="228" cy="76" r="8"/></g>
</svg>`,
  },
  scooter: {
    name: 'Scooter',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 190">
  <g data-name="Pneus" fill="#22222a" data-volume="cushion" data-amount="0.9" data-lift="0.05"><circle cx="60" cy="155" r="30"/><circle cx="225" cy="155" r="30"/></g>
  <g data-name="Jantes" fill="#d5d8de" data-volume="cone" data-amount="0.35" data-lift="0.07"><circle cx="60" cy="155" r="12"/><circle cx="225" cy="155" r="12"/></g>
  <g data-name="Carénage" fill="#4aa3c9" data-volume="cushion" data-amount="0.4" data-lift="0.02"><path d="M50 150 L76 102 Q88 86 120 86 L170 86 L188 40 L204 40 L200 92 Q222 122 232 150 Z"/></g>
  <g data-name="Selle" fill="#26262c" data-volume="cushion" data-amount="0.5" data-lift="0.04"><path d="M74 84 Q100 70 142 78 L142 92 L80 94 Z"/></g>
  <g data-name="Guidon" fill="#3a3a42" data-volume="cylinder" data-amount="0.6" data-axis="90" data-lift="0.04"><rect x="178" y="30" width="44" height="9" rx="4"/></g>
  <g data-name="Phare" fill="#ffe9a0" data-volume="dome" data-lift="0.05"><circle cx="207" cy="56" r="7"/></g>
</svg>`,
  },
  trafficlight: {
    name: 'Feu tricolore',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 300">
  <g data-name="Poteau" fill="#3a3a42" data-volume="cylinder" data-amount="0.6" data-axis="0"><rect x="52" y="150" width="16" height="150"/></g>
  <g data-name="Boîtier" fill="#26262c" data-volume="cushion" data-amount="0.4" data-lift="0.02"><rect x="20" y="10" width="80" height="170" rx="14"/></g>
  <g data-name="Feu rouge" fill="#e0443c" data-volume="dome" data-amount="0.6" data-lift="0.04"><circle cx="60" cy="45" r="20"/></g>
  <g data-name="Feu orange" fill="#f5a623" data-volume="dome" data-amount="0.6" data-lift="0.04"><circle cx="60" cy="95" r="20"/></g>
  <g data-name="Feu vert" fill="#3fae5a" data-volume="dome" data-amount="0.6" data-lift="0.04"><circle cx="60" cy="145" r="20"/></g>
</svg>`,
  },
  signround: {
    name: 'Panneau rond',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300">
  <g data-name="Poteau" fill="#8a8f99" data-volume="cylinder" data-amount="0.6" data-axis="0"><rect x="72" y="140" width="16" height="160"/></g>
  <g data-name="Liseré" fill="#e0443c" data-volume="cushion" data-amount="0.3" data-lift="0.02"><circle cx="80" cy="80" r="70"/></g>
  <g data-name="Plaque" fill="#ffffff" data-volume="cushion" data-amount="0.2" data-lift="0.03"><circle cx="80" cy="80" r="52"/></g>
</svg>`,
  },
  signsquare: {
    name: 'Panneau carré',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300">
  <g data-name="Poteau" fill="#8a8f99" data-volume="cylinder" data-amount="0.6" data-axis="0"><rect x="72" y="140" width="16" height="160"/></g>
  <g data-name="Liseré" fill="#ffffff" data-volume="cushion" data-amount="0.3" data-lift="0.02"><rect x="10" y="10" width="140" height="140" rx="14"/></g>
  <g data-name="Plaque" fill="#2f6fb5" data-volume="cushion" data-amount="0.2" data-lift="0.03"><rect x="22" y="22" width="116" height="116" rx="8"/></g>
</svg>`,
  },
  signhex: {
    name: 'Panneau hexagonal',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300">
  <g data-name="Poteau" fill="#8a8f99" data-volume="cylinder" data-amount="0.6" data-axis="0"><rect x="72" y="140" width="16" height="160"/></g>
  <g data-name="Liseré" fill="#ffffff" data-volume="cushion" data-amount="0.3" data-lift="0.02"><polygon points="144.1,117 80,154 15.9,117 15.9,43 80,6 144.1,43"/></g>
  <g data-name="Plaque" fill="#e0443c" data-volume="cushion" data-amount="0.2" data-lift="0.03"><polygon points="133.7,111 80,142 26.3,111 26.3,49 80,18 133.7,49"/></g>
</svg>`,
  },
  signtriangle: {
    name: 'Panneau triangle',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300">
  <g data-name="Poteau" fill="#8a8f99" data-volume="cylinder" data-amount="0.6" data-axis="0"><rect x="72" y="120" width="16" height="180"/></g>
  <g data-name="Liseré" fill="#e0443c" data-volume="cushion" data-amount="0.3" data-lift="0.02"><polygon points="80,8 152,134 8,134"/></g>
  <g data-name="Plaque" fill="#ffffff" data-volume="cushion" data-amount="0.2" data-lift="0.03"><polygon points="80,40 126,118 34,118"/></g>
</svg>`,
  },
  signyield: {
    name: 'Triangle inversé',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300">
  <g data-name="Poteau" fill="#8a8f99" data-volume="cylinder" data-amount="0.6" data-axis="0"><rect x="72" y="120" width="16" height="180"/></g>
  <g data-name="Liseré" fill="#e0443c" data-volume="cushion" data-amount="0.3" data-lift="0.02"><polygon points="8,14 152,14 80,140"/></g>
  <g data-name="Plaque" fill="#ffffff" data-volume="cushion" data-amount="0.2" data-lift="0.03"><polygon points="36,30 124,30 80,108"/></g>
</svg>`,
  },
  road: {
    name: 'Route',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 160">
  <g data-name="Chaussée" fill="#4a4d57" data-volume="cushion" data-amount="0.2"><rect x="0" y="18" width="400" height="124"/></g>
  <g data-name="Bordures" fill="#c9c3b6" data-volume="cylinder" data-amount="0.6" data-axis="90" data-lift="0.02"><rect x="0" y="10" width="400" height="12"/><rect x="0" y="138" width="400" height="12"/></g>
  <g data-name="Marquage" fill="#ffffff" data-volume="cushion" data-amount="0.2" data-lift="0.01"><rect x="20" y="76" width="50" height="8" rx="2"/><rect x="100" y="76" width="50" height="8" rx="2"/><rect x="180" y="76" width="50" height="8" rx="2"/><rect x="260" y="76" width="50" height="8" rx="2"/><rect x="340" y="76" width="50" height="8" rx="2"/></g>
</svg>`,
  },
  bin: {
    name: 'Poubelle',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 240">
  <g data-name="Cuve" fill="#3f8f4a" data-volume="cylinder" data-amount="0.5" data-axis="0"><path d="M25 50 L135 50 L125 238 L35 238 Z"/></g>
  <g data-name="Couvercle" fill="#2f6b45" data-volume="cylinder" data-amount="0.5" data-axis="90" data-lift="0.02"><rect x="15" y="30" width="130" height="24" rx="8"/><rect x="60" y="14" width="40" height="20" rx="6"/></g>
</svg>`,
  },
  bench: {
    name: 'Banc',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 160">
  <g data-name="Pieds" fill="#3a3a42" data-volume="cylinder" data-amount="0.6" data-axis="0"><rect x="40" y="60" width="14" height="100"/><rect x="246" y="60" width="14" height="100"/></g>
  <g data-name="Dossier" fill="#a0703f" data-volume="cylinder" data-amount="0.5" data-axis="90" data-lift="0.02"><rect x="20" y="10" width="260" height="18" rx="6"/><rect x="20" y="36" width="260" height="18" rx="6"/></g>
  <g data-name="Assise" fill="#a0703f" data-volume="cylinder" data-amount="0.5" data-axis="90" data-lift="0.03"><rect x="10" y="80" width="280" height="22" rx="6"/></g>
</svg>`,
  },
  guitar: {
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
};
