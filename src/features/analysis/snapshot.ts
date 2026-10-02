import { z } from 'zod';
import type { Candle, Interval } from '../../lib/types';
import type { Comparison } from '../market/comparison';
import { calculateIndicators } from '../indicators/calculations';
import type { IndicatorSettings } from '../settings/preferences';
import { symbolSchema } from '../settings/preferences';
import type { DerivativesSnapshot } from '../derivatives/types';
import type { TokenomicsSnapshot } from '../tokenomics/types';
export type { DerivativesSnapshot, TokenomicsSnapshot };

const text = z.string().min(1).max(3000);
export const analysisSchema = z.object({
  summary: text,
  trend: z.enum(['alta', 'baixa', 'lateral', 'indefinida']),
  evidence: z.array(text).min(1).max(10),
  scenarios: z.array(z.object({ condition: text, interpretation: text })).min(1).max(5),
  risks: z.array(text).min(1).max(10),
  limitations: z.array(text).min(1).max(10),
});
export type Analysis = z.infer<typeof analysisSchema>;

export interface OrderBookSnapshot {
  spread: number;
  spreadPercent: number;
  bidPressurePercent: number;
  askPressurePercent: number;
  topBidWall: { price: number; amount: number; ratioToAverage: number } | null;
  topAskWall: { price: number; amount: number; ratioToAverage: number } | null;
  botBias: 'bullish' | 'bearish' | 'neutral';
  spoofDetected: boolean;
  hftActive: boolean;
  botPressure?: {
    direction: 'pushing_up' | 'pushing_down' | 'neutral';
    score: number;
    headline: string;
    tactic: string;
  };
}

export function buildSnapshot(
  symbol: string,
  interval: Interval,
  candles: Candle[],
  settings: IndicatorSettings,
  comparison: Comparison | null,
  now: number,
  orderBook: OrderBookSnapshot | null = null,
  userNotes?: string | null,
  derivatives: DerivativesSnapshot | null = null,
  tokenomics: TokenomicsSnapshot | null = null,
) {
  symbolSchema.parse(symbol);
  const closed = candles.filter(c => c.closed);
  if (closed.length === 0) throw new Error('Aguarde o histórico de candles fechados antes de analisar.');
  const values = calculateIndicators(closed, settings);
  const last = (series: (number | null)[]) => series.at(-1) ?? null;
  const sanitizedNotes = userNotes && userNotes.trim().length > 0 ? userNotes.trim().slice(0, 1000) : null;
  return structuredClone({
    symbol, interval, exchange: 'binance' as const, capturedAt: now,
    candles: closed.slice(-100),
    historyLength: closed.length,
    parameters: { sma: settings.smaPeriod, emaFast: settings.emaFastPeriod, emaSlow: settings.emaSlowPeriod, rsi: 14, macd: [12, 26, 9], bands: [20, 2] },
    indicators: {
      sma: last(values.sma), emaFast: last(values.emaFast), emaSlow: last(values.emaSlow), rsi: last(values.rsi),
      macd: last(values.macd.line), macdSignal: last(values.macd.signal), macdHistogram: last(values.macd.histogram),
      bandUpper: last(values.bands.upper), bandMiddle: last(values.bands.middle), bandLower: last(values.bands.lower),
    },
    comparison,
    orderBook,
    userNotes: sanitizedNotes,
    derivatives,
    tokenomics,
  });
}
export type Snapshot = ReturnType<typeof buildSnapshot>;
export interface AnalysisRecord { id: string; agent: 'qoder' | 'antigravity' | 'openai'; model: string | null; snapshot: Snapshot; analysis: Analysis; completedAt: number }
