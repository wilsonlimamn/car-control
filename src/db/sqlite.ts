import { AppSettings, CategoryType, MaintenanceRecord, Part, Vehicle } from '../types';
import { recordBootStep } from '../utils/diagnostics';
import {
  AutoBackupEntry,
  getCachedLastBackupInfo,
  listAutoBackups,
  markManualFactoryReset,
  restoreFromAutoBackup,
  runImmediateAutoBackup,
  scheduleAutoBackup,
  tryAutoRestoreIfEmpty,
} from './backupManager';
import { readSavedStorageMeta } from './legacyIndexedDb';
import { buildCsvReport } from './schema';
import { DataStore, PersistenceStatus } from './types';

let activeStore: DataStore | null = null;
let storeInitPromise: Promise<DataStore> | null = null;
let autoRestoredBannerDate: string | null = null;

const statusSubscribers: Array<(status: PersistenceStatus) => void> = [];
let storeUnsubscribe: (() => void) | null = null;

function broadcastStatus(status: PersistenceStatus): void {
  for (const cb of statusSubscribers) {
    try {
      cb(status);
    } catch {
      // Ignore
    }
  }
}

export function isNativeCapacitorPlatform(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

async function createStoreInstance(): Promise<DataStore> {
  const { SqlJsStore } = await import('./sqlJsStore');
  return new SqlJsStore();
}

async function getReadyStore(): Promise<DataStore> {
  if (activeStore) return activeStore;
  if (storeInitPromise) return storeInitPromise;

  storeInitPromise = (async () => {
    const store = await createStoreInstance();
    if (storeUnsubscribe) {
      storeUnsubscribe();
    }
    storeUnsubscribe = store.subscribePersistenceStatus((st) => {
      broadcastStatus(st);
    });

    await store.init();
    activeStore = store;
    broadcastStatus(store.getPersistenceStatus());

    // If database is empty and an auto-backup exists, restore automatically
    const autoRes = await tryAutoRestoreIfEmpty(store);
    if (autoRes.restored && autoRes.dateText) {
      autoRestoredBannerDate = autoRes.dateText;
      recordBootStep(`Backup automático restaurado (${autoRes.dateText})`);
    }

    return store;
  })();

  try {
    return await storeInitPromise;
  } catch (err) {
    storeInitPromise = null;
    throw err;
  }
}

export async function initDatabase(): Promise<DataStore> {
  return getReadyStore();
}

export function getPersistenceStatus(): PersistenceStatus {
  if (activeStore) {
    return activeStore.getPersistenceStatus();
  }
  const meta = readSavedStorageMeta();
  return {
    backend: meta?.backend || 'none',
    lastSavedAtMs: meta?.savedAtMs || null,
    lastError: null,
    saving: false,
    allFailed: false,
    engineDetail: 'sql.js',
  };
}

export function subscribePersistenceStatus(cb: (status: PersistenceStatus) => void): () => void {
  statusSubscribers.push(cb);
  cb(getPersistenceStatus());
  return () => {
    const idx = statusSubscribers.indexOf(cb);
    if (idx !== -1) {
      statusSubscribers.splice(idx, 1);
    }
  };
}

export async function retryPersistDatabaseNow(): Promise<boolean> {
  const store = await getReadyStore();
  return store.retryPersistNow();
}

export function getAutoRestoredBackupDate(): string | null {
  return autoRestoredBannerDate;
}

export function clearAutoRestoredBackupDate(): void {
  autoRestoredBannerDate = null;
}

export function getActiveStoreEngineName(): string {
  return activeStore?.engineName || 'sql.js';
}

export async function getVehicles(): Promise<Vehicle[]> {
  const store = await getReadyStore();
  return store.getVehicles();
}

export async function getActiveVehicle(): Promise<Vehicle | null> {
  const store = await getReadyStore();
  return store.getActiveVehicle();
}

export async function setActiveVehicle(vehicleId: number): Promise<void> {
  const store = await getReadyStore();
  await store.setActiveVehicle(vehicleId);
  scheduleAutoBackup(store);
}

export async function createVehicle(
  name: string,
  plate: string,
  km: number,
  tank: number,
  consumption: number,
  initialFuelLiters?: number
): Promise<Vehicle> {
  const store = await getReadyStore();
  markManualFactoryReset(false);
  const v = await store.createVehicle(name, plate, km, tank, consumption, initialFuelLiters);
  scheduleAutoBackup(store);
  return v;
}

export async function updateVehicle(
  vehicleId: number,
  name: string,
  plate: string,
  km?: number,
  tankCapacity?: number,
  avgConsumption?: number
): Promise<void> {
  const store = await getReadyStore();
  await store.updateVehicle(vehicleId, name, plate, km, tankCapacity, avgConsumption);
  scheduleAutoBackup(store);
}

export async function updateVehicleKm(vehicleId: number, newKm: number): Promise<void> {
  const store = await getReadyStore();
  await store.updateVehicleKm(vehicleId, newKm);
  scheduleAutoBackup(store);
}

export async function updateFuelLevel(vehicleId: number, fuelLevel: number): Promise<void> {
  const store = await getReadyStore();
  await store.updateFuelLevel(vehicleId, fuelLevel);
  scheduleAutoBackup(store);
}

export async function addFuel(vehicleId: number, addedLitros: number): Promise<void> {
  const store = await getReadyStore();
  await store.addFuel(vehicleId, addedLitros);
  scheduleAutoBackup(store);
}

export async function updateAvgConsumption(vehicleId: number, avgConsumption: number): Promise<void> {
  const store = await getReadyStore();
  await store.updateAvgConsumption(vehicleId, avgConsumption);
  scheduleAutoBackup(store);
}

export async function getParts(vehicleId: number): Promise<Part[]> {
  const store = await getReadyStore();
  return store.getParts(vehicleId);
}

export async function renewPart(partId: number, currentKm: number, currentDate: string): Promise<void> {
  const store = await getReadyStore();
  await store.renewPart(partId, currentKm, currentDate);
  scheduleAutoBackup(store);
}

export async function updatePart(
  partId: number,
  name: string,
  category: CategoryType,
  interval_km: number,
  interval_months: number,
  last_change_km: number,
  last_change_date: string
): Promise<void> {
  const store = await getReadyStore();
  await store.updatePart(
    partId,
    name,
    category,
    interval_km,
    interval_months,
    last_change_km,
    last_change_date
  );
  scheduleAutoBackup(store);
}

export async function createPart(
  vehicleId: number,
  name: string,
  category: CategoryType,
  interval_km: number,
  interval_months: number,
  last_change_km: number,
  last_change_date: string
): Promise<void> {
  const store = await getReadyStore();
  await store.createPart(
    vehicleId,
    name,
    category,
    interval_km,
    interval_months,
    last_change_km,
    last_change_date
  );
  scheduleAutoBackup(store);
}

export async function deletePart(partId: number): Promise<void> {
  const store = await getReadyStore();
  await store.deletePart(partId);
  scheduleAutoBackup(store);
}

export async function getHistory(vehicleId: number): Promise<MaintenanceRecord[]> {
  const store = await getReadyStore();
  return store.getHistory(vehicleId);
}

export async function getSettings(): Promise<AppSettings> {
  const store = await getReadyStore();
  return store.getSettings();
}

export async function updateSetting(
  key: 'theme' | 'bgStyle' | 'githubRepo',
  val: string
): Promise<void> {
  const store = await getReadyStore();
  await store.updateSetting(key, val);
  scheduleAutoBackup(store);
}

export async function loadSampleData(): Promise<Vehicle> {
  const store = await getReadyStore();
  markManualFactoryReset(false);
  const v = await store.loadSampleData();
  scheduleAutoBackup(store);
  return v;
}

export async function resetToDefaults(): Promise<void> {
  const store = await getReadyStore();
  markManualFactoryReset(true);
  await store.resetToDefaults();
}

export async function exportSqliteBinary(): Promise<Uint8Array> {
  const store = await getReadyStore();
  return store.exportSqliteBinary();
}

export async function restoreSqliteBinary(bytes: Uint8Array): Promise<boolean> {
  const store = await getReadyStore();
  markManualFactoryReset(false);
  const ok = await store.restoreSqliteBinary(bytes);
  if (ok) {
    scheduleAutoBackup(store);
  }
  return ok;
}

export async function getAutoBackupStatus(): Promise<{
  lastBackup: AutoBackupEntry | null;
  backups: AutoBackupEntry[];
}> {
  const backups = await listAutoBackups();
  return {
    lastBackup: backups[0] || getCachedLastBackupInfo(),
    backups,
  };
}

export async function triggerManualAutoBackupSnapshot(): Promise<AutoBackupEntry | null> {
  const store = await getReadyStore();
  return runImmediateAutoBackup(store);
}

export async function restoreLatestAutoBackup(
  backupId?: string
): Promise<{ restored: boolean; entry?: AutoBackupEntry }> {
  const store = await getReadyStore();
  return restoreFromAutoBackup(store, backupId);
}

export function exportCsvReport(
  vehicle: Vehicle,
  parts: Part[],
  history: MaintenanceRecord[]
): string {
  return buildCsvReport(vehicle, parts, history);
}

export async function requestStoragePersistence(): Promise<{
  supported: boolean;
  persisted: boolean;
}> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    const isPersisted = await navigator.storage.persisted();
    if (isPersisted) {
      return { supported: true, persisted: true };
    }
    const granted = await navigator.storage.persist();
    return { supported: true, persisted: granted };
  }
  return { supported: false, persisted: false };
}
