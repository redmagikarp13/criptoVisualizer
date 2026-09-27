import { describe, expect, it } from 'vitest';
import { buildSnapshot, analysisSchema } from './snapshot';
import { defaultPreferences, parsePreferences } from '../settings/preferences';

const candles = Array.from({ length: 130 }, (_, i) => ({
  time: 1_700_000_000 + i * 60, open: 10 + i, high: 12 + i, low: 9 + i,
  close: 11 + i, volume: 30, closed: i < 129,
}));

describe('snapshot da análise', () => {
  it('usa somente os últimos 100 candles fechados e preserva identificação', () => {
    const snapshot = buildSnapshot('BTCUSDT', '1m', candles, defaultPreferences.indicators, null, 1_700_008_000_000);
    expect(snapshot.candles).toHaveLength(100);
    expect(snapshot.candles.at(-1)?.close).toBe(139);
    expect(snapshot.symbol).toBe('BTCUSDT');
    expect(snapshot.exchange).toBe('binance');
    expect(snapshot.indicators.sma).toBe(129.5);
    candles[128].close = 999;
    expect(snapshot.candles.at(-1)?.close).toBe(139);
    candles[128].close = 139;
  });
  it('inclui dados de orderBook e bot detection quando fornecidos', () => {
    const obData = {
      spread: 0.0001,
      spreadPercent: 0.04,
      bidPressurePercent: 65,
      askPressurePercent: 35,
      topBidWall: { price: 0.25, amount: 50000, ratioToAverage: 3.5 },
      topAskWall: null,
      botBias: 'bullish' as const,
      spoofDetected: false,
      hftActive: true,
      botPressure: {
        direction: 'pushing_up' as const,
        score: 70,
        headline: 'ROBÔS FORÇANDO ALTA 🚀',
        tactic: 'Escolta de Suporte',
      },
    };
    const snapshot = buildSnapshot('BTCUSDT', '1m', candles, defaultPreferences.indicators, null, 1_700_008_000_000, obData);
    expect(snapshot.orderBook).toEqual(obData);
    expect(snapshot.userNotes).toBeNull();
  });
  it('inclui observações do usuário quando fornecidas e remove espaços excedentes', () => {
    const snapshot = buildSnapshot(
      'BTCUSDT',
      '1m',
      candles,
      defaultPreferences.indicators,
      null,
      1_700_008_000_000,
      null,
      '  Vendi a 64200 e quero saber se recompro  ',
    );
    expect(snapshot.userNotes).toBe('Vendi a 64200 e quero saber se recompro');
  });
  it('inclui dados de derivativos e alavancagem quando fornecidos', () => {
    const derivData = {
      hasFutures: true,
      fundingRate: 0.00005,
      fundingRatePercent: '+0.0050%',
      nextFundingCountdown: '02h 45m',
      openInterestAmount: 582000000,
      openInterestValueUsd: 159000000,
      openInterestChange1hPct: -2.8,
      longShortRatio: 1.72,
      longAccountPercent: 63.2,
      shortAccountPercent: 36.8,
      topTradersLongShortRatio: 1.38,
      squeezeRisk: 'liquidation_flush' as const,
      sentimentSummary: 'Limpeza de Alavancados Recente (Flush) (+0.0050% funding, L/S 1.72, OI $159.00M)',
    };
    const snapshot = buildSnapshot('BTCUSDT', '1m', candles, defaultPreferences.indicators, null, 1_700_008_000_000, null, null, derivData);
    expect(snapshot.derivatives).toEqual(derivData);
  });
  it('recusa análise sem candles fechados', () => {
    expect(() => buildSnapshot('BTCUSDT', '1m', [], defaultPreferences.indicators, null, Date.now())).toThrow();
  });
  it('valida o conteúdo da IA, não apenas um envelope JSON', () => {
    expect(analysisSchema.safeParse({ status: 'SUCCESS', response: 'oi' }).success).toBe(false);
    expect(analysisSchema.safeParse({
      summary: 'Tendência observada', trend: 'alta', evidence: ['SMA ascendente'],
      scenarios: [{ condition: 'Se perder a média', interpretation: 'Enfraquecimento' }],
      risks: ['Volatilidade'], limitations: ['Sem notícias'],
    }).success).toBe(true);
  });
});

describe('preferências', () => {
  it('recupera padrões após arquivo inválido ou versão desconhecida', () => {
    expect(parsePreferences('{inválido')).toEqual(defaultPreferences);
    expect(parsePreferences({ version: 99 })).toEqual(defaultPreferences);
  });
  it('descarta propriedades desconhecidas, sem persistir credenciais', () => {
    const result = parsePreferences({ ...defaultPreferences, token: 'não persistir' });
    expect(result).not.toHaveProperty('token');
  });
  it('rejeita listas excessivas e parâmetros incompatíveis', () => {
    expect(parsePreferences({ ...defaultPreferences, favorites: Array(21).fill('BTCUSDT') })).toEqual(defaultPreferences);
    expect(parsePreferences({ ...defaultPreferences, indicators: { ...defaultPreferences.indicators, smaPeriod: 0 } })).toEqual(defaultPreferences);
  });
});
