import React from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  isDestructive = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-desc"
      className="fixed top-0 right-0 bottom-0 left-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-150"
    >
      <div className="cockpit-modal w-full max-w-md rounded-3xl p-6 shadow-2xl flex flex-col space-y-5">
        <div className="flex items-start space-x-4">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
              isDestructive
                ? 'bg-red-500/20 cockpit-status-exp border border-red-500/40'
                : 'bg-amber-500/20 cockpit-status-warn border border-amber-500/40'
            }`}
          >
            <AlertTriangle size={32} />
          </div>
          <div>
            <h3 id="confirm-modal-title" className="text-xl font-bold tracking-tight cockpit-text-primary">
              {title}
            </h3>
            <p id="confirm-modal-desc" className="text-base cockpit-text-secondary mt-2 leading-relaxed">
              {message}
            </p>
          </div>
        </div>

        <div className="cockpit-2col-grid pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="cockpit-btn-secondary h-16 rounded-2xl font-bold text-base active:scale-98 transition-all flex items-center justify-center space-x-2"
          >
            <X size={22} />
            <span>{cancelLabel}</span>
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`h-16 rounded-2xl font-extrabold text-base active:scale-98 transition-all flex items-center justify-center space-x-2 ${
              isDestructive
                ? 'bg-red-600 hover:bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]'
                : 'bg-[var(--accent)] hover:brightness-110 text-[var(--accent-fg)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.4)]'
            }`}
          >
            <Check size={22} strokeWidth={3} />
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
