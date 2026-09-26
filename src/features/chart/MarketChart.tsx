import { memo, useEffect, useRef, useState } from 'react';
import { CandlestickSeries, ColorType, createChart, HistogramSeries, LineSeries, type IChartApi, type ISeriesApi, type SeriesType, type UTCTimestamp } from 'lightweight-charts';
import type { Candle } from '../../lib/types';
import type { IndicatorResult } from '../indicators/calculations';
import type { IndicatorSettings } from '../settings/preferences';
import { seriesPatch, type TimedPoint } from './series';

type ChartPoint = TimedPoint & { time: UTCTimestamp };
interface Props { candles: Candle[]; indicators: IndicatorResult | null; settings: IndicatorSettings; dark: boolean }

export const MarketChart = memo(function MarketChart({ candles, indicators, settings, dark }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef(new Map<string, ISeriesApi<SeriesType>>());
  const previous = useRef(new Map<string, ChartPoint[]>());
  const initialized = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!container.current) return;
    const api = createChart(container.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: dark ? '#141b25' : '#ffffff' }, textColor: dark ? '#a4b1c2' : '#5c697b', fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', fontSize: 11, attributionLogo: true },
      grid: { vertLines: { color: dark ? '#202b3a' : '#f0f3f7' }, horzLines: { color: dark ? '#202b3a' : '#f0f3f7' } },
      rightPriceScale: { borderColor: dark ? '#2c394b' : '#dce2e9' },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: dark ? '#2c394b' : '#dce2e9' },
      localization: { locale: 'pt-BR', timeFormatter: (time: import('lightweight-charts').Time) => new Date(Number(time) * 1000).toLocaleString('pt-BR') },
    });
    chart.current = api;
    const currentSeries = series.current;
    const currentPrevious = previous.current;
    const add = (key: string, definition: typeof LineSeries | typeof CandlestickSeries | typeof HistogramSeries, options: object, pane = 0) => {
      series.current.set(key, api.addSeries(definition, { lastValueVisible: false, priceLineVisible: false, ...options }, pane));
    };
    add('candles', CandlestickSeries, { upColor: '#168b70', downColor: '#d35464', borderVisible: false, wickUpColor: '#168b70', wickDownColor: '#d35464', lastValueVisible: true });
    add('volume', HistogramSeries, { priceFormat: { type: 'volume' }, title: 'Volume' }, 1);
    const line = (key: string, color: string, pane = 0) => add(key, LineSeries, { color, lineWidth: 1, title: key }, pane);
    if (settings.sma) line('SMA', dark ? '#dfb663' : '#9b6b12');
    if (settings.ema) { line('EMA rápida', dark ? '#80b1fa' : '#235baf'); line('EMA lenta', dark ? '#c89ee8' : '#8153a6'); }
    if (settings.bands) { line('Banda superior', '#8492a6'); line('Banda central', '#8492a6'); line('Banda inferior', '#8492a6'); }
    let pane = 2;
    if (settings.rsi) {
      line('RSI 14', dark ? '#c89ee8' : '#8153a6', pane++);
      const rsi = series.current.get('RSI 14')!;
      [30, 70].forEach(value => rsi.createPriceLine({ price: value, color: '#8492a6', lineWidth: 1, lineStyle: 2, axisLabelVisible: true }));
    }
    if (settings.macd) { line('MACD', dark ? '#80b1fa' : '#235baf', pane); line('Sinal', dark ? '#dfb663' : '#9b6b12', pane); add('Histograma', HistogramSeries, {}, pane); }
    api.panes().forEach((item, index) => item.setStretchFactor(index === 0 ? 5 : index === 1 ? 1 : 1.7));
    previous.current.clear(); initialized.current = false; setError('');
    return () => { api.remove(); chart.current = null; currentSeries.clear(); currentPrevious.clear(); };
  }, [dark, settings.sma, settings.ema, settings.bands, settings.rsi, settings.macd]);
  useEffect(() => {
    if (!chart.current) return;
    const frame = requestAnimationFrame(() => {
      try {
        const apply = (key: string, points: ChartPoint[]) => {
          const target = series.current.get(key); if (!target) return;
          const patch = seriesPatch(previous.current.get(key) ?? [], points);
          if (patch.reset) target.setData(patch.data); else patch.data.forEach(point => target.update(point));
          previous.current.set(key, points);
        };
        apply('candles', candles.map(c => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })));
        apply('volume', candles.map(c => ({ time: c.time as UTCTimestamp, value: c.volume, color: c.close >= c.open ? '#168b7070' : '#d3546470' })));
        if (indicators) {
          const line = (key: string, values: (number | null)[], histogram = false) => apply(key, candles.map((c, index) => values[index] === null || values[index] === undefined ? { time: c.time as UTCTimestamp } : { time: c.time as UTCTimestamp, value: values[index], ...(histogram ? { color: values[index]! >= 0 ? '#168b70' : '#d35464' } : {}) }));
          line('SMA', indicators.sma); line('EMA rápida', indicators.emaFast); line('EMA lenta', indicators.emaSlow);
          line('Banda superior', indicators.bands.upper); line('Banda central', indicators.bands.middle); line('Banda inferior', indicators.bands.lower);
          line('RSI 14', indicators.rsi); line('MACD', indicators.macd.line); line('Sinal', indicators.macd.signal); line('Histograma', indicators.macd.histogram, true);
        } else {
          for (const key of series.current.keys()) {
            if (key !== 'candles' && key !== 'volume') apply(key, []);
          }
        }
        if (!initialized.current && candles.length) {
          chart.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - 110), to: candles.length + 3 }); initialized.current = true;
        }
      } catch { setError('Não foi possível atualizar o gráfico. Reconecte o mercado.'); }
    });
    return () => cancelAnimationFrame(frame);
  }, [candles, indicators, dark, settings.sma, settings.ema, settings.bands, settings.rsi, settings.macd]);
  const last = candles.at(-1);
  return <><div className="chart-canvas" ref={container} /><span className="sr-only">{last ? `Último candle: abertura ${last.open}, máxima ${last.high}, mínima ${last.low}, fechamento ${last.close}, volume ${last.volume}. ${last.closed ? 'Fechado' : 'Em formação'}.` : 'Aguardando candles.'}</span>{error && <p className="chart-error" role="alert">{error}</p>}</>;
});
