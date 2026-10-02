import { describe, expect, it } from 'vitest';
import {
  formatCompactNumber,
  formatCompactUsd,
  formatPercent,
  toTokenomicsSnapshot,
} from './api';
import type { TokenomicsData } from './types';

describe('tokenomics api & calculations', () => {
  it('formata números compactos corretamente', () => {
    expect(formatCompactNumber(15_000_000_000)).toBe('15.00B');
    expect(formatCompactNumber(3_420_000_000)).toBe('3.42B');
    expect(formatCompactNumber(580_000_000)).toBe('580.0M');
    expect(formatCompactNumber(12_500)).toBe('12.5K');
    expect(formatCompactNumber(450)).toBe('450');
  });

  it('formata valores em USD compactos', () => {
    expect(formatCompactUsd(1_200_000_000)).toBe('$1.20B');
    expect(formatCompactUsd(54_000_000)).toBe('$54.0M');
    expect(formatCompactUsd(7_500)).toBe('$7.5K');
  });

  it('formata percentuais', () => {
    expect(formatPercent(22.8)).toBe('22.8%');
    expect(formatPercent(100)).toBe('100.0%');
    expect(formatPercent(0.45)).toBe('0.5%');
  });

  it('converte TokenomicsData em TokenomicsSnapshot para IA', () => {
    const data: TokenomicsData = {
      symbol: 'ENAUSDT',
      baseAsset: 'ENA',
      name: 'Ethena',
      currentPrice: 0.28,
      circulatingSupply: 3_420_000_000,
      totalSupply: 15_000_000_000,
      maxSupply: 15_000_000_000,
      circulatingPercent: 22.8,
      lockedPercent: 77.2,
      lockedSupply: 11_580_000_000,
      lockedValueUsd: 3_242_400_000,
      marketCapUsd: 957_600_000,
      fdvUsd: 4_200_000_000,
      nextUnlockDate: '05/11/2026',
      nextUnlockDays: 35,
      nextUnlockAmount: 175_000_000,
      nextUnlockValueUsd: 49_000_000,
      nextUnlockPercent: 1.17,
      dilutionRisk: 'high',
      unlockScheduleType: 'cliff',
      categories: [
        { name: 'Investidores e Core Contributors', percent: 60, locked: true },
        { name: 'Circulante Mercado', percent: 22.8, locked: false },
      ],
      source: 'curated',
      lastUpdated: Date.now(),
    };

    const snapshot = toTokenomicsSnapshot(data);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.baseAsset).toBe('ENA');
    expect(snapshot?.circulatingSupply).toBe(3_420_000_000);
    expect(snapshot?.circulatingPercent).toBe(22.8);
    expect(snapshot?.lockedPercent).toBe(77.2);
    expect(snapshot?.dilutionRisk).toBe('high');
    expect(snapshot?.nextUnlockAmount).toBe(175_000_000);
    expect(snapshot?.nextUnlockPercent).toBe(1.17);
  });

  it('retorna null para dados ausentes', () => {
    expect(toTokenomicsSnapshot(null)).toBeNull();
  });
});
