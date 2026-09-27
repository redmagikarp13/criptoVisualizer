import React, { useState, useRef, useEffect } from 'react';
import { Zap, ChevronDown, X } from 'lucide-react';
import { useDerivatives } from './useDerivatives';
import { DerivativesWidget } from './DerivativesWidget';
import { formatCompactUsd } from './api';

interface Props {
  symbol: string;
}

export const DerivativesBadge: React.FC<Props> = ({ symbol }) => {
  const { data, loading, refresh } = useDerivatives(symbol);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [open]);

  if (!data || !data.hasFutures) {
    return null;
  }

  const isFundingHigh = data.fundingRate >= 0.0003;
  const isFundingNegative = data.fundingRate < 0;

  const dotClass =
    data.squeezeRisk === 'liquidation_flush'
      ? 'dot-flush'
      : isFundingHigh
      ? 'dot-danger'
      : isFundingNegative
      ? 'dot-purple'
      : 'dot-normal';

  return (
    <div className="derivatives-badge-wrapper" ref={containerRef}>
      <button
        type="button"
        className={`derivatives-badge-btn ${open ? 'active' : ''}`}
        onClick={() => setOpen(v => !v)}
        title="Clique para ver o nível de alavancagem, contratos em aberto e risco de liquidações"
        aria-expanded={open}
      >
        <Zap size={11} className="badge-zap" />
        <span className={`status-dot ${dotClass}`} />
        <span className="badge-text">
          <strong>{data.fundingRatePercent}</strong>
          <span className="badge-sep">·</span>
          <span>L/S {data.longShortRatio}</span>
          <span className="badge-sep">·</span>
          <span>OI {formatCompactUsd(data.openInterestValueUsd)}</span>
        </span>
        <ChevronDown size={11} className={`badge-chevron ${open ? 'rotated' : ''}`} />
      </button>

      {open && (
        <div className="derivatives-popover">
          <div className="popover-close-row">
            <span className="popover-title">Dados de Alavancagem ({symbol})</span>
            <button
              type="button"
              className="icon-button popover-close-btn"
              onClick={() => setOpen(false)}
            >
              <X size={13} />
            </button>
          </div>
          <DerivativesWidget data={data} loading={loading} onRefresh={refresh} compact />
        </div>
      )}
    </div>
  );
};
