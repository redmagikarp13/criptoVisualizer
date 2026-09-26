import { useState, useMemo } from 'react';
import type { OrderBook as OrderBookType } from '../../lib/types';
import { TrendingDown, TrendingUp, Bot, ShieldAlert, Zap, ChevronDown, ChevronUp, Target, Compass } from 'lucide-react';
import { useBotDetector } from './botDetector';

interface OrderBookProps {
  depth: OrderBookType | null;
  currentPrice?: number;
  onSelectPrice?: (price: number) => void;
  maxLevels?: number;
}

const formatPrice = (val: number) => {
  if (!Number.isFinite(val)) return '—';
  if (val >= 1000) return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (val >= 1) return val.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  if (val >= 0.001) return val.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 6, maximumFractionDigits: 8 });
};

const formatAmount = (val: number) => {
  if (!Number.isFinite(val)) return '—';
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}k`;
  if (val < 1) return val.toFixed(4);
  return val.toFixed(1);
};

export function OrderBookView({ depth, currentPrice, onSelectPrice, maxLevels = 10 }: OrderBookProps) {
  const [radarExpanded, setRadarExpanded] = useState(true);
  const botAnalysis = useBotDetector(depth, currentPrice);

  const { asks, bids, totalBidQty, totalAskQty, maxDepth, spread, spreadPercent, bidPercent } = useMemo(() => {
    if (!depth || depth.bids.length === 0 || depth.asks.length === 0) {
      return {
        asks: [],
        bids: [],
        totalBidQty: 0,
        totalAskQty: 0,
        maxDepth: 1,
        spread: 0,
        spreadPercent: 0,
        bidPercent: 50,
      };
    }

    // Limit to maxLevels
    const rawAsks = depth.asks.slice(0, maxLevels);
    const rawBids = depth.bids.slice(0, maxLevels);

    // Calculate cumulative amounts
    let askCum = 0;
    const computedAsks = rawAsks.map(level => {
      askCum += level.amount;
      return { ...level, total: askCum };
    });

    let bidCum = 0;
    const computedBids = rawBids.map(level => {
      bidCum += level.amount;
      return { ...level, total: bidCum };
    });

    const maxDepthVal = Math.max(askCum, bidCum, 1);
    const bestBid = rawBids[0]?.price ?? 0;
    const bestAsk = rawAsks[0]?.price ?? 0;
    const spr = Math.max(0, bestAsk - bestBid);
    const sprPct = bestAsk > 0 ? (spr / bestAsk) * 100 : 0;

    const bidVol = rawBids.reduce((sum, b) => sum + b.amount, 0);
    const askVol = rawAsks.reduce((sum, a) => sum + a.amount, 0);
    const total = bidVol + askVol;
    const bidPct = total > 0 ? (bidVol / total) * 100 : 50;

    // Asks are displayed with highest price at top, best ask at bottom
    const displayAsks = [...computedAsks].reverse();

    return {
      asks: displayAsks,
      bids: computedBids,
      totalBidQty: bidVol,
      totalAskQty: askVol,
      maxDepth: maxDepthVal,
      spread: spr,
      spreadPercent: sprPct,
      bidPercent: bidPct,
    };
  }, [depth, maxLevels]);

  if (!depth || depth.bids.length === 0) {
    return (
      <div className="orderbook-empty">
        <p className="muted">Carregando livro de ofertas em tempo real…</p>
      </div>
    );
  }

  const askPercent = 100 - bidPercent;

  return (
    <div className="orderbook-container" aria-label="Livro de Ofertas">
      {/* Radar de Bots & Market Makers */}
      <section className="bot-radar-card" aria-label="Detector de Bots e Market Makers">
        <div className="bot-radar-header" onClick={() => setRadarExpanded(!radarExpanded)}>
          <div className="bot-radar-title">
            <Bot size={14} className="bot-icon" />
            <span>Radar de Bots & MMs</span>
            {botAnalysis.hftActive && (
              <span className="hft-badge" title="Robôs de alta frequência operando no spread">
                <Zap size={10} /> HFT
              </span>
            )}
            {botAnalysis.spoofAlerts.length > 0 && (
              <span className="spoof-badge" title="Spoofing (ordem falsa) detectado">
                <ShieldAlert size={10} /> Spoofing!
              </span>
            )}
          </div>
          <button
            type="button"
            className="radar-toggle-btn"
            aria-label={radarExpanded ? 'Recolher radar de bots' : 'Expandir radar de bots'}
          >
            {radarExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {radarExpanded && (
          <div className="bot-radar-content">
            {/* Análise de Forçamento de Preço pelos Robôs */}
            <div className={`bot-intent-card intent-${botAnalysis.intent.direction}`}>
              <div className="bot-intent-header">
                <span className="intent-title-badge">
                  {botAnalysis.intent.direction === 'pushing_up' && <TrendingUp size={13} className="text-positive" />}
                  {botAnalysis.intent.direction === 'pushing_down' && <TrendingDown size={13} className="text-negative" />}
                  {botAnalysis.intent.direction === 'neutral' && <Compass size={13} className="text-muted" />}
                  <strong>{botAnalysis.intent.headline}</strong>
                </span>
                <span className={`intent-score-pill ${botAnalysis.intent.score > 0 ? 'score-up' : botAnalysis.intent.score < 0 ? 'score-down' : ''}`}>
                  Score {botAnalysis.intent.score > 0 ? `+${botAnalysis.intent.score}` : botAnalysis.intent.score}
                </span>
              </div>

              {/* Termômetro Gráfico de Pressão dos Robôs (-100 a +100) */}
              <div className="intent-gauge-container">
                <div className="intent-gauge-labels">
                  <span className="text-negative">Forçando Baixa</span>
                  <span className="text-muted">Neutro</span>
                  <span className="text-positive">Forçando Alta</span>
                </div>
                <div className="intent-gauge-track">
                  <div
                    className="intent-gauge-pointer"
                    style={{ left: `${Math.max(4, Math.min(96, botAnalysis.intent.bidPressurePct))}%` }}
                    title={`Pressão Algorítmica: ${botAnalysis.intent.bidPressurePct}% Alta vs ${botAnalysis.intent.askPressurePct}% Baixa`}
                  />
                </div>
              </div>

              {/* Tática e Explicação Operacional */}
              <div className="intent-tactic-box">
                <div className="intent-tactic-header">
                  <Target size={11} className="tactic-icon" />
                  <span className="intent-tactic-name">{botAnalysis.intent.tactic}</span>
                </div>
                <p className="intent-explanation">{botAnalysis.intent.explanation}</p>
                <div className="intent-advice">
                  <span className="advice-label">Leitura:</span> {botAnalysis.intent.actionableAdvice}
                </div>
              </div>
            </div>

            {/* Spoofing Alerts Banner */}
            {botAnalysis.spoofAlerts.length > 0 && (
              <div className="spoof-alert-box">
                {botAnalysis.spoofAlerts.map(alert => (
                  <div key={alert.id} className="spoof-alert-item">
                    <ShieldAlert size={12} className="alert-icon" />
                    <span>
                      <strong>Spoofing ({alert.side === 'bid' ? 'Compra' : 'Venda'} Falsa):</strong> Parede de{' '}
                      {formatAmount(alert.amount)} em {formatPrice(alert.price)} foi cancelada antes da execução!
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Paredes de Suporte / Resistência do MM */}
            <div className="bot-walls-grid">
              <div className="bot-wall-item bid-wall">
                <span className="wall-role">Suporte MM (Compra)</span>
                <strong>
                  {botAnalysis.topBidWall ? formatPrice(botAnalysis.topBidWall.price) : 'Nenhuma parede'}
                </strong>
                {botAnalysis.topBidWall && (
                  <small>
                    {formatAmount(botAnalysis.topBidWall.amount)} ({botAnalysis.topBidWall.ratioToAverage.toFixed(1)}x média)
                  </small>
                )}
              </div>
              <div className="bot-wall-item ask-wall">
                <span className="wall-role">Barreira MM (Venda)</span>
                <strong>
                  {botAnalysis.topAskWall ? formatPrice(botAnalysis.topAskWall.price) : 'Nenhuma parede'}
                </strong>
                {botAnalysis.topAskWall && (
                  <small>
                    {formatAmount(botAnalysis.topAskWall.amount)} ({botAnalysis.topAskWall.ratioToAverage.toFixed(1)}x média)
                  </small>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Barra de Pressão do Book */}
      <div className="orderbook-pressure-bar" title={`Pressão: ${bidPercent.toFixed(1)}% Compra vs ${askPercent.toFixed(1)}% Venda`}>
        <div className="pressure-indicator">
          <span className="pressure-label positive"><TrendingUp size={12} /> {bidPercent.toFixed(0)}%</span>
          <span className="pressure-title">Pressão do Livro</span>
          <span className="pressure-label negative">{askPercent.toFixed(0)}% <TrendingDown size={12} /></span>
        </div>
        <div className="pressure-track">
          <div className="pressure-fill-bid" style={{ width: `${bidPercent}%` }} />
          <div className="pressure-fill-ask" style={{ width: `${askPercent}%` }} />
        </div>
      </div>

      <div className="orderbook-header-row">
        <span>Preço</span>
        <span className="text-right">Qtd</span>
        <span className="text-right">Acumulado</span>
      </div>

      {/* Asks (Vendas) */}
      <div className="orderbook-list asks-list">
        {asks.map(level => {
          const depthRatio = Math.min(100, (level.total / maxDepth) * 100);
          const wall = botAnalysis.activeWalls.find(w => w.side === 'ask' && Math.abs(w.price - level.price) < 1e-6);
          return (
            <button
              key={`ask-${level.price}`}
              className={`orderbook-row ask-row ${wall ? 'has-bot-wall' : ''}`}
              onClick={() => onSelectPrice?.(level.price)}
              title={`Venda: ${level.amount.toFixed(2)} a ${formatPrice(level.price)}${
                wall ? ` [Parede de MM: ${wall.ratioToAverage.toFixed(1)}x a média]` : ''
              } (Clique para usar preço)`}
            >
              <div className="depth-bar ask-depth-bar" style={{ width: `${depthRatio}%` }} />
              <span className="price-cell negative">
                {formatPrice(level.price)}
                {wall && <span className="bot-tag-wall" title={`Parede de Market Maker: ${wall.amount.toFixed(2)} (${wall.ratioToAverage.toFixed(1)}x)`}>🧱 MM</span>}
              </span>
              <span className="amount-cell text-right">{formatAmount(level.amount)}</span>
              <span className="total-cell text-right">{formatAmount(level.total)}</span>
            </button>
          );
        })}
      </div>

      {/* Spread & Current Price Banner */}
      <div className="orderbook-spread-banner">
        <div className="spread-current-price">
          <strong>{formatPrice(currentPrice ?? (depth.bids[0]?.price ?? 0))}</strong>
        </div>
        <div className="spread-info">
          <span className="muted">Spread {formatPrice(spread)} ({spreadPercent.toFixed(3)}%)</span>
        </div>
      </div>

      {/* Bids (Compras) */}
      <div className="orderbook-list bids-list">
        {bids.map(level => {
          const depthRatio = Math.min(100, (level.total / maxDepth) * 100);
          const wall = botAnalysis.activeWalls.find(w => w.side === 'bid' && Math.abs(w.price - level.price) < 1e-6);
          return (
            <button
              key={`bid-${level.price}`}
              className={`orderbook-row bid-row ${wall ? 'has-bot-wall' : ''}`}
              onClick={() => onSelectPrice?.(level.price)}
              title={`Compra: ${level.amount.toFixed(2)} a ${formatPrice(level.price)}${
                wall ? ` [Parede de MM: ${wall.ratioToAverage.toFixed(1)}x a média]` : ''
              } (Clique para usar preço)`}
            >
              <div className="depth-bar bid-depth-bar" style={{ width: `${depthRatio}%` }} />
              <span className="price-cell positive">
                {formatPrice(level.price)}
                {wall && <span className="bot-tag-wall" title="Parede de Market Maker">🧱 MM</span>}
              </span>
              <span className="amount-cell text-right">{formatAmount(level.amount)}</span>
              <span className="total-cell text-right">{formatAmount(level.total)}</span>
            </button>
          );
        })}
      </div>

      <div className="orderbook-footer">
        <span>Vol. Compra: <strong>{formatAmount(totalBidQty)}</strong></span>
        <span>Vol. Venda: <strong>{formatAmount(totalAskQty)}</strong></span>
      </div>
    </div>
  );
}
