import { isB3Symbol, splitSymbol } from '../../lib/symbol';
import { CURATED_TOKEN_PROFILES } from './curatedUnlocks';
import type { DilutionRisk, TokenomicsData, TokenomicsSnapshot } from './types';

const cache = new Map<string, { data: TokenomicsData; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

export function formatCompactNumber(val: number): string {
  if (val >= 1_000_000_000) {
    return `${(val / 1_000_000_000).toFixed(2)}B`;
  }
  if (val >= 1_000_000) {
    return `${(val / 1_000_000).toFixed(1)}M`;
  }
  if (val >= 1_000) {
    return `${(val / 1_000).toFixed(1)}K`;
  }
  return val.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

export function formatCompactUsd(val: number): string {
  return `$${formatCompactNumber(val)}`;
}

export function formatPercent(val: number): string {
  return `${val.toFixed(1)}%`;
}

function calculateNextUnlockDays(dayOfMonth: number, now = new Date()): { dateStr: string; days: number } {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentDay = now.getDate();

  let targetYear = currentYear;
  let targetMonth = currentMonth;

  if (currentDay > dayOfMonth) {
    targetMonth += 1;
    if (targetMonth > 11) {
      targetMonth = 0;
      targetYear += 1;
    }
  }

  const targetDate = new Date(targetYear, targetMonth, dayOfMonth, 12, 0, 0);
  const diffMs = targetDate.getTime() - now.getTime();
  const days = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  const dateStr = targetDate.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return { dateStr, days };
}

export async function fetchTokenomicsData(
  symbol: string,
  signal?: AbortSignal,
): Promise<TokenomicsData | null> {
  const cleanSymbol = symbol.trim().toUpperCase();
  if (isB3Symbol(cleanSymbol)) {
    return null;
  }

  const parts = splitSymbol(cleanSymbol);
  const baseAsset = parts ? parts.base : cleanSymbol.replace(/(USDT|USDC|FDUSD|BUSD|BTC|ETH)$/, '');
  if (!baseAsset) return null;

  // 1. Verificar cache em memória
  const cached = cache.get(baseAsset);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  // 2. Perfil curado local
  const curated = CURATED_TOKEN_PROFILES[baseAsset];
  const coinGeckoId = curated?.coinGeckoId || baseAsset.toLowerCase();

  // 3. Obter preço em tempo real via Binance (sempre rápido e sem bloqueio 429)
  let binancePrice = 0;
  try {
    const pair = cleanSymbol.endsWith('USDT') ? cleanSymbol : `${baseAsset}USDT`;
    const bRes = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${pair}`, { signal });
    if (bRes.ok) {
      const bJson = await bRes.json();
      binancePrice = Number(bJson.price) || 0;
    }
  } catch {
    // Ignora se não conseguir preço binance
  }

  let currentPrice = binancePrice;
  let circulatingSupply = 0;
  let totalSupply = curated?.approxTotalSupply ?? 0;
  let maxSupply = curated?.maxSupply ?? null;
  let marketCapUsd = 0;
  let fdvUsd = 0;
  let fetchedFromLive = false;

  try {
    const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinGeckoId)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`;
    const res = await fetch(url, { signal });
    if (res.ok) {
      const json = await res.json();
      const md = json?.market_data;
      if (md) {
        if (!currentPrice || currentPrice <= 0) {
          currentPrice = Number(md.current_price?.usd) || 0;
        }
        circulatingSupply = Number(md.circulating_supply) || 0;
        totalSupply = Number(md.total_supply) || totalSupply || circulatingSupply;
        maxSupply = md.max_supply ? Number(md.max_supply) : maxSupply;
        marketCapUsd = Number(md.market_cap?.usd) || circulatingSupply * currentPrice;
        fdvUsd = Number(md.fully_diluted_valuation?.usd) || (maxSupply || totalSupply) * currentPrice;
        fetchedFromLive = true;
      }
    }
  } catch {
    // Falha de rede ou rate limit do CoinGecko: fallback gracioso para os dados curados
  }

  // Fallback para estimativas curadas caso CoinGecko retorne zerado ou 429
  if (circulatingSupply <= 0 && curated) {
    circulatingSupply = curated.approxTotalSupply * 0.75;
  }
  if (totalSupply <= 0 && curated) {
    totalSupply = curated.approxTotalSupply;
  }

  // Se o ativo não tem perfil curado e o CoinGecko falhou, fornecer estimativa segura de 100% circulante
  if (!fetchedFromLive && !curated) {
    circulatingSupply = 1_000_000_000;
    totalSupply = 1_000_000_000;
    maxSupply = 1_000_000_000;
  }

  const denominator = maxSupply || totalSupply || circulatingSupply || 1;
  const circulatingPercent = Math.min(100, Math.max(0, (circulatingSupply / denominator) * 100));
  const lockedPercent = Math.max(0, 100 - circulatingPercent);
  const lockedSupply = Math.max(0, denominator - circulatingSupply);
  const lockedValueUsd = lockedSupply * currentPrice;

  if (currentPrice > 0) {
    if (!marketCapUsd) marketCapUsd = circulatingSupply * currentPrice;
    if (!fdvUsd) fdvUsd = denominator * currentPrice;
  }

  // Cálculo de próximo evento de unlock
  let nextUnlockDate: string | null = null;
  let nextUnlockDays: number | null = null;
  let nextUnlockAmount: number | null = null;
  let nextUnlockValueUsd: number | null = null;
  let nextUnlockPercent: number | null = null;

  if (curated?.nextUnlockDayOfMonth) {
    const calc = calculateNextUnlockDays(curated.nextUnlockDayOfMonth);
    nextUnlockDate = calc.dateStr;
    nextUnlockDays = calc.days;
    nextUnlockAmount = curated.nextUnlockFixedAmount ?? null;
    if (nextUnlockAmount && currentPrice > 0) {
      nextUnlockValueUsd = nextUnlockAmount * currentPrice;
      nextUnlockPercent = (nextUnlockAmount / (circulatingSupply || 1)) * 100;
    }
  }

  // Avaliação de risco de diluição
  let dilutionRisk: DilutionRisk = 'low';
  if (circulatingPercent < 45 || (nextUnlockDays !== null && nextUnlockDays <= 10 && (nextUnlockPercent ?? 0) >= 1.5)) {
    dilutionRisk = 'high';
  } else if (circulatingPercent < 75 || (nextUnlockDays !== null && nextUnlockDays <= 30)) {
    dilutionRisk = 'moderate';
  }

  const result: TokenomicsData = {
    symbol: cleanSymbol,
    baseAsset,
    name: curated?.name || baseAsset,
    currentPrice,
    circulatingSupply,
    totalSupply,
    maxSupply,
    circulatingPercent,
    lockedPercent,
    lockedSupply,
    lockedValueUsd,
    marketCapUsd,
    fdvUsd,
    nextUnlockDate,
    nextUnlockDays,
    nextUnlockAmount,
    nextUnlockValueUsd,
    nextUnlockPercent,
    dilutionRisk,
    unlockScheduleType: curated?.unlockScheduleType || (circulatingPercent >= 98 ? 'completed' : 'ongoing'),
    categories: curated?.categories || [
      { name: 'Circulante em Mercado', percent: circulatingPercent, locked: false },
      { name: 'A Desbloquear / Vesting', percent: lockedPercent, locked: true },
    ],
    source: fetchedFromLive ? 'live' : 'curated',
    lastUpdated: Date.now(),
  };

  cache.set(baseAsset, { data: result, timestamp: Date.now() });
  return result;
}

export function toTokenomicsSnapshot(data: TokenomicsData | null): TokenomicsSnapshot | null {
  if (!data) return null;
  return {
    baseAsset: data.baseAsset,
    circulatingSupply: data.circulatingSupply,
    totalSupply: data.totalSupply,
    maxSupply: data.maxSupply,
    circulatingPercent: data.circulatingPercent,
    lockedPercent: data.lockedPercent,
    lockedValueUsd: data.lockedValueUsd,
    nextUnlockDate: data.nextUnlockDate,
    nextUnlockDays: data.nextUnlockDays,
    nextUnlockAmount: data.nextUnlockAmount,
    nextUnlockValueUsd: data.nextUnlockValueUsd,
    nextUnlockPercent: data.nextUnlockPercent,
    dilutionRisk: data.dilutionRisk,
  };
}
