# Plano de Implementação: Multi-Chart, Tipos de Velas, Novos Indicadores e Ferramentas de Desenho

## 1. Visão Geral

Transformar o **CriptoVisualizer** em uma estação de análise técnica de nível profissional inspirada no TradingView, com suporte a múltiplos gráficos simultâneos (de 1x1 até 4x4), múltiplos tipos de visualização (Heikin-Ashi, Linha, Área, Barras), novos indicadores (Volume com MA, VWAP, SuperTrend/ATR, Estocástico) e desenho interativo de linhas na tela.

---

## 2. Fases de Execução

### Fase 1: Motor Multi-Chart & Layouts de Grade (1x1 até 4x4)
- **Backend Rust (`MarketHub`)**:
  - Evoluir de um único stream ativo para múltiplos streams identificados por ID (`HashMap<String, CancellationToken>`).
  - Suportar início e cancelamento granular de streams por painel.
- **Frontend State & Painéis**:
  - Estrutura `ChartPaneConfig`:
    ```ts
    interface ChartPaneConfig {
      id: string;
      symbol: string;
      interval: Interval;
      chartType: 'candles' | 'heikin_ashi' | 'area' | 'line' | 'bars';
    }
    ```
  - Layouts de grade CSS:
    - `1x1` (padrão)
    - `1x2` (2 colunas)
    - `2x1` (2 linhas)
    - `2x2` (grade de 4)
    - `1+2` (1 principal grande + 2 menores)
    - `3x3` (grade de 9)
    - `4x4` (grade de 16 para monitores grandes/ultrawide)
  - Painel Ativo (`activePaneId`):
    - O gráfico com foco selecionado alimenta o Order Book, Alarmes e a Análise por IA da direita.
    - Destaque visual sutil (borda azul/ícone de ativo) no gráfico selecionado.
  - Sincronização opcional de Crosshair (cursor sincronizado no tempo entre os gráficos).

---

### Fase 2: Tipos de Gráficos (Candles, Heikin-Ashi, Linha, Área, Barras)
- **Algoritmo Heikin-Ashi**:
  - `haClose = (Open + High + Low + Close) / 4`
  - `haOpen = (haOpen_prev + haClose_prev) / 2`
  - `haHigh = max(High, haOpen, haClose)`
  - `haLow = min(Low, haOpen, haClose)`
- **Séries do Lightweight Charts**:
  - Suporte a `CandlestickSeries`, `BarSeries`, `AreaSeries`, `LineSeries`.
  - Seletor de tipo de gráfico rápido na barra superior de cada painel.

---

### Fase 3: Novos Indicadores Técnicos
- **Volume Profile & Histogram**:
  - Barras de volume coloridas (verde para alta, vermelho para baixa) no rodapé do gráfico com linha de média móvel de volume (Volume SMA 20).
- **VWAP (Volume Weighted Average Price)**:
  - Preço médio ponderado por volume diário intraday.
- **SuperTrend / ATR (Average True Range)**:
  - Faixa dinâmica de tendência com coloração de compra/venda.
- **Oscilador Estocástico (%K, %D)**:
  - Painel oscilador inferior complementar ao RSI e MACD.

---

### Fase 4: Ferramentas de Desenho (Estilo TradingView)
- **Toolbar Lateral de Desenho**:
  - 📏 Cursor / Seleção
  - ↗️ Linha de Tendência (Trendline)
  - ➖ Linha Horizontal (Suporte e Resistência com exibição de preço)
  - ⏐ Linha Vertical (Marcação de tempo/evento)
  - 📐 Régua de Variação (% e $ entre dois pontos clicados)
  - 🗑️ Apagar desenho selecionado / Limpar todos
- **Camada de Desenho (Canvas Overlay)**:
  - Canvas interativo sincronizado com as coordenadas de preço/tempo do Lightweight Charts.
  - Persistência dos traçados por símbolo no `localStorage`.

---

## 3. Próximo Passo Imediato
Iniciar a **Fase 1**: atualizar o `MarketHub` no Rust para suportar múltiplos streams simultâneos e criar o seletor de grid e os componentes de painéis no frontend.
