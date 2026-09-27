import { useEffect, useState } from 'react';
import type { Interval } from '../../lib/types';

export const INTERVAL_SECONDS: Record<Interval, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};

export function formatCountdown(seconds: number, duration: number): string {
  const diff = Math.max(0, Math.floor(seconds));
  if (duration < 3600) {
    const m = Math.floor(diff / 60).toString().padStart(2, '0');
    const s = (diff % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }
  if (duration < 86400) {
    const h = Math.floor(diff / 3600).toString().padStart(2, '0');
    const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
    const s = (diff % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  }
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600).toString().padStart(2, '0');
  const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
  const s = (diff % 60).toString().padStart(2, '0');
  return d > 0 ? `${d}d ${h}:${m}:${s}` : `${h}:${m}:${s}`;
}

export function getRemainingCandleSeconds(interval: Interval, lastCandleTime?: number): number {
  const duration = INTERVAL_SECONDS[interval] ?? 900;
  const now = Math.floor(Date.now() / 1000);
  const wallClockClose = (Math.floor(now / duration) + 1) * duration;

  let targetClose = wallClockClose;
  if (lastCandleTime && Number.isFinite(lastCandleTime)) {
    const expectedClose = lastCandleTime + duration;
    // Se o candle está no ciclo atual, usa a previsão do candle
    if (Math.abs(expectedClose - wallClockClose) <= duration) {
      targetClose = expectedClose;
    }
  }

  return Math.max(0, targetClose - now);
}

export function useCandleCountdown(interval: Interval, lastCandleTime?: number): string {
  const duration = INTERVAL_SECONDS[interval] ?? 900;
  const [countdown, setCountdown] = useState<string>(() =>
    formatCountdown(getRemainingCandleSeconds(interval, lastCandleTime), duration),
  );

  useEffect(() => {
    const update = () => {
      const remaining = getRemainingCandleSeconds(interval, lastCandleTime);
      setCountdown(formatCountdown(remaining, duration));
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [interval, lastCandleTime, duration]);

  return countdown;
}
