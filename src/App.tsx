import { useEffect, useState, useCallback } from 'react';
import { BgStyleType, CategoryType, MaintenanceRecord, PartWithStats, TabType, ThemeType, Vehicle } from './types';
import { 
  initDatabase, 
  getActiveVehicle, 
  getVehicles, 
  getParts, 
  getHistory, 
  getSettings, 
  updateSetting, 
  updateVehicle,
  updateVehicleKm, 
  addFuel, 
  updateFuelLevel, 
  updateAvgConsumption, 
  renewPart, 
  createVehicle, 
  setActiveVehicle,
  createPart,
  updatePart,
  deletePart
} from './db/sqlite';
import { calculatePartStats, getTodayIso, formatNumber } from './utils/calculations';
import { Navigation } from './components/Navigation';
import { HomeView } from './views/HomeView';
import { PartsView } from './views/PartsView';
import { VehicleView } from './views/VehicleView';
import { SettingsView } from './views/SettingsView';
import { NumericModal } from './components/NumericModal';
import { ConfirmModal } from './components/ConfirmModal';
import { VehicleModal } from './components/VehicleModal';
import { PartConfigModal } from './components/PartConfigModal';
import { Car } from 'lucide-react';

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [currentTab, setCurrentTab] = useState<TabType>('home');

  // State
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [activeVehicle, setActiveVehicleState] = useState<Vehicle | null>(null);
  const [partsWithStats, setPartsWithStats] = useState<PartWithStats[]>([]);
  const [history, setHistory] = useState<MaintenanceRecord[]>([]);

  // Theme & Appearance
  const [theme, setTheme] = useState<ThemeType>('amber');
  const [bgStyle, setBgStyle] = useState<BgStyleType>('gradient');

  // Modal states
  const [isFuelModalOpen, setIsFuelModalOpen] = useState(false);
  const [isKmModalOpen, setIsKmModalOpen] = useState(false);
  const [isFuelLevelModalOpen, setIsFuelLevelModalOpen] = useState(false);
  const [isConsumptionModalOpen, setIsConsumptionModalOpen] = useState(false);
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [isPartConfigOpen, setIsPartConfigOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<PartWithStats | null>(null);

  // Confirmation modal for lower odometer
  const [confirmData, setConfirmData] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Load or reload all state from SQLite
  const reloadData = useCallback(async () => {
    try {
      const vList = getVehicles();
      setVehicles(vList);

      const active = getActiveVehicle();
      setActiveVehicleState(active);

      if (active) {
        const rawParts = getParts(active.id);
        const computed = rawParts.map((p) => calculatePartStats(p, active.current_km));
        setPartsWithStats(computed);

        const hist = getHistory(active.id);
        setHistory(hist);
      }

      const st = getSettings();
      setTheme(st.theme);
      setBgStyle(st.bgStyle);
    } catch (err) {
      console.error('Error reloading database data:', err);
    }
  }, []);

  // Initial database boot
  useEffect(() => {
    let mounted = true;
    initDatabase()
      .then(() => {
        if (mounted) {
          reloadData();
          setIsReady(true);
        }
      })
      .catch((err) => {
        console.error('Failed to initialize SQLite database:', err);
      });

    return () => {
      mounted = false;
    };
  }, [reloadData]);

  // Sync theme and bg-style to document body / root
  useEffect(() => {
    document.documentElement.setAttribute('data-color-theme', theme);
    document.documentElement.setAttribute('data-bg-style', bgStyle);
    document.body.setAttribute('data-color-theme', theme);
    document.body.setAttribute('data-bg-style', bgStyle);
  }, [theme, bgStyle]);

  const handleThemeChange = (newTheme: ThemeType) => {
    setTheme(newTheme);
    updateSetting('theme', newTheme);
  };

  const handleBgStyleChange = (newBg: BgStyleType) => {
    setBgStyle(newBg);
    updateSetting('bgStyle', newBg);
  };

  // Renew part ("Troquei")
  const handleRenewPart = (partId: number) => {
    if (!activeVehicle) return;
    const today = getTodayIso();
    renewPart(partId, activeVehicle.current_km, today);
    reloadData();
  };

  // Add fuel confirmation
  const handleConfirmFuel = (litros: number) => {
    if (!activeVehicle || litros <= 0) {
      setIsFuelModalOpen(false);
      return;
    }
    addFuel(activeVehicle.id, litros);
    setIsFuelModalOpen(false);
    reloadData();
  };

  // Update odometer confirmation (with check for smaller km)
  const handleConfirmKm = (newKm: number) => {
    if (!activeVehicle) {
      setIsKmModalOpen(false);
      return;
    }

    if (newKm < activeVehicle.current_km) {
      // Pedir confirmação se for menor
      setConfirmData({
        isOpen: true,
        title: 'Odômetro menor que o atual',
        message: `O novo valor (${formatNumber(newKm)} km) é menor que o odômetro atual (${formatNumber(activeVehicle.current_km)} km). Deseja realmente confirmar esta redução?`,
        onConfirm: () => {
          updateVehicleKm(activeVehicle.id, newKm);
          setConfirmData((prev) => ({ ...prev, isOpen: false }));
          setIsKmModalOpen(false);
          reloadData();
        },
      });
      return;
    }

    updateVehicleKm(activeVehicle.id, newKm);
    setIsKmModalOpen(false);
    reloadData();
  };

  // Fuel level update
  const handleConfirmFuelLevel = (litros: number) => {
    if (!activeVehicle) return;
    updateFuelLevel(activeVehicle.id, Math.min(activeVehicle.tank_capacity, Math.max(0, litros)));
    setIsFuelLevelModalOpen(false);
    reloadData();
  };

  // Consumption update
  const handleConfirmConsumption = (consumption: number) => {
    if (!activeVehicle) return;
    updateAvgConsumption(activeVehicle.id, Math.max(1, consumption));
    setIsConsumptionModalOpen(false);
    reloadData();
  };

  // Add or update vehicle
  const handleSaveVehicle = (
    name: string,
    plate: string,
    km: number,
    tank: number,
    consumption: number,
    vehicleId?: number
  ) => {
    if (vehicleId) {
      updateVehicle(vehicleId, name, plate, km, tank, consumption);
    } else {
      createVehicle(name, plate, km, tank, consumption);
    }
    setEditingVehicle(null);
    reloadData();
  };

  // Part config handlers
  const handleSavePartConfig = (data: {
    name: string;
    category: CategoryType;
    interval_km: number;
    interval_months: number;
    last_change_km: number;
    last_change_date: string;
    partId?: number;
  }) => {
    if (!activeVehicle) return;
    if (data.partId) {
      updatePart(
        data.partId,
        data.name,
        data.category,
        data.interval_km,
        data.interval_months,
        data.last_change_km,
        data.last_change_date
      );
    } else {
      createPart(
        activeVehicle.id,
        data.name,
        data.category,
        data.interval_km,
        data.interval_months,
        data.last_change_km,
        data.last_change_date
      );
    }
    setEditingPart(null);
    setIsPartConfigOpen(false);
    reloadData();
  };

  const handleDeletePart = (partId: number) => {
    deletePart(partId);
    setEditingPart(null);
    setIsPartConfigOpen(false);
    reloadData();
  };

  // Select active vehicle
  const handleSelectVehicle = (id: number) => {
    setActiveVehicle(id);
    reloadData();
  };

  if (!isReady || !activeVehicle) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white p-6">
        <div className="w-16 h-16 rounded-3xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center animate-pulse mb-4 shadow-[0_0_24px_rgba(245,158,11,0.4)]">
          <Car size={34} />
        </div>
        <h1 className="text-2xl font-black tracking-tight text-white">CAR CONTROL</h1>
        <p className="text-sm text-slate-400 mt-2 font-mono">Inicializando Cockpit SQLite...</p>
      </div>
    );
  }

  // Count alert parts (>= 80% wear)
  const alertCount = partsWithStats.filter((p) => p.wearPercent >= 80).length;

  return (
    <div className="min-h-[100dvh] w-full flex flex-col cockpit-text-primary font-sans">
      {/* Menu LATERAL ESQUERDO fixo em horizontal / BARRA INFERIOR em retrato */}
      <Navigation
        currentTab={currentTab}
        onSelectTab={(tab) => setCurrentTab(tab)}
        alertCount={alertCount}
      />

      {/* Main Content Area */}
      <main
        className={`cockpit-main flex-1 flex flex-col justify-start ${
          currentTab === 'home' ? 'cockpit-main-home' : ''
        }`}
      >
        {currentTab === 'home' && (
          <HomeView
            vehicle={activeVehicle}
            parts={partsWithStats}
            onOpenFuelModal={() => setIsFuelModalOpen(true)}
            onOpenKmModal={() => setIsKmModalOpen(true)}
            onRenewPart={handleRenewPart}
            onGoToParts={() => setCurrentTab('parts')}
          />
        )}

        {currentTab === 'parts' && (
          <PartsView
            parts={partsWithStats}
            onRenewPart={handleRenewPart}
            onOpenConfigPart={(part) => {
              setEditingPart(part);
              setIsPartConfigOpen(true);
            }}
            onOpenNewPart={() => {
              setEditingPart(null);
              setIsPartConfigOpen(true);
            }}
          />
        )}

        {currentTab === 'vehicle' && (
          <VehicleView
            vehicles={vehicles}
            activeVehicle={activeVehicle}
            history={history}
            onSelectVehicle={handleSelectVehicle}
            onOpenAddVehicle={() => {
              setEditingVehicle(null);
              setIsVehicleModalOpen(true);
            }}
            onEditVehicle={(v) => {
              setEditingVehicle(v);
              setIsVehicleModalOpen(true);
            }}
            onOpenKmModal={() => setIsKmModalOpen(true)}
            onOpenFuelLevelModal={() => setIsFuelLevelModalOpen(true)}
            onOpenConsumptionModal={() => setIsConsumptionModalOpen(true)}
          />
        )}

        {currentTab === 'settings' && (
          <SettingsView
            currentTheme={theme}
            currentBgStyle={bgStyle}
            activeVehicle={activeVehicle}
            onThemeChange={handleThemeChange}
            onBgStyleChange={handleBgStyleChange}
            onReloadData={reloadData}
          />
        )}
      </main>

      {/* Modal: + Abastecimento (litros abastecidos) */}
      <NumericModal
        isOpen={isFuelModalOpen}
        title="Abastecimento"
        subtitle={`Adicione os litros colocados no tanque (${formatNumber(activeVehicle.fuel_level)} / ${activeVehicle.tank_capacity} L)`}
        initialValue={20}
        unit="Litros"
        allowDecimals={true}
        quickAddOptions={[10, 20, 30]}
        maxLimit={activeVehicle.tank_capacity - activeVehicle.fuel_level}
        onConfirm={handleConfirmFuel}
        onClose={() => setIsFuelModalOpen(false)}
      />

      {/* Modal: Atualizar km (odômetro) */}
      <NumericModal
        isOpen={isKmModalOpen}
        title="Atualizar Odômetro"
        subtitle={`Odômetro atual registrado: ${formatNumber(activeVehicle.current_km)} km`}
        initialValue={activeVehicle.current_km}
        unit="km"
        allowDecimals={false}
        quickAddOptions={[100, 500, 1000]}
        onConfirm={handleConfirmKm}
        onClose={() => setIsKmModalOpen(false)}
      />

      {/* Modal: Nível do Tanque (Litros atuais) */}
      <NumericModal
        isOpen={isFuelLevelModalOpen}
        title="Nível Atual do Tanque"
        subtitle={`Capacidade total do veículo: ${activeVehicle.tank_capacity} Litros`}
        initialValue={activeVehicle.fuel_level}
        unit="Litros"
        allowDecimals={true}
        maxLimit={activeVehicle.tank_capacity}
        onConfirm={handleConfirmFuelLevel}
        onClose={() => setIsFuelLevelModalOpen(false)}
      />

      {/* Modal: Consumo Médio (km/L) */}
      <NumericModal
        isOpen={isConsumptionModalOpen}
        title="Consumo Médio"
        subtitle="Média ponderada para cálculo de autonomia"
        initialValue={activeVehicle.avg_consumption}
        unit="km/L"
        allowDecimals={true}
        onConfirm={handleConfirmConsumption}
        onClose={() => setIsConsumptionModalOpen(false)}
      />

      {/* Modal: Adicionar ou Editar Veículo */}
      <VehicleModal
        isOpen={isVehicleModalOpen}
        vehicleToEdit={editingVehicle}
        onClose={() => {
          setIsVehicleModalOpen(false);
          setEditingVehicle(null);
        }}
        onSave={handleSaveVehicle}
      />

      {/* Modal: Configurar Peça de Reposição / Intervalo */}
      <PartConfigModal
        isOpen={isPartConfigOpen}
        partToEdit={editingPart}
        currentVehicleKm={activeVehicle.current_km}
        onClose={() => {
          setIsPartConfigOpen(false);
          setEditingPart(null);
        }}
        onSave={handleSavePartConfig}
        onDelete={handleDeletePart}
      />

      {/* Modal de Confirmação (Odômetro menor, etc.) */}
      <ConfirmModal
        isOpen={confirmData.isOpen}
        title={confirmData.title}
        message={confirmData.message}
        onConfirm={confirmData.onConfirm}
        onCancel={() => setConfirmData((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
