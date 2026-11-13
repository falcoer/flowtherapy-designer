import { FORMATS, formatOf, uniformMargins, type Doc, type Guide, type Margins, type Target } from './model';
import { setFontUses } from './text';
import { DEFAULT_CATALOG, type Catalog, type MediaType } from '@ftd/core';
import { palettesOf, type ActivityProfile, type Channel, type ChannelPick, type Connection, type ColorRole, type Contact, type ContactKind, type Operation, type Palette, type PaletteColor } from './server';

/**
 * Cibles d'un document : un média (canal de l'activité), un format compatible, une variante de couleurs.
 * Les couleurs des objets pointent vers les guides du document ; changer de variante remplace la couleur
 * de chaque guide par celle du même rôle, et tous les supports suivent.
 */

/* ---------- catalogue du site : formats et types de diffusion ---------- */

let catalog: Catalog = DEFAULT_CATALOG;
/** Le catalogue en cours (celui du serveur une fois chargé). */
export const catalogNow = () => catalog;
/** Range le catalogue du serveur ; ses formats rejoignent la liste de l'atelier (ceux d'origine gardent leur place). */
export function setCatalog(c: Catalog) {
  catalog = c;
  setFontUses(c.fonts);
  for (const f of c.formats) {
    const i = FORMATS.findIndex((x) => x.id === f.id);
    if (i < 0) FORMATS.push(f);
    else FORMATS[i] = f;
  }
}
const mediaChannel = (m: MediaType): Channel => ({
  id: m.id,
  name: m.name,
  kind: m.kind,
  formats: [...m.formats],
  ...(m.margin !== undefined ? { margin: m.margin } : {}),
});
/** Ancienne marge d'un média (avant qu'elle n'appartienne au format). */
const channelMargins = (ch?: Channel) => ch?.margins ?? uniformMargins(ch?.margin ?? 0);
/**
 * Marge et zone d'intérêt d'une publication : les siennes si elle les a réglées,
 * sinon celles de son format (catalogue), sinon l'ancienne marge de son média.
 */
export function framesOf(t: Pick<Target, 'format' | 'margins' | 'zone'>, ch?: Channel): { margins: Margins; zone?: Margins } {
  if (t.margins) return { margins: t.margins, zone: t.zone };
  const f = formatOf(t.format);
  return { margins: f.margins ?? channelMargins(ch), zone: f.zone ?? ch?.zone };
}

/** Types de diffusion d'une activité qui n'a pas encore choisi : ceux cochés d'office par le catalogue. */
export const defaultPicks = (): ChannelPick[] => catalog.media.filter((m) => m.default).map((m) => ({ id: m.id }));

/**
 * Médias de l'activité : chaque type retenu prend ses formats, sa marge et sa zone dans le catalogue,
 * et garde les accès et la variante de l'activité. Un ancien média décrit en entier reste tel quel.
 * Une fiche sans choix enregistré : les types cochés d'office (supports imprimés). Sans fiche (hors ligne) : tout le catalogue.
 */
export function channelsOf(p?: ActivityProfile | null): Channel[] {
  const all = catalog.media.map((m) => ({ id: m.id }));
  const fallback = p ? defaultPicks() : all;
  const picks: ChannelPick[] = p?.channels?.length ? p.channels : fallback.length ? fallback : all;
  return picks.flatMap((c) => {
    const m = catalog.media.find((x) => x.id === c.id);
    if (m) {
      const { name: _n, kind: _k, formats: _f, margin: _m, margins: _ms, zone: _z, focus: _fo, ...own } = c;
      return [{ ...mediaChannel(m), ...own }];
    }
    return c.name ? [{ formats: [], kind: 'social' as const, ...c, name: c.name }] : [];
  });
}

/** Types de projet proposés tant que l'activité n'a pas décrit les siens (identifiants gardés : les campagnes y renvoient). */
export const DEFAULT_OPERATIONS: Operation[] = [
  {
    id: 'concert',
    name: 'Concert',
    targets: [
      { channel: 'affiche', format: 'a4' },
      { channel: 'facebook', format: 'carre' },
      { channel: 'instagram', format: 'story' },
    ],
  },
  {
    id: 'site',
    name: 'Contenu site web',
    targets: [
      { channel: 'site', format: 'site-banniere' },
      { channel: 'site', format: 'vignette' },
    ],
  },
  {
    id: 'musique',
    name: 'Publication d’un album',
    targets: [
      { channel: 'applemusic', format: 'pochette' },
      { channel: 'instagram', format: 'carre' },
      { channel: 'instagram', format: 'story' },
      { channel: 'facebook', format: 'carre' },
    ],
  },
  { id: 'story', name: 'Story', targets: [{ channel: 'instagram', format: 'story' }] },
  {
    id: 'video',
    name: 'Sortie d’une vidéo',
    targets: [
      { channel: 'youtube', format: 'yt-miniature' },
      { channel: 'youtube', format: 'shorts' },
      { channel: 'instagram', format: 'story' },
      { channel: 'facebook', format: 'carre' },
    ],
  },
  {
    id: 'chaine-youtube',
    name: 'Habillage de la chaîne YouTube',
    targets: [
      { channel: 'youtube', format: 'yt-banniere' },
      { channel: 'youtube', format: 'yt-profil' },
      { channel: 'youtube', format: 'yt-filigrane' },
    ],
  },
];

/** Icônes proposées pour les types de projet, dans l'ordre du choix. */
export const OCCASION_ICONS: Array<{ id: string; label: string }> = [
  { id: 'occ-concert', label: 'Concert' },
  { id: 'occ-ticket', label: 'Évènement' },
  { id: 'occ-music', label: 'Musique' },
  { id: 'occ-video', label: 'Vidéo' },
  { id: 'occ-banner', label: 'Bannière' },
  { id: 'occ-logo', label: 'Logo' },
  { id: 'occ-site', label: 'Site' },
  { id: 'occ-story', label: 'Story' },
  { id: 'occ-news', label: 'Annonce' },
];

/** Icône d'un type de projet : celle choisie, sinon devinée d'après son nom. */
export function occasionIcon(o?: Pick<Operation, 'id' | 'name' | 'icon'> | null): string {
  if (!o) return 'occ-news';
  if (o.icon && OCCASION_ICONS.some((x) => x.id === o.icon)) return o.icon;
  const t = `${o.id} ${o.name}`.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  if (/banniere|habillage|chaine/.test(t)) return 'occ-banner';
  if (/logo|identite/.test(t)) return 'occ-logo';
  if (/video|clip|youtube/.test(t)) return 'occ-video';
  if (/concert|showcase|live|tournee/.test(t)) return 'occ-concert';
  if (/evenement|spectacle|festival|soiree|atelier/.test(t)) return 'occ-ticket';
  if (/musique|album|single|morceau|chanson|ep\b/.test(t)) return 'occ-music';
  if (/site|web/.test(t)) return 'occ-site';
  if (/story/.test(t)) return 'occ-story';
  return 'occ-news';
}

/** Types de projet de l'activité, chaque cible gardée seulement si son média existe. */
export function operationsOf(p?: ActivityProfile | null): Operation[] {
  const chans = channelsOf(p);
  const ops = p?.operations ?? DEFAULT_OPERATIONS;
  return ops.map((o) => ({ ...o, targets: o.targets.filter((t) => isValid(t, chans)) })).filter((o) => o.targets.length);
}

const knownFormat = (id: string) => FORMATS.some((f) => f.id === id);
const isValid = (t: Target, chans: Channel[]) => knownFormat(t.format) && (!t.channel || chans.some((c) => c.id === t.channel));

/** Formats compatibles avec un média (tous, sans média). */
export function formatsFor(ch?: Channel) {
  const ids = ch?.formats.filter(knownFormat) ?? [];
  return ids.length ? FORMATS.filter((f) => ids.includes(f.id)) : FORMATS;
}

/** Variante d'une cible : la sienne, sinon celle du média, sinon la première. */
export function paletteFor(t: Target | undefined, p?: ActivityProfile | null): Palette | undefined {
  const pals = palettesOf(p);
  const ch = t?.channel ? channelsOf(p).find((c) => c.id === t.channel) : undefined;
  return pals.find((q) => q.id === t?.palette) ?? pals.find((q) => q.id === ch?.palette) ?? pals[0];
}

/** Le titre de la publication : celui qu'on lui a donné, sinon son réseau et son format. */
export const targetLabel = (t: Target, p?: ActivityProfile | null) => t.name?.trim() || defaultLabel(t, p);
export const defaultLabel = (t: Target, p?: ActivityProfile | null) => {
  const ch = t.channel ? channelsOf(p).find((c) => c.id === t.channel) : undefined;
  return [ch?.name, formatOf(t.format).title].filter(Boolean).join(' · ');
};

/** Pastilles prévues dans chaque variante, dans l'ordre de la fiche. */
export const BRAND_SLOTS: Array<{ role: ColorRole; label: string; short: string }> = [
  { role: 'principale', label: 'Couleur principale', short: 'princ.' },
  { role: 'texte', label: 'Texte', short: 'texte' },
  { role: 'bordure', label: 'Bordure de texte', short: 'bord.' },
  { role: 'fond', label: 'Fond d’écran', short: 'fond' },
  // panneau en inversion (fond clair et texte foncé sur une variante sombre, et l'inverse)
  { role: 'complementTexte', label: 'Complément texte', short: 'compl. t.' },
  { role: 'complementFond', label: 'Complément fond', short: 'compl. f.' },
  { role: 'sujet1', label: 'Sujet 1', short: 'sujet 1' },
  { role: 'sujet2', label: 'Sujet 2', short: 'sujet 2' },
  { role: 'sujet3', label: 'Sujet 3', short: 'sujet 3' },
];
/** Nom d'un rôle, les anciens compris. */
export const ROLE_NAMES: Record<ColorRole, string> = { ...(Object.fromEntries(BRAND_SLOTS.map((x) => [x.role, x.label])) as Record<ColorRole, string>), accent: 'Accent', secondaire: 'Secondaire' };
export const ROLE_SHORT: Record<string, string> = { ...Object.fromEntries(BRAND_SLOTS.map((x) => [x.role, x.short])), accent: 'accent', secondaire: 'second.' };

/** La couleur d'une variante qui tient une pastille (l'ancien « accent » tient la couleur principale). */
export function slotColor(pal: Palette, role: ColorRole): PaletteColor | undefined {
  return pal.colors.find((c) => c.role === role) ?? (role === 'principale' ? pal.colors.find((c) => c.role === 'accent') : undefined);
}

/** Numéro du guide qui tient un rôle de la variante (l'ancien accent vaut la couleur principale), sinon undefined. */
export function roleIndex(guides: Guide[], role: ColorRole): number | undefined {
  let i = guides.findIndex((g) => g.role === role);
  if (i < 0 && role === 'principale') i = guides.findIndex((g) => g.role === 'accent');
  return i < 0 ? undefined : i;
}

/**
 * Couleurs d'un bord posé sans couleur : la bordure de texte au bord extérieur (seul bord, ou l'extérieur du double,
 * guide2), la couleur principale à l'intérieur du double. Les couleurs déjà choisies restent.
 */
export function borderDefaults(style: string, prev: { guide: number; guide2?: number } | undefined, guides: Guide[]): { guide: number; guide2: number } {
  const edge = roleIndex(guides, 'bordure');
  const main = roleIndex(guides, 'principale');
  if (style === 'double') return { guide: prev?.guide ?? main ?? 0, guide2: prev?.guide2 ?? edge ?? 1 };
  return { guide: prev?.guide ?? edge ?? 0, guide2: prev?.guide2 ?? main ?? 1 };
}

// le fond d'abord : la surface de fond prend le premier guide
const ROLE_ORDER: string[] = ['fond', 'texte', 'bordure', 'principale', 'complementFond', 'complementTexte', 'accent', 'sujet1', 'sujet2', 'sujet3', 'secondaire'];
const rank = (r?: string) => {
  const i = r ? ROLE_ORDER.indexOf(r) : -1;
  return i < 0 ? ROLE_ORDER.length : i;
};

/** Le guide d'une couleur de variante : unie, ou dégradé avec ses arrêts et son style. */
export function colorGuide(c: PaletteColor, name?: string): Guide {
  const n = name ?? (c.name || (c.role ? ROLE_NAMES[c.role] : '') || c.hex);
  const role = c.role ? { role: c.role } : {};
  if (c.stops && c.stops.length > 1) return { name: n, type: 'gradient', stops: [...c.stops], ...(c.blend ? { blend: c.blend } : {}), ...(c.shape ? { shape: c.shape } : {}), ...role };
  return { name: n, type: 'color', color: c.hex, ...role };
}
/** Une couleur de variante depuis le guide édité ; le premier arrêt reste dans hex pour les anciennes lectures. */
export function guidePaletteColor(g: Guide, role?: ColorRole, name?: string): PaletteColor {
  const base = { ...(name ? { name } : {}), ...(role ? { role } : {}) };
  if (g.type === 'gradient') return { hex: g.stops[0] ?? '#888888', stops: [...g.stops], ...(g.blend ? { blend: g.blend } : {}), ...(g.shape ? { shape: g.shape } : {}), ...base };
  return { hex: g.color, ...base };
}

/** Guides d'une variante : le fond d'abord (la surface de fond prend le premier guide). */
export function paletteGuides(pal: Palette): Guide[] {
  return [...pal.colors].sort((a, b) => rank(a.role) - rank(b.role)).map((c) => colorGuide(c));
}

/**
 * Recolore les guides avec une variante : même rôle d'abord (couleur ou dégradé, comme dans la variante),
 * sinon même rang parmi les couleurs de la variante. Un guide qui n'a pas d'équivalent garde sa couleur.
 */
export function recolor(guides: Guide[], pal: Palette | undefined): Guide[] {
  if (!pal?.colors.length) return guides;
  const ordered = paletteGuides(pal);
  const out = guides.map((g, i) => {
    const same = g.role ? (ordered.find((x) => x.role === g.role) ?? (g.role === 'accent' || g.role === 'principale' ? ordered.find((x) => x.role === 'principale' || x.role === 'accent') : undefined)) : undefined;
    if (same) return { ...same, name: g.name };
    if (g.role || g.type !== 'color') return g;
    // ancien guide sans rôle : il prend, à sa place, la couleur ou le dégradé du même rang
    const by = ordered[i];
    return by ? { ...by, name: g.name } : g;
  });
  // les pastilles de la variante encore absentes du document (bordure, sujets…) arrivent à la suite : les numéros des guides restent
  const roles = new Set(out.map((g) => g.role).filter(Boolean));
  const has = (r?: string) => !!r && (roles.has(r) || ((r === 'principale' || r === 'accent') && (roles.has('principale') || roles.has('accent'))));
  return [...out, ...ordered.filter((g) => g.role && !has(g.role))];
}

/** Le document vu pour une cible : son format, ses marges et sa zone d'intérêt (les siennes, sinon celles du format) et sa variante. Le format est changé par l'appelant (holdPins). */
export function docForTarget(d: Doc, t: Target, p?: ActivityProfile | null): Doc {
  const ch = t.channel ? channelsOf(p).find((c) => c.id === t.channel) : undefined;
  const { margins, zone } = framesOf(t, ch);
  return { ...d, guides: recolor(d.guides, paletteFor(t, p)), margins, margin: undefined, zone };
}

/** Clé d'une cible, pour éviter les doublons. */
export const targetKey = (t: Target) => `${t.channel ?? ''}/${t.format}/${t.palette ?? ''}`;

/** Branchements d'un média de l'activité (une ancienne fiche n'en a qu'un, rangé à même le média). */
export function connectionsOf(c?: Partial<Channel>): Connection[] {
  if (!c) return [];
  if (c.connections) return c.connections;
  const account = c.account ?? c.url;
  return account || c.api || c.folder || c.secretSet ? [{ id: 'c1', account, api: c.api, folder: c.folder, secretSet: c.secretSet }] : [];
}

/** Libellés des coordonnées. */
export const CONTACT_KINDS: Record<ContactKind, string> = { email: 'E-mail', tel: 'Téléphone', site: 'Site web', lien: 'Lien', billetterie: 'Billetterie', adresse: 'Adresse', autre: 'Autre' };

/**
 * Coordonnées de l'activité : celles saisies, puis les comptes des médias retenus (marqués de leur média).
 * Une ancienne fiche sans coordonnées garde ses mentions (partenaires, réseaux…) comme coordonnées libres.
 */
export function contactsOf(p?: ActivityProfile | null): Array<Contact & { channel?: string }> {
  const own: Contact[] = p?.contacts?.length ? p.contacts : (p?.branding?.mentions ?? []).map((m) => ({ kind: 'autre' as const, label: m.name, value: m.text }));
  const fromMedia = channelsOf(p).flatMap((c) =>
    connectionsOf(c)
      .filter((x) => x.account && !own.some((o) => o.value === x.account))
      .map((x) => ({ kind: (c.kind === 'site' ? 'site' : 'lien') as ContactKind, label: x.label ? `${c.name} · ${x.label}` : c.name, value: x.account!, channel: c.id })),
  );
  return [...own, ...fromMedia];
}
