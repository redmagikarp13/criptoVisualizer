import { useEffect, useRef, useState } from 'react';
import type { Quote } from '../../lib/types';
import type { AlertRule } from '../settings/preferences';
import { evaluate, toRuntime, type AlertRuntime } from './engine';
import { desktop } from '../../lib/desktop';
import { pairLabel } from '../../lib/symbol';

const formatNum = (val: number) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: val < 1 ? 8 : 2 }).format(val);

// Mantém o estado em memória dos alarmes sincronizado com as regras persistidas e
// avalia cada atualização de cotação, acumulando os que dispararam e notificando o sistema.
export function useAlerts(
  rules: AlertRule[],
  quotes: Record<string, Quote>,
  onDisable?: (id: string) => void
) {
  const runtime = useRef<AlertRuntime[]>(rules.map(toRuntime));
  const [snapshot, setSnapshot] = useState<AlertRuntime[]>(runtime.current);
  const [fired, setFired] = useState<AlertRuntime[]>([]);

  const onDisableRef = useRef(onDisable);
  onDisableRef.current = onDisable;

  useEffect(() => {
    const previous = new Map(runtime.current.map(a => [a.id, a]));
    runtime.current = rules.map(rule => {
      const existing = previous.get(rule.id);
      const same =
        existing &&
        existing.symbol === rule.symbol &&
        existing.direction === rule.direction &&
        existing.price === rule.price &&
        (existing.mode ?? 'recurring') === (rule.mode ?? 'recurring');
      return same ? { ...existing!, enabled: rule.enabled, mode: rule.mode ?? 'recurring' } : toRuntime(rule);
    });
    setSnapshot(runtime.current);
  }, [rules]);

  useEffect(() => {
    const result = evaluate(runtime.current, quotes, Date.now());
    runtime.current = result.alerts;
    setSnapshot(result.alerts);

    if (result.fired.length) {
      setFired(current => {
        const firedIds = new Set(result.fired.map(f => f.id));
        return [...result.fired, ...current.filter(c => !firedIds.has(c.id))].slice(0, 5);
      });

      beep();

      for (const alert of result.fired) {
        const quote = quotes[alert.symbol];
        const dirText =
          alert.direction === 'above'
            ? 'cruzou acima de'
            : alert.direction === 'below'
            ? 'cruzou abaixo de'
            : 'cruzou o limite de';

        const title = `Alarme: ${pairLabel(alert.symbol)}`;
        const body = `${pairLabel(alert.symbol)} ${dirText} ${formatNum(alert.price)}${
          quote ? ` · Cotação atual: ${formatNum(quote.price)}` : ''
        }`;

        void desktop.notify(title, body);

        if (alert.mode === 'once') {
          onDisableRef.current?.(alert.id);
        }
      }
    }
  }, [quotes]);

  return {
    alerts: snapshot,
    fired,
    dismiss: (id: string) => setFired(current => current.filter(a => a.id !== id)),
  };
}

let audio: AudioContext | undefined;
function beep() {
  try {
    audio ??= new AudioContext();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.connect(gain); gain.connect(audio.destination);
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, audio.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.35);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.36);
  } catch { /* áudio indisponível: o aviso visual ainda aparece */ }
}
