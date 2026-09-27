import type { Interval } from '../../lib/types';
import type { ChartViewType } from '../chart/MarketChart';

export type ChartLayout = '1x1' | '1x2' | '2x1' | '2x2' | '1+2' | '3x3' | '4x4';

export interface ChartPaneConfig {
  id: string;
  symbol: string;
  interval: Interval;
  chartType: ChartViewType;
}

export const LAYOUT_CAPACITIES: Record<ChartLayout, number> = {
  '1x1': 1,
  '1x2': 2,
  '2x1': 2,
  '2x2': 4,
  '1+2': 3,
  '3x3': 9,
  '4x4': 16,
};

export const DEFAULT_PANE_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'ENAUSDC',
  'IOTAUSDC',
  'BNBUSDT',
  'XRPUSDT',
  'DOGEUSDT',
  'ADAUSDT',
  'AVAXUSDT',
  'LINKUSDT',
  'SUIUSDT',
  'NEARUSDT',
  'APTUSDT',
  'PETR4',
  'VALE3',
];
