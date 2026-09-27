import type { Candle } from '../../lib/types';
import type { TrendlineDrawing } from './drawings';

export interface PivotPoint {
  index: number;
  time: number;
  price: number;
  type: 'high' | 'low';
}

export interface AutoTrendlinesResult {
  resistance: TrendlineDrawing | null;
  support: TrendlineDrawing | null;
  highPivots: PivotPoint[];
  lowPivots: PivotPoint[];
}

export function findPivots(
  candles: Candle[],
  leftBars = 3,
  rightBars = 2
): { highs: PivotPoint[]; lows: PivotPoint[] } {
  const highs: PivotPoint[] = [];
  const lows: PivotPoint[] = [];

  if (candles.length < leftBars + rightBars + 1) {
    return { highs, lows };
  }

  // Look across recent candles (last 180 bars max)
  const startIndex = Math.max(0, candles.length - 180);

  for (let i = startIndex + leftBars; i < candles.length - rightBars; i++) {
    const current = candles[i];
    let isHigh = true;
    let isLow = true;

    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (j === i) continue;
      if (candles[j].high > current.high) isHigh = false;
      if (candles[j].low < current.low) isLow = false;
    }

    if (isHigh) {
      highs.push({ index: i, time: current.time, price: current.high, type: 'high' });
    }
    if (isLow) {
      lows.push({ index: i, time: current.time, price: current.low, type: 'low' });
    }
  }

  return { highs, lows };
}

export function detectAutoTrendlines(candles: Candle[]): AutoTrendlinesResult {
  if (!candles || candles.length < 15) {
    return { resistance: null, support: null, highPivots: [], lowPivots: [] };
  }

  // Com base histórica suficiente (>= 50 barras), usa amostragem estrutural mais ampla
  // (5 barras à esquerda, 3 à direita e distância mínima de 6 barras entre pivôs)
  // para evitar ruído e falsas quebras em velas de poucos segundos/minutos.
  const isBroad = candles.length >= 50;
  const leftBars = isBroad ? 5 : 3;
  const rightBars = isBroad ? 3 : 2;
  const minBarDistance = isBroad ? 6 : 4;

  const { highs, lows } = findPivots(candles, leftBars, rightBars);

  let bestResistance: TrendlineDrawing | null = null;
  let bestResScore = -Infinity;

  // 1. Encontrar a melhor Linha de Resistência (Topos Descendentes ou Testes de Teto)
  if (highs.length >= 2) {
    const recentHighs = highs.slice(-8); // focar nos topos mais recentes

    for (let i = 0; i < recentHighs.length; i++) {
      for (let j = i + 1; j < recentHighs.length; j++) {
        const h1 = recentHighs[i];
        const h2 = recentHighs[j];

        const barDistance = h2.index - h1.index;
        if (barDistance < minBarDistance) continue;

        const dt = h2.time - h1.time;
        if (dt <= 0) continue;

        const slope = (h2.price - h1.price) / dt;
        const intercept = h1.price - slope * h1.time;

        // Avaliar quantas velas furaram a resistência e quantas respeitaram
        let violations = 0;
        let violationSum = 0;
        let touches = 0;

        for (let k = h1.index; k < candles.length; k++) {
          const c = candles[k];
          const linePrice = slope * c.time + intercept;
          if (linePrice <= 0) continue;

          const diff = c.high - linePrice;
          const ratio = diff / linePrice;

          // Rompimento expressivo acima da linha
          if (ratio > 0.003) {
            violations++;
            violationSum += ratio;
          } else if (Math.abs(ratio) <= 0.004) {
            touches++;
          }
        }

        // Pontuação de relevância da linha de tendência
        const recentBonus = j >= recentHighs.length - 2 ? 18 : 0;
        const score = barDistance * 1.5 + touches * 12 + recentBonus - violations * 45 - violationSum * 300;

        if (score > bestResScore && violations <= 3) {
          bestResScore = score;
          bestResistance = {
            id: 'auto-resistance',
            type: 'trendline',
            color: '#f43f5e', // Vermelho/Rosa para LTB de resistência
            p1: { time: h1.time, price: h1.price },
            p2: { time: h2.time, price: h2.price },
            extendRight: true,
          };
        }
      }
    }
  }

  // 2. Encontrar a melhor Linha de Suporte (Fundos Ascendentes ou Testes de Chão)
  let bestSupport: TrendlineDrawing | null = null;
  let bestSupScore = -Infinity;

  if (lows.length >= 2) {
    const recentLows = lows.slice(-8);

    for (let i = 0; i < recentLows.length; i++) {
      for (let j = i + 1; j < recentLows.length; j++) {
        const l1 = recentLows[i];
        const l2 = recentLows[j];

        const barDistance = l2.index - l1.index;
        if (barDistance < minBarDistance) continue;

        const dt = l2.time - l1.time;
        if (dt <= 0) continue;

        const slope = (l2.price - l1.price) / dt;
        const intercept = l1.price - slope * l1.time;

        let violations = 0;
        let violationSum = 0;
        let touches = 0;

        for (let k = l1.index; k < candles.length; k++) {
          const c = candles[k];
          const linePrice = slope * c.time + intercept;
          if (linePrice <= 0) continue;

          const diff = linePrice - c.low;
          const ratio = diff / linePrice;

          // Rompimento expressivo abaixo do suporte
          if (ratio > 0.003) {
            violations++;
            violationSum += ratio;
          } else if (Math.abs(ratio) <= 0.004) {
            touches++;
          }
        }

        const recentBonus = j >= recentLows.length - 2 ? 18 : 0;
        const score = barDistance * 1.5 + touches * 12 + recentBonus - violations * 45 - violationSum * 300;

        if (score > bestSupScore && violations <= 3) {
          bestSupScore = score;
          bestSupport = {
            id: 'auto-support',
            type: 'trendline',
            color: '#10b981', // Verde esmeralda para LTA de suporte
            p1: { time: l1.time, price: l1.price },
            p2: { time: l2.time, price: l2.price },
            extendRight: true,
          };
        }
      }
    }
  }

  return {
    resistance: bestResistance,
    support: bestSupport,
    highPivots: highs,
    lowPivots: lows,
  };
}
