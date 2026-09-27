import type { DepthLevel, OrderBook as OrderBookType } from '../../lib/types';

export function mergeOrderBooks(
  books: (OrderBookType | null | undefined)[],
  symbol: string,
): OrderBookType | null {
  const validBooks = books.filter(
    (b): b is OrderBookType => Boolean(b && (b.bids.length > 0 || b.asks.length > 0)),
  );

  if (validBooks.length === 0) return null;
  if (validBooks.length === 1) {
    return {
      symbol,
      bids: [...validBooks[0].bids],
      asks: [...validBooks[0].asks],
      time: validBooks[0].time,
      exchange: 'merged',
    };
  }

  const bidsMap = new Map<number, number>();
  const asksMap = new Map<number, number>();

  for (const book of validBooks) {
    for (const { price, amount } of book.bids) {
      if (price > 0 && amount > 0) {
        const roundedPrice = Number(price.toFixed(8));
        bidsMap.set(roundedPrice, (bidsMap.get(roundedPrice) ?? 0) + amount);
      }
    }
    for (const { price, amount } of book.asks) {
      if (price > 0 && amount > 0) {
        const roundedPrice = Number(price.toFixed(8));
        asksMap.set(roundedPrice, (asksMap.get(roundedPrice) ?? 0) + amount);
      }
    }
  }

  const bids: DepthLevel[] = Array.from(bidsMap.entries())
    .map(([price, amount]) => ({ price, amount }))
    .sort((a, b) => b.price - a.price);

  const asks: DepthLevel[] = Array.from(asksMap.entries())
    .map(([price, amount]) => ({ price, amount }))
    .sort((a, b) => a.price - b.price);

  const time = Math.max(...validBooks.map(b => b.time));

  return {
    symbol,
    bids,
    asks,
    time,
    exchange: 'merged',
  };
}
