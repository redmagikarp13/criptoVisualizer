import { useEffect, useRef, useState } from 'react';
import { errorMessage, type Candle, type CliStatus, type Interval, type OrderBook as OrderBookType } from '../../lib/types';
import { desktop } from '../../lib/desktop';
import { analysisSchema, buildSnapshot, type AnalysisRecord, type OrderBookSnapshot } from './snapshot';
import type { Preferences } from '../settings/preferences';
import type { Comparison } from '../market/comparison';
import { OrderBookView } from '../orderbook/OrderBook';
import { analyzeOrderBookBots } from '../orderbook/botDetector';
import { BookOpen, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { BrStocksPanel } from '../brstocks/BrStocksPanel';
import type { BrStockQuote } from '../brstocks/useBrStocks';

export interface AnalysisPanelProps {
  symbol: string;
  interval: Interval;
  candles: Candle[];
  depth?: OrderBookType | null;
  currentPrice?: number;
  onSelectPrice?: (price: number) => void;
  preferences: Preferences;
  statuses: CliStatus[];
  comparison: Comparison | null;
  hidden: boolean;
  brStocks: string[];
  brapiToken: string;
  brStockQuotes: Record<string, BrStockQuote>;
  brStocksLoading: boolean;
  brStocksError: string;
  brStocksLastFetch: number | null;
  onAddBrStock: (ticker: string) => void;
  onRemoveBrStock: (ticker: string) => void;
  onRefreshBrStocks: () => void;
  onSelectSymbol?: (symbol: string) => void;
}

export function AnalysisPanel({
  symbol,
  interval,
  candles,
  depth,
  currentPrice,
  onSelectPrice,
  preferences,
  statuses,
  comparison,
  hidden,
  brStocks,
  brStockQuotes,
  brStocksLoading,
  brStocksError,
  brStocksLastFetch,
  onAddBrStock,
  onRemoveBrStock,
  onRefreshBrStocks,
  onSelectSymbol,
}: AnalysisPanelProps) {
  const [orderBookOpen, setOrderBookOpen] = useState(true);
  const [aiOpen, setAiOpen] = useState(true);
  const [record, setRecord] = useState<AnalysisRecord | null>(null);
  const [running, setRunning] = useState<{ id: string; symbol: string; interval: Interval } | null>(null);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const current = useRef<string | null>(null);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (current.current) void desktop.cancelAnalysis(current.current).catch(() => {});
    };
  }, []);

  const status = statuses.find(item => item.agent === preferences.agent);
  const allowed = desktop.available && status?.available && (preferences.agent !== 'antigravity' || preferences.antigravityEnabled) && candles.some(c => c.closed);

  async function analyze() {
    if (current.current || !allowed) return;
    const id = crypto.randomUUID(); current.current = id; setError('');
    setRunning({ id, symbol, interval });
    try {
      let orderBookSnapshot: OrderBookSnapshot | null = null;
      if (depth && depth.bids.length > 0 && depth.asks.length > 0) {
        const bestBid = depth.bids[0].price;
        const bestAsk = depth.asks[0].price;
        const spr = Math.max(0, bestAsk - bestBid);
        const sprPct = bestAsk > 0 ? (spr / bestAsk) * 100 : 0;
        const bidVol = depth.bids.reduce((s, b) => s + b.amount, 0);
        const askVol = depth.asks.reduce((s, a) => s + a.amount, 0);
        const total = bidVol + askVol;
        const bidPct = total > 0 ? (bidVol / total) * 100 : 50;
        const askPct = 100 - bidPct;

        const { analysis: bots } = analyzeOrderBookBots(depth, [], currentPrice ?? bestBid);

        orderBookSnapshot = {
          spread: spr,
          spreadPercent: sprPct,
          bidPressurePercent: bidPct,
          askPressurePercent: askPct,
          topBidWall: bots.topBidWall
            ? { price: bots.topBidWall.price, amount: bots.topBidWall.amount, ratioToAverage: bots.topBidWall.ratioToAverage }
            : null,
          topAskWall: bots.topAskWall
            ? { price: bots.topAskWall.price, amount: bots.topAskWall.amount, ratioToAverage: bots.topAskWall.ratioToAverage }
            : null,
          botBias: bots.algorithmicBias,
          spoofDetected: bots.spoofAlerts.length > 0,
          hftActive: bots.hftActive,
          botPressure: {
            direction: bots.intent.direction,
            score: bots.intent.score,
            headline: bots.intent.headline,
            tactic: bots.intent.tactic,
          },
        };
      }

      const snapshot = buildSnapshot(symbol, interval, candles, preferences.indicators, comparison, Date.now(), orderBookSnapshot);
      const result = await desktop.analyze(id, preferences.agent, snapshot);
      const analysis = analysisSchema.parse(result.analysis);
      if (active.current) setRecord({ id, agent: preferences.agent, model: result.model, snapshot, analysis, completedAt: Date.now() });
    } catch (cause) {
      if (active.current) setError(cause instanceof Error && cause.name === 'ZodError' ? 'A CLI retornou uma resposta inválida.' : errorMessage(cause));
    } finally {
      current.current = null;
      if (active.current) { setRunning(null); setCancelling(false); }
    }
  }

  async function cancel() {
    if (!current.current) return;
    setCancelling(true);
    try { await desktop.cancelAnalysis(current.current); } catch (cause) { setError(errorMessage(cause)); setCancelling(false); }
  }

  const mismatch = record && (record.snapshot.symbol !== symbol || record.snapshot.interval !== interval);

  return (
    <aside className="analysis-panel" aria-label="Painel de mercado e análise" hidden={hidden}>
      {/* Ações BR — B3 */}
      <BrStocksPanel
        quotes={brStockQuotes}
        tickers={brStocks}
        loading={brStocksLoading}
        error={brStocksError}
        lastFetch={brStocksLastFetch}
        onAddTicker={onAddBrStock}
        onRemoveTicker={onRemoveBrStock}
        onRefresh={onRefreshBrStocks}
        onSelectTicker={onSelectSymbol}
        selectedTicker={symbol}
      />

      {/* Livro de Ofertas (Order Book) */}
      <section className="sidebar-section orderbook-section" aria-label="Livro de Ofertas">
        <button
          type="button"
          className="section-header-btn"
          onClick={() => setOrderBookOpen(v => !v)}
          aria-expanded={orderBookOpen}
        >
          <div className="section-title">
            <BookOpen size={16} />
            <h2>Livro de Ofertas</h2>
          </div>
          <div className="section-meta">
            <span>Binance</span>
            {orderBookOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </button>
        {orderBookOpen && (
          <OrderBookView
            depth={depth ?? null}
            currentPrice={currentPrice}
            onSelectPrice={onSelectPrice}
            maxLevels={8}
          />
        )}
      </section>

      {/* Análise por IA */}
      <section className="sidebar-section ai-section" aria-label="Análise por IA">
        <button
          type="button"
          className="section-header-btn"
          onClick={() => setAiOpen(v => !v)}
          aria-expanded={aiOpen}
        >
          <div className="section-title">
            <Sparkles size={16} />
            <h2>Análise por IA</h2>
          </div>
          <div className="section-meta">
            <span>Sob demanda</span>
            {aiOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </button>
        {aiOpen && (
          <>
            <div className="analysis-body">
              <p>Uma leitura do mercado, no seu tempo.</p>
              <p className="muted">Até 100 candles fechados, com indicadores calculados sobre o histórico disponível. Nenhum arquivo pessoal é anexado pelo aplicativo.</p>
              <p className="muted"><strong>{preferences.agent === 'qoder' ? 'Qoder CLI' : 'Antigravity CLI'}</strong><br />{status?.message ?? 'Verificando disponibilidade da CLI…'}</p>
              {running ? (
                <>
                  <p role="status">Analisando {running.symbol} · {running.interval}. Limite de 180 segundos.</p>
                  <button className="analyze-button" onClick={() => void cancel()} disabled={cancelling}>{cancelling ? 'Cancelando…' : 'Cancelar análise'}</button>
                </>
              ) : (
                <button className="primary analyze-button" onClick={() => void analyze()} disabled={!allowed}>Analisar com IA</button>
              )}
              <p className="muted">Cada clique pode consumir a cota da sua conta. Não há análises automáticas.</p>
              {!candles.some(c => c.closed) && <p className="muted">Aguardando histórico de candles fechados.</p>}
              {error && <p role="alert" className="warning-text">{error}</p>}
            </div>
            {record && (
              <article className="analysis-result" aria-label="Resultado da análise">
                {mismatch && <p className="notice">Esta análise pertence a outro par ou período. O snapshot original foi preservado.</p>}
                <div className="snapshot-label">{record.agent === 'qoder' ? 'Qoder' : 'Antigravity'} · {record.model ?? 'Modelo não informado pela CLI'}<br />{record.snapshot.symbol} · {record.snapshot.interval} · Binance<br />Snapshot: {new Date(record.snapshot.capturedAt).toLocaleString('pt-BR')}</div>
                <h3>Resumo</h3><p>{record.analysis.summary}</p><p>Tendência observada: <strong>{record.analysis.trend}</strong></p>
                <h3>Evidências</h3><ul>{record.analysis.evidence.map((text, index) => <li key={index}>{text}</li>)}</ul>
                <h3>Cenários condicionais</h3>{record.analysis.scenarios.map((scenario, index) => <p key={index}><strong>{scenario.condition}</strong><br />{scenario.interpretation}</p>)}
                <h3>Riscos</h3><ul>{record.analysis.risks.map((text, index) => <li key={index}>{text}</li>)}</ul>
                <h3>Limitações</h3><ul>{record.analysis.limitations.map((text, index) => <li key={index}>{text}</li>)}</ul>
              </article>
            )}
            <p className="analysis-disclaimer">Conteúdo informativo, não recomendação de investimento. Cenários não garantem resultados futuros.</p>
          </>
        )}
      </section>
    </aside>
  );
}
