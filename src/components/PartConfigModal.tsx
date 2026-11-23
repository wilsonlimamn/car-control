import React, { useState, useEffect } from 'react';
import { X, Check, Wrench, Trash2, Info, Calendar, Gauge } from 'lucide-react';
import { CategoryType, PartWithStats } from '../types';
import { getTodayIso, formatNumber } from '../utils/calculations';

interface PartConfigModalProps {
  isOpen: boolean;
  partToEdit?: PartWithStats | null;
  currentVehicleKm: number;
  onClose: () => void;
  onSave: (data: {
    name: string;
    category: CategoryType;
    interval_km: number;
    interval_months: number;
    last_change_km: number;
    last_change_date: string;
    partId?: number;
  }) => void;
  onDelete?: (partId: number) => void;
}

export const PartConfigModal: React.FC<PartConfigModalProps> = ({
  isOpen,
  partToEdit,
  currentVehicleKm,
  onClose,
  onSave,
  onDelete,
}) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<CategoryType>('motor');
  const [intervalKm, setIntervalKm] = useState('10000');
  const [intervalMonths, setIntervalMonths] = useState('12');
  const [lastChangeKm, setLastChangeKm] = useState('0');
  const [lastChangeDate, setLastChangeDate] = useState(getTodayIso());
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShowConfirmDelete(false);
      if (partToEdit) {
        setName(partToEdit.name);
        setCategory(partToEdit.category);
        setIntervalKm(String(partToEdit.interval_km));
        setIntervalMonths(String(partToEdit.interval_months));
        setLastChangeKm(String(partToEdit.last_change_km));
        setLastChangeDate(partToEdit.last_change_date || getTodayIso());
      } else {
        setName('');
        setCategory('motor');
        setIntervalKm('10000');
        setIntervalMonths('12');
        setLastChangeKm(String(currentVehicleKm));
        setLastChangeDate(getTodayIso());
      }
    }
  }, [isOpen, partToEdit, currentVehicleKm]);

  if (!isOpen) return null;

  const isEditing = Boolean(partToEdit);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const kmInt = parseInt(intervalKm, 10) || 0;
    const monthsInt = parseInt(intervalMonths, 10) || 0;
    const lastKmInt = parseInt(lastChangeKm, 10) || 0;
    const dateStr = lastChangeDate || getTodayIso();

    onSave({
      name: name.trim(),
      category,
      interval_km: kmInt,
      interval_months: monthsInt,
      last_change_km: lastKmInt,
      last_change_date: dateStr,
      partId: partToEdit?.id,
    });
    onClose();
  };

  const categories: { id: CategoryType; label: string }[] = [
    { id: 'motor', label: 'Motor' },
    { id: 'freios', label: 'Freios' },
    { id: 'eletrica', label: 'Elétrica' },
    { id: 'pneus', label: 'Pneus / Rodagem' },
  ];

  const quickKmPresets = [
    { label: '5 mil km', val: 5000 },
    { label: '10 mil km', val: 10000 },
    { label: '20 mil km', val: 20000 },
    { label: '30 mil km', val: 30000 },
    { label: '40 mil km', val: 40000 },
    { label: '50 mil km', val: 50000 },
    { label: 'Sem limite km', val: 0 },
  ];

  const quickMonthPresets = [
    { label: '6 meses', val: 6 },
    { label: '1 ano (12m)', val: 12 },
    { label: '2 anos (24m)', val: 24 },
    { label: '3 anos (36m)', val: 36 },
    { label: '4 anos (48m)', val: 48 },
    { label: 'Sem limite tempo', val: 0 },
  ];

  const kmVal = parseInt(intervalKm, 10) || 0;
  const monthVal = parseInt(intervalMonths, 10) || 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="part-config-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 animate-in fade-in duration-150"
    >
      <div className="cockpit-modal w-full max-w-xl rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col gap-5 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b cockpit-divider">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[var(--accent-text)] flex items-center justify-center">
              <Wrench size={24} />
            </div>
            <div>
              <h3 id="part-config-title" className="text-xl sm:text-2xl font-black tracking-tight cockpit-text-primary">
                {isEditing ? `Configurar: ${partToEdit?.name}` : 'Nova Peça de Reposição'}
              </h3>
              <p className="text-sm cockpit-text-muted">
                Defina o intervalo em km e tempo para avisar o desgaste
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="cockpit-btn-secondary w-14 h-14 rounded-2xl flex items-center justify-center transition-colors shrink-0"
          >
            <X size={26} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Nome da Peça */}
          <div>
            <label className="block text-sm font-semibold cockpit-text-secondary mb-1.5">
              Nome da Peça ou Fluido *
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Óleo do Motor, Correia Dentada, Pastilhas..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="cockpit-input w-full h-14 px-4 rounded-2xl focus:border-[var(--accent)] focus:outline-none text-lg font-semibold"
            />
          </div>

          {/* Categoria */}
          <div>
            <label className="block text-sm font-semibold cockpit-text-secondary mb-1.5">
              Sistema / Categoria *
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {categories.map((c) => {
                const isSelected = category === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    className={`min-h-[56px] px-2 rounded-xl text-[14px] font-bold border transition-all ${
                      isSelected
                        ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent-border)] shadow-md'
                        : 'cockpit-subcard hover:opacity-90'
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 1. Intervalo por Quilometragem */}
          <div className="cockpit-subcard p-4 rounded-2xl flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-[14px] font-bold cockpit-text-primary flex items-center gap-2">
                <Gauge size={18} className="text-[var(--accent-text)]" />
                Intervalo por Quilometragem (km)
              </label>
              <span className="text-[14px] cockpit-text-secondary font-mono-numbers font-bold">
                {kmVal > 0 ? `${formatNumber(kmVal)} km` : 'Desativado'}
              </span>
            </div>

            <input
              type="number"
              min="0"
              step="500"
              placeholder="Ex: 10000 (ou 0 se não usa km)"
              value={intervalKm}
              onChange={(e) => setIntervalKm(e.target.value)}
              className="cockpit-input w-full h-14 px-4 rounded-xl focus:border-[var(--accent)] focus:outline-none text-xl font-mono-numbers font-bold"
            />

            <div className="flex flex-wrap gap-2 pt-1">
              {quickKmPresets.map((p) => (
                <button
                  key={p.val}
                  type="button"
                  onClick={() => setIntervalKm(String(p.val))}
                  className={`min-h-[48px] px-3.5 py-2 rounded-xl text-[14px] font-bold border transition-all ${
                    kmVal === p.val
                      ? 'bg-[var(--accent)]/20 border-[var(--accent)] text-[var(--accent-text)]'
                      : 'cockpit-btn-secondary'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Intervalo por Tempo (Meses) */}
          <div className="cockpit-subcard p-4 rounded-2xl flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-[14px] font-bold cockpit-text-primary flex items-center gap-2">
                <Calendar size={18} className="text-cyan-500" />
                Intervalo por Tempo (Meses)
              </label>
              <span className="text-[14px] cockpit-text-secondary font-mono-numbers font-bold">
                {monthVal > 0
                  ? `${monthVal} meses ${monthVal >= 12 ? `(${Math.round((monthVal / 12) * 10) / 10} anos)` : ''}`
                  : 'Desativado'}
              </span>
            </div>

            <input
              type="number"
              min="0"
              step="1"
              placeholder="Ex: 6 para 6 meses, 12 para 1 ano, 24 para 2 anos..."
              value={intervalMonths}
              onChange={(e) => setIntervalMonths(e.target.value)}
              className="cockpit-input w-full h-14 px-4 rounded-xl focus:border-[var(--accent)] focus:outline-none text-xl font-mono-numbers font-bold"
            />

            <div className="flex flex-wrap gap-2 pt-1">
              {quickMonthPresets.map((p) => (
                <button
                  key={p.val}
                  type="button"
                  onClick={() => setIntervalMonths(String(p.val))}
                  className={`min-h-[48px] px-3.5 py-2 rounded-xl text-[14px] font-bold border transition-all ${
                    monthVal === p.val
                      ? 'bg-cyan-500/20 border-cyan-500 text-cyan-500'
                      : 'cockpit-btn-secondary'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Ponto de Partida / Última Troca */}
          <div className="cockpit-subcard p-4 rounded-2xl flex flex-col gap-3">
            <span className="text-[14px] uppercase tracking-wider cockpit-text-secondary font-bold block">
              Calibragem do Ciclo Atual (Última Troca)
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[14px] font-semibold cockpit-text-secondary mb-1">
                  Km na Última Troca
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    value={lastChangeKm}
                    onChange={(e) => setLastChangeKm(e.target.value)}
                    className="cockpit-input flex-1 h-14 px-3 rounded-xl focus:border-[var(--accent)] focus:outline-none text-base font-mono-numbers font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => setLastChangeKm(String(currentVehicleKm))}
                    title="Usar odômetro atual"
                    className="cockpit-btn-secondary px-3.5 h-14 rounded-xl text-[14px] font-bold shrink-0"
                  >
                    Km Atual
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[14px] font-semibold cockpit-text-secondary mb-1">
                  Data da Última Troca
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={lastChangeDate}
                    onChange={(e) => setLastChangeDate(e.target.value)}
                    className="cockpit-input flex-1 h-14 px-3 rounded-xl focus:border-[var(--accent)] focus:outline-none text-[14px] font-mono-numbers font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => setLastChangeDate(getTodayIso())}
                    title="Definir data de hoje"
                    className="cockpit-btn-secondary px-3.5 h-14 rounded-xl text-[14px] font-bold shrink-0"
                  >
                    Hoje
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Dica da Regra de Alerta */}
          <div className="cockpit-subcard p-3.5 rounded-xl flex items-start gap-2.5 text-[14px] cockpit-text-secondary leading-relaxed">
            <Info size={20} className="cockpit-status-warn shrink-0 mt-0.5" />
            <div>
              <strong className="cockpit-text-primary block font-bold mb-0.5">Como o aviso funciona:</strong>
              O cockpit calcula o desgaste pelo MAIOR entre km rodados e tempo decorrido.
              Ao atingir <strong>80%</strong> do limite (ex: {kmVal > 0 ? `${formatNumber(Math.round(kmVal * 0.8))} km` : ''} {monthVal > 0 ? `ou ~${Math.round(monthVal * 0.8)} meses` : ''}), a peça entra na faixa de alertas em <strong>âmbar</strong>.
              Ao atingir <strong>100%</strong>, fica em <strong>vermelho</strong> como vencida.
            </div>
          </div>

          {/* Ações / Botões */}
          <div className="flex flex-col gap-2.5 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onClose}
                className="cockpit-btn-secondary h-16 rounded-2xl font-bold text-base active:scale-98 transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="h-16 rounded-2xl bg-[var(--accent)] hover:brightness-110 active:scale-98 text-[var(--accent-fg)] font-extrabold text-base shadow-[0_0_20px_rgba(var(--accent-rgb),0.4)] flex items-center justify-center gap-2 transition-all"
              >
                <Check size={24} strokeWidth={3} />
                Salvar Configuração
              </button>
            </div>

            {isEditing && onDelete && (
              <div className="pt-2 border-t cockpit-divider flex justify-end">
                {showConfirmDelete ? (
                  <div className="flex items-center gap-2 w-full justify-between">
                    <span className="text-[14px] cockpit-status-exp font-bold">Confirmar exclusão?</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowConfirmDelete(false)}
                        className="cockpit-btn-secondary min-h-[56px] px-4 rounded-xl text-[14px] font-bold"
                      >
                        Não
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (partToEdit) onDelete(partToEdit.id);
                          onClose();
                        }}
                        className="min-h-[56px] px-5 rounded-xl bg-red-600 hover:bg-red-500 text-[14px] text-white font-extrabold"
                      >
                        Sim, Excluir
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowConfirmDelete(true)}
                    className="min-h-[56px] text-[14px] font-bold text-red-500 hover:text-red-400 flex items-center gap-2 px-4 rounded-xl hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 size={18} />
                    Excluir esta peça
                  </button>
                )}
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
