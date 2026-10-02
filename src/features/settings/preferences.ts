import { z } from 'zod';
import { intervals } from '../../lib/types';
import { isValidSymbol } from '../../lib/symbol';

export const symbolSchema = z.string().refine(isValidSymbol, { message: 'Par inválido' });
const period = z.number().int().min(2).max(200);
export const alertSchema = z.object({
  id: z.string().min(1).max(64),
  symbol: symbolSchema,
  direction: z.enum(['above', 'below', 'cross']),
  price: z.number().finite().positive(),
  enabled: z.boolean(),
  mode: z.enum(['once', 'recurring']).default('recurring'),
});
export const indicatorSettingsSchema = z.object({
  sma: z.boolean(), ema: z.boolean(), rsi: z.boolean(), macd: z.boolean(), bands: z.boolean(),
  smaPeriod: period, emaFastPeriod: period, emaSlowPeriod: period,
  volumeMa: z.boolean().default(true),
  vwap: z.boolean().default(false),
  supertrend: z.boolean().default(false),
  stochastic: z.boolean().default(false),
});
export const preferencesSchema = z.object({
  version: z.literal(1),
  favorites: z.array(symbolSchema).max(20).refine(items => new Set(items).size === items.length),
  symbol: symbolSchema,
  interval: z.enum(intervals),
  theme: z.enum(['system', 'light', 'dark']),
  indicators: indicatorSettingsSchema,
  agent: z.enum(['qoder', 'antigravity', 'openai']),
  antigravityEnabled: z.boolean(),
  qoderPath: z.string().max(1024),
  antigravityPath: z.string().max(1024),
  qoderModel: z.string().max(100).regex(/^[\w.:/-]*$/),
  antigravityModel: z.string().max(100).regex(/^[\w.:/-]*$/),
  openaiApiKey: z.string().max(256).default(''),
  openaiModel: z.string().max(100).default('gpt-4o-mini'),
  openaiBaseUrl: z.string().max(256).default(''),
  alerts: z.array(alertSchema).max(50).default([]),
  brStocks: z.array(z.string().min(4).max(8).regex(/^[A-Z0-9]+$/)).max(30).default([]),
  brapiToken: z.string().max(100).default(''),
});
export type Preferences = z.infer<typeof preferencesSchema>;
export type IndicatorSettings = z.infer<typeof indicatorSettingsSchema>;
export type AlertRule = z.infer<typeof alertSchema>;
export const defaultPreferences: Preferences = {
  version: 1,
  favorites: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
  symbol: 'BTCUSDT', interval: '1h', theme: 'system',
  indicators: {
    sma: true, ema: true, rsi: true, macd: false, bands: false,
    smaPeriod: 20, emaFastPeriod: 20, emaSlowPeriod: 50,
    volumeMa: true, vwap: false, supertrend: false, stochastic: false,
  },
  agent: 'qoder', antigravityEnabled: false,
  qoderPath: '', antigravityPath: '', qoderModel: '', antigravityModel: '',
  openaiApiKey: '', openaiModel: 'gpt-4o-mini', openaiBaseUrl: '',
  alerts: [],
  brStocks: ['PETR4', 'VALE3', 'BBDC4', 'ITUB4', 'ABEV3'],
  brapiToken: '',
};
export function parsePreferences(input: unknown): Preferences {
  try {
    const parsed = preferencesSchema.safeParse(typeof input === 'string' ? JSON.parse(input) : input);
    return parsed.success ? parsed.data : structuredClone(defaultPreferences);
  } catch { return structuredClone(defaultPreferences); }
}
