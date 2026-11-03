import { z } from 'zod';

export const FormatSchema = z.object({
  id: z.string(),
  title: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  unit: z.enum(['mm', 'px']),
  /** Résolution d'export pour les formats papier. */
  dpi: z.number().positive().optional(),
  target: z.enum(['print', 'social', 'mail', 'web']),
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
