/**
 * Polices de la configuration globale : celles livrées avec l'application, celles installées
 * par les administrateurs, et pour chacune son usage (compositions, style graphique des activités).
 */

/** Familles de polices, pour ranger la liste. */
export const FONT_KINDS = ['sans', 'serif', 'affiche', 'manuscrite', 'mono'] as const;
export type FontKind = (typeof FONT_KINDS)[number];
export const FONT_KIND_LABELS: Record<FontKind, string> = { sans: 'Sans empattement', serif: 'Avec empattement', affiche: 'Affiche', manuscrite: 'Manuscrite', mono: 'Chasse fixe' };

/** Usages qu'un administrateur peut couper pour une police. */
export interface FontUse {
  /** Proposée pour les textes des compositions. */
  compositions?: boolean;
  /** Proposée pour le style graphique des activités. */
  branding?: boolean;
}
export type FontUses = Record<string, FontUse>;

/** Une police est utilisable tant que son usage n'a pas été coupé. */
export const fontAllowed = (uses: FontUses | undefined, id: string, use: keyof FontUse) => uses?.[id]?.[use] !== false;

/** Ne garde que les usages coupés (le reste est permis d'office). */
export function cleanFontUses(raw: unknown): FontUses {
  const out: FontUses = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 400)) {
    const id = k.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
    const u = (v ?? {}) as Record<string, unknown>;
    const use: FontUse = { ...(u.compositions === false ? { compositions: false } : {}), ...(u.branding === false ? { branding: false } : {}) };
    if (id && Object.keys(use).length) out[id] = use;
  }
  return out;
}

/** Une police libre du dépôt google/fonts, installable d'une touche. */
export interface FreeFont {
  /** Dossier dans google/fonts (licence/nom). */
  dir: string;
  family: string;
  kind: FontKind;
}

/**
 * Polices libres installables (licences OFL ou Apache vérifiées dans leur METADATA.pb, alphabet latin).
 * L'installation copie les fichiers et la licence sur le serveur : l'application les sert elle-même.
 */
export const FREE_FONTS: FreeFont[] = (
  [
    ['ofl/montserrat', 'Montserrat', 'sans'],
    ['ofl/poppins', 'Poppins', 'sans'],
    ['ofl/raleway', 'Raleway', 'sans'],
    ['ofl/worksans', 'Work Sans', 'sans'],
    ['ofl/dmsans', 'DM Sans', 'sans'],
    ['ofl/manrope', 'Manrope', 'sans'],
    ['ofl/nunito', 'Nunito', 'sans'],
    ['ofl/outfit', 'Outfit', 'sans'],
    ['ofl/sora', 'Sora', 'sans'],
    ['ofl/spacegrotesk', 'Space Grotesk', 'sans'],
    ['ofl/ibmplexsans', 'IBM Plex Sans', 'sans'],
    ['ofl/lexend', 'Lexend', 'sans'],
    ['ofl/archivo', 'Archivo', 'sans'],
    ['ofl/barlow', 'Barlow', 'sans'],
    ['ofl/barlowcondensed', 'Barlow Condensed', 'sans'],
    ['ofl/josefinsans', 'Josefin Sans', 'sans'],
    ['ofl/quicksand', 'Quicksand', 'sans'],
    ['ofl/comfortaa', 'Comfortaa', 'affiche'],
    ['ofl/mulish', 'Mulish', 'sans'],
    ['ofl/karla', 'Karla', 'sans'],
    ['ofl/firasans', 'Fira Sans', 'sans'],
    ['ofl/sourcesans3', 'Source Sans 3', 'sans'],
    ['ofl/opensans', 'Open Sans', 'sans'],
    ['ofl/lato', 'Lato', 'sans'],
    ['ofl/figtree', 'Figtree', 'sans'],
    ['ofl/plusjakartasans', 'Plus Jakarta Sans', 'sans'],
    ['ofl/urbanist', 'Urbanist', 'sans'],
    ['ofl/redhatdisplay', 'Red Hat Display', 'sans'],
    ['ofl/kanit', 'Kanit', 'sans'],
    ['ofl/chakrapetch', 'Chakra Petch', 'sans'],
    ['ofl/roboto', 'Roboto', 'sans'],
    ['ofl/lora', 'Lora', 'serif'],
    ['ofl/merriweather', 'Merriweather', 'serif'],
    ['ofl/librebaskerville', 'Libre Baskerville', 'serif'],
    ['ofl/ebgaramond', 'EB Garamond', 'serif'],
    ['ofl/cormorantgaramond', 'Cormorant Garamond', 'serif'],
    ['ofl/crimsonpro', 'Crimson Pro', 'serif'],
    ['ofl/dmserifdisplay', 'DM Serif Display', 'serif'],
    ['ofl/bodonimoda', 'Bodoni Moda', 'serif'],
    ['ofl/cinzel', 'Cinzel', 'serif'],
    ['ofl/cinzeldecorative', 'Cinzel Decorative', 'affiche'],
    ['ofl/youngserif', 'Young Serif', 'serif'],
    ['ofl/gloock', 'Gloock', 'affiche'],
    ['apache/ultra', 'Ultra', 'serif'],
    ['ofl/alfaslabone', 'Alfa Slab One', 'affiche'],
    ['apache/robotoslab', 'Roboto Slab', 'serif'],
    ['ofl/zillaslab', 'Zilla Slab', 'serif'],
    ['ofl/arvo', 'Arvo', 'serif'],
    ['ofl/bitter', 'Bitter', 'serif'],
    ['ofl/spectral', 'Spectral', 'serif'],
    ['ofl/sourceserif4', 'Source Serif 4', 'serif'],
    ['ofl/prata', 'Prata', 'serif'],
    ['ofl/yesevaone', 'Yeseva One', 'affiche'],
    ['ofl/rozhaone', 'Rozha One', 'serif'],
    ['ofl/righteous', 'Righteous', 'affiche'],
    ['ofl/bowlbyone', 'Bowlby One', 'affiche'],
    ['apache/luckiestguy', 'Luckiest Guy', 'affiche'],
    ['ofl/titanone', 'Titan One', 'affiche'],
    ['ofl/fredoka', 'Fredoka', 'sans'],
    ['ofl/baloo2', 'Baloo 2', 'affiche'],
    ['apache/chewy', 'Chewy', 'affiche'],
    ['ofl/bungeeshade', 'Bungee Shade', 'affiche'],
    ['ofl/bungeeinline', 'Bungee Inline', 'affiche'],
    ['ofl/rubikmonoone', 'Rubik Mono One', 'sans'],
    ['ofl/archivoblack', 'Archivo Black', 'sans'],
    ['ofl/blackopsone', 'Black Ops One', 'affiche'],
    ['ofl/staatliches', 'Staatliches', 'affiche'],
    ['ofl/fjallaone', 'Fjalla One', 'sans'],
    ['ofl/passionone', 'Passion One', 'affiche'],
    ['ofl/lilitaone', 'Lilita One', 'affiche'],
    ['ofl/paytoneone', 'Paytone One', 'sans'],
    ['ofl/coiny', 'Coiny', 'affiche'],
    ['ofl/rampartone', 'Rampart One', 'affiche'],
    ['ofl/rubikglitch', 'Rubik Glitch', 'affiche'],
    ['ofl/rubikbeastly', 'Rubik Beastly', 'affiche'],
    ['ofl/rubikwetpaint', 'Rubik Wet Paint', 'affiche'],
    ['ofl/rubikdoodleshadow', 'Rubik Doodle Shadow', 'affiche'],
    ['ofl/sixcaps', 'Six Caps', 'sans'],
    ['ofl/poiretone', 'Poiret One', 'affiche'],
    ['ofl/limelight', 'Limelight', 'affiche'],
    ['ofl/fasterone', 'Faster One', 'affiche'],
    ['ofl/audiowide', 'Audiowide', 'affiche'],
    ['ofl/orbitron', 'Orbitron', 'sans'],
    ['ofl/pressstart2p', 'Press Start 2P', 'affiche'],
    ['ofl/vt323', 'VT323', 'mono'],
    ['ofl/silkscreen', 'Silkscreen', 'affiche'],
    ['apache/syncopate', 'Syncopate', 'sans'],
    ['ofl/megrim', 'Megrim', 'affiche'],
    ['ofl/notable', 'Notable', 'sans'],
    ['ofl/gravitasone', 'Gravitas One', 'affiche'],
    ['ofl/ewert', 'Ewert', 'affiche'],
    ['ofl/frijole', 'Frijole', 'affiche'],
    ['ofl/creepster', 'Creepster', 'affiche'],
    ['ofl/nosifer', 'Nosifer', 'affiche'],
    ['ofl/eater', 'Eater', 'affiche'],
    ['ofl/rye', 'Rye', 'affiche'],
    ['apache/smokum', 'Smokum', 'affiche'],
    ['ofl/sancreek', 'Sancreek', 'affiche'],
    ['ofl/diplomata', 'Diplomata', 'affiche'],
    ['ofl/kavoon', 'Kavoon', 'affiche'],
    ['ofl/sniglet', 'Sniglet', 'affiche'],
    ['ofl/bubblegumsans', 'Bubblegum Sans', 'affiche'],
    ['ofl/grandstander', 'Grandstander', 'affiche'],
    ['ofl/modak', 'Modak', 'affiche'],
    ['ofl/agbalumo', 'Agbalumo', 'affiche'],
    ['ofl/bungeespice', 'Bungee Spice', 'affiche'],
    ['ofl/climatecrisis', 'Climate Crisis', 'affiche'],
    ['ofl/delagothicone', 'Dela Gothic One', 'affiche'],
    ['ofl/bricolagegrotesque', 'Bricolage Grotesque', 'sans'],
    ['ofl/unbounded', 'Unbounded', 'sans'],
    ['ofl/dancingscript', 'Dancing Script', 'manuscrite'],
    ['ofl/greatvibes', 'Great Vibes', 'manuscrite'],
    ['apache/satisfy', 'Satisfy', 'manuscrite'],
    ['ofl/sacramento', 'Sacramento', 'manuscrite'],
    ['ofl/allura', 'Allura', 'manuscrite'],
    ['ofl/parisienne', 'Parisienne', 'manuscrite'],
    ['apache/yellowtail', 'Yellowtail', 'manuscrite'],
    ['ofl/kaushanscript', 'Kaushan Script', 'manuscrite'],
    ['ofl/amaticsc', 'Amatic SC', 'manuscrite'],
    ['ofl/indieflower', 'Indie Flower', 'manuscrite'],
    ['ofl/shadowsintolight', 'Shadows Into Light', 'manuscrite'],
    ['ofl/patrickhand', 'Patrick Hand', 'manuscrite'],
    ['ofl/gloriahallelujah', 'Gloria Hallelujah', 'manuscrite'],
    ['ofl/architectsdaughter', 'Architects Daughter', 'manuscrite'],
    ['apache/rocksalt', 'Rock Salt', 'manuscrite'],
    ['apache/homemadeapple', 'Homemade Apple', 'manuscrite'],
    ['ofl/reeniebeanie', 'Reenie Beanie', 'manuscrite'],
    ['apache/justanotherhand', 'Just Another Hand', 'manuscrite'],
    ['ofl/mrdafoe', 'Mr Dafoe', 'manuscrite'],
    ['ofl/cookie', 'Cookie', 'manuscrite'],
    ['ofl/courgette', 'Courgette', 'manuscrite'],
    ['ofl/damion', 'Damion', 'manuscrite'],
    ['ofl/merienda', 'Merienda', 'manuscrite'],
    ['ofl/pangolin', 'Pangolin', 'manuscrite'],
    ['ofl/gaegu', 'Gaegu', 'manuscrite'],
    ['apache/specialelite', 'Special Elite', 'affiche'],
    ['ofl/cutivemono', 'Cutive Mono', 'mono'],
    ['ofl/jetbrainsmono', 'JetBrains Mono', 'mono'],
    ['ofl/spacemono', 'Space Mono', 'mono'],
    ['ofl/ibmplexmono', 'IBM Plex Mono', 'mono'],
    ['ofl/dmmono', 'DM Mono', 'mono'],
    ['ofl/courierprime', 'Courier Prime', 'mono'],  ] as Array<[string, string, FontKind]>
).map(([dir, family, kind]) => ({ dir, family, kind }));

/** Identifiant de police tiré de son nom (« Bebas Neue » → bebas-neue). */
export const fontSlug = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
