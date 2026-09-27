import { describe, expect, it } from 'vitest';
import type { Candle } from '../../lib/types';
import { detectAutoTrendlines, findPivots } from './autoTrendlines';

describe('findPivots', () => {
  it('identifies swing highs and swing lows', () => {
    // Generate a simple sinusoidal / wave pattern
    const candles: Candle[] = [];
    const baseTime = 1790500000;

    for (let i = 0; i < 30; i++) {
      // Peaks at i=5, 15, 25; Valleys at i=10, 20
      const wave = Math.sin((i / 10) * Math.PI * 2);
      const close = 100 + wave * 10;
      candles.push({
        time: baseTime + i * 900,
        open: close - 1,
        high: close + 2,
        low: close - 2,
        close,
        volume: 100,
        closed: true,
      });
    }

    const { highs, lows } = findPivots(candles, 3, 2);
    expect(highs.length).toBeGreaterThanOrEqual(2);
    expect(lows.length).toBeGreaterThanOrEqual(2);
  });
});

describe('detectAutoTrendlines', () => {
  it('returns null when candles array is too small', () => {
    const res = detectAutoTrendlines([]);
    expect(res.resistance).toBeNull();
    expect(res.support).toBeNull();
  });

  it('detects symmetrical triangle forming converging LTB and LTA', () => {
    const candles: Candle[] = [];
    const baseTime = 1790500000;

    // Simulate converging wedge/triangle:
    // Upper boundary drops from 120 -> 105
    // Lower boundary rises from 80 -> 95
    for (let i = 0; i < 40; i++) {
      const topBoundary = 120 - i * 0.35;
      const bottomBoundary = 80 + i * 0.35;
      const mid = (topBoundary + bottomBoundary) / 2;
      const oscillation = Math.sin(i * 0.8);
      const close = mid + oscillation * ((topBoundary - bottomBoundary) / 2.2);

      candles.push({
        time: baseTime + i * 900,
        open: close,
        high: Math.min(topBoundary, close + 1.5),
        low: Math.max(bottomBoundary, close - 1.5),
        close,
        volume: 50,
        closed: true,
      });
    }

    const result = detectAutoTrendlines(candles);
    expect(result.highPivots.length).toBeGreaterThan(0);
    expect(result.lowPivots.length).toBeGreaterThan(0);

    // If both are found, resistance should have negative slope and support positive slope
    if (result.resistance && result.support) {
      expect(result.resistance.p2.price).toBeLessThan(result.resistance.p1.price); // Descending LTB
      expect(result.support.p2.price).toBeGreaterThan(result.support.p1.price); // Ascending LTA
    }
  });
});
