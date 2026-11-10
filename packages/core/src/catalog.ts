import type { Format } from './formats.js';

/**
 * Catalogue du site : les formats et les types de diffusion (Facebook, supports imprimés…),
 * communs à toutes les activités et réglés par les administrateurs du site.
 * Chaque activité coche ensuite ceux qui la concernent et y range ses accès.
 */

/** Famille d'un type de diffusion (son icône, ses réglages par défaut). */
export const MEDIA_KINDS = ['social', 'affichage', 'impression', 'email', 'site', 'streaming'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** Champs qu'une activité renseigne pour un type de diffusion. */
export interface MediaFields {
  /** Nom du compte (ou adresse du site). */
  account?: boolean;
  /** Adresse d'API et secret, pour une délégation d'accès. */
  api?: boolean;
  /** Dossier cloud partagé (process Make…). */
  folder?: boolean;
}

/** Écarts depuis chaque bord, en fraction du petit côté du format (positifs vers l'intérieur). */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface MediaType {
  id: string;
  name: string;
  kind: MediaKind;
  /** Formats compatibles (identifiants), le premier par défaut. */
  formats: string[];
  /** Marge des repères, la même sur les quatre côtés (ancienne forme, remplacée par `margins`). */
  margin?: number;
  /** Marges côté par côté (zones mortes, coupe). */
  margins?: Insets;
  /** Zone d'intérêt : le cadre où tient l'essentiel, depuis le bord de la page, toujours dans la marge. */
  zone?: Insets;
  fields: MediaFields;
  /** Coché d'office pour une activité qui n'a pas encore choisi. */
  default?: boolean;
}

export interface Catalog {
  formats: Format[];
  media: MediaType[];
}

export const DEFAULT_FORMATS: Format[] = [
  { id: 'a4', title: 'A4 portrait', width: 210, height: 297, unit: 'mm', dpi: 300, target: 'print' },
  { id: 'carre', title: 'Carré', width: 1080, height: 1080, unit: 'px', target: 'social' },
  { id: 'story', title: 'Story', width: 1080, height: 1920, unit: 'px', target: 'social' },
  { id: 'banniere', title: 'Bannière', width: 1640, height: 624, unit: 'px', target: 'social' },
  // Apple Music, Spotify et les distributeurs demandent au moins 3000 × 3000 px.
  { id: 'pochette', title: 'Pochette', width: 3000, height: 3000, unit: 'px', target: 'web' },
  { id: 'site-banniere', title: 'Bannière du site', width: 1920, height: 640, unit: 'px', target: 'web' },
  // image de partage d'une page (Open Graph)
  { id: 'vignette', title: 'Vignette de partage', width: 1200, height: 630, unit: 'px', target: 'web' },
];

/** « affiche » garde son identifiant : les compositions existantes y renvoient. */
const even = (v: number): Insets => ({ top: v, right: v, bottom: v, left: v });
export const DEFAULT_MEDIA: MediaType[] = [
  { id: 'affiche', name: 'Supports imprimés', kind: 'affichage', formats: ['a4'], margin: 0.06, margins: even(0.06), zone: even(0.1), fields: { folder: true }, default: true },
  { id: 'facebook', name: 'Facebook', kind: 'social', formats: ['carre', 'banniere'], margin: 0.05, margins: even(0.05), zone: even(0.08), fields: { account: true, api: true, folder: true } },
  // story : le haut (profil) et le bas (réponse) restent libres
  { id: 'instagram', name: 'Instagram', kind: 'social', formats: ['carre', 'story'], margin: 0.05, margins: even(0.05), zone: { top: 0.14, right: 0.08, bottom: 0.18, left: 0.08 }, fields: { account: true, api: true, folder: true } },
  // lisible en vignette : l'essentiel au centre
  { id: 'applemusic', name: 'Apple Music', kind: 'streaming', formats: ['pochette'], margin: 0.04, margins: even(0.04), zone: even(0.12), fields: { account: true, api: true, folder: true } },
  // sur téléphone, la bannière est rognée sur les côtés
  { id: 'site', name: 'Site web', kind: 'site', formats: ['site-banniere', 'vignette'], margin: 0.04, margins: even(0.04), zone: { top: 0.08, right: 0.3, bottom: 0.08, left: 0.3 }, fields: { account: true, folder: true } },
];

/** Marges d'un type de diffusion : côté par côté, sinon la marge unique. */
export const mediaMargins = (m: { margin?: number; margins?: Insets }): Insets => m.margins ?? even(m.margin ?? 0);
/** Écarts nettoyés : chacun borné, absent si l'objet n'est pas lisible. */
export function cleanInsets(v: unknown, lo: number, hi: number): Insets | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(Math.max(lo, Math.min(hi, x)) * 1000) / 1000 : 0);
  return { top: n(o.top), right: n(o.right), bottom: n(o.bottom), left: n(o.left) };
}
/** Zone d'intérêt ramenée dans la marge, côté par côté. */
export const zoneInside = (z: Insets, m: Insets): Insets => ({ top: Math.max(z.top, m.top), right: Math.max(z.right, m.right), bottom: Math.max(z.bottom, m.bottom), left: Math.max(z.left, m.left) });

export const DEFAULT_CATALOG: Catalog = { formats: DEFAULT_FORMATS, media: DEFAULT_MEDIA };

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const slug = (v: unknown) => str(v, 40).toLowerCase().replace(/[^a-z0-9-]/g, '');
const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined);
const TARGETS = ['print', 'social', 'mail', 'web'] as const;

/**
 * Garde ce qui est attendu. Les formats d'origine restent toujours là (les compositions y renvoient) :
 * on peut les retoucher, pas les retirer.
 */
export function cleanCatalog(raw: unknown): Catalog {
  const c = (raw ?? {}) as Partial<Catalog>;
  const seen = new Set<string>();
  const formats: Format[] = [];
  for (const f of Array.isArray(c.formats) ? c.formats.slice(0, 60) : []) {
    const id = slug(f?.id);
    const title = str(f?.title, 60);
    const unit = f?.unit === 'mm' ? 'mm' : 'px';
    const width = num(f?.width, 1, unit === 'mm' ? 5000 : 20000);
    const height = num(f?.height, 1, unit === 'mm' ? 5000 : 20000);
    if (!id || !title || !width || !height || seen.has(id)) continue;
    seen.add(id);
    const dpi = unit === 'mm' ? (num(f?.dpi, 72, 1200) ?? 300) : undefined;
    const target = (TARGETS as readonly string[]).includes(f?.target as string) ? f!.target : unit === 'mm' ? 'print' : 'web';
    formats.push({ id, title, width, height, unit, ...(dpi ? { dpi } : {}), target });
  }
  for (const f of DEFAULT_FORMATS) if (!seen.has(f.id)) formats.push(f), seen.add(f.id);
  const seenM = new Set<string>();
  const media: MediaType[] = [];
  for (const m of Array.isArray(c.media) ? c.media.slice(0, 40) : []) {
    const id = slug(m?.id);
    const name = str(m?.name, 60);
    if (!id || !name || seenM.has(id)) continue;
    seenM.add(id);
    const kind = (MEDIA_KINDS as readonly string[]).includes(m?.kind as string) ? m!.kind : 'social';
    const margins = cleanInsets(m?.margins, -0.25, 0.25) ?? (num(m?.margin, -0.25, 0.25) !== undefined ? even(num(m?.margin, -0.25, 0.25)!) : undefined);
    const zone = cleanInsets(m?.zone, 0, 0.45);
    const fl = m?.fields ?? {};
    media.push({
      id,
      name,
      kind,
      formats: (Array.isArray(m?.formats) ? m!.formats : []).map(slug).filter((x) => seen.has(x)).slice(0, 12),
      ...(margins ? { margins, margin: (margins.top + margins.right + margins.bottom + margins.left) / 4 } : {}),
      ...(zone ? { zone: zoneInside(zone, margins ?? even(0)) } : {}),
      fields: { ...(fl.account ? { account: true } : {}), ...(fl.api ? { api: true } : {}), ...(fl.folder ? { folder: true } : {}) },
      ...(m?.default ? { default: true } : {}),
    });
  }
  return { formats, media: Array.isArray(c.media) ? media : DEFAULT_MEDIA };
}
