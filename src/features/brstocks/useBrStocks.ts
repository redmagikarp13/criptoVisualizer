import { useEffect, useState } from 'react';

export interface BrStockQuote {
  ticker: string;
  shortName: string;
  price: number;
  change: number;          // variação % no dia
  changeAbs: number;       // variação absoluta no dia
  previousClose: number;
  volume: number;
  updatedAt: number;       // timestamp local da última atualização
  marketCap?: number;
  logourl?: string;
}

export interface BrStocksState {
  quotes: Record<string, BrStockQuote>;
  loading: boolean;
  error: string;
  lastFetch: number | null;
}

const BASE_URL = 'https://brapi.dev/api/quote';
const INTERVAL_MS = 60_000; // atualizar a cada 60s
const STALE_MS = 900_000;   // 15min — delay máximo esperado da B3

interface BrapiResult {
  results?: Array<{
    symbol: string;
    shortName?: string;
    regularMarketPrice?: number;
    regularMarketChangePercent?: number;
    regularMarketChange?: number;
    regularMarketPreviousClose?: number;
    regularMarketVolume?: number;
    marketCap?: number;
    logourl?: string;
  }>;
  error?: string;
}

async function fetchQuotes(tickers: string[], token: string): Promise<Record<string, BrStockQuote>> {
  if (tickers.length === 0) return {};
  const joined = tickers.map(t => encodeURIComponent(t)).join(',');
  const url = token
    ? `${BASE_URL}/${joined}?token=${token}&fundamental=false`
    : `${BASE_URL}/${joined}?fundamental=false`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`brapi.dev retornou HTTP ${res.status}`);
  const data = (await res.json()) as BrapiResult;
  if (data.error) throw new Error(data.error);
  const now = Date.now();
  const map: Record<string, BrStockQuote> = {};
  for (const r of data.results ?? []) {
    if (!r.symbol || r.regularMarketPrice == null) continue;
    map[r.symbol] = {
      ticker: r.symbol,
      shortName: r.shortName ?? r.symbol,
      price: r.regularMarketPrice,
      change: r.regularMarketChangePercent ?? 0,
      changeAbs: r.regularMarketChange ?? 0,
      previousClose: r.regularMarketPreviousClose ?? 0,
      volume: r.regularMarketVolume ?? 0,
      marketCap: r.marketCap,
      logourl: r.logourl,
      updatedAt: now,
    };
  }
  return map;
}

export function useBrStocks(tickers: string[], token: string, enabled: boolean, refreshKey = 0): BrStocksState {
  const [state, setState] = useState<BrStocksState>({ quotes: {}, loading: false, error: '', lastFetch: null });
  const tickersKey = tickers.join(',');


  useEffect(() => {
    if (!enabled || tickers.length === 0) {
      setState({ quotes: {}, loading: false, error: '', lastFetch: null });
      return;
    }

    let cancelled = false;

    async function load() {
      if (cancelled) return;
      setState(s => ({ ...s, loading: true, error: '' }));
      try {
        const quotes = await fetchQuotes(tickers, token);
        if (!cancelled) setState(s => ({ ...s, quotes: { ...s.quotes, ...quotes }, loading: false, lastFetch: Date.now() }));
      } catch (err) {
        if (!cancelled) setState(s => ({ ...s, loading: false, error: err instanceof Error ? err.message : 'Erro ao buscar cotações.' }));
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), INTERVAL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickersKey, token, enabled, refreshKey]);

  return state;
}

export { STALE_MS };
