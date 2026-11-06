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
  stage: {
    name: 'Scène',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 220">
  <g data-name="Plancher" fill="#5a3d2b" data-volume="cushion" data-amount="0.3"><rect x="10" y="150" width="380" height="40"/></g>
  <g data-name="Jupe" fill="#26262c" data-volume="cushion" data-amount="0.2"><rect x="10" y="186" width="380" height="32"/></g>
  <g data-name="Rideaux" fill="#a3202e" data-volume="cylinder" data-amount="0.5" data-axis="0" data-lift="0.01"><path d="M10 10 L80 10 Q60 80 75 150 L10 150 Z"/><path d="M390 10 L320 10 Q340 80 325 150 L390 150 Z"/></g>
  <g data-name="Lambrequin" fill="#8a1a26" data-volume="cylinder" data-amount="0.5" data-axis="90" data-lift="0.02"><path d="M10 0 L390 0 L390 22 Q350 36 300 24 Q250 36 200 24 Q150 36 100 24 Q50 36 10 22 Z"/></g>
</svg>`,
  },
  spotlight: {
    name: 'Projecteur',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 245">
  <g data-name="Pied" fill="#3a3a42" data-volume="cylinder" data-amount="0.6" data-axis="0"><rect x="92" y="150" width="16" height="84"/><ellipse cx="100" cy="234" rx="50" ry="9"/></g>
  <g data-name="Lyre" fill="#26262c" data-volume="cushion" data-amount="0.4" data-lift="0.01"><path d="M38 60 L52 60 L52 150 L148 150 L148 60 L162 60 L162 164 L38 164 Z"/></g>
  <g data-name="Corps" fill="#2b2b33" data-volume="dome" data-amount="0.3" data-lift="0.02"><circle cx="100" cy="95" r="56"/></g>
  <g data-name="Lentille" fill="#fff2a8" data-volume="dome" data-amount="0.6" data-lift="0.04"><circle cx="100" cy="95" r="36"/></g>
</svg>`,
  },
  mic: {
    name: 'Micro',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 245">
  <g data-name="Corps" fill="#26262c" data-volume="cylinder" data-amount="0.6" data-axis="0" data-lift="0.01"><path d="M30 108 L90 108 L74 244 L46 244 Z"/></g>
  <g data-name="Grille" fill="#b9bcc4" data-volume="dome" data-amount="0.6" data-lift="0.02"><path d="M20 55 A40 40 0 0 1 100 55 L100 95 Q100 110 60 110 Q20 110 20 95 Z"/></g>
  <g data-name="Bague" fill="#3a3a42" data-volume="cylinder" data-amount="0.6" data-axis="90" data-lift="0.03"><rect x="22" y="100" width="76" height="14" rx="4"/></g>
</svg>`,
  },
  vinyl: {
    name: 'Vinyle',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
  <g data-name="Disque" fill="#1d1d22" data-volume="cushion" data-amount="0.2"><circle cx="120" cy="120" r="116"/></g>
  <g data-name="Étiquette" fill="#e0443c" data-volume="cushion" data-amount="0.2" data-lift="0.01"><circle cx="120" cy="120" r="40"/></g>
  <g data-name="Trou" fill="#f4f1ea" data-lift="0.02"><circle cx="120" cy="120" r="6"/></g>
</svg>`,
  },
  speaker: {
    name: 'Enceinte',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 280">
  <g data-name="Caisson" fill="#2b2b33" data-volume="cushion" data-amount="0.3"><rect x="10" y="10" width="160" height="260" rx="10"/></g>
  <g data-name="Haut-parleurs" fill="#3a3a42" data-volume="cone" data-amount="0.35" data-lift="0.02"><circle cx="90" cy="62" r="26"/><circle cx="90" cy="178" r="64"/></g>
  <g data-name="Dômes" fill="#8a8f99" data-volume="dome" data-amount="0.7" data-lift="0.04"><circle cx="90" cy="62" r="9"/><circle cx="90" cy="178" r="20"/></g>
</svg>`,
  },
  telecaster: {
    name: 'Telecaster',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 440">
  <g data-name="Corps" fill="#e8c56a" data-volume="dome" data-amount="0.3"><path d="M58 288 L88 280 L108 290 L112 300 Q138 312 142 345 L142 400 Q140 432 105 432 L60 432 Q20 432 18 400 L18 340 Q20 300 40 296 Z"/></g>
  <g data-name="Plaque" fill="#f4f1ea" data-volume="cushion" data-amount="0.3" data-lift="0.01"><path d="M48 312 L95 302 L100 382 L60 396 Z"/></g>
  <g data-name="Manche" fill="#e3b77a" data-volume="cylinder" data-amount="0.4" data-axis="0" data-lift="0.02"><rect x="70" y="38" width="20" height="262"/><path d="M70 40 L66 0 L100 0 L104 12 L90 40 Z"/></g>
  <g data-name="Micros" fill="#26262c" data-volume="cushion" data-amount="0.6" data-lift="0.03"><rect x="60" y="332" width="40" height="10" rx="2"/><rect x="62" y="388" width="36" height="9" rx="2"/></g>
  <g data-name="Chevalet" fill="#b9bcc4" data-volume="cylinder" data-amount="0.6" data-axis="90" data-lift="0.03"><rect x="54" y="402" width="52" height="12" rx="2"/></g>
</svg>`,
  },
  stratocaster: {
    name: 'Stratocaster',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 440">
  <g data-name="Corps" fill="#3f8fd0" data-volume="dome" data-amount="0.3"><path d="M80 290 C60 290 52 270 40 262 C30 258 28 280 32 300 C36 320 20 330 18 360 C14 410 50 432 80 432 C110 432 146 410 142 360 C140 330 124 320 128 300 C130 285 125 255 115 262 C105 270 100 290 80 290 Z"/></g>
  <g data-name="Plaque" fill="#f4f1ea" data-volume="cushion" data-amount="0.3" data-lift="0.01"><path d="M44 300 Q70 296 100 300 L118 330 L112 400 L60 404 L40 360 Z"/></g>
  <g data-name="Manche" fill="#e3b77a" data-volume="cylinder" data-amount="0.4" data-axis="0" data-lift="0.02"><rect x="70" y="38" width="20" height="262"/><path d="M70 40 L64 2 Q74 -2 84 6 L104 30 L90 40 Z"/></g>
  <g data-name="Micros" fill="#26262c" data-volume="cushion" data-amount="0.6" data-lift="0.03"><rect x="60" y="318" width="40" height="9" rx="2"/><rect x="60" y="348" width="40" height="9" rx="2"/><rect x="60" y="378" width="40" height="9" rx="2"/></g>
  <g data-name="Chevalet" fill="#b9bcc4" data-volume="cylinder" data-amount="0.6" data-axis="90" data-lift="0.03"><rect x="56" y="402" width="48" height="11" rx="2"/></g>
</svg>`,
  },
  lespaul: {
    name: 'Les Paul',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 440">
  <g data-name="Corps" fill="#b5652a" data-volume="dome" data-amount="0.3"><path d="M80 280 C50 280 30 300 30 330 C30 350 20 360 20 385 C20 420 50 434 80 434 C112 434 142 420 142 385 C142 360 132 352 132 335 C132 322 122 316 112 300 C106 288 96 280 80 280 Z"/></g>
  <g data-name="Manche" fill="#e3b77a" data-volume="cylinder" data-amount="0.4" data-axis="0" data-lift="0.02"><rect x="70" y="38" width="20" height="262"/><path d="M68 40 L62 4 Q80 -2 98 4 L92 40 Z"/></g>
  <g data-name="Micros" fill="#26262c" data-volume="cushion" data-amount="0.6" data-lift="0.03"><rect x="58" y="322" width="44" height="12" rx="3"/><rect x="58" y="368" width="44" height="12" rx="3"/></g>
  <g data-name="Chevalet" fill="#b9bcc4" data-volume="cylinder" data-amount="0.6" data-axis="90" data-lift="0.03"><rect x="56" y="396" width="48" height="10" rx="2"/><rect x="60" y="410" width="40" height="8" rx="2"/></g>
</svg>`,
  },
  bass: {
    name: 'Basse',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 480">
  <g data-name="Corps" fill="#2b2b33" data-volume="dome" data-amount="0.3"><path d="M80 330 C60 330 52 310 40 302 C30 298 28 320 32 340 C36 360 20 370 18 400 C14 450 50 472 80 472 C110 472 146 450 142 400 C140 370 124 360 128 340 C130 325 125 295 115 302 C105 310 100 330 80 330 Z"/></g>
  <g data-name="Plaque" fill="#f4f1ea" data-volume="cushion" data-amount="0.3" data-lift="0.01"><path d="M44 340 Q70 336 100 340 L118 370 L112 440 L60 444 L40 400 Z"/></g>
  <g data-name="Manche" fill="#e3b77a" data-volume="cylinder" data-amount="0.4" data-axis="0" data-lift="0.02"><rect x="70" y="38" width="20" height="302"/><path d="M70 40 L62 2 Q76 -2 90 4 L100 40 Z"/></g>
  <g data-name="Micros" fill="#26262c" data-volume="cushion" data-amount="0.6" data-lift="0.03"><rect x="56" y="372" width="48" height="12" rx="3"/><rect x="60" y="410" width="40" height="11" rx="3"/></g>
  <g data-name="Chevalet" fill="#b9bcc4" data-volume="cylinder" data-amount="0.6" data-axis="90" data-lift="0.03"><rect x="54" y="446" width="52" height="12" rx="2"/></g>
</svg>`,
  },
  doublebass: {
    name: 'Contrebasse',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 500">
  <g data-name="Caisse" fill="#8a4b22" data-volume="dome" data-amount="0.3"><path d="M110 170 C70 170 50 190 55 225 C58 245 40 255 40 290 C38 330 30 360 30 400 C30 460 70 490 110 490 C150 490 190 460 190 400 C190 360 182 330 180 290 C180 255 162 245 165 225 C170 190 150 170 110 170 Z"/></g>
  <g data-name="Ouïes" fill="#2b1a0f" data-lift="0.01"><ellipse cx="78" cy="330" rx="5" ry="32"/><ellipse cx="142" cy="330" rx="5" ry="32"/></g>
  <g data-name="Manche" fill="#5a3418" data-volume="dome" data-amount="0.5" data-lift="0.02"><circle cx="110" cy="26" r="16"/><rect x="102" y="26" width="16" height="40"/></g>
  <g data-name="Touche" fill="#1d1d22" data-volume="cylinder" data-amount="0.5" data-axis="0" data-lift="0.03"><rect x="102" y="60" width="16" height="340" rx="3"/></g>
  <g data-name="Cordier" fill="#1d1d22" data-volume="cushion" data-amount="0.5" data-lift="0.03"><path d="M98 400 L122 400 L117 462 L103 462 Z"/></g>
  <g data-name="Pique" fill="#8a8f99" data-lift="0.01"><rect x="107" y="486" width="6" height="14"/></g>
</svg>`,
  },
  drums: {
    name: 'Batterie',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 262">
  <g data-name="Pieds" fill="#8a8f99" data-volume="cylinder" data-amount="0.6" data-axis="0"><rect x="48" y="60" width="4" height="150"/><rect x="318" y="40" width="4" height="170"/></g>
  <g data-name="Grosse caisse" fill="#c0392b" data-volume="dome" data-amount="0.25" data-lift="0.01"><circle cx="180" cy="176" r="82"/></g>
  <g data-name="Peau" fill="#f4f1ea" data-volume="cushion" data-amount="0.2" data-lift="0.02"><circle cx="180" cy="176" r="66"/></g>
  <g data-name="Toms" fill="#c0392b" data-volume="cylinder" data-amount="0.5" data-axis="90" data-lift="0.03"><rect x="85" y="58" width="70" height="50" rx="10"/><rect x="205" y="58" width="70" height="50" rx="10"/><rect x="20" y="150" width="80" height="40" rx="6"/><rect x="270" y="140" width="70" height="74" rx="8"/></g>
  <g data-name="Cymbales" fill="#e3b341" data-volume="cone" data-amount="0.2" data-lift="0.05"><ellipse cx="50" cy="60" rx="50" ry="8"/><ellipse cx="320" cy="40" rx="50" ry="8"/></g>
</svg>`,
  },
  cymbal: {
    name: 'Cymbale',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 130">
  <g data-name="Tige" fill="#8a8f99" data-volume="cylinder" data-amount="0.6" data-axis="0"><rect x="117" y="48" width="6" height="82"/></g>
  <g data-name="Cymbale" fill="#e3b341" data-volume="cone" data-amount="0.3" data-lift="0.01"><ellipse cx="120" cy="50" rx="115" ry="22"/></g>
  <g data-name="Cloche" fill="#d4a32e" data-volume="dome" data-amount="0.6" data-lift="0.03"><ellipse cx="120" cy="42" rx="26" ry="12"/></g>
</svg>`,
  },
  piano: {
    name: 'Piano',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 252">
  <g data-name="Pieds" fill="#2b1a0f" data-volume="cylinder" data-amount="0.6" data-axis="0"><rect x="30" y="170" width="20" height="80"/><rect x="310" y="170" width="20" height="80"/></g>
  <g data-name="Caisse" fill="#2b1a0f" data-volume="cushion" data-amount="0.3" data-lift="0.01"><rect x="20" y="10" width="320" height="170" rx="6"/></g>
  <g data-name="Pupitre" fill="#3a2414" data-volume="cushion" data-amount="0.4" data-lift="0.02"><rect x="100" y="40" width="160" height="40" rx="3"/></g>
  <g data-name="Touches blanches" fill="#f4f1ea" data-volume="cushion" data-amount="0.2" data-lift="0.02"><rect x="30" y="120" width="300" height="50" rx="2"/></g>
  <g data-name="Touches noires" fill="#1d1d22" data-volume="cushion" data-amount="0.5" data-lift="0.04"><rect x="39.7143" y="120" width="9.14286" height="30" rx="1"/><rect x="54" y="120" width="9.14286" height="30" rx="1"/><rect x="82.5714" y="120" width="9.14286" height="30" rx="1"/><rect x="96.8571" y="120" width="9.14286" height="30" rx="1"/><rect x="111.143" y="120" width="9.14286" height="30" rx="1"/><rect x="139.714" y="120" width="9.14286" height="30" rx="1"/><rect x="154" y="120" width="9.14286" height="30" rx="1"/><rect x="182.571" y="120" width="9.14286" height="30" rx="1"/><rect x="196.857" y="120" width="9.14286" height="30" rx="1"/><rect x="211.143" y="120" width="9.14286" height="30" rx="1"/><rect x="239.714" y="120" width="9.14286" height="30" rx="1"/><rect x="254" y="120" width="9.14286" height="30" rx="1"/><rect x="282.571" y="120" width="9.14286" height="30" rx="1"/><rect x="296.857" y="120" width="9.14286" height="30" rx="1"/><rect x="311.143" y="120" width="9.14286" height="30" rx="1"/></g>
</svg>`,
  },
  synth: {
    name: 'Synthé',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 160">
  <g data-name="Boîtier" fill="#3a3a42" data-volume="cushion" data-amount="0.3"><rect x="0" y="20" width="400" height="130" rx="10"/></g>
  <g data-name="Panneau" fill="#26262c" data-volume="cushion" data-amount="0.2" data-lift="0.01"><rect x="10" y="30" width="380" height="45" rx="4"/></g>
  <g data-name="Boutons" fill="#e3b341" data-volume="dome" data-amount="0.7" data-lift="0.03"><circle cx="40" cy="52" r="9"/><circle cx="80" cy="52" r="9"/><circle cx="120" cy="52" r="9"/><circle cx="160" cy="52" r="9"/><circle cx="200" cy="52" r="9"/><circle cx="240" cy="52" r="9"/><circle cx="280" cy="52" r="9"/><circle cx="320" cy="52" r="9"/><circle cx="360" cy="52" r="9"/></g>
  <g data-name="Touches blanches" fill="#f4f1ea" data-volume="cushion" data-amount="0.2" data-lift="0.02"><rect x="20" y="85" width="360" height="55" rx="2"/></g>
  <g data-name="Touches noires" fill="#1d1d22" data-volume="cushion" data-amount="0.5" data-lift="0.04"><rect x="28.4414" y="85" width="7.94483" height="33" rx="1"/><rect x="40.8552" y="85" width="7.94483" height="33" rx="1"/><rect x="65.6828" y="85" width="7.94483" height="33" rx="1"/><rect x="78.0966" y="85" width="7.94483" height="33" rx="1"/><rect x="90.5103" y="85" width="7.94483" height="33" rx="1"/><rect x="115.338" y="85" width="7.94483" height="33" rx="1"/><rect x="127.752" y="85" width="7.94483" height="33" rx="1"/><rect x="152.579" y="85" width="7.94483" height="33" rx="1"/><rect x="164.993" y="85" width="7.94483" height="33" rx="1"/><rect x="177.407" y="85" width="7.94483" height="33" rx="1"/><rect x="202.234" y="85" width="7.94483" height="33" rx="1"/><rect x="214.648" y="85" width="7.94483" height="33" rx="1"/><rect x="239.476" y="85" width="7.94483" height="33" rx="1"/><rect x="251.89" y="85" width="7.94483" height="33" rx="1"/><rect x="264.303" y="85" width="7.94483" height="33" rx="1"/><rect x="289.131" y="85" width="7.94483" height="33" rx="1"/><rect x="301.545" y="85" width="7.94483" height="33" rx="1"/><rect x="326.372" y="85" width="7.94483" height="33" rx="1"/><rect x="338.786" y="85" width="7.94483" height="33" rx="1"/><rect x="351.2" y="85" width="7.94483" height="33" rx="1"/></g>
</svg>`,
  },
  ticket: {
    name: 'Billet',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 150">
  <g data-name="Billet" fill="#f2c14e" data-volume="cushion" data-amount="0.3"><path d="M0 10 Q0 0 10 0 L240 0 L240 150 L10 150 Q0 150 0 140 L0 95 A20 20 0 0 0 0 55 Z"/></g>
  <g data-name="Talon" fill="#e0443c" data-volume="cushion" data-amount="0.3" data-lift="0.01"><path d="M244 0 L310 0 Q320 0 320 10 L320 55 A20 20 0 0 0 320 95 L320 140 Q320 150 310 150 L244 150 Z"/></g>
</svg>`,
  },
  banner: {
    name: 'Ruban',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 140">
  <g data-name="Pans" fill="#a3202e" data-volume="cylinder" data-amount="0.4" data-axis="90"><path d="M10 50 L80 50 L80 110 L10 110 L35 80 Z"/><path d="M390 50 L320 50 L320 110 L390 110 L365 80 Z"/></g>
  <g data-name="Plis" fill="#6b1219" data-lift="0.01"><path d="M60 80 L80 80 L80 110 Z"/><path d="M340 80 L320 80 L320 110 Z"/></g>
  <g data-name="Centre" fill="#e0443c" data-volume="cylinder" data-amount="0.4" data-axis="90" data-lift="0.02"><rect x="60" y="20" width="280" height="60"/></g>
</svg>`,
  },
  balloon: {
    name: 'Ballon',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300">
  <g data-name="Ficelle" fill="#8a8f99"><path d="M79 176 Q70 220 84 260 Q90 280 80 300 L83 300 Q93 280 87 260 Q73 220 82 176 Z"/></g>
  <g data-name="Ballon" fill="#e0443c" data-volume="dome" data-amount="0.6" data-lift="0.02"><ellipse cx="80" cy="85" rx="70" ry="82"/></g>
  <g data-name="Nœud" fill="#a3202e" data-volume="dome" data-amount="0.5" data-lift="0.03"><polygon points="70,180 90,180 80,164"/></g>
</svg>`,
  },
  pennant: {
    name: 'Fanion',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 160">
  <g data-name="Mât" fill="#7a5230" data-volume="cylinder" data-amount="0.6" data-axis="0"><rect x="8" y="0" width="12" height="160" rx="3"/></g>
  <g data-name="Fanion" fill="#3f8fd0" data-volume="cushion" data-amount="0.3" data-lift="0.01"><polygon points="20,10 290,80 20,150"/></g>
  <g data-name="Bande" fill="#f4f1ea" data-volume="cushion" data-amount="0.2" data-lift="0.02"><polygon points="20,62 180,66 180,94 20,98"/></g>
</svg>`,
  },
};
