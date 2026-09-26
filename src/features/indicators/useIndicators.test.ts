import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { defaultPreferences } from '../settings/preferences';
import { calculateIndicators } from './calculations';
import { useIndicators } from './useIndicators';

class WorkerFixture {
  static current: WorkerFixture;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  request = 0;
  constructor() { WorkerFixture.current = this; }
  postMessage(data: { id: number }) { this.request = data.id; }
  terminate() {}
}
afterEach(() => vi.unstubAllGlobals());
it('oculta resultados de parâmetros antigos enquanto o Worker recalcula', () => {
  vi.stubGlobal('Worker', WorkerFixture);
  const candles = [{ time: 60, open: 10, high: 12, low: 9, close: 11, volume: 2, closed: true }];
  const settings = defaultPreferences.indicators;
  const { result, rerender } = renderHook(({ parameters }) => useIndicators(candles, parameters), { initialProps: { parameters: settings } });
  const worker = WorkerFixture.current;
  act(() => worker.onmessage?.({ data: { id: worker.request, result: calculateIndicators(candles, settings) } } as MessageEvent));
  expect(result.current.result).not.toBeNull();
  rerender({ parameters: { ...settings, smaPeriod: 5 } });
  expect(result.current.result).toBeNull();
  act(() => worker.onerror?.());
  expect(result.current.error).not.toBe('');
  expect(result.current.result).toBeNull();
});
