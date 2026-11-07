import type { Format } from '@ftd/core';
import { anchorFor, layerBox, type Doc, type Layer } from './model';

/** Forme de chaque groupe de pièces solidaires : la pièce de tête, et la place des autres par rapport à elle. */
export type LinkShapes = Map<string, { lead: string; w: number; parts: Map<string, { ox: number; oy: number; w: number; h: number }> }>;

/**
 * Relevé des groupes solidaires avant un changement de format ou de marge.
 * La tête est la pièce qui tient le plus de bords, sinon la plus grande ;
 * les écarts sont en fraction du petit côté, pour suivre l'échelle du format.
 */
export function linkShapes(doc: Doc, f: Format): LinkShapes {
  const out: LinkShapes = new Map();
  const groups = new Map<string, Layer[]>();
  for (const l of doc.layers) if (l.link && l.kind !== 'surface') groups.set(l.link, [...(groups.get(l.link) ?? []), l]);
  const m = Math.min(f.width, f.height);
  const pinCount = (l: Layer) => (l.pins ? (['left', 'right', 'top', 'bottom'] as const).filter((s) => l.pins![s]).length : 0);
  for (const [g, ls] of groups) {
    if (ls.length < 2) continue;
    const lead = ls.reduce((a, b) => (pinCount(b) > pinCount(a) || (pinCount(b) === pinCount(a) && b.w * b.h > a.w * a.h) ? b : a));
    const L = layerBox(lead, f);
    const parts = new Map<string, { ox: number; oy: number; w: number; h: number }>();
    for (const l of ls) {
      if (l === lead) continue;
      const b = layerBox(l, f);
      parts.set(l.id, { ox: (b.cx - L.cx) / m, oy: (b.cy - L.cy) / m, w: l.w, h: l.h });
    }
    out.set(g, { lead: lead.id, w: lead.w, parts });
  }
  return out;
}

/** Replace les pièces solidaires autour de leur tête, comme relevées avant le changement : le groupe ne se déforme pas. */
export function keepLinks(doc: Doc, f: Format, links: LinkShapes): Doc {
  if (!links.size) return doc;
  const m = Math.min(f.width, f.height);
  const byId = new Map(doc.layers.map((l) => [l.id, l]));
  const moved = new Map<string, Layer>();
  for (const g of links.values()) {
    const lead = byId.get(g.lead);
    if (!lead) continue;
    const L = layerBox(lead, f);
    const k = g.w ? lead.w / g.w : 1;
    for (const [id, p] of g.parts) {
      const l = byId.get(id);
      if (!l || l.link !== lead.link) continue;
      const a = anchorFor(doc.frame, f, L.cx + p.ox * m * k, L.cy + p.oy * m * k);
      moved.set(id, { ...l, w: p.w * k, h: p.h * k, anchor: a.anchor, dx: a.dx, dy: a.dy, grip: undefined });
    }
  }
  return moved.size ? { ...doc, layers: doc.layers.map((l) => moved.get(l.id) ?? l) } : doc;
}
