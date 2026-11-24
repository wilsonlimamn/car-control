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
    if (next < 0) next = 0;
    if (maxLimit !== undefined && next > maxLimit) next = maxLimit;
    setValStr(String(allowDecimals ? Math.round(next * 10) / 10 : Math.round(next)));
  };

  const handleConfirm = () => {
    const num = valStr === '' ? 0 : parseFloat(valStr);
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
      className="fixed top-0 right-0 bottom-0 left-0 z-50 flex items-center justify-center p-2 bg-black/80 animate-in fade-in duration-150"
    >
      <div className="cockpit-numeric-card cockpit-num-modal-card cockpit-modal rounded-3xl shadow-2xl overflow-hidden">
        {/* Coluna Esquerda (Landscape) / Topo (Portrait) */}
        <div className="flex flex-col justify-between space-y-3 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between space-x-2 pb-1.5 border-b cockpit-divider">
            <div className="min-w-0">
              <h3
                id="numeric-modal-title"
                className="cockpit-num-title font-black tracking-tight cockpit-text-primary uppercase truncate"
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
          <div className="cockpit-display cockpit-num-display rounded-2xl px-4 flex items-baseline justify-between shadow-inner">
            <div className="overflow-x-auto whitespace-nowrap font-mono-numbers cockpit-num-display-val font-black text-[var(--accent-text)] tracking-tight leading-none">
              {displayNum}
            </div>
            <span className="cockpit-num-display-unit font-black cockpit-text-secondary ml-3 tracking-wide shrink-0">
              {unit}
            </span>
          </div>

          {/* Quick Adjust presets + Clear */}
          {((quickAddOptions && quickAddOptions.length > 0) || allowDecimals) && (
            <div className="flex flex-wrap cockpit-wrap-2">
              {quickAddOptions &&
                quickAddOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleQuickAdd(opt)}
                    className="cockpit-btn-secondary flex-1 min-w-[58px] min-h-[50px] px-2 rounded-xl active:scale-95 text-[14px] font-black transition-all"
                  >
                    {opt > 0 ? `+${opt}` : String(opt)}
                  </button>
                ))}
              {maxLimit !== undefined && maxLimit > 0 && (
                <button
                  type="button"
                  onClick={() => setValStr(String(Math.round(maxLimit * 10) / 10))}
                  className="flex-1 min-w-[64px] min-h-[50px] px-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 active:scale-95 border border-amber-500/50 text-[14px] font-black cockpit-status-warn transition-all"
                >
                  Cheio
                </button>
              )}
              {allowDecimals && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="cockpit-subcard min-w-[68px] min-h-[50px] px-3 rounded-xl active:scale-95 text-[13px] font-black cockpit-text-secondary uppercase transition-all"
                >
                  Limpar
                </button>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="cockpit-2col-grid pt-1 mt-auto">
            <button
              type="button"
              onClick={onClose}
              className="cockpit-btn-secondary cockpit-num-action-btn rounded-2xl font-black text-[16px] sm:text-[18px] active:scale-98 transition-all flex items-center justify-center"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="cockpit-num-action-btn rounded-2xl bg-[var(--accent)] hover:brightness-110 active:scale-98 text-[var(--accent-fg)] font-black text-[16px] sm:text-[18px] shadow-[0_0_24px_rgba(var(--accent-rgb),0.5)] flex items-center justify-center space-x-2 transition-all"
            >
              <Check size={24} strokeWidth={3.5} />
              <span>Confirmar</span>
            </button>
          </div>
        </div>

        {/* Coluna Direita (Landscape) / Inferior (Portrait): Teclado Numérico Próprio */}
        <div className="cockpit-numpad-grid content-stretch">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="cockpit-btn-secondary cockpit-num-key-btn rounded-2xl active:bg-[var(--accent)] active:text-[var(--accent-fg)] font-mono-numbers font-bold shadow-sm transition-all flex items-center justify-center select-none"
            >
              {digit}
            </button>
          ))}
          {allowDecimals ? (
            <button
              type="button"
              onClick={() => handleDigit('.')}
              className="cockpit-subcard cockpit-num-key-btn rounded-2xl active:scale-95 text-[28px] font-bold cockpit-text-secondary flex items-center justify-center select-none"
            >
              ,
            </button>
          ) : (
            <button
              type="button"
              onClick={handleClear}
              className="cockpit-subcard cockpit-num-key-btn rounded-2xl active:scale-95 text-[15px] font-black cockpit-text-muted flex items-center justify-center select-none"
            >
              LIMPAR
            </button>
          )}
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="cockpit-btn-secondary cockpit-num-key-btn rounded-2xl active:bg-[var(--accent)] active:text-[var(--accent-fg)] font-mono-numbers font-bold shadow-sm transition-all flex items-center justify-center select-none"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            aria-label="Apagar dígito"
            className="cockpit-subcard cockpit-num-key-btn rounded-2xl hover:bg-red-500/20 active:scale-95 cockpit-text-secondary hover:text-red-500 flex items-center justify-center transition-all select-none"
          >
            <Delete size={26} />
          </button>
        </div>
      </div>
    </div>
  );
};
