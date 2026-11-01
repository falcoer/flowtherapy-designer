/**
 * Dégradés : linéaire (orienté par un angle), radial (du centre vers le bord)
 * ou sphérique (point lumineux décalé, effet de volume). La première teinte
 * est au départ : en haut à gauche pour la sphère, au centre pour le radial.
 */

export type GradientType = 'linear' | 'radial' | 'sphere';

export interface Gradient {
  type: GradientType;
  stops: string[];
  /** Linéaire : 180 = de haut en bas. Sphère : 180 = lumière en haut à gauche, tourne avec l'angle. */
  angle: number;
}

/** Coordonnées d'un dégradé linéaire orienté comme en CSS (180° = de haut en bas). */
export function gradientVector(angle: number) {
  const r = (angle * Math.PI) / 180;
  const dx = Math.sin(r) / 2;
  const dy = -Math.cos(r) / 2;
  return { x1: 0.5 - dx, y1: 0.5 - dy, x2: 0.5 + dx, y2: 0.5 + dy };
}

export interface GradientSpec {
  tag: 'linearGradient' | 'radialGradient';
  attrs: Record<string, number>;
  stops: Array<{ offset: number; color: string }>;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function gradientSpec(g: Gradient): GradientSpec {
  const stops = g.stops.map((color, i) => ({ offset: r3(i / Math.max(1, g.stops.length - 1)), color }));
  if (g.type === 'radial') return { tag: 'radialGradient', attrs: { cx: 0.5, cy: 0.5, r: 0.5 }, stops };
  if (g.type === 'sphere') {
    // point lumineux : l'angle par défaut (180°) le place en haut à gauche
    const a = ((g.angle + 135) * Math.PI) / 180;
    const fx = r3(0.5 + Math.sin(a) * 0.22);
    const fy = r3(0.5 - Math.cos(a) * 0.22);
    return { tag: 'radialGradient', attrs: { cx: fx, cy: fy, fx, fy, r: 0.72 }, stops };
  }
  const v = gradientVector(g.angle);
  return { tag: 'linearGradient', attrs: { x1: r3(v.x1), y1: r3(v.y1), x2: r3(v.x2), y2: r3(v.y2) }, stops };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Définition SVG (export). */
export function gradientSvg(id: string, g: Gradient): string {
  const s = gradientSpec(g);
  const attrs = Object.entries(s.attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
  const stops = s.stops.map((st) => `<stop offset="${st.offset}" stop-color="${esc(st.color)}"/>`).join('');
  return `<${s.tag} id="${id}" ${attrs}>${stops}</${s.tag}>`;
}

/** Aperçu CSS (vignettes, bandeaux). */
export function gradientCss(g: Gradient): string {
  if (g.type === 'linear') return `linear-gradient(${g.angle}deg, ${g.stops.join(', ')})`;
  if (g.type === 'radial') return `radial-gradient(circle, ${g.stops.join(', ')})`;
  const a = ((g.angle + 135) * Math.PI) / 180;
  return `radial-gradient(circle at ${Math.round(50 + Math.sin(a) * 22)}% ${Math.round(50 - Math.cos(a) * 22)}%, ${g.stops.join(', ')})`;
}
