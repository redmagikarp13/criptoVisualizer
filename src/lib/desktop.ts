import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { defaultPreferences, parsePreferences, type Preferences } from '../features/settings/preferences';
import type { Analysis, Snapshot } from '../features/analysis/snapshot';
import type { Agent, CliStatus, Instrument, MarketEvent, MarketRequest } from './types';

const available = isTauri();
export const desktop = {
  available,
  async loadPreferences(): Promise<{ preferences: Preferences; warning: string | null }> {
    if (!available) return { preferences: parsePreferences(localStorage.getItem('criptovisualizer-preview')), warning: null };
    const result = await invoke<{ preferences: unknown; warning: string | null }>('load_preferences');
    return { ...result, preferences: parsePreferences(result.preferences) };
  },
  async savePreferences(preferences: Preferences): Promise<void> {
    if (available) return invoke('save_preferences', { preferences });
    localStorage.setItem('criptovisualizer-preview', JSON.stringify(preferences));
  },
  async listInstruments(): Promise<Instrument[]> {
    if (!available) return defaultPreferences.favorites.map(symbol => ({ symbol, base: symbol.slice(0, -4), quote: 'USDT' }));
    return invoke('list_instruments');
  },
  async subscribeMarket(request: MarketRequest, receive: (event: MarketEvent) => void, signal: AbortSignal): Promise<() => void> {
    if (!available || signal.aborted) return () => {};
    const unlisten = await listen<MarketEvent>('market-event', ({ payload }) => { if (!signal.aborted) receive(payload); });
    if (signal.aborted) { unlisten(); return () => {}; }
    try { await invoke('start_market', { request }); }
    catch (error) { unlisten(); throw error; }
    let stopped = false;
    const cleanup = () => {
      if (stopped) return;
      stopped = true; unlisten();
      void invoke('stop_market', { id: request.id }).catch(() => {});
    };
    if (signal.aborted) cleanup();
    return cleanup;
  },
  async detectCli(preferences: Preferences): Promise<CliStatus[]> {
    if (!available) return (['qoder', 'antigravity'] as const).map(agent => ({ agent, available: false, path: null, message: 'Disponível no aplicativo desktop.' }));
    return invoke('detect_cli', { preferences });
  },
  async analyze(id: string, agent: Agent, snapshot: Snapshot): Promise<{ analysis: Analysis; model: string | null }> {
    if (!available) throw new Error('A análise por CLI exige o aplicativo desktop.');
    return invoke('analyze_market', { id, agent, snapshot });
  },
  async cancelAnalysis(id: string): Promise<void> { if (available) await invoke('cancel_analysis', { id }); },
  async notify(title: string, message: string): Promise<void> {
    if (available) {
      try {
        await invoke('notify', { title, message });
        return;
      } catch { /* fallback to browser */ }
    }
    if (typeof Notification !== 'undefined') {
      try {
        if (Notification.permission === 'granted') {
          new Notification(title, { body: message });
        } else if (Notification.permission !== 'denied') {
          Notification.requestPermission().then(permission => {
            if (permission === 'granted') new Notification(title, { body: message });
          });
        }
      } catch { /* ignore */ }
    }
  },
  async updateTray(title: string): Promise<void> {
    if (available) {
      try { await invoke('update_tray', { title }); } catch { /* ignore */ }
    }
  },
  async showMainWindow(): Promise<void> {
    if (available) {
      try { await invoke('show_main_window'); } catch { /* ignore */ }
    }
  },
};
