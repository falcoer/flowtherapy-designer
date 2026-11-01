/** Fractions lisibles ("1/3", "0", "1") utilisées pour nommer les ancrages. */

export function parseFraction(text: string): number {
  const t = text.trim();
  const m = /^(-?\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?$/.exec(t);
  if (!m) throw new Error(`Fraction invalide : "${text}"`);
  const num = Number(m[1]);
  const den = m[2] === undefined ? 1 : Number(m[2]);
  if (den === 0) throw new Error(`Dénominateur nul : "${text}"`);
  return num / den;
}

/** Écrit une valeur entre 0 et 1 sous forme de fraction simple (dénominateur ≤ 12). */
export function formatFraction(value: number, maxDen = 12): string {
  if (Math.abs(value) < 1e-9) return '0';
  if (Math.abs(value - 1) < 1e-9) return '1';
  for (let den = 2; den <= maxDen; den++) {
    const num = Math.round(value * den);
    if (Math.abs(num / den - value) < 1e-9) {
      const g = gcd(num, den);
      return `${num / g}/${den / g}`;
    }
  }
  return String(Number(value.toFixed(4)));
}

function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b);
}
