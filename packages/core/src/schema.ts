import { z } from 'zod';
import YAML from 'yaml';
import { ANCHOR_FRAMES } from './anchors.js';

/* ---------- Éléments de bibliothèque ---------- */

const Base = {
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'identifiant en minuscules et tirets'),
  title: z.string().optional(),
  tags: z.array(z.string()).default([]),
  /** Provenance (plugin, URL, licence) pour les éléments importés. */
  origin: z.object({ plugin: z.string().optional(), url: z.string().optional(), license: z.string().optional() }).optional(),
};

export const ImageElementSchema = z.object({
  ...Base,
  type: z.literal('image'),
  source: z.string(),
  meta: z.object({ width: z.number(), height: z.number() }).optional(),
  focus: z.object({ x: z.number(), y: z.number() }).optional(),
  palette: z.string().optional(),
  cache: z.record(z.string(), z.string()).default({}),
});

export const SlotSchema = z.object({
  kind: z.enum(['string', 'date', 'number', 'url']).default('string'),
  default: z.unknown().optional(),
  /** Dans un template : la balise attend une valeur unique ou une liste. */
  cardinality: z.enum(['single', 'list']).default('single'),
  format: z.string().optional(),
});

export const TextElementSchema = z.object({
  ...Base,
  type: z.literal('text'),
  body: z.string(),
  slots: z.record(z.string(), SlotSchema).default({}),
});

export const PaletteColorSchema = z.object({
  name: z.string().optional(),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  role: z.enum(['fond', 'texte', 'accent']).optional(),
});

export const PaletteElementSchema = z.object({
  ...Base,
  type: z.literal('palette'),
  /** Image d'où la palette a été extraite, le cas échéant. */
  from: z.string().optional(),
  colors: z.array(PaletteColorSchema).min(1),
});

export const ParamSchema = z.object({
  kind: z.enum(['number', 'integer', 'color', 'boolean']),
  min: z.number().optional(),
  max: z.number().optional(),
  default: z.unknown(),
});

export const ShaderElementSchema = z.object({
  ...Base,
  type: z.enum(['generator', 'effect']),
  shader: z.string(),
  params: z.record(z.string(), ParamSchema).default({}),
});

export const FontElementSchema = z.object({
  ...Base,
  type: z.literal('font'),
  family: z.string(),
  files: z.array(z.object({ weight: z.number(), style: z.enum(['normal', 'italic']).default('normal'), path: z.string() })),
});

export const LibraryElementSchema = z.discriminatedUnion('type', [
  ImageElementSchema,
  TextElementSchema,
  PaletteElementSchema,
  ShaderElementSchema,
  FontElementSchema,
]);
export type LibraryElement = z.infer<typeof LibraryElementSchema>;
export type ImageElement = z.infer<typeof ImageElementSchema>;
export type TextElement = z.infer<typeof TextElementSchema>;
export type PaletteElement = z.infer<typeof PaletteElementSchema>;

/* ---------- Projets et templates ---------- */

export const ALIGNS = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'] as const;

export const AnchorRefSchema = z.object({
  frame: z.enum(ANCHOR_FRAMES).default('repartition'),
  point: z.string(),
});

export const PlacedSchema = z.object({
  id: z.string(),
  /** Référence de bibliothèque "type/id", ex. "image/logo-ft". */
  ref: z.string().regex(/^[a-z]+\/[a-z0-9-]+$/),
  anchor: AnchorRefSchema,
  align: z.enum(ALIGNS).default('center'),
  /** Fractions de la largeur (w), de la hauteur (h) ou du petit côté (min). */
  size: z.object({ w: z.number().optional(), h: z.number().optional(), min: z.number().optional() }).default({ w: 0.5 }),
  fit: z.enum(['contain', 'cover', 'stretch']).default('contain'),
  style: z
    .object({
      font: z.string().optional(),
      /** Taille du texte en fraction du petit côté du format. */
      size: z.number().optional(),
      color: z.string().optional(),
      weight: z.number().optional(),
      align: z.enum(['start', 'middle', 'end']).optional(),
    })
    .default({}),
  params: z.record(z.string(), z.unknown()).optional(),
  deltas: z.record(z.string(), z.number()).default({}),
});
export type Placed = z.infer<typeof PlacedSchema>;

export const GlobalSchema = z.object({
  ref: z.string(),
  fit: z.enum(['contain', 'cover', 'stretch']).default('cover'),
  params: z.record(z.string(), z.unknown()).optional(),
  deltas: z.record(z.string(), z.number()).default({}),
});

export const ProjectSchema = z.object({
  id: z.string(),
  type: z.enum(['project', 'template']).default('project'),
  title: z.string().optional(),
  axis: z
    .object({ title: z.string(), description: z.string().optional(), audience: z.string().optional(), tone: z.string().optional() })
    .optional(),
  formats: z.array(z.string()).min(1),
  palette: z.string().optional(),
  /** Couleur du fond (valeur ou palette.<rôle>). */
  background: z.string().optional(),
  /** Deltas du fond : teinte, clarté, saturation. */
  backgroundDeltas: z.record(z.string(), z.number()).default({}),
  /** Dégradé de fond (remplace la couleur unie). angle : 180 = de haut en bas. */
  backgroundGradient: z.object({ stops: z.array(z.string()).min(2), angle: z.number().default(180) }).optional(),
  globals: z.array(GlobalSchema).default([]),
  /** Grille du projet : mêmes colonnes et rangées sur tous les formats. */
  grid: z
    .object({
      cols: z.number().int().min(1).max(24).default(4),
      rows: z.number().int().min(1).max(24).default(6),
      margin: z.number().min(0).max(0.3).default(0.06),
      gutter: z.number().min(0).max(0.1).default(0),
    })
    .default({ cols: 4, rows: 6, margin: 0.06, gutter: 0 }),
  elements: z.array(PlacedSchema).default([]),
  values: z.record(z.string(), z.unknown()).default({}),
  records: z.array(z.record(z.string(), z.unknown())).optional(),
  /** Ajustements par format : { formatId: { elementId: champs partiels } }. */
  overrides: z.record(z.string(), z.record(z.string(), z.record(z.string(), z.unknown()))).default({}),
  /** Renseigné par le serveur à chaque enregistrement. */
  meta: z.object({ updatedBy: z.string().optional(), updatedAt: z.string().optional() }).optional(),
});
export type Project = z.infer<typeof ProjectSchema>;

/* ---------- YAML ---------- */

export function parseYaml<T>(schema: z.ZodType<T>, text: string): T {
  const data = YAML.parse(text);
  return schema.parse(data);
}

export function toYaml(data: unknown): string {
  return YAML.stringify(data, { lineWidth: 0 });
}

export const parseProject = (text: string) => parseYaml(ProjectSchema, text);
export const parseLibraryElement = (text: string) => parseYaml(LibraryElementSchema, text);
