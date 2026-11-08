import { describe, expect, it } from 'vitest';
import { SHIFT_IDLE, shiftButtonOn, shiftDown, shiftUp, looksLikeMouse, shiftHeld, tiltStep, wheelAction, wheelDevice, zoomFactor, type WheelLike } from '../src/shift';

const w = (o: Partial<WheelLike>): WheelLike => ({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, shiftKey: false, altKey: false, ...o });

describe('Maj', () => {
  it('tenue par le bouton, la touche ou l’évènement', () => {
    expect(shiftHeld(false, false)).toBe(false);
    expect(shiftHeld(true, false)).toBe(true);
    expect(shiftHeld(false, true)).toBe(true);
    expect(shiftHeld(false, false, true)).toBe(true);
  });
});

describe('molette et trackpad', () => {
  it('reconnaît la molette de souris à ses crans', () => {
    expect(looksLikeMouse(w({ deltaY: 4, wheelDeltaY: -120 }))).toBe(true);
    expect(looksLikeMouse(w({ deltaY: 3, deltaMode: 1 }))).toBe(true);
    // trackpad : petits pas, souvent sur deux axes
    expect(looksLikeMouse(w({ deltaY: 2.5, wheelDeltaY: -7 }))).toBe(false);
    expect(looksLikeMouse(w({ deltaX: 1, deltaY: 40, wheelDeltaY: -120 }))).toBe(false);
    expect(looksLikeMouse(w({ deltaY: 12 }))).toBe(false);
  });

  it('un glissé garde son appareil d’un pas à l’autre', () => {
    const a = wheelDevice(null, w({ deltaY: 2.5, wheelDeltaY: -7 }), 0);
    expect(a.mouse).toBe(false);
    // pas « rond » au milieu du glissé : toujours le trackpad
    expect(wheelDevice(a, w({ deltaY: 40, wheelDeltaY: -120 }), 100).mouse).toBe(false);
    // longtemps après : on regarde à nouveau
    expect(wheelDevice(a, w({ deltaY: 40, wheelDeltaY: -120 }), 1000).mouse).toBe(true);
  });

  it('trackpad : deux doigts déplacent, pincer zoome, Maj + deux doigts tourne la Vue 3D', () => {
    expect(wheelAction(w({ deltaX: 5, deltaY: 3 }), false, false)).toBe('pan');
    expect(wheelAction(w({ deltaY: 3, ctrlKey: true }), false, false)).toBe('zoom');
    expect(wheelAction(w({ deltaY: 3, shiftKey: true }), false, false)).toBe('tilt');
    // le bouton Maj de la barre fait comme la touche
    expect(wheelAction(w({ deltaY: 3 }), true, false)).toBe('tilt');
    expect(wheelAction(w({ deltaY: 3, altKey: true }), false, false)).toBe('rotate');
  });

  it('souris : la molette zoome, Maj + molette tourne la Vue 3D', () => {
    expect(wheelAction(w({ deltaY: 4 }), false, true)).toBe('zoom');
    expect(wheelAction(w({ deltaX: 4, shiftKey: true }), false, true)).toBe('tilt');
    expect(wheelAction(w({ deltaX: 4 }), false, true)).toBe('tilt');
  });

  it('les pas de la Vue 3D suivent les deux axes, le pincement zoome plus vite', () => {
    expect(tiltStep(w({ deltaX: 10, deltaY: -20 }))).toEqual([1.5, 3]);
    expect(zoomFactor(w({ deltaY: -10, ctrlKey: true }))).toBeCloseTo(Math.exp(0.1));
    expect(zoomFactor(w({ deltaY: -10 }))).toBeCloseTo(Math.exp(0.015));
  });
});

describe('bouton Maj', () => {
  it('tenu : Maj le temps de l’appui', () => {
    const a = shiftDown(SHIFT_IDLE, 0);
    expect(shiftButtonOn(a)).toBe(true);
    const b = shiftUp(a, 2000);
    expect(shiftButtonOn(b)).toBe(false);
  });

  it('double appui : verrouillée, puis un seul appui la relâche', () => {
    let s = shiftUp(shiftDown(SHIFT_IDLE, 0), 100);
    expect(shiftButtonOn(s)).toBe(false);
    s = shiftDown(s, 250);
    expect(s.latched).toBe(true);
    s = shiftUp(s, 330);
    expect(shiftButtonOn(s)).toBe(true);
    // un appui relâche, et ne relance pas un double appui
    s = shiftDown(s, 2000);
    expect(shiftButtonOn(s)).toBe(false);
    s = shiftUp(s, 2050);
    expect(shiftButtonOn(s)).toBe(false);
    expect(shiftDown(s, 2200).latched).toBe(false);
  });

  it('deux appuis espacés, ou un long appui, ne verrouillent pas', () => {
    let s = shiftUp(shiftDown(SHIFT_IDLE, 0), 100);
    expect(shiftDown(s, 800).latched).toBe(false);
    s = shiftUp(shiftDown(SHIFT_IDLE, 0), 1500);
    expect(shiftDown(s, 1600).latched).toBe(false);
  });
});
