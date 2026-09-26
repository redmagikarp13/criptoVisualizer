import { useEffect, useState } from 'react';
import { Maximize2, Bell, RefreshCw, Activity, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { desktop } from '../lib/desktop';
import { defaultPreferences, type Preferences } from '../features/settings/preferences';
import { useMarket } from '../features/market/useMarket';
import { useIndicators } from '../features/indicators/useIndicators';
import { useAlerts } from '../features/alerts/useAlerts';
import { MarketChart } from '../features/chart/MarketChart';
import { AlertsDialog } from '../features/alerts/AlertsDialog';
import { pairLabel, splitSymbol } from '../lib/symbol';
import { intervals } from '../lib/types';

const priceFormatted = (val?: number) =>
  val === undefined ? '—' : new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: val < 1 ? 6 : 2 }).format(val);

export function WidgetApp() {
  const [preferences, setPreferences] = useState<Preferences>(() => structuredClone(defaultPreferences));
  const [ready, setReady] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [systemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true);

  const dark = preferences.theme === 'dark' || (preferences.theme === 'system' && systemDark);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);

  useEffect(() => {
    let active = true;
    desktop.loadPreferences().then(res => {
      if (active) {
        setPreferences(res.preferences);
        setReady(true);
      }
    }).catch(() => {
      if (active) setReady(true);
    });
    return () => { active = false; };
  }, []);

  const market = useMarket(preferences.symbol, preferences.interval, preferences.favorites, ready && desktop.available);
  const widgetIndicators = { ...preferences.indicators, sma: false, bands: false, macd: false }; // Keep chart clean in widget
  const indicators = useIndicators(market.candles, widgetIndicators);
  const alertEngine = useAlerts(preferences.alerts, market.quotes, id => {
    const nextAlerts = preferences.alerts.map(a => a.id === id ? { ...a, enabled: false } : a);
    update({ alerts: nextAlerts });
  });

  const quote = market.quotes[preferences.symbol];
  const isPositive = (quote?.change24h ?? 0) >= 0;

  function update(val: Partial<Preferences>) {
    const next = { ...preferences, ...val };
    setPreferences(next);
    void desktop.savePreferences(next);
  }

  // Update menu bar title when quote changes
  useEffect(() => {
    if (quote && Number.isFinite(quote.price)) {
      const split = splitSymbol(preferences.symbol);
      const base = split?.base ?? preferences.symbol;
      const quoteCurrency = split?.quote ?? 'USDT';
      const isFiatOrStable = ['USDT', 'USDC', 'BRL', 'EUR', 'FDUSD'].includes(quoteCurrency);
      const sign = quote.change24h >= 0 ? '+' : '';
      const text = `${base} ${isFiatOrStable ? '$' : ''}${priceFormatted(quote.price)} ${!isFiatOrStable ? quoteCurrency : ''} (${sign}${quote.change24h.toFixed(1)}%)`;
      void desktop.updateTray(text);
    }
  }, [quote?.price, quote?.change24h, preferences.symbol]);

  const activeAlertsCount = alertEngine.alerts.filter(a => a.enabled && a.symbol === preferences.symbol).length;

  return (
    <div className={`widget-container ${dark ? 'dark' : 'light'}`}>
      <header className="widget-header">
        <div className="widget-symbol-select">
          <select
            value={preferences.symbol}
            onChange={e => update({ symbol: e.target.value })}
            className="widget-select"
          >
            {preferences.favorites.map(sym => (
              <option key={sym} value={sym}>{pairLabel(sym)}</option>
            ))}
          </select>
        </div>

        <div className="widget-actions">
          <button
            type="button"
            className="widget-icon-btn"
            title="Alarmes de preço"
            onClick={() => setAlertsOpen(true)}
          >
            <Bell size={14} />
            {activeAlertsCount > 0 && <span className="widget-badge">{activeAlertsCount}</span>}
          </button>
          <button
            type="button"
            className="widget-icon-btn"
            title="Abrir aplicativo completo"
            onClick={() => desktop.showMainWindow()}
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </header>

      <section className="widget-hero">
        <div className="widget-price-group">
          <span className="widget-price">
            {['USDT', 'USDC', 'BRL', 'EUR', 'FDUSD'].includes(splitSymbol(preferences.symbol)?.quote ?? 'USDT') ? '$' : ''}
            {priceFormatted(quote?.price)}
            <small style={{ fontSize: '0.65em', marginLeft: '4px', opacity: 0.8 }}>{splitSymbol(preferences.symbol)?.quote ?? ''}</small>
          </span>
          <span className={`widget-change ${isPositive ? 'positive' : 'negative'}`}>
            {isPositive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {isPositive ? '+' : ''}{(quote?.change24h ?? 0).toFixed(2)}%
          </span>
        </div>
        <div className="widget-quick-stats">
          <span>Binance Spot</span>
          <span>{market.binanceStatus === 'connected' ? '• Ao vivo' : '• Reconectando'}</span>
        </div>
      </section>

      <div className="widget-intervals">
        {intervals.map(int => (
          <button
            key={int}
            type="button"
            className={`widget-int-btn ${preferences.interval === int ? 'active' : ''}`}
            onClick={() => update({ interval: int })}
          >
            {int}
          </button>
        ))}
      </div>

      <section className="widget-chart-wrapper">
        {market.candles.length > 0 ? (
          <MarketChart
            candles={market.candles}
            indicators={indicators.result}
            settings={widgetIndicators}
            dark={dark}
          />
        ) : (
          <div className="widget-chart-loading">
            <Activity size={24} className="spin" />
            <span>Carregando gráfico…</span>
          </div>
        )}
      </section>

      <footer className="widget-footer">
        <button
          type="button"
          className="widget-full-app-btn"
          onClick={() => desktop.showMainWindow()}
        >
          Expandir Observatório Completo
        </button>
        <button
          type="button"
          className="widget-refresh-btn"
          onClick={market.reconnect}
          title="Reconectar"
        >
          <RefreshCw size={12} />
        </button>
      </footer>

      {alertsOpen && (
      <AlertsDialog
          alerts={alertEngine.alerts}
          quotes={market.quotes}
          currentSymbol={preferences.symbol}
          mode="inline"
          onClose={() => setAlertsOpen(false)}
          onSave={async rules => {
            const next = { ...preferences, alerts: rules };
            setPreferences(next);
            await desktop.savePreferences(next);
          }}
        />
      )}
    </div>
  );
}
