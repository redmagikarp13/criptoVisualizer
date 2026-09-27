import { describe, expect, it } from 'vitest';
import {
  formatFundingRate,
  formatCompactUsd,
  toDerivativesSnapshot,
} from './api';
import type { DerivativesData } from './types';

describe('derivatives api & analytics', () => {
  it('formata taxa de financiamento (funding rate)', () => {
    expect(formatFundingRate(0.00005)).toBe('+0.0050%');
    expect(formatFundingRate(0.00035)).toBe('+0.0350%');
    expect(formatFundingRate(-0.00021)).toBe('-0.0210%');
    expect(formatFundingRate(0)).toBe('+0.0000%');
  });

  it('formata valores compactos em USD', () => {
    expect(formatCompactUsd(1_500_000_000)).toBe('$1.50B');
    expect(formatCompactUsd(159_400_000)).toBe('$159.40M');
    expect(formatCompactUsd(25_000)).toBe('$25.0K');
    expect(formatCompactUsd(450.5)).toBe('$450.50');
  });

  it('converte DerivativesData em DerivativesSnapshot para IA', () => {
    const data: DerivativesData = {
      symbol: 'ENAUSDT',
      hasFutures: true,
      markPrice: 0.277,
      indexPrice: 0.2769,
      fundingRate: 0.00005,
      fundingRatePercent: '+0.0050%',
      nextFundingTime: Date.now() + 3600000,
      nextFundingCountdown: '01h 00m',
      openInterestAmount: 580000000,
      openInterestValueUsd: 160000000,
      openInterestChange1hPct: -3.2,
      longAccountRatio: 63.2,
      shortAccountRatio: 36.8,
      longShortRatio: 1.72,
      topTradersLongRatio: 58.0,
      topTradersShortRatio: 42.0,
      topTradersRatio: 1.38,
      sentiment: 'long_skew',
      squeezeRisk: 'liquidation_flush',
      riskHeadline: 'Limpeza de Alavancados Recente (Flush)',
      riskDescription: 'Queda súbita de 3.2% no Open Interest na última hora.',
      updatedAt: Date.now(),
    };

    const snapshot = toDerivativesSnapshot(data);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.hasFutures).toBe(true);
    expect(snapshot?.fundingRate).toBe(0.00005);
    expect(snapshot?.fundingRatePercent).toBe('+0.0050%');
    expect(snapshot?.longShortRatio).toBe(1.72);
    expect(snapshot?.openInterestValueUsd).toBe(160000000);
    expect(snapshot?.openInterestChange1hPct).toBe(-3.2);
    expect(snapshot?.squeezeRisk).toBe('liquidation_flush');
    expect(snapshot?.sentimentSummary).toContain('Limpeza de Alavancados Recente');
  });

  it('retorna null se dados não possuírem futuros', () => {
    expect(toDerivativesSnapshot(null)).toBeNull();
    expect(toDerivativesSnapshot({ hasFutures: false } as any)).toBeNull();
  });
});
