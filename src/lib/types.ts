export const intervals = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
export type Interval = typeof intervals[number];
export type Agent = 'qoder' | 'antigravity';
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closed: boolean;
}
export type Exchange = 'binance' | 'okx' | 'bybit';
export interface Quote {
  symbol: string;
  price: number;
  change24h: number;
  time: number;
  receivedAt: number;
  exchange: Exchange;
}
export interface DepthLevel {
  price: number;
  amount: number;
}
export interface OrderBook {
  symbol: string;
  bids: DepthLevel[];
  asks: DepthLevel[];
  time: number;
}
export interface Instrument { symbol: string; base: string; quote: string }
export type Connection = 'connecting' | 'connected' | 'reconnecting' | 'error';
export type MarketEvent = { id: string } & (
  | { kind: 'history'; candles: Candle[] }
  | { kind: 'candle'; candle: Candle }
  | { kind: 'quote'; quote: Quote }
  | { kind: 'depth'; depth: OrderBook }
  | { kind: 'status'; exchange: Exchange; status: Connection; message: string }
);
export interface MarketRequest { id: string; symbol: string; interval: Interval; favorites: string[] }
export interface CliStatus { agent: Agent; available: boolean; path: string | null; message: string }
export interface AppError { code: string; message: string }
export function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) return String(error.message);
  return typeof error === 'string' ? error : 'Ocorreu um erro inesperado.';
}
