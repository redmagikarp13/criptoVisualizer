import { describe, expect, it } from 'vitest';
import {
  calculateLineEquation,
  findTrendlinesConvergence,
  formatApexPrice,
  type TrendlineDrawing,
} from './drawings';

describe('calculateLineEquation', () => {
  it('calculates slope and intercept accurately', () => {
    const eq = calculateLineEquation({ time: 1000, price: 10 }, { time: 2000, price: 20 });
    expect(eq).not.toBeNull();
    expect(eq?.slope).toBeCloseTo(0.01);
    expect(eq?.intercept).toBeCloseTo(0);
  });

  it('handles reverse point ordering (p1 > p2) gracefully', () => {
    const eq = calculateLineEquation({ time: 2000, price: 20 }, { time: 1000, price: 10 });
    expect(eq).not.toBeNull();
    expect(eq?.slope).toBeCloseTo(0.01);
    expect(eq?.start.time).toBe(1000);
    expect(eq?.end.time).toBe(2000);
  });

  it('returns null for vertical line (same time)', () => {
    const eq = calculateLineEquation({ time: 1000, price: 10 }, { time: 1000, price: 20 });
    expect(eq).toBeNull();
  });
});

describe('findTrendlinesConvergence', () => {
  it('predicts symmetrical triangle apex at 01:00 am', () => {
    // Reference base time: 2026-09-27 10:00:00 UTC = 1790503200
    // Target apex time: 2026-09-28 01:00:00 UTC = 1790503200 + 15 * 3600 = 1790557200
    const nowSec = 1790503200;
    const targetApexTime = nowSec + 15 * 3600; // in 15 hours = 01:00 next day
    const targetApexPrice = 0.2742;

    // Line 1: Descending resistance line (LTB)
    // At t = now - 5h (nowSec - 18000), price = 0.2850
    // At t = now (nowSec), price = 0.2769
    // slope1 = (0.2742 - 0.2850) / (targetApexTime - (nowSec - 18000))
    const t1_start = nowSec - 5 * 3600;
    const slope1 = -0.00015;
    const p1_start = targetApexPrice - slope1 * (targetApexTime - t1_start);
    const line1: TrendlineDrawing = {
      id: 'ltb-1',
      type: 'trendline',
      color: '#f43f5e',
      p1: { time: t1_start, price: p1_start },
      p2: { time: nowSec, price: targetApexPrice - slope1 * (targetApexTime - nowSec) },
    };

    // Line 2: Ascending support line (LTA)
    const t2_start = nowSec - 4 * 3600;
    const slope2 = 0.00012;
    const p2_start = targetApexPrice - slope2 * (targetApexTime - t2_start);
    const line2: TrendlineDrawing = {
      id: 'lta-1',
      type: 'trendline',
      color: '#10b981',
      p1: { time: t2_start, price: p2_start },
      p2: { time: nowSec, price: targetApexPrice - slope2 * (targetApexTime - nowSec) },
    };

    const convergences = findTrendlinesConvergence([line1, line2], nowSec);
    expect(convergences).toHaveLength(1);

    const c = convergences[0];
    expect(c.apexTime).toBeCloseTo(targetApexTime, -1);
    expect(c.apexPrice).toBeCloseTo(targetApexPrice, 4);
    expect(c.patternType).toBe('symmetrical');
    expect(c.patternName).toBe('Triângulo Simétrico');
    expect(c.remainingFormatted).toContain('15h');
  });

  it('detects ascending triangle when upper line is horizontal', () => {
    const nowSec = 1790500000;
    const apexTime = nowSec + 7200; // in 2 hours
    const apexPrice = 50000;

    const lineRes: TrendlineDrawing = {
      id: 'res',
      type: 'trendline',
      color: '#f43f5e',
      p1: { time: nowSec - 7200, price: apexPrice },
      p2: { time: nowSec, price: apexPrice }, // horizontal slope = 0
    };

    const lineSup: TrendlineDrawing = {
      id: 'sup',
      type: 'trendline',
      color: '#10b981',
      p1: { time: nowSec - 7200, price: 48000 },
      p2: { time: nowSec, price: 49000 }, // rising slope
    };

    const convergences = findTrendlinesConvergence([lineRes, lineSup], nowSec);
    expect(convergences).toHaveLength(1);
    expect(convergences[0].patternType).toBe('ascending');
    expect(convergences[0].patternName).toBe('Triângulo Ascendente');
    expect(convergences[0].apexPrice).toBeCloseTo(50000);
    expect(convergences[0].apexTime).toBeCloseTo(apexTime);
  });

  it('detects falling wedge when both lines descend and converge', () => {
    const nowSec = 1790500000;
    const line1: TrendlineDrawing = {
      id: 'wedge1',
      type: 'trendline',
      color: '#38bdf8',
      p1: { time: nowSec - 3600, price: 100 },
      p2: { time: nowSec, price: 90 }, // slope = -10 / 3600
    };

    const line2: TrendlineDrawing = {
      id: 'wedge2',
      type: 'trendline',
      color: '#38bdf8',
      p1: { time: nowSec - 3600, price: 80 },
      p2: { time: nowSec, price: 76 }, // slope = -4 / 3600 (less steep, converging)
    };

    const convergences = findTrendlinesConvergence([line1, line2], nowSec);
    expect(convergences).toHaveLength(1);
    expect(convergences[0].patternType).toBe('falling_wedge');
    expect(convergences[0].patternName).toBe('Cunha Descendente');
  });

  it('ignores parallel lines', () => {
    const nowSec = 1790500000;
    const line1: TrendlineDrawing = {
      id: 'ch1',
      type: 'trendline',
      color: '#38bdf8',
      p1: { time: nowSec - 3600, price: 100 },
      p2: { time: nowSec, price: 110 },
    };

    const line2: TrendlineDrawing = {
      id: 'ch2',
      type: 'trendline',
      color: '#38bdf8',
      p1: { time: nowSec - 3600, price: 80 },
      p2: { time: nowSec, price: 90 }, // exactly parallel
    };

    const convergences = findTrendlinesConvergence([line1, line2], nowSec);
    expect(convergences).toHaveLength(0);
  });

  it('ignores lines that converged in the past', () => {
    const nowSec = 1790500000;
    // Lines already crossed 1 hour ago (nowSec - 3600) and are now diverging
    const line1: TrendlineDrawing = {
      id: 'p1',
      type: 'trendline',
      color: '#38bdf8',
      p1: { time: nowSec - 7200, price: 100 },
      p2: { time: nowSec, price: 120 },
    };

    const line2: TrendlineDrawing = {
      id: 'p2',
      type: 'trendline',
      color: '#38bdf8',
      p1: { time: nowSec - 7200, price: 120 },
      p2: { time: nowSec, price: 100 },
    };

    const convergences = findTrendlinesConvergence([line1, line2], nowSec);
    expect(convergences).toHaveLength(0);
  });
});

describe('formatApexPrice', () => {
  it('formats according to price magnitude', () => {
    expect(formatApexPrice(65432.1)).toBe('65.432,10');
    expect(formatApexPrice(0.2742)).toBe('0,2742');
    expect(formatApexPrice(0.00012345)).toBe('0,00012345');
  });
});
