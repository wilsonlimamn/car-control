import React from 'react';
import { Plus, Gauge, Fuel, Droplet, History, Car, Check, Pencil } from 'lucide-react';
import { MaintenanceRecord, Vehicle } from '../types';
import { formatDate, formatDecimal, formatNumber } from '../utils/calculations';

interface VehicleViewProps {
  vehicles: Vehicle[];
  activeVehicle: Vehicle;
  history: MaintenanceRecord[];
  onSelectVehicle: (id: number) => void;
  onOpenAddVehicle: () => void;
  onEditVehicle: (vehicle: Vehicle) => void;
  onOpenKmModal: () => void;
  onOpenFuelLevelModal: () => void;
  onOpenConsumptionModal: () => void;
}

export const VehicleView: React.FC<VehicleViewProps> = ({
  vehicles,
  activeVehicle,
  history,
  onSelectVehicle,
  onOpenAddVehicle,
  onEditVehicle,
  onOpenKmModal,
  onOpenFuelLevelModal,
  onOpenConsumptionModal,
}) => {
  return (
    <div className="flex flex-col space-y-6 w-full max-w-5xl mx-auto pb-16 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between cockpit-wrap-4">
        <div>
          <h2 className="text-3xl sm:text-4xl font-black cockpit-text-primary tracking-tight uppercase">
            Veículos & Combustível
          </h2>
        </div>

        <button
          type="button"
          onClick={onOpenAddVehicle}
          className="min-h-[60px] px-7 rounded-2xl bg-[var(--accent)] hover:brightness-110 active:scale-95 text-[var(--accent-fg)] font-black text-lg shadow-[0_0_24px_rgba(var(--accent-rgb),0.4)] flex items-center justify-center space-x-2.5 transition-all"
        >
          <Plus size={24} strokeWidth={3} />
          <span>+ Adicionar Veículo</span>
        </button>
      </div>

      {/* Lista de Veículos Cadastrados */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {vehicles.map((v) => {
          const isActive = v.id === activeVehicle.id;
          return (
            <div
              key={v.id}
              onClick={() => onSelectVehicle(v.id)}
              className={`cockpit-card rounded-3xl p-6 cursor-pointer transition-all border-2 ${
                isActive
                  ? 'border-[var(--accent)] shadow-[0_0_28px_rgba(var(--accent-rgb),0.35)]'
                  : 'hover:opacity-95'
              }`}
            >
              <div className="flex items-start justify-between space-x-4">
                <div className="flex items-center space-x-3.5 min-w-0">
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
                      isActive
                        ? 'bg-[var(--accent)] text-[var(--accent-fg)] shadow-md'
                        : 'cockpit-subcard cockpit-text-secondary'
                    }`}
                  >
                    <Car size={30} strokeWidth={2.5} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-2xl font-black cockpit-text-primary tracking-tight leading-tight truncate">
                      {v.name}
                    </h3>
                    {v.plate && (
                      <span className="text-sm font-mono-numbers font-black cockpit-text-secondary tracking-wider">
                        {v.plate}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditVehicle(v);
                    }}
                    title="Editar nome e dados deste veículo"
                    className="cockpit-btn-secondary min-h-[56px] px-4 rounded-xl active:scale-95 text-[14px] font-black flex items-center space-x-1.5 transition-all"
                  >
                    <Pencil size={16} />
                    <span>Editar</span>
                  </button>

                  {isActive ? (
                    <span className="px-3.5 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-fg)] text-[14px] font-black tracking-wider uppercase flex items-center space-x-1">
                      <Check size={16} strokeWidth={3.5} />
                      <span>Ativo</span>
                    </span>
                  ) : (
                    <span className="text-[14px] cockpit-text-muted font-bold px-2 py-1">
                      Toque p/ ativar
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-5 pt-4 border-t cockpit-divider flex items-center justify-between text-base">
                <div>
                  <span className="text-[14px] cockpit-text-muted block font-bold uppercase">Odômetro</span>
                  <span className="font-mono-numbers font-black text-2xl cockpit-text-primary">
                    {formatNumber(v.current_km)} km
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[14px] cockpit-text-muted block font-bold uppercase">Tanque</span>
                  <span className="font-mono-numbers font-black text-2xl cockpit-text-secondary">
                    {formatDecimal(v.fuel_level)} / {v.tank_capacity} L
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bloco Combustível & Odômetro do Veículo Ativo */}
      <div className="cockpit-card rounded-3xl p-6 sm:p-8 flex flex-col space-y-6">
        <div className="flex flex-wrap items-center justify-between cockpit-wrap-4">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-2xl bg-accent/15 border border-accent/30 text-[var(--accent-text)] flex items-center justify-center shrink-0">
              <Fuel size={30} />
            </div>
            <div>
              <h3 className="text-2xl sm:text-3xl font-black cockpit-text-primary tracking-tight uppercase">
                Combustível & Odômetro
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenKmModal}
            className="cockpit-btn-secondary min-h-[64px] px-7 rounded-2xl active:scale-95 font-black text-lg flex items-center space-x-2.5 transition-all"
          >
            <Gauge size={22} />
            <span>Atualizar Odômetro</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
          {/* Nível do Tanque */}
          <div className="cockpit-subcard p-6 rounded-3xl flex flex-col justify-between space-y-5">
            <div>
              <span className="text-sm uppercase tracking-wider cockpit-text-muted font-black block mb-1">
                Volume Atual no Tanque
              </span>
              <div className="flex items-baseline space-x-2">
                <span className="font-mono-numbers text-5xl sm:text-6xl font-black cockpit-text-primary">
                  {formatDecimal(activeVehicle.fuel_level)}
                </span>
                <span className="text-2xl font-bold cockpit-text-muted">
                  / {activeVehicle.tank_capacity} L
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenFuelLevelModal}
              className="cockpit-btn-secondary w-full min-h-[64px] rounded-2xl active:scale-98 font-black text-lg flex items-center justify-center space-x-2.5 transition-all"
            >
              <Droplet size={22} className="text-cyan-500" />
              <span>Ajustar Nível do Tanque (L)</span>
            </button>
          </div>

          {/* Consumo Médio */}
          <div className="cockpit-subcard p-6 rounded-3xl flex flex-col justify-between space-y-5">
            <div>
              <span className="text-sm uppercase tracking-wider cockpit-text-muted font-black block mb-1">
                Consumo Médio do Veículo
              </span>
              <div className="flex items-baseline space-x-2">
                <span className="font-mono-numbers text-5xl sm:text-6xl font-black text-[var(--accent-text)]">
                  {formatDecimal(activeVehicle.avg_consumption)}
                </span>
                <span className="text-2xl font-bold cockpit-text-muted">km/L</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenConsumptionModal}
              className="cockpit-btn-secondary w-full min-h-[64px] rounded-2xl active:scale-98 font-black text-lg flex items-center justify-center space-x-2.5 transition-all"
            >
              <Fuel size={22} className="text-amber-500" />
              <span>Editar Consumo Médio (km/L)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Histórico das Últimas Trocas */}
      <div className="cockpit-card rounded-3xl p-6 sm:p-8 flex flex-col space-y-5">
        <div className="flex items-center space-x-3">
          <div className="cockpit-subcard w-12 h-12 rounded-2xl flex items-center justify-center cockpit-text-secondary">
            <History size={26} />
          </div>
          <div>
            <h3 className="text-2xl font-black cockpit-text-primary tracking-tight uppercase">
              Histórico de Trocas
            </h3>
          </div>
        </div>

        {history.length === 0 ? (
          <div className="cockpit-subcard p-10 text-center cockpit-text-muted text-lg font-bold rounded-2xl">
            Nenhuma troca registrada ainda para este veículo.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b cockpit-divider text-sm font-black cockpit-text-muted uppercase tracking-wider">
                  <th className="py-4 px-4">Peça Substituída</th>
                  <th className="py-4 px-4">Odômetro</th>
                  <th className="py-4 px-4 text-right">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y cockpit-divider text-lg font-bold">
                {history.map((record) => (
                  <tr key={record.id} className="transition-colors">
                    <td className="py-4 px-4 cockpit-text-primary font-black">
                      {record.part_name}
                    </td>
                    <td className="py-4 px-4 font-mono-numbers cockpit-text-secondary">
                      {formatNumber(record.change_km)} km
                    </td>
                    <td className="py-4 px-4 text-right font-mono-numbers cockpit-text-muted">
                      {formatDate(record.change_date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
