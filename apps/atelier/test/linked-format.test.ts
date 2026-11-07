import { describe, expect, it } from "vitest";
import { blankDoc } from "../src/blank";
import {
  anchorFor,
  formatOf,
  layerBox,
  setAnchorDensity,
  setAnchorExtras,
  setAnchorMargin,
  type Doc,
  type Layer,
} from "../src/model";
import { keepLinks, linkShapes } from "../src/links";

const a4 = formatOf("a4");
const piece = (
  doc: Doc,
  id: string,
  x: number,
  y: number,
  w: number,
  link?: string,
): Layer => {
  const a = anchorFor(doc.frame, a4, x, y);
  return {
    ...doc.layers[0]!,
    id,
    name: id,
    kind: "shape",
    anchor: a.anchor,
    dx: a.dx,
    dy: a.dy,
    w,
    h: w,
    link,
  };
};
/** Écarts des yeux au visage, en fraction de la largeur du visage. */
const gaps = (doc: Doc) => {
  const f = formatOf(doc.formatId);
  const face = layerBox(doc.layers.find((l) => l.id === "visage")!, f);
  return ["oeil-g", "oeil-d"].map((id) => {
    const b = layerBox(doc.layers.find((l) => l.id === id)!, f);
    return {
      x: (b.cx - face.cx) / face.w,
      y: (b.cy - face.cy) / face.w,
      w: b.w / face.w,
    };
  });
};

describe("pièces solidaires au changement de format", () => {
  setAnchorDensity(4);
  setAnchorExtras(undefined);
  setAnchorMargin(0.05);
  const base = blankDoc();
  const doc: Doc = {
    ...base,
    layers: [
      base.layers[0]!,
      piece(base, "visage", 105, 150, 0.6, "g"),
      piece(base, "oeil-g", 78, 141, 0.12, "g"),
      piece(base, "oeil-d", 133, 160, 0.1, "g"),
    ],
  };
  const before = gaps(doc);

  for (const id of ["banniere", "story", "carre"]) {
    it(`les yeux restent dans le visage en ${id}`, () => {
      const f = formatOf(id);
      const next = keepLinks({ ...doc, formatId: id }, f, linkShapes(doc, a4));
      const after = gaps(next);
      for (let i = 0; i < 2; i++) {
        expect(after[i]!.x).toBeCloseTo(before[i]!.x, 6);
        expect(after[i]!.y).toBeCloseTo(before[i]!.y, 6);
        expect(after[i]!.w).toBeCloseTo(before[i]!.w, 6);
      }
      // et le retour au format d'origine les remet au même endroit
      const back = keepLinks(
        { ...next, formatId: "a4" },
        a4,
        linkShapes(next, f),
      );
      for (const l of doc.layers.slice(1)) {
        const b0 = layerBox(l, a4);
        const b1 = layerBox(back.layers.find((x) => x.id === l.id)!, a4);
        expect(b1.cx).toBeCloseTo(b0.cx, 4);
        expect(b1.cy).toBeCloseTo(b0.cy, 4);
      }
    });
  }

  it("suivent la pièce qui tient un bord de la page, même agrandie", () => {
    const pinned: Doc = {
      ...doc,
      layers: doc.layers.map((l) =>
        l.id === "oeil-d" ? { ...l, pins: { right: true, left: true } } : l,
      ),
    };
    const links = linkShapes(pinned, a4);
    expect([...links.values()][0]!.lead).toBe("oeil-d");
    // les bords tenus ont déplacé et agrandi l'œil droit (ce que fait holdPins)
    const f = formatOf("banniere");
    const moved: Doc = {
      ...pinned,
      formatId: "banniere",
      layers: pinned.layers.map((l) =>
        l.id === "oeil-d"
          ? { ...l, dx: l.dx + 0.1, w: l.w * 2, h: l.h * 2 }
          : l,
      ),
    };
    const after = gaps(keepLinks(moved, f, links));
    for (let i = 0; i < 2; i++) {
      expect(after[i]!.x).toBeCloseTo(before[i]!.x, 6);
      expect(after[i]!.y).toBeCloseTo(before[i]!.y, 6);
      expect(after[i]!.w).toBeCloseTo(before[i]!.w, 6);
    }
  });

  it("gardent leur place quand la marge change", () => {
    const links = linkShapes(doc, a4);
    setAnchorMargin(0.2);
    const next = keepLinks({ ...doc, margin: 0.2 }, a4, links);
    const after = gaps(next);
    setAnchorMargin(0.05);
    for (let i = 0; i < 2; i++) {
      expect(after[i]!.x).toBeCloseTo(before[i]!.x, 6);
      expect(after[i]!.y).toBeCloseTo(before[i]!.y, 6);
    }
  });
});
