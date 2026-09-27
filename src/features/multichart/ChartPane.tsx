import React, { memo, useState, useEffect } from 'react';
import { Maximize2, Minimize2, Activity, Clock } from 'lucide-react';
import type { Candle, Interval } from '../../lib/types';
import type { IChartApi } from 'lightweight-charts';
import { intervals } from '../../lib/types';
import type { IndicatorSettings } from '../settings/preferences';
import { MarketChart, type ChartViewType } from '../chart/MarketChart';
import { useMarket } from '../market/useMarket';
import { useIndicators } from '../indicators/useIndicators';
import { useCandleCountdown } from '../chart/useCandleCountdown';
import { isB3Symbol, pairLabel } from '../../lib/symbol';
import { desktop } from '../../lib/desktop';
import type { IndicatorResult } from '../indicators/calculations';
import type { ChartPaneConfig } from './types';

interface ChartPaneProps {
  pane: ChartPaneConfig;
  isActive: boolean;
  isMaximized: boolean;
  onSelect: () => void;
  onUpdatePane: (updates: Partial<ChartPaneConfig>) => void;
  onToggleMaximize: () => void;
  settings: IndicatorSettings;
  dark: boolean;
  availableSymbols: string[];
  isPrimary: boolean;
  primarySymbol?: string;
  primaryInterval?: Interval;
  primaryCandles: Candle[];
  primaryIndicators?: IndicatorResult | null;
  onChartReady?: (paneId: string, api: IChartApi | null) => void;
}

export const ChartPane = memo(function ChartPane({
  pane,
  isActive,
  isMaximized,
  onSelect,
  onUpdatePane,
  onToggleMaximize,
  settings,
  dark,
  availableSymbols,
  isPrimary,
  primarySymbol,
  primaryInterval,
  primaryCandles,
  primaryIndicators = null,
  onChartReady,
}: ChartPaneProps) {
  const [isEditingSymbol, setIsEditingSymbol] = useState(false);
  const [symbolInput, setSymbolInput] = useState(pane.symbol);

  const isB3 = isB3Symbol(pane.symbol);
  const [stockCandles, setStockCandles] = useState<Candle[]>([]);

  useEffect(() => {
    if (!isB3) return;
    let active = true;
    desktop.fetchBrStockCandles(pane.symbol)
      .then(c => {
        if (active && c.length > 0) setStockCandles(c);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [isB3, pane.symbol]);

  // Cada painel possui seu stream de mercado dedicado e ininterrupto
  const market = useMarket(pane.symbol, pane.interval, [], !isB3);

  // Se for o painel primário inicial com mesmo par/tempo, reutiliza dados para hidratação instantânea
  const isMatchingPrimary = isPrimary && pane.symbol === primarySymbol && pane.interval === primaryInterval;
  const baseCandles = market.candles.length > 0
    ? market.candles
    : (isMatchingPrimary && primaryCandles.length > 0 ? primaryCandles : []);

  const activeCandles = isB3 ? (market.candles.length ? market.candles : stockCandles) : baseCandles;
  const calculatedIndicators = useIndicators(activeCandles, settings);
  const activeIndicators = isMatchingPrimary && primaryIndicators
    ? primaryIndicators
    : calculatedIndicators.result;

  const countdown = useCandleCountdown(pane.interval, activeCandles.at(-1)?.time);


  const commitSymbol = () => {
    const clean = symbolInput.trim().toUpperCase();
    if (clean) {
      onUpdatePane({ symbol: clean });
    }
    setIsEditingSymbol(false);
  };

  const handleSymbolSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    commitSymbol();
  };

  const chartTypeLabels: Record<ChartViewType, { label: string; icon: string }> = {
    candles: { label: 'Candles', icon: '🕯️' },
    heikin_ashi: { label: 'Heikin-Ashi', icon: '📊' },
    line: { label: 'Linha', icon: '📈' },
    area: { label: 'Área', icon: '🌊' },
    bars: { label: 'Barras', icon: '|||' },
  };

  return (
    <div
      className={`chart-pane-cell ${isActive ? 'pane-active' : ''} ${isMaximized ? 'pane-maximized' : ''}`}
      onPointerDownCapture={onSelect}
      onClick={onSelect}
      role="region"
      aria-label={`Painel do gráfico ${pairLabel(pane.symbol)} ${pane.interval}`}
    >
      {/* Barra de Ferramentas Superior do Painel */}
      <div className="chart-pane-header">
        <div className="pane-header-left">
          {isActive ? (
            <span className="pane-active-badge" title="Painel ativo (conectado ao Order Book e IA)">
              ● Ativo
            </span>
          ) : (
            <button
              type="button"
              className="pane-activate-btn"
              onClick={onSelect}
              title="Clique para ativar este painel"
            >
              Focar
            </button>
          )}

          {isEditingSymbol ? (
            <form onSubmit={handleSymbolSubmit} className="pane-symbol-form">
              <input
                type="text"
                className="pane-symbol-input"
                value={symbolInput}
                autoFocus
                onChange={e => setSymbolInput(e.target.value)}
                onBlur={commitSymbol}
                placeholder="Ex: BTCUSDT"
              />
            </form>
          ) : (
            <div className="pane-symbol-selector">
              <button
                type="button"
                className="pane-symbol-badge"
                onClick={() => {
                  setSymbolInput(pane.symbol);
                  setIsEditingSymbol(true);
                }}
                title="Clique para digitar qualquer símbolo ou selecione na lista"
              >
                <strong>{pairLabel(pane.symbol)}</strong>
                {isB3 && <span className="b3-tag">B3</span>}
              </button>

              <select
                className="pane-quick-symbol-dropdown"
                value={pane.symbol}
                onClick={e => e.stopPropagation()}
                onChange={e => {
                  e.stopPropagation();
                  onUpdatePane({ symbol: e.target.value });
                }}
                title="Trocar ativo rápido"
              >
                {availableSymbols.map(sym => (
                  <option key={sym} value={sym}>
                    {pairLabel(sym)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="pane-header-right">
          {/* Contador regressivo para fechamento do candle */}
          <div className="pane-countdown-pill" title={`Tempo restante para o fechamento do candle atual (${pane.interval})`}>
            <Clock size={11} aria-hidden="true" />
            <span>{countdown}</span>
          </div>

          {/* Seletor de Intervalo */}
          <div className="pane-intervals" role="group" aria-label="Intervalo do gráfico">
            {intervals.map(int => (
              <button
                key={int}
                type="button"
                className={`pane-interval-btn ${pane.interval === int ? 'active' : ''}`}
                onClick={e => {
                  e.stopPropagation();
                  onUpdatePane({ interval: int });
                }}
              >
                {int}
              </button>
            ))}
          </div>

          {/* Seletor de Tipo de Gráfico */}
          <select
            className="pane-chart-type-select"
            value={pane.chartType}
            onChange={e => onUpdatePane({ chartType: e.target.value as ChartViewType })}
            title="Tipo de Vela / Visualização"
          >
            {(Object.keys(chartTypeLabels) as ChartViewType[]).map(t => (
              <option key={t} value={t}>
                {chartTypeLabels[t].icon} {chartTypeLabels[t].label}
              </option>
            ))}
          </select>

          {/* Botão de Maximizar Painel */}
          <button
            type="button"
            className="pane-header-action-btn"
            onClick={onToggleMaximize}
            title={isMaximized ? 'Restaurar grade (Esc)' : 'Maximizar gráfico'}
            aria-label={isMaximized ? 'Restaurar grade' : 'Maximizar gráfico'}
          >
            {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* Área do Gráfico */}
      <div className="chart-pane-body">
        {activeCandles.length > 0 ? (
          <MarketChart
            key={`${pane.id}-${pane.symbol}-${pane.interval}-${pane.chartType}`}
            candles={activeCandles}
            indicators={activeIndicators}
            settings={settings}
            dark={dark}
            chartType={pane.chartType}
            symbol={pane.symbol}
            interval={pane.interval}
            showToolbar={isActive}
            onChartReady={api => onChartReady?.(pane.id, api)}
          />
        ) : (
          <div className="pane-empty-state">
            <Activity size={24} className="pane-loading-icon" />
            <span>Carregando {pairLabel(pane.symbol)} ({pane.interval})…</span>
          </div>
        )}
      </div>
    </div>
  );
});
