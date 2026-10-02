import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Unlock, X } from 'lucide-react';
import { formatPercent } from './api';
import { TokenomicsWidget } from './TokenomicsWidget';
import { useTokenomics } from './useTokenomics';

interface Props {
  symbol: string;
}

export const TokenomicsBadge: React.FC<Props> = ({ symbol }) => {
  const { data, loading, refresh } = useTokenomics(symbol);
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

  if (loading && !data) {
    return (
      <div className="tokenomics-badge-wrapper">
        <button
          type="button"
          className="tokenomics-badge-btn"
          disabled
          style={{ opacity: 0.75, cursor: 'wait' }}
          title="Carregando métricas de tokenomics e desbloqueios..."
        >
          <Unlock size={11} className="badge-unlock-icon animate-pulse" />
          <span className="badge-text">Tokenomics…</span>
        </button>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const dotClass =
    data.dilutionRisk === 'high'
      ? 'dot-danger'
      : data.dilutionRisk === 'moderate'
      ? 'dot-flush'
      : 'dot-normal';

  return (
    <div className="tokenomics-badge-wrapper" ref={containerRef}>
      <button
        type="button"
        className={`tokenomics-badge-btn ${open ? 'active' : ''}`}
        onClick={() => setOpen(v => !v)}
        title="Clique para ver a taxa de desbloqueio, suprimento circulante e cronograma de vesting"
        aria-expanded={open}
      >
        <Unlock size={11} className="badge-unlock-icon" />
        <span className={`status-dot ${dotClass}`} />
        <span className="badge-text">
          <strong>{formatPercent(data.circulatingPercent)} Circ.</strong>
          {data.nextUnlockDays !== null && (
            <>
              <span className="badge-sep">·</span>
              <span>Unlock em {data.nextUnlockDays}d</span>
              {data.nextUnlockValueUsd && (
                <>
                  <span className="badge-sep">·</span>
                  <span>(${data.nextUnlockValueUsd >= 1e6 ? `${(data.nextUnlockValueUsd / 1e6).toFixed(1)}M` : `${(data.nextUnlockValueUsd / 1e3).toFixed(0)}K`})</span>
                </>
              )}
            </>
          )}
        </span>
        <ChevronDown size={11} className={`badge-chevron ${open ? 'rotated' : ''}`} />
      </button>

      {open && (
        <div className="tokenomics-popover">
          <div className="popover-close-row">
            <span className="popover-title">Tokenomics & Desbloqueios ({data.baseAsset})</span>
            <button
              type="button"
              className="icon-button popover-close-btn"
              onClick={() => setOpen(false)}
            >
              <X size={13} />
            </button>
          </div>
          <TokenomicsWidget data={data} loading={loading} onRefresh={refresh} compact />
        </div>
      )}
    </div>
  );
};
