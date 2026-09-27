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
      return {
        setData: (points: unknown[]) => { state.points = points; },
        update: (point: unknown) => state.points.push(point),
        createPriceLine: () => {},
        priceToCoordinate: () => 100,
      };
    },
    panes: () => [],
    remove: () => {},
    timeScale: () => ({
      setVisibleLogicalRange: () => {},
      timeToCoordinate: () => 100,
      coordinateToTime: () => 100,
      logicalToCoordinate: () => 100,
      coordinateToLogical: () => 100,
    }),
  }),
}));

const storage = new Map<string, string>();
const fakeLocalStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
};
Object.defineProperty(globalThis, 'localStorage', {
  value: fakeLocalStorage,
  writable: true,
});

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

it('renderiza botão de projeção de tendências e exibe banner de ápice quando há confluência', async () => {
  const now = Math.floor(Date.now() / 1000);
  const symbol = 'TESTPAIR';

  const line1 = {
    id: 'l1',
    type: 'trendline',
    color: '#f43f5e',
    p1: { time: now - 3600, price: 100 },
    p2: { time: now, price: 90 }, // descending
  };
  const line2 = {
    id: 'l2',
    type: 'trendline',
    color: '#10b981',
    p1: { time: now - 3600, price: 60 },
    p2: { time: now, price: 70 }, // ascending
  };

  localStorage.setItem(`criptovisualizer:drawings:${symbol}`, JSON.stringify([line1, line2]));

  const candles = [
    { time: now - 1800, open: 75, high: 85, low: 70, close: 80, volume: 100, closed: true },
    { time: now, open: 80, high: 88, low: 78, close: 82, volume: 120, closed: false },
  ];
  const settings = defaultPreferences.indicators;

  const { findByRole, findByText } = render(
    <MarketChart candles={candles} indicators={null} settings={settings} dark={false} symbol={symbol} />
  );

  // Botão de Projeção de Tendências na barra de ferramentas
  const projectBtn = await findByRole('button', { name: /Projeção de Tendência/i });
  expect(projectBtn).toBeDefined();

  // Banner flutuante com cálculo do ápice e padrão
  const banner = await findByRole('status');
  expect(banner).toBeDefined();
  expect(await findByText(/Triângulo Simétrico/i)).toBeDefined();
  expect(await findByText(/Ver Ápice/i)).toBeDefined();

  localStorage.removeItem(`criptovisualizer:drawings:${symbol}`);
});

