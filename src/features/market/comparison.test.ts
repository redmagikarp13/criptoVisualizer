import { describe, expect, it } from 'vitest';
import { compareQuotes } from './comparison';

const binance = { symbol: 'BTCUSDT', price: 100, change24h: 2, time: 100_000, receivedAt: 100_000, exchange: 'binance' as const };
const okx = { ...binance, price: 101, exchange: 'okx' as const };

describe('comparação entre exchanges', () => {
  it('calcula o percentual relativo à Binance', () => {
    expect(compareQuotes(binance, okx, 101_000)?.difference).toBeCloseTo(1);
  });
  it('bloqueia dados antigos mesmo quando as exchanges concordam', () => {
    expect(compareQuotes(binance, okx, 111_000)).toBeNull();
  });
  it('bloqueia cotações defasadas entre si', () => {
    expect(compareQuotes(binance, { ...okx, time: 106_000 }, 108_000)).toBeNull();
  });
  it('não cruza moedas diferentes nem preços inválidos', () => {
    expect(compareQuotes(binance, { ...okx, symbol: 'ETHUSDT' }, 101_000)).toBeNull();
    expect(compareQuotes({ ...binance, price: 0 }, okx, 101_000)).toBeNull();
    expect(compareQuotes(binance, { ...okx, price: Infinity }, 101_000)).toBeNull();
    expect(compareQuotes(binance, undefined, 101_000)).toBeNull();
  });
  it('não considera um timestamp muito futuro como cotação fresca', () => {
    expect(compareQuotes({ ...binance, time: 200_000 }, okx, 101_000)).toBeNull();
  });
});
