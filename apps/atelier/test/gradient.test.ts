import { describe, it, expect } from 'vitest';
import { gradT } from '../src/gradient';
const base = { cx: 0.5, cy: 0.5, angle: 90, spread: 1, repeat: 1 } as const;
describe('gradT', () => {
  it('linear top to bottom', () => {
    expect(gradT({ ...base, mode: 'linear' }, 0.5, 0, 1)).toBeCloseTo(0);
    expect(gradT({ ...base, mode: 'linear' }, 0.5, 1, 1)).toBeCloseTo(1);
    expect(gradT({ ...base, mode: 'linear', angle: 0 }, 1, 0.3, 2)).toBeCloseTo(1);
  });
  it('radial center 0 corner 1', () => {
    expect(gradT({ ...base, mode: 'radial' }, 0.5, 0.5, 1)).toBeCloseTo(0);
    expect(gradT({ ...base, mode: 'radial' }, 1, 1, 1)).toBeCloseTo(1);
  });
  it('conic quarter', () => {
    expect(gradT({ ...base, mode: 'conic', angle: 0 }, 0.5, 1, 1)).toBeCloseTo(0.25);
  });
  it('diamond corner', () => {
    expect(gradT({ ...base, mode: 'diamond', angle: 0 }, 1, 1, 1)).toBeCloseTo(1);
  });
  it('repeat + mirror', () => {
    expect(gradT({ ...base, mode: 'linear', repeat: 2 }, 0.5, 0.75, 1)).toBeCloseTo(0.5);
    expect(gradT({ ...base, mode: 'linear', repeat: 2, mirror: true }, 0.5, 0.75, 1)).toBeCloseTo(0.5);
    expect(gradT({ ...base, mode: 'linear', repeat: 2, mirror: true }, 0.5, 0.6, 1)).toBeCloseTo(0.8);
  });
});
