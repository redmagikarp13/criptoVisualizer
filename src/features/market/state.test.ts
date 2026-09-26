import { expect, it } from 'vitest';
import { applyMarketEvent, initialMarketState } from './state';
import type { Candle, MarketEvent } from '../../lib/types';
const candle: Candle = { time: 60, open: 10, high: 12, low: 9, close: 11, volume: 30, closed: true };
it('descarta eventos de seleções antigas e não reabre candles fechados', () => {
  const state = { ...initialMarketState('novo'), candles: [candle] };
  expect(applyMarketEvent(state, { id: 'antigo', kind: 'history', candles: [] })).toBe(state);
  expect(applyMarketEvent(state, { id: 'novo', kind: 'candle', candle: { ...candle, closed: false, close: 10 } }).candles[0].close).toBe(11);
});
it('preserva Binance quando uma exchange de comparação falha', () => {
  const state = { ...initialMarketState('a'), candles: [candle], binanceStatus: 'connected' as const };
  const event: MarketEvent = { id: 'a', kind: 'status', exchange: 'okx', status: 'error', message: 'offline' };
  const result = applyMarketEvent(state, event);
  expect(result.binanceStatus).toBe('connected');
  expect(result.candles).toEqual([candle]);
  expect(result.status.okx?.status).toBe('error');
});
it('roteeia cotações: Binance para quotes, demais para comparison', () => {
  const base = initialMarketState('a');
  const quote = (exchange: 'binance' | 'okx' | 'bybit') => ({ id: 'a', kind: 'quote' as const, quote: { symbol: 'BTCUSDT', price: 100, change24h: 1, time: 1, receivedAt: 1, exchange } });
  const result = [quote('binance'), quote('okx'), quote('bybit')].reduce((s, e) => applyMarketEvent(s, e), base);
  expect(result.quotes.BTCUSDT?.exchange).toBe('binance');
  expect(Object.keys(result.comparison).sort()).toEqual(['bybit', 'okx']);
});
it('mantém somente os mil candles mais recentes em ordem', () => {
  const state = initialMarketState('a');
  const candles = Array.from({ length: 1100 }, (_, i) => ({ ...candle, time: i * 60 }));
  const result = applyMarketEvent(state, { id: 'a', kind: 'history', candles: candles.reverse() });
  expect(result.candles).toHaveLength(1000);
  expect(result.candles[0].time).toBe(6000);
});

it('atualiza o livro de ofertas quando recebe evento depth', () => {
  const state = initialMarketState('a');
  const mockDepth = {
    symbol: 'ENAUSDC',
    time: 12345,
    bids: [{ price: 0.265, amount: 100 }],
    asks: [{ price: 0.266, amount: 200 }],
  };
  const result = applyMarketEvent(state, { id: 'a', kind: 'depth', depth: mockDepth });
  expect(result.depth).toEqual(mockDepth);
});
