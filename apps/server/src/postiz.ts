/**
 * Postiz, le moteur de diffusion caché derrière le Designer : il garde les jetons des réseaux
 * et poste aux dates prévues. Le Designer ne lui parle que par son API publique
 * (https://<postiz>/api/public/v1, clé de l'organisation dans l'en-tête Authorization).
 */

export interface PostizConfig {
  /** Adresse de Postiz (https://postiz.exemple.fr), sans /api. */
  url?: string;
  /** Clé de l'API publique de l'organisation : jamais renvoyée au navigateur. */
  key?: string;
}

/** Un compte de réseau relié dans Postiz (une « intégration »). */
export interface PostizIntegration {
  id: string;
  name: string;
  /** Fournisseur Postiz : facebook, instagram, youtube… */
  identifier: string;
  picture?: string;
  disabled?: boolean;
  profile?: string;
}

/** Type de diffusion du catalogue → fournisseur Postiz qui sait y publier. */
export const POSTIZ_PROVIDERS: Record<string, string> = {
  facebook: 'facebook',
  instagram: 'instagram',
  youtube: 'youtube',
  threads: 'threads',
  tiktok: 'tiktok',
  linkedin: 'linkedin-page',
  bluesky: 'bluesky',
  mastodon: 'mastodon',
  pinterest: 'pinterest',
  x: 'x',
};

export class PostizError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

export class Postiz {
  private readonly base: string;
  constructor(
    private readonly cfg: Required<PostizConfig>,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.base = `${cfg.url.replace(/\/+$/, '')}/api/public/v1`;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    const form = body instanceof FormData;
    try {
      res = await this.fetchFn(`${this.base}${path}`, {
        method,
        headers: { Authorization: this.cfg.key, ...(body !== undefined && !form ? { 'Content-Type': 'application/json' } : {}) },
        ...(body !== undefined ? { body: form ? body : JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(form ? 120_000 : 20_000),
      });
    } catch (err) {
      throw new PostizError(`Postiz injoignable : ${(err as Error).message}`);
    }
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const msg = (data as { msg?: string; message?: string } | null)?.msg ?? (data as { message?: string } | null)?.message;
      if (res.status === 401 || res.status === 403) throw new PostizError('Clé Postiz refusée : vérifie la clé dans la configuration globale', 502);
      throw new PostizError(`Postiz a répondu ${res.status}${msg ? ` : ${msg}` : ''}`, res.status === 429 ? 429 : 502);
    }
    return data as T;
  }

  /** Les comptes reliés dans l'organisation. */
  async integrations(): Promise<PostizIntegration[]> {
    const list = await this.call<PostizIntegration[]>('GET', '/integrations');
    return (Array.isArray(list) ? list : []).map((x) => ({
      id: String(x.id),
      name: String(x.name ?? ''),
      identifier: String(x.identifier ?? ''),
      ...(x.picture ? { picture: String(x.picture) } : {}),
      ...(x.disabled ? { disabled: true } : {}),
      ...(x.profile ? { profile: String(x.profile) } : {}),
    }));
  }

  /**
   * Lien de connexion d'un compte : une page de Postiz qui mène à l'autorisation du réseau,
   * puis ramène vers `redirectUrl`. Valable une heure, sans compte Postiz.
   */
  async connectLink(provider: string, redirectUrl: string): Promise<string> {
    const r = await this.call<{ url?: string }>('POST', '/integrations/connect', { integration: provider, redirectUrl });
    if (!r?.url) throw new PostizError('Postiz n’a pas donné de lien de connexion');
    return r.url;
  }

  /** Détache le compte de Postiz (ses publications programmées tombent avec lui). */
  async remove(id: string): Promise<void> {
    await this.call('DELETE', `/integrations/${encodeURIComponent(id)}`);
  }

  /** Dépose une image dans la médiathèque de l'organisation ; Postiz la sert ensuite aux réseaux. */
  async upload(data: Uint8Array, name: string, type = 'image/png'): Promise<PostizMedia> {
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(data)], { type }), name);
    const r = await this.call<{ id?: string; path?: string }>('POST', '/upload', fd);
    if (!r?.id || !r.path) throw new PostizError('Postiz n’a pas gardé l’image');
    return { id: String(r.id), path: String(r.path) };
  }

  /**
   * Programme (ou publie tout de suite) un post sur un compte : le texte et ses images.
   * Renvoie l'identifiant du post chez Postiz.
   */
  async schedule(p: { integration: string; provider: string; when: 'now' | string; content: string; images: PostizMedia[] }): Promise<string> {
    const settings = p.provider.startsWith('instagram') ? { post_type: 'post' } : {};
    const r = await this.call<{ postId?: string }[]>('POST', '/posts', {
      type: p.when === 'now' ? 'now' : 'schedule',
      date: p.when === 'now' ? new Date().toISOString() : p.when,
      shortLink: false,
      tags: [],
      posts: [{ integration: { id: p.integration }, value: [{ content: captionHtml(p.content), image: p.images }], settings }],
    });
    const id = Array.isArray(r) ? r[0]?.postId : undefined;
    if (!id) throw new PostizError('Postiz n’a pas créé la publication');
    return String(id);
  }

  /** Retire une publication programmée (et celles de son groupe). */
  async unschedule(id: string): Promise<void> {
    await this.call('DELETE', `/posts/${encodeURIComponent(id)}`);
  }

  /** Les publications de l'organisation entre deux dates : leur état et, une fois parues, leur lien. */
  async posts(start: Date, end: Date): Promise<PostizPost[]> {
    const q = new URLSearchParams({ startDate: start.toISOString(), endDate: end.toISOString() });
    const r = await this.call<{ posts?: PostizPost[] }>('GET', `/posts?${q}`);
    return (r?.posts ?? []).map((x) => ({
      id: String(x.id),
      state: String(x.state ?? ''),
      publishDate: String(x.publishDate ?? ''),
      ...(x.releaseURL ? { releaseURL: String(x.releaseURL) } : {}),
      ...(x.error ? { error: String(x.error) } : {}),
    }));
  }
}

export interface PostizMedia {
  id: string;
  path: string;
}

export interface PostizPost {
  id: string;
  /** QUEUE, PUBLISHED, ERROR, DRAFT */
  state: string;
  publishDate: string;
  releaseURL?: string;
  error?: string;
}

/** Postiz attend du HTML : une ligne du texte = un paragraphe. */
export function captionHtml(text: string): string {
  const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => `<p>${esc(l)}</p>`)
    .join('');
}

/** Suivi d'une publication confiée à Postiz, gardé dans l'élément du plan. */
export interface PlanPostiz {
  post: string;
  account: string;
  /** date prévue (ISO) */
  at: string;
  state: 'queue' | 'published' | 'error';
  error?: string;
}

/** Ce que Postiz dit d'un post, traduit pour le plan ; undefined si rien n'a changé. */
export function postizOutcome(cur: PlanPostiz, post: PostizPost | undefined): { postiz: PlanPostiz; published?: string; link?: string } | undefined {
  if (!post) return undefined;
  if (post.state === 'PUBLISHED') return { postiz: { ...cur, state: 'published' }, published: post.publishDate || new Date().toISOString(), ...(post.releaseURL ? { link: post.releaseURL } : {}) };
  if (post.state === 'ERROR') return { postiz: { ...cur, state: 'error', error: (post.error || 'refusée par le réseau').slice(0, 300) } };
  return undefined;
}

/** Ce que l'activité a relié : compte Postiz → type de diffusion, et la connexion en cours. */
export interface PostizTeamState {
  accounts: Record<string, string>;
  pending?: { channel: string; provider: string; before: string[]; at: string };
}

/** Un lien de connexion vit une heure chez Postiz : au-delà, l'attente est oubliée. */
export const PENDING_MS = 3600_000;

/**
 * Rattache à l'activité les comptes apparus depuis sa demande de connexion : ceux du bon fournisseur,
 * absents avant la demande et que personne d'autre n'a pris. Renvoie le nouvel état (ou le même).
 */
export function settlePending(state: PostizTeamState, list: PostizIntegration[], taken: Set<string>, now = Date.now()): PostizTeamState {
  const p = state.pending;
  if (!p) return state;
  const fresh = list.filter((x) => x.identifier === p.provider && !p.before.includes(x.id) && !taken.has(x.id) && !state.accounts[x.id]);
  const expired = now - Date.parse(p.at) > PENDING_MS;
  if (!fresh.length && !expired) return state;
  const accounts = { ...state.accounts };
  for (const x of fresh) accounts[x.id] = p.channel;
  return { accounts, ...(fresh.length || expired ? {} : { pending: p }) };
}
