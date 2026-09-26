import type { Exchange, Quote } from '../../lib/types';

export interface Comparison { binance: Quote; okx: Quote; difference: number }
export interface ComparisonRow { exchange: Exchange; price: number; time: number; difference: number | null }

const fresh = (quote: Quote, now: number) =>
  Number.isFinite(quote.price) && quote.price > 0
  && Number.isFinite(quote.time) && Number.isFinite(quote.receivedAt)
  && now - quote.time <= 10_000 && quote.time - now <= 2_000 && now - quote.receivedAt <= 10_000;

// Spread relativo ao preço da Binance, ou null quando os dados não são comparáveis.
export function spread(binance: Quote | undefined, other: Quote | undefined, now: number): number | null {
  if (!binance || !other || binance.symbol !== other.symbol) return null;
  if (!fresh(binance, now) || !fresh(other, now)) return null;
  if (Math.abs(binance.time - other.time) > 5_000) return null;
  return (other.price / binance.price - 1) * 100;
}

// Comparação principal (Binance↔OKX) usada no snapshot da IA; comportamento preservado.
export function compareQuotes(binance: Quote | undefined, okx: Quote | undefined, now: number): Comparison | null {
  const difference = spread(binance, okx, now);
  if (difference === null || !binance || !okx) return null;
  return { binance, okx, difference };
}

export function comparisonRows(binance: Quote | undefined, comparison: Record<string, Quote>, now: number): ComparisonRow[] {
  return Object.values(comparison)
    .map(quote => ({ exchange: quote.exchange, price: quote.price, time: quote.time, difference: spread(binance, quote, now) }))
    .sort((a, b) => a.exchange.localeCompare(b.exchange));
}
