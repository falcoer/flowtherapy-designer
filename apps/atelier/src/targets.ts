import { FORMATS, formatOf, type Doc, type Guide, type Target } from './model';
import { palettesOf, type ActivityProfile, type Channel, type Operation, type Palette } from './server';

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

const ROLE_ORDER = ['fond', 'texte', 'accent', 'secondaire'];
const rank = (r?: string) => {
  const i = r ? ROLE_ORDER.indexOf(r) : -1;
  return i < 0 ? ROLE_ORDER.length : i;
};

/** Guides d'une variante : le fond d'abord (la surface de fond prend le premier guide). */
export function paletteGuides(pal: Palette): Guide[] {
  return [...pal.colors].sort((a, b) => rank(a.role) - rank(b.role)).map((c) => ({ name: c.name || c.role || c.hex, type: 'color', color: c.hex, ...(c.role ? { role: c.role } : {}) }));
}

/**
 * Recolore les guides avec une variante : même rôle d'abord, sinon même rang parmi les couleurs de la variante.
 * Les dégradés gardent leurs arrêts ; un guide qui n'a pas d'équivalent garde sa couleur.
 */
export function recolor(guides: Guide[], pal: Palette | undefined): Guide[] {
  if (!pal?.colors.length) return guides;
  const ordered = paletteGuides(pal);
  return guides.map((g, i) => {
    if (g.type !== 'color') return g;
    const same = g.role ? ordered.find((x) => x.role === g.role) : undefined;
    const by = same ?? (g.role ? undefined : ordered[i]);
    return by && by.type === 'color' ? { ...g, color: by.color, ...(by.role ? { role: by.role } : {}) } : g;
  });
}

/** Le document vu pour une cible : son format, sa marge (celle du média) et sa variante. Le format est changé par l'appelant (holdPins). */
export function docForTarget(d: Doc, t: Target, p?: ActivityProfile | null): Doc {
  const ch = t.channel ? channelsOf(p).find((c) => c.id === t.channel) : undefined;
  return { ...d, guides: recolor(d.guides, paletteFor(t, p)), ...(ch?.margin !== undefined ? { margin: ch.margin } : {}) };
}

/** Clé d'une cible, pour éviter les doublons. */
export const targetKey = (t: Target) => `${t.channel ?? ''}/${t.format}/${t.palette ?? ''}`;
