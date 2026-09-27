import { useState, useMemo } from 'react';
import type { Exchange, OrderBook as OrderBookType } from '../../lib/types';
import { TrendingDown, TrendingUp, Bot, ShieldAlert, Zap, ChevronDown, ChevronUp, Target, Compass, Clock } from 'lucide-react';
import { useBotDetector, formatWallAge } from './botDetector';
import { mergeOrderBooks } from './mergeBooks';

export interface OrderBookProps {
  depth: OrderBookType | null;
  depths?: Partial<Record<Exchange, OrderBookType>>;
  selectedExchange?: Exchange | 'merged';
  onSelectExchange?: (exchange: Exchange | 'merged') => void;
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

export function OrderBookView({
  depth,
  depths,
  selectedExchange,
  onSelectExchange,
  currentPrice,
  onSelectPrice,
  maxLevels = 10,
}: OrderBookProps) {
  const [radarExpanded, setRadarExpanded] = useState(true);
  const [internalExchange, setInternalExchange] = useState<Exchange | 'merged'>(() => {
    try {
      const saved = localStorage.getItem('criptovisualizer:orderbook-exchange');
      return saved === 'okx' || saved === 'bybit' || saved === 'merged' ? saved : 'binance';
    } catch {
      return 'binance';
    }
  });

  const currentExchange = selectedExchange ?? internalExchange;

  const handleSelectExchange = (ex: Exchange | 'merged') => {
    setInternalExchange(ex);
    onSelectExchange?.(ex);
    try {
      localStorage.setItem('criptovisualizer:orderbook-exchange', ex);
    } catch {
      // Ignora erro de localStorage indisponível
    }
  };

  const activeDepth = useMemo(() => {
    if (currentExchange === 'merged') {
      const allBooks = [depths?.binance ?? depth, depths?.okx, depths?.bybit];
      return mergeOrderBooks(allBooks, depth?.symbol ?? 'BTCUSDT');
    }
    if (currentExchange === 'okx') return depths?.okx ?? null;
    if (currentExchange === 'bybit') return depths?.bybit ?? null;
    return depths?.binance ?? depth ?? null;
  }, [currentExchange, depth, depths]);

  const availableSources = useMemo(() => {
    const list: { key: Exchange; name: string; hasData: boolean }[] = [
      { key: 'binance', name: 'Binance', hasData: Boolean((depths?.binance ?? depth)?.bids?.length) },
      { key: 'okx', name: 'OKX', hasData: Boolean(depths?.okx?.bids?.length) },
      { key: 'bybit', name: 'Bybit', hasData: Boolean(depths?.bybit?.bids?.length) },
    ];
    return list;
  }, [depths, depth]);

  const activeCount = availableSources.filter(s => s.hasData).length;

  const botAnalysis = useBotDetector(activeDepth, currentPrice);

  const { asks, bids, totalBidQty, totalAskQty, maxDepth, spread, spreadPercent, bidPercent, bestBid, bestAsk } = useMemo(() => {
    if (!activeDepth || activeDepth.bids.length === 0 || activeDepth.asks.length === 0) {
      return {
        asks: [],
        bids: [],
        totalBidQty: 0,
        totalAskQty: 0,
        maxDepth: 1,
        spread: 0,
        spreadPercent: 0,
        bidPercent: 50,
        bestBid: 0,
        bestAsk: 0,
      };
    }

    // Limit to maxLevels
    const rawAsks = activeDepth.asks.slice(0, maxLevels);
    const rawBids = activeDepth.bids.slice(0, maxLevels);

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
    const bBid = rawBids[0]?.price ?? 0;
    const bAsk = rawAsks[0]?.price ?? 0;
    const spr = Math.max(0, bAsk - bBid);
    const sprPct = bAsk > 0 ? (spr / bAsk) * 100 : 0;

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
      bestBid: bBid,
      bestAsk: bAsk,
    };
  }, [activeDepth, maxLevels]);

  const askPercent = 100 - bidPercent;

  return (
    <div className="orderbook-container" aria-label="Livro de Ofertas">
      {/* Seletor de Exchanges & Consolidado */}
      <div className="orderbook-exchange-tabs" role="tablist" aria-label="Fonte do Livro de Ofertas">
        <button
          type="button"
          role="tab"
          aria-selected={currentExchange === 'binance'}
          className={`ob-tab ${currentExchange === 'binance' ? 'active' : ''}`}
          onClick={() => handleSelectExchange('binance')}
        >
          Binance
          <span className={`tab-dot ${(depths?.binance ?? depth)?.bids?.length ? 'live' : 'idle'}`} />
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={currentExchange === 'okx'}
          className={`ob-tab ${currentExchange === 'okx' ? 'active' : ''}`}
          onClick={() => handleSelectExchange('okx')}
        >
          OKX
          <span className={`tab-dot ${depths?.okx?.bids?.length ? 'live' : 'idle'}`} />
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={currentExchange === 'bybit'}
          className={`ob-tab ${currentExchange === 'bybit' ? 'active' : ''}`}
          onClick={() => handleSelectExchange('bybit')}
        >
          Bybit
          <span className={`tab-dot ${depths?.bybit?.bids?.length ? 'live' : 'idle'}`} />
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={currentExchange === 'merged'}
          className={`ob-tab ${currentExchange === 'merged' ? 'active' : ''}`}
          onClick={() => handleSelectExchange('merged')}
          title="Mesclar livros de ofertas de todas as corretoras conectadas"
        >
          Consolidado
          {activeCount > 1 && <span className="tab-count">{activeCount}x</span>}
        </button>
      </div>

      {currentExchange === 'merged' && (
        <div className="orderbook-merged-badge">
          <span>Multicorretoras</span>
          <span className="sources">
            {availableSources.map(s => (
              <span key={s.key} className={`source-tag ${s.hasData ? 'active' : 'inactive'}`}>
                {s.name}
              </span>
            ))}
          </span>
        </div>
      )}

      {(!activeDepth || activeDepth.bids.length === 0) ? (
        <div className="orderbook-empty">
          <p className="muted">
            {currentExchange === 'merged'
              ? 'Carregando livro de ofertas em tempo real (Consolidado)…'
              : `Carregando livro de ofertas em tempo real (${currentExchange === 'okx' ? 'OKX' : currentExchange === 'bybit' ? 'Bybit' : 'Binance'})…`}
          </p>
        </div>
      ) : (
        <>
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
            {botAnalysis.rolling && botAnalysis.rolling.sampleDurationSec >= 4 && (
              <span
                className="sample-duration-badge"
                title={`Amostragem histórica contínua de ${botAnalysis.rolling.samplesCount} leituras ao longo de ${formatWallAge(botAnalysis.rolling.sampleDurationSec)} (retenção de até 15 min)`}
              >
                <Clock size={10} /> {formatWallAge(botAnalysis.rolling.sampleDurationSec)}
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

              {/* Médias Móveis de Pressão (1m / 5m / 15m) e Consistência */}
              {botAnalysis.rolling && (
                <div className="rolling-pressure-section">
                  <div className="rolling-pills-row">
                    <span className="rolling-pill pill-instant" title="Pressão instantânea atual do livro">
                      Inst: <strong>{botAnalysis.intent.bidPressurePct}% C</strong>
                    </span>
                    {botAnalysis.rolling.avgPressure1m !== null && (
                      <span className="rolling-pill" title="Média móvel de pressão nos últimos 60 segundos">
                        1m: <strong>{botAnalysis.rolling.avgPressure1m}% C</strong>
                      </span>
                    )}
                    {botAnalysis.rolling.avgPressure5m !== null && (
                      <span className="rolling-pill" title="Média móvel de pressão nos últimos 5 minutos">
                        5m: <strong>{botAnalysis.rolling.avgPressure5m}% C</strong>
                      </span>
                    )}
                    {botAnalysis.rolling.avgPressure15m !== null && (
                      <span className="rolling-pill" title="Média móvel de pressão acumulada de até 15 minutos">
                        15m: <strong>{botAnalysis.rolling.avgPressure15m}% C</strong>
                      </span>
                    )}
                  </div>
                  {botAnalysis.rolling.consistency === 'divergent' && (
                    <div className="consistency-badge badge-divergent" title="A pressão momentânea difere da média móvel acumulada">
                      ⚠️ Divergência: pico momentâneo vs média
                    </div>
                  )}
                  {botAnalysis.rolling.consistency === 'bullish_confirmed' && (
                    <div className="consistency-badge badge-confirmed-up" title="Pressão compradora confirmada pelo histórico">
                      ✅ Alta consistente ({botAnalysis.rolling.avgPressure5m ?? botAnalysis.rolling.avgPressure1m}% C)
                    </div>
                  )}
                  {botAnalysis.rolling.consistency === 'bearish_confirmed' && (
                    <div className="consistency-badge badge-confirmed-down" title="Pressão vendedora confirmada pelo histórico">
                      🔻 Baixa consistente ({100 - (botAnalysis.rolling.avgPressure5m ?? botAnalysis.rolling.avgPressure1m ?? 50)}% V)
                    </div>
                  )}
                </div>
              )}

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

            {/* Paredes de Suporte / Resistência do MM com Persistência */}
            <div className="bot-walls-grid">
              <div className="bot-wall-item bid-wall">
                <div className="wall-header-row">
                  <span className="wall-role">Suporte MM (Compra)</span>
                  {botAnalysis.topBidWall?.persistence && (
                    <span
                      className={`wall-persistence-tag tag-${botAnalysis.topBidWall.persistence}`}
                      title={`Tempo de sustentação contínua da parede: ${formatWallAge(botAnalysis.topBidWall.ageSeconds ?? 0)}`}
                    >
                      {botAnalysis.topBidWall.persistence === 'rock' && `🏰 Rocha (${formatWallAge(botAnalysis.topBidWall.ageSeconds ?? 0)})`}
                      {botAnalysis.topBidWall.persistence === 'solid' && `🛡️ Firme (${formatWallAge(botAnalysis.topBidWall.ageSeconds ?? 0)})`}
                      {botAnalysis.topBidWall.persistence === 'consolidating' && `⏳ Consolidando (${formatWallAge(botAnalysis.topBidWall.ageSeconds ?? 0)})`}
                      {botAnalysis.topBidWall.persistence === 'recent' && '⏱️ Recente'}
                    </span>
                  )}
                </div>
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
                <div className="wall-header-row">
                  <span className="wall-role">Barreira MM (Venda)</span>
                  {botAnalysis.topAskWall?.persistence && (
                    <span
                      className={`wall-persistence-tag tag-${botAnalysis.topAskWall.persistence}`}
                      title={`Tempo de sustentação contínua da barreira: ${formatWallAge(botAnalysis.topAskWall.ageSeconds ?? 0)}`}
                    >
                      {botAnalysis.topAskWall.persistence === 'rock' && `🏰 Rocha (${formatWallAge(botAnalysis.topAskWall.ageSeconds ?? 0)})`}
                      {botAnalysis.topAskWall.persistence === 'solid' && `🛡️ Firme (${formatWallAge(botAnalysis.topAskWall.ageSeconds ?? 0)})`}
                      {botAnalysis.topAskWall.persistence === 'consolidating' && `⏳ Consolidando (${formatWallAge(botAnalysis.topAskWall.ageSeconds ?? 0)})`}
                      {botAnalysis.topAskWall.persistence === 'recent' && '⏱️ Recente'}
                    </span>
                  )}
                </div>
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
                {wall && (
                  <span
                    className="bot-tag-wall"
                    title={`Parede de Market Maker: ${wall.amount.toFixed(2)} (${wall.ratioToAverage.toFixed(1)}x)${wall.ageSeconds && wall.ageSeconds >= 5 ? ` | Ativa há ${formatWallAge(wall.ageSeconds)}` : ''}`}
                  >
                    🧱 MM{wall.persistence === 'rock' ? ' 🏰' : wall.persistence === 'solid' ? ' 🛡️' : ''}
                  </span>
                )}
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
          <strong>{formatPrice(currentPrice ?? (activeDepth.bids[0]?.price ?? 0))}</strong>
        </div>
        <div className="spread-info">
          {bestBid >= bestAsk && bestAsk > 0 ? (
            <span className="arbitrage-tag" title="Preço de compra maior ou igual à venda entre corretoras">
              ⚡ Oportunidade Ágio
            </span>
          ) : (
            <span className="muted">Spread {formatPrice(spread)} ({spreadPercent.toFixed(3)}%)</span>
          )}
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
                {wall && (
                  <span
                    className="bot-tag-wall"
                    title={`Parede de Market Maker: ${wall.amount.toFixed(2)} (${wall.ratioToAverage.toFixed(1)}x)${wall.ageSeconds && wall.ageSeconds >= 5 ? ` | Ativa há ${formatWallAge(wall.ageSeconds)}` : ''}`}
                  >
                    🧱 MM{wall.persistence === 'rock' ? ' 🏰' : wall.persistence === 'solid' ? ' 🛡️' : ''}
                  </span>
                )}
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
      </>
      )}
    </div>
  );
}
