import type { Quote } from '../../lib/types';

export type AlertDirection = 'above' | 'below' | 'cross';
export type AlertMode = 'once' | 'recurring';

export interface AlertRule {
  id: string;
  symbol: string;
  direction: AlertDirection;
  price: number;
  enabled: boolean;
  mode?: AlertMode;
}

// Estado em memória: 'unseen' até ver a primeira cotação; 'armed' pronto para disparar;
// 'waiting' já disparou e aguarda o preço voltar para além da margem antes de rearmer.
export type AlertState = 'unseen' | 'armed' | 'waiting';
export interface AlertRuntime extends AlertRule {
  state: AlertState;
  lastSide?: 'above' | 'below';
  lastFired?: number;
}

// Margem de rearme: o preço precisa voltar 0,1% além do limite para rearmer, evitando
// re-disparo quando oscila exatamente na linha.
export const HYSTERESIS = 0.001;
const FRESH_MS = 10_000;
export const COOLDOWN_MS = 15_000;

export function toRuntime(rule: AlertRule): AlertRuntime {
  return { ...rule, mode: rule.mode ?? 'recurring', state: 'unseen' };
}

// Avalia as cotações atuais e devolve o novo estado dos alarmes e os que dispararam agora.
export function evaluate(alerts: AlertRuntime[], quotes: Record<string, Quote>, now: number): { alerts: AlertRuntime[]; fired: AlertRuntime[] } {
  const fired: AlertRuntime[] = [];
  const next = alerts.map((alert): AlertRuntime => {
    if (!alert.enabled) return alert.state === 'unseen' ? alert : { ...alert, state: 'unseen' as AlertState };
    const quote = quotes[alert.symbol];
    if (!quote || !Number.isFinite(quote.price) || quote.price <= 0 || now - quote.time > FRESH_MS || quote.time - now > 2_000) return alert;
    
    const price = quote.price;
    const threshold = alert.price;
    const mode = alert.mode ?? 'recurring';

    if (alert.state === 'unseen') {
      const currentSide = price >= threshold ? 'above' : 'below';
      if (alert.direction === 'cross') {
        return { ...alert, state: 'armed', lastSide: currentSide };
      }
      const armed = alert.direction === 'above' ? price < threshold : price > threshold;
      return { ...alert, state: armed ? 'armed' : 'waiting', lastSide: currentSide };
    }

    if (alert.state === 'armed') {
      let crossed = false;
      if (alert.direction === 'above') {
        crossed = price >= threshold;
      } else if (alert.direction === 'below') {
        crossed = price <= threshold;
      } else if (alert.direction === 'cross') {
        const side = price >= threshold ? 'above' : 'below';
        crossed = Boolean(alert.lastSide && alert.lastSide !== side);
      }

      if (!crossed) return alert;

      const newSide = price >= threshold ? 'above' : 'below';
      const isOneTime = mode === 'once';
      const result: AlertRuntime = {
        ...alert,
        enabled: isOneTime ? false : alert.enabled,
        state: 'waiting',
        lastSide: newSide,
        lastFired: now,
      };
      fired.push(result);
      return result;
    }

    // Se estiver em 'waiting' e for de disparo único, permanece desativado até nova intervenção
    if (mode === 'once' && !alert.enabled) {
      return alert;
    }

    // 'waiting' no modo recorrente: rearma somente depois de o preço voltar além da margem de histerese
    let reset = false;
    if (alert.direction === 'above') {
      reset = price < threshold * (1 - HYSTERESIS);
    } else if (alert.direction === 'below') {
      reset = price > threshold * (1 + HYSTERESIS);
    } else if (alert.direction === 'cross') {
      // Para 'cross', confirma que o preço se afastou além da margem para o lado atual antes de armar para um novo cruzamento
      if (alert.lastSide === 'above') {
        reset = price > threshold * (1 + HYSTERESIS);
      } else {
        reset = price < threshold * (1 - HYSTERESIS);
      }
    }

    if (reset) {
      const currentSide = price >= threshold ? 'above' : 'below';
      return { ...alert, state: 'armed', lastSide: currentSide };
    }

    return alert;
  });

  return { alerts: next, fired };
}
