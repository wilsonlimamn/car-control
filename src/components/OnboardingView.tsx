import React, { useRef, useState } from 'react';
import { Car, Check, Sparkles, Upload, AlertCircle } from 'lucide-react';
import { restoreSqliteBinary } from '../db/sqlite';

interface OnboardingViewProps {
  onCreateVehicle: (
    name: string,
    plate: string,
    km: number,
    tank: number,
    consumption: number,
    fuelLiters?: number
  ) => void;
  onUseSampleData: () => void;
  onRestoredBackup: () => void;
}

export const OnboardingView: React.FC<OnboardingViewProps> = ({
  onCreateVehicle,
  onUseSampleData,
  onRestoredBackup,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [plate, setPlate] = useState('');
  const [km, setKm] = useState('0');
  const [tank, setTank] = useState('50');
  const [consumption, setConsumption] = useState('11.5');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setErrorMsg('Informe o nome ou modelo do carro.');
      return;
    }

    const parsedKm = Math.max(0, parseInt(km.replace(/\D/g, ''), 10) || 0);
    const parsedTank = Math.max(10, parseFloat(tank.replace(',', '.')) || 50);
    const parsedConsumption = Math.max(1, parseFloat(consumption.replace(',', '.')) || 10);

    setErrorMsg(null);
    onCreateVehicle(
      cleanName,
      plate.trim().toUpperCase(),
      parsedKm,
      parsedTank,
      parsedConsumption
    );
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      await restoreSqliteBinary(new Uint8Array(buffer));
      onRestoredBackup();
    } catch (err) {
      setErrorMsg('Falha ao restaurar backup: ' + (err as Error).message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="cockpit-card w-full max-w-4xl rounded-3xl p-5 sm:p-7 flex flex-col gap-5"
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b cockpit-divider">
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-2xl bg-[var(--accent)]/20 border-2 border-[var(--accent-border)] text-[var(--accent-text)] flex items-center justify-center shrink-0">
              <Car size={32} />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight cockpit-text-primary uppercase leading-none">
                Configurar Veículo Inicial
              </h1>
              <p className="text-[14px] sm:text-base cockpit-text-secondary font-bold mt-1">
                Nenhum veículo salvo neste aparelho. Cadastre seu carro para iniciar o monitoramento.
              </p>
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="cockpit-alert-exp rounded-2xl p-3.5 flex items-center gap-2.5 text-base font-bold">
            <AlertCircle size={22} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form Fields optimized for horizontal head unit */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-[14px] font-black cockpit-text-secondary uppercase tracking-wider mb-1.5">
              Modelo do Carro *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Onix 1.0, Corolla 2.0, Gol..."
              className="cockpit-input w-full h-14 px-4 rounded-2xl focus:border-[var(--accent)] focus:outline-none text-lg font-bold"
              required
            />
          </div>

          <div>
            <label className="block text-[14px] font-black cockpit-text-secondary uppercase tracking-wider mb-1.5">
              Placa (Opcional)
            </label>
            <input
              type="text"
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              placeholder="ABC-1D23"
              className="cockpit-input w-full h-14 px-4 rounded-2xl focus:border-[var(--accent)] focus:outline-none text-lg font-mono-numbers font-bold uppercase"
            />
          </div>

          <div>
            <label className="block text-[14px] font-black cockpit-text-secondary uppercase tracking-wider mb-1.5">
              Quilometragem Atual (km)
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={km}
              onChange={(e) => setKm(e.target.value)}
              className="cockpit-input w-full h-14 px-4 rounded-2xl focus:border-[var(--accent)] focus:outline-none text-lg font-mono-numbers font-bold"
            />
          </div>

          <div>
            <label className="block text-[14px] font-black cockpit-text-secondary uppercase tracking-wider mb-1.5">
              Tanque (Litros)
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              value={tank}
              onChange={(e) => setTank(e.target.value)}
              className="cockpit-input w-full h-14 px-4 rounded-2xl focus:border-[var(--accent)] focus:outline-none text-lg font-mono-numbers font-bold"
            />
          </div>

          <div>
            <label className="block text-[14px] font-black cockpit-text-secondary uppercase tracking-wider mb-1.5">
              Consumo Médio (km/L)
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={consumption}
              onChange={(e) => setConsumption(e.target.value)}
              className="cockpit-input w-full h-14 px-4 rounded-2xl focus:border-[var(--accent)] focus:outline-none text-lg font-mono-numbers font-bold"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
          <button
            type="submit"
            className="flex-1 min-h-[64px] px-6 rounded-2xl bg-[var(--accent)] hover:brightness-110 active:scale-95 text-[var(--accent-fg)] font-black text-lg flex items-center justify-center gap-2.5 shadow-lg transition-all"
          >
            <Check size={24} strokeWidth={3} />
            Cadastrar e Abrir Painel
          </button>

          <button
            type="button"
            onClick={onUseSampleData}
            className="cockpit-btn-secondary min-h-[64px] px-5 rounded-2xl font-black text-base flex items-center justify-center gap-2 active:scale-95 transition-all"
          >
            <Sparkles size={20} className="text-[var(--accent-text)]" />
            Usar Carro de Exemplo
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="cockpit-btn-secondary min-h-[64px] px-5 rounded-2xl font-black text-base flex items-center justify-center gap-2 active:scale-95 transition-all"
          >
            <Upload size={20} />
            Restaurar Backup
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".sqlite,.db"
            onChange={handleRestoreFile}
            className="hidden"
          />
        </div>
      </form>
    </div>
  );
};
