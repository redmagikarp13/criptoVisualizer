import { Component, type ErrorInfo, type ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { WidgetApp } from './app/WidgetApp';
import './app/styles.css';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled React Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0b0f19',
          color: '#f8fafc',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '2rem',
          textAlign: 'center'
        }}>
          <div style={{
            maxWidth: '560px',
            backgroundColor: '#151d30',
            border: '1px solid #dc2626',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
          }}>
            <h1 style={{ fontSize: '1.25rem', color: '#f87171', margin: '0 0 12px 0' }}>
              Erro ao Inicializar o CriptoVisualizer
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8', margin: '0 0 16px 0' }}>
              Ocorreu uma falha ao renderizar a interface gráfica:
            </p>
            <pre style={{
              backgroundColor: '#0b0f19',
              padding: '12px',
              borderRadius: '8px',
              color: '#fca5a5',
              fontSize: '0.75rem',
              overflowX: 'auto',
              textAlign: 'left',
              margin: '0 0 16px 0'
            }}>
              {this.state.error?.message || String(this.state.error)}
              {this.state.error?.stack && `\n\n${this.state.error.stack}`}
            </pre>
            <button
              onClick={() => window.location.reload()}
              style={{
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                padding: '8px 20px',
                borderRadius: '6px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Recarregar Aplicação
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const params = new URLSearchParams(window.location.search);
const isWidget = params.get('view') === 'widget';
if (isWidget) {
  document.documentElement.classList.add('is-widget');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {isWidget ? <WidgetApp /> : <App />}
    </ErrorBoundary>
  </StrictMode>
);

