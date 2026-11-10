import { z } from 'zod';

/** Écarts depuis chaque bord, en fraction du petit côté du format (positifs vers l'intérieur). */
export const InsetsSchema = z.object({ top: z.number(), right: z.number(), bottom: z.number(), left: z.number() });
export type Insets = z.infer<typeof InsetsSchema>;

export const FormatSchema = z.object({
  id: z.string(),
  title: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  unit: z.enum(['mm', 'px']),
  /** Résolution d'export pour les formats papier. */
  dpi: z.number().positive().optional(),
  target: z.enum(['print', 'social', 'mail', 'web']),
  /** Marges du format (zones mortes, coupe). */
  margins: InsetsSchema.optional(),
  /** Zone d'intérêt : le cadre où tient l'essentiel, depuis le bord, toujours dans la marge. */
  zone: InsetsSchema.optional(),
});
export type Format = z.infer<typeof FormatSchema>;

export const FormatsDocSchema = z.object({ formats: z.array(FormatSchema) });

/** Dimensions en pixels d'un format, pour l'export bitmap. */
export function formatPixelSize(format: Format): { width: number; height: number } {
  if (format.unit === 'px') return { width: format.width, height: format.height };
  const dpi = format.dpi ?? 300;
  const k = dpi / 25.4;
  return { width: Math.round(format.width * k), height: Math.round(format.height * k) };
}
