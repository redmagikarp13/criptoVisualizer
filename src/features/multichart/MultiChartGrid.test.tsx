import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { defaultPreferences } from '../settings/preferences';
import { calculateIndicators } from '../indicators/calculations';
import { MultiChartGrid } from './MultiChartGrid';

// Mock do MarketChart para verificar os props recebidos
const marketChartProps: Record<string, unknown>[] = [];
vi.mock('../chart/MarketChart', () => ({
  MarketChart: (props: Record<string, unknown>) => {
    marketChartProps.push(props);
    return <div data-testid="market-chart" data-symbol={props.symbol as string} />;
  },
}));

vi.mock('../market/useMarket', () => ({
  useMarket: () => ({
    candles: [],
    quotes: {},
    instruments: [],
    binanceStatus: 'connected',
    comparison: {},
    reconnect: () => {},
  }),
}));

vi.mock('../indicators/useIndicators', () => ({
  useIndicators: () => ({ result: null, error: '' }),
}));


describe('MultiChartGrid e pipeline de indicadores', () => {
  it('encaminha primaryIndicators para o MarketChart do painel primário', () => {
    marketChartProps.length = 0;
    const candles = [{ time: 60, open: 10, high: 12, low: 9, close: 11, volume: 2, closed: true }];
    const settings = defaultPreferences.indicators;
    const computedIndicators = calculateIndicators(candles, settings);

    render(
      <MultiChartGrid
        primarySymbol="BTCUSDT"
        primaryInterval="15m"
        primaryCandles={candles}
        primaryIndicators={computedIndicators}
        settings={settings}
        dark={true}
        availableSymbols={['BTCUSDT', 'ETHUSDT']}
        onActiveSymbolChange={() => {}}
      />,
    );

    expect(screen.getAllByTestId('market-chart')).toHaveLength(1);
    expect(marketChartProps[0].indicators).toBe(computedIndicators);
    expect(marketChartProps[0].settings).toBe(settings);
  });
});
