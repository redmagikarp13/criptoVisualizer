import { useEffect, useRef, useState } from 'react';
import type { Candle } from '../../lib/types';
import type { IndicatorSettings } from '../settings/preferences';
import { calculateIndicators, type IndicatorResult } from './calculations';

function sameCalculationParams(a?: IndicatorSettings, b?: IndicatorSettings): boolean {
  if (!a || !b) return false;
  return (
    a.smaPeriod === b.smaPeriod &&
    a.emaFastPeriod === b.emaFastPeriod &&
    a.emaSlowPeriod === b.emaSlowPeriod
  );
}

export function useIndicators(candles: Candle[], settings: IndicatorSettings) {
  const worker = useRef<Worker | null>(null);
  const request = useRef(0);
  const [value, setValue] = useState<{ candles: Candle[]; settings: IndicatorSettings; result: IndicatorResult } | null>(null);
  const [error, setError] = useState('');
  const lastParams = useRef({
    candles,
    smaPeriod: settings.smaPeriod,
    emaFastPeriod: settings.emaFastPeriod,
    emaSlowPeriod: settings.emaSlowPeriod,
  });

  const hasValue = useRef(false);

  useEffect(() => {
    if (typeof Worker !== 'undefined') {
      try {
        worker.current = new Worker(new URL('./indicators.worker.ts', import.meta.url), { type: 'module' });
      } catch {
        worker.current = null;
      }
    }
    return () => {
      worker.current?.terminate();
      worker.current = null;
    };
  }, []);

  useEffect(() => {
    const isSameCandles = lastParams.current.candles === candles;
    const isSamePeriods =
      lastParams.current.smaPeriod === settings.smaPeriod &&
      lastParams.current.emaFastPeriod === settings.emaFastPeriod &&
      lastParams.current.emaSlowPeriod === settings.emaSlowPeriod;

    lastParams.current = {
      candles,
      smaPeriod: settings.smaPeriod,
      emaFastPeriod: settings.emaFastPeriod,
      emaSlowPeriod: settings.emaSlowPeriod,
    };

    if (isSameCandles && isSamePeriods && hasValue.current) {
      return;
    }

    const id = ++request.current;
    if (!worker.current) {
      try {
        setValue({ candles, settings, result: calculateIndicators(candles, settings) });
        hasValue.current = true;
        setError('');
      } catch {
        setValue(null);
        hasValue.current = false;
        setError('Dados insuficientes ou inválidos para calcular indicadores.');
      }
      return;
    }

    worker.current.onmessage = ({ data }: MessageEvent<{ id: number; result?: IndicatorResult; error?: string }>) => {
      if (data.id !== request.current) return;
      setError(data.error ?? '');
      if (data.result) {
        setValue({ candles, settings, result: data.result });
        hasValue.current = true;
      }
    };

    worker.current.onerror = () => {
      setError('O cálculo dos indicadores foi interrompido. Reabra o aplicativo.');
      setValue(null);
      hasValue.current = false;
    };

    worker.current.postMessage({ id, candles, settings });
  }, [candles, settings]);

  const hasMatchingResult =
    !error &&
    value !== null &&
    value.candles === candles &&
    sameCalculationParams(value.settings, settings);

  return {
    result: hasMatchingResult ? value.result : null,
    error,
  };
}

