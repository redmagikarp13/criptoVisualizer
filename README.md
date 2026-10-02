# CriptoVisualizer 🚀

**CriptoVisualizer** é uma estação desktop nativa desenvolvida com **Tauri v2 (Rust)** e **React 19 (TypeScript)** para monitoramento e análise técnica do mercado financeiro em tempo real. Oferece visualização gráfica profissional de candles, livro de ordens em tempo real com radar algorítmico de bots e detecção de manipulação (*spoofing* / *wall-capping*), dados de derivativos (*Funding Rate*, *L/S Ratio*, *Open Interest*), acompanhamento de ações da B3 e um widget dinâmico para a barra de menus do macOS.

<p align="center">
  <img src="docs/screenshots/dashboard_dark.png" alt="CriptoVisualizer - Dashboard Principal" width="100%" />
</p>
<p align="center">
  <em>Dashboard principal em modo escuro com gráficos de candles, indicadores técnicos, detecção automática de linhas de tendência (LTA/LTB), radar de robôs e manipuladores, livro de ofertas e alertas de preço em tempo real.</em>
</p>

> 📖 **Guia Completo:** Para um detalhamento visual completo de cada elemento da interface, consulte o [Manual Visual de Interface](docs/INTERFACE.md).

---

## ✨ Recursos em Destaque

### 📊 Gráficos Profissionais em Tempo Real & Análise Técnica
- **Engine Gráfica de Alta Performance:** Integração nativa e de baixa latência com a API Spot da Binance utilizando *TradingView Lightweight Charts v5*.
- **Indicadores Técnicos Integrados:** Médias Móveis (SMA 20, EMA rápida/lenta 20/50), Bandas de Bollinger, RSI 14, MACD, Volume com SMA 20, VWAP intraday, SuperTrend dinâmico e Oscilador Estocástico.
- **Detecção Algorítmica de Linhas de Tendência:** Traçados automáticos de LTA (verde) e LTB (vermelho).
- **Ferramentas de Desenho Interativo:** Cursor de precisão, retas de tendência (*trendlines*), linhas horizontais de suporte/resistência, marcações verticais temporais e réguas de medição de variação percentual.
- **Multi-Chart Grid:** Alterne com um clique entre grades de visualização `1x1`, `1x2`, `2x1`, `2x2`, `1+2`, `3x3` e `4x4`, com sincronização opcional de zoom e tempo entre os gráficos.
- **Contagem Regressiva de Vela:** Cronômetro dinâmico exibindo com precisão o tempo restante para o fechamento do candle no timeframe ativo.

<p align="center">
  <img src="docs/screenshots/chart_indicators.png" alt="Gráficos, Indicadores e Ferramentas de Desenho" width="90%" />
</p>

---

### 🤖 Radar de Bots, Manipulação e Livro de Ofertas
- **Livro de Ofertas em Tempo Real:** Profundidade visual com cotações da Binance, OKX, Bybit e modo consolidado.
- **Detecção Ativa de Spoofing:** Notificação visual em tempo real alertando quando grandes paredes de ordens são canceladas abruptamente antes da execução.
- **Detecção de Wall-Capping (Teto Sufocador):** Identifica barreiras pesadas de robôs bloqueando avanços de preço e forçando o mercado para baixo.
- **Suporte e Barreira MM:** Cálculo em tempo real dos níveis de liquidez institucional e monitoramento do tempo de consolidação da barreira.
- **Pressão do Livro e Disputa nas Médias:** Indicador instantâneo e histórico de desequilíbrio de liquidez (*Order Book Imbalance*) e pontuação de pressão direcional algorítmica.

<p align="center">
  <img src="docs/screenshots/bot_radar_sidebar.png" alt="Radar de Bots & MMs e Livro de Ofertas" width="46%" />
</p>

---

### ⚡ Widget de Barra de Menus (macOS Menubar)
- **Acesso Ultrarrápido:** Popover compacto e flutuante acessível diretamente pelo ícone da barra de tarefas do macOS.
- **Cotação em Tempo Real na Barra de Menus:** Exibição do ticker e variação percentual contínua (ex: `ENA $0,2651 (+7.6%)`).
- **Análise Sem Distrações:** Minigráfico interativo com seleção rápida de tempos gráficos, indicadores essenciais e botão para expandir para o observatório completo instantaneamente.

<p align="center">
  <img src="docs/screenshots/widget_popover.png" alt="Widget de Barra de Menus macOS" width="40%" />
</p>

---

### 🧠 Inteligência Artificial (OpenAI API & CLIs Locais)
- **Múltiplos Provedores de IA:** Conexão direta com a **OpenAI API** (GPT-4o, GPT-4o-mini, o3-mini, o1 ou endpoints customizados) com saída JSON estruturada, além dos agentes locais via linha de comando (**Antigravity CLI** e **Qoder CLI**).
- **Análise Contextual Multidimensional:** A IA avalia simultaneamente histórico de candles, osciladores técnicos, posicionamento de mercado futuro (*Funding Rate* e *Open Interest*) e taxa de desbloqueio de tokens (*Tokenomics*).
- **Sem Exposição de Dados Privados:** Envio apenas do snapshot técnico estruturado do gráfico ativo, sem telemetria e com chave de API armazenada de forma segura na máquina.

<p align="center">
  <img src="docs/screenshots/ai_analysis_panel.png" alt="Painel de Análise por Inteligência Artificial" width="40%" />
</p>

---

### 🪙 Tokenomics & Desbloqueios de Tokens (Unlocks)
- **Monitoramento de Inflação & Diluição:** Acompanhamento da proporção entre supply circulante vs. supply bloqueado em contratos de vesting.
- **Contagem Regressiva de Cliffs:** Alerta sobre datas e quantidade de tokens previstos para o próximo destravamento de mercado.
- **Classificação de Risco Dinâmico:** Tags de risco (`Baixo`, `Moderado` ou `Crítico`) integradas ao cabeçalho do gráfico e ao painel lateral.

---

### 🇧🇷 Ações da B3, 📈 Derivativos e 🔔 Alertas
- **Mercado Brasileiro (B3):** Acompanhamento de ações nacionais (ex: PETR4, VALE3, ITUB4, BBAS3) via API Brapi, com cotação atual, fechamento anterior, variação percentual e volume financeiro.
- **Monitoramento de Futuros e Derivativos:** Indicadores de *Funding Rate*, razão *Long/Short (L/S)* e *Open Interest (OI)* para contextualizar o posicionamento do mercado futuro.
- **Sistema de Alarmes de Preço:** Configure alertas para metas acima, abaixo ou no cruzamento de valores, com notificações nativas do sistema e avisos flutuantes (*toasts*).
- **Privacidade & Segurança:** Sem necessidade de cadastro, sem telemetria pessoal, credenciais e configurações salvas exclusivamente de forma local no seu computador.

---

## 🛠️ Tecnologias

- **Backend Desktop:** [Tauri v2](https://tauri.app/) (Rust)
- **Frontend:** [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/)
- **Gráficos:** [Lightweight Charts v5](https://tradingview.github.io/lightweight-charts/)
- **Ícones & Estilo:** [Lucide React](https://lucide.dev/), Vanilla CSS com temas Claro e Escuro
- **Validação:** [Zod v4](https://zod.dev/)

---

## 🚀 Como Executar

### Pré-requisitos
- [Node.js](https://nodejs.org/) (v18+)
- [Rust & Cargo](https://rustup.rs/) (1.85+)

### Instalação

```bash
# Instalar dependências do frontend
npm install
```

### Desenvolvimento

```bash
# Executar em modo desenvolvimento (Hot reload React + Tauri)
npm run tauri dev
```

### Testes e Validação

```bash
# Testes do backend Rust
cargo test --manifest-path src-tauri/Cargo.toml

# Verificação de tipos TypeScript
npm run typecheck
```

### Build de Produção

```bash
# Gerar executável e pacote (.dmg / .app / .exe)
npm run tauri build -- --no-sign
```

---

## 📄 Licença

Este projeto é disponibilizado sob a licença MIT. Consulte o arquivo [LICENSE](LICENSE) para mais detalhes.

