import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle, Interval } from '../../lib/types';
import { heikinAshi, type IndicatorResult } from '../indicators/calculations';
import type { IndicatorSettings } from '../settings/preferences';
import { seriesPatch, type TimedPoint } from './series';
import { DrawingLayer } from './DrawingLayer';
import { DrawingToolbar } from './DrawingToolbar';
import {
  clearDrawings,
  findTrendlinesConvergence,
  formatApexPrice,
  loadDrawings,
  saveDrawings,
  type Drawing,
  type DrawingTool,
  type TrendConvergence,
} from './drawings';
import { Clock } from 'lucide-react';
import { useCandleCountdown } from './useCandleCountdown';

export type ChartViewType = 'candles' | 'heikin_ashi' | 'line' | 'area' | 'bars';

type ChartPoint = TimedPoint & { time: UTCTimestamp };

interface Props {
  candles: Candle[];
  indicators: IndicatorResult | null;
  settings: IndicatorSettings;
  dark: boolean;
  chartType?: ChartViewType;
  symbol?: string;
  interval?: Interval;
  showToolbar?: boolean;
  onChartReady?: (api: IChartApi | null) => void;
}

function getPriceFormat(candles: Candle[]) {
  const last = candles[candles.length - 1];
  const ref = last ? last.close : 100;
  if (ref >= 1000) {
    return { type: 'price' as const, precision: 2, minMove: 0.01 };
  }
  if (ref >= 1) {
    return { type: 'price' as const, precision: 4, minMove: 0.0001 };
  }
  if (ref >= 0.01) {
    return { type: 'price' as const, precision: 6, minMove: 0.000001 };
  }
  return { type: 'price' as const, precision: 8, minMove: 0.00000001 };
}

export const MarketChart = memo(function MarketChart({
  candles,
  indicators,
  settings,
  dark,
  chartType = 'candles',
  symbol = '',
  interval,
  showToolbar = true,
  onChartReady,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const [chartReadyApi, setChartReadyApi] = useState<IChartApi | null>(null);
  const onChartReadyRef = useRef(onChartReady);
  onChartReadyRef.current = onChartReady;

  const series = useRef(new Map<string, ISeriesApi<SeriesType>>());
  const [mainSeriesApi, setMainSeriesApi] = useState<ISeriesApi<SeriesType> | null>(null);
  const previous = useRef(new Map<string, ChartPoint[]>());
  const initialized = useRef(false);
  const [error, setError] = useState('');

  // Contador de tempo para fechamento do candle
  const last = candles.at(-1);
  const countdown = useCandleCountdown(interval || '15m', last?.time);

  // Estado de ferramentas de desenho
  const [drawings, setDrawings] = useState<Drawing[]>(() => (symbol ? loadDrawings(symbol) : []));
  const [activeTool, setActiveTool] = useState<DrawingTool>('cursor');
  const [currentColor, setCurrentColor] = useState<string>('#38bdf8');
  const [projectLines, setProjectLines] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('criptovisualizer:project_lines');
      return saved !== 'false';
    } catch {
      return true;
    }
  });

  const handleToggleProjectLines = () => {
    setProjectLines(prev => {
      const next = !prev;
      try {
        localStorage.setItem('criptovisualizer:project_lines', String(next));
      } catch {
        // ignore persistence failures
      }
      return next;
    });
  };

  const convergences = useMemo(() => {
    if (!projectLines) return [];
    return findTrendlinesConvergence(drawings);
  }, [projectLines, drawings]);

  const handleFocusApex = (c: TrendConvergence) => {
    if (!chart.current || !candles.length) return;
    const lastIndex = candles.length - 1;
    const lastCandle = candles[lastIndex];
    const prevCandle = candles[lastIndex - 1] || lastCandle;
    const intervalSec = Math.max(1, lastCandle.time - prevCandle.time);
    const logicalOffset = (c.apexTime - lastCandle.time) / intervalSec;
    const apexLogical = lastIndex + logicalOffset;

    chart.current.timeScale().setVisibleLogicalRange({
      from: Math.max(0, apexLogical - 75),
      to: apexLogical + 25,
    });
  };

  useEffect(() => {
    if (symbol) setDrawings(loadDrawings(symbol));
  }, [symbol]);

  const handleAddDrawing = (drawing: Drawing) => {
    setDrawings(prev => {
      const updated = [...prev, drawing];
      if (symbol) saveDrawings(symbol, updated);
      return updated;
    });
  };

  const handleClearDrawings = () => {
    setDrawings([]);
    if (symbol) clearDrawings(symbol);
  };

  // Tecla ESC restaura o cursor padrão
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveTool('cursor');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!container.current) return;
    const priceFormat = getPriceFormat(candles);
    const api = createChart(container.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: dark ? '#141b25' : '#ffffff' },
        textColor: dark ? '#a4b1c2' : '#5c697b',
        fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
        fontSize: 11,
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: dark ? '#202b3a' : '#f0f3f7' },
        horzLines: { color: dark ? '#202b3a' : '#f0f3f7' },
      },
      rightPriceScale: {
        borderColor: dark ? '#2c394b' : '#dce2e9',
        autoScale: true,
        entireTextOnly: false,
        ticksVisible: true,
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
        borderColor: dark ? '#2c394b' : '#dce2e9',
        tickMarkFormatter: (time: import('lightweight-charts').Time) => {
          const date = new Date(Number(time) * 1000);
          const hours = date.getHours().toString().padStart(2, '0');
          const mins = date.getMinutes().toString().padStart(2, '0');
          const secs = date.getSeconds().toString().padStart(2, '0');
          if (date.getSeconds() !== 0) {
            return `${hours}:${mins}:${secs}`;
          }
          if (date.getHours() !== 0 || date.getMinutes() !== 0) {
            return `${hours}:${mins}`;
          }
          return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        },
      },
      localization: {
        locale: 'pt-BR',
        timeFormatter: (time: import('lightweight-charts').Time) => {
          const d = new Date(Number(time) * 1000);
          return d.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });
        },
        priceFormatter: (price: number) => {
          if (!Number.isFinite(price)) return '—';
          if (price >= 1000) {
            return price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          }
          if (price >= 1) {
            return price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
          }
          if (price >= 0.01) {
            return price.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
          }
          return price.toLocaleString('pt-BR', { minimumFractionDigits: 6, maximumFractionDigits: 8 });
        },
      },
    });

    chart.current = api;
    setChartReadyApi(api);
    onChartReadyRef.current?.(api);
    const currentSeries = series.current;
    const currentPrevious = previous.current;

    const add = (
      key: string,
      definition:
        | typeof CandlestickSeries
        | typeof LineSeries
        | typeof AreaSeries
        | typeof BarSeries
        | typeof HistogramSeries,
      options: object,
      pane = 0,
    ) => {
      const s = api.addSeries(definition, { lastValueVisible: false, priceLineVisible: false, priceFormat, ...options }, pane);
      series.current.set(key, s);
      return s;
    };

    // Cria a série principal dependendo do tipo selecionado
    let mainInstance: ISeriesApi<SeriesType>;
    if (chartType === 'line') {
      mainInstance = add('candles', LineSeries, {
        color: '#38bdf8',
        lineWidth: 2,
        priceFormat,
        lastValueVisible: true,
      });
    } else if (chartType === 'area') {
      mainInstance = add('candles', AreaSeries, {
        topColor: 'rgba(56, 189, 248, 0.4)',
        bottomColor: 'rgba(56, 189, 248, 0.0)',
        lineColor: '#38bdf8',
        lineWidth: 2,
        priceFormat,
        lastValueVisible: true,
      });
    } else if (chartType === 'bars') {
      mainInstance = add('candles', BarSeries, {
        priceFormat,
        upColor: '#168b70',
        downColor: '#d35464',
        lastValueVisible: true,
      });
    } else {
      // 'candles' ou 'heikin_ashi'
      mainInstance = add('candles', CandlestickSeries, {
        priceFormat,
        upColor: '#168b70',
        downColor: '#d35464',
        borderVisible: false,
        wickUpColor: '#168b70',
        wickDownColor: '#d35464',
        lastValueVisible: true,
      });
    }
    setMainSeriesApi(mainInstance);

    // Painel 1: Volume
    add('volume', HistogramSeries, { priceFormat: { type: 'volume' }, title: 'Volume' }, 1);

    const line = (key: string, color: string, pane = 0) =>
      add(key, LineSeries, { color, lineWidth: 1, title: key, priceFormat }, pane);

    // Volume SMA 20
    if (settings.volumeMa !== false) {
      line('Volume SMA', dark ? '#dfb663' : '#9b6b12', 1);
    }

    // Indicadores do Painel 0 (Preço)
    if (settings.sma) line('SMA', dark ? '#dfb663' : '#9b6b12');
    if (settings.ema) {
      line('EMA rápida', dark ? '#80b1fa' : '#235baf');
      line('EMA lenta', dark ? '#c89ee8' : '#8153a6');
    }
    if (settings.bands) {
      line('Banda superior', '#8492a6');
      line('Banda central', '#8492a6');
      line('Banda inferior', '#8492a6');
    }
    if (settings.vwap) {
      line('VWAP', '#f97316');
    }
    if (settings.supertrend) {
      line('SuperTrend', '#10b981');
    }

    // Painéis de Osciladores
    let pane = 2;
    if (settings.rsi) {
      line('RSI 14', dark ? '#c89ee8' : '#8153a6', pane++);
      const rsi = series.current.get('RSI 14')!;
      [30, 70].forEach(value =>
        rsi.createPriceLine({ price: value, color: '#8492a6', lineWidth: 1, lineStyle: 2, axisLabelVisible: true }),
      );
    }

    if (settings.macd) {
      line('MACD', dark ? '#80b1fa' : '#235baf', pane);
      line('Sinal', dark ? '#dfb663' : '#9b6b12', pane);
      add('Histograma', HistogramSeries, {}, pane++);
    }

    if (settings.stochastic) {
      line('Estocástico %K', '#38bdf8', pane);
      line('Estocástico %D', '#fbbf24', pane++);
      const stoch = series.current.get('Estocástico %K')!;
      [20, 80].forEach(value =>
        stoch.createPriceLine({ price: value, color: '#8492a6', lineWidth: 1, lineStyle: 2, axisLabelVisible: true }),
      );
    }

    api.panes().forEach((item, index) => item.setStretchFactor(index === 0 ? 5 : index === 1 ? 1 : 1.6));
    previous.current.clear();
    initialized.current = false;
    setError('');

    return () => {
      onChartReadyRef.current?.(null);
      api.remove();
      chart.current = null;
      setChartReadyApi(null);
      setMainSeriesApi(null);
      currentSeries.clear();
      currentPrevious.clear();
    };
  }, [
    dark,
    chartType,
    settings.sma,
    settings.ema,
    settings.bands,
    settings.rsi,
    settings.macd,
    settings.volumeMa,
    settings.vwap,
    settings.supertrend,
    settings.stochastic,
  ]);

  useEffect(() => {
    if (!chart.current) return;
    const frame = requestAnimationFrame(() => {
      try {
        const apply = (key: string, points: ChartPoint[]) => {
          const target = series.current.get(key);
          if (!target) return;
          const patch = seriesPatch(previous.current.get(key) ?? [], points);
          if (patch.reset) target.setData(patch.data);
          else patch.data.forEach(point => target.update(point));
          previous.current.set(key, points);
        };

        const activeSeries = chartType === 'heikin_ashi' ? heikinAshi(candles) : candles;

        if (chartType === 'line' || chartType === 'area') {
          apply(
            'candles',
            activeSeries.map(c => ({ time: c.time as UTCTimestamp, value: c.close })),
          );
        } else {
          apply(
            'candles',
            activeSeries.map(c => ({
              time: c.time as UTCTimestamp,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
            })),
          );
        }

        apply(
          'volume',
          candles.map(c => ({
            time: c.time as UTCTimestamp,
            value: c.volume,
            color: c.close >= c.open ? '#168b7070' : '#d3546470',
          })),
        );

        if (indicators) {
          const line = (key: string, values: (number | null)[], histogram = false) =>
            apply(
              key,
              candles.map((c, index) =>
                values[index] === null || values[index] === undefined
                  ? { time: c.time as UTCTimestamp }
                  : {
                      time: c.time as UTCTimestamp,
                      value: values[index],
                      ...(histogram ? { color: values[index]! >= 0 ? '#168b70' : '#d35464' } : {}),
                    },
              ),
            );

          if (settings.sma) line('SMA', indicators.sma);
          if (settings.ema) {
            line('EMA rápida', indicators.emaFast);
            line('EMA lenta', indicators.emaSlow);
          }
          if (settings.bands) {
            line('Banda superior', indicators.bands.upper);
            line('Banda central', indicators.bands.middle);
            line('Banda inferior', indicators.bands.lower);
          }
          if (settings.volumeMa !== false && indicators.volumeMa) {
            line('Volume SMA', indicators.volumeMa);
          }
          if (settings.vwap && indicators.vwap) {
            line('VWAP', indicators.vwap);
          }
          if (settings.supertrend && indicators.supertrend) {
            line('SuperTrend', indicators.supertrend.value);
          }
          if (settings.rsi) line('RSI 14', indicators.rsi);
          if (settings.macd) {
            line('MACD', indicators.macd.line);
            line('Sinal', indicators.macd.signal);
            line('Histograma', indicators.macd.histogram, true);
          }
          if (settings.stochastic && indicators.stochastic) {
            line('Estocástico %K', indicators.stochastic.k);
            line('Estocástico %D', indicators.stochastic.d);
          }
        } else {
          for (const key of series.current.keys()) {
            if (key !== 'candles' && key !== 'volume') apply(key, []);
          }
        }

        if (!initialized.current && candles.length) {
          chart.current?.timeScale().setVisibleLogicalRange({
            from: Math.max(0, candles.length - 110),
            to: candles.length + 3,
          });
          initialized.current = true;
        }
      } catch {
        setError('Não foi possível atualizar o gráfico. Reconecte o mercado.');
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [
    candles,
    indicators,
    dark,
    chartType,
    settings.sma,
    settings.ema,
    settings.bands,
    settings.rsi,
    settings.macd,
    settings.volumeMa,
    settings.vwap,
    settings.supertrend,
    settings.stochastic,
  ]);

  return (
    <div className="market-chart-wrapper" style={{ position: 'relative', width: '100%', height: '100%' }}>
      {showToolbar && (
        <DrawingToolbar
          activeTool={activeTool}
          onSelectTool={setActiveTool}
          currentColor={currentColor}
          onChangeColor={setCurrentColor}
          onClearDrawings={handleClearDrawings}
          drawingsCount={drawings.length}
          projectLines={projectLines}
          onToggleProjectLines={handleToggleProjectLines}
          convergencesCount={convergences.length}
        />
      )}

      {projectLines && convergences.length > 0 && (
        <div className="trend-convergence-banner" role="status" aria-live="polite">
          <div className="trend-convergence-pill">
            <span className="trend-convergence-badge">
              🎯 {convergences[0].patternName}
            </span>
            <span className="trend-convergence-time">
              Vértice: <strong>{convergences[0].timeFormatted}</strong> ({convergences[0].remainingFormatted})
            </span>
            <span className="trend-convergence-price">
              Alvo: <strong>${formatApexPrice(convergences[0].apexPrice)}</strong>
            </span>
            <button
              type="button"
              className="trend-convergence-focus-btn"
              onClick={() => handleFocusApex(convergences[0])}
              title="Centralizar gráfico no ponto de convergência futura"
            >
              Ver Ápice
            </button>
          </div>
        </div>
      )}

      <div className="chart-canvas" ref={container} style={{ width: '100%', height: '100%' }} />

      {interval && (
        <div className="candle-countdown-overlay" title={`Tempo restante para a vela de ${interval} fechar`}>
          <Clock size={11} aria-hidden="true" />
          <span>{countdown}</span>
        </div>
      )}

      <DrawingLayer
        chart={chartReadyApi}
        mainSeries={mainSeriesApi}
        activeTool={activeTool}
        currentColor={currentColor}
        drawings={drawings}
        onAddDrawing={handleAddDrawing}
        onSelectCursor={() => setActiveTool('cursor')}
        dark={dark}
        candles={candles}
        projectLines={projectLines}
        convergences={convergences}
      />

      <span className="sr-only">
        {last
          ? `Último candle: abertura ${last.open}, máxima ${last.high}, mínima ${last.low}, fechamento ${last.close}, volume ${last.volume}. ${last.closed ? 'Fechado' : 'Em formação'}.`
          : 'Aguardando candles.'}
      </span>
      {error && (
        <p className="chart-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
