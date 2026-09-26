import { calculateIndicators } from './calculations';
import type { Candle } from '../../lib/types';
import type { IndicatorSettings } from '../settings/preferences';

self.onmessage = ({ data }: MessageEvent<{ id: number; candles: Candle[]; settings: IndicatorSettings }>) => {
  try { self.postMessage({ id: data.id, result: calculateIndicators(data.candles, data.settings) }); }
  catch { self.postMessage({ id: data.id, error: 'Não foi possível calcular os indicadores para esta série.' }); }
};
