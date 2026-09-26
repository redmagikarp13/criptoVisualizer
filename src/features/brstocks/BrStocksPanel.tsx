import { useState } from 'react';
import { TrendingUp, TrendingDown, RefreshCw, Plus, X, ChevronDown, ChevronUp, BarChart2, AlertCircle } from 'lucide-react';
import type { BrStockQuote } from './useBrStocks';
import { STALE_MS } from './useBrStocks';

interface BrStocksPanelProps {
  quotes: Record<string, BrStockQuote>;
  tickers: string[];
  loading: boolean;
  error: string;
  lastFetch: number | null;
  onAddTicker: (ticker: string) => void;
  onRemoveTicker: (ticker: string) => void;
  onRefresh: () => void;
}

const fmtPrice = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const fmtVol = (v: number) => {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return String(v);
};

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function BrStocksPanel({
  quotes, tickers, loading, error, lastFetch,
  onAddTicker, onRemoveTicker, onRefresh,
}: BrStocksPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [input, setInput] = useState('');

  const handleAdd = () => {
    const t = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (t.length >= 4 && t.length <= 8 && !tickers.includes(t)) {
      onAddTicker(t);
      setInput('');
    }
  };

  const stale = lastFetch !== null && Date.now() - lastFetch > STALE_MS;

  return (
    <section className="sidebar-section br-stocks-section" aria-label="Ações BR — B3">
      <button
        type="button"
        className="section-header-btn"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
      >
        <div className="section-title">
          <BarChart2 size={16} />
          <h2>Ações BR</h2>
        </div>
        <div className="section-meta">
          <span className="br-stocks-source-badge">B3 · brapi.dev</span>
          {loading && <span className="br-stocks-loading-dot" title="Buscando cotações…" />}
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {expanded && (
        <div className="br-stocks-content">
          {/* Delay warning */}
          <p className="br-stocks-delay-note muted">
            ⏱ Cotações com até 15 min de atraso (B3/brapi.dev gratuito)
          </p>

          {/* Error */}
          {error && (
            <div className="br-stocks-error">
              <AlertCircle size={13} />
              <span>{error}</span>
            </div>
          )}

          {/* Stale warning */}
          {stale && !error && (
            <div className="br-stocks-stale">
              <AlertCircle size={13} />
              <span>Dados podem estar desatualizados.</span>
              <button type="button" className="text-button" onClick={onRefresh}>
                <RefreshCw size={11} /> Atualizar
              </button>
            </div>
          )}

          {/* Lista de ações */}
          {tickers.length === 0 ? (
            <p className="muted" style={{ fontSize: '12px', padding: '8px 0' }}>
              Adicione tickers abaixo (ex: PETR4, VALE3, BBDC4).
            </p>
          ) : (
            <div className="br-stocks-list">
              {tickers.map(ticker => {
                const q = quotes[ticker];
                const isPositive = (q?.change ?? 0) >= 0;
                return (
                  <div key={ticker} className="br-stock-row">
                    <div className="br-stock-info">
                      <span className="br-stock-ticker">{ticker}</span>
                      {q?.shortName && (
                        <span className="br-stock-name muted" title={q.shortName}>
                          {q.shortName.length > 18 ? q.shortName.slice(0, 18) + '…' : q.shortName}
                        </span>
                      )}
                    </div>
                    <div className="br-stock-price-col">
                      {q ? (
                        <>
                          <span className="br-stock-price">{fmtPrice(q.price)}</span>
                          <span className={`br-stock-change ${isPositive ? 'positive' : 'negative'}`}>
                            {isPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                            {isPositive ? '+' : ''}{q.change.toFixed(2)}%
                          </span>
                          <span className="br-stock-vol muted">Vol {fmtVol(q.volume)}</span>
                        </>
                      ) : (
                        <span className="muted" style={{ fontSize: '11px' }}>Buscando…</span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="br-stock-remove icon-button"
                      aria-label={`Remover ${ticker}`}
                      onClick={() => onRemoveTicker(ticker)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Adicionar ticker */}
          <div className="br-stocks-add-row">
            <input
              className="br-stocks-input"
              value={input}
              onChange={e => setInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="Ex: PETR4, VALE3…"
              maxLength={8}
              spellCheck={false}
              aria-label="Ticker de ação BR"
            />
            <button
              type="button"
              className="br-stocks-add-btn"
              onClick={handleAdd}
              disabled={input.trim().length < 4}
              aria-label="Adicionar ação"
            >
              <Plus size={13} />
            </button>
          </div>

          {/* Última atualização */}
          {lastFetch && (
            <div className="br-stocks-footer">
              <span className="muted">Atualizado {fmtTime(lastFetch)}</span>
              <button type="button" className="icon-button" onClick={onRefresh} aria-label="Atualizar cotações" disabled={loading}>
                <RefreshCw size={12} className={loading ? 'spin' : ''} />
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
