import { useEffect, useMemo, useRef, useState } from 'react';
import { MarketChart } from '../features/chart/MarketChart';
import { AnalysisPanel } from '../features/analysis/AnalysisPanel';
import { Activity, PanelRightClose, PanelRightOpen, Search, Settings, Star, RefreshCw, Bell, BellRing, X } from 'lucide-react';
import { desktop } from '../lib/desktop';
import { errorMessage, intervals, type CliStatus } from '../lib/types';
import { defaultPreferences, type Preferences } from '../features/settings/preferences';
import { SettingsDialog } from '../features/settings/SettingsDialog';
import { useMarket } from '../features/market/useMarket';
import { compareQuotes, comparisonRows } from '../features/market/comparison';
import { useIndicators } from '../features/indicators/useIndicators';
import { useAlerts } from '../features/alerts/useAlerts';
import { AlertsDialog } from '../features/alerts/AlertsDialog';
import { pairLabel, splitSymbol } from '../lib/symbol';
import { useBrStocks } from '../features/brstocks/useBrStocks';

const price = (value: number | undefined) => value === undefined ? '—' : new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: value < 1 ? 8 : 2 }).format(value);
const pair = pairLabel;
const clock = (time: number | undefined) => time ? new Date(time).toLocaleTimeString('pt-BR') : 'Sem atualização';
const exchangeNames: Record<string, string> = { okx: 'OKX', bybit: 'Bybit' };

export function App() {
  const [preferences, setPreferences] = useState(() => structuredClone(defaultPreferences));
  const [ready, setReady] = useState(false);
  const [warning, setWarning] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(true);
  const [statuses, setStatuses] = useState<CliStatus[]>([]);
  const [query, setQuery] = useState('');
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  const saveQueue = useRef(Promise.resolve());
  const market = useMarket(preferences.symbol, preferences.interval, preferences.favorites, ready && desktop.available);
  const indicators = useIndicators(market.candles, preferences.indicators);
  const [brStocksRefresh, setBrStocksRefresh] = useState(0);
  const brStocks = useBrStocks(
    preferences.brStocks ?? [],
    preferences.brapiToken ?? '',
    ready && (preferences.brStocks?.length ?? 0) > 0,
    brStocksRefresh,
  );
  const alertEngine = useAlerts(preferences.alerts, market.quotes, id => {
    const nextAlerts = preferences.alerts.map(a => a.id === id ? { ...a, enabled: false } : a);
    update({ alerts: nextAlerts });
  });
  const dark = preferences.theme === 'dark' || (preferences.theme === 'system' && systemDark);
  useEffect(() => {
    let active = true;
    desktop.loadPreferences().then(result => { if (active) { setPreferences(result.preferences); setWarning(result.warning ?? ''); setReady(true); } }).catch(cause => { if (active) { setWarning(errorMessage(cause)); setReady(true); } });
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const change = () => setSystemDark(media?.matches ?? false);
    media?.addEventListener('change', change);
    return () => { active = false; clearInterval(timer); media?.removeEventListener('change', change); };
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
  const cliPreferences = useMemo(() => ({ ...defaultPreferences, qoderPath: preferences.qoderPath, antigravityPath: preferences.antigravityPath, antigravityEnabled: preferences.antigravityEnabled }), [preferences.qoderPath, preferences.antigravityPath, preferences.antigravityEnabled]);
  useEffect(() => {
    if (!ready) return;
    let active = true; setStatuses([]);
    desktop.detectCli(cliPreferences).then(value => { if (active) setStatuses(value); }).catch(cause => { if (active) setWarning(errorMessage(cause)); });
    return () => { active = false; };
  }, [ready, cliPreferences]);
  function save(value: Preferences) {
    const next = saveQueue.current.catch(() => {}).then(() => desktop.savePreferences(value));
    saveQueue.current = next;
    return next;
  }
  function update(value: Partial<Preferences>) {
    const next = { ...preferences, ...value }; setPreferences(next);
    void save(next).catch(cause => setWarning(errorMessage(cause)));
  }
  const quote = market.quotes[preferences.symbol];
  useEffect(() => {
    if (quote && Number.isFinite(quote.price)) {
      const base = splitSymbol(preferences.symbol)?.base ?? preferences.symbol;
      const sign = quote.change24h >= 0 ? '+' : '';
      const text = `${base} $${price(quote.price)} (${sign}${quote.change24h.toFixed(1)}%)`;
      void desktop.updateTray(text);
    }
  }, [quote?.price, quote?.change24h, preferences.symbol]);
  const stale = !quote || now - quote.time > 10_000;
  const comparison = compareQuotes(quote, market.comparison.okx, now);
  const rows = comparisonRows(quote, market.comparison, now);
  const selectedFavorite = preferences.favorites.includes(preferences.symbol);
  const filtered = query.trim() ? market.instruments.filter(i => i.symbol.includes(query.replace(/\W/g, '').toUpperCase())).slice(0, 40) : [];
  const labels = { connecting: 'Conectando', connected: 'Ao vivo', reconnecting: 'Reconectando', error: 'Sem conexão' };
  return <div className={`workspace ${analysisOpen ? '' : 'analysis-collapsed'}`}>
    <header className="app-header"><a className="brand" href="#market"><Activity size={22} aria-hidden="true" /><span>CriptoVisualizer</span></a><span className="local-label">Spot · Dados públicos · Uso pessoal</span><div className="header-actions"><button className="icon-button" aria-label="Alarmes de preço" onClick={() => setAlertsOpen(true)} disabled={!ready}><Bell size={19} /></button><button className="icon-button" aria-label="Configurações" onClick={() => setSettingsOpen(true)} disabled={!ready}><Settings size={19} /></button><button className="icon-button" aria-label={analysisOpen ? 'Recolher análise' : 'Mostrar análise'} aria-expanded={analysisOpen} onClick={() => setAnalysisOpen(value => !value)}>{analysisOpen ? <PanelRightClose size={19} /> : <PanelRightOpen size={19} />}</button></div></header>
    <aside className="watchlist" aria-label="Pares e favoritos">
      <div className="panel-heading"><h2>Mercado</h2><span className="muted">{splitSymbol(preferences.symbol)?.quote ?? 'Spot'}</span></div>
      <label className="search-field"><Search size={16} aria-hidden="true" /><input aria-label="Buscar par Spot" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar par (ex: BTC, ENA, IOTA...)" spellCheck={false} /></label>
      {query ? <div className="search-results">{filtered.length === 0 && <p className="muted">Nenhum par encontrado.</p>}{filtered.map(i => <button key={i.symbol} onClick={() => { update({ symbol: i.symbol }); setQuery(''); }}>{pair(i.symbol)}</button>)}</div> : <><div className="list-caption"><span>Favoritos</span><span>{preferences.favorites.length}/20</span></div><nav aria-label="Favoritos">{preferences.favorites.map(symbol => {
        const current = market.quotes[symbol]; const fresh = current && now - current.time <= 10_000;
        return <button className={`watch-item ${preferences.symbol === symbol ? 'selected' : ''}`} key={symbol} aria-label={`Selecionar ${pair(symbol)}`} aria-current={preferences.symbol === symbol ? 'true' : undefined} onClick={() => update({ symbol })}><span className="watch-symbol">{splitSymbol(symbol)?.base ?? symbol}<small>{splitSymbol(symbol)?.quote ?? ''}</small></span><span className="watch-price">{price(current?.price)}<small className={fresh ? (current.change24h >= 0 ? 'positive' : 'negative') : 'muted'}>{fresh ? `${current.change24h >= 0 ? '+' : ''}${current.change24h.toFixed(2)}%` : 'Sem cotação recente'}</small></span></button>;
      })}</nav>{preferences.favorites.length === 0 && <p className="muted empty-favorites">Busque um par e adicione aos favoritos.</p>}</>}
      {market.catalogError && <div className="sidebar-error"><p role="alert">{market.catalogError}</p><button onClick={market.reconnect}>Tentar novamente</button></div>}
      <div className="source-note"><strong>Binance Spot</strong><p>Fonte do gráfico e dos indicadores. OKX apenas para comparação.</p></div>
    </aside>
    <main id="market" className="market-area">
      {!desktop.available && <div className="notice">Abra o aplicativo desktop para receber cotações reais e usar as CLIs. Esta visualização não simula preços.</div>}
      {warning && <div className="notice" role="alert">{warning}<button onClick={() => setWarning('')} aria-label="Dispensar aviso">Fechar</button></div>}
      <section className="market-heading"><div><div className="asset-title"><h1>{pair(preferences.symbol)}</h1><button className="icon-button favorite-toggle" aria-label={selectedFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'} aria-pressed={selectedFavorite} disabled={!selectedFavorite && preferences.favorites.length >= 20} onClick={() => update({ favorites: selectedFavorite ? preferences.favorites.filter(s => s !== preferences.symbol) : [...preferences.favorites, preferences.symbol] })}><Star size={18} fill={selectedFavorite ? 'currentColor' : 'none'} /></button></div><span className="muted">Binance · Spot</span></div><div className="current-price"><strong>{price(quote?.price)} <small>{splitSymbol(preferences.symbol)?.quote ?? 'USDT'}</small></strong><span className={!stale ? (quote.change24h >= 0 ? 'positive' : 'negative') : 'muted'}>{quote ? `${quote.change24h >= 0 ? '+' : ''}${quote.change24h.toFixed(2)}% em 24h` : 'Aguardando cotação'}</span></div><div className="connection"><span className={`connection-label ${market.binanceStatus === 'connected' && !stale ? 'positive' : ''}`}>{desktop.available ? (stale && market.binanceStatus === 'connected' ? 'Cotação desatualizada' : labels[market.binanceStatus]) : 'Prévia no navegador'}</span><time>{clock(quote?.time)}</time><button className="text-button" onClick={market.reconnect} disabled={!desktop.available}><RefreshCw size={12} />Reconectar</button></div></section>
      <div className="chart-toolbar"><div className="intervals" role="group" aria-label="Período dos candles">{intervals.map(interval => <button key={interval} aria-pressed={interval === preferences.interval} onClick={() => update({ interval })}>{interval}</button>)}</div><span className="muted">Até 1.000 candles</span></div>
      <div className="indicator-toolbar" role="group" aria-label="Indicadores">{(['sma', 'ema', 'bands', 'rsi', 'macd'] as const).map((name, index) => <label className="indicator-toggle" key={name}><input type="checkbox" checked={preferences.indicators[name]} onChange={e => update({ indicators: { ...preferences.indicators, [name]: e.target.checked } })} />{[`SMA ${preferences.indicators.smaPeriod}`, `EMA ${preferences.indicators.emaFastPeriod}/${preferences.indicators.emaSlowPeriod}`, 'Bollinger', 'RSI 14', 'MACD'][index]}</label>)}</div>
      <section className="chart-region" aria-label={`Gráfico de candles ${pair(preferences.symbol)}`}>{market.candles.length ? <MarketChart key={`${preferences.symbol}-${preferences.interval}`} candles={market.candles} indicators={indicators.result} settings={preferences.indicators} dark={dark} /> : <div className="chart-empty"><Activity size={32} aria-hidden="true" /><h2>{desktop.available ? 'Aguardando mercado' : 'O mercado aparece aqui'}</h2><p>{desktop.available ? market.binanceMessage : 'Candles, volume e indicadores, com dados públicos da Binance.'}</p></div>}</section>
      {indicators.error && <p role="alert">{indicators.error}</p>}
      <div className="chart-footnote"><span>Eixo em UTC · Detalhes em horário local · Candle em formação: valores provisórios</span><span>{market.candles.length} candles</span></div>
      <section className="comparison-section" aria-label="Comparação entre exchanges"><div className="comparison-heading"><h2>Comparação entre exchanges</h2><span className="muted">Últimos negócios · {splitSymbol(preferences.symbol)?.quote ?? 'Spot'}</span></div><div className="comparison-grid" role="table"><div className="comparison-row comparison-head" role="row"><span>Fonte</span><span>Preço</span><span>Horário</span><span>vs Binance</span></div><div className="comparison-row" role="row"><span>Binance</span><strong>{price(quote?.price)}</strong><time>{clock(quote?.time)}</time><span className="muted">referência</span></div>{rows.map(row => <div className="comparison-row" role="row" key={row.exchange}><span>{exchangeNames[row.exchange] ?? row.exchange}</span><strong>{price(row.price)}</strong><time>{clock(row.time)}</time><strong className={row.difference === null ? 'unavailable' : row.difference >= 0 ? 'positive' : 'negative'}>{row.difference === null ? 'indisponível' : `${row.difference >= 0 ? '+' : ''}${row.difference.toFixed(3)}%`}</strong></div>)}{rows.length === 0 && <div className="comparison-row" role="row"><span className="muted">{desktop.available ? 'Aguardando cotações das exchanges de comparação…' : 'Disponível no aplicativo desktop'}</span><span /><span /><span /></div>}</div><p className="disclaimer">Não são ofertas executáveis. A diferença não inclui taxas, liquidez ou transferências.</p></section>
    </main>
    <AnalysisPanel
      symbol={preferences.symbol}
      interval={preferences.interval}
      candles={market.candles}
      depth={market.depth}
      currentPrice={quote?.price}
      onSelectPrice={() => setAlertsOpen(true)}
      preferences={preferences}
      statuses={statuses}
      comparison={comparison}
      hidden={!analysisOpen}
      brStocks={preferences.brStocks ?? []}
      brapiToken={preferences.brapiToken ?? ''}
      brStockQuotes={brStocks.quotes}
      brStocksLoading={brStocks.loading}
      brStocksError={brStocks.error}
      brStocksLastFetch={brStocks.lastFetch}
      onAddBrStock={ticker => update({ brStocks: [...(preferences.brStocks ?? []), ticker] })}
      onRemoveBrStock={ticker => update({ brStocks: (preferences.brStocks ?? []).filter(t => t !== ticker) })}
      onRefreshBrStocks={() => setBrStocksRefresh(v => v + 1)}
    />
    {settingsOpen && <SettingsDialog preferences={preferences} statuses={statuses} onClose={() => setSettingsOpen(false)} onSave={async value => { await save(value); setPreferences(value); }} />}
    {alertsOpen && <AlertsDialog alerts={alertEngine.alerts} quotes={market.quotes} currentSymbol={preferences.symbol} onClose={() => setAlertsOpen(false)} onSave={async value => { await save({ ...preferences, alerts: value }); setPreferences(current => ({ ...current, alerts: value })); }} />}
    {alertEngine.fired.length > 0 && <div className="alert-toasts" role="status" aria-live="polite">{alertEngine.fired.map(alert => <div className="alert-toast" key={alert.id}><BellRing size={16} aria-hidden="true" /><span>{pairLabel(alert.symbol)} · {alert.direction === 'above' ? 'acima' : 'abaixo'} de {new Intl.NumberFormat('pt-BR').format(alert.price)}</span><button className="icon-button" aria-label="Dispensar alarme" onClick={() => alertEngine.dismiss(alert.id)}><X size={14} /></button></div>)}</div>}
  </div>;
}
