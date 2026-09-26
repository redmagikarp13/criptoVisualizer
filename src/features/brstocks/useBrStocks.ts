import { useEffect, useState } from 'react';
import { desktop } from '../../lib/desktop';
import type { BrStockQuote } from '../../lib/types';

export type { BrStockQuote };

export interface BrStocksState {
  quotes: Record<string, BrStockQuote>;
  loading: boolean;
  error: string;
  lastFetch: number | null;
}

const INTERVAL_MS = 60_000; // atualizar a cada 60s
const STALE_MS = 900_000;   // 15min — delay máximo esperado da B3

export function useBrStocks(tickers: string[], token: string, enabled: boolean, refreshKey = 0): BrStocksState {
  const [state, setState] = useState<BrStocksState>({ quotes: {}, loading: false, error: '', lastFetch: null });
  const tickersKey = tickers.join(',');

  useEffect(() => {
    if (!enabled || tickers.length === 0) {
      setState(s => ({ ...s, loading: false, error: '' }));
      return;
    }

    let cancelled = false;

    async function load() {
      if (cancelled) return;
      setState(s => ({ ...s, loading: true, error: '' }));
      try {
        const list = await desktop.fetchBrQuotes(tickers, token);
        if (cancelled) return;
        const map: Record<string, BrStockQuote> = {};
        for (const q of list) {
          map[q.ticker] = q;
        }
        setState(s => ({
          ...s,
          quotes: { ...s.quotes, ...map },
          loading: false,
          error: '',
          lastFetch: Date.now(),
        }));
      } catch (err) {
        if (!cancelled) {
          setState(s => ({
            ...s,
            loading: false,
            error: err instanceof Error ? err.message : 'Erro ao buscar cotações.',
          }));
        }
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
