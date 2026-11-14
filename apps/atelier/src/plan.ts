import { FORMATS } from './model';
import type { ActivityProfile, Campaign, CampaignText, Channel, OpStep, Operation, PlanItem, Target } from './server';
import { channelsOf, formatsFor } from './targets';

/*
 * Le plan de publication d'une campagne, en étapes nommées (« Annonce », « Rappel »…) : chaque étape a
 * sa date, ses publications (un réseau, un format) et son texte. Le type de projet de l'activité en
 * donne le modèle : les étapes, leur délai avant l'évènement, ce que chacune publie.
 */

/** Délais par défaut avant l'évènement : l'annonce trois semaines avant, un rappel quelques jours avant ; la story au cas par cas. */
export const LEAD_DAYS = 21;
export const REMINDER_DAYS = 3;

export const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const slug = (s: string, fallback = 'rendu') =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || fallback;
export const uniquePlanId = (base: string, taken: Array<{ id: string }>, fallback = 'rendu') => {
  let id = slug(base, fallback);
  for (let i = 2; taken.some((x) => x.id === id); i++) id = `${slug(base, fallback)}-${i}`;
  return id;
};
const same = (a: Target, b: Target) => (a.channel ?? '') === (b.channel ?? '') && a.format === b.format;

/**
 * Les étapes d'un type de projet : celles que l'activité a décrites, sinon l'annonce (tout sauf les
 * stories) à trois semaines, un rappel sur le premier réseau social à trois jours, et les stories à dater.
 */
export function stepsOf(op: Operation | undefined, activity: ActivityProfile | null | Channel[]): OpStep[] {
  if (!op) return [];
  if (op.steps?.length) return op.steps.map((s) => ({ ...s, targets: s.targets.filter((t) => op.targets.some((x) => same(x, t))) })).filter((s) => s.targets.length);
  const chans = Array.isArray(activity) ? activity : channelsOf(activity);
  const main = op.targets.filter((t) => t.format !== 'story');
  const stories = op.targets.filter((t) => t.format === 'story');
  const social = main.find((t) => chans.find((c) => c.id === t.channel)?.kind === 'social');
  return [
    ...(main.length ? [{ name: 'Annonce', days: LEAD_DAYS, targets: main }] : []),
    ...(social ? [{ name: 'Rappel', days: REMINDER_DAYS, targets: [social] }] : []),
    ...(stories.length ? [{ name: 'Story', targets: stories }] : []),
  ];
}

/** Plan prérempli par le type de projet : ses étapes, datées d'après l'évènement quand il a une date. */
export function planFromOperation(op: Operation | undefined, date: string | undefined, activity: ActivityProfile | null): PlanItem[] {
  const out: PlanItem[] = [];
  const steps: Array<{ id: string }> = [];
  for (const s of stepsOf(op, activity)) {
    const step = uniquePlanId(s.name, steps, 'etape');
    steps.push({ id: step });
    for (const t of s.targets) out.push({ id: uniquePlanId(`${step}-${t.channel ?? ''}-${t.format}`, out), ...t, label: s.name, step, ...(date && s.days !== undefined ? { date: addDays(date, -s.days) } : {}) });
  }
  return out;
}

/** Ce qu'on peut ajouter au plan : chaque format de chaque réseau de l'activité, puis les formats libres. */
export function planChoices(activity: ActivityProfile | null) {
  return [...channelsOf(activity).flatMap((ch) => formatsFor(ch).map((f) => ({ key: `${ch.id}/${f.id}`, channel: ch.id as string | undefined, format: f.id }))), ...FORMATS.map((f) => ({ key: `/${f.id}`, channel: undefined as string | undefined, format: f.id }))];
}

/** Une étape du plan : son nom, sa date, ses publications et son texte. */
export interface PlanStep {
  /** l'étape des lignes ; pour un plan d'avant les étapes, leur date et leur nom */
  key: string;
  name: string;
  date?: string;
  rows: PlanItem[];
  /** texte déposé sur l'étape */
  text?: string;
}
export const stepKey = (it: PlanItem) => it.step ?? `${it.date ?? ''}|${it.label ?? ''}`;

/** Le plan rangé en étapes, par date (celles à dater en dernier), dans l'ordre du plan à date égale. */
export function planSteps(plan: PlanItem[]): PlanStep[] {
  const by = new Map<string, PlanStep>();
  for (const it of plan) {
    const key = stepKey(it);
    const s = by.get(key);
    if (s) {
      s.rows.push(it);
      if (it.date && (!s.date || it.date < s.date)) s.date = it.date;
      s.text ??= it.text;
    } else by.set(key, { key, name: it.label ?? '', rows: [it], ...(it.date ? { date: it.date } : {}), ...(it.text ? { text: it.text } : {}) });
  }
  return [...by.values()].map((s, i) => ({ s, i })).sort((a, b) => (a.s.date && b.s.date ? a.s.date.localeCompare(b.s.date) : a.s.date ? -1 : b.s.date ? 1 : 0) || a.i - b.i).map((x) => x.s);
}

/** Change une étape entière : ses lignes prennent toutes le même identifiant d'étape, pour rester groupées quand leur nom ou leur date change. */
export function patchStep(plan: PlanItem[], key: string, x: Partial<Pick<PlanItem, 'label' | 'date' | 'text' | 'composition'>>, only?: (it: PlanItem) => boolean): PlanItem[] {
  const rows = plan.filter((it) => stepKey(it) === key);
  if (!rows.length) return plan;
  const step = rows[0]!.step ?? uniquePlanId(rows[0]!.label ?? '', [...new Set(plan.map((it) => it.step).filter(Boolean))].map((id) => ({ id: id! })), 'etape');
  return plan.map((it) => {
    if (stepKey(it) !== key) return it;
    const n: PlanItem = { ...it, step };
    if (!only || only(it)) for (const k of Object.keys(x) as Array<keyof typeof x>) x[k] ? (n[k] = x[k]) : delete n[k];
    return n;
  });
}

/** Une ligne de plus : dans l'étape donnée (son nom, sa date, son texte), sinon dans une étape nouvelle, à nommer. */
export function addPlanRow(plan: PlanItem[], t: Target, step?: PlanStep): PlanItem[] {
  const base = step ? patchStep(plan, step.key, {}) : plan;
  const sid = step ? base.find((it) => step.rows.some((r) => r.id === it.id))!.step! : uniquePlanId('etape', [...new Set(plan.map((it) => it.step).filter(Boolean))].map((id) => ({ id: id! })), 'etape');
  return [...base, { id: uniquePlanId(`${sid}-${t.channel ?? ''}-${t.format}`, plan), ...(t.channel ? { channel: t.channel } : {}), format: t.format, step: sid, ...(step?.name ? { label: step.name } : {}), ...(step?.date ? { date: step.date } : {}), ...(step?.text ? { text: step.text } : {}) }];
}

/** Le texte d'une publication tel que la campagne le propose : l'annonce, puis le lien, puis les mots-dièse. */
export function campaignCaption(c: Pick<Campaign, 'caption' | 'hashtags' | 'link'>, body = c.caption): string {
  return [body?.trim(), c.link?.trim(), c.hashtags?.trim()].filter(Boolean).join('\n\n');
}
/** L'identifiant réservé du texte principal de la campagne, quand il est déposé sur une étape comme un texte nommé. */
export const MAIN_TEXT = 'main';
export const planText = (c: Pick<Campaign, 'texts' | 'caption'> | undefined, it: Pick<PlanItem, 'text'>): CampaignText | undefined =>
  !it.text || !c ? undefined : it.text === MAIN_TEXT ? { id: MAIN_TEXT, name: 'Texte principal', text: c.caption ?? '' } : c.texts?.find((t) => t.id === it.text);

/**
 * Le texte envoyé avec une ligne du plan : celui déposé sur son étape (avec le lien et les mots-dièse de
 * la campagne), sinon celui de la composition, sinon le texte principal de la campagne.
 */
export function planCaption(c: Campaign | undefined, it: PlanItem, own?: string): string {
  const t = planText(c, it);
  if (c && t?.text.trim()) return campaignCaption(c, t.text);
  return own?.trim() ? own : c ? campaignCaption(c) : '';
}

/** Un mot-clé de l'activité devenu mot-dièse : sans espace ni ponctuation, en minuscules (« Rock progressif » → #rockprogressif). */
export const hashtagOf = (word: string): string => {
  const w = word.replace(/[^\p{L}\p{N}_]+/gu, '').toLowerCase();
  return w ? `#${w}` : '';
};
export const hashtagsIn = (s: string): string[] => s.match(/#[\p{L}\p{N}_]+/gu) ?? [];
/** Les mots-dièse à proposer : le nom de l'activité, ses mots-clés, puis ceux déjà employés dans ses autres campagnes. */
export function hashtagChoices(name: string | undefined, keywords: string[], used: Array<string | undefined>): string[] {
  const all = [hashtagOf(name ?? ''), ...keywords.map(hashtagOf), ...used.flatMap((s) => hashtagsIn(s ?? '').map(hashtagOf))].filter(Boolean);
  return [...new Set(all)].slice(0, 24);
}
/** Ajoute le mot-dièse à la suite, ou le retire s'il y est déjà ; un mot en cours de frappe qu'il complète est remplacé. */
export function toggleHashtag(s: string, tag: string): string {
  const has = hashtagsIn(s).some((x) => x.toLowerCase() === tag);
  if (has) return s.replace(/#[\p{L}\p{N}_]+/gu, (x) => (x.toLowerCase() === tag ? '' : x)).replace(/\s+/g, ' ').trim();
  const typed = /(?:^|\s)(#?[\p{L}\p{N}_]+)$/u.exec(s)?.[1];
  const partial = typed && hashtagOf(typed) !== tag && tag.startsWith(hashtagOf(typed)) ? typed : '';
  return `${s.slice(0, s.length - partial.length).trimEnd()} ${tag}`.trim();
}
