import { useRef, useMemo } from 'react';
import type { DepthLevel, OrderBook } from '../../lib/types';

export interface BotWall {
  side: 'bid' | 'ask';
  price: number;
  amount: number;
  ratioToAverage: number;
  distancePercent: number;
  isHeavy: boolean;
}

export interface SpoofAlert {
  id: string;
  side: 'bid' | 'ask';
  price: number;
  amount: number;
  durationMs: number;
  detectedAt: number;
}

export type BotPressureDirection = 'pushing_up' | 'pushing_down' | 'neutral';
export type BotPressureIntensity = 'strong' | 'moderate' | 'weak';

export interface BotIntentAnalysis {
  direction: BotPressureDirection;
  intensity: BotPressureIntensity;
  score: number; // -100 (forçando forte queda) a +100 (forçando forte alta)
  headline: string;
  explanation: string;
  tactic: string;
  actionableAdvice: string;
  bidBotVolume: number;
  askBotVolume: number;
  bidPressurePct: number;
  askPressurePct: number;
}

export interface BotAnalysis {
  activeWalls: BotWall[];
  topBidWall: BotWall | null;
  topAskWall: BotWall | null;
  spoofAlerts: SpoofAlert[];
  hftActive: boolean;
  botBidRatio: number;
  botAskRatio: number;
  algorithmicBias: 'bullish' | 'bearish' | 'neutral';
  summaryText: string;
  intent: BotIntentAnalysis;
}

export interface BufferFrame {
  time: number;
  bids: DepthLevel[];
  asks: DepthLevel[];
  bestBid: number;
  bestAsk: number;
}

const MAX_BUFFER_SIZE = 40; // ~4 seconds at 100ms updates
const SPOOF_EXPIRY_MS = 12_000; // keep spoof alerts visible for 12s

function getMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Analisa o frame atual de profundidade e compara com o histórico em anel local
 * para detectar paredes institucionais, ordens fantasmas (spoofing) e flickering HFT.
 */
export function analyzeOrderBookBots(
  current: OrderBook | null,
  historyBuffer: BufferFrame[],
  currentPrice: number = 0
): { analysis: BotAnalysis; newSpoofAlerts: SpoofAlert[] } {
  if (!current || current.bids.length === 0 || current.asks.length === 0) {
    return {
      analysis: {
        activeWalls: [],
        topBidWall: null,
        topAskWall: null,
        spoofAlerts: [],
        hftActive: false,
        botBidRatio: 50,
        botAskRatio: 50,
        algorithmicBias: 'neutral',
        summaryText: 'Aguardando fluxo de dados do livro…',
        intent: defaultIntent,
      },
      newSpoofAlerts: [],
    };
  }

  const refPrice = currentPrice > 0 ? currentPrice : (current.bids[0]?.price ?? 1);

  // 1. Volumes e médias para cálculo de anomalia institucional
  const totalBidVol = current.bids.reduce((sum, b) => sum + b.amount, 0);
  const totalAskVol = current.asks.reduce((sum, a) => sum + a.amount, 0);

  const bidAvg = current.bids.length > 0 ? totalBidVol / current.bids.length : 0;
  const askAvg = current.asks.length > 0 ? totalAskVol / current.asks.length : 0;

  const bidMedian = getMedian(current.bids.map(b => b.amount));
  const askMedian = getMedian(current.asks.map(a => a.amount));

  const candidateBidWalls: BotWall[] = [];
  const candidateAskWalls: BotWall[] = [];

  // Detecta paredes nos bids (Compras)
  for (const bid of current.bids) {
    if (bid.amount <= 0) continue;
    const ratioAvg = bidAvg > 0 ? bid.amount / bidAvg : 1;
    const ratioMedian = bidMedian > 0 ? bid.amount / bidMedian : 1;
    const shareOfSide = totalBidVol > 0 ? bid.amount / totalBidVol : 0;

    // Critérios para Parede Institucional (Market Maker Wall):
    // 1. Múltiplo proeminente do tamanho típico: ratioAvg >= 2.6 OU ratioMedian >= 3.0
    // 2. Fatia relevante da liquidez visível: mínimo de 8% do volume do lado (ou ratio >= 5.0)
    const isAnomalousRatio = ratioAvg >= 2.6 || ratioMedian >= 3.0;
    const hasMeaningfulShare = shareOfSide >= 0.08 || ratioAvg >= 5.0;

    if (isAnomalousRatio && hasMeaningfulShare) {
      const distancePercent = ((bid.price - refPrice) / refPrice) * 100;
      const effectiveRatio = Number(Math.max(ratioAvg, ratioMedian).toFixed(1));
      candidateBidWalls.push({
        side: 'bid',
        price: bid.price,
        amount: bid.amount,
        ratioToAverage: effectiveRatio,
        distancePercent,
        isHeavy: ratioAvg >= 4.0 || shareOfSide >= 0.20,
      });
    }
  }

  // Detecta paredes nos asks (Vendas)
  for (const ask of current.asks) {
    if (ask.amount <= 0) continue;
    const ratioAvg = askAvg > 0 ? ask.amount / askAvg : 1;
    const ratioMedian = askMedian > 0 ? ask.amount / askMedian : 1;
    const shareOfSide = totalAskVol > 0 ? ask.amount / totalAskVol : 0;

    const isAnomalousRatio = ratioAvg >= 2.6 || ratioMedian >= 3.0;
    const hasMeaningfulShare = shareOfSide >= 0.08 || ratioAvg >= 5.0;

    if (isAnomalousRatio && hasMeaningfulShare) {
      const distancePercent = ((ask.price - refPrice) / refPrice) * 100;
      const effectiveRatio = Number(Math.max(ratioAvg, ratioMedian).toFixed(1));
      candidateAskWalls.push({
        side: 'ask',
        price: ask.price,
        amount: ask.amount,
        ratioToAverage: effectiveRatio,
        distancePercent,
        isHeavy: ratioAvg >= 4.0 || shareOfSide >= 0.20,
      });
    }
  }

  // Filtra para manter apenas as paredes mais significativas (no máximo 2 por lado)
  // para evitar poluição visual e focar nas reais barreiras institucionais
  const bidWalls = candidateBidWalls.sort((a, b) => b.amount - a.amount).slice(0, 2);
  const askWalls = candidateAskWalls.sort((a, b) => b.amount - a.amount).slice(0, 2);
  const activeWalls = [...bidWalls, ...askWalls];

  const topBidWall = bidWalls[0] ?? null;
  const topAskWall = askWalls[0] ?? null;

  // 2. Detecção de Spoofing comparando com o histórico
  const newSpoofAlerts: SpoofAlert[] = [];
  const now = Date.now();

  if (historyBuffer.length >= 3) {
    const olderFrame = historyBuffer[0];

    // Verifica bids passados que sumiram
    const prevBidAvg = olderFrame.bids.reduce((s, b) => s + b.amount, 0) / Math.max(1, olderFrame.bids.length);
    for (const oldBid of olderFrame.bids) {
      if (oldBid.amount >= prevBidAvg * 1.7) {
        // Estava no livro anterior. Está no livro atual?
        const currentMatch = current.bids.find(b => Math.abs(b.price - oldBid.price) < 1e-5);
        if (!currentMatch || currentMatch.amount < oldBid.amount * 0.3) {
          // Sumiu ou reduziu mais de 70%! O preço cruzou para baixo desse bid?
          if (refPrice > oldBid.price * 1.0002) {
            newSpoofAlerts.push({
              id: `spoof-bid-${oldBid.price}-${now}`,
              side: 'bid',
              price: oldBid.price,
              amount: oldBid.amount,
              durationMs: Math.max(100, now - olderFrame.time),
              detectedAt: now,
            });
          }
        }
      }
    }

    // Verifica asks passados que sumiram
    const prevAskAvg = olderFrame.asks.reduce((s, a) => s + a.amount, 0) / Math.max(1, olderFrame.asks.length);
    for (const oldAsk of olderFrame.asks) {
      if (oldAsk.amount >= prevAskAvg * 1.7) {
        const currentMatch = current.asks.find(a => Math.abs(a.price - oldAsk.price) < 1e-5);
        if (!currentMatch || currentMatch.amount < oldAsk.amount * 0.3) {
          // Se o preço atual ainda está abaixo desse ask, cancelou antes de executar!
          if (refPrice < oldAsk.price * 0.9998) {
            newSpoofAlerts.push({
              id: `spoof-ask-${oldAsk.price}-${now}`,
              side: 'ask',
              price: oldAsk.price,
              amount: oldAsk.amount,
              durationMs: Math.max(100, now - olderFrame.time),
              detectedAt: now,
            });
          }
        }
      }
    }
  }

  // 3. Detecção de HFT Flickering (Spread Scalper)
  let hftActive = false;
  if (historyBuffer.length >= 8) {
    const recent = historyBuffer.slice(-8);
    let changes = 0;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i].bestBid !== recent[i - 1].bestBid || recent[i].bestAsk !== recent[i - 1].bestAsk) {
        changes++;
      }
    }
    if (changes >= 4) {
      hftActive = true;
    }
  }

  // 4. Balanço de Pressão dos Robôs
  const botBidVol = bidWalls.reduce((sum, w) => sum + w.amount, 0);
  const botAskVol = askWalls.reduce((sum, w) => sum + w.amount, 0);
  const totalBotVol = botBidVol + botAskVol;

  let botBidRatio = 50;
  let botAskRatio = 50;
  let algorithmicBias: 'bullish' | 'bearish' | 'neutral' = 'neutral';

  if (totalBotVol > 0) {
    botBidRatio = (botBidVol / totalBotVol) * 100;
    botAskRatio = (botAskVol / totalBotVol) * 100;
    if (botBidRatio >= 60) algorithmicBias = 'bullish';
    else if (botAskRatio >= 60) algorithmicBias = 'bearish';
  } else {
    const totalBid = current.bids.reduce((sum, b) => sum + b.amount, 0);
    const totalAsk = current.asks.reduce((sum, a) => sum + a.amount, 0);
    const tot = totalBid + totalAsk;
    if (tot > 0) {
      botBidRatio = (totalBid / tot) * 100;
      botAskRatio = (totalAsk / tot) * 100;
      if (botBidRatio >= 62) algorithmicBias = 'bullish';
      else if (botAskRatio >= 62) algorithmicBias = 'bearish';
    }
  }

  let summaryText = 'Distribuição equilibrada entre compradores e vendedores.';
  if (algorithmicBias === 'bullish') {
    summaryText = `Pressão compradora institucional dominante (${botBidRatio.toFixed(0)}%).`;
    if (topBidWall) {
      summaryText += ` Parede de suporte em ${topBidWall.price.toFixed(4)} (${topBidWall.ratioToAverage.toFixed(1)}x média).`;
    }
  } else if (algorithmicBias === 'bearish') {
    summaryText = `Pressão vendedora institucional dominante (${botAskRatio.toFixed(0)}%).`;
    if (topAskWall) {
      summaryText += ` Parede de barreira em ${topAskWall.price.toFixed(4)} (${topAskWall.ratioToAverage.toFixed(1)}x média).`;
    }
  }

  // 5. Análise de Forçamento Direcional do Preço pelos Robôs (Pushing UP vs Pushing DOWN)
  let weightedBotBid = 0;
  for (const wall of bidWalls) {
    const distPct = Math.max(0.01, Math.abs(refPrice - wall.price) / refPrice * 100);
    const proximityWeight = 1 / (1 + distPct * 1.5);
    weightedBotBid += wall.amount * proximityWeight * (wall.isHeavy ? 1.5 : 1.0);
  }

  let weightedBotAsk = 0;
  for (const wall of askWalls) {
    const distPct = Math.max(0.01, Math.abs(wall.price - refPrice) / refPrice * 100);
    const proximityWeight = 1 / (1 + distPct * 1.5);
    weightedBotAsk += wall.amount * proximityWeight * (wall.isHeavy ? 1.5 : 1.0);
  }

  let rawScore = 0;
  const totalWeighted = weightedBotBid + weightedBotAsk;
  if (totalWeighted > 0) {
    rawScore = ((weightedBotBid - weightedBotAsk) / totalWeighted) * 100;
  } else {
    const topBids = current.bids.slice(0, 5);
    const topAsks = current.asks.slice(0, 5);
    let topBidWeighted = 0;
    let topAskWeighted = 0;
    topBids.forEach((b, i) => { topBidWeighted += b.amount / (i + 1); });
    topAsks.forEach((a, i) => { topAskWeighted += a.amount / (i + 1); });
    const topTot = topBidWeighted + topAskWeighted;
    if (topTot > 0) {
      rawScore = ((topBidWeighted - topAskWeighted) / topTot) * 60;
    }
  }

  const recentAskSpoof = newSpoofAlerts.some(s => s.side === 'ask');
  const recentBidSpoof = newSpoofAlerts.some(s => s.side === 'bid');
  if (recentAskSpoof) rawScore += 18;
  if (recentBidSpoof) rawScore -= 18;

  const score = Math.max(-100, Math.min(100, Math.round(rawScore)));
  const bidPressurePct = Math.round((score + 100) / 2);
  const askPressurePct = 100 - bidPressurePct;

  let direction: BotPressureDirection = 'neutral';
  let intensity: BotPressureIntensity = 'weak';
  let headline = 'DISPUTA NEUTRA / CANAL ⚖️';
  let tactic = 'Equilíbrio Bilateral de Liquidez';
  let explanation = 'Robôs atuando em ambos os lados do livro sem força direcional clara dominante.';
  let actionableAdvice = 'Mercado lateral entre paredes de compra e venda. Aguarde quebra de assimetria.';

  if (score >= 28) {
    direction = 'pushing_up';
    intensity = score >= 58 ? 'strong' : 'moderate';
    headline = intensity === 'strong' ? 'ROBÔS FORÇANDO ALTA COM FORÇA 🚀' : 'ROBÔS PRESSIONANDO ALTA ↗️';

    if (topBidWall && Math.abs(topBidWall.price - refPrice) / refPrice < 0.015) {
      tactic = 'Escolta de Suporte (Laddering Bids)';
      explanation = `Parede maciça de robô em ${topBidWall.price.toFixed(4)} (${topBidWall.ratioToAverage.toFixed(1)}x média) sustentando o piso e empurrando o preço para cima.`;
    } else if (recentAskSpoof) {
      tactic = 'Absorção com Blefe de Venda (Ask Spoofing)';
      explanation = 'Robôs blefaram venda para assustar o mercado e cancelaram, acumulando na compra para puxar o preço.';
    } else {
      tactic = 'Pressão Compradora Contínua';
      explanation = `Desbalanceamento algorítmico de ${bidPressurePct}% a favor das compras, absorvendo liquidez de venda.`;
    }
    actionableAdvice = 'Robôs defendem suporte. Atenção: se o suporte for retirado subitamente, pode haver correção rápida.';
  } else if (score <= -28) {
    direction = 'pushing_down';
    intensity = score <= -58 ? 'strong' : 'moderate';
    headline = intensity === 'strong' ? 'ROBÔS FORÇANDO BAIXA COM FORÇA 🔻' : 'ROBÔS PRESSIONANDO BAIXA ↘️';

    if (topAskWall && Math.abs(topAskWall.price - refPrice) / refPrice < 0.015) {
      tactic = 'Teto Sufocador (Wall-Capping)';
      explanation = `Barreira maciça de venda em ${topAskWall.price.toFixed(4)} (${topAskWall.ratioToAverage.toFixed(1)}x média) bloqueando avanços e forçando o preço para baixo.`;
    } else if (recentBidSpoof) {
      tactic = 'Armadilha de Compra (Bid Spoofing)';
      explanation = 'Ordens falsas de compra foram canceladas antes da execução, deixando o livro vulnerável à queda.';
    } else {
      tactic = 'Barreira e Distribuição Ativa';
      explanation = `Desbalanceamento algorítmico de ${askPressurePct}% a favor das vendas, sufocando tentativas de alta.`;
    }
    actionableAdvice = 'Barreira pesada de robôs acima da cotação. Evite compras a mercado no topo sem confirmação de rompimento.';
  }

  const intent: BotIntentAnalysis = {
    direction,
    intensity,
    score,
    headline,
    explanation,
    tactic,
    actionableAdvice,
    bidBotVolume: botBidVol,
    askBotVolume: botAskVol,
    bidPressurePct,
    askPressurePct,
  };

  return {
    analysis: {
      activeWalls,
      topBidWall,
      topAskWall,
      spoofAlerts: [],
      hftActive,
      botBidRatio,
      botAskRatio,
      algorithmicBias,
      summaryText,
      intent,
    },
    newSpoofAlerts,
  };
}

const defaultIntent: BotIntentAnalysis = {
  direction: 'neutral',
  intensity: 'weak',
  score: 0,
  headline: 'LIVRO EM ESPERA',
  explanation: 'Aguardando fluxo de ordens para calcular pressão dos robôs.',
  tactic: 'Sem atividade detectada',
  actionableAdvice: 'Aguarde os dados de cotação e profundidade.',
  bidBotVolume: 0,
  askBotVolume: 0,
  bidPressurePct: 50,
  askPressurePct: 50,
};

/**
 * Hook para monitorar o orderbook em tempo real com anel de histórico em memória.
 */
export function useBotDetector(depth: OrderBook | null, currentPrice: number = 0) {
  const bufferRef = useRef<BufferFrame[]>([]);
  const spoofAlertsRef = useRef<SpoofAlert[]>([]);

  const result = useMemo(() => {
    if (!depth) {
      return {
        activeWalls: [],
        topBidWall: null,
        topAskWall: null,
        spoofAlerts: [],
        hftActive: false,
        botBidRatio: 50,
        botAskRatio: 50,
        algorithmicBias: 'neutral' as const,
        summaryText: 'Aguardando conexão com o livro…',
        intent: defaultIntent,
      };
    }

    const { analysis, newSpoofAlerts } = analyzeOrderBookBots(depth, bufferRef.current, currentPrice);

    // Adiciona novos alertas de spoofing deduplicando por preço aproximado e janela de tempo recente
    const now = Date.now();
    for (const newAlert of newSpoofAlerts) {
      const exists = spoofAlertsRef.current.some(
        a => a.side === newAlert.side && Math.abs(a.price - newAlert.price) / a.price < 0.0005 && now - a.detectedAt < 4000
      );
      if (!exists) {
        spoofAlertsRef.current.unshift(newAlert);
      }
    }

    // Remove alertas expirados (> 12s) e limita aos 5 mais recentes
    spoofAlertsRef.current = spoofAlertsRef.current
      .filter(a => now - a.detectedAt <= SPOOF_EXPIRY_MS)
      .slice(0, 5);

    // Atualiza anel de histórico (FIFO)
    const newFrame: BufferFrame = {
      time: now,
      bids: depth.bids,
      asks: depth.asks,
      bestBid: depth.bids[0]?.price ?? 0,
      bestAsk: depth.asks[0]?.price ?? 0,
    };

    bufferRef.current.push(newFrame);
    if (bufferRef.current.length > MAX_BUFFER_SIZE) {
      bufferRef.current.shift();
    }

    return {
      ...analysis,
      spoofAlerts: [...spoofAlertsRef.current],
    };
  }, [depth, currentPrice]);

  return result;
}
