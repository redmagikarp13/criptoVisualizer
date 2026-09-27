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
    candles: [{ time: 60, open: 10, high: 12, low: 9, close: 11, volume: 2, closed: true }],
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

  it('permite alternar o botão de sincronização de zoom/movimento', async () => {
    const { fireEvent } = await import('@testing-library/react');
    render(
      <MultiChartGrid
        primarySymbol="BTCUSDT"
        primaryInterval="15m"
        primaryCandles={[]}
        primaryIndicators={null}
        settings={defaultPreferences.indicators}
        dark={true}
        availableSymbols={['BTCUSDT', 'ETHUSDT']}
        onActiveSymbolChange={() => {}}
      />,
    );

    const syncBtn = screen.getByRole('button', { name: /Zoom Sincronizado|Zoom Independente/i });
    expect(syncBtn).toBeInTheDocument();
    const initialText = syncBtn.textContent;
    fireEvent.click(syncBtn);
    expect(syncBtn.textContent).not.toBe(initialText);
  });

  it('ao trocar para layout 2x2 e clicar no último ativo, não substitui o primeiro gráfico', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const onActiveSymbolChange = vi.fn();

    const { rerender } = render(
      <MultiChartGrid
        primarySymbol="BTCUSDT"
        primaryInterval="15m"
        primaryCandles={[{ time: 60, open: 10, high: 12, low: 9, close: 11, volume: 2, closed: true }]}
        primaryIndicators={null}
        settings={defaultPreferences.indicators}
        dark={true}
        availableSymbols={['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT']}
        onActiveSymbolChange={onActiveSymbolChange}
      />,
    );

    // Seleciona layout 2x2
    const btn2x2 = screen.getByRole('button', { name: '2x2' });
    fireEvent.click(btn2x2);

    const charts = screen.getAllByTestId('market-chart');
    expect(charts).toHaveLength(4);

    // O primeiro gráfico deve ser BTCUSDT
    expect(charts[0].getAttribute('data-symbol')).toBe('BTCUSDT');
    const lastSymbol = charts[3].getAttribute('data-symbol');
    expect(lastSymbol).not.toBe('BTCUSDT');

    // Clica no 4º painel para focar nele
    const paneCells = document.querySelectorAll('.chart-pane-cell');
    expect(paneCells).toHaveLength(4);
    fireEvent.click(paneCells[3]);

    // onActiveSymbolChange deve ser chamado com o símbolo do último painel e seu intervalo
    expect(onActiveSymbolChange).toHaveBeenCalledWith(lastSymbol, '15m');

    // Simula o re-render vindo do App.tsx quando preferences.symbol atualiza para lastSymbol (eco do parent)
    rerender(
      <MultiChartGrid
        primarySymbol={lastSymbol!}
        primaryInterval="15m"
        primaryCandles={[{ time: 60, open: 10, high: 12, low: 9, close: 11, volume: 2, closed: true }]}
        primaryIndicators={null}
        settings={defaultPreferences.indicators}
        dark={true}
        availableSymbols={['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT']}
        onActiveSymbolChange={onActiveSymbolChange}
      />,
    );

    // O 1º gráfico CONTINUA SENDO BTCUSDT, nunca é sobrescrito pelo eco do parent!
    const updatedCharts = screen.getAllByTestId('market-chart');
    expect(updatedCharts[0].getAttribute('data-symbol')).toBe('BTCUSDT');
    expect(updatedCharts[3].getAttribute('data-symbol')).toBe(lastSymbol);
  });

  it('permite alternar e usar a sincronização de tempos gráficos (timeframe)', async () => {
    const { fireEvent } = await import('@testing-library/react');
    render(
      <MultiChartGrid
        primarySymbol="BTCUSDT"
        primaryInterval="15m"
        primaryCandles={[{ time: 60, open: 10, high: 12, low: 9, close: 11, volume: 2, closed: true }]}
        primaryIndicators={null}
        settings={defaultPreferences.indicators}
        dark={true}
        availableSymbols={['BTCUSDT', 'ETHUSDT']}
        onActiveSymbolChange={() => {}}
      />,
    );

    const syncTimeBtn = screen.getByRole('button', { name: /Tempo Sincronizado|Tempo Independente/i });
    expect(syncTimeBtn).toBeInTheDocument();
    const initialText = syncTimeBtn.textContent;
    fireEvent.click(syncTimeBtn);
    expect(syncTimeBtn.textContent).not.toBe(initialText);
  });

  it('exibe o contador regressivo de tempo de fechamento da vela em cada painel', async () => {
    render(
      <MultiChartGrid
        primarySymbol="BTCUSDT"
        primaryInterval="15m"
        primaryCandles={[{ time: 60, open: 10, high: 12, low: 9, close: 11, volume: 2, closed: true }]}
        primaryIndicators={null}
        settings={defaultPreferences.indicators}
        dark={true}
        availableSymbols={['BTCUSDT', 'ETHUSDT']}
        onActiveSymbolChange={() => {}}
      />,
    );

    const countdownPill = document.querySelector('.pane-countdown-pill');
    expect(countdownPill).toBeInTheDocument();
    expect(countdownPill?.textContent).toMatch(/\d{2}:\d{2}/);
  });

  it('atualiza os tempos gráficos ao receber novo primaryInterval da barra superior do app', async () => {
    marketChartProps.length = 0;
    const { rerender } = render(
      <MultiChartGrid
        primarySymbol="BTCUSDT"
        primaryInterval="15m"
        primaryCandles={[{ time: 60, open: 10, high: 12, low: 9, close: 11, volume: 2, closed: true }]}
        primaryIndicators={null}
        settings={defaultPreferences.indicators}
        dark={true}
        availableSymbols={['BTCUSDT', 'ETHUSDT']}
        onActiveSymbolChange={() => {}}
      />,
    );

    expect(marketChartProps.at(-1)?.interval).toBe('15m');

    // Simula o clique em '1h' na toolbar principal do app
    rerender(
      <MultiChartGrid
        primarySymbol="BTCUSDT"
        primaryInterval="1h"
        primaryCandles={[{ time: 60, open: 10, high: 12, low: 9, close: 11, volume: 2, closed: true }]}
        primaryIndicators={null}
        settings={defaultPreferences.indicators}
        dark={true}
        availableSymbols={['BTCUSDT', 'ETHUSDT']}
        onActiveSymbolChange={() => {}}
      />,
    );

    expect(marketChartProps.at(-1)?.interval).toBe('1h');
  });
});


