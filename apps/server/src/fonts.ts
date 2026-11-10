import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FREE_FONTS, fontSlug, toYaml, type FontKind } from '@ftd/core';
import type { Library } from './library.js';

/**
 * Polices installées par les administrateurs : fichiers et licence copiés dans la bibliothèque
 * (fonts/<id>/), servis ensuite par l'application elle-même sous /files/.
 */

const RAW = 'https://raw.githubusercontent.com/google/fonts/main/';
/** Marque des polices installées depuis la configuration globale (les seules qu'on peut retirer). */
export const INSTALLED = 'installee';
const MAX_FILE = 15 * 1024 * 1024;
const MAX_FILES = 20;
const KINDS: Record<string, FontKind> = { SANS_SERIF: 'sans', SERIF: 'serif', DISPLAY: 'affiche', HANDWRITING: 'manuscrite', MONOSPACE: 'mono' };
const LICENSES: Record<string, { name: string; file: string }> = {
  ofl: { name: 'OFL-1.1', file: 'OFL.txt' },
  apache: { name: 'Apache-2.0', file: 'LICENSE.txt' },
};

export interface InstalledFont {
  id: string;
  family: string;
  tags: string[];
  files: Array<{ weight: number; weightMax?: number; style: 'normal' | 'italic'; src: string }>;
  license?: string;
  url?: string;
}

/** Polices installées, au format attendu par l'atelier. */
export function installedFonts(lib: Library): InstalledFont[] {
  return lib
    .all()
    .flatMap((el) =>
      el.type === 'font' && el.origin?.plugin === INSTALLED
        ? [
            {
              id: el.id,
              family: el.family,
              tags: el.tags ?? [],
              files: el.files.map((f) => ({ weight: f.weight, ...(f.weightMax ? { weightMax: f.weightMax } : {}), style: f.style, src: `/files/${f.path.split(path.sep).join('/')}` })),
              ...(el.origin.license ? { license: el.origin.license } : {}),
              ...(el.origin.url ? { url: el.origin.url } : {}),
            },
          ]
        : [],
    )
    .sort((a, b) => a.family.localeCompare(b.family));
}

/** Fichier de police reconnu à ses premiers octets. */
export function fontExt(buf: Uint8Array): string | null {
  const head = Buffer.from(buf.subarray(0, 4));
  const tag = head.toString('latin1');
  if (tag === 'wOF2') return '.woff2';
  if (tag === 'wOFF') return '.woff';
  if (tag === 'OTTO') return '.otf';
  if (tag === 'true' || head.equals(Buffer.from([0, 1, 0, 0]))) return '.ttf';
  return null;
}

/** Adresse publique en https (pas le réseau local du serveur). */
export function publicUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error('Adresse invalide');
  }
  // une IPv4 glissée dans une IPv6 (::ffff:127.0.0.1) compte comme IPv4
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/^::ffff:/, '');
  const local =
    h === 'localhost' ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    /^(127|10|0)\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h === '::1' ||
    /^f[cd]/.test(h) ||
    /^fe80/.test(h) ||
    /^::ffff:/.test(h) ||
    /^[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(h) ||
    /^\d+$/.test(h);
  if (u.protocol !== 'https:' || local) throw new Error('Adresse https publique attendue');
  return u;
}

/**
 * Où trouver la police dans google/fonts : un dossier du dépôt, une page de Google Fonts
 * (fonts.google.com/specimen/…, fonts.googleapis.com/css2?family=…), sinon rien.
 */
export function googleSource(u: URL): { dir?: string; family?: string } | null {
  const host = u.hostname.toLowerCase();
  if (host === 'fonts.google.com') {
    const m = u.pathname.match(/\/specimen\/([^/]+)/);
    return m ? { family: decodeURIComponent(m[1]!).replace(/\+/g, ' ') } : null;
  }
  if (host === 'fonts.googleapis.com') {
    const fam = u.searchParams.get('family');
    return fam ? { family: fam.split('|')[0]!.split(':')[0]!.replace(/\+/g, ' ') } : null;
  }
  const gh = host === 'github.com' ? u.pathname.match(/^\/google\/fonts\/(?:tree|blob)\/[^/]+\/((?:ofl|apache)\/[a-z0-9]+)/) : host === 'raw.githubusercontent.com' ? u.pathname.match(/^\/google\/fonts\/[^/]+\/((?:ofl|apache)\/[a-z0-9]+)/) : null;
  return gh ? { dir: gh[1] } : null;
}

interface Meta {
  family: string;
  license: string;
  kind?: FontKind;
  files: Array<{ filename: string; weight: number; weightMax?: number; style: 'normal' | 'italic' }>;
}

/** Lecture du METADATA.pb (format texte) d'une famille de google/fonts. */
export function parseMetadata(text: string): Meta {
  const field = (src: string, k: string) => src.match(new RegExp(`^\\s*${k}: "?([^"\\n]*)"?`, 'm'))?.[1];
  const blocks = (k: string) => [...text.matchAll(new RegExp(`^${k} \\{([\\s\\S]*?)^\\}`, 'gm'))].map((m) => m[1]!);
  const wght = blocks('axes').find((b) => field(b, 'tag') === 'wght');
  const range = wght ? [Number(field(wght, 'min_value')), Number(field(wght, 'max_value'))] : null;
  const seen = new Set<string>();
  const files: Meta['files'] = [];
  for (const b of blocks('fonts')) {
    const filename = field(b, 'filename');
    if (!filename || seen.has(filename) || !/^[\w.\-[\],]+$/.test(filename)) continue;
    seen.add(filename);
    const style = field(b, 'style') === 'italic' ? 'italic' : 'normal';
    const variable = filename.includes('[') && range && range[1]! > range[0]!;
    files.push({ filename, style, weight: variable ? range![0]! : Number(field(b, 'weight')) || 400, ...(variable ? { weightMax: range![1]! } : {}) });
  }
  return { family: field(text, 'name') ?? '', license: (field(text, 'license') ?? '').toLowerCase(), kind: KINDS[field(text, 'category') ?? ''], files };
}

export class FontInstaller {
  constructor(
    private lib: Library,
    private fetcher: typeof fetch = fetch,
  ) {}

  private async get(url: string, max = MAX_FILE): Promise<Buffer> {
    // chaque redirection est revérifiée : jamais vers le réseau local
    let r = await this.fetcher(publicUrl(url).toString(), { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
    for (let hops = 0; r.status >= 300 && r.status < 400 && r.headers.get('location'); hops++) {
      if (hops >= 5) throw new Error('Trop de redirections');
      url = new URL(r.headers.get('location')!, url).toString();
      r = await this.fetcher(publicUrl(url).toString(), { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
    }
    if (!r.ok) throw new Error(`Téléchargement refusé (${r.status})`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > max) throw new Error('Fichier trop lourd');
    return buf;
  }

  /** Dossier google/fonts d'une famille : la liste des polices libres, sinon son nom en minuscules sous ofl/ puis apache/. */
  private async findDir(family: string): Promise<{ dir: string; meta: string }> {
    const key = family.toLowerCase().replace(/[^a-z0-9]/g, '');
    const known = FREE_FONTS.find((f) => f.family.toLowerCase().replace(/[^a-z0-9]/g, '') === key);
    for (const dir of known ? [known.dir] : [`ofl/${key}`, `apache/${key}`]) {
      const r = await this.fetcher(`${RAW}${dir}/METADATA.pb`, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
      if (r?.ok) return { dir, meta: await r.text() };
    }
    throw new Error(`« ${family} » n’est pas une police libre de Google Fonts`);
  }

  private async write(id: string, el: Record<string, unknown>, files: Array<[string, Buffer]>) {
    const dir = path.join(this.lib.root, 'fonts', id);
    await mkdir(dir, { recursive: true });
    try {
      for (const [name, buf] of files) await writeFile(path.join(dir, name), buf);
      await writeFile(path.join(dir, 'element.yaml'), toYaml(el));
    } catch (e) {
      await rm(dir, { recursive: true, force: true });
      throw e;
    }
    await this.lib.reindex();
    return installedFonts(this.lib).find((f) => f.id === id)!;
  }

  private freeId(name: string, taken: Set<string>) {
    const base = fontSlug(name) || 'police';
    let id = base;
    for (let n = 2; taken.has(id) || this.lib.get(`font/${id}`); n++) id = `${base}-${n}`;
    return id;
  }

  /** Installe une famille de google/fonts (licence OFL ou Apache seulement), fichiers et licence compris. */
  async fromGoogle(src: { dir?: string; family?: string }, opts: { name?: string; taken: Set<string> }) {
    const found = src.dir ? { dir: src.dir, meta: (await this.get(`${RAW}${src.dir}/METADATA.pb`, 1 << 20)).toString('utf8') } : await this.findDir(src.family!);
    const meta = parseMetadata(found.meta);
    const lic = LICENSES[found.dir.split('/')[0]!];
    if (!lic || !['ofl', 'apache2'].includes(meta.license)) throw new Error('Seules les polices sous licence OFL ou Apache sont installées');
    if (!meta.files.length) throw new Error('Aucun fichier de police trouvé');
    // italiques d'abord écartés si la famille est trop fournie
    const pick = meta.files.length > MAX_FILES ? meta.files.filter((f) => f.style === 'normal').slice(0, MAX_FILES) : meta.files;
    const family = opts.name?.trim() || meta.family;
    const id = this.freeId(family, opts.taken);
    const files: Array<[string, Buffer]> = [];
    const out = [];
    for (const f of pick) {
      const buf = await this.get(`${RAW}${found.dir}/${encodeURIComponent(f.filename).replace(/%2C/g, ',')}`);
      if (!fontExt(buf)) throw new Error(`Fichier illisible : ${f.filename}`);
      const name = f.filename.replace(/\[/g, '-').replace(/,/g, '-').replace(/\]/g, '');
      files.push([name, buf]);
      out.push({ weight: f.weight, ...(f.weightMax ? { weightMax: f.weightMax } : {}), style: f.style, path: name });
    }
    files.push([lic.file, await this.get(`${RAW}${found.dir}/${lic.file}`, 1 << 20)]);
    return this.write(id, {
      id,
      type: 'font',
      title: family,
      family,
      files: out,
      tags: ['police', ...(meta.kind ? [meta.kind] : [])],
      origin: { plugin: INSTALLED, url: `https://github.com/google/fonts/tree/main/${found.dir}`, license: lic.name },
    }, files);
  }

  /** Installe un fichier de police donné par son adresse (licence à vérifier par l'administrateur). */
  async fromFile(u: URL, opts: { name: string; taken: Set<string> }) {
    const buf = await this.get(u.toString());
    const ext = fontExt(buf);
    if (!ext) throw new Error('Cette adresse ne donne pas un fichier de police (ttf, otf, woff, woff2)');
    const id = this.freeId(opts.name, opts.taken);
    const file = `${id}${ext}`;
    return this.write(id, {
      id,
      type: 'font',
      title: opts.name,
      family: opts.name,
      files: [{ weight: 400, style: 'normal', path: file }],
      tags: ['police'],
      origin: { plugin: INSTALLED, url: u.toString() },
    }, [[file, buf]]);
  }

  /** Nom + adresse : une famille Google Fonts (page, feuille de style, dépôt) ou un fichier de police. */
  async install(req: { name?: string; url?: string; dir?: string }, taken: Set<string>) {
    const name = req.name?.trim().slice(0, 60) ?? '';
    if (req.dir) {
      if (!FREE_FONTS.some((f) => f.dir === req.dir)) throw new Error('Police inconnue');
      return this.fromGoogle({ dir: req.dir }, { name, taken });
    }
    if (!req.url?.trim()) throw new Error('Adresse manquante');
    const u = publicUrl(req.url);
    const g = googleSource(u);
    if (g) return this.fromGoogle(g, { name, taken });
    if (!name) throw new Error('Nom manquant');
    return this.fromFile(u, { name, taken });
  }

  /** Retire une police installée (les polices livrées avec l'application restent). */
  async remove(id: string) {
    const el = this.lib.get(`font/${id}`);
    if (el?.type !== 'font' || el.origin?.plugin !== INSTALLED) throw new Error('Police introuvable');
    await rm(path.join(this.lib.root, 'fonts', id), { recursive: true, force: true });
    await this.lib.reindex();
  }
}
