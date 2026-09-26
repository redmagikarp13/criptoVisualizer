import { describe, expect, it } from 'vitest';
import { splitSymbol, isValidSymbol, pairLabel } from './symbol';

describe('símbolos multi-cotação', () => {
  it('separa base e cotação pelo sufixo mais longo', () => {
    expect(splitSymbol('BTCUSDT')).toEqual({ base: 'BTC', quote: 'USDT' });
    expect(splitSymbol('BTCUSDC')).toEqual({ base: 'BTC', quote: 'USDC' });
    expect(splitSymbol('XRPEURI')).toEqual({ base: 'XRP', quote: 'EURI' });
    expect(splitSymbol('ETHBRL')).toEqual({ base: 'ETH', quote: 'BRL' });
    expect(splitSymbol('ENABTC')).toEqual({ base: 'ENA', quote: 'BTC' });
    expect(splitSymbol('IOTABTC')).toEqual({ base: 'IOTA', quote: 'BTC' });
    expect(splitSymbol('ETHBTC')).toEqual({ base: 'ETH', quote: 'BTC' });
    expect(splitSymbol('ENAETH')).toEqual({ base: 'ENA', quote: 'ETH' });
  });
  it('rejeita cotação inexistente, "USD" simples e formatos inválidos', () => {
    expect(splitSymbol('BTCUSD')).toBeNull();
    expect(splitSymbol('BTCXYZ')).toBeNull();
    expect(splitSymbol('btcusdt')).toBeNull();
    expect(splitSymbol('BT')).toBeNull();
    expect(isValidSymbol('SOLUSDC')).toBe(true);
  });
  it('monta o rótulo com a cotação correta', () => {
    expect(pairLabel('BTCUSDC')).toBe('BTC / USDC');
    expect(pairLabel('BTCUSDT')).toBe('BTC / USDT');
  });
  it('reconhece ações e FIIs da B3 como válidos', () => {
    expect(isValidSymbol('PETR4')).toBe(true);
    expect(isValidSymbol('VALE3')).toBe(true);
    expect(isValidSymbol('BOVA11')).toBe(true);
    expect(isValidSymbol('MXRF11')).toBe(true);
    expect(isValidSymbol('PETR4F')).toBe(true);
    expect(pairLabel('PETR4')).toBe('PETR4');
    expect(isValidSymbol('PET4')).toBe(false);
    expect(isValidSymbol('PETR')).toBe(false);
  });
});
