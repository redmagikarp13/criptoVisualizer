import { describe, expect, it } from 'vitest';
import { mergeOrderBooks } from './mergeBooks';
import type { OrderBook } from '../../lib/types';

describe('mergeOrderBooks', () => {
  it('returns null when given empty list or books with no levels', () => {
    expect(mergeOrderBooks([], 'BTCUSDT')).toBeNull();
    expect(
      mergeOrderBooks(
        [{ symbol: 'BTCUSDT', bids: [], asks: [], time: 100 }],
        'BTCUSDT',
      ),
    ).toBeNull();
  });

  it('returns a single book formatted with exchange merged', () => {
    const book: OrderBook = {
      symbol: 'BTCUSDT',
      bids: [{ price: 95000, amount: 2 }],
      asks: [{ price: 95100, amount: 1.5 }],
      time: 1000,
      exchange: 'binance',
    };
    const result = mergeOrderBooks([book], 'BTCUSDT');
    expect(result).not.toBeNull();
    expect(result?.exchange).toBe('merged');
    expect(result?.bids).toEqual([{ price: 95000, amount: 2 }]);
    expect(result?.asks).toEqual([{ price: 95100, amount: 1.5 }]);
    expect(result?.time).toBe(1000);
  });

  it('aggregates quantities for identical prices across exchanges', () => {
    const binance: OrderBook = {
      symbol: 'BTCUSDT',
      bids: [
        { price: 95000, amount: 2.0 },
        { price: 94900, amount: 5.0 },
      ],
      asks: [
        { price: 95100, amount: 1.0 },
        { price: 95200, amount: 3.0 },
      ],
      time: 1000,
      exchange: 'binance',
    };

    const bybit: OrderBook = {
      symbol: 'BTCUSDT',
      bids: [
        { price: 95000, amount: 1.5 }, // Same price level
        { price: 94950, amount: 0.5 }, // New price level in between
      ],
      asks: [
        { price: 95100, amount: 2.0 }, // Same price level
        { price: 95150, amount: 1.0 }, // New price level
      ],
      time: 1050,
      exchange: 'bybit',
    };

    const merged = mergeOrderBooks([binance, bybit], 'BTCUSDT');
    expect(merged).not.toBeNull();
    expect(merged?.time).toBe(1050); // Takes latest timestamp

    // Bids should be sorted descending: 95000 (3.5), 94950 (0.5), 94900 (5.0)
    expect(merged?.bids).toEqual([
      { price: 95000, amount: 3.5 },
      { price: 94950, amount: 0.5 },
      { price: 94900, amount: 5.0 },
    ]);

    // Asks should be sorted ascending: 95100 (3.0), 95150 (1.0), 95200 (3.0)
    expect(merged?.asks).toEqual([
      { price: 95100, amount: 3.0 },
      { price: 95150, amount: 1.0 },
      { price: 95200, amount: 3.0 },
    ]);
  });
});
