import { describe, expect, it } from 'vitest';
import { sma, ema, rsi, bollinger, macd, heikinAshi, volumeSma, vwap, stochastic, supertrend } from './calculations';
import type { Candle } from '../../lib/types';

describe('indicadores técnicos', () => {
  it('SMA respeita aquecimento e remove o valor que saiu da janela', () => {
    expect(sma([1, 2, 3, 4, 8], 3)).toEqual([null, null, 2, 3, 5]);
  });
  it('EMA usa SMA como semente, não o primeiro preço', () => {
    expect(ema([1, 2, 3, 7, 5], 3)).toEqual([null, null, 2, 4.5, 4.75]);
  });
  it('RSI de Wilder não emite antes das primeiras diferenças completas', () => {
    const result = rsi([1, 2, 3, 2, 2, 4], 3);
    expect(result.slice(0, 3)).toEqual([null, null, null]);
    expect(result[3]).toBeCloseTo(66.66666667);
    expect(result[4]).toBeCloseTo(66.66666667);
    expect(result[5]).toBeCloseTo(86.66666667);
  });
  it.each([
    [[1, 1, 1, 1], 50], [[1, 2, 3, 4], 100], [[4, 3, 2, 1], 0],
  ])('RSI trata séries constantes ou unidirecionais (%s)', (values, expected) => {
    expect(rsi(values as number[], 3)[3]).toBe(expected);
  });
  it('Bollinger usa desvio-padrão populacional', () => {
    const bands = bollinger([1, 2, 3, 4], 3, 2);
    expect(bands.middle).toEqual([null, null, 2, 3]);
    expect(bands.upper[2]).toBeCloseTo(3.6329931619);
    expect(bands.lower[2]).toBeCloseTo(0.3670068381);
  });
  it('MACD alinha a linha de sinal com o aquecimento das duas EMAs', () => {
    const result = macd([1, 2, 3, 4, 5, 6], 2, 3, 2);
    expect(result.line).toEqual([null, null, 0.5, 0.5, 0.5, 0.5]);
    expect(result.signal).toEqual([null, null, null, 0.5, 0.5, 0.5]);
    expect(result.histogram).toEqual([null, null, null, 0, 0, 0]);
  });
  it('histórico insuficiente não gera NaN nem valores artificiais', () => {
    expect(sma([1], 20)).toEqual([null]);
    expect(ema([], 20)).toEqual([]);
    expect(rsi([1, 2], 14)).toEqual([null, null]);
  });
  it('rejeita períodos inválidos e valores não finitos', () => {
    expect(() => sma([1, 2], 0)).toThrow();
    expect(() => ema([1, NaN], 2)).toThrow();
    expect(() => rsi([1, Infinity], 2)).toThrow();
    expect(() => macd([1, 2], 3, 2, 2)).toThrow();
  });
  it('calcula Heikin-Ashi suavemente respeitando limites', () => {
    const sampleCandles: Candle[] = [
      { time: 1000, open: 10, high: 15, low: 8, close: 12, volume: 100, closed: true },
      { time: 2000, open: 12, high: 16, low: 11, close: 14, volume: 150, closed: true },
    ];
    const ha = heikinAshi(sampleCandles);
    expect(ha).toHaveLength(2);
    expect(ha[0].close).toBe((10 + 15 + 8 + 12) / 4);
    expect(ha[0].open).toBe((10 + 12) / 2);
    expect(ha[1].open).toBe((ha[0].open + ha[0].close) / 2);
    expect(ha[1].high).toBeGreaterThanOrEqual(ha[1].close);
    expect(ha[1].low).toBeLessThanOrEqual(ha[1].close);
  });
  it('calcula VWAP ponderado acumulando intraday', () => {
    const candles: Candle[] = [
      { time: 1700000000, open: 10, high: 12, low: 8, close: 10, volume: 100, closed: true },
      { time: 1700000060, open: 10, high: 14, low: 10, close: 12, volume: 200, closed: true },
    ];
    const res = vwap(candles);
    expect(res).toHaveLength(2);
    expect(res[0]).toBe(10); // tp = 10, vol = 100 -> 1000/100 = 10
    // candle 2: tp = (14+10+12)/3 = 12, vol = 200 -> (1000 + 2400)/300 = 11.3333
    expect(res[1]).toBeCloseTo(11.3333);
  });
  it('calcula Estocástico %K e %D', () => {
    const candles: Candle[] = Array.from({ length: 20 }, (_, i) => ({
      time: 1000 + i * 60,
      open: 100 + i,
      high: 105 + i,
      low: 95 + i,
      close: 102 + i,
      volume: 50,
      closed: true,
    }));
    const stoch = stochastic(candles, 14, 3);
    expect(stoch.k[0]).toBeNull();
    expect(stoch.k[13]).not.toBeNull();
    expect(stoch.k[13]).toBeGreaterThanOrEqual(0);
    expect(stoch.k[13]).toBeLessThanOrEqual(100);
    expect(stoch.d[15]).not.toBeNull();
  });
  it('calcula SuperTrend com faixas e sinal de tendência', () => {
    const candles: Candle[] = Array.from({ length: 20 }, (_, i) => ({
      time: 1000 + i * 60,
      open: 100 + i * 2,
      high: 105 + i * 2,
      low: 98 + i * 2,
      close: 104 + i * 2,
      volume: 100,
      closed: true,
    }));
    const st = supertrend(candles, 10, 3);
    expect(st.value).toHaveLength(20);
    expect(st.value[9]).not.toBeNull();
    expect(st.trend[9]).toBe('up');
  });
  it('calcula volumeSma respeitando período', () => {
    const candles: Candle[] = Array.from({ length: 5 }, (_, i) => ({
      time: 1000 + i * 60,
      open: 10,
      high: 12,
      low: 8,
      close: 11,
      volume: (i + 1) * 10,
      closed: true,
    }));
    const res = volumeSma(candles, 3);
    expect(res).toEqual([null, null, 20, 30, 40]);
  });
});
