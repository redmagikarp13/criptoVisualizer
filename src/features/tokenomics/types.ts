export type DilutionRisk = 'low' | 'moderate' | 'high';

export interface TokenCategoryAllocation {
  name: string;
  percent: number;
  locked: boolean;
}

export interface TokenomicsData {
  symbol: string;
  baseAsset: string;
  name: string;
  currentPrice: number;
  circulatingSupply: number;
  totalSupply: number;
  maxSupply: number | null;
  circulatingPercent: number; // 0 a 100
  lockedPercent: number; // 0 a 100
  lockedSupply: number;
  lockedValueUsd: number;
  marketCapUsd: number;
  fdvUsd: number;
  nextUnlockDate: string | null; // ex: "2026-10-15"
  nextUnlockDays: number | null; // ex: 14
  nextUnlockAmount: number | null;
  nextUnlockValueUsd: number | null;
  nextUnlockPercent: number | null; // % do suprimento circulante
  dilutionRisk: DilutionRisk;
  unlockScheduleType: 'cliff' | 'linear' | 'completed' | 'ongoing';
  categories: TokenCategoryAllocation[];
  source: 'live' | 'curated' | 'fallback';
  lastUpdated: number;
}

export interface TokenomicsSnapshot {
  baseAsset: string;
  circulatingSupply: number;
  totalSupply: number;
  maxSupply: number | null;
  circulatingPercent: number;
  lockedPercent: number;
  lockedValueUsd: number;
  nextUnlockDate: string | null;
  nextUnlockDays: number | null;
  nextUnlockAmount: number | null;
  nextUnlockValueUsd: number | null;
  nextUnlockPercent: number | null;
  dilutionRisk: DilutionRisk;
}
