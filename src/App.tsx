import { lazy, Suspense, useEffect, useState, useCallback } from 'react';
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
  deletePart,
  loadSampleData,
  getAutoRestoredBackupDate,
  clearAutoRestoredBackupDate,
  requestStoragePersistence,
  isNativeCapacitorPlatform,
  getPersistenceStatus,
  subscribePersistenceStatus,
  retryPersistDatabaseNow,
} from './db/sqlite';
import type { PersistenceStatus } from './db/types';
import { buildSampleDataset } from './db/schema';
import { calculatePartStats, getTodayIso, formatNumber } from './utils/calculations';
import {
  checkOutdatedWebView,
  copyTextWithFallback,
  detectAndApplyLowPerfMode,
  dismissPreviousBootFailure,
  getCurrentBootLabel,
  getDiagnosticText,
  getPreviousCrashReportText,
  hasPreviousBootFailure,
  markBootDone,
  recordBootError,
  recordBootStep,
  subscribeBootStep,
} from './utils/diagnostics';
import { Navigation } from './components/Navigation';
import { AlertTriangle, Car } from 'lucide-react';

// Code splitting: telas e modais carregados sob demanda
const HomeView = lazy(() => import('./views/HomeView').then((m) => ({ default: m.HomeView })));
const PartsView = lazy(() => import('./views/PartsView').then((m) => ({ default: m.PartsView })));
const VehicleView = lazy(() => import('./views/VehicleView').then((m) => ({ default: m.VehicleView })));
const SettingsView = lazy(() => import('./views/SettingsView').then((m) => ({ default: m.SettingsView })));
const OnboardingView = lazy(() => import('./components/OnboardingView').then((m) => ({ default: m.OnboardingView })));

const NumericModal = lazy(() => import('./components/NumericModal').then((m) => ({ default: m.NumericModal })));
const ConfirmModal = lazy(() => import('./components/ConfirmModal').then((m) => ({ default: m.ConfirmModal })));
const VehicleModal = lazy(() => import('./components/VehicleModal').then((m) => ({ default: m.VehicleModal })));
const PartConfigModal = lazy(() => import('./components/PartConfigModal').then((m) => ({ default: m.PartConfigModal })));

function buildInMemoryFallbackData(): {
  vehicle: Vehicle;
  parts: PartWithStats[];
  history: MaintenanceRecord[];
} {
  const sample = buildSampleDataset();
  const vehicle: Vehicle = {
    id: 1,
    name: sample.vehicle.name,
    plate: sample.vehicle.plate,
    current_km: sample.vehicle.current_km,
    tank_capacity: sample.vehicle.tank_capacity,
    fuel_level: sample.vehicle.fuel_level,
    avg_consumption: sample.vehicle.avg_consumption,
    is_active: 1,
  };
  const parts: PartWithStats[] = sample.parts.map((p, idx) =>
    calculatePartStats(
      {
        id: idx + 1,
        vehicle_id: 1,
        name: p[0],
        category: p[1],
        interval_km: p[2],
        interval_months: p[3],
        last_change_km: p[4],
        last_change_date: p[5],
      },
      vehicle.current_km
    )
  );
  const history: MaintenanceRecord[] = sample.history.map((h, idx) => ({
    id: idx + 1,
    vehicle_id: 1,
    part_name: h[0],
    change_km: h[1],
    change_date: h[2],
  }));
  return { vehicle, parts, history };
}

function ViewFallback() {
  return (
    <div className="w-full min-h-[50vh] flex items-center justify-center p-6 text-slate-300 font-bold text-base">
      Carregando…
    </div>
  );
}

function App() {
  const [isReady, setIsReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [dbFallbackState, setDbFallbackState] = useState<'none' | 'slow_loading' | 'error'>('none');
  const [showDetails, setShowDetails] = useState(false);
  const [bootAttempt, setBootAttempt] = useState(0);
  const [currentTab, setCurrentTab] = useState<TabType>('home');
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>(() => getPersistenceStatus());
  const [retryingPersist, setRetryingPersist] = useState(false);
  const [dismissedBannerMsg, setDismissedBannerMsg] = useState<string | null>(null);
  const [autoRestoredDate, setAutoRestoredDate] = useState<string | null>(null);
  const [bootStepLabel, setBootStepLabel] = useState<string>(() => getCurrentBootLabel());
  const [showPrevCrashBanner, setShowPrevCrashBanner] = useState<boolean>(() => hasPreviousBootFailure());
  const [showPrevCrashReport, setShowPrevCrashReport] = useState(false);
  const [copiedCrashReport, setCopiedCrashReport] = useState(false);
  const [outdatedWebView] = useState(() => checkOutdatedWebView());
  const [bypassOldWebView, setBypassOldWebView] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('car_control_bypass_old_wv') === '1';
    } catch {
      return false;
    }
  });

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

  const activateMemoryFallback = useCallback((mode: 'slow_loading' | 'error') => {
    const mem = buildInMemoryFallbackData();
    setVehicles([mem.vehicle]);
    setActiveVehicleState(mem.vehicle);
    setPartsWithStats(mem.parts);
    setHistory(mem.history);
    setDbFallbackState(mode);
    setIsReady(true);
    markBootDone();
  }, []);

  // Load or reload all state from SQLite
  const reloadData = useCallback(async () => {
    try {
      const vList = await getVehicles();
      setVehicles(vList);

      const active = await getActiveVehicle();
      setActiveVehicleState(active);

      if (active) {
        const rawParts = await getParts(active.id);
        const computed = rawParts.map((p) => calculatePartStats(p, active.current_km));
        setPartsWithStats(computed);

        const hist = await getHistory(active.id);
        setHistory(hist);
      } else {
        setPartsWithStats([]);
        setHistory([]);
      }

      const st = await getSettings();
      setTheme(st.theme);
      setBgStyle(st.bgStyle);
    } catch (err) {
      console.error('Error reloading database data:', err);
    }
  }, []);

  useEffect(() => {
    const unsub = subscribeBootStep((label) => {
      setBootStepLabel(label);
    });
    return unsub;
  }, []);

  useEffect(() => {
    return subscribePersistenceStatus((st) => {
      setPersistenceStatus(st);
      if (!st.allFailed) {
        setDismissedBannerMsg(null);
      }
    });
  }, []);

  // Non-blocking lazy database initialization triggered AFTER the initial shell is visible
  useEffect(() => {
    let active = true;
    let dbSettled = false;
    setInitError(null);
    setDbFallbackState('none');

    const timeoutId = window.setTimeout(() => {
      if (active && !dbSettled) {
        const msg =
          'O banco local demorou mais de 30 segundos neste WebView. Painel aberto com dados de exemplo em memória enquanto o carregamento continua.';
        recordBootError(msg);
        setInitError(msg);
        activateMemoryFallback('slow_loading');
      }
    }, 30000);

    // Schedule DB boot after first paint so the loading shell is visible immediately
    const startTimerId = window.setTimeout(() => {
      if (!active) return;
      recordBootStep('Casca visível; iniciando banco local');

      initDatabase()
        .then(async () => {
          dbSettled = true;
          window.clearTimeout(timeoutId);
          if (!active) return;
          await reloadData();
          if (!active) return;
          const bootStart =
            (window as unknown as { __BOOT_DIAG__?: { startTime?: number } }).__BOOT_DIAG__?.startTime ||
            Date.now();
          detectAndApplyLowPerfMode(Date.now() - bootStart);
          recordBootStep('Painel pronto');
          markBootDone();
          setDbFallbackState('none');
          const restoredDate = getAutoRestoredBackupDate();
          if (restoredDate) {
            setAutoRestoredDate(restoredDate);
          }
          if (!isNativeCapacitorPlatform()) {
            void requestStoragePersistence().catch(() => {});
          }
          setInitError(null);
          setDismissedBannerMsg(null);
          setIsReady(true);
        })
        .catch((err) => {
          dbSettled = true;
          window.clearTimeout(timeoutId);
          console.error('Failed to initialize SQLite database:', err);
          const msg = (err as Error)?.message || 'Falha ao iniciar banco de dados local.';
          recordBootError(msg);
          if (active) {
            setInitError(msg);
            activateMemoryFallback('error');
          }
        });
    }, 32);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      window.clearTimeout(startTimerId);
    };
  }, [bootAttempt, reloadData, activateMemoryFallback]);

  // Sync theme and bg-style to document body / root
  useEffect(() => {
    document.documentElement.setAttribute('data-color-theme', theme);
    document.documentElement.setAttribute('data-bg-style', bgStyle);
    document.body.setAttribute('data-color-theme', theme);
    document.body.setAttribute('data-bg-style', bgStyle);
  }, [theme, bgStyle]);

  const handleThemeChange = async (newTheme: ThemeType) => {
    setTheme(newTheme);
    try {
      await updateSetting('theme', newTheme);
    } catch {
      // Keep UI responsive in memory fallback mode
    }
  };

  const handleBgStyleChange = async (newBg: BgStyleType) => {
    setBgStyle(newBg);
    try {
      await updateSetting('bgStyle', newBg);
    } catch {
      // Keep UI responsive in memory fallback mode
    }
  };

  // Renew part ("Troquei")
  const handleRenewPart = async (partId: number) => {
    if (!activeVehicle) return;
    const today = getTodayIso();
    if (dbFallbackState !== 'none') {
      setPartsWithStats((prev) =>
        prev.map((p) =>
          p.id === partId
            ? calculatePartStats({ ...p, last_change_km: activeVehicle.current_km, last_change_date: today }, activeVehicle.current_km)
            : p
        )
      );
      return;
    }
    await renewPart(partId, activeVehicle.current_km, today);
    await reloadData();
  };

  // Add fuel confirmation
  const handleConfirmFuel = async (litros: number) => {
    if (!activeVehicle || litros <= 0) {
      setIsFuelModalOpen(false);
      return;
    }
    if (dbFallbackState !== 'none') {
      const nextFuel = Math.min(activeVehicle.tank_capacity, activeVehicle.fuel_level + litros);
      setActiveVehicleState({ ...activeVehicle, fuel_level: nextFuel });
      setIsFuelModalOpen(false);
      return;
    }
    await addFuel(activeVehicle.id, litros);
    setIsFuelModalOpen(false);
    await reloadData();
  };

  // Update odometer confirmation (with check for smaller km)
  const handleConfirmKm = async (newKm: number) => {
    if (!activeVehicle) {
      setIsKmModalOpen(false);
      return;
    }

    const applyKm = async () => {
      if (dbFallbackState !== 'none') {
        setActiveVehicleState({ ...activeVehicle, current_km: newKm });
        setPartsWithStats((prev) => prev.map((p) => calculatePartStats(p, newKm)));
        return;
      }
      await updateVehicleKm(activeVehicle.id, newKm);
      await reloadData();
    };

    if (newKm < activeVehicle.current_km) {
      setConfirmData({
        isOpen: true,
        title: 'Odômetro menor que o atual',
        message: `O novo valor (${formatNumber(newKm)} km) é menor que o odômetro atual (${formatNumber(activeVehicle.current_km)} km). Deseja realmente confirmar esta redução?`,
        onConfirm: async () => {
          await applyKm();
          setConfirmData((prev) => ({ ...prev, isOpen: false }));
          setIsKmModalOpen(false);
        },
      });
      return;
    }

    await applyKm();
    setIsKmModalOpen(false);
  };

  // Fuel level update
  const handleConfirmFuelLevel = async (litros: number) => {
    if (!activeVehicle) return;
    const clamped = Math.min(activeVehicle.tank_capacity, Math.max(0, litros));
    if (dbFallbackState !== 'none') {
      setActiveVehicleState({ ...activeVehicle, fuel_level: clamped });
      setIsFuelLevelModalOpen(false);
      return;
    }
    await updateFuelLevel(activeVehicle.id, clamped);
    setIsFuelLevelModalOpen(false);
    await reloadData();
  };

  // Consumption update
  const handleConfirmConsumption = async (consumption: number) => {
    if (!activeVehicle) return;
    const clamped = Math.max(1, consumption);
    if (dbFallbackState !== 'none') {
      setActiveVehicleState({ ...activeVehicle, avg_consumption: clamped });
      setIsConsumptionModalOpen(false);
      return;
    }
    await updateAvgConsumption(activeVehicle.id, clamped);
    setIsConsumptionModalOpen(false);
    await reloadData();
  };

  // Add or update vehicle
  const handleSaveVehicle = async (
    name: string,
    plate: string,
    km: number,
    tank: number,
    consumption: number,
    vehicleId?: number
  ) => {
    if (dbFallbackState !== 'none') {
      if (vehicleId && activeVehicle && vehicleId === activeVehicle.id) {
        const updated = {
          ...activeVehicle,
          name,
          plate,
          current_km: km,
          tank_capacity: tank,
          fuel_level: Math.min(activeVehicle.fuel_level, tank),
          avg_consumption: consumption,
        };
        setActiveVehicleState(updated);
        setVehicles((prev) => prev.map((v) => (v.id === vehicleId ? updated : v)));
      }
      setEditingVehicle(null);
      return;
    }
    if (vehicleId) {
      await updateVehicle(vehicleId, name, plate, km, tank, consumption);
    } else {
      await createVehicle(name, plate, km, tank, consumption);
    }
    setEditingVehicle(null);
    await reloadData();
  };

  // Part config handlers
  const handleSavePartConfig = async (data: {
    name: string;
    category: CategoryType;
    interval_km: number;
    interval_months: number;
    last_change_km: number;
    last_change_date: string;
    partId?: number;
  }) => {
    if (!activeVehicle) return;
    if (dbFallbackState !== 'none') {
      if (data.partId) {
        setPartsWithStats((prev) =>
          prev.map((p) =>
            p.id === data.partId
              ? calculatePartStats(
                  {
                    ...p,
                    name: data.name,
                    category: data.category,
                    interval_km: data.interval_km,
                    interval_months: data.interval_months,
                    last_change_km: data.last_change_km,
                    last_change_date: data.last_change_date,
                  },
                  activeVehicle.current_km
                )
              : p
          )
        );
      }
      setEditingPart(null);
      setIsPartConfigOpen(false);
      return;
    }
    if (data.partId) {
      await updatePart(
        data.partId,
        data.name,
        data.category,
        data.interval_km,
        data.interval_months,
        data.last_change_km,
        data.last_change_date
      );
    } else {
      await createPart(
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
    await reloadData();
  };

  const handleDeletePart = async (partId: number) => {
    if (dbFallbackState !== 'none') {
      setPartsWithStats((prev) => prev.filter((p) => p.id !== partId));
      setEditingPart(null);
      setIsPartConfigOpen(false);
      return;
    }
    await deletePart(partId);
    setEditingPart(null);
    setIsPartConfigOpen(false);
    await reloadData();
  };

  // Select active vehicle
  const handleSelectVehicle = async (id: number) => {
    if (dbFallbackState !== 'none') return;
    await setActiveVehicle(id);
    await reloadData();
  };

  const handleRetryDatabaseOrPersist = async () => {
    if (dbFallbackState !== 'none') {
      setDismissedBannerMsg(null);
      setIsReady(false);
      setBootAttempt((n) => n + 1);
      return;
    }

    setRetryingPersist(true);
    try {
      const ok = await retryPersistDatabaseNow();
      if (ok) {
        setDismissedBannerMsg(null);
      }
    } finally {
      setRetryingPersist(false);
    }
  };

  const handleCopyCrashReport = async () => {
    const report = getPreviousCrashReportText();
    const ok = await copyTextWithFallback(report);
    if (ok) {
      setCopiedCrashReport(true);
      window.setTimeout(() => setCopiedCrashReport(false), 3000);
    } else {
      setShowPrevCrashReport(true);
    }
  };

  const handleDismissPrevCrash = () => {
    dismissPreviousBootFailure();
    setShowPrevCrashBanner(false);
    setShowPrevCrashReport(false);
  };

  const activeWarningMessage =
    dbFallbackState !== 'none'
      ? initError ||
        (dbFallbackState === 'slow_loading'
          ? 'O banco local demorou mais de 30 segundos neste WebView.'
          : 'Não foi possível inicializar o SQLite local (sql.js / sql-asm.js).')
      : persistenceStatus.allFailed
      ? persistenceStatus.lastError || 'Falha ao gravar no IndexedDB e no localStorage.'
      : null;

  const showWarningBanner =
    Boolean(activeWarningMessage) && dismissedBannerMsg !== activeWarningMessage;

  const dbFallbackBannerNode = showWarningBanner ? (
    <div className="mb-3 cockpit-alert-warn rounded-2xl p-3.5 sm:p-4 flex flex-col space-y-2.5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between space-y-2.5 sm:space-y-0 sm:space-x-3">
        <div className="min-w-0">
          <h2 className="text-sm sm:text-base font-black uppercase">
            {dbFallbackState !== 'none'
              ? 'Modo temporário em memória (falha no banco local)'
              : 'Não foi possível salvar os dados neste aparelho'}
          </h2>
          <p className="text-xs sm:text-sm font-bold opacity-95 mt-0.5 break-words">
            {activeWarningMessage}
          </p>
        </div>
        <div className="flex flex-wrap items-center cockpit-wrap-2 shrink-0">
          <button
            type="button"
            disabled={retryingPersist}
            onClick={handleRetryDatabaseOrPersist}
            className="min-h-[44px] px-4 rounded-xl bg-[var(--accent)] text-[var(--accent-fg)] font-black text-xs sm:text-sm disabled:opacity-60"
          >
            {retryingPersist ? 'Tentando…' : 'Tentar novamente'}
          </button>
          <button
            type="button"
            onClick={() => setShowDetails((prev) => !prev)}
            className="cockpit-btn-secondary min-h-[44px] px-4 rounded-xl font-black text-xs sm:text-sm"
          >
            {showDetails ? 'Ocultar detalhes' : 'Ver detalhes'}
          </button>
          <button
            type="button"
            onClick={() => setDismissedBannerMsg(activeWarningMessage)}
            className="min-h-[44px] px-3 rounded-xl bg-black/25 hover:bg-black/40 font-black text-xs sm:text-sm uppercase"
          >
            Fechar
          </button>
        </div>
      </div>
      {showDetails && (
        <pre className="p-3 rounded-xl bg-black/50 text-slate-100 text-xs font-mono whitespace-pre-wrap break-words max-h-48 overflow-auto border border-white/15">
          {getDiagnosticText(activeWarningMessage || undefined)}
        </pre>
      )}
    </div>
  ) : null;

  const prevCrashBannerNode = showPrevCrashBanner ? (
    <div className="mb-3 cockpit-alert-warn rounded-2xl p-4 flex flex-col space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between space-y-3 sm:space-y-0 sm:space-x-3">
        <div>
          <h2 className="text-base sm:text-lg font-black uppercase">
            O app não abriu corretamente da última vez
          </h2>
          <p className="text-xs sm:text-sm font-bold opacity-90 mt-0.5">
            As etapas e erros da abertura anterior foram salvos para ajudar a identificar o problema.
          </p>
        </div>
        <div className="flex flex-wrap items-center cockpit-wrap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowPrevCrashReport((v) => !v)}
            className="cockpit-btn-secondary min-h-[46px] px-4 rounded-xl font-black text-sm"
          >
            {showPrevCrashReport ? 'Ocultar relatório' : 'Ver relatório'}
          </button>
          <button
            type="button"
            onClick={handleCopyCrashReport}
            className="min-h-[46px] px-4 rounded-xl bg-[var(--accent)] text-[var(--accent-fg)] font-black text-sm"
          >
            {copiedCrashReport ? 'Relatório copiado!' : 'Copiar relatório'}
          </button>
          <button
            type="button"
            onClick={handleDismissPrevCrash}
            className="min-h-[46px] px-3 rounded-xl bg-black/25 hover:bg-black/40 font-black text-xs sm:text-sm uppercase"
          >
            Fechar
          </button>
        </div>
      </div>
      {showPrevCrashReport && (
        <pre className="p-3 rounded-xl bg-black/50 text-slate-100 text-xs font-mono whitespace-pre-wrap break-words max-h-48 overflow-auto border border-white/15">
          {getPreviousCrashReportText()}
        </pre>
      )}
    </div>
  ) : null;

  if (outdatedWebView.outdated && !bypassOldWebView) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-5 text-left"
        style={{ backgroundColor: '#0b1120', color: '#f8fafc', minHeight: '100vh' }}
      >
        <div className="max-w-2xl w-full rounded-3xl p-6 sm:p-8 bg-slate-900 border-2 border-amber-500/60 flex flex-col space-y-5">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/50 text-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle size={30} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white uppercase leading-tight">
                Navegador interno (WebView) muito antigo
              </h1>
              <p className="text-sm sm:text-base text-amber-200 font-bold mt-1">
                Versão detectada: Chromium {outdatedWebView.detectedMajor} (mínimo recomendado:{' '}
                {outdatedWebView.minTested})
              </p>
            </div>
          </div>

          <p className="text-sm sm:text-base text-slate-200 font-semibold leading-relaxed">
            O sistema desta central usa um componente antigo para abrir o app, o que pode causar lentidão ou tela preta. Veja como resolver rapidamente:
          </p>

          <ol className="flex flex-col space-y-2.5 text-sm sm:text-base text-slate-200 font-semibold bg-slate-950/70 p-4 rounded-2xl border border-slate-700">
            <li>
              1. Abra a <strong className="text-white">Google Play Store</strong> na central, busque por{' '}
              <strong className="text-white">Android System WebView</strong> e toque em{' '}
              <strong className="text-white">Atualizar</strong>.
            </li>
            <li>
              2. Se não atualizar pela loja: vá em <strong className="text-white">Configurações &gt; Sobre</strong>, toque 7 vezes em{' '}
              <strong className="text-white">Número da versão/compilação</strong> para liberar as{' '}
              <strong className="text-white">Opções do desenvolvedor</strong>.
            </li>
            <li>
              3. Entre em <strong className="text-white">Opções do desenvolvedor &gt; Implementação do WebView</strong> e escolha{' '}
              <strong className="text-white">Google Chrome</strong> (se disponível).
            </li>
          </ol>

          <div className="flex flex-wrap items-center cockpit-wrap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                try {
                  sessionStorage.setItem('car_control_bypass_old_wv', '1');
                } catch {
                  // Ignore
                }
                setBypassOldWebView(true);
              }}
              className="min-h-[56px] px-6 rounded-2xl bg-amber-500 text-black font-black text-base"
            >
              Continuar mesmo assim
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center text-white p-6 text-center"
        style={{ backgroundColor: '#0b1120', color: '#f8fafc', minHeight: '100vh' }}
      >
        <div className="w-16 h-16 rounded-3xl bg-blue-600/25 border border-blue-500/50 text-blue-400 flex items-center justify-center mb-4">
          <Car size={34} />
        </div>
        <h1 className="text-2xl font-black tracking-tight text-white">CAR CONTROL</h1>
        <p className="text-base text-slate-300 mt-2 font-semibold">
          {initError ? 'Falha ou demora na inicialização' : bootStepLabel || 'Carregando…'}
        </p>

        {showPrevCrashBanner && (
          <div className="mt-4 max-w-xl w-full text-left rounded-2xl p-4 bg-amber-950/80 border border-amber-500/60 text-amber-100 flex flex-col space-y-2.5">
            <div className="font-black text-sm sm:text-base">
              O app não abriu corretamente da última vez
            </div>
            <div className="flex flex-wrap cockpit-wrap-2">
              <button
                type="button"
                onClick={handleCopyCrashReport}
                className="min-h-[44px] px-4 rounded-xl bg-amber-500 text-black font-black text-sm"
              >
                {copiedCrashReport ? 'Relatório copiado!' : 'Copiar relatório'}
              </button>
              <button
                type="button"
                onClick={() => setShowPrevCrashReport((v) => !v)}
                className="min-h-[44px] px-4 rounded-xl bg-slate-800 border border-slate-600 text-white font-bold text-sm"
              >
                {showPrevCrashReport ? 'Ocultar relatório' : 'Ver relatório'}
              </button>
              <button
                type="button"
                onClick={handleDismissPrevCrash}
                className="min-h-[44px] px-3 rounded-xl bg-black/30 text-amber-200 font-bold text-sm"
              >
                Fechar
              </button>
            </div>
            {showPrevCrashReport && (
              <pre className="p-3 rounded-xl bg-slate-950 text-slate-200 text-xs font-mono whitespace-pre-wrap break-words max-h-40 overflow-auto border border-slate-700">
                {getPreviousCrashReportText()}
              </pre>
            )}
          </div>
        )}

        <div className="mt-4 max-w-xl w-full flex flex-col items-center space-y-3">
          {initError && (
            <p className="text-sm sm:text-base font-bold text-red-200 bg-red-950/80 border border-red-500/50 rounded-2xl px-4 py-3 w-full">
              {initError}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-center cockpit-wrap-3">
            <button
              type="button"
              onClick={() => activateMemoryFallback('slow_loading')}
              className="min-h-[52px] px-5 rounded-2xl bg-amber-500 text-black font-black text-base"
            >
              Abrir agora (exemplo)
            </button>
            <button
              type="button"
              onClick={() => setBootAttempt((n) => n + 1)}
              className="min-h-[52px] px-5 rounded-2xl bg-blue-700 text-white font-black text-base"
            >
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={() => setShowDetails((prev) => !prev)}
              className="min-h-[52px] px-5 rounded-2xl bg-slate-700 border border-slate-500 text-slate-100 font-black text-base"
            >
              Ver detalhes
            </button>
          </div>
          {showDetails && (
            <pre className="mt-2 p-4 rounded-2xl bg-slate-900 border border-slate-700 text-slate-200 text-xs sm:text-sm text-left whitespace-pre-wrap break-words w-full max-h-[42vh] overflow-auto font-mono">
              {getDiagnosticText(initError || undefined)}
            </pre>
          )}
        </div>
      </div>
    );
  }

  if (!activeVehicle) {
    return (
      <div className="cockpit-screen-min-h w-full cockpit-text-primary font-sans">
        {dbFallbackBannerNode && (
          <div className="max-w-4xl mx-auto px-4 pt-4">{dbFallbackBannerNode}</div>
        )}
        {prevCrashBannerNode && (
          <div className="max-w-4xl mx-auto px-4 pt-4">{prevCrashBannerNode}</div>
        )}
        <Suspense fallback={<ViewFallback />}>
          <OnboardingView
            onCreateVehicle={async (name, plate, km, tank, consumption, fuelLiters) => {
              await createVehicle(name, plate, km, tank, consumption, fuelLiters);
              await reloadData();
            }}
            onUseSampleData={async () => {
              await loadSampleData();
              await reloadData();
            }}
            onRestoredBackup={async () => {
              await reloadData();
            }}
          />
        </Suspense>
      </div>
    );
  }

  // Count alert parts (>= 80% wear)
  const alertCount = partsWithStats.filter((p) => p.wearPercent >= 80).length;

  return (
    <div className="cockpit-screen-min-h w-full flex flex-col cockpit-text-primary font-sans">
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
        {dbFallbackBannerNode}
        {prevCrashBannerNode}
        {autoRestoredDate && (
          <div className="mb-3 cockpit-alert-ok rounded-2xl px-4 py-3 flex items-center justify-between space-x-3">
            <span className="font-black text-sm sm:text-base">
              Dados restaurados do backup de {autoRestoredDate}
            </span>
            <button
              type="button"
              onClick={() => {
                clearAutoRestoredBackupDate();
                setAutoRestoredDate(null);
              }}
              className="text-xs sm:text-sm uppercase font-black px-3 py-1.5 rounded-xl bg-black/25 hover:bg-black/40 shrink-0"
            >
              Fechar
            </button>
          </div>
        )}
        <Suspense fallback={<ViewFallback />}>
          {currentTab === 'home' && (
            <HomeView
              vehicle={activeVehicle}
              parts={partsWithStats}
              onOpenFuelModal={() => setIsFuelModalOpen(true)}
              onOpenFuelLevelModal={() => setIsFuelLevelModalOpen(true)}
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
        </Suspense>
      </main>

      {/* Modais carregados sob demanda */}
      <Suspense fallback={null}>
        {isFuelModalOpen && (
          <NumericModal
            isOpen={isFuelModalOpen}
            title="Abastecimento"
            subtitle={`Adicione os litros colocados no tanque (${formatNumber(activeVehicle.fuel_level)} / ${activeVehicle.tank_capacity} L)`}
            initialValue={20}
            unit="Litros"
            allowDecimals={true}
            quickAddOptions={[10, 20, 30]}
            maxLimit={Math.max(0, activeVehicle.tank_capacity - activeVehicle.fuel_level)}
            onConfirm={handleConfirmFuel}
            onClose={() => setIsFuelModalOpen(false)}
          />
        )}

        {isKmModalOpen && (
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
        )}

        {isFuelLevelModalOpen && (
          <NumericModal
            isOpen={isFuelLevelModalOpen}
            title="Nível Atual do Tanque"
            subtitle={`Capacidade total do veículo: ${activeVehicle.tank_capacity} Litros`}
            initialValue={activeVehicle.fuel_level}
            unit="Litros"
            allowDecimals={true}
            quickAddOptions={[-10, -5, 5, 10]}
            maxLimit={activeVehicle.tank_capacity}
            onConfirm={handleConfirmFuelLevel}
            onClose={() => setIsFuelLevelModalOpen(false)}
          />
        )}

        {isConsumptionModalOpen && (
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
        )}

        {isVehicleModalOpen && (
          <VehicleModal
            isOpen={isVehicleModalOpen}
            vehicleToEdit={editingVehicle}
            onClose={() => {
              setIsVehicleModalOpen(false);
              setEditingVehicle(null);
            }}
            onSave={handleSaveVehicle}
          />
        )}

        {isPartConfigOpen && (
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
        )}

        {confirmData.isOpen && (
          <ConfirmModal
            isOpen={confirmData.isOpen}
            title={confirmData.title}
            message={confirmData.message}
            onConfirm={confirmData.onConfirm}
            onCancel={() => setConfirmData((prev) => ({ ...prev, isOpen: false }))}
          />
        )}
      </Suspense>
    </div>
  );
}

export default App;
