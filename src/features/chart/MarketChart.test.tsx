import { render, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { defaultPreferences } from '../settings/preferences';
import { calculateIndicators } from '../indicators/calculations';
import { MarketChart } from './MarketChart';

const canvas = vi.hoisted(() => ({ series: [] as { options: Record<string, unknown>; points: unknown[] }[] }));
vi.mock('lightweight-charts', async importOriginal => ({
  ...await importOriginal<typeof import('lightweight-charts')>(),
  createChart: () => ({
    addSeries: (_definition: unknown, options: Record<string, unknown>) => {
      const state = { options, points: [] as unknown[] }; canvas.series.push(state);
      return { setData: (points: unknown[]) => { state.points = points; }, update: (point: unknown) => state.points.push(point), createPriceLine: () => {} };
    },
    panes: () => [], remove: () => {}, timeScale: () => ({ setVisibleLogicalRange: () => {} }),
  }),
}));
it('mostra último preço e remove médias antigas enquanto os parâmetros são recalculados', async () => {
  canvas.series.length = 0;
  const candles = [{ time: 60, open: 10, high: 12, low: 9, close: 11, volume: 2, closed: true }];
  const settings = defaultPreferences.indicators;
  const { rerender } = render(<MarketChart candles={candles} indicators={calculateIndicators(candles, settings)} settings={settings} dark={false} />);
  await waitFor(() => expect(canvas.series.find(series => series.options.title === 'SMA')?.points).toHaveLength(1));
  expect(canvas.series[0].options.lastValueVisible).toBe(true);
  rerender(<MarketChart candles={candles} indicators={null} settings={{ ...settings, smaPeriod: 5 }} dark={false} />);
  await waitFor(() => expect(canvas.series.find(series => series.options.title === 'SMA')?.points).toEqual([]));
});
