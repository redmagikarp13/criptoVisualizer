import { expect, it, vi } from 'vitest';
const ipc = vi.hoisted(() => ({ invoke: vi.fn(), unlisten: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: ipc.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: async () => ipc.unlisten }));
import { desktop } from './desktop';

it('libera uma assinatura apenas uma vez ao abortar durante o início', async () => {
  const controller = new AbortController();
  ipc.invoke.mockImplementation(async command => { if (command === 'start_market') controller.abort(); });
  const cleanup = await desktop.subscribeMarket({ id: 'teste', symbol: 'BTCUSDT', interval: '1m', favorites: [] }, () => {}, controller.signal);
  cleanup(); cleanup();
  expect(ipc.unlisten).toHaveBeenCalledTimes(1);
  expect(ipc.invoke.mock.calls.filter(call => call[0] === 'stop_market')).toHaveLength(1);
});
