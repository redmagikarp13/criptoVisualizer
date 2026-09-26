import { useEffect, useMemo, useState } from 'react';
import { desktop } from '../../lib/desktop';
import { errorMessage, type Instrument, type Interval } from '../../lib/types';
import { applyMarketEvent, initialMarketState } from './state';

export function useMarket(symbol: string, interval: Interval, favorites: string[], enabled: boolean) {
  const [state, setState] = useState(() => initialMarketState(''));
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [retry, setRetry] = useState(0);
  const favoriteKey = favorites.join(',');
  const selectionKey = `${symbol}:${interval}:${favoriteKey}:${enabled}:${retry}`;
  const selection = useMemo(() => initialMarketState(selectionKey), [selectionKey]);
  useEffect(() => {
    let active = true;
    desktop.listInstruments().then(result => { if (active) { setInstruments(result); setCatalogError(''); } })
      .catch(error => { if (active) setCatalogError(errorMessage(error)); });
    return () => { active = false; };
  }, [retry]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const id = crypto.randomUUID();
    let unlisten: (() => void) | undefined;
    let pending = initialMarketState(id);
    let dirty = false;
    const flush = () => { setState({ ...pending, id: selection.id }); dirty = false; };
    flush();
    const timer = window.setInterval(() => { if (dirty) flush(); }, 100);
    desktop.subscribeMarket({ id, symbol, interval, favorites: favoriteKey ? favoriteKey.split(',') : [] }, event => {
      if (event.id !== id || controller.signal.aborted) return;
      // O reducer mantém uma janela limitada, mesmo se o WebView suspender os timers.
      pending = applyMarketEvent(pending, event); dirty = true;
    }, controller.signal).then(cleanup => {
      if (controller.signal.aborted) cleanup(); else unlisten = cleanup;
    }).catch(error => {
      if (!controller.signal.aborted) {
        pending = { ...pending, binanceStatus: 'error', binanceMessage: errorMessage(error) }; flush();
      }
    });
    return () => { controller.abort(); clearInterval(timer); unlisten?.(); };
  }, [symbol, interval, favoriteKey, enabled, selection]);
  return { ...(enabled && state.id === selection.id ? state : selection), instruments, catalogError, reconnect: () => setRetry(value => value + 1) };
}
