/** Balises substituables dans les textes : "Concert le {{date}} à {{lieu}}". */

const TAG_RE = /\{\{\s*([\w.-]+)\s*\}\}/g;

export type Values = Record<string, unknown>;

export function listTags(body: string): string[] {
  return [...new Set([...body.matchAll(TAG_RE)].map((m) => m[1]!))];
}

/** Remplace les balises connues ; les balises sans valeur restent visibles. */
export function substitute(body: string, values: Values): string {
  return body.replace(TAG_RE, (whole, key: string) => {
    const v = values[key];
    if (v === undefined || v === null) return whole;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return String(v);
  });
}

/**
 * Un projet a des valeurs uniques (`values`) et éventuellement une liste
 * (`records`, ex. mailing) : on produit un jeu de valeurs par ligne.
 */
export function expandRecords(values: Values = {}, records?: Values[]): Values[] {
  if (!records || records.length === 0) return [values];
  return records.map((r) => ({ ...values, ...r }));
}
