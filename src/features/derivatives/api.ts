import type {
  DerivativesData,
  DerivativesSnapshot,
  SentimentBias,
  SqueezeRisk,
} from './types';
import { desktop } from '../../lib/desktop';

const FAPI_BASE = 'https://fapi.binance.com';

function formatCountdown(targetTimeMs: number): string {
  const diffMs = targetTimeMs - Date.now();
  if (diffMs <= 0) return '00h 00m';
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m`;
}

export function formatFundingRate(rate: number): string {
  const pct = (rate * 100).toFixed(4);
  return rate >= 0 ? `+${pct}%` : `${pct}%`;
}

export function formatCompactUsd(val: number): string {
  if (val >= 1_000_000_000) {
    return `$${(val / 1_000_000_000).toFixed(2)}B`;
  }
  if (val >= 1_000_000) {
    return `$${(val / 1_000_000).toFixed(2)}M`;
  }
  if (val >= 1_000) {
    return `$${(val / 1_000).toFixed(1)}K`;
  }
  return `$${val.toFixed(2)}`;
}

export async function fetchDerivativesData(
  symbol: string,
  signal?: AbortSignal,
): Promise<DerivativesData | null> {
  const cleanSymbol = symbol.trim().toUpperCase();

  // Pares B3 ou não cripto/não USDT não têm futuros na Binance
  if (!cleanSymbol.endsWith('USDT') && !cleanSymbol.endsWith('USDC')) {
    return null;
  }

  try {
    let premiumData: Record<string, unknown> | null = null;
    let oiData: Record<string, unknown> | null = null;
    let oiHistData: unknown[] = [];
    let lsData: unknown[] = [];
    let topLsData: unknown[] = [];

    // Tentar via backend nativo Tauri primeiro (imune a bloqueios de CSP / limites do navegador)
    if (desktop.available) {
      const desktopResult = await desktop.fetchDerivativesData(cleanSymbol);
      if (desktopResult && typeof desktopResult === 'object') {
        premiumData = desktopResult.premium as Record<string, unknown> | null;
        oiData = desktopResult.oi as Record<string, unknown> | null;
        oiHistData = Array.isArray(desktopResult.oi_hist) ? desktopResult.oi_hist : [];
        lsData = Array.isArray(desktopResult.ls) ? desktopResult.ls : [];
        topLsData = Array.isArray(desktopResult.top_ls) ? desktopResult.top_ls : [];
      }
    }

    // Se o backend nativo não retornou dados, tenta via fetch HTTP direto
    if (!premiumData || !oiData) {
      const [premiumRes, oiRes, oiHistRes, lsRes, topLsRes] = await Promise.all([
        fetch(`${FAPI_BASE}/fapi/v1/premiumIndex?symbol=${cleanSymbol}`, { signal }),
        fetch(`${FAPI_BASE}/fapi/v1/openInterest?symbol=${cleanSymbol}`, { signal }),
        fetch(`${FAPI_BASE}/futures/data/openInterestHist?symbol=${cleanSymbol}&period=15m&limit=8`, { signal }),
        fetch(`${FAPI_BASE}/futures/data/globalLongShortAccountRatio?symbol=${cleanSymbol}&period=15m&limit=2`, { signal }),
        fetch(`${FAPI_BASE}/futures/data/topLongShortPositionRatio?symbol=${cleanSymbol}&period=15m&limit=2`, { signal }),
      ]);

      if (!premiumRes.ok || !oiRes.ok) {
        return null;
      }

      premiumData = await premiumRes.json();
      if (premiumData && (premiumData as { code?: number }).code && (premiumData as { code?: number }).code! < 0) {
        return null;
      }

      oiData = await oiRes.json();
      oiHistData = oiHistRes.ok ? await oiHistRes.json() : [];
      lsData = lsRes.ok ? await lsRes.json() : [];
      topLsData = topLsRes.ok ? await topLsRes.json() : [];
    }

    if (!premiumData || !oiData) return null;

    const markPrice = Number(premiumData.markPrice) || 0;
    const indexPrice = Number(premiumData.indexPrice) || markPrice;
    const fundingRate = Number(premiumData.lastFundingRate) || 0;
    const nextFundingTime = Number(premiumData.nextFundingTime) || Date.now() + 8 * 3600 * 1000;
    const openInterestAmount = Number(oiData.openInterest) || 0;
    const openInterestValueUsd = openInterestAmount * markPrice;

    // Variação do Open Interest na última hora (4 períodos de 15m)
    let openInterestChange1hPct: number | null = null;
    if (Array.isArray(oiHistData) && oiHistData.length >= 2) {
      const latestObj = oiHistData[oiHistData.length - 1] as Record<string, unknown>;
      const prevObj = oiHistData[Math.max(0, oiHistData.length - 5)] as Record<string, unknown>;
      const latest = Number(latestObj?.sumOpenInterest) || 0;
      const prev = Number(prevObj?.sumOpenInterest) || 0;
      if (latest > 0 && prev > 0) {
        openInterestChange1hPct = Number.parseFloat((((latest - prev) / prev) * 100).toFixed(2));
      }
    }

    // Ratio Long vs Short do Varejo
    let longAccountRatio = 50;
    let shortAccountRatio = 50;
    let longShortRatio = 1.0;
    if (Array.isArray(lsData) && lsData.length > 0) {
      const latestLs = lsData[lsData.length - 1] as Record<string, unknown>;
      const longAcc = Number(latestLs?.longAccount) || 0.5;
      const shortAcc = Number(latestLs?.shortAccount) || 0.5;
      const lsRatio = Number(latestLs?.longShortRatio) || 1.0;
      longAccountRatio = Number.parseFloat((longAcc * 100).toFixed(1));
      shortAccountRatio = Number.parseFloat((shortAcc * 100).toFixed(1));
      longShortRatio = Number.parseFloat(lsRatio.toFixed(2));
    }

    // Ratio Long vs Short dos Top Traders (Baleias)
    let topTradersLongRatio: number | null = null;
    let topTradersShortRatio: number | null = null;
    let topTradersRatio: number | null = null;
    if (Array.isArray(topLsData) && topLsData.length > 0) {
      const latestTop = topLsData[topLsData.length - 1] as Record<string, unknown>;
      const topLong = Number(latestTop?.longAccount);
      const topShort = Number(latestTop?.shortAccount);
      const topRatio = Number(latestTop?.longShortRatio);
      if (Number.isFinite(topLong)) topTradersLongRatio = Number.parseFloat((topLong * 100).toFixed(1));
      if (Number.isFinite(topShort)) topTradersShortRatio = Number.parseFloat((topShort * 100).toFixed(1));
      if (Number.isFinite(topRatio)) topTradersRatio = Number.parseFloat(topRatio.toFixed(2));
    }

    // Classificação de Sentimento
    let sentiment: SentimentBias = 'neutral';
    if (longAccountRatio >= 68) sentiment = 'heavy_long';
    else if (longAccountRatio >= 55) sentiment = 'long_skew';
    else if (longAccountRatio <= 32) sentiment = 'heavy_short';
    else if (longAccountRatio <= 45) sentiment = 'short_skew';

    // Diagnóstico de Risco e Squeeze
    let squeezeRisk: SqueezeRisk = 'low';
    let riskHeadline = 'Alavancagem equilibrada';
    let riskDescription = 'Funding e posições em aberto dentro da normalidade.';

    if (openInterestChange1hPct !== null && openInterestChange1hPct <= -2.5) {
      squeezeRisk = 'liquidation_flush';
      riskHeadline = 'Limpeza de Alavancados Recente (Flush)';
      riskDescription = `Queda súbita de ${Math.abs(openInterestChange1hPct)}% no Open Interest na última hora. Houve liquidação forçada de posições.`;
    } else if (fundingRate >= 0.0003 && longShortRatio >= 2.0) {
      squeezeRisk = 'high_long_squeeze';
      riskHeadline = 'Alerta de Long Squeeze';
      riskDescription = 'Varejo fortemente inclinado em Long com funding elevado pagando caro. Risco de caça de stops para baixo.';
    } else if (fundingRate <= -0.0002 && longShortRatio <= 0.8) {
      squeezeRisk = 'high_short_squeeze';
      riskHeadline = 'Alerta de Short Squeeze';
      riskDescription = 'Varejo inclinado em Short com taxa negativa. Risco de repique violento para liquidar vendidos.';
    } else if (openInterestChange1hPct !== null && openInterestChange1hPct >= 4.0) {
      squeezeRisk = 'leverage_buildup';
      riskHeadline = 'Forte Acúmulo de Alavancagem';
      riskDescription = `Open Interest subiu +${openInterestChange1hPct}% na última hora. Traders se posicionando para movimento volátil.`;
    }

    return {
      symbol: cleanSymbol,
      hasFutures: true,
      markPrice,
      indexPrice,
      fundingRate,
      fundingRatePercent: formatFundingRate(fundingRate),
      nextFundingTime,
      nextFundingCountdown: formatCountdown(nextFundingTime),
      openInterestAmount,
      openInterestValueUsd,
      openInterestChange1hPct,
      longAccountRatio,
      shortAccountRatio,
      longShortRatio,
      topTradersLongRatio,
      topTradersShortRatio,
      topTradersRatio,
      sentiment,
      squeezeRisk,
      riskHeadline,
      riskDescription,
      updatedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

export function toDerivativesSnapshot(data: DerivativesData | null): DerivativesSnapshot | null {
  if (!data || !data.hasFutures) return null;
  return {
    hasFutures: true,
    fundingRate: data.fundingRate,
    fundingRatePercent: data.fundingRatePercent,
    nextFundingCountdown: data.nextFundingCountdown,
    openInterestAmount: data.openInterestAmount,
    openInterestValueUsd: data.openInterestValueUsd,
    openInterestChange1hPct: data.openInterestChange1hPct,
    longShortRatio: data.longShortRatio,
    longAccountPercent: data.longAccountRatio,
    shortAccountPercent: data.shortAccountRatio,
    topTradersLongShortRatio: data.topTradersRatio,
    squeezeRisk: data.squeezeRisk,
    sentimentSummary: `${data.riskHeadline} (${data.fundingRatePercent} funding, L/S ${data.longShortRatio}, OI ${formatCompactUsd(data.openInterestValueUsd)})`,
  };
}
