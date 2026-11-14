import { FORMATS } from './model';
import type { ActivityProfile, Campaign, CampaignText, Channel, OpStep, Operation, PlanItem, Target } from './server';
import { channelsOf, formatsFor } from './targets';

/*
 * Le plan de publication d'une campagne, en étapes nommées (« Annonce », « Rappel »…) : chaque étape a
 * sa date, ses publications (un réseau, un format) et son texte. Le type de projet de l'activité en
 * donne le modèle : les étapes, leur délai avant l'évènement, ce que chacune publie.
 */

/** Délais par défaut avant l'évènement : l'annonce trois semaines avant, un rappel quelques jours avant ; la story au cas par cas. */
/** L'identifiant réservé du texte principal de la campagne, quand il est déposé sur une étape comme un texte nommé. */
export const MAIN_TEXT = 'main';
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

/**
 * Plan prérempli par le type de projet : ses étapes, datées d'après l'évènement quand il a une date, et
 * les textes de la campagne tirés des modèles de ses étapes, déjà déposés dessus.
 */
export function draftFromOperation(op: Operation | undefined, date: string | undefined, activity: ActivityProfile | null): { plan: PlanItem[]; texts: CampaignText[] } {
  const plan: PlanItem[] = [];
  const texts: CampaignText[] = [];
  const steps: Array<{ id: string }> = [];
  for (const s of stepsOf(op, activity)) {
    const step = uniquePlanId(s.name, steps, 'etape');
    steps.push({ id: step });
    let text: string | undefined;
    if (s.text?.trim()) {
      text = uniquePlanId(s.name, [...texts, { id: MAIN_TEXT }], 'texte');
      texts.push({ id: text, name: s.name || 'Texte', text: s.text });
    }
    for (const t of s.targets)
      plan.push({ id: uniquePlanId(`${step}-${t.channel ?? ''}-${t.format}`, plan), ...t, label: s.name, step, ...(date && s.days !== undefined ? { date: addDays(date, -s.days) } : {}), ...(s.time ? { time: s.time } : {}), ...(text ? { text } : {}) });
  }
  return { plan, texts };
}
export const planFromOperation = (op: Operation | undefined, date: string | undefined, activity: ActivityProfile | null): PlanItem[] => draftFromOperation(op, date, activity).plan;

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
  /** heure d'envoi prévue (HH:MM) */
  time?: string;
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
      s.time ??= it.time;
    } else by.set(key, { key, name: it.label ?? '', rows: [it], ...(it.date ? { date: it.date } : {}), ...(it.time ? { time: it.time } : {}), ...(it.text ? { text: it.text } : {}) });
  }
  return [...by.values()].map((s, i) => ({ s, i })).sort((a, b) => (a.s.date && b.s.date ? a.s.date.localeCompare(b.s.date) || (a.s.time ?? '10:00').localeCompare(b.s.time ?? '10:00') : a.s.date ? -1 : b.s.date ? 1 : 0) || a.i - b.i).map((x) => x.s);
}

/** Change une étape entière : ses lignes prennent toutes le même identifiant d'étape, pour rester groupées quand leur nom ou leur date change. */
export function patchStep(plan: PlanItem[], key: string, x: Partial<Pick<PlanItem, 'label' | 'date' | 'time' | 'text' | 'composition'>>, only?: (it: PlanItem) => boolean): PlanItem[] {
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
  return [...base, { id: uniquePlanId(`${sid}-${t.channel ?? ''}-${t.format}`, plan), ...(t.channel ? { channel: t.channel } : {}), format: t.format, step: sid, ...(step?.name ? { label: step.name } : {}), ...(step?.date ? { date: step.date } : {}), ...(step?.time ? { time: step.time } : {}), ...(step?.text ? { text: step.text } : {}) }];
}

/** Le texte d'une publication tel que la campagne le propose : l'annonce, puis le lien, puis les mots-dièse. */
export function campaignCaption(c: Pick<Campaign, 'caption' | 'hashtags' | 'link'>, body = c.caption): string {
  return [body?.trim(), c.link?.trim(), c.hashtags?.trim()].filter(Boolean).join('\n\n');
}
export const planText = (c: Pick<Campaign, 'texts' | 'caption'> | undefined, it: Pick<PlanItem, 'text'>): CampaignText | undefined =>
  !it.text || !c ? undefined : it.text === MAIN_TEXT ? { id: MAIN_TEXT, name: 'Texte principal', text: c.caption ?? '' } : c.texts?.find((t) => t.id === it.text);

/**
 * Le texte envoyé avec une ligne du plan : celui déposé sur son étape (avec le lien et les mots-dièse de
 * la campagne), sinon celui de la composition, sinon le texte principal de la campagne.
 */
export function planCaption(c: Campaign | undefined, it: PlanItem, own?: string, activity?: string): string {
  const fields = c ? campaignFields(c, activity, it.date) : [];
  const t = planText(c, it);
  if (c && t?.text.trim()) return campaignCaption(c, fillFields(t.text, fields));
  return own?.trim() ? fillFields(own, fields) : c ? campaignCaption(c, fillFields(c.caption ?? '', fields)) : '';
}

/*
 * Les champs de la campagne : {date}, {lieu}, {heure}… écrits dans un texte, ils sont remplacés par
 * les réglages de la campagne au moment de l'aperçu et de l'envoi. Un texte écrit avec des champs sert
 * de modèle : il suit la campagne quand sa date ou son lieu changent.
 */
export interface TextField {
  key: string;
  label: string;
  value: string;
}
const fieldKey = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
const UTC_DAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: 'UTC' });
const UTC_DATE = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
/** « 19:30 » → « 19h30 », « 20:00 » → « 20h » ; autre chose reste tel quel. */
export const hourLabel = (time?: string): string => {
  const hm = /^(\d{1,2}):(\d{2})$/.exec(time ?? '');
  return hm ? `${Number(hm[1])}h${hm[2] === '00' ? '' : hm[2]}` : (time ?? '');
};
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** Les champs et leur valeur pour cette campagne ; `at` est le jour de l'envoi (aujourd'hui à défaut), pour {quand} et {jours}. */
export function campaignFields(c: Pick<Campaign, 'name' | 'date' | 'time' | 'place' | 'kind'>, activity?: string, at?: string): TextField[] {
  const d = c.date && /^\d{4}-\d{2}-\d{2}$/.test(c.date) ? new Date(`${c.date}T00:00:00Z`) : null;
  const from = /^\d{4}-\d{2}-\d{2}/.test(at ?? '') ? at!.slice(0, 10) : todayIso();
  const left = d ? Math.round((d.getTime() - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) : null;
  return [
    { key: 'campagne', label: 'Nom de la campagne', value: c.name ?? '' },
    { key: 'date', label: 'Date de l’évènement', value: d ? UTC_DATE.format(d).replace(/ 1 /, ' 1er ') : '' },
    { key: 'jour', label: 'Jour de la semaine', value: d ? UTC_DAY.format(d) : '' },
    { key: 'heure', label: 'Heure d’accueil', value: hourLabel(c.time) },
    { key: 'lieu', label: 'Lieu', value: c.place ?? '' },
    { key: 'quand', label: 'Échéance, le jour de l’envoi', value: left === null ? '' : left > 1 ? `dans ${left} jours` : left === 1 ? 'demain' : left === 0 ? 'aujourd’hui' : left === -1 ? 'hier' : `il y a ${-left} jours` },
    { key: 'jours', label: 'Jours restants, le jour de l’envoi', value: left === null || left < 0 ? '' : String(left) },
    { key: 'type', label: 'Type de prestation', value: c.kind ?? '' },
    { key: 'activité', label: 'Nom de l’activité', value: activity ?? '' },
  ];
}
/** Le texte principal de la campagne, champs remplis, avec le lien et les mots-dièse. */
export const filledCaption = (c: Campaign, activity?: string, at?: string): string => campaignCaption(c, fillFields(c.caption ?? '', campaignFields(c, activity, at)));
const FIELD = /\{([^{}\n]{1,24})\}/g;
/** Remplace les champs connus qui ont une valeur ; les autres restent tels quels, pour qu'on les voie. */
export const fillFields = (text: string, fields: TextField[]): string =>
  text.replace(FIELD, (all, k: string) => fields.find((f) => fieldKey(f.key) === fieldKey(k))?.value || all);
/** Les champs du texte que la campagne ne sait pas encore remplir (pas de lieu, pas de date…). */
export const missingFields = (text: string, fields: TextField[]): string[] => [
  ...new Set([...text.matchAll(FIELD)].map((m) => fields.find((f) => fieldKey(f.key) === fieldKey(m[1]!))).filter((f): f is TextField => !!f && !f.value).map((f) => `{${f.key}}`)),
];
export const hasFields = (text: string, fields: TextField[]): boolean => [...text.matchAll(FIELD)].some((m) => fields.some((f) => fieldKey(f.key) === fieldKey(m[1]!)));

/** Modèles de texte proposés par « ＋ Texte » : ceux des étapes du type de projet, puis ceux d'usage. */
export const TEXT_MODELS: Array<{ name: string; text: string }> = [
  { name: 'Annonce', text: '{campagne} : rendez-vous {date} à {heure}, {lieu}.' },
  { name: 'Rappel', text: '{campagne}, c’est {quand} ! Rendez-vous {date} à {heure}, {lieu}.' },
  { name: 'Merci', text: 'Merci à toutes et à tous pour {campagne} ! À très vite.' },
];
export function textModels(op?: Operation): Array<{ name: string; text: string }> {
  const own = (op?.steps ?? []).filter((s) => s.text?.trim()).map((s) => ({ name: s.name || 'Texte', text: s.text! }));
  return [...own, ...TEXT_MODELS.filter((m) => !own.some((x) => fieldKey(x.name) === fieldKey(m.name)))];
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
