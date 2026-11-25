import React, { ComponentType, lazy } from 'react';
import { recordBootError, recordBootWarning } from './diagnostics';

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  chunkLabel: string,
  maxRetries = 3
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        return await factory();
      } catch (err) {
        lastError = err;
        const msg = (err as Error)?.message || String(err);
        if (attempt < maxRetries) {
          recordBootWarning(
            `Falha temporária ao carregar ${chunkLabel} (tentativa ${attempt}/${maxRetries}): ${msg}`
          );
          await waitMs(450 * attempt);
        } else {
          recordBootError(
            `Falha persistente ao carregar módulo ${chunkLabel} após ${maxRetries} tentativas: ${msg}`
          );
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(`Falha ao carregar ${chunkLabel}`);
  });
}

interface ChunkBoundaryProps {
  children: React.ReactNode;
  fallbackLabel?: string;
  overlay?: boolean;
  onDismiss?: () => void;
  onRetry?: () => void;
}

interface ChunkBoundaryState {
  hasError: boolean;
  errorMessage: string;
  retryKey: number;
}

export class ChunkErrorBoundary extends React.Component<ChunkBoundaryProps, ChunkBoundaryState> {
  constructor(props: ChunkBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
      retryKey: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ChunkBoundaryState> {
    return {
      hasError: true,
      errorMessage: error?.message || 'Erro ao carregar módulo da interface.',
    };
  }

  componentDidCatch(error: Error): void {
    recordBootError(`Erro no módulo da tela: ${error?.message || String(error)}`);
  }

  private handleRetry = (): void => {
    this.setState((prev) => ({
      hasError: false,
      errorMessage: '',
      retryKey: prev.retryKey + 1,
    }));
    if (this.props.onRetry) {
      this.props.onRetry();
    }
  };

  private handleDismiss = (): void => {
    this.setState({
      hasError: false,
      errorMessage: '',
    });
    if (this.props.onDismiss) {
      this.props.onDismiss();
    }
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      const card = (
        <div className="cockpit-modal rounded-2xl p-6 max-w-xl w-full mx-auto my-6 flex flex-col items-center text-center space-y-4">
          <div className="text-lg sm:text-xl font-black uppercase cockpit-text-primary">
            {this.props.fallbackLabel || 'Não foi possível abrir esta tela agora'}
          </div>
          <p className="text-sm font-semibold cockpit-text-secondary break-words max-w-md">
            O dispositivo demorou para carregar este módulo. Toque abaixo para tentar novamente sem reiniciar o app.
          </p>
          <div className="flex flex-wrap items-center justify-center cockpit-wrap-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="min-h-[48px] px-6 rounded-xl bg-[var(--accent)] text-[var(--accent-fg)] font-black text-base"
            >
              Tentar novamente
            </button>
            {this.props.onDismiss && (
              <button
                type="button"
                onClick={this.handleDismiss}
                className="cockpit-btn-secondary min-h-[48px] px-5 rounded-xl font-black text-base"
              >
                Fechar
              </button>
            )}
          </div>
        </div>
      );

      if (this.props.overlay) {
        return (
          <div
            className="fixed z-50 flex items-center justify-center bg-black/80 p-4"
            style={{ top: 0, right: 0, bottom: 0, left: 0 }}
          >
            {card}
          </div>
        );
      }

      return card;
    }

    return <React.Fragment key={this.state.retryKey}>{this.props.children}</React.Fragment>;
  }
}
