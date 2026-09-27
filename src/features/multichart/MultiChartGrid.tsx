import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { LayoutGrid } from 'lucide-react';
import type { Candle, Interval } from '../../lib/types';
import type { IndicatorSettings } from '../settings/preferences';
import type { IndicatorResult } from '../indicators/calculations';
import { ChartPane } from './ChartPane';
import {
  type ChartLayout,
  type ChartPaneConfig,
  LAYOUT_CAPACITIES,
  DEFAULT_PANE_SYMBOLS,
} from './types';

interface MultiChartGridProps {
  primarySymbol: string;
  primaryInterval: Interval;
  primaryCandles: Candle[];
  primaryIndicators?: IndicatorResult | null;
  settings: IndicatorSettings;
  dark: boolean;
  availableSymbols: string[];
  onActiveSymbolChange: (symbol: string, interval: Interval) => void;
}

const LAYOUT_ICONS: { layout: ChartLayout; label: string; desc: string }[] = [
  { layout: '1x1', label: '1x1', desc: '1 Gráfico Individual' },
  { layout: '1x2', label: '1x2', desc: '2 Gráficos Lado a Lado' },
  { layout: '2x1', label: '2x1', desc: '2 Gráficos Verticais' },
  { layout: '2x2', label: '2x2', desc: '4 Gráficos em Grade' },
  { layout: '1+2', label: '1+2', desc: '1 Principal + 2 Menores' },
  { layout: '3x3', label: '3x3', desc: '9 Gráficos (3x3)' },
  { layout: '4x4', label: '4x4', desc: '16 Gráficos (4x4 para telas grandes)' },
];

export const MultiChartGrid: React.FC<MultiChartGridProps> = ({
  primarySymbol,
  primaryInterval,
  primaryCandles,
  primaryIndicators = null,
  settings,
  dark,
  availableSymbols,
  onActiveSymbolChange,
}) => {
  const [layout, setLayout] = useState<ChartLayout>(() => {
    try {
      const saved = localStorage.getItem('criptovisualizer:chart-layout');
      if (saved && saved in LAYOUT_CAPACITIES) return saved as ChartLayout;
    } catch {
      // ignore
    }
    return '1x1';
  });

  const [panes, setPanes] = useState<ChartPaneConfig[]>(() => {
    try {
      const saved = localStorage.getItem('criptovisualizer:chart-panes');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }

    // Inicialização padrão de até 16 painéis
    return Array.from({ length: 16 }, (_, i) => ({
      id: `pane-${i}`,
      symbol: i === 0 ? primarySymbol : DEFAULT_PANE_SYMBOLS[i] || 'BTCUSDT',
      interval: i === 0 ? primaryInterval : '15m',
      chartType: 'candles',
    }));
  });

  const [activePaneId, setActivePaneId] = useState<string>('pane-0');
  const [maximizedPaneId, setMaximizedPaneId] = useState<string | null>(null);

  // Sincroniza o primeiro painel com o símbolo primário se modificado externamente
  useEffect(() => {
    setPanes(prev => {
      if (prev[0] && (prev[0].symbol !== primarySymbol || prev[0].interval !== primaryInterval)) {
        const updated = [...prev];
        updated[0] = { ...updated[0], symbol: primarySymbol, interval: primaryInterval };
        return updated;
      }
      return prev;
    });
  }, [primarySymbol, primaryInterval]);

  const handleSelectLayout = (newLayout: ChartLayout) => {
    setLayout(newLayout);
    setMaximizedPaneId(null);
    try {
      localStorage.setItem('criptovisualizer:chart-layout', newLayout);
    } catch {
      // ignore
    }
  };

  const handleUpdatePane = useCallback((paneId: string, updates: Partial<ChartPaneConfig>) => {
    setPanes(prev => {
      const next = prev.map(p => (p.id === paneId ? { ...p, ...updates } : p));
      try {
        localStorage.setItem('criptovisualizer:chart-panes', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });

    // Se o painel atualizado for o ativo, notifica o container superior
    if (paneId === activePaneId) {
      if (updates.symbol || updates.interval) {
        const target = panes.find(p => p.id === paneId);
        if (target) {
          onActiveSymbolChange(updates.symbol || target.symbol, updates.interval || target.interval);
        }
      }
    }
  }, [activePaneId, panes, onActiveSymbolChange]);

  const handleSelectPane = useCallback((pane: ChartPaneConfig) => {
    setActivePaneId(pane.id);
    onActiveSymbolChange(pane.symbol, pane.interval);
  }, [onActiveSymbolChange]);

  const capacity = LAYOUT_CAPACITIES[layout];
  const visiblePanes = useMemo(() => {
    if (maximizedPaneId) {
      const found = panes.find(p => p.id === maximizedPaneId);
      return found ? [found] : [panes[0]];
    }
    return panes.slice(0, capacity);
  }, [panes, capacity, maximizedPaneId]);

  return (
    <div className="multichart-container">
      {/* Barra de Seleção de Layout da Grade */}
      <div className="multichart-toolbar" role="toolbar" aria-label="Layouts Multi-Chart">
        <span className="multichart-toolbar-label">
          <LayoutGrid size={14} /> Grid:
        </span>
        <div className="multichart-layout-buttons">
          {LAYOUT_ICONS.map(item => (
            <button
              key={item.layout}
              type="button"
              className={`multichart-layout-btn ${layout === item.layout && !maximizedPaneId ? 'active' : ''}`}
              onClick={() => handleSelectLayout(item.layout)}
              title={item.desc}
            >
              {item.label}
            </button>
          ))}
        </div>

        {maximizedPaneId && (
          <button
            type="button"
            className="multichart-restore-btn"
            onClick={() => setMaximizedPaneId(null)}
            title="Restaurar grade anterior (Esc)"
          >
            Restaurar grade ({layout})
          </button>
        )}
      </div>

      {/* Grade de Gráficos CSS Grid */}
      <div className={`multichart-grid multichart-layout-${maximizedPaneId ? '1x1' : layout}`}>
        {visiblePanes.map((pane, index) => {
          const isPrimary = index === 0;
          return (
            <ChartPane
              key={pane.id}
              pane={pane}
              isActive={pane.id === activePaneId}
              isMaximized={pane.id === maximizedPaneId}
              onSelect={() => handleSelectPane(pane)}
              onUpdatePane={updates => handleUpdatePane(pane.id, updates)}
              onToggleMaximize={() => setMaximizedPaneId(prev => (prev === pane.id ? null : pane.id))}
              settings={settings}
              dark={dark}
              availableSymbols={availableSymbols}
              isPrimary={isPrimary}
              primaryCandles={primaryCandles}
              primaryIndicators={primaryIndicators}
            />
          );
        })}
      </div>
    </div>
  );
};
