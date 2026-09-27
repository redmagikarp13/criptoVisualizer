import React from 'react';
import { Zap, AlertTriangle, ShieldCheck, TrendingUp, RefreshCw, Clock } from 'lucide-react';
import type { DerivativesData } from './types';
import { formatCompactUsd } from './api';

interface Props {
  data: DerivativesData | null;
  loading?: boolean;
  onRefresh?: () => void;
  compact?: boolean;
}

export const DerivativesWidget: React.FC<Props> = ({
  data,
  loading = false,
  onRefresh,
  compact = false,
}) => {
  if (!data || !data.hasFutures) {
    return (
      <div className="derivatives-unavailable">
        <Zap size={15} className="muted" />
        <span className="muted">Mercado futuro / alavancagem indisponível para este par.</span>
      </div>
    );
  }

  const isFundingPositive = data.fundingRate > 0;
  const isFundingHigh = data.fundingRate >= 0.0003;
  const isFundingNegative = data.fundingRate < 0;

  const fundingColorClass = isFundingHigh
    ? 'negative'
    : isFundingNegative
    ? 'color-short-squeeze'
    : isFundingPositive
    ? 'positive'
    : 'muted';

  const riskBadgeClass = {
    high_long_squeeze: 'risk-badge-danger',
    high_short_squeeze: 'risk-badge-purple',
    liquidation_flush: 'risk-badge-warning',
    leverage_buildup: 'risk-badge-info',
    low: 'risk-badge-success',
  }[data.squeezeRisk];

  return (
    <div className={`derivatives-container ${compact ? 'compact' : ''}`}>
      {/* Cabeçalho */}
      <div className="derivatives-header">
        <div className="derivatives-title">
          <Zap size={15} className="zap-icon" />
          <strong>Alavancagem & Futuros</strong>
          <span className="live-dot" title="Dados em tempo real da Binance Futures">●</span>
        </div>
        {onRefresh && (
          <button
            type="button"
            className="icon-button mini-refresh-btn"
            onClick={onRefresh}
            disabled={loading}
            title="Atualizar dados de futuros agora"
          >
            <RefreshCw size={12} className={loading ? 'spinning' : ''} />
          </button>
        )}
      </div>

      {/* Alerta de Risco / Flush de Liquidação */}
      <div className={`derivatives-risk-banner ${riskBadgeClass}`}>
        <div className="risk-banner-head">
          {data.squeezeRisk === 'liquidation_flush' || data.squeezeRisk === 'high_long_squeeze' ? (
            <AlertTriangle size={14} />
          ) : data.squeezeRisk === 'low' ? (
            <ShieldCheck size={14} />
          ) : (
            <TrendingUp size={14} />
          )}
          <strong>{data.riskHeadline}</strong>
        </div>
        <p className="risk-banner-desc">{data.riskDescription}</p>
      </div>

      {/* Grid de Métricas Principais */}
      <div className="derivatives-grid">
        {/* Funding Rate */}
        <div className="derivatives-card">
          <div className="card-top">
            <span className="card-label">Taxa de Financiamento</span>
            <div className="countdown-pill" title="Tempo até o próximo débito/crédito da taxa">
              <Clock size={10} />
              <span>{data.nextFundingCountdown}</span>
            </div>
          </div>
          <div className="card-value-wrap">
            <strong className={`card-value ${fundingColorClass}`}>
              {data.fundingRatePercent}
            </strong>
          </div>
          <span className="card-footnote">
            {isFundingHigh
              ? 'Longs pagando taxa muito cara'
              : isFundingNegative
              ? 'Shorts pagando taxa para Longs'
              : 'Taxa equilibrada'}
          </span>
        </div>

        {/* Open Interest (Contratos em Aberto) */}
        <div className="derivatives-card">
          <div className="card-top">
            <span className="card-label">Contratos Abertos (OI)</span>
            {data.openInterestChange1hPct !== null && (
              <span
                className={`oi-change-tag ${
                  data.openInterestChange1hPct >= 0 ? 'positive' : 'negative'
                }`}
                title="Variação de contratos em aberto na última 1 hora"
              >
                {data.openInterestChange1hPct >= 0 ? '+' : ''}
                {data.openInterestChange1hPct}% 1h
              </span>
            )}
          </div>
          <div className="card-value-wrap">
            <strong className="card-value">
              {formatCompactUsd(data.openInterestValueUsd)}
            </strong>
          </div>
          <span className="card-footnote">
            {data.openInterestAmount >= 1_000_000
              ? `${(data.openInterestAmount / 1_000_000).toFixed(1)}M contratos`
              : `${Math.round(data.openInterestAmount).toLocaleString()} contratos`}
          </span>
        </div>
      </div>

      {/* Proporção Long vs Short - Varejo */}
      <div className="ls-ratio-section">
        <div className="ls-ratio-header">
          <span className="card-label">Long vs Short (Varejo)</span>
          <strong className="ls-ratio-badge">Ratio {data.longShortRatio}</strong>
        </div>
        <div className="ls-ratio-bar">
          <div
            className="ls-bar-fill long-bar"
            style={{ width: `${data.longAccountRatio}%` }}
            title={`Long: ${data.longAccountRatio}%`}
          >
            <span>{data.longAccountRatio}% C</span>
          </div>
          <div
            className="ls-bar-fill short-bar"
            style={{ width: `${data.shortAccountRatio}%` }}
            title={`Short: ${data.shortAccountRatio}%`}
          >
            <span>{data.shortAccountRatio}% V</span>
          </div>
        </div>
      </div>

      {/* Proporção Long vs Short - Top Traders (Smart Money) */}
      {data.topTradersLongRatio !== null && data.topTradersShortRatio !== null && (
        <div className="ls-ratio-section top-traders-section">
          <div className="ls-ratio-header">
            <span className="card-label">Top Traders (Baleias)</span>
            <strong className="ls-ratio-badge">Ratio {data.topTradersRatio ?? '—'}</strong>
          </div>
          <div className="ls-ratio-bar">
            <div
              className="ls-bar-fill long-bar whale-long"
              style={{ width: `${data.topTradersLongRatio}%` }}
              title={`Baleias em Long: ${data.topTradersLongRatio}%`}
            >
              <span>{data.topTradersLongRatio}%</span>
            </div>
            <div
              className="ls-bar-fill short-bar whale-short"
              style={{ width: `${data.topTradersShortRatio}%` }}
              title={`Baleias em Short: ${data.topTradersShortRatio}%`}
            >
              <span>{data.topTradersShortRatio}%</span>
            </div>
          </div>
          <span className="card-footnote whale-footnote">
            {data.longAccountRatio > (data.topTradersLongRatio ?? 50) + 4
              ? '⚠️ Varejo mais eufórico que as baleias (cautela com Long)'
              : (data.topTradersLongRatio ?? 50) > data.longAccountRatio + 4
              ? '💡 Baleias acumulando mais Long que o varejo'
              : 'Posicionamento alinhado entre varejo e baleias'}
          </span>
        </div>
      )}
    </div>
  );
};
