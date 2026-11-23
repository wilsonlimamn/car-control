import React, { useState, useEffect } from 'react';
import { X, Check, Car } from 'lucide-react';
import { Vehicle } from '../types';

interface VehicleModalProps {
  isOpen: boolean;
  vehicleToEdit?: Vehicle | null;
  onClose: () => void;
  onSave: (name: string, plate: string, km: number, tank: number, consumption: number, vehicleId?: number) => void;
}

export const VehicleModal: React.FC<VehicleModalProps> = ({
  isOpen,
  vehicleToEdit,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [plate, setPlate] = useState('');
  const [km, setKm] = useState('50000');
  const [tank, setTank] = useState('55');
  const [consumption, setConsumption] = useState('11.5');

  useEffect(() => {
    if (isOpen) {
      if (vehicleToEdit) {
        setName(vehicleToEdit.name);
        setPlate(vehicleToEdit.plate || '');
        setKm(String(vehicleToEdit.current_km));
        setTank(String(vehicleToEdit.tank_capacity));
        setConsumption(String(vehicleToEdit.avg_consumption));
      } else {
        setName('');
        setPlate('');
        setKm('50000');
        setTank('55');
        setConsumption('11.5');
      }
    }
  }, [isOpen, vehicleToEdit]);

  if (!isOpen) return null;

  const isEditing = Boolean(vehicleToEdit);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const kmNum = parseInt(km, 10) || 0;
    const tankNum = parseFloat(tank) || 50;
    const consNum = parseFloat(consumption) || 10;
    onSave(name.trim(), plate.trim().toUpperCase(), kmNum, tankNum, consNum, vehicleToEdit?.id);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="vehicle-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-150"
    >
      <div className="cockpit-modal w-full max-w-lg rounded-3xl p-6 shadow-2xl flex flex-col gap-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-2 border-b cockpit-divider">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[var(--accent-text)] flex items-center justify-center">
              <Car size={26} />
            </div>
            <div>
              <h3 id="vehicle-modal-title" className="text-xl font-bold tracking-tight cockpit-text-primary">
                {isEditing ? 'Editar Veículo' : 'Adicionar Veículo'}
              </h3>
              <p className="text-sm cockpit-text-muted">
                {isEditing ? 'Altere o nome, placa ou dados do carro' : 'Cadastre um novo carro no painel'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="cockpit-btn-secondary w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
          >
            <X size={26} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-semibold cockpit-text-secondary mb-1.5">
              Modelo / Nome do Carro *
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Corolla XEi 2.0"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="cockpit-input w-full h-14 px-4 rounded-2xl focus:border-[var(--accent)] focus:outline-none text-lg font-semibold"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold cockpit-text-secondary mb-1.5">
                Placa
              </label>
              <input
                type="text"
                placeholder="Ex: BRA2E19"
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                className="cockpit-input w-full h-14 px-4 rounded-2xl focus:border-[var(--accent)] focus:outline-none text-lg font-mono-numbers uppercase"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold cockpit-text-secondary mb-1.5">
                Odômetro Atual (km) *
              </label>
              <input
                type="number"
                required
                min="0"
                value={km}
                onChange={(e) => setKm(e.target.value)}
                className="cockpit-input w-full h-14 px-4 rounded-2xl focus:border-[var(--accent)] focus:outline-none text-lg font-mono-numbers font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold cockpit-text-secondary mb-1.5">
                Tanque (Litros) *
              </label>
              <input
                type="number"
                required
                step="0.5"
                min="10"
                max="200"
                value={tank}
                onChange={(e) => setTank(e.target.value)}
                className="cockpit-input w-full h-14 px-4 rounded-2xl focus:border-[var(--accent)] focus:outline-none text-lg font-mono-numbers font-bold"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold cockpit-text-secondary mb-1.5">
                Consumo Médio (km/L) *
              </label>
              <input
                type="number"
                required
                step="0.1"
                min="3"
                max="40"
                value={consumption}
                onChange={(e) => setConsumption(e.target.value)}
                className="cockpit-input w-full h-14 px-4 rounded-2xl focus:border-[var(--accent)] focus:outline-none text-lg font-mono-numbers font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3">
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
              {isEditing ? 'Salvar Alterações' : 'Salvar Carro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
