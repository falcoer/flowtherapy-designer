import { describe, expect, it } from 'vitest';
import { afterPen, fingerDrawsFor, ignoreTouch, pointerTool } from '../src/finger';

describe('doigt et stylet', () => {
  it('en automatique, le doigt dessine seulement sans stylet vu ni souris', () => {
    expect(fingerDrawsFor('auto', false, false)).toBe(true);
    expect(fingerDrawsFor('auto', true, false)).toBe(false);
    expect(fingerDrawsFor('auto', false, true)).toBe(false);
  });

  it('« Dessine » et « Déplace » fixent le doigt', () => {
    expect(fingerDrawsFor('draw', true, true)).toBe(true);
    expect(fingerDrawsFor('move', false, false)).toBe(false);
  });

  it('un stylet qui se montre rend « Dessine » à l’automatique et le dit', () => {
    expect(afterPen('draw', true)).toEqual({ mode: 'auto', toast: true });
    expect(afterPen('auto', true)).toEqual({ mode: 'auto', toast: true });
    // le doigt ne dessinait pas : rien à dire
    expect(afterPen('auto', false)).toEqual({ mode: 'auto', toast: false });
    expect(afterPen('move', false)).toEqual({ mode: 'move', toast: false });
  });

  it('le stylet tient l’outil, le doigt déplace sauf s’il dessine', () => {
    expect(pointerTool('pen', false, 'paint', false)).toBe('paint');
    expect(pointerTool('mouse', false, 'cut', false)).toBe('cut');
    expect(pointerTool('touch', false, 'paint', false)).toBe('move');
    expect(pointerTool('touch', true, 'paint', false)).toBe('paint');
    // le volet des attributs : tout pointeur déplace
    expect(pointerTool('pen', false, 'paint', true)).toBe('move');
  });

  it('stylet posé : les touchers de la paume sont ignorés', () => {
    expect(ignoreTouch('touch', [{ type: 'pen' }])).toBe(true);
    expect(ignoreTouch('touch', [{ type: 'touch' }])).toBe(false);
    expect(ignoreTouch('pen', [{ type: 'pen' }])).toBe(false);
    expect(ignoreTouch('touch', [])).toBe(false);
  });
});
