import { FORMATS, formatOf, uniformMargins, type Doc, type Guide, type Target } from './model';
import { palettesOf, type ActivityProfile, type Channel, type ColorRole, type Operation, type Palette, type PaletteColor } from './server';

/**
 * Cibles d'un document : un média (canal de l'activité), un format compatible, une variante de couleurs.
 * Les couleurs des objets pointent vers les guides du document ; changer de variante remplace la couleur
 * de chaque guide par celle du même rôle, et tous les supports suivent.
 */

/** Médias proposés tant que l'activité n'a pas décrit les siens. */
export const DEFAULT_CHANNELS: Channel[] = [
  { id: 'affiche', name: 'Affiche', kind: 'affichage', formats: ['a4'], margin: 0.06, logo: 'main', mentions: [] },
  { id: 'facebook', name: 'Facebook', kind: 'social', formats: ['carre', 'banniere'], margin: 0.05, logo: 'main', mentions: [] },
  { id: 'instagram', name: 'Instagram', kind: 'social', formats: ['carre', 'story'], margin: 0.05, logo: 'icon', mentions: [] },
  { id: 'applemusic', name: 'Apple Music', kind: 'site', formats: ['pochette'], margin: 0.04, logo: 'main', mentions: [] },
];

/** Occasions proposées tant que l'activité n'a pas décrit les siennes. */
export const DEFAULT_OPERATIONS: Operation[] = [
  {
    id: 'concert',
    name: 'Concert, évènement',
    targets: [
      { channel: 'affiche', format: 'a4' },
      { channel: 'facebook', format: 'carre' },
      { channel: 'instagram', format: 'story' },
    ],
  },
  {
    id: 'musique',
    name: 'Nouvelle musique',
    targets: [
      { channel: 'applemusic', format: 'pochette' },
      { channel: 'instagram', format: 'carre' },
      { channel: 'instagram', format: 'story' },
      { channel: 'facebook', format: 'carre' },
    ],
  },
  { id: 'bannieres', name: 'Mise à jour des bannières', targets: [{ channel: 'facebook', format: 'banniere' }] },
  {
    id: 'logo',
    name: 'Mise à jour du logo',
    targets: [
      { channel: 'facebook', format: 'carre' },
      { channel: 'instagram', format: 'carre' },
    ],
  },
];

export const channelsOf = (p?: ActivityProfile | null): Channel[] => (p?.channels?.length ? p.channels : DEFAULT_CHANNELS);
/** Occasions de l'activité, chaque cible gardée seulement si son média existe. */
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

export const targetLabel = (t: Target, p?: ActivityProfile | null) => {
  const ch = t.channel ? channelsOf(p).find((c) => c.id === t.channel) : undefined;
  return [ch?.name, formatOf(t.format).title].filter(Boolean).join(' · ');
};

/** Pastilles prévues dans chaque variante, dans l'ordre de la fiche. */
export const BRAND_SLOTS: Array<{ role: ColorRole; label: string; short: string }> = [
  { role: 'principale', label: 'Couleur principale', short: 'princ.' },
  { role: 'texte', label: 'Texte', short: 'texte' },
  { role: 'bordure', label: 'Bordure de texte', short: 'bord.' },
  { role: 'fond', label: 'Fond d’écran', short: 'fond' },
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

// le fond d'abord : la surface de fond prend le premier guide
const ROLE_ORDER: string[] = ['fond', 'texte', 'bordure', 'principale', 'accent', 'sujet1', 'sujet2', 'sujet3', 'secondaire'];
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

/** Le document vu pour une cible : son format, ses marges (les siennes, sinon celle du média) et sa variante. Le format est changé par l'appelant (holdPins). */
export function docForTarget(d: Doc, t: Target, p?: ActivityProfile | null): Doc {
  const ch = t.channel ? channelsOf(p).find((c) => c.id === t.channel) : undefined;
  const margins = t.margins ?? (ch?.margin !== undefined ? uniformMargins(ch.margin) : undefined);
  return { ...d, guides: recolor(d.guides, paletteFor(t, p)), ...(margins ? { margins, margin: undefined } : {}) };
}

/** Clé d'une cible, pour éviter les doublons. */
export const targetKey = (t: Target) => `${t.channel ?? ''}/${t.format}/${t.palette ?? ''}`;
