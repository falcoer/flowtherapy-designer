import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Compositions de l'atelier : un fichier JSON par composition (le document complet, couches,
 * coups de pinceau et photos comprises) et une vignette PNG à côté.
 */
export interface AtelierMeta {
  id: string;
  title: string;
  updated: string;
  /** dernière personne à l'avoir enregistrée */
  by?: string;
  /** création, et qui l'a créée (absents des compositions d'avant) */
  created?: string;
  author?: string;
  formatId?: string;
  /** Rendus du document (média, format, variante), repris pour la liste. */
  targets?: Array<{ channel?: string; format: string; palette?: string }>;
  /** Campagne à laquelle la composition contribue. */
  campaign?: string;
  /** Circuit de validation : proposée aux responsables, validée, ou à revoir. */
  review?: Review;
  /** Nombre de vignettes par publication enregistrées (une par rendu, dans l'ordre des rendus). */
  thumbs?: number;
}

export interface Review {
  status: 'proposed' | 'approved' | 'changes';
  proposedBy: string;
  proposedAt: string;
  note?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
}

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** Au plus autant de vignettes par publication que de rendus gardés. */
const MAX_TARGETS = 16;
const PNG = /^data:image\/png;base64,(.+)$/;

/** Les rendus du document, réduits à leurs repères (média, format, variante). */
function targetsOf(v: unknown): Pick<AtelierMeta, 'targets'> {
  if (!Array.isArray(v)) return {};
  const str = (x: unknown) => (typeof x === 'string' && x.length <= 64 ? x : undefined);
  const out = v
    .slice(0, MAX_TARGETS)
    .map((t) => (t && typeof t === 'object' ? (t as Record<string, unknown>) : {}))
    .filter((t) => str(t.format))
    .map((t) => ({ ...(str(t.channel) ? { channel: str(t.channel) } : {}), format: str(t.format)!, ...(str(t.palette) ? { palette: str(t.palette) } : {}) }));
  return out.length ? { targets: out } : {};
}

export class Ateliers {
  constructor(readonly root: string) {}

  private file(id: string, ext: 'json' | 'png' | `t${number}.png`) {
    if (!ID.test(id)) throw new Error(`Identifiant invalide : ${id}`);
    return path.join(this.root, `${id}.${ext}`);
  }

  async list(): Promise<AtelierMeta[]> {
    await mkdir(this.root, { recursive: true });
    const out: AtelierMeta[] = [];
    for (const name of await readdir(this.root)) {
      if (!name.endsWith('.json')) continue;
      try {
        const { doc: _doc, ...meta } = JSON.parse(await readFile(path.join(this.root, name), 'utf8')) as AtelierMeta & { doc?: unknown };
        out.push(meta);
      } catch {
        /* fichier abîmé : ignoré dans la liste */
      }
    }
    return out.sort((a, b) => b.updated.localeCompare(a.updated));
  }

  async read(id: string): Promise<AtelierMeta & { doc: unknown }> {
    return JSON.parse(await readFile(this.file(id, 'json'), 'utf8'));
  }

  async write(id: string, input: { title?: string; doc?: unknown; thumb?: string; thumbs?: unknown }, by?: string): Promise<AtelierMeta> {
    const doc = input.doc as { formatId?: unknown; layers?: unknown; campaign?: unknown; targets?: unknown } | undefined;
    if (!doc || typeof doc !== 'object' || !Array.isArray(doc.layers)) throw new Error('Document d’atelier attendu (couches manquantes)');
    await mkdir(this.root, { recursive: true });
    // l'état de validation suit la composition d'un enregistrement à l'autre
    const previous = await this.readMeta(id);
    const meta: AtelierMeta = {
      id,
      title: (input.title ?? '').trim().slice(0, 120) || 'Sans titre',
      updated: new Date().toISOString(),
      ...(by ? { by } : {}),
      ...(previous ? (previous.created ? { created: previous.created } : {}) : { created: new Date().toISOString() }),
      ...(previous ? (previous.author ? { author: previous.author } : {}) : by ? { author: by } : {}),
      ...(typeof doc.formatId === 'string' ? { formatId: doc.formatId } : {}),
      ...(typeof doc.campaign === 'string' && ID.test(doc.campaign) ? { campaign: doc.campaign } : {}),
      ...targetsOf(doc.targets),
      ...(previous?.review ? { review: previous.review } : {}),
    };
    // écriture atomique : un fichier temporaire puis renommage
    // vignettes par publication : toutes valides, sinon aucune (la vignette générale sert alors partout)
    const per = Array.isArray(input.thumbs) ? input.thumbs.slice(0, MAX_TARGETS).map((x) => (typeof x === 'string' ? x.match(PNG)?.[1] : undefined)) : [];
    const thumbs = per.length && per.every(Boolean) ? (per as string[]) : [];
    if (thumbs.length) meta.thumbs = thumbs.length;
    const target = this.file(id, 'json');
    await writeFile(target + '.tmp', JSON.stringify({ ...meta, doc }));
    await rename(target + '.tmp', target);
    const m = input.thumb?.match(PNG);
    if (m) await writeFile(this.file(id, 'png'), Buffer.from(m[1]!, 'base64'));
    for (let i = 0; i < MAX_TARGETS; i++) {
      if (i < thumbs.length) await writeFile(this.file(id, `t${i}.png`), Buffer.from(thumbs[i]!, 'base64'));
      else await rm(this.file(id, `t${i}.png`), { force: true });
    }
    return meta;
  }

  private async readMeta(id: string): Promise<AtelierMeta | null> {
    try {
      const { doc: _doc, ...meta } = await this.read(id);
      return meta;
    } catch {
      return null;
    }
  }

  /** Change l'état de validation sans toucher au document. */
  async setReview(id: string, review: Review): Promise<AtelierMeta> {
    const full = await this.read(id);
    const target = this.file(id, 'json');
    const next = { ...full, review };
    await writeFile(target + '.tmp', JSON.stringify(next));
    await rename(target + '.tmp', target);
    const { doc: _doc, ...meta } = next;
    return meta;
  }

  /** Copie une composition (document et vignette) sous un nouvel identifiant, rattachée à une autre campagne. */
  async copy(from: string, to: string, o: { title?: string; campaign?: string }, by?: string): Promise<AtelierMeta> {
    const src = await this.read(from);
    const doc = { ...(src.doc as object), campaign: o.campaign };
    const thumbs: string[] = [];
    for (let i = 0; i < (src.thumbs ?? 0); i++) {
      const f = await this.thumb(from, i);
      if (!f) break;
      thumbs.push(`data:image/png;base64,${(await readFile(f)).toString('base64')}`);
    }
    const meta = await this.write(to, { title: o.title ?? src.title, doc, thumbs: thumbs.length === src.thumbs ? thumbs : undefined }, by);
    const thumb = await this.thumb(from);
    if (thumb) await writeFile(this.file(to, 'png'), await readFile(thumb));
    return meta;
  }

  async remove(id: string) {
    await rm(this.file(id, 'json'), { force: true });
    await rm(this.file(id, 'png'), { force: true });
    for (let i = 0; i < MAX_TARGETS; i++) await rm(this.file(id, `t${i}.png`), { force: true });
  }

  /** Vignette générale, ou celle d'une publication (rendu n° t). */
  async thumb(id: string, t?: number): Promise<string | null> {
    const f = t === undefined ? this.file(id, 'png') : Number.isInteger(t) && t >= 0 && t < MAX_TARGETS ? this.file(id, `t${t}.png`) : null;
    if (!f) return null;
    try {
      await stat(f);
      return f;
    } catch {
      return null;
    }
  }
}
