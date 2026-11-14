import { FORMATS } from './model';
import type { ActivityProfile, Operation, PlanItem } from './server';
import { channelsOf, formatsFor } from './targets';

/** Délais par défaut avant l'évènement : affiche et post trois semaines avant, un rappel quelques jours avant ; la story au cas par cas. */
export const LEAD_DAYS = 21;
export const REMINDER_DAYS = 3;

export const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || 'rendu';
export const uniquePlanId = (base: string, taken: PlanItem[]) => {
  let id = slug(base);
  for (let i = 2; taken.some((x) => x.id === id); i++) id = `${slug(base)}-${i}`;
  return id;
};

/** Plan prérempli par l'occasion : chaque rendu à trois semaines (la story sans date), puis un rappel sur le premier réseau social. */
export function planFromOperation(op: Operation | undefined, date: string | undefined, activity: ActivityProfile | null): PlanItem[] {
  if (!op) return [];
  const chans = channelsOf(activity);
  const out: PlanItem[] = [];
  for (const t of op.targets) {
    const story = t.format === 'story';
    out.push({ id: uniquePlanId(`${t.channel ?? ''}-${t.format}`, out), ...t, ...(date && !story ? { date: addDays(date, -LEAD_DAYS) } : {}) });
  }
  const social = op.targets.find((t) => t.format !== 'story' && chans.find((c) => c.id === t.channel)?.kind === 'social');
  if (social && date) out.push({ id: uniquePlanId(`${social.channel}-rappel`, out), ...social, label: 'rappel', date: addDays(date, -REMINDER_DAYS) });
  return out;
}

/** Ce qu'on peut ajouter au plan : chaque format de chaque réseau de l'activité, puis les formats libres. */
export function planChoices(activity: ActivityProfile | null) {
  return [...channelsOf(activity).flatMap((ch) => formatsFor(ch).map((f) => ({ key: `${ch.id}/${f.id}`, channel: ch.id as string | undefined, format: f.id }))), ...FORMATS.map((f) => ({ key: `/${f.id}`, channel: undefined as string | undefined, format: f.id }))];
}
