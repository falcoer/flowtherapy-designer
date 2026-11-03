import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { LibraryElement } from '@ftd/core';

/**
 * Index de recherche SQLite (FTS5), entièrement reconstruit depuis les YAML :
 * il peut être supprimé sans perte. Recherche par type, tags et texte libre
 * (préfixes, accents ignorés).
 */
export class SearchIndex {
  private db: DatabaseSync;

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS elements (key TEXT PRIMARY KEY, type TEXT NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tags (key TEXT NOT NULL, tag TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS tags_tag ON tags(tag);
      CREATE VIRTUAL TABLE IF NOT EXISTS elements_fts USING fts5(
        key UNINDEXED, title, tags, body, tokenize = 'unicode61 remove_diacritics 2'
      );
    `);
  }

  rebuild(elements: LibraryElement[]) {
    this.db.exec('BEGIN');
    try {
      this.db.exec('DELETE FROM elements; DELETE FROM tags; DELETE FROM elements_fts;');
      const insEl = this.db.prepare('INSERT INTO elements (key, type, json) VALUES (?, ?, ?)');
      const insTag = this.db.prepare('INSERT INTO tags (key, tag) VALUES (?, ?)');
      const insFts = this.db.prepare('INSERT INTO elements_fts (key, title, tags, body) VALUES (?, ?, ?, ?)');
      for (const el of elements) {
        const key = `${el.type}/${el.id}`;
        insEl.run(key, el.type, JSON.stringify(el));
        for (const t of el.tags) insTag.run(key, t.toLowerCase());
        const body = el.type === 'text' ? el.body : el.type === 'font' ? el.family : '';
        insFts.run(key, `${el.title ?? ''} ${el.id.replace(/-/g, ' ')}`, el.tags.join(' '), body);
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  search(q: { type?: string; tags?: string[]; text?: string; limit?: number }): LibraryElement[] {
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (q.type) {
      where.push('e.type = ?');
      params.push(q.type);
    }
    for (const tag of q.tags ?? []) {
      where.push('e.key IN (SELECT key FROM tags WHERE tag = ?)');
      params.push(tag.toLowerCase());
    }
    const match = toFtsQuery(q.text);
    if (match) {
      where.push('e.key IN (SELECT key FROM elements_fts WHERE elements_fts MATCH ?)');
      params.push(match);
    }
    const sql = `SELECT e.json FROM elements e ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY e.type, e.key LIMIT ?`;
    params.push(q.limit ?? 200);
    const rows = this.db.prepare(sql).all(...params) as Array<{ json: string }>;
    return rows.map((r) => JSON.parse(r.json) as LibraryElement);
  }

  /** Tags présents dans la bibliothèque, du plus fréquent au plus rare. */
  tags(): Array<{ tag: string; count: number }> {
    return this.db.prepare('SELECT tag, COUNT(*) AS count FROM tags GROUP BY tag ORDER BY count DESC, tag').all() as Array<{
      tag: string;
      count: number;
    }>;
  }

  close() {
    this.db.close();
  }
}

/** "scène viol" → "scène"* AND "viol"* (chaque mot en préfixe, guillemets échappés). */
export function toFtsQuery(text?: string): string | null {
  const words = (text ?? '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((w) => `"${w.replace(/"/g, '""')}"*`);
  return words.length ? words.join(' AND ') : null;
}
