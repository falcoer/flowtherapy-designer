import { uid, type Doc, type Layer, type PubPage, type SceneLook, type Target } from './model';

/*
 * Publications autonomes : chaque publication d'une composition a ses propres objets et sa disposition.
 * Celle affichée vit dans `doc.layers` ; les autres attendent dans `doc.pubs`, une case par publication.
 * Un document d'avant partageait ses objets entre ses publications : chacune en reçoit une copie,
 * recalée sur son format, la première fois qu'on en a besoin (rien ne bouge à l'écran).
 */

/** Ce que l'appelant sait faire d'un document pour la publication i. */
export interface PubViews {
  /** le document montré sur la publication i sans rien déplacer : son format, ses marges, sa variante */
  look: (d: Doc, i: number) => Doc;
  /** le document recalé sur la publication i : ses objets suivent leurs repères (copie d'une voisine) */
  at: (d: Doc, i: number) => Doc;
}

/** Publication affichée. */
export const pubIndex = (d: Doc) => (d.targets?.length ? Math.max(0, Math.min(d.target ?? 0, d.targets.length - 1)) : 0);

/** Copie d'objets pour une autre publication : de nouveaux identifiants (la peinture en cache est rangée par identifiant), la mise au point et les groupes suivent. */
export function copyPage(layers: Layer[], scene?: SceneLook): PubPage {
  const ids = new Map(layers.map((l) => [l.id, uid()]));
  const links = new Map<string, string>();
  const out = structuredClone(layers).map((l) => {
    const x = { ...l, id: ids.get(l.id)! };
    if (l.link) {
      if (!links.has(l.link)) links.set(l.link, uid());
      x.link = links.get(l.link);
    }
    return x;
  });
  const sc = scene ? structuredClone(scene) : undefined;
  if (sc?.camera?.focus) sc.camera.focus = ids.get(sc.camera.focus);
  return sc ? { layers: out, scene: sc } : { layers: out };
}

/** Chaque publication a-t-elle déjà ses objets ? */
export function hasPages(d: Doc): boolean {
  const n = d.targets?.length ?? 0;
  if (n < 2) return true;
  const c = pubIndex(d);
  return d.pubs?.length === n && d.pubs.every((p, i) => i === c || !!p);
}

/** Le document où chaque publication a ses propres objets (un document d'avant reçoit des copies recalées). */
export function withPages(d: Doc, v: Pick<PubViews, 'at'>): Doc {
  if (hasPages(d)) return d.targets && d.targets.length < 2 && d.pubs ? { ...d, pubs: d.targets.map(() => null) } : d;
  const c = pubIndex(d);
  const pubs = d.targets!.map((_, i) => {
    if (i === c) return null;
    const own = d.pubs?.[i];
    if (own) return own;
    const x = v.at({ ...d, pubs: undefined }, i);
    return copyPage(x.layers, x.scene);
  });
  return { ...d, pubs };
}

/** Le document tel que la publication i s'affiche : ses objets, sa scène, son format. */
export function pageDoc(d: Doc, i: number, v: PubViews): Doc {
  const t = d.targets?.[i];
  const page = d.pubs?.[i];
  if (!t || i === pubIndex(d) || !page) return v.at(d, i);
  return v.look({ ...d, layers: page.layers, scene: page.scene, formatId: t.format }, i);
}

/** Affiche la publication i : celle qu'on quitte range ses objets, celle-ci reprend les siens. */
export function switchPage(d: Doc, i: number, v: PubViews): Doc {
  const c = pubIndex(d);
  const t = d.targets?.[i];
  if (!t || i === c) return v.at(d, i);
  const full = withPages(d, v);
  const pubs = [...full.pubs!];
  const page = pubs[i]!;
  pubs[c] = d.scene ? { layers: d.layers, scene: d.scene } : { layers: d.layers };
  pubs[i] = null;
  return { ...v.look({ ...full, layers: page.layers, scene: page.scene, formatId: t.format, pubs }, i), target: i };
}

/** Ajoute une publication à partir d'objets donnés (déjà sur son format) et l'affiche. */
export function addPage(d: Doc, current: Target, t: Target, page: PubPage, v: PubViews): Doc {
  const base = d.targets?.length ? d : { ...d, targets: [current], target: 0 };
  const full = withPages(base, v);
  const c = pubIndex(full);
  const pubs = full.targets!.map((_, i) => (i === c ? null : full.pubs?.[i] ?? null));
  const next = { ...full, targets: [...full.targets!, { ...t }], pubs: [...pubs, page] };
  return switchPage(next, next.targets.length - 1, v);
}

/** Retire la publication i ; si c'est celle affichée, sa voisine prend sa place. */
export function removePage(d: Doc, i: number, v: PubViews): Doc {
  const n = d.targets?.length ?? 0;
  if (n < 2 || i < 0 || i >= n) return d;
  let x = d;
  if (i === pubIndex(d)) x = switchPage(d, i > 0 ? i - 1 : 1, v);
  const c = pubIndex(x);
  const targets = x.targets!.filter((_, j) => j !== i);
  const pubs = x.pubs ? x.pubs.filter((_, j) => j !== i) : undefined;
  return { ...x, targets, pubs, target: c > i ? c - 1 : c };
}

/*
 * Les photos sont des data URI : copiées dans chaque publication, elles pèseraient autant de fois.
 * À l'enregistrement, une image présente plusieurs fois est rangée une seule fois (`images`), et
 * chaque objet garde « image:<n> » ; à la lecture, tout revient comme avant.
 */
type Packed = Doc & { images?: string[] };
const REF = 'image:';

export function packDoc(d: Doc): Doc {
  if (!d.pubs?.some(Boolean)) return d;
  const all = [d.layers, ...d.pubs.map((p) => p?.layers ?? [])];
  const seen = new Map<string, number>();
  for (const ls of all) for (const l of ls) if (l.src?.startsWith('data:')) seen.set(l.src, (seen.get(l.src) ?? 0) + 1);
  const images: string[] = [];
  const index = new Map<string, number>();
  const pack = (ls: Layer[]) =>
    ls.map((l) => {
      if (!l.src || (seen.get(l.src) ?? 0) < 2) return l;
      let k = index.get(l.src);
      if (k === undefined) {
        k = images.push(l.src) - 1;
        index.set(l.src, k);
      }
      return { ...l, src: `${REF}${k}` };
    });
  if (![...seen.values()].some((n) => n > 1)) return d;
  return { ...d, layers: pack(d.layers), pubs: d.pubs.map((p) => (p ? { ...p, layers: pack(p.layers) } : p)), images } as Packed;
}

export function unpackDoc(d: Doc): Doc {
  const images = (d as Packed).images;
  if (!images) return d;
  const unpack = (ls: Layer[]) => ls.map((l) => (l.src?.startsWith(REF) ? { ...l, src: images[Number(l.src.slice(REF.length))] } : l));
  const { images: _drop, ...rest } = d as Packed;
  return { ...rest, layers: unpack(d.layers), pubs: d.pubs?.map((p) => (p ? { ...p, layers: unpack(p.layers) } : p)) };
}
