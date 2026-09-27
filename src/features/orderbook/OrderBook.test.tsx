import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrderBookView } from './OrderBook';
import type { OrderBook } from '../../lib/types';

describe('OrderBookView', () => {
  it('mostra mensagem de espera quando o livro estiver vazio', () => {
    render(<OrderBookView depth={null} />);
    expect(screen.getByText(/Carregando livro de ofertas em tempo real/)).toBeInTheDocument();
  });

  it('renderiza níveis de compra e venda e calcula spread', () => {
    const mockDepth: OrderBook = {
      symbol: 'ENAUSDC',
      time: 1700000000000,
      bids: [
        { price: 0.2650, amount: 1000 },
        { price: 0.2640, amount: 2000 },
      ],
      asks: [
        { price: 0.2660, amount: 1500 },
        { price: 0.2670, amount: 3000 },
      ],
    };

    render(<OrderBookView depth={mockDepth} currentPrice={0.2655} />);

    expect(screen.getByText(/Pressão do Livro/)).toBeInTheDocument();
    expect(screen.getByText(/Spread/)).toBeInTheDocument();
    // Bids & Asks exist
    expect(screen.getAllByText(/0,2650/)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/0,2660/)[0]).toBeInTheDocument();
  });

  it('marca APENAS a linha da parede de MM no BTC e não todas as linhas adjacentes', () => {
    const btcDepth: OrderBook = {
      symbol: 'BTCUSDT',
      time: 1700000000000,
      bids: [
        { price: 65000.0, amount: 0.05 },
        { price: 64999.0, amount: 0.08 },
        { price: 64998.0, amount: 8.50 }, // Grande parede institucional
        { price: 64997.0, amount: 0.04 },
      ],
      asks: [
        { price: 65001.0, amount: 0.06 },
        { price: 65002.0, amount: 0.07 },
        { price: 65003.0, amount: 0.05 },
      ],
    };

    render(<OrderBookView depth={btcDepth} currentPrice={65000.5} />);

    // Deve haver exatamente UM selo de "🧱 MM" no livro todo (apenas para a linha 64998.0)
    const mmBadges = screen.getAllByText(/🧱 MM/);
    expect(mmBadges).toHaveLength(1);
  });

  it('exibe abas de exchanges e suporta visualização individual e consolidada', () => {
    const binanceBook: OrderBook = {
      symbol: 'BTCUSDT',
      time: 1700000000000,
      exchange: 'binance',
      bids: [{ price: 95000, amount: 2.0 }],
      asks: [{ price: 95100, amount: 1.0 }],
    };
    const bybitBook: OrderBook = {
      symbol: 'BTCUSDT',
      time: 1700000000010,
      exchange: 'bybit',
      bids: [{ price: 95000, amount: 1.5 }],
      asks: [{ price: 95100, amount: 2.0 }],
    };

    const { rerender } = render(
      <OrderBookView
        depth={binanceBook}
        depths={{ binance: binanceBook, bybit: bybitBook }}
        selectedExchange="binance"
      />
    );

    expect(screen.getByRole('tab', { name: /Binance/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /OKX/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Bybit/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Consolidado/i })).toBeInTheDocument();

    // Rerender with 'merged'
    rerender(
      <OrderBookView
        depth={binanceBook}
        depths={{ binance: binanceBook, bybit: bybitBook }}
        selectedExchange="merged"
      />
    );

    // Sum of amounts: 2.0 + 1.5 = 3.5
    expect(screen.getAllByText(/3.5/)[0]).toBeInTheDocument();
    expect(screen.getByText(/Multicorretoras/)).toBeInTheDocument();
  });
});

