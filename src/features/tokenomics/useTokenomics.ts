import { useEffect, useState } from 'react';
import { fetchTokenomicsData } from './api';
import type { TokenomicsData } from './types';

export function useTokenomics(symbol: string, enabled = true) {
  const [data, setData] = useState<TokenomicsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!enabled || !symbol) {
      setData(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchTokenomicsData(symbol, controller.signal)
      .then(result => {
        if (!controller.signal.aborted) {
          setData(result);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [symbol, enabled, retryCount]);

  const refresh = () => setRetryCount(c => c + 1);

  return { data, loading, error, refresh };
}
