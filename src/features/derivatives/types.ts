export type SqueezeRisk =
  | 'high_long_squeeze'
  | 'high_short_squeeze'
  | 'liquidation_flush'
  | 'leverage_buildup'
  | 'low';

export type SentimentBias =
  | 'heavy_long'
  | 'long_skew'
  | 'neutral'
  | 'short_skew'
  | 'heavy_short';

export interface DerivativesData {
  symbol: string;
  hasFutures: boolean;
  markPrice: number;
  indexPrice: number;
  fundingRate: number; // e.g. 0.00005 (0.005%)
  fundingRatePercent: string; // e.g. "+0.0050%"
  nextFundingTime: number; // timestamp in ms
  nextFundingCountdown: string; // e.g. "02h 45m"
  openInterestAmount: number; // in tokens
  openInterestValueUsd: number; // in USD
  openInterestChange1hPct: number | null; // % change in last 1 hour
  longAccountRatio: number; // percentage (0..100), e.g. 63.2
  shortAccountRatio: number; // percentage (0..100), e.g. 36.8
  longShortRatio: number; // ratio, e.g. 1.72
  topTradersLongRatio: number | null; // percentage (0..100), e.g. 57.9
  topTradersShortRatio: number | null; // percentage (0..100), e.g. 42.1
  topTradersRatio: number | null; // ratio, e.g. 1.38
  sentiment: SentimentBias;
  squeezeRisk: SqueezeRisk;
  riskHeadline: string;
  riskDescription: string;
  updatedAt: number;
}

export interface DerivativesSnapshot {
  hasFutures: boolean;
  fundingRate: number;
  fundingRatePercent: string;
  nextFundingCountdown: string;
  openInterestAmount: number;
  openInterestValueUsd: number;
  openInterestChange1hPct: number | null;
  longShortRatio: number;
  longAccountPercent: number;
  shortAccountPercent: number;
  topTradersLongShortRatio: number | null;
  squeezeRisk: SqueezeRisk;
  sentimentSummary: string;
}
