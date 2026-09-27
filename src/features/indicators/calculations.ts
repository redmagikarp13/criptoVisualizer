import type { Candle } from '../../lib/types';
import type { IndicatorSettings } from '../settings/preferences';

export type Values = (number | null)[];

function validate(values: number[], period: number) {
  if (!Number.isInteger(period) || period < 2 || period > 200) throw new Error('Período deve estar entre 2 e 200.');
  if (values.some(value => !Number.isFinite(value))) throw new Error('Série contém valores inválidos.');
}

export function sma(values: number[], period: number): Values {
  validate(values, period);
  let sum = 0;
  return values.map((value, i) => {
    sum += value;
    if (i >= period) sum -= values[i - period];
    return i >= period - 1 ? sum / period : null;
  });
}

export function ema(values: number[], period: number): Values {
  validate(values, period);
  const result: Values = Array(values.length).fill(null);
  if (values.length < period) return result;
  let previous = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = previous;
  const alpha = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    previous += alpha * (values[i] - previous);
    result[i] = previous;
  }
  return result;
}

export function rsi(values: number[], period: number): Values {
  validate(values, period);
  const result: Values = Array(values.length).fill(null);
  if (values.length <= period) return result;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = values[i] - values[i - 1];
    gain += Math.max(delta, 0) / period;
    loss += Math.max(-delta, 0) / period;
  }
  const score = () => gain === 0 && loss === 0 ? 50 : loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  result[period] = score();
  for (let i = period + 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(delta, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-delta, 0)) / period;
    result[i] = score();
  }
  return result;
}

export function bollinger(values: number[], period: number, deviations: number) {
  const middle = sma(values, period);
  if (!Number.isFinite(deviations) || deviations <= 0) throw new Error('Desvio inválido.');
  const upper: Values = Array(values.length).fill(null);
  const lower: Values = Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const mean = middle[i]!;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (values[j] - mean) ** 2;
    const width = Math.sqrt(variance / period) * deviations;
    upper[i] = mean + width;
    lower[i] = mean - width;
  }
  return { middle, upper, lower };
}

export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9) {
  if (fast >= slow) throw new Error('MACD exige período rápido menor que o lento.');
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  validate(values, signalPeriod);
  const line = values.map((_, i) => fastEma[i] === null || slowEma[i] === null ? null : fastEma[i]! - slowEma[i]!);
  const warmed = line.filter((value): value is number => value !== null);
  const signal: Values = [...Array(Math.min(slow - 1, values.length)).fill(null), ...ema(warmed, signalPeriod)];
  const histogram = line.map((value, i) => value === null || signal[i] === null ? null : value - signal[i]!);
  return { line, signal, histogram };
}

export function heikinAshi(candles: Candle[]): Candle[] {
  if (!candles.length) return [];
  const result: Candle[] = [];
  let prevHaOpen = (candles[0].open + candles[0].close) / 2;
  let prevHaClose = (candles[0].open + candles[0].high + candles[0].low + candles[0].close) / 4;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = i === 0 ? prevHaOpen : (prevHaOpen + prevHaClose) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);
    result.push({
      time: c.time,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      volume: c.volume,
      closed: c.closed,
    });
    prevHaOpen = haOpen;
    prevHaClose = haClose;
  }
  return result;
}

export function volumeSma(candles: Candle[], period = 20): Values {
  const volumes = candles.map(c => c.volume);
  if (volumes.length < period) return Array(volumes.length).fill(null);
  return sma(volumes, period);
}

export function vwap(candles: Candle[]): Values {
  const result: Values = [];
  let cumPv = 0;
  let cumVol = 0;
  let prevDay = -1;

  for (const c of candles) {
    const day = new Date(c.time * 1000).getUTCDate();
    if (day !== prevDay) {
      cumPv = 0;
      cumVol = 0;
      prevDay = day;
    }
    const tp = (c.high + c.low + c.close) / 3;
    const vol = c.volume > 0 ? c.volume : 1;
    cumPv += tp * vol;
    cumVol += vol;
    result.push(cumVol > 0 ? cumPv / cumVol : tp);
  }
  return result;
}

export function stochastic(candles: Candle[], kPeriod = 14, dPeriod = 3): { k: Values; d: Values } {
  const k: Values = Array(candles.length).fill(null);
  if (candles.length < kPeriod) {
    return { k, d: Array(candles.length).fill(null) };
  }

  for (let i = kPeriod - 1; i < candles.length; i++) {
    let minLow = Infinity;
    let maxHigh = -Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j].low < minLow) minLow = candles[j].low;
      if (candles[j].high > maxHigh) maxHigh = candles[j].high;
    }
    const range = maxHigh - minLow;
    k[i] = range === 0 ? 50 : Math.max(0, Math.min(100, ((candles[i].close - minLow) / range) * 100));
  }

  const validK = k.filter((v): v is number => v !== null);
  const dCalculated = validK.length >= dPeriod ? sma(validK, dPeriod) : [];
  const d: Values = [...Array(candles.length - validK.length).fill(null), ...dCalculated];

  return { k, d };
}

export function supertrend(
  candles: Candle[],
  period = 10,
  multiplier = 3,
): { value: Values; trend: ('up' | 'down' | null)[] } {
  const length = candles.length;
  const value: Values = Array(length).fill(null);
  const trend: ('up' | 'down' | null)[] = Array(length).fill(null);

  if (length < period) return { value, trend };

  const tr: number[] = [];
  for (let i = 0; i < length; i++) {
    if (i === 0) {
      tr.push(candles[0].high - candles[0].low);
    } else {
      const prevClose = candles[i - 1].close;
      const hl = candles[i].high - candles[i].low;
      const hc = Math.abs(candles[i].high - prevClose);
      const lc = Math.abs(candles[i].low - prevClose);
      tr.push(Math.max(hl, hc, lc));
    }
  }

  const atr = sma(tr, period);
  let prevFinalUpper = 0;
  let prevFinalLower = 0;
  let currentTrend: 'up' | 'down' = 'up';

  for (let i = period - 1; i < length; i++) {
    const c = candles[i];
    const curAtr = atr[i];
    if (curAtr === null) continue;

    const hl2 = (c.high + c.low) / 2;
    const basicUpper = hl2 + multiplier * curAtr;
    const basicLower = hl2 - multiplier * curAtr;

    let finalUpper = basicUpper;
    let finalLower = basicLower;

    if (i > period - 1) {
      const prevClose = candles[i - 1].close;
      finalLower = prevClose > prevFinalLower ? Math.max(basicLower, prevFinalLower) : basicLower;
      finalUpper = prevClose < prevFinalUpper ? Math.min(basicUpper, prevFinalUpper) : basicUpper;
    }

    if (i > period - 1) {
      if (currentTrend === 'up' && c.close < prevFinalLower) {
        currentTrend = 'down';
      } else if (currentTrend === 'down' && c.close > prevFinalUpper) {
        currentTrend = 'up';
      }
    }

    prevFinalUpper = finalUpper;
    prevFinalLower = finalLower;

    trend[i] = currentTrend;
    value[i] = currentTrend === 'up' ? finalLower : finalUpper;
  }

  return { value, trend };
}

export function calculateIndicators(candles: Candle[], settings: IndicatorSettings) {
  const closes = candles.map(c => c.close);
  return {
    sma: sma(closes, settings.smaPeriod),
    emaFast: ema(closes, settings.emaFastPeriod),
    emaSlow: ema(closes, settings.emaSlowPeriod),
    rsi: rsi(closes, 14),
    bands: bollinger(closes, 20, 2),
    macd: macd(closes),
    volumeMa: volumeSma(candles, 20),
    vwap: vwap(candles),
    stochastic: stochastic(candles),
    supertrend: supertrend(candles),
  };
}
export type IndicatorResult = ReturnType<typeof calculateIndicators>;
