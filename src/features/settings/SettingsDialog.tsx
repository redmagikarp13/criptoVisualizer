import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import chartLicense from '../../../node_modules/lightweight-charts/LICENSE?raw';
import { preferencesSchema, type Preferences } from './preferences';
import { errorMessage, type CliStatus } from '../../lib/types';

export function SettingsDialog({ preferences, statuses, onSave, onClose }: { preferences: Preferences; statuses: CliStatus[]; onSave: (value: Preferences) => Promise<void>; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(() => structuredClone(preferences));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    if (element?.showModal) element.showModal(); else element?.setAttribute('open', '');
    return () => previous?.focus();
  }, []);
  const field = <K extends keyof Preferences>(key: K, value: Preferences[K]) => setDraft(current => ({ ...current, [key]: value }));
  return <dialog ref={dialog} className="settings-dialog" aria-labelledby="settings-title" onCancel={onClose}>
    <form onSubmit={async event => {
      event.preventDefault(); setError('');
      const result = preferencesSchema.safeParse(draft);
      if (!result.success) { setError('Confira os períodos (2 a 200), caminhos e nomes dos modelos.'); return; }
      setSaving(true);
      try { await onSave(result.data); onClose(); } catch (cause) { setError(errorMessage(cause)); } finally { setSaving(false); }
    }}>
      <header className="panel-heading"><h2 id="settings-title">Configurações</h2><button type="button" className="icon-button" aria-label="Fechar configurações" onClick={onClose}><X size={18} /></button></header>
      <div className="settings-body">
        <label>Tema<select value={draft.theme} onChange={e => field('theme', e.target.value as Preferences['theme'])}><option value="system">Acompanhar sistema</option><option value="light">Claro</option><option value="dark">Escuro</option></select></label>
        <fieldset><legend>Períodos das médias</legend><div className="form-columns">{(['smaPeriod', 'emaFastPeriod', 'emaSlowPeriod'] as const).map((key, index) => <label key={key}>{['SMA', 'EMA rápida', 'EMA lenta'][index]}<input type="number" min={2} max={200} required value={draft.indicators[key]} onChange={e => field('indicators', { ...draft.indicators, [key]: Number(e.target.value) })} /></label>)}</div></fieldset>
        <fieldset><legend>Agentes de análise</legend><p className="muted">Use uma CLI local ou conecte diretamente via chave de API da OpenAI. Cada análise consome sua cota pessoal.</p>
          <label>Agente padrão<select value={draft.agent} onChange={e => field('agent', e.target.value as Preferences['agent'])}><option value="qoder">Qoder CLI</option><option value="antigravity" disabled={!draft.antigravityEnabled}>Antigravity CLI</option><option value="openai">OpenAI API (Direto)</option></select></label>
          <h3>OpenAI API</h3>
          <p className="muted">Análise de mercado direta via API da OpenAI sem necessidade de CLI local instalada.</p>
          <label>API Key da OpenAI<input type="password" value={draft.openaiApiKey} onChange={e => field('openaiApiKey', e.target.value)} placeholder="sk-proj-..." maxLength={256} spellCheck={false} /></label>
          <label>Modelo OpenAI<input value={draft.openaiModel} onChange={e => field('openaiModel', e.target.value)} placeholder="gpt-4o-mini ou gpt-4o" maxLength={100} spellCheck={false} /></label>
          <label>Base URL Customizada (opcional)<input value={draft.openaiBaseUrl} onChange={e => field('openaiBaseUrl', e.target.value)} placeholder="https://api.openai.com/v1 (ou proxy compatível)" maxLength={256} spellCheck={false} /></label>
          <h3>Qoder CLI</h3><p className="muted">{statuses.find(s => s.agent === 'qoder')?.message ?? 'Verificando disponibilidade…'}</p>
          <label>Executável Qoder<input value={draft.qoderPath} onChange={e => field('qoderPath', e.target.value)} placeholder="Detecção automática ou caminho completo" maxLength={1024} spellCheck={false} /></label>
          <label>Modelo Qoder (opcional)<input value={draft.qoderModel} onChange={e => field('qoderModel', e.target.value)} placeholder="Padrão da CLI" maxLength={100} spellCheck={false} /></label>
          <h3>Antigravity CLI</h3><p className="warning-text" id="agy-warning">A CLI herda suas permissões pessoais e não garante isolamento completo. Ferramentas, MCPs e hooks pessoais podem continuar ativos. A pasta de trabalho dedicada não é uma sandbox de segurança.</p>
          <label className="check-label"><input type="checkbox" checked={draft.antigravityEnabled} aria-describedby="agy-warning" onChange={e => setDraft(current => ({ ...current, antigravityEnabled: e.target.checked, agent: e.target.checked ? current.agent : 'qoder' }))} />Habilitar Antigravity — li e aceito o aviso</label>
          <p className="muted">{statuses.find(s => s.agent === 'antigravity')?.message}</p>
          <label>Executável Antigravity<input value={draft.antigravityPath} onChange={e => field('antigravityPath', e.target.value)} placeholder="Detecção automática ou caminho completo" maxLength={1024} spellCheck={false} /></label>
          <label>Modelo Antigravity (opcional)<input value={draft.antigravityModel} onChange={e => field('antigravityModel', e.target.value)} placeholder="Padrão da CLI" maxLength={100} spellCheck={false} /></label>
        </fieldset>
        <fieldset><legend>Licenças e atribuição</legend>
          <p>TradingView Lightweight Charts™<br />Copyright (с) 2025 TradingView, Inc. <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView</a></p>
          <details><summary>Licença Apache 2.0 da biblioteca de gráficos</summary><pre className="license-text">{chartLicense}</pre></details>
          <p>Inclui partes de tslib, © Microsoft Corporation, sob BSD Zero Clause.</p>
        </fieldset>
        {error && <p role="alert" className="warning-text">{error}</p>}
      </div>
      <footer className="dialog-footer"><button type="button" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving} type="submit">{saving ? 'Salvando…' : 'Salvar configurações'}</button></footer>
    </form>
  </dialog>;
}
