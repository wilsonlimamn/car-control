import {
  AppSettings,
  CategoryType,
  MaintenanceRecord,
  Part,
  Vehicle,
} from '../types';

export type StoreEngineName = 'sql.js';
export type StorageBackendType = 'indexeddb' | 'localstorage' | 'none';

export interface PersistenceStatus {
  backend: StorageBackendType;
  lastSavedAtMs: number | null;
  lastError: string | null;
  saving: boolean;
  allFailed: boolean;
  engineDetail: string;
}

export interface DataStore {
  readonly engineName: StoreEngineName;
  init(): Promise<void>;
  getPersistenceStatus(): PersistenceStatus;
  subscribePersistenceStatus(cb: (status: PersistenceStatus) => void): () => void;
  retryPersistNow(): Promise<boolean>;
  getVehicles(): Promise<Vehicle[]>;
  getActiveVehicle(): Promise<Vehicle | null>;
  setActiveVehicle(vehicleId: number): Promise<void>;
  createVehicle(
    name: string,
    plate: string,
    km: number,
    tank: number,
    consumption: number,
    initialFuelLiters?: number
  ): Promise<Vehicle>;
  updateVehicle(
    vehicleId: number,
    name: string,
    plate: string,
    km?: number,
    tankCapacity?: number,
    avgConsumption?: number
  ): Promise<void>;
  updateVehicleKm(vehicleId: number, newKm: number): Promise<void>;
  updateFuelLevel(vehicleId: number, fuelLevel: number): Promise<void>;
  addFuel(vehicleId: number, addedLitros: number): Promise<void>;
  updateAvgConsumption(vehicleId: number, avgConsumption: number): Promise<void>;
  getParts(vehicleId: number): Promise<Part[]>;
  renewPart(partId: number, currentKm: number, currentDate: string): Promise<void>;
  updatePart(
    partId: number,
    name: string,
    category: CategoryType,
    interval_km: number,
    interval_months: number,
    last_change_km: number,
    last_change_date: string
  ): Promise<void>;
  createPart(
    vehicleId: number,
    name: string,
    category: CategoryType,
    interval_km: number,
    interval_months: number,
    last_change_km: number,
    last_change_date: string
  ): Promise<void>;
  deletePart(partId: number): Promise<void>;
  getHistory(vehicleId: number): Promise<MaintenanceRecord[]>;
  getSettings(): Promise<AppSettings>;
  updateSetting(key: 'theme' | 'bgStyle' | 'githubRepo', val: string): Promise<void>;
  loadSampleData(): Promise<Vehicle>;
  resetToDefaults(): Promise<void>;
  exportSqliteBinary(): Promise<Uint8Array>;
  restoreSqliteBinary(bytes: Uint8Array): Promise<boolean>;
}
