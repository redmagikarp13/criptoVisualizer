import { useState, useEffect, useRef, useCallback } from 'react';
import type { DerivativesData } from './types';
import { fetchDerivativesData } from './api';

export function useDerivatives(symbol: string, enabled = true) {
  const [data, setData] = useState<DerivativesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;

  const loadData = useCallback(async () => {
    if (!enabled || !symbol) return;
    const currentSym = symbolRef.current;
    try {
      const res = await fetchDerivativesData(currentSym);
      if (symbolRef.current === currentSym) {
        setData(res);
        setError(null);
      }
    } catch (err) {
      if (symbolRef.current === currentSym) {
        setError(err instanceof Error ? err.message : 'Falha ao buscar dados de futuros');
      }
    } finally {
      if (symbolRef.current === currentSym) {
        setLoading(false);
      }
    }
  }, [enabled, symbol]);

  useEffect(() => {
    if (!enabled || !symbol) {
      setData(null);
      return;
    }

    setLoading(true);
    void loadData();

    // Atualiza a cada 12 segundos
    const timer = setInterval(() => {
      void loadData();
    }, 12_000);

    return () => clearInterval(timer);
  }, [enabled, symbol, loadData]);

  return { data, loading, error, refresh: loadData };
}
