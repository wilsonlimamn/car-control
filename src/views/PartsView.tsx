import React, { useState } from 'react';
import { Check, Filter, Calendar, Gauge, Plus, SlidersHorizontal } from 'lucide-react';
import { CategoryType, PartWithStats } from '../types';
import { formatDate, formatNumber } from '../utils/calculations';

interface PartsViewProps {
  parts: PartWithStats[];
  onRenewPart: (partId: number) => void;
  onOpenConfigPart: (part: PartWithStats) => void;
  onOpenNewPart: () => void;
}

export const PartsView: React.FC<PartsViewProps> = ({
  parts,
  onRenewPart,
  onOpenConfigPart,
  onOpenNewPart,
}) => {
  const [selectedFilter, setSelectedFilter] = useState<'todas' | CategoryType>('todas');

  const filterOptions: { id: 'todas' | CategoryType; label: string }[] = [
    { id: 'todas', label: 'Todas' },
    { id: 'motor', label: 'Motor' },
    { id: 'freios', label: 'Freios' },
    { id: 'eletrica', label: 'Elétrica' },
    { id: 'pneus', label: 'Pneus / Rodagem' },
  ];

  // Filter and sort by highest wear percent first
  const filteredParts = parts
    .filter((p) => {
      if (selectedFilter === 'todas') return true;
      return p.category === selectedFilter;
    })
    .sort((a, b) => b.wearPercent - a.wearPercent);

  const getStatusBadge = (status: 'ok' | 'warning' | 'expired') => {
    switch (status) {
      case 'expired':
        return {
          label: 'Vencida',
          bg: 'bg-red-500/18',
          text: 'cockpit-status-exp',
          border: 'border-red-500/50',
          barColor: 'from-red-600 to-red-500',
          shadow: 'shadow-[0_0_16px_rgba(239,68,68,0.45)]',
        };
      case 'warning':
        return {
          label: 'Trocar em breve',
          bg: 'bg-amber-500/18',
          text: 'cockpit-status-warn',
          border: 'border-amber-500/50',
          barColor: 'from-amber-600 to-amber-400',
          shadow: 'shadow-[0_0_16px_rgba(245,158,11,0.45)]',
        };
      case 'ok':
      default:
        return {
          label: 'Em dia',
          bg: 'bg-emerald-500/18',
          text: 'cockpit-status-ok',
          border: 'border-emerald-500/50',
          barColor: 'from-emerald-600 to-emerald-400',
          shadow: 'shadow-[0_0_16px_rgba(16,185,129,0.4)]',
        };
    }
  };

  return (
    <div className="flex flex-col space-y-6 w-full max-w-5xl mx-auto pb-16 animate-in fade-in duration-200">
      {/* Top Header and Add Button */}
      <div className="flex flex-col space-y-4">
        <div className="flex flex-wrap items-center justify-between cockpit-wrap-4">
          <div>
            <h2 className="text-3xl sm:text-4xl font-black cockpit-text-primary tracking-tight uppercase">
              Peças & Manutenção
            </h2>
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onOpenNewPart}
              className="min-h-[60px] px-7 rounded-2xl bg-[var(--accent)] hover:brightness-110 active:scale-95 text-[var(--accent-fg)] font-black text-lg shadow-[0_0_24px_rgba(var(--accent-rgb),0.4)] flex items-center justify-center space-x-2.5 transition-all"
            >
              <Plus size={24} strokeWidth={3} />
              <span>+ Nova Peça</span>
            </button>
          </div>
        </div>

        {/* Filtros em botões grandes */}
        <div className="flex flex-wrap cockpit-wrap-3 pt-1">
          {filterOptions.map((f) => {
            const isSelected = selectedFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedFilter(f.id)}
                className={`min-h-[58px] px-6 sm:px-7 rounded-2xl font-black text-lg transition-all active:scale-95 flex items-center justify-center space-x-2 border-2 ${
                  isSelected
                    ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent-border)] shadow-[0_0_24px_rgba(var(--accent-rgb),0.4)]'
                    : 'cockpit-btn-secondary'
                }`}
              >
                {f.id === 'todas' && <Filter size={20} />}
                <span>{f.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista de cards */}
      <div className="flex flex-col space-y-5">
        {filteredParts.length === 0 ? (
          <div className="cockpit-card rounded-3xl p-12 text-center cockpit-text-muted text-xl font-bold">
            Nenhuma peça cadastrada nesta categoria.
          </div>
        ) : (
          filteredParts.map((part) => {
            const badge = getStatusBadge(part.status);
            const clampedWear = Math.min(100, Math.max(0, part.wearPercent));

            return (
              <div
                key={part.id}
                className="cockpit-card rounded-3xl p-6 sm:p-7 flex flex-col md:flex-row md:items-center justify-between space-y-6 md:space-y-0 md:space-x-6 transition-all"
              >
                {/* Bloco de Informações da Peça */}
                <div className="flex-1 flex flex-col space-y-4">
                  <div className="flex flex-wrap items-center justify-between cockpit-wrap-3">
                    <div className="flex items-center space-x-3">
                      <h3 className="text-2xl sm:text-3xl font-black cockpit-text-primary tracking-tight">
                        {part.name}
                      </h3>
                      <span className="cockpit-subcard text-[14px] uppercase tracking-wider cockpit-text-secondary font-black px-3 py-1 rounded-xl">
                        {part.category}
                      </span>
                    </div>

                    <div
                      className={`h-11 px-4 rounded-xl border-2 flex items-center space-x-2 font-black text-sm uppercase tracking-wider ${badge.bg} ${badge.text} ${badge.border}`}
                    >
                      <div className={`w-2.5 h-2.5 rounded-full ${part.status === 'expired' ? 'bg-red-500 animate-pulse' : part.status === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                      <span>{badge.label}</span>
                    </div>
                  </div>

                  {/* Barra de Desgaste */}
                  <div className="flex flex-col space-y-2">
                    <div className="flex justify-between items-baseline">
                      <span className="font-bold cockpit-text-secondary text-base">Desgaste Calculado</span>
                      <span className={`font-mono-numbers font-black text-2xl sm:text-3xl ${badge.text}`}>
                        {part.wearPercent}%
                      </span>
                    </div>

                    <div className="cockpit-subcard w-full h-5 rounded-full overflow-hidden p-1">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${badge.barColor} ${badge.shadow} transition-all duration-500`}
                        style={{ width: `${clampedWear}%` }}
                      />
                    </div>
                  </div>

                  {/* Prazo Restante */}
                  <div className="flex flex-wrap items-center justify-between cockpit-wrap-3 pt-1">
                    <div className="flex items-baseline space-x-2">
                      <span className="text-base font-bold cockpit-text-muted">Prazo:</span>
                      <span className={`text-xl sm:text-2xl font-black ${badge.text}`}>
                        {part.shortDueText}
                      </span>
                    </div>

                    <div className="text-sm font-semibold cockpit-text-muted flex items-center space-x-4">
                      <span className="flex items-center space-x-1.5">
                        <Gauge size={16} />
                        <span>
                          Última troca: <strong className="cockpit-text-primary font-mono-numbers">{formatNumber(part.last_change_km)} km</strong>
                        </span>
                      </span>
                      <span>·</span>
                      <span className="flex items-center space-x-1.5">
                        <Calendar size={16} />
                        <span>{formatDate(part.last_change_date)}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Botões Grandes de Ação */}
                <div className="shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center space-y-3 sm:space-y-0 sm:space-x-3 md:pl-4">
                  <button
                    type="button"
                    onClick={() => onOpenConfigPart(part)}
                    className="cockpit-btn-secondary min-h-[64px] px-6 rounded-2xl active:scale-95 font-black text-base sm:text-lg shadow-sm transition-all flex items-center justify-center space-x-2.5"
                  >
                    <SlidersHorizontal size={22} />
                    <span>Configurar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onRenewPart(part.id)}
                    className="cockpit-btn-secondary min-h-[64px] px-7 rounded-2xl active:bg-[var(--accent)] active:text-[var(--accent-fg)] font-black text-base sm:text-lg shadow-sm transition-all flex items-center justify-center space-x-2.5"
                  >
                    <Check size={24} strokeWidth={3} />
                    <span>Troquei agora</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
