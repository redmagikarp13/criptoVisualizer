import { describe, expect, it } from 'vitest';
import { formatCountdown, getRemainingCandleSeconds } from './useCandleCountdown';

describe('formatCountdown', () => {
  it('formata segundos para intervalos curtos como MM:SS', () => {
    expect(formatCountdown(90, 300)).toBe('01:30');
    expect(formatCountdown(5, 60)).toBe('00:05');
    expect(formatCountdown(0, 900)).toBe('00:00');
  });

  it('formata segundos para intervalos horários como HH:MM:SS', () => {
    expect(formatCountdown(3665, 3600)).toBe('01:01:05');
    expect(formatCountdown(7200, 14400)).toBe('02:00:00');
  });

  it('formata segundos para intervalos diários com prefixo de dias', () => {
    expect(formatCountdown(90000, 86400)).toBe('1d 01:00:00');
  });

  it('calcula o tempo restante corretamente', () => {
    const remaining = getRemainingCandleSeconds('15m');
    expect(remaining).toBeGreaterThanOrEqual(0);
    expect(remaining).toBeLessThanOrEqual(900);
  });
});
