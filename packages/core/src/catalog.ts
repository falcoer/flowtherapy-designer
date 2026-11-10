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

export interface MediaType {
  id: string;
  name: string;
  kind: MediaKind;
  /** Formats compatibles (identifiants), le premier par défaut. */
  formats: string[];
  /** Marge des repères, en fraction du petit côté. */
  margin?: number;
  /** Zone d'intérêt : ce qu'il faut éviter de couvrir. */
  focus?: string;
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
export const DEFAULT_MEDIA: MediaType[] = [
  { id: 'affiche', name: 'Supports imprimés', kind: 'affichage', formats: ['a4'], margin: 0.06, fields: { folder: true }, default: true },
  { id: 'facebook', name: 'Facebook', kind: 'social', formats: ['carre', 'banniere'], margin: 0.05, fields: { account: true, api: true, folder: true } },
  { id: 'instagram', name: 'Instagram', kind: 'social', formats: ['carre', 'story'], margin: 0.05, focus: 'Story : laisser libres le haut (profil) et le bas (réponse)', fields: { account: true, api: true, folder: true } },
  { id: 'applemusic', name: 'Apple Music', kind: 'streaming', formats: ['pochette'], margin: 0.04, fields: { account: true, api: true, folder: true } },
  { id: 'site', name: 'Site web', kind: 'site', formats: ['site-banniere', 'vignette'], margin: 0.04, fields: { account: true, folder: true } },
];

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
    const margin = num(m?.margin, -0.25, 0.25);
    const focus = str(m?.focus, 300);
    const fl = m?.fields ?? {};
    media.push({
      id,
      name,
      kind,
      formats: (Array.isArray(m?.formats) ? m!.formats : []).map(slug).filter((x) => seen.has(x)).slice(0, 12),
      ...(margin !== undefined ? { margin } : {}),
      ...(focus ? { focus } : {}),
      fields: { ...(fl.account ? { account: true } : {}), ...(fl.api ? { api: true } : {}), ...(fl.folder ? { folder: true } : {}) },
      ...(m?.default ? { default: true } : {}),
    });
  }
  return { formats, media: Array.isArray(c.media) ? media : DEFAULT_MEDIA };
}
