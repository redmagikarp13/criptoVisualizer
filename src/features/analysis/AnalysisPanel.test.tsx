import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnalysisPanel, type AnalysisPanelProps } from './AnalysisPanel';
import { defaultPreferences } from '../settings/preferences';
import type { Analysis, Snapshot } from './snapshot';

const fake = vi.hoisted(() => ({ analyze: vi.fn(), cancelAnalysis: vi.fn() }));
vi.mock('../../lib/desktop', () => ({ desktop: { available: true, ...fake } }));
const analysis: Analysis = { summary: '<script>não executar</script>', trend: 'lateral', evidence: ['RSI neutro'], scenarios: [{ condition: 'Se romper', interpretation: 'Reavaliar' }], risks: ['Volatilidade'], limitations: ['Sem notícias'] };
const props: AnalysisPanelProps = { symbol: 'BTCUSDT', interval: '1m', candles: [{ time: 60, open: 10, high: 12, low: 9, close: 11, volume: 2, closed: true }, { time: 120, open: 11, high: 12, low: 10, close: 11, volume: 1, closed: false }], preferences: defaultPreferences, statuses: [{ agent: 'qoder', available: true, path: 'fake', message: 'Compatível' }], comparison: null, hidden: false };
beforeEach(() => { fake.analyze.mockReset(); fake.cancelAnalysis.mockReset(); });
it('envia somente candles fechados e mantém a identificação após trocar o gráfico', async () => {
  let finish!: (value: { analysis: Analysis; model: string | null }) => void;
  fake.analyze.mockImplementation((_id: string, _agent: string, snapshot: Snapshot) => {
    expect(snapshot.candles).toHaveLength(1); expect(snapshot.candles[0].closed).toBe(true);
    return new Promise(resolve => { finish = resolve; });
  });
  const view = render(<AnalysisPanel {...props} />); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Analisar com IA' }));
  expect(screen.getByRole('button', { name: 'Cancelar análise' })).toBeEnabled();
  view.rerender(<AnalysisPanel {...props} symbol="ETHUSDT" />);
  await act(async () => finish({ analysis, model: 'modelo-testado' }));
  expect(await screen.findByText(/Esta análise pertence a outro par ou período/)).toBeInTheDocument();
  expect(screen.getByText(/BTCUSDT · 1m/)).toBeInTheDocument();
  expect(screen.getByText('<script>não executar</script>')).toBeInTheDocument();
  expect(view.container.querySelector('script')).toBeNull();
});
it('não repete erros da CLI automaticamente e recupera o botão', async () => {
  fake.analyze.mockRejectedValue({ code: 'usage_limit', message: 'Limite de uso atingido.' });
  render(<AnalysisPanel {...props} />);
  await userEvent.click(screen.getByRole('button', { name: 'Analisar com IA' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Limite de uso atingido.');
  expect(screen.getByRole('button', { name: 'Analisar com IA' })).toBeEnabled();
  expect(fake.analyze).toHaveBeenCalledTimes(1);
});
