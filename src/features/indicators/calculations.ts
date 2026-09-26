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

export function calculateIndicators(candles: Candle[], settings: IndicatorSettings) {
  const closes = candles.map(c => c.close);
  return {
    sma: sma(closes, settings.smaPeriod),
    emaFast: ema(closes, settings.emaFastPeriod),
    emaSlow: ema(closes, settings.emaSlowPeriod),
    rsi: rsi(closes, 14),
    bands: bollinger(closes, 20, 2),
    macd: macd(closes),
  };
}
export type IndicatorResult = ReturnType<typeof calculateIndicators>;
