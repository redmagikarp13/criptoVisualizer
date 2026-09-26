import { describe, expect, it } from 'vitest';
import { sma, ema, rsi, bollinger, macd } from './calculations';

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
});
