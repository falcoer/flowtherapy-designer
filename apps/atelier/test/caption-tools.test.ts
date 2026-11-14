import { describe, expect, it } from 'vitest';
import { plainCaption, styleCaption } from '../src/caption-tools';

describe('texte d’accompagnement en gras et en italique', () => {
  it('passe les lettres et les chiffres en gras, et revient en lettres ordinaires', () => {
    const b = styleCaption('Concert 12 déc.', 'bold');
    expect(b).toBe('𝗖𝗼𝗻𝗰𝗲𝗿𝘁 𝟭𝟮 𝗱𝗲́𝗰.');
    expect(plainCaption(b)).toBe('Concert 12 déc.');
    // déjà tout en gras : le même bouton l'enlève
    expect(styleCaption(b, 'bold')).toBe('Concert 12 déc.');
  });

  it('l’italique remplace le gras, et garde les chiffres ordinaires', () => {
    const i = styleCaption(styleCaption('Bal 20h', 'bold'), 'italic');
    expect(i).toBe('𝘉𝘢𝘭 20𝘩');
    expect(plainCaption(i)).toBe('Bal 20h');
  });

  it('laisse les émojis et la ponctuation tels quels', () => {
    expect(styleCaption('🎶 Ce soir !', 'bold')).toBe('🎶 𝗖𝗲 𝘀𝗼𝗶𝗿 !');
  });
});
