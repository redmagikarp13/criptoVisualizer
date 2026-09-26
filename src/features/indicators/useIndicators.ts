import { useEffect, useRef, useState } from 'react';
import type { Candle } from '../../lib/types';
import type { IndicatorSettings } from '../settings/preferences';
import { calculateIndicators, type IndicatorResult } from './calculations';

export function useIndicators(candles: Candle[], settings: IndicatorSettings) {
  const worker = useRef<Worker | null>(null);
  const request = useRef(0);
  const [value, setValue] = useState<{ candles: Candle[]; settings: IndicatorSettings; result: IndicatorResult } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (typeof Worker !== 'undefined') worker.current = new Worker(new URL('./indicators.worker.ts', import.meta.url), { type: 'module' });
    return () => { worker.current?.terminate(); worker.current = null; };
  }, []);
  useEffect(() => {
    const id = ++request.current;
    if (!worker.current) {
      try { setValue({ candles, settings, result: calculateIndicators(candles, settings) }); setError(''); }
      catch { setValue(null); setError('Dados insuficientes ou inválidos para calcular indicadores.'); }
      return;
    }
    worker.current.onmessage = ({ data }: MessageEvent<{ id: number; result?: IndicatorResult; error?: string }>) => {
      if (data.id !== request.current) return;
      setError(data.error ?? '');
      if (data.result) setValue({ candles, settings, result: data.result });
    };
    worker.current.onerror = () => setError('O cálculo dos indicadores foi interrompido. Reabra o aplicativo.');
    worker.current.postMessage({ id, candles, settings });
  }, [candles, settings]);
  return { result: !error && value?.candles === candles && value.settings === settings ? value.result : null, error };
}
