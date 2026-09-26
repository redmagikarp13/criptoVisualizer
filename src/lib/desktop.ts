import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { defaultPreferences, parsePreferences, type Preferences } from '../features/settings/preferences';
import type { Analysis, Snapshot } from '../features/analysis/snapshot';
import type { Agent, BrStockQuote, BrStockSearchResult, Candle, CliStatus, Instrument, MarketEvent, MarketRequest } from './types';

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
  async searchBrStocks(query: string, token?: string): Promise<BrStockSearchResult[]> {
    const q = query.trim();
    if (!q) return [];
    if (available) {
      try {
        return await invoke<BrStockSearchResult[]>('search_br_stocks', { query: q, token: token || null });
      } catch (err) {
        console.error('search_br_stocks desktop error:', err);
      }
    }
    try {
      const url = token
        ? `https://brapi.dev/api/quote/list?search=${encodeURIComponent(q)}&limit=15&token=${encodeURIComponent(token)}`
        : `https://brapi.dev/api/quote/list?search=${encodeURIComponent(q)}&limit=15`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return [];
      const data = (await res.json()) as { stocks?: Array<Record<string, unknown>> };
      return (data.stocks ?? []).map(s => ({
        stock: String(s.stock ?? ''),
        name: String(s.name ?? ''),
        close: typeof s.close === 'number' ? s.close : undefined,
        change: typeof s.change === 'number' ? s.change : undefined,
        volume: typeof s.volume === 'number' ? s.volume : undefined,
        marketCap: typeof s.market_cap === 'number' ? s.market_cap : undefined,
        logo: typeof s.logo === 'string' ? s.logo : undefined,
        sector: typeof s.sector === 'string' ? s.sector : undefined,
        stockType: typeof s.type === 'string' ? s.type : undefined,
      }));
    } catch {
      return [];
    }
  },
  async fetchBrQuotes(tickers: string[], token?: string): Promise<BrStockQuote[]> {
    if (tickers.length === 0) return [];
    if (available) {
      try {
        return await invoke<BrStockQuote[]>('fetch_br_quotes', { tickers, token: token || null });
      } catch (err) {
        console.error('fetch_br_quotes desktop error:', err);
      }
    }
    try {
      const joined = tickers.map(t => encodeURIComponent(t)).join(',');
      const url = token
        ? `https://brapi.dev/api/quote/${joined}?token=${encodeURIComponent(token)}&fundamental=false`
        : `https://brapi.dev/api/quote/${joined}?fundamental=false`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return [];
      const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
      const now = Date.now();
      return (data.results ?? [])
        .filter(r => Boolean(r.symbol) && typeof r.regularMarketPrice === 'number')
        .map(r => ({
          ticker: String(r.symbol),
          shortName: String(r.shortName ?? r.longName ?? r.symbol),
          price: Number(r.regularMarketPrice),
          change: typeof r.regularMarketChangePercent === 'number' ? r.regularMarketChangePercent : 0,
          changeAbs: typeof r.regularMarketChange === 'number' ? r.regularMarketChange : 0,
          previousClose: typeof r.regularMarketPreviousClose === 'number' ? r.regularMarketPreviousClose : Number(r.regularMarketPrice),
          volume: typeof r.regularMarketVolume === 'number' ? r.regularMarketVolume : 0,
          marketCap: typeof r.marketCap === 'number' ? r.marketCap : undefined,
          logourl: typeof r.logourl === 'string' ? r.logourl : undefined,
          updatedAt: now,
        }));
    } catch {
      return [];
    }
  },
  async fetchBrStockCandles(ticker: string, token?: string): Promise<Candle[]> {
    const t = ticker.trim();
    if (!t) return [];
    if (available) {
      try {
        return await invoke<Candle[]>('fetch_br_stock_candles', { ticker: t, token: token || null });
      } catch (err) {
        console.error('fetch_br_stock_candles desktop error:', err);
      }
    }
    try {
      const url = token
        ? `https://brapi.dev/api/quote/${encodeURIComponent(t)}?range=3mo&interval=1d&fundamental=false&token=${encodeURIComponent(token)}`
        : `https://brapi.dev/api/quote/${encodeURIComponent(t)}?range=3mo&interval=1d&fundamental=false`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return [];
      const data = (await res.json()) as { results?: Array<{ historicalDataPrice?: Array<Record<string, unknown>> }> };
      const first = data.results?.[0];
      if (!first?.historicalDataPrice) return [];
      return first.historicalDataPrice
        .filter(row => typeof row.date === 'number' && typeof row.open === 'number' && typeof row.close === 'number')
        .map(row => {
          const open = Number(row.open);
          const close = Number(row.close);
          const rawHigh = typeof row.high === 'number' ? row.high : Math.max(open, close);
          const rawLow = typeof row.low === 'number' ? row.low : Math.min(open, close);
          return {
            time: Number(row.date),
            open,
            high: Math.max(rawHigh, open, close),
            low: Math.min(rawLow, open, close),
            close,
            volume: typeof row.volume === 'number' ? row.volume : 0,
            closed: true,
          };
        });
    } catch {
      return [];
    }
  },
};
