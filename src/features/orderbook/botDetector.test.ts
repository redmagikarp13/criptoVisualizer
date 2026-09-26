import { describe, expect, it } from 'vitest';
import { analyzeOrderBookBots } from './botDetector';
import type { OrderBook } from '../../lib/types';

describe('botDetector', () => {
  it('identifica paredes anormais de Market Maker (MM Wall)', () => {
    const book: OrderBook = {
      symbol: 'ENAUSDC',
      time: 1000,
      bids: [
        { price: 0.250, amount: 1000 },
        { price: 0.249, amount: 1000 },
        { price: 0.248, amount: 8000 }, // ~4x a média!
        { price: 0.247, amount: 1000 },
      ],
      asks: [
        { price: 0.251, amount: 1000 },
        { price: 0.252, amount: 1000 },
        { price: 0.253, amount: 1000 },
        { price: 0.254, amount: 1000 },
      ],
    };

    const { analysis } = analyzeOrderBookBots(book, [], 0.2505);
    expect(analysis.activeWalls.length).toBe(1);
    expect(analysis.activeWalls[0].side).toBe('bid');
    expect(analysis.activeWalls[0].price).toBe(0.248);
    expect(analysis.topBidWall?.price).toBe(0.248);
    expect(analysis.algorithmicBias).toBe('bullish');
  });

  it('detecta spoofing quando ordem pesada anterior é cancelada sem trade', () => {
    const olderBook = {
      time: 1000,
      bestBid: 0.250,
      bestAsk: 0.251,
      bids: [
        { price: 0.250, amount: 1000 },
        { price: 0.248, amount: 10000 }, // Grande parede
      ],
      asks: [
        { price: 0.251, amount: 1000 },
        { price: 0.252, amount: 1000 },
      ],
    };

    const currentBook: OrderBook = {
      symbol: 'ENAUSDC',
      time: 2000,
      bids: [
        { price: 0.250, amount: 1000 },
        // A ordem em 0.248 sumiu! Preço atual ainda está em 0.2505
      ],
      asks: [
        { price: 0.251, amount: 1000 },
      ],
    };

    const history = [olderBook, olderBook, olderBook];
    const { newSpoofAlerts } = analyzeOrderBookBots(currentBook, history, 0.2505);

    expect(newSpoofAlerts.length).toBeGreaterThan(0);
    expect(newSpoofAlerts[0].side).toBe('bid');
    expect(newSpoofAlerts[0].price).toBe(0.248);
  });

  it('detecta atividade de HFT quando spread e topo do book oscilam velozmente', () => {
    const book: OrderBook = {
      symbol: 'ENAUSDC',
      time: 5000,
      bids: [{ price: 0.250, amount: 1000 }],
      asks: [{ price: 0.251, amount: 1000 }],
    };

    const history = Array.from({ length: 10 }, (_, i) => ({
      time: 1000 + i * 100,
      bids: [{ price: 0.250 + (i % 2) * 0.001, amount: 1000 }],
      asks: [{ price: 0.251 + (i % 2) * 0.001, amount: 1000 }],
      bestBid: 0.250 + (i % 2) * 0.001,
      bestAsk: 0.251 + (i % 2) * 0.001,
    }));

    const { analysis } = analyzeOrderBookBots(book, history, 0.250);
    expect(analysis.hftActive).toBe(true);
  });

  it('determina que os robôs estão forçando o preço para cima (pushing_up) com suporte pesado', () => {
    const book: OrderBook = {
      symbol: 'BTCUSDT',
      time: 1000,
      bids: [
        { price: 65000, amount: 5 },
        { price: 64980, amount: 80 }, // parede enorme de compra perto do preço
        { price: 64950, amount: 5 },
      ],
      asks: [
        { price: 65010, amount: 4 },
        { price: 65030, amount: 5 },
        { price: 65050, amount: 6 },
      ],
    };

    const { analysis } = analyzeOrderBookBots(book, [], 65005);
    expect(analysis.intent.direction).toBe('pushing_up');
    expect(analysis.intent.score).toBeGreaterThan(40);
    expect(analysis.intent.bidPressurePct).toBeGreaterThan(70);
    expect(analysis.intent.tactic).toContain('Escolta');
    expect(analysis.intent.headline).toContain('ALTA');
  });

  it('determina que os robôs estão forçando o preço para baixo (pushing_down) com barreira de teto', () => {
    const book: OrderBook = {
      symbol: 'BTCUSDT',
      time: 1000,
      bids: [
        { price: 65000, amount: 4 },
        { price: 64980, amount: 5 },
        { price: 64950, amount: 4 },
      ],
      asks: [
        { price: 65010, amount: 5 },
        { price: 65020, amount: 95 }, // barreira maciça de venda sufocando a alta
        { price: 65040, amount: 5 },
      ],
    };

    const { analysis } = analyzeOrderBookBots(book, [], 65005);
    expect(analysis.intent.direction).toBe('pushing_down');
    expect(analysis.intent.score).toBeLessThan(-40);
    expect(analysis.intent.askPressurePct).toBeGreaterThan(70);
    expect(analysis.intent.tactic).toContain('Teto');
    expect(analysis.intent.headline).toContain('BAIXA');
  });

  it('não marca ordens normais adjacentes em ativos caros como BTC como robôs', () => {
    // Simula livro do BTC com ticks adjacentes de $0.10 e ordens normais de varejo
    const bids = [
      { price: 65000.0, amount: 0.02 },
      { price: 64999.9, amount: 0.05 },
      { price: 64999.8, amount: 0.03 },
      { price: 64999.7, amount: 0.01 },
      { price: 64999.6, amount: 0.04 },
      { price: 64995.0, amount: 3.50 }, // Única parede real de MM (3.5 BTC)
      { price: 64994.9, amount: 0.02 },
      { price: 64994.8, amount: 0.03 },
    ];
    const asks = [
      { price: 65000.1, amount: 0.02 },
      { price: 65000.2, amount: 0.04 },
      { price: 65000.3, amount: 0.03 },
      { price: 65000.4, amount: 0.05 },
    ];

    const book: OrderBook = {
      symbol: 'BTCUSDT',
      time: 1000,
      bids,
      asks,
    };

    const { analysis } = analyzeOrderBookBots(book, [], 65000.05);

    // Deve detectar APENAS a parede real em 64995.0 e nenhuma das ordens normais de varejo
    expect(analysis.activeWalls.length).toBe(1);
    expect(analysis.activeWalls[0].price).toBe(64995.0);
    expect(analysis.activeWalls[0].side).toBe('bid');
    expect(analysis.topBidWall?.price).toBe(64995.0);
    expect(analysis.topAskWall).toBeNull();
  });
});

