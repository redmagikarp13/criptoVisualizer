import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { desktop } from '../../lib/desktop';
import type { Candle, MarketEvent } from '../../lib/types';
import { useMarket } from './useMarket';

vi.mock('../../lib/desktop', () => ({ desktop: { listInstruments: async () => [], subscribeMarket: vi.fn() } }));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('nunca associa candles da seleção anterior ao novo par, nem no primeiro render', async () => {
  vi.useFakeTimers();
  const feeds: ((event: Omit<MarketEvent, 'id'>) => void)[] = [];
  vi.mocked(desktop.subscribeMarket).mockImplementation(async (request, receive) => {
    feeds.push(event => receive({ ...event, id: request.id } as MarketEvent));
    return () => {};
  });
  const seen: { symbol: string; candles: Candle[] }[] = [];
  const { result, rerender } = renderHook(({ symbol }) => {
    const market = useMarket(symbol, '1m', ['BTCUSDT', 'ETHUSDT'], true);
    seen.push({ symbol, candles: market.candles });
    return market;
  }, { initialProps: { symbol: 'BTCUSDT' } });
  await act(async () => {});
  const candle = { time: 60, open: 10, high: 12, low: 9, close: 11, volume: 2, closed: true };
  act(() => { feeds[0]({ kind: 'history', candles: [candle] } as Omit<MarketEvent, 'id'>); vi.advanceTimersByTime(100); });
  expect(result.current.candles).toHaveLength(1);
  rerender({ symbol: 'ETHUSDT' });
  expect(seen.filter(item => item.symbol === 'ETHUSDT').every(item => item.candles.length === 0)).toBe(true);
  act(() => { feeds[0]({ kind: 'history', candles: [candle] } as Omit<MarketEvent, 'id'>); vi.advanceTimersByTime(100); });
  expect(result.current.candles).toEqual([]);
});
