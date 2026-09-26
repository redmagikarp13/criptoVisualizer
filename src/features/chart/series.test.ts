import { expect, it } from 'vitest';
import { seriesPatch } from './series';

it('carrega o histórico inicialmente e limpa a série ao trocar seleção', () => {
  expect(seriesPatch([], [{ time: 1, value: 10 }])).toEqual({ reset: true, data: [{ time: 1, value: 10 }] });
  expect(seriesPatch([{ time: 1, value: 10 }], [])).toEqual({ reset: true, data: [] });
});
it('atualiza só o candle corrente e acrescenta os novos sem reiniciar zoom', () => {
  const previous = [{ time: 1, value: 10 }, { time: 2, value: 20 }];
  expect(seriesPatch(previous, [{ time: 1, value: 10 }, { time: 2, value: 21 }, { time: 3, value: 22 }]))
    .toEqual({ reset: false, data: [{ time: 2, value: 21 }, { time: 3, value: 22 }] });
  expect(seriesPatch(previous, previous)).toEqual({ reset: false, data: [] });
});
it('recarrega em correções históricas e na rolagem da janela limitada', () => {
  const previous = [{ time: 1, value: 10 }, { time: 2, value: 20 }];
  expect(seriesPatch(previous, [{ time: 1, value: 11 }, { time: 2, value: 20 }]).reset).toBe(true);
  expect(seriesPatch(previous, [{ time: 2, value: 20 }, { time: 3, value: 30 }]).reset).toBe(true);
});
