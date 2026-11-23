import React from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Service Worker only for Web/PWA; native Capacitor WebView serves bundled assets directly
const isCapacitorNative = Boolean(
  (window as unknown as {Capacitor?: {isNativePlatform?: () => boolean}}).Capacitor?.isNativePlatform?.()
);

if (!isCapacitorNative && 'serviceWorker' in navigator) {
  try {
    registerSW({immediate: true});
  } catch (err) {
    console.warn('SW registration skipped:', err);
  }
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMsg: string;
}

class AppErrorBoundary extends React.Component<{children: React.ReactNode}, ErrorBoundaryState> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = {hasError: false, errorMsg: ''};
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {hasError: true, errorMsg: error?.message || 'Erro inesperado ao renderizar o app'};
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
          <h1 style={{fontSize: '24px', fontWeight: 900, margin: 0}}>CAR CONTROL</h1>
          <p style={{fontSize: '16px', color: '#fca5a5', marginTop: '12px', maxWidth: '520px'}}>
            {this.state.errorMsg}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: '20px',
              minHeight: '56px',
              padding: '0 24px',
              borderRadius: '14px',
              background: '#1d4ed8',
              color: '#ffffff',
              fontSize: '16px',
              fontWeight: 800,
              border: 'none',
            }}
          >
            Recarregar Aplicativo
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
