/**
 * Fiches des éléments rangées sur le serveur (Configuration globale › Éléments). Les fiches d'origine
 * vivent dans le code de l'atelier : on peut les cacher, pas les retirer. Les gérants en tirent des
 * copies, qui reprennent le moteur et le rendu de leur fiche d'origine (`base`) et changent le reste :
 * nom, famille, icône, potards montrés, bornes, valeurs figées, jeux de paramètres, outils.
 * Le rendu reste dans le code : une copie ne peut pas en inventer un.
 */

/** Réglage d'un potard de la fiche d'origine, dans une copie. */
export interface KnobSheet {
  key: string;
  /** Autre nom du potard. */
  label?: string;
  /** Montré en Mode simplifié. */
  main?: boolean;
  /** Bornes de la valeur (le potard parcourt [lo, hi]). */
  lo?: number;
  hi?: number;
  /** Potard caché, la valeur reste figée. */
  fixed?: number;
}

export interface ElementSheet {
  id: string;
  /** Fiche d'origine dont la copie garde le moteur et le rendu. */
  base: string;
  name: string;
  family: string;
  icon: string;
  hint: string;
  knobs: KnobSheet[];
  presets: Array<{ name: string; values: Record<string, number> }>;
  /** Outils gardés parmi ceux de la fiche d'origine ; absent, tous. */
  tools?: string[];
  /** Passe vivante (la peinture reste fraîche jusqu'au séchage) ; absent, comme la fiche d'origine. */
  pass?: boolean;
  /** Déborder permis ; absent, comme la fiche d'origine. */
  spill?: boolean;
  /** Second moteur : le même geste pose aussi le trait d'un autre élément d'origine. */
  extra?: ExtraEngine;
}

/**
 * Second moteur d'une fiche (Feu qui jette des étincelles, Eau qui fume) : un élément d'origine et un de
 * ses jeux, posés sur le même geste. Un potard de la fiche peut le doser : rien sous le seuil, puis de
 * plus en plus jusqu'au bout de sa course.
 */
export interface ExtraEngine {
  element: string;
  /** Nom du jeu de paramètres de cet élément ; absent, son premier. */
  preset?: string;
  /** Taille de la pointe, relative à celle du trait (0.2 à 3). */
  size: number;
  /** Potard de la fiche qui dose le second moteur ; absent, toujours entier. */
  dose?: string;
  /** Seuil du dosage (0 à 0.95). */
  from?: number;
}

export interface ElementStore {
  /** Fiches cachées dans la roue (d'origine ou copies). */
  hidden: string[];
  sheets: ElementSheet[];
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const key = (v: unknown) => str(v, 40).replace(/[^a-zA-Z0-9_-]/g, '');
const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.max(lo, Math.min(hi, v)) * 1000) / 1000 : undefined);

function cleanValues(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw).slice(0, 20)) {
    const kk = key(k);
    const n = num(v, -1, 1);
    if (kk && n !== undefined) out[kk] = n;
  }
  return out;
}

function cleanExtra(raw: unknown): ExtraEngine | null {
  const e = raw as Partial<ExtraEngine> | undefined;
  const element = key(e?.element);
  if (!element) return null;
  const preset = str(e?.preset, 40);
  const dose = key(e?.dose);
  const from = num(e?.from, 0, 0.95);
  return { element, ...(preset ? { preset } : {}), size: num(e?.size, 0.2, 3) ?? 1, ...(dose ? { dose, from: from ?? 0 } : {}) };
}

/** Garde ce qui est attendu d'un jeu de fiches envoyé par un gérant. */
export function cleanElementStore(raw: unknown): ElementStore {
  const r = (raw ?? {}) as Partial<ElementStore>;
  const sheets: ElementSheet[] = [];
  const seen = new Set<string>();
  for (const s of Array.isArray(r.sheets) ? r.sheets.slice(0, 80) : []) {
    const id = key(s?.id);
    const base = key(s?.base);
    const name = str(s?.name, 40);
    if (!id || !base || !name || seen.has(id)) continue;
    seen.add(id);
    const knobs: KnobSheet[] = [];
    for (const k of Array.isArray(s.knobs) ? s.knobs.slice(0, 12) : []) {
      const kk = key(k?.key);
      if (!kk || knobs.some((x) => x.key === kk)) continue;
      const label = str(k.label, 30);
      const lo = num(k.lo, -1, 1);
      const hi = num(k.hi, -1, 1);
      const fixed = num(k.fixed, -1, 1);
      knobs.push({
        key: kk,
        ...(label ? { label } : {}),
        ...(typeof k.main === 'boolean' ? { main: k.main } : {}),
        ...(lo !== undefined && hi !== undefined && hi > lo ? { lo, hi } : {}),
        ...(fixed !== undefined ? { fixed } : {}),
      });
    }
    const presets = (Array.isArray(s.presets) ? s.presets.slice(0, 12) : [])
      .map((p) => ({ name: str(p?.name, 40), values: cleanValues(p?.values) }))
      .filter((p) => p.name);
    const tools = Array.isArray(s.tools) ? s.tools.map(key).filter(Boolean).slice(0, 6) : undefined;
    sheets.push({
      id,
      base,
      name,
      family: str(s.family, 40) || 'Mes éléments',
      icon: key(s.icon) || 'brush',
      hint: str(s.hint, 120),
      knobs,
      presets,
      ...(tools ? { tools } : {}),
      ...(typeof s.pass === 'boolean' ? { pass: s.pass } : {}),
      ...(typeof s.spill === 'boolean' ? { spill: s.spill } : {}),
      ...(cleanExtra(s.extra) ? { extra: cleanExtra(s.extra)! } : {}),
    });
  }
  const hidden = [...new Set(Array.isArray(r.hidden) ? r.hidden.map(key).filter(Boolean) : [])].slice(0, 120);
  return { hidden, sheets };
}

/** Réglages gardés par une personne : par élément, ses propres jeux de paramètres (Mes réglages). */
export type UserPresets = Record<string, Array<{ name: string; values: Record<string, number> }>>;

export function cleanUserPresets(raw: unknown): UserPresets {
  const out: UserPresets = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, list] of Object.entries(raw).slice(0, 80)) {
    const k = key(id);
    if (!k || !Array.isArray(list)) continue;
    const kept = list
      .slice(0, 24)
      .map((p) => ({ name: str(p?.name, 40), values: cleanValues(p?.values) }))
      .filter((p) => p.name && Object.keys(p.values).length);
    if (kept.length) out[k] = kept;
  }
  return out;
}
