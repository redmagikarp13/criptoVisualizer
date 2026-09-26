import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from './App';
import { defaultPreferences } from '../features/settings/preferences';

vi.mock('../lib/desktop', () => ({
  desktop: {
    available: false,
    loadPreferences: async () => ({ preferences: structuredClone(defaultPreferences), warning: null }),
    savePreferences: async () => undefined,
    listInstruments: async () => [{ symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT' }, { symbol: 'ETHUSDT', base: 'ETH', quote: 'USDT' }],
    subscribeMarket: async () => () => {},
    detectCli: async () => [{ agent: 'qoder', available: false, path: null, message: 'CLI ausente' }, { agent: 'antigravity', available: false, path: null, message: 'CLI ausente' }],
    notify: async () => undefined,
    updateTray: async () => undefined,
    showMainWindow: async () => undefined,
    cancelAnalysis: async () => undefined,
    analyze: async () => ({ analysis: {}, model: null }),
    searchBrStocks: async () => [{ stock: 'PETR4', name: 'Petrobras PN', close: 48.0, change: -1.5, volume: 1000000 }],
    fetchBrStockCandles: async () => [],
    fetchBrQuotes: async () => [],
  },
}));

vi.mock('../features/chart/MarketChart', () => ({ MarketChart: () => null }));
vi.mock('../features/brstocks/useBrStocks', () => ({
  useBrStocks: () => ({ quotes: { PETR4: { ticker: 'PETR4', shortName: 'Petrobras', price: 48.0, change: -1.5, changeAbs: -0.7, previousClose: 48.7, volume: 1000000, updatedAt: Date.now() } }, loading: false, error: '', lastFetch: null }),
  STALE_MS: 900_000,
}));

describe('área de trabalho', () => {
  it('não apresenta dados fictícios nem exige login de IA para abrir', async () => {
    const { unmount } = render(<App />);
    expect(await screen.findByRole('heading', { name: 'BTC / USDT' })).toBeInTheDocument();
    expect(screen.getByText(/Abra o aplicativo desktop/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analisar com IA' })).toBeDisabled();
    expect(screen.queryByText(/Tendência de alta confirmada/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Conectando à OKX/)).not.toBeInTheDocument();
    unmount();
  });
  it('troca ativo pelos favoritos sem confundir o cabeçalho', async () => {
    const { unmount } = render(<App />);
    const ethBtn = await screen.findByRole('button', { name: 'Selecionar ETH / USDT' });
    fireEvent.click(ethBtn);
    expect(await screen.findByRole('heading', { name: 'ETH / USDT' })).toBeInTheDocument();
    unmount();
  });
  it('integra busca de ações B3 e cripto em uma busca única', async () => {
    const { unmount } = render(<App />);
    const searchInput = await screen.findByRole('textbox', { name: 'Buscar par Spot ou ação B3' });
    fireEvent.change(searchInput, { target: { value: 'PETR4' } });
    const directBtn = await screen.findByRole('button', { name: /Abrir ação B3 PETR4/ });
    fireEvent.click(directBtn);
    expect(await screen.findByRole('heading', { name: 'PETR4' })).toBeInTheDocument();
    expect(screen.getByText(/B3 \(Brasil\)/)).toBeInTheDocument();
    unmount();
  });
  it('Antigravity começa desabilitado e exige consentimento explícito', async () => {
    const { unmount } = render(<App />);
    const cfgBtn = await screen.findByRole('button', { name: 'Configurações' });
    await waitFor(() => expect(cfgBtn).not.toBeDisabled());
    fireEvent.click(cfgBtn);
    expect(screen.getByText(/TradingView Lightweight Charts/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'TradingView' })).toHaveAttribute('href', 'https://www.tradingview.com/');
    const consent = screen.getByRole('checkbox', { name: /Habilitar Antigravity/ });
    expect(consent).not.toBeChecked();
    expect(screen.getByText(/não garante isolamento completo/)).toBeInTheDocument();
    fireEvent.click(consent);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar configurações' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    unmount();
  });
});
