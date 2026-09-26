# CriptoVisualizer 🚀

**CriptoVisualizer** é uma aplicação desktop nativa desenvolvida com **Tauri (Rust)** e **React (TypeScript)** para monitoramento e análise de mercado financeiro em tempo real. Oferece visualização profissional de candles, livro de ordens com detector algorítmico de bots, cotações de ações brasileiras (B3) e um widget compacto para a barra de menus do macOS.

---

## ✨ Recursos

- 📊 **Gráficos em Tempo Real:** Integração nativa com a API de Spot da Binance usando *TradingView Lightweight Charts*.
- 🤖 **Detector de Manipulação e Bots:** Análise em tempo real do livro de ordens (Order Book) identificando:
  - Ordens iceberg, spoofing e spread compression
  - Paredões de compra/venda e grandes ordens algorítmicas
  - Tendência de pressão direcional dos bots (alta/baixa)
- 🇧🇷 **Monitoramento de Ações da B3:** Acompanhamento de tickers brasileiros (ex: PETR4, VALE3, ITUB4, etc.) via API Brapi, com variação diária, fechamento anterior e volume.
- ⚡ **Widget de Barra de Menus (macOS):** Popover compacto e flutuante que abre diretamente abaixo do ícone da barra de tarefas, com atualização contínua de cotações, minigráfico e alarmes rápidos.
- 🔔 **Sistema de Alarmes de Preço:** Configure alertas para alvos acima, abaixo ou no cruzamento de valores específicos com notificações de sistema.
- 🧠 **Integração com CLIs de IA:** Suporte para geração de relatórios contextuais de mercado e leitura técnica através de agentes locais (Qoder CLI ou Antigravity CLI).
- 🔒 **Privacidade & Segurança:** Sem necessidade de cadastro, sem telemetria pessoal, credenciais e configurações salvas apenas localmente no dispositivo.

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

Este projeto é disponibilizado sob a licença MIT. Consulte o arquivo de licença para mais detalhes.
