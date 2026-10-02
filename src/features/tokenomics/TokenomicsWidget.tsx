import React from 'react';
import { AlertTriangle, CheckCircle2, Clock, Lock, RefreshCw, ShieldAlert, Unlock } from 'lucide-react';
import { formatCompactNumber, formatCompactUsd, formatPercent } from './api';
import type { TokenomicsData } from './types';

interface Props {
  data: TokenomicsData;
  loading?: boolean;
  onRefresh?: () => void;
  compact?: boolean;
}

export const TokenomicsWidget: React.FC<Props> = ({
  data,
  loading = false,
  onRefresh,
  compact = false,
}) => {
  const isHighRisk = data.dilutionRisk === 'high';
  const isModerateRisk = data.dilutionRisk === 'moderate';

  const riskLabel = isHighRisk
    ? 'Alta Pressão Vendedora'
    : isModerateRisk
    ? 'Diluição Moderada'
    : 'Baixo Risco de Diluição';

  const riskClass = isHighRisk ? 'risk-high' : isModerateRisk ? 'risk-moderate' : 'risk-low';

  return (
    <div className={`tokenomics-widget ${compact ? 'compact' : ''}`}>
      {/* Topo do Widget */}
      <div className="tokenomics-widget-header">
        <div className="header-coin-info">
          <span className="coin-name">{data.name}</span>
          <span className="coin-base">({data.baseAsset})</span>
          {data.currentPrice > 0 && (
            <span className="coin-price">{formatCompactUsd(data.currentPrice)}</span>
          )}
        </div>
        {onRefresh && (
          <button
            type="button"
            className="icon-button refresh-btn"
            onClick={onRefresh}
            title="Atualizar dados de suprimento"
            disabled={loading}
          >
            <RefreshCw size={12} className={loading ? 'spinning' : ''} />
          </button>
        )}
      </div>

      {/* Barra de Progresso Visual de Desbloqueio */}
      <div className="tokenomics-supply-section">
        <div className="supply-header-row">
          <span className="label-circulating">
            <Unlock size={11} /> Circulante: {formatPercent(data.circulatingPercent)}
          </span>
          <span className="label-locked">
            <Lock size={11} /> Bloqueado: {formatPercent(data.lockedPercent)}
          </span>
        </div>
        <div className="supply-progress-track">
          <div
            className="supply-progress-fill circulating"
            style={{ width: `${Math.max(5, Math.min(95, data.circulatingPercent))}%` }}
            title={`Circulante: ${formatCompactNumber(data.circulatingSupply)} (${formatPercent(data.circulatingPercent)})`}
          />
          <div
            className="supply-progress-fill locked"
            style={{ width: `${Math.max(5, Math.min(95, data.lockedPercent))}%` }}
            title={`Bloqueado / Vesting: ${formatCompactNumber(data.lockedSupply)} (${formatPercent(data.lockedPercent)})`}
          />
        </div>
        <div className="supply-numbers-row">
          <span>{formatCompactNumber(data.circulatingSupply)} {data.baseAsset}</span>
          <span>{formatCompactNumber(data.lockedSupply)} {data.baseAsset} ({formatCompactUsd(data.lockedValueUsd)})</span>
        </div>
      </div>

      {/* Grid de Métricas Chave */}
      <div className="tokenomics-stats-grid">
        <div className="stat-card">
          <span className="stat-label">Market Cap</span>
          <span className="stat-val">{formatCompactUsd(data.marketCapUsd)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">FDV (Totalmente Diluído)</span>
          <span className="stat-val">{formatCompactUsd(data.fdvUsd)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Suprimento Total</span>
          <span className="stat-val">{formatCompactNumber(data.totalSupply)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Suprimento Máximo</span>
          <span className="stat-val">{data.maxSupply ? formatCompactNumber(data.maxSupply) : 'Ilimitado'}</span>
        </div>
      </div>

      {/* Card de Próximo Desbloqueio */}
      <div className={`tokenomics-unlock-card ${riskClass}`}>
        <div className="unlock-card-top">
          <div className="unlock-title-row">
            {isHighRisk ? (
              <ShieldAlert size={14} className="icon-risk" />
            ) : isModerateRisk ? (
              <AlertTriangle size={14} className="icon-risk" />
            ) : (
              <CheckCircle2 size={14} className="icon-risk" />
            )}
            <span className="unlock-title">Próximo Desbloqueio</span>
          </div>
          <span className={`risk-badge ${riskClass}`}>{riskLabel}</span>
        </div>

        {data.nextUnlockDate ? (
          <div className="unlock-details">
            <div className="unlock-countdown-row">
              <Clock size={12} />
              <span>
                {data.nextUnlockDays === 0
                  ? 'Hoje!'
                  : `Em ${data.nextUnlockDays} ${data.nextUnlockDays === 1 ? 'dia' : 'dias'} (${data.nextUnlockDate})`}
              </span>
            </div>
            {data.nextUnlockAmount && (
              <div className="unlock-amount-row">
                <span className="amount-tokens">
                  +{formatCompactNumber(data.nextUnlockAmount)} {data.baseAsset}
                </span>
                {data.nextUnlockValueUsd && (
                  <span className="amount-usd">
                    ≈ {formatCompactUsd(data.nextUnlockValueUsd)}
                  </span>
                )}
                {data.nextUnlockPercent && (
                  <span className="amount-impact" title="Impacto relativo ao suprimento circulante">
                    (+{formatPercent(data.nextUnlockPercent)} circ.)
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="unlock-empty">
            <span>Emissão linear suave ou suprimento já amplamente circulante. Sem grandes cliffs previstos.</span>
          </div>
        )}
      </div>

      {/* Distribuição por Categoria (se houver) */}
      {data.categories && data.categories.length > 0 && (
        <div className="tokenomics-categories">
          <span className="categories-title">Distribuição de Alocação</span>
          <div className="categories-list">
            {data.categories.map((cat, idx) => (
              <div key={idx} className="category-item">
                <div className="category-name-row">
                  <span className="category-dot" style={{ opacity: cat.locked ? 0.6 : 1 }} />
                  <span className="category-name">{cat.name}</span>
                </div>
                <div className="category-percent-row">
                  <span className="category-percent">{cat.percent}%</span>
                  <span className={`category-status ${cat.locked ? 'locked' : 'unlocked'}`}>
                    {cat.locked ? 'Vesting' : 'Livre'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
