import type { Candle, Connection, Exchange, MarketEvent, OrderBook, Quote } from '../../lib/types';

export interface MarketState {
  id: string; candles: Candle[]; quotes: Record<string, Quote>;
  depth: OrderBook | null;
  depths: Partial<Record<Exchange, OrderBook>>;
  comparison: Record<string, Quote>;
  binanceStatus: Connection; binanceMessage: string;
  status: Record<string, { status: Connection; message: string }>;
}
export const initialMarketState = (id: string): MarketState => ({
  id, candles: [], quotes: {}, depth: null, depths: {}, comparison: {}, status: {},
  binanceStatus: 'connecting', binanceMessage: 'Conectando à Binance…',
});
export function applyMarketEvent(state: MarketState, event: MarketEvent): MarketState {
  if (event.id !== state.id) return state;
  if (event.kind === 'history' || event.kind === 'candle') {
    const map = new Map<number, Candle>();
    const candles = event.kind === 'history' ? event.candles : [...state.candles, event.candle];
    for (const candle of candles) {
      const previous = map.get(candle.time);
      if (previous && ((previous.closed && !candle.closed) || previous.volume > candle.volume)) continue;
      map.set(candle.time, candle);
    }
    return { ...state, candles: [...map.values()].sort((a, b) => a.time - b.time).slice(-1000) };
  }
  if (event.kind === 'depth') {
    const ex = (event.depth.exchange as Exchange) ?? 'binance';
    return {
      ...state,
      depth: ex === 'binance' ? event.depth : (state.depth ?? event.depth),
      depths: { ...state.depths, [ex]: event.depth },
    };
  }
  if (event.kind === 'quote') {
    if (event.quote.exchange === 'binance') return { ...state, quotes: { ...state.quotes, [event.quote.symbol]: event.quote } };
    return { ...state, comparison: { ...state.comparison, [event.quote.exchange]: event.quote } };
  }
  if (event.exchange === 'binance') return { ...state, binanceStatus: event.status, binanceMessage: event.message };
  return { ...state, status: { ...state.status, [event.exchange as Exchange]: { status: event.status, message: event.message } } };
}
