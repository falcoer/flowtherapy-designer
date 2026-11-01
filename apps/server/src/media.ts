import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { extractPalette } from '@ftd/core';
import sharp from 'sharp';

/** Profils de rendu optimisé par support. */
export const CACHE_PROFILES = {
  thumb: { width: 320, format: 'webp', quality: 75 },
  web: { width: 1600, format: 'webp', quality: 82 },
  print: { width: 6000, format: 'jpeg', quality: 92 },
} as const;
export type CacheProfile = keyof typeof CACHE_PROFILES;

export const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg', '.tif', '.tiff'];
export const FONT_EXT = ['.ttf', '.otf', '.woff', '.woff2'];

export async function imageMeta(file: string) {
  const m = await sharp(file).metadata();
  return { width: m.width ?? 1, height: m.height ?? 1 };
}

/** Couleurs dominantes d'une image (5 par défaut). */
export async function imagePalette(file: string, k = 5) {
  const { data, info } = await sharp(file).resize(64, 64, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return extractPalette(data, info.channels as 4, k);
}

/**
 * Chemin du rendu en cache d'une image, généré s'il manque ou si la source
 * est plus récente. Le cache peut être effacé à tout moment.
 */
export async function cachedRender(source: string, cacheDir: string, profile: CacheProfile): Promise<{ file: string; type: string }> {
  const p = CACHE_PROFILES[profile];
  const file = path.join(cacheDir, `${profile}.${p.format === 'jpeg' ? 'jpg' : p.format}`);
  const type = p.format === 'jpeg' ? 'image/jpeg' : 'image/webp';
  const [src, out] = await Promise.all([stat(source), stat(file).catch(() => null)]);
  if (!out || out.mtimeMs < src.mtimeMs) {
    await mkdir(cacheDir, { recursive: true });
    const img = sharp(source, { density: 300 }).rotate().resize({ width: p.width, withoutEnlargement: true });
    if (p.format === 'jpeg') await img.flatten({ background: '#ffffff' }).jpeg({ quality: p.quality, mozjpeg: true }).toFile(file);
    else await img.webp({ quality: p.quality }).toFile(file);
  }
  return { file, type };
}
