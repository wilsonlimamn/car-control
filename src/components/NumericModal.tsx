import React, { useState, useEffect } from 'react';
import { Delete, X, Check } from 'lucide-react';

interface NumericModalProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  initialValue: number;
  unit: string;
  allowDecimals?: boolean;
  quickAddOptions?: number[];
  maxLimit?: number;
  onConfirm: (val: number) => void;
  onClose: () => void;
}

export const NumericModal: React.FC<NumericModalProps> = ({
  isOpen,
  title,
  subtitle,
  initialValue,
  unit,
  allowDecimals = false,
  quickAddOptions,
  maxLimit,
  onConfirm,
  onClose,
}) => {
  const [valStr, setValStr] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setValStr(initialValue > 0 ? String(initialValue) : '');
    }
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const handleDigit = (digit: string) => {
    if (digit === '.') {
      if (!allowDecimals) return;
      if (valStr.includes('.')) return;
      setValStr((prev) => (prev === '' ? '0.' : prev + '.'));
      return;
    }
    if (valStr === '0' && digit !== '.') {
      setValStr(digit);
      return;
    }
    setValStr((prev) => prev + digit);
  };

  const handleBackspace = () => {
    setValStr((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setValStr('');
  };

  const handleQuickAdd = (amount: number) => {
    const currentNum = parseFloat(valStr) || 0;
    let next = currentNum + amount;
    if (maxLimit && next > maxLimit) next = maxLimit;
    setValStr(String(allowDecimals ? Math.round(next * 10) / 10 : Math.round(next)));
  };

  const handleConfirm = () => {
    const num = parseFloat(valStr);
    if (!isNaN(num)) {
      onConfirm(num);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key >= '0' && e.key <= '9') {
      handleDigit(e.key);
    } else if (e.key === '.' || e.key === ',') {
      handleDigit('.');
    } else if (e.key === 'Backspace') {
      handleBackspace();
    } else if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const displayNum = valStr === '' ? '0' : valStr;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="numeric-modal-title"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 bg-black/80 animate-in fade-in duration-150"
    >
      <div className="cockpit-numeric-card cockpit-modal rounded-3xl p-[clamp(12px,2dvh,20px)] shadow-2xl overflow-hidden">
        {/* Coluna Esquerda (Landscape) / Topo (Portrait) */}
        <div className="flex flex-col justify-between gap-[clamp(8px,1.5dvh,14px)] min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 pb-1.5 border-b cockpit-divider">
            <div className="min-w-0">
              <h3
                id="numeric-modal-title"
                className="text-[clamp(18px,3.2dvh,24px)] font-black tracking-tight cockpit-text-primary uppercase truncate"
              >
                {title}
              </h3>
              {subtitle && (
                <p className="text-[14px] cockpit-text-secondary font-bold mt-0.5 truncate">
                  {subtitle}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="cockpit-btn-secondary w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center transition-colors focus-visible:outline-3 focus-visible:outline-[var(--accent)]"
            >
              <X size={26} />
            </button>
          </div>

          {/* Big Digital Display */}
          <div className="cockpit-display rounded-2xl px-4 py-[clamp(10px,2dvh,18px)] flex items-baseline justify-between shadow-inner">
            <div className="overflow-x-auto whitespace-nowrap font-mono-numbers text-[clamp(2.25rem,7.5dvh,3.75rem)] font-black text-[var(--accent-text)] tracking-tight leading-none">
              {displayNum}
            </div>
            <span className="text-[clamp(16px,3dvh,22px)] font-black cockpit-text-secondary ml-3 tracking-wide shrink-0">
              {unit}
            </span>
          </div>

          {/* Quick Add presets */}
          {quickAddOptions && quickAddOptions.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {quickAddOptions.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleQuickAdd(opt)}
                  className="cockpit-btn-secondary min-h-[52px] px-2 rounded-xl active:scale-95 text-[14px] font-black transition-all"
                >
                  +{opt}
                </button>
              ))}
              {maxLimit !== undefined && maxLimit > 0 && (
                <button
                  type="button"
                  onClick={() => setValStr(String(Math.round(maxLimit * 10) / 10))}
                  className="min-h-[52px] px-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 active:scale-95 border border-amber-500/50 text-[14px] font-black cockpit-status-warn transition-all"
                >
                  Cheio
                </button>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2.5 pt-1 mt-auto">
            <button
              type="button"
              onClick={onClose}
              className="cockpit-btn-secondary h-[clamp(54px,11dvh,64px)] rounded-2xl font-black text-[16px] sm:text-[18px] active:scale-98 transition-all flex items-center justify-center"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="h-[clamp(54px,11dvh,64px)] rounded-2xl bg-[var(--accent)] hover:brightness-110 active:scale-98 text-[var(--accent-fg)] font-black text-[16px] sm:text-[18px] shadow-[0_0_24px_rgba(var(--accent-rgb),0.5)] flex items-center justify-center gap-2 transition-all"
            >
              <Check size={24} strokeWidth={3.5} />
              Confirmar
            </button>
          </div>
        </div>

        {/* Coluna Direita (Landscape) / Inferior (Portrait): Teclado Numérico Próprio */}
        <div className="grid grid-cols-3 gap-2 content-stretch">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="cockpit-btn-secondary h-[clamp(56px,13dvh,68px)] rounded-2xl active:bg-[var(--accent)] active:text-[var(--accent-fg)] font-mono-numbers text-[clamp(24px,4.5dvh,30px)] font-bold shadow-sm transition-all flex items-center justify-center select-none"
            >
              {digit}
            </button>
          ))}
          {allowDecimals ? (
            <button
              type="button"
              onClick={() => handleDigit('.')}
              className="cockpit-subcard h-[clamp(56px,13dvh,68px)] rounded-2xl active:scale-95 text-[28px] font-bold cockpit-text-secondary flex items-center justify-center select-none"
            >
              ,
            </button>
          ) : (
            <button
              type="button"
              onClick={handleClear}
              className="cockpit-subcard h-[clamp(56px,13dvh,68px)] rounded-2xl active:scale-95 text-[15px] font-black cockpit-text-muted flex items-center justify-center select-none"
            >
              LIMPAR
            </button>
          )}
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="cockpit-btn-secondary h-[clamp(56px,13dvh,68px)] rounded-2xl active:bg-[var(--accent)] active:text-[var(--accent-fg)] font-mono-numbers text-[clamp(24px,4.5dvh,30px)] font-bold shadow-sm transition-all flex items-center justify-center select-none"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            aria-label="Apagar dígito"
            className="cockpit-subcard h-[clamp(56px,13dvh,68px)] rounded-2xl hover:bg-red-500/20 active:scale-95 cockpit-text-secondary hover:text-red-500 flex items-center justify-center transition-all select-none"
          >
            <Delete size={26} />
          </button>
        </div>
      </div>
    </div>
  );
};
