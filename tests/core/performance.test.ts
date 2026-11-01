import { afterEach, describe, expect, it } from 'vitest';
import { frameStats, recordFrame, resetFrameStats } from '../../src/core/performance';

afterEach(() => {
  resetFrameStats();
});
describe('FPS statistics', () => {
  it('uses actual frame intervals and the slowest one percent', () => {
    resetFrameStats();
    for (let i = 0; i < 99; i++) recordFrame(10);
    recordFrame(100);
    recordFrame(NaN);
    recordFrame(0);
    const s = frameStats();
    expect(s.samples).toBe(100);
    expect(s.ms).toBe(10.9);
    expect(s.low1).toBe(10);
    expect(s.fps).toBeCloseTo(1000 / 10.9, 9);
  });
  it('resets the measured samples', () => {
    recordFrame(5);
    resetFrameStats();
    expect(frameStats().samples).toBe(0);
  });
});
