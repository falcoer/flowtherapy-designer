/**
 * Objets préparés : un objet (une couche, ou toutes les pièces solidaires d'un groupe) rangé dans la
 * bibliothèque avec tout son réglage (découpe, matière, bords, volume, hauteurs, peinture) et ses
 * couleurs, pour être reposé tel quel puis retouché. Sur le serveur du groupe s'il répond, sinon
 * dans ce navigateur.
 */
import type { Format } from '@ftd/core';
import { anchorFor, compact, layerBox, uid, type Doc, type Guide, type Layer } from './model';
import { serverOnline } from './server';

export interface ObjetDoc {
  /** Couches, guides renumérotés dans `guides`, sans position. */
  layers: Layer[];
  guides: Guide[];
  /** Centre de chaque couche par rapport au centre de l'objet, en fraction du petit côté. */
  at: Array<[number, number]>;
}
export interface ObjetMeta {
  id: string;
  title: string;
  updated: string;
  by?: string;
}
export interface ObjetEntry extends ObjetMeta {
  thumb: string;
  local?: boolean;
}

/** Les couches de l'objet : la couche seule, ou tout son groupe solidaire, dans l'ordre de la page. */
export const objetLayers = (l: Layer, doc: Doc) => (l.link ? doc.layers.filter((x) => x.link === l.link) : [l]);

/** Guides utilisés par une couche, renumérotés par `map`. */
function remapGuides(l: Layer, map: (i: number) => number): Layer {
  return {
    ...l,
    guide: map(l.guide),
    strokes: l.strokes.map((s) => ({ ...s, guide: map(s.guide) })),
    ...(l.border ? { border: { ...l.border, guide: map(l.border.guide), ...(l.border.guide2 !== undefined ? { guide2: map(l.border.guide2) } : {}) } } : {}),
    ...(l.glow ? { glow: { ...l.glow, guide: map(l.glow.guide) } } : {}),
  };
}

/** Prépare un objet pour la bibliothèque. */
export function packObjet(ls: Layer[], doc: Doc, f: Format): ObjetDoc {
  const m = Math.min(f.width, f.height);
  const boxes = ls.map((l) => layerBox(l, f));
  const gx = (Math.min(...boxes.map((b) => b.cx - b.w / 2)) + Math.max(...boxes.map((b) => b.cx + b.w / 2))) / 2;
  const gy = (Math.min(...boxes.map((b) => b.cy - b.h / 2)) + Math.max(...boxes.map((b) => b.cy + b.h / 2))) / 2;
  const used: number[] = [];
  const map = (i: number) => {
    if (!used.includes(i)) used.push(i);
    return used.indexOf(i);
  };
  const layers = ls.map((l) => {
    const { pins: _pins, link: _link, ...rest } = remapGuides(l, map);
    return { ...rest, id: '', dx: 0, dy: 0 } as Layer;
  });
  return {
    layers,
    guides: used.map((i) => doc.guides[i] ?? doc.guides[0]!),
    at: boxes.map((b) => [(b.cx - gx) / m, (b.cy - gy) / m]),
  };
}

/**
 * Repose un objet au point (x, y) du format : nouvelles couches solidaires, et palette du document
 * complétée des couleurs de l'objet qu'elle n'a pas encore.
 */
export function unpackObjet(o: ObjetDoc, doc: Doc, f: Format, x: number, y: number): { layers: Layer[]; guides: Guide[] } {
  const guides = [...doc.guides];
  const key = (g: Guide) => JSON.stringify(g);
  const idx = o.guides.map((g) => {
    const i = guides.findIndex((h) => key(h) === key(g));
    if (i >= 0) return i;
    guides.push(g);
    return guides.length - 1;
  });
  const m = Math.min(f.width, f.height);
  const group = o.layers.length > 1 ? uid() : undefined;
  const layers = o.layers.map((l, i) => {
    const [ox, oy] = o.at[i] ?? [0, 0];
    const a = anchorFor(doc.frame, f, x + ox * m, y + oy * m);
    return { ...remapGuides(l, (g) => idx[g] ?? 0), id: uid(), anchor: a.anchor, dx: a.dx, dy: a.dy, visible: true, ...(group ? { link: group } : {}) };
  });
  return { layers, guides };
}

/* ---------- rangement : serveur du groupe, sinon ce navigateur ---------- */

const LOCAL = 'ftd-objets';
type LocalObjet = ObjetMeta & { thumb: string; doc: ObjetDoc };
function readLocal(): LocalObjet[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL) ?? '[]') as LocalObjet[];
  } catch {
    return [];
  }
}
function writeLocal(list: LocalObjet[]) {
  try {
    localStorage.setItem(LOCAL, JSON.stringify(list));
  } catch {
    throw new Error('Plus de place dans ce navigateur pour ranger cet objet');
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin', ...init });
  if (!r.ok) {
    let msg = `${r.status}`;
    try {
      msg = ((await r.json()) as { error?: string }).error ?? msg;
    } catch {
      /* réponse sans détail */
    }
    throw new Error(msg);
  }
  return (await r.json()) as T;
}

let online: Promise<boolean> | null = null;
const isOnline = () => (online ??= serverOnline());

const slug = (t: string) =>
  `${
    t
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'objet'
  }-${Math.random().toString(36).slice(2, 6)}`;

export async function listObjets(): Promise<ObjetEntry[]> {
  const local: ObjetEntry[] = readLocal().map(({ doc: _d, ...m }) => ({ ...m, local: true }));
  if (!(await isOnline())) return local;
  try {
    const list = await call<ObjetMeta[]>('/api/objets');
    return [...list.map((m) => ({ ...m, thumb: `/api/objets/${m.id}/thumb.png?v=${encodeURIComponent(m.updated)}` })), ...local];
  } catch {
    return local;
  }
}

export async function readObjet(e: ObjetEntry): Promise<ObjetDoc> {
  if (e.local) {
    const o = readLocal().find((x) => x.id === e.id);
    if (!o) throw new Error('Objet introuvable');
    return o.doc;
  }
  return (await call<{ doc: ObjetDoc }>(`/api/objets/${e.id}`)).doc;
}

/** Range l'objet ; répond où il a été rangé. */
export async function saveObjet(title: string, doc: ObjetDoc, thumb: string): Promise<'serveur' | 'navigateur'> {
  const id = slug(title);
  if (await isOnline()) {
    await call(`/api/objets/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, doc, thumb }, compact) });
    return 'serveur';
  }
  writeLocal([{ id, title, updated: new Date().toISOString(), thumb, doc }, ...readLocal()]);
  return 'navigateur';
}

export async function removeObjet(e: ObjetEntry) {
  if (e.local) return writeLocal(readLocal().filter((x) => x.id !== e.id));
  await call(`/api/objets/${e.id}`, { method: 'DELETE' });
}
