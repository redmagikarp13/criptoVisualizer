import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { defaultPreferences, parsePreferences, type Preferences } from '../features/settings/preferences';
import type { Analysis, Snapshot } from '../features/analysis/snapshot';
import type { Agent, BrStockQuote, BrStockSearchResult, Candle, CliStatus, Instrument, MarketEvent, MarketRequest } from './types';

const isBrowserDocPreview = typeof window !== 'undefined' && (new URLSearchParams(window.location.search).get('preview') === 'desktop' || window.location.port === '8089');
const available = isTauri() || isBrowserDocPreview;
export const desktop = {
  available,
  async loadPreferences(): Promise<{ preferences: Preferences; warning: string | null }> {
    if (!isTauri()) return { preferences: parsePreferences(localStorage.getItem('criptovisualizer-preview')), warning: null };
    const result = await invoke<{ preferences: unknown; warning: string | null }>('load_preferences');
    return { ...result, preferences: parsePreferences(result.preferences) };
  },
  async savePreferences(preferences: Preferences): Promise<void> {
    if (isTauri()) return invoke('save_preferences', { preferences });
    localStorage.setItem('criptovisualizer-preview', JSON.stringify(preferences));
  },
  async listInstruments(): Promise<Instrument[]> {
    if (!isTauri()) return defaultPreferences.favorites.map(symbol => ({ symbol, base: symbol.slice(0, -4), quote: 'USDT' }));
    return invoke('list_instruments');
  },
  async subscribeMarket(request: MarketRequest, receive: (event: MarketEvent) => void, signal: AbortSignal): Promise<() => void> {
    if (isTauri()) {
      if (signal.aborted) return () => {};
      const unlisten = await listen<MarketEvent>('market-event', ({ payload }) => {
        if (!signal.aborted && payload.id === request.id) receive(payload);
      });
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
    }

    if (signal.aborted) return () => {};

    receive({
      id: request.id,
      kind: 'status',
      exchange: 'binance',
      status: 'connected',
      message: 'Conectado à Binance',
    });

    const isCrypto = !request.symbol.endsWith('3') && !request.symbol.endsWith('4') && !request.symbol.endsWith('11');
    if (!isCrypto) return () => {};

    // 1. Histórico de Candles
    const klinesUrl = `https://data-api.binance.vision/api/v3/klines?symbol=${encodeURIComponent(request.symbol)}&interval=${encodeURIComponent(request.interval)}&limit=300`;
    fetch(klinesUrl, { signal })
      .then(res => res.json())
      .then(data => {
        if (signal.aborted || !Array.isArray(data)) return;
        const now = Date.now();
        const candles: Candle[] = data.map((row: any) => ({
          time: Math.floor(Number(row[0]) / 1000),
          open: Number(row[1]),
          high: Number(row[2]),
          low: Number(row[3]),
          close: Number(row[4]),
          volume: Number(row[5]),
          closed: Number(row[6]) < now,
        }));
        receive({ id: request.id, kind: 'history', candles });
      })
      .catch(() => {});

    // 2. Cotações dos favoritos + símbolo atual
    const tickersUrl = 'https://data-api.binance.vision/api/v3/ticker/24hr';
    fetch(tickersUrl, { signal })
      .then(res => res.json())
      .then(tickers => {
        if (signal.aborted || !Array.isArray(tickers)) return;
        const targets = new Set([request.symbol, ...request.favorites]);
        const now = Date.now();
        for (const t of tickers) {
          if (targets.has(t.symbol)) {
            receive({
              id: request.id,
              kind: 'quote',
              quote: {
                symbol: t.symbol,
                price: Number(t.lastPrice),
                change24h: Number(t.priceChangePercent),
                time: Number(t.closeTime),
                receivedAt: now,
                exchange: 'binance',
              },
            });
          }
        }
      })
      .catch(() => {});

    // 3. Livro de Ofertas (Depth)
    const depthUrl = `https://data-api.binance.vision/api/v3/depth?symbol=${encodeURIComponent(request.symbol)}&limit=50`;
    fetch(depthUrl, { signal })
      .then(res => res.json())
      .then(d => {
        if (signal.aborted || !d?.bids || !d?.asks) return;
        receive({
          id: request.id,
          kind: 'depth',
          depth: {
            symbol: request.symbol,
            bids: d.bids.map((b: any) => ({ price: Number(b[0]), amount: Number(b[1]) })),
            asks: d.asks.map((a: any) => ({ price: Number(a[0]), amount: Number(a[1]) })),
            time: Date.now(),
            exchange: 'binance',
          },
        });
      })
      .catch(() => {});

    // 4. WebSocket ao vivo
    const cleanSym = request.symbol.toLowerCase();
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${cleanSym}@kline_${request.interval}/${cleanSym}@depth20@100ms/${cleanSym}@ticker`);

    ws.onmessage = (event) => {
      if (signal.aborted) return;
      try {
        const msg = JSON.parse(event.data);
        if (msg.e === 'kline' && msg.k) {
          const k = msg.k;
          receive({
            id: request.id,
            kind: 'candle',
            candle: {
              time: Math.floor(Number(k.t) / 1000),
              open: Number(k.o),
              high: Number(k.h),
              low: Number(k.l),
              close: Number(k.c),
              volume: Number(k.v),
              closed: Boolean(k.x),
            },
          });
        } else if (msg.bids && msg.asks) {
          receive({
            id: request.id,
            kind: 'depth',
            depth: {
              symbol: request.symbol,
              bids: msg.bids.map((b: any) => ({ price: Number(b[0]), amount: Number(b[1]) })),
              asks: msg.asks.map((a: any) => ({ price: Number(a[0]), amount: Number(a[1]) })),
              time: Date.now(),
              exchange: 'binance',
            },
          });
        } else if (msg.e === '24hrTicker') {
          receive({
            id: request.id,
            kind: 'quote',
            quote: {
              symbol: msg.s,
              price: Number(msg.c),
              change24h: Number(msg.P),
              time: Number(msg.E),
              receivedAt: Date.now(),
              exchange: 'binance',
            },
          });
        }
      } catch {
        // ignore error
      }
    };

    return () => {
      ws.close();
    };
  },
  async detectCli(preferences: Preferences): Promise<CliStatus[]> {
    const hasOpenAiKey = Boolean(preferences.openaiApiKey?.trim());
    const openAiStatus: CliStatus = {
      agent: 'openai',
      available: hasOpenAiKey,
      path: null,
      message: hasOpenAiKey
        ? `OpenAI API configurada (${preferences.openaiModel || 'gpt-4o-mini'}).`
        : 'Configure sua API key da OpenAI nas configurações.',
    };
    if (!available) {
      return [
        { agent: 'qoder', available: false, path: null, message: 'Disponível no aplicativo desktop.' },
        { agent: 'antigravity', available: false, path: null, message: 'Disponível no aplicativo desktop.' },
        openAiStatus,
      ];
    }
    const statuses = await invoke<CliStatus[]>('detect_cli', { preferences });
    if (!statuses.some(s => s.agent === 'openai')) {
      statuses.push(openAiStatus);
    }
    return statuses;
  },
  async analyze(
    id: string,
    agent: Agent,
    snapshot: Snapshot,
    preferences?: Preferences,
    signal?: AbortSignal,
  ): Promise<{ analysis: Analysis; model: string | null }> {
    if (agent === 'openai') {
      const { analyzeWithOpenAi } = await import('../features/analysis/openai');
      return analyzeWithOpenAi(snapshot, preferences?.openaiApiKey || '', preferences?.openaiModel, preferences?.openaiBaseUrl, signal);
    }
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
  async exitApp(): Promise<void> {
    if (available) {
      try { await invoke('exit_app'); } catch { /* ignore */ }
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
  async fetchDerivativesData(symbol: string): Promise<Record<string, unknown> | null> {
    if (isTauri()) {
      try {
        return await invoke<Record<string, unknown> | null>('fetch_derivatives_data', { symbol });
      } catch (err) {
        console.warn('fetch_derivatives_data desktop error:', err);
      }
    }
    const clean = symbol.trim().toUpperCase();
    if (!clean.endsWith('USDT') && !clean.endsWith('USDC')) return null;
    try {
      const [premiumRes, oiRes, oiHistRes, lsRes, topLsRes] = await Promise.all([
        fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${clean}`).catch(() => null),
        fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${clean}`).catch(() => null),
        fetch(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${clean}&period=15m&limit=8`).catch(() => null),
        fetch(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${clean}&period=15m&limit=2`).catch(() => null),
        fetch(`https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=${clean}&period=15m&limit=2`).catch(() => null),
      ]);
      const premium = premiumRes && premiumRes.ok ? await premiumRes.json() : null;
      const oi = oiRes && oiRes.ok ? await oiRes.json() : null;
      const oiHist = oiHistRes && oiHistRes.ok ? await oiHistRes.json() : [];
      const ls = lsRes && lsRes.ok ? await lsRes.json() : [];
      const topLs = topLsRes && topLsRes.ok ? await topLsRes.json() : [];
      return { premium, oi, oi_hist: oiHist, ls, top_ls: topLs };
    } catch {
      return null;
    }
  },
};

