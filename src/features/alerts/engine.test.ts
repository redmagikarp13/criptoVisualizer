import { describe, expect, it } from 'vitest';
import { evaluate, toRuntime, type AlertRuntime } from './engine';
import type { Quote } from '../../lib/types';

const quote = (price: number, time = 1000): Quote => ({ symbol: 'BTCUSDT', price, change24h: 0, time, receivedAt: time, exchange: 'binance' });
const above = (price: number, over: Partial<AlertRuntime> = {}): AlertRuntime => toRuntime({ id: 'a', symbol: 'BTCUSDT', direction: 'above', price, enabled: true, ...over });

describe('motor de alarmes', () => {
  it('não dispara na primeira cotação; apenas classifica o estado inicial', () => {
    const armed = evaluate([above(100)], { BTCUSDT: quote(90) }, 1500);
    expect(armed.fired).toHaveLength(0);
    expect(armed.alerts[0].state).toBe('armed');
    const waiting = evaluate([above(100)], { BTCUSDT: quote(110) }, 1500);
    expect(waiting.fired).toHaveLength(0);
    expect(waiting.alerts[0].state).toBe('waiting');
  });
  it('dispara ao cruzar para cima e uma única vez', () => {
    const state = evaluate([above(100)], { BTCUSDT: quote(90) }, 1500).alerts;
    const fire = evaluate(state, { BTCUSDT: quote(101) }, 1600);
    expect(fire.fired).toHaveLength(1);
    expect(fire.alerts[0].state).toBe('waiting');
    // Permanece acima: não re-dispara sem voltar abaixo da margem.
    const again = evaluate(fire.alerts, { BTCUSDT: quote(105) }, 1700);
    expect(again.fired).toHaveLength(0);
  });
  it('rearma após recuar além da histerese e dispara de novo', () => {
    let state = evaluate([above(100)], { BTCUSDT: quote(90) }, 1500).alerts;
    state = evaluate(state, { BTCUSDT: quote(101) }, 1600).alerts; // dispara -> waiting
    state = evaluate(state, { BTCUSDT: quote(99.95) }, 1700).alerts; // acima de 99.9 -> ainda waiting
    expect(state[0].state).toBe('waiting');
    state = evaluate(state, { BTCUSDT: quote(99) }, 1800).alerts; // recuou -> armed
    expect(state[0].state).toBe('armed');
    const refire = evaluate(state, { BTCUSDT: quote(100.5) }, 1900);
    expect(refire.fired).toHaveLength(1);
  });
  it('espelha para "abaixo de X"', () => {
    const state = evaluate([above(100, { direction: 'below' })], { BTCUSDT: quote(110) }, 1500).alerts;
    expect(state[0].state).toBe('armed');
    const fire = evaluate(state, { BTCUSDT: quote(99) }, 1600);
    expect(fire.fired).toHaveLength(1);
  });
  it('ignora alarmes desativados e cotações antigas', () => {
    const disabled = evaluate([above(100, { enabled: false })], { BTCUSDT: quote(150) }, 1500);
    expect(disabled.fired).toHaveLength(0);
    const stale = evaluate([above(100)], { BTCUSDT: quote(90, 1000) }, 20_000);
    expect(stale.alerts[0].state).toBe('unseen');
  });
  it('dispara para "cross" quando cruza em qualquer direção', () => {
    const cross = toRuntime({ id: 'c', symbol: 'BTCUSDT', direction: 'cross', price: 100, enabled: true, mode: 'recurring' });
    const state = evaluate([cross], { BTCUSDT: quote(95) }, 1500).alerts;
    expect(state[0].state).toBe('armed');
    expect(state[0].lastSide).toBe('below');

    // Cruza para cima
    const fireUp = evaluate(state, { BTCUSDT: quote(102) }, 1600);
    expect(fireUp.fired).toHaveLength(1);
    expect(fireUp.alerts[0].state).toBe('waiting');
    expect(fireUp.alerts[0].enabled).toBe(true);

    // Rearma após afastar para cima
    const armedUp = evaluate(fireUp.alerts, { BTCUSDT: quote(102.5) }, 1700);
    expect(armedUp.alerts[0].state).toBe('armed');

    // Cruza de volta para baixo
    const fireDown = evaluate(armedUp.alerts, { BTCUSDT: quote(98) }, 1800);
    expect(fireDown.fired).toHaveLength(1);
    expect(fireDown.alerts[0].lastSide).toBe('below');
  });
  it('desativa alarme de disparo único (mode: once)', () => {
    const once = toRuntime({ id: 'o', symbol: 'BTCUSDT', direction: 'above', price: 100, enabled: true, mode: 'once' });
    const state = evaluate([once], { BTCUSDT: quote(90) }, 1500).alerts;
    const fire = evaluate(state, { BTCUSDT: quote(105) }, 1600);
    expect(fire.fired).toHaveLength(1);
    expect(fire.alerts[0].enabled).toBe(false);
  });
});
