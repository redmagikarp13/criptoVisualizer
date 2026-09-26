import { useEffect, useRef, useState } from 'react';
import { X, Bell, Trash2, Repeat, Zap } from 'lucide-react';
import type { AlertRuntime, AlertDirection, AlertMode } from './engine';
import type { AlertRule } from '../settings/preferences';
import type { Quote } from '../../lib/types';
import { pairLabel } from '../../lib/symbol';
import { createPortal } from 'react-dom';

const money = (value: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: value < 1 ? 8 : 2 }).format(value);
const toRule = (a: AlertRuntime): AlertRule => ({
  id: a.id,
  symbol: a.symbol,
  direction: a.direction,
  price: a.price,
  enabled: a.enabled,
  mode: a.mode ?? 'recurring',
});

const stateLabel: Record<AlertRuntime['state'], string> = {
  unseen: 'aguardando cotação',
  armed: 'armado',
  waiting: 'disparado, rearmando',
};

const directionLabel: Record<AlertDirection, string> = {
  above: 'acima de',
  below: 'abaixo de',
  cross: 'cruzando',
};

export function AlertsDialog({ alerts, quotes, currentSymbol, onSave, onClose, mode = 'native' }: {
  alerts: AlertRuntime[]; quotes: Record<string, Quote>; currentSymbol: string;
  onSave: (rules: AlertRule[]) => Promise<void>; onClose: () => void;
  mode?: 'native' | 'inline';
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [symbol, setSymbol] = useState(currentSymbol);
  const [direction, setDirection] = useState<AlertDirection>('above');
  const [alertMode, setMode] = useState<AlertMode>('recurring');
  const [price, setPrice] = useState(() => String(quotes[currentSymbol]?.price ?? ''));
  const [error, setError] = useState('');

  useEffect(() => { const el = dialog.current; if (el?.showModal) el.showModal(); else el?.setAttribute('open', ''); }, []);
  const commit = (next: AlertRuntime[]) => { setError(''); void onSave(next.map(toRule)); };

  const add = () => {
    const value = Number(price);
    if (!Number.isFinite(value) || value <= 0) { setError('Informe um preço alvo válido.'); return; }
    if (!alerts.every(a => !(a.symbol === symbol && a.direction === direction && a.price === value))) {
      setError('Já existe um alarme idêntico.');
      return;
    }
    commit([...alerts, {
      id: crypto.randomUUID(),
      symbol,
      direction,
      price: value,
      enabled: true,
      mode: alertMode,
      state: 'unseen',
    }]);
    setPrice(String(quotes[symbol]?.price ?? ''));
  };

  const presets = [
    { label: 'ENA Rompimento (≥ $0,274)', symbol: 'ENAUSDC', direction: 'above' as AlertDirection, price: 0.274 },
    { label: 'ENA Suporte 1 (≤ $0,250)', symbol: 'ENAUSDC', direction: 'below' as AlertDirection, price: 0.250 },
    { label: 'ENA Suporte Chave (≤ $0,230)', symbol: 'ENAUSDC', direction: 'below' as AlertDirection, price: 0.230 },
    { label: 'IOTA Rompimento (≥ $0,052)', symbol: 'IOTAUSDC', direction: 'above' as AlertDirection, price: 0.052 },
    { label: 'IOTA Suporte (≤ $0,046)', symbol: 'IOTAUSDC', direction: 'below' as AlertDirection, price: 0.046 },
  ];

  const applyPreset = (p: (typeof presets)[number]) => {
    setSymbol(p.symbol);
    setDirection(p.direction);
    setPrice(String(p.price));
  };

  const content = (
    <>
      <header className="panel-heading">
        <h2 id="alerts-title">Alarmes de preço</h2>
        <button type="button" className="icon-button" aria-label="Fechar alarmes" onClick={onClose}><X size={18} /></button>
      </header>
      <div className="settings-body">
        <p className="muted">
          Os alarmes disparam no cruzamento do limite com som interno e notificação nativa do macOS. Alarmes recorrentes permanecem ativos e rearmam após o movimento.
        </p>
        <div className="alert-presets" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px', alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: '11px' }}>Sugestões rápidas:</span>
          {presets.map(p => (
            <button
              key={p.label}
              type="button"
              className="text-button"
              style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border)' }}
              onClick={() => applyPreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="alert-form-widget" role="group" aria-label="Novo alarme">
          <label>Par
            <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} maxLength={24} spellCheck={false} />
          </label>
          <label>Condição
            <select value={direction} onChange={e => setDirection(e.target.value as AlertDirection)}>
              <option value="above">Cruzar para cima (≥)</option>
              <option value="below">Cruzar para baixo (≤)</option>
              <option value="cross">Qualquer cruzamento</option>
            </select>
          </label>
          <label>Comportamento
            <select value={alertMode} onChange={e => setMode(e.target.value as AlertMode)}>
              <option value="recurring">Recorrente (Não desativar)</option>
              <option value="once">Disparo único (Desativar)</option>
            </select>
          </label>
          <label>Preço alvo
            <input type="number" min="0" step="any" value={price} onChange={e => setPrice(e.target.value)} />
          </label>
          <button className="primary" type="button" onClick={add}><Bell size={15} /> Adicionar</button>
        </div>
        {error && <p role="alert" className="warning-text">{error}</p>}
        {alerts.length === 0 ? <p className="muted">Nenhum alarme criado.</p> : <ul className="alert-list">
          {alerts.map(alert => {
            const quote = quotes[alert.symbol];
            const isRecurring = alert.mode !== 'once';
            return <li key={alert.id}>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={alert.enabled}
                  onChange={e => commit(alerts.map(a => a.id === alert.id ? { ...a, enabled: e.target.checked } : a))}
                />
                <span>
                  <strong>{pairLabel(alert.symbol)}</strong> · {directionLabel[alert.direction]} {money(alert.price)}
                  <small className="alert-mode-badge" title={isRecurring ? 'Alarme recorrente' : 'Disparo único'}>
                    {isRecurring ? <Repeat size={11} aria-hidden="true" /> : <Zap size={11} aria-hidden="true" />}
                    {isRecurring ? 'Recorrente' : 'Único'}
                  </small>
                </span>
              </label>
              <span className="alert-meta muted">
                {quote ? `atual ${money(quote.price)}` : 'sem cotação'} · {alert.enabled ? stateLabel[alert.state] : 'pausado'}
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label="Remover alarme"
                onClick={() => commit(alerts.filter(a => a.id !== alert.id))}
              >
                <Trash2 size={15} />
              </button>
            </li>;
          })}
        </ul>}
      </div>
      <footer className="dialog-footer"><button type="button" onClick={onClose}>Fechar</button></footer>
    </>
  );

  if (mode === 'inline') {
    return createPortal(
      <div
        className="widget-alerts-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="alerts-title"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="widget-alerts-panel">
          {content}
        </div>
      </div>,
      document.body
    );
  }

  return <dialog ref={dialog} className="settings-dialog" aria-labelledby="alerts-title" onClose={onClose}>
    <div>
      {content}
    </div>
  </dialog>;
}
