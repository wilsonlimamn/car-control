import React from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';
import {
  detectAndApplyLowPerfMode,
  getDiagnosticText,
  markReactMounted,
  recordBootError,
  recordBootStep,
} from './utils/diagnostics';

recordBootStep('JS inicializado');
detectAndApplyLowPerfMode();

// Service Worker only for Web/PWA; native Capacitor WebView serves bundled assets directly
const isCapacitorNative = Boolean(
  (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
);

if (!isCapacitorNative && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  try {
    registerSW({ immediate: true });
  } catch (err) {
    console.warn('SW registration skipped:', err);
  }
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMsg: string;
  showDetails: boolean;
}

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMsg: '', showDetails: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    const msg = error?.message || 'Erro inesperado ao renderizar o app';
    recordBootError(msg);
    return { hasError: true, errorMsg: msg };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            background: '#0b1120',
            color: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            textAlign: 'center',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <h1 style={{ fontSize: '26px', fontWeight: 900, margin: 0 }}>CAR CONTROL</h1>
          <p
            style={{
              fontSize: '15px',
              color: '#fecaca',
              background: '#7f1d1d',
              border: '1px solid #ef4444',
              borderRadius: '12px',
              padding: '12px 16px',
              marginTop: '14px',
              maxWidth: '560px',
            }}
          >
            {this.state.errorMsg}
          </p>
          <div style={{ display: 'flex', marginTop: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                minHeight: '52px',
                padding: '0 22px',
                margin: '6px',
                borderRadius: '12px',
                background: '#1d4ed8',
                color: '#ffffff',
                fontSize: '16px',
                fontWeight: 800,
                border: 'none',
              }}
            >
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={() => this.setState((prev) => ({ showDetails: !prev.showDetails }))}
              style={{
                minHeight: '52px',
                padding: '0 22px',
                margin: '6px',
                borderRadius: '12px',
                background: '#334155',
                color: '#f8fafc',
                fontSize: '16px',
                fontWeight: 800,
                border: '1px solid #64748b',
              }}
            >
              Ver detalhes
            </button>
          </div>
          {this.state.showDetails && (
            <pre
              style={{
                marginTop: '14px',
                padding: '12px 16px',
                borderRadius: '12px',
                background: '#0f172a',
                color: '#cbd5e1',
                fontSize: '13px',
                maxWidth: '680px',
                width: '100%',
                textAlign: 'left',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                border: '1px solid #334155',
                maxHeight: '40vh',
                overflow: 'auto',
              }}
            >
              {getDiagnosticText(this.state.errorMsg)}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

recordBootStep('Montando casca React');
markReactMounted();
createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
