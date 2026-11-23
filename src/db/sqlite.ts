import type { Database, SqlJsStatic } from 'sql.js';
import { AppSettings, CategoryType, MaintenanceRecord, Part, ThemeType, BgStyleType, Vehicle } from '../types';

const LS_KEY = 'car_control_store_v1';
const IDB_NAME = 'car_control_indexeddb';
const IDB_STORE = 'sqlite_store';
const IDB_JSON_KEY = 'car_control_json_v1';
const IDB_LEGACY_SQLITE_KEY = 'car_control_sqlite_file';

interface StoreState {
  nextVehicleId: number;
  nextPartId: number;
  nextHistoryId: number;
  vehicles: Vehicle[];
  parts: Part[];
  history: MaintenanceRecord[];
  settings: Record<string, string>;
}

let storeState: StoreState | null = null;
let SQL: SqlJsStatic | null = null;

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível'));
      return;
    }
    const timer = setTimeout(() => {
      reject(new Error('Timeout ao abrir IndexedDB'));
    }, 2500);

    try {
      const request = indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      request.onsuccess = () => {
        clearTimeout(timer);
        resolve(request.result);
      };
      request.onerror = () => {
        clearTimeout(timer);
        reject(request.error);
      };
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}

async function idbGet<T = unknown>(key: string): Promise<T | null> {
  try {
    const idb = await openIndexedDb();
    return await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 2500);
      try {
        const transaction = idb.transaction(IDB_STORE, 'readonly');
        const store = transaction.objectStore(IDB_STORE);
        const request = store.get(key);
        request.onsuccess = () => {
          clearTimeout(timer);
          resolve((request.result as T) ?? null);
        };
        request.onerror = () => {
          clearTimeout(timer);
          resolve(null);
        };
      } catch {
        clearTimeout(timer);
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

async function idbPut(key: string, value: unknown): Promise<void> {
  try {
    const idb = await openIndexedDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = idb.transaction(IDB_STORE, 'readwrite');
      const store = transaction.objectStore(IDB_STORE);
      const request = store.put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('IndexedDB save skipped:', err);
  }
}

function persistState(): void {
  if (!storeState) return;
  const serialized = JSON.stringify(storeState);
  try {
    localStorage.setItem(LS_KEY, serialized);
  } catch (err) {
    console.warn('localStorage save failed:', err);
  }
  void idbPut(IDB_JSON_KEY, serialized);
}

function createEmptyState(): StoreState {
  return {
    nextVehicleId: 1,
    nextPartId: 1,
    nextHistoryId: 1,
    vehicles: [],
    parts: [],
    history: [],
    settings: {
      theme: 'navy',
      bgStyle: 'gradient',
    },
  };
}

function createSeedState(): StoreState {
  const currentKm = 78450;
  const today = new Date();
  const todayIso = today.toISOString().split('T')[0];

  const pastMonthsDate = (months: number): string => {
    const d = new Date(today);
    d.setMonth(d.getMonth() - months);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const vehicle: Vehicle = {
    id: 1,
    name: 'Civic Touring 1.5 Turbo',
    plate: 'BRA-2E19',
    current_km: currentKm,
    tank_capacity: 56,
    fuel_level: 38,
    avg_consumption: 11.8,
    is_active: 1,
  };

  const rawParts: [string, CategoryType, number, number, number, string][] = [
    ['Óleo do Motor', 'motor', 10000, 12, 71000, pastMonthsDate(6)],
    ['Filtro de Óleo', 'motor', 10000, 12, 71000, pastMonthsDate(6)],
    ['Filtro de Ar do Motor', 'motor', 15000, 12, 66000, pastMonthsDate(10)],
    ['Filtro de Combustível', 'motor', 15000, 12, 64200, pastMonthsDate(11)],
    ['Velas de Ignição', 'motor', 40000, 36, 55000, pastMonthsDate(18)],
    ['Correia Dentada / Acessórios', 'motor', 60000, 48, 40000, pastMonthsDate(28)],
    ['Líquido de Arrefecimento', 'motor', 40000, 24, 62000, pastMonthsDate(14)],
    ['Pastilhas de Freio Dianteiras', 'freios', 25000, 24, 62500, pastMonthsDate(16)],
    ['Discos de Freio Dianteiros', 'freios', 50000, 36, 40000, pastMonthsDate(26)],
    ['Fluido de Freio (DOT 4)', 'freios', 20000, 24, 60000, pastMonthsDate(22)],
    ['Bateria 12V', 'eletrica', 0, 30, 45000, pastMonthsDate(32)],
    ['Palhetas do Limpador', 'eletrica', 0, 12, 72000, pastMonthsDate(6)],
    ['Alinhamento', 'pneus', 10000, 6, currentKm, todayIso],
    ['Pneus (Rodízio & Balanceamento)', 'pneus', 10000, 6, 69200, pastMonthsDate(5)],
    ['Pneus (Troca Completa)', 'pneus', 50000, 48, 48000, pastMonthsDate(24)],
  ];

  const parts: Part[] = rawParts.map((p, idx) => ({
    id: idx + 1,
    vehicle_id: 1,
    name: p[0],
    category: p[1],
    interval_km: p[2],
    interval_months: p[3],
    last_change_km: p[4],
    last_change_date: p[5],
  }));

  const history: MaintenanceRecord[] = [
    { id: 1, vehicle_id: 1, part_name: 'Óleo do Motor & Filtro', change_km: 71000, change_date: pastMonthsDate(6) },
    { id: 2, vehicle_id: 1, part_name: 'Pastilhas de Freio', change_km: 62500, change_date: pastMonthsDate(16) },
    { id: 3, vehicle_id: 1, part_name: 'Velas de Ignição', change_km: 55000, change_date: pastMonthsDate(18) },
  ];

  return {
    nextVehicleId: 2,
    nextPartId: parts.length + 1,
    nextHistoryId: history.length + 1,
    vehicles: [vehicle],
    parts,
    history,
    settings: {
      theme: 'navy',
      bgStyle: 'gradient',
    },
  };
}

export function loadSampleData(): Vehicle {
  const currentTheme = storeState?.settings?.theme || 'navy';
  const currentBg = storeState?.settings?.bgStyle || 'gradient';
  const currentRepo = storeState?.settings?.githubRepo;
  storeState = createSeedState();
  storeState.settings.theme = currentTheme;
  storeState.settings.bgStyle = currentBg;
  if (currentRepo) storeState.settings.githubRepo = currentRepo;
  persistState();
  return storeState.vehicles[0];
}

function ensureAlinhamentoPart(state: StoreState): void {
  const todayStr = new Date().toISOString().split('T')[0];
  for (const v of state.vehicles) {
    const hasAlinhamento = state.parts.some(
      (p) => p.vehicle_id === v.id && p.name.toLowerCase() === 'alinhamento'
    );
    if (!hasAlinhamento) {
      state.parts.push({
        id: state.nextPartId++,
        vehicle_id: v.id,
        name: 'Alinhamento',
        category: 'pneus',
        interval_km: 10000,
        interval_months: 6,
        last_change_km: v.current_km || 0,
        last_change_date: todayStr,
      });
    }
  }
}

async function loadSqlJsEngine(): Promise<SqlJsStatic> {
  if (SQL) return SQL;
  const { default: initSqlJs } = await import('sql.js');
  let wasmBinary: ArrayBuffer | undefined;
  try {
    const res = await fetch('/sql-wasm.wasm');
    if (res.ok) {
      wasmBinary = await res.arrayBuffer();
    }
  } catch {
    // Fallback to locateFile below
  }

  SQL = await initSqlJs({
    ...(wasmBinary ? { wasmBinary } : {}),
    locateFile: (file) => (file.endsWith('.wasm') ? '/sql-wasm.wasm' : file),
  });
  return SQL;
}

function extractStoreFromSqliteDb(db: Database): StoreState {
  const vehiclesRes = db.exec('SELECT * FROM vehicles ORDER BY id ASC');
  const vehicles: Vehicle[] = [];
  if (vehiclesRes[0]) {
    const cols = vehiclesRes[0].columns;
    for (const row of vehiclesRes[0].values) {
      const obj: Record<string, unknown> = {};
      cols.forEach((c, i) => (obj[c] = row[i]));
      vehicles.push(obj as unknown as Vehicle);
    }
  }

  const partsRes = db.exec('SELECT * FROM parts ORDER BY id ASC');
  const parts: Part[] = [];
  if (partsRes[0]) {
    const cols = partsRes[0].columns;
    for (const row of partsRes[0].values) {
      const obj: Record<string, unknown> = {};
      cols.forEach((c, i) => (obj[c] = row[i]));
      parts.push(obj as unknown as Part);
    }
  }

  const histRes = db.exec('SELECT * FROM maintenance_history ORDER BY id ASC');
  const history: MaintenanceRecord[] = [];
  if (histRes[0]) {
    const cols = histRes[0].columns;
    for (const row of histRes[0].values) {
      const obj: Record<string, unknown> = {};
      cols.forEach((c, i) => (obj[c] = row[i]));
      history.push(obj as unknown as MaintenanceRecord);
    }
  }

  const settingsRes = db.exec('SELECT key, value FROM settings');
  const settings: Record<string, string> = {};
  if (settingsRes[0]) {
    for (const row of settingsRes[0].values) {
      settings[String(row[0])] = String(row[1]);
    }
  }

  const maxV = vehicles.reduce((m, v) => Math.max(m, v.id), 0);
  const maxP = parts.reduce((m, p) => Math.max(m, p.id), 0);
  const maxH = history.reduce((m, h) => Math.max(m, h.id), 0);

  return {
    nextVehicleId: maxV + 1,
    nextPartId: maxP + 1,
    nextHistoryId: maxH + 1,
    vehicles,
    parts,
    history,
    settings,
  };
}

/**
 * Initialize fast zero-WASM local store (localStorage + IndexedDB)
 */
export async function initDatabase(): Promise<StoreState> {
  if (storeState) return storeState;

  // 1. Try instant synchronous localStorage first
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoreState;
      if (parsed && Array.isArray(parsed.vehicles)) {
        ensureAlinhamentoPart(parsed);
        storeState = parsed;
        return storeState;
      }
    }
  } catch (err) {
    console.warn('Could not read localStorage store:', err);
  }

  // 2. Try IndexedDB JSON mirror
  const idbJson = await idbGet<string>(IDB_JSON_KEY);
  if (typeof idbJson === 'string' && idbJson.length > 0) {
    try {
      const parsed = JSON.parse(idbJson) as StoreState;
      if (parsed && Array.isArray(parsed.vehicles)) {
        ensureAlinhamentoPart(parsed);
        storeState = parsed;
        persistState();
        return storeState;
      }
    } catch (err) {
      console.warn('Could not parse IndexedDB JSON store:', err);
    }
  }

  // 3. Migrate legacy SQLite binary ONLY if one already exists in IndexedDB
  const legacyBinary = await idbGet<Uint8Array | ArrayBuffer>(IDB_LEGACY_SQLITE_KEY);
  if (legacyBinary) {
    try {
      const bytes = legacyBinary instanceof Uint8Array ? legacyBinary : new Uint8Array(legacyBinary);
      if (bytes.length > 0) {
        const sqlEngine = await loadSqlJsEngine();
        const legacyDb = new sqlEngine.Database(bytes);
        const migrated = extractStoreFromSqliteDb(legacyDb);
        legacyDb.close();
        if (migrated.vehicles.length > 0) {
          ensureAlinhamentoPart(migrated);
          storeState = migrated;
          persistState();
          return storeState;
        }
      }
    } catch (err) {
      console.warn('Legacy SQLite migration skipped:', err);
    }
  }

  // 4. Fresh install: start with no vehicles so onboarding lets the user enter their car data
  storeState = createEmptyState();
  persistState();
  return storeState;
}

export function getVehicles(): Vehicle[] {
  if (!storeState) return [];
  return [...storeState.vehicles].sort((a, b) => a.id - b.id);
}

export function getActiveVehicle(): Vehicle | null {
  const list = getVehicles();
  return list.find((v) => v.is_active === 1) || list[0] || null;
}

export function setActiveVehicle(vehicleId: number): void {
  if (!storeState) return;
  storeState.vehicles = storeState.vehicles.map((v) => ({
    ...v,
    is_active: v.id === vehicleId ? 1 : 0,
  }));
  persistState();
}

export function createVehicle(
  name: string,
  plate: string,
  km: number,
  tank: number,
  consumption: number,
  initialFuelLiters?: number
): Vehicle {
  if (!storeState) throw new Error('Database not initialized');
  storeState.vehicles = storeState.vehicles.map((v) => ({ ...v, is_active: 0 }));

  const fuelLevel =
    initialFuelLiters !== undefined
      ? Math.min(tank, Math.max(0, initialFuelLiters))
      : Math.round(tank * 0.7);

  const newVehicle: Vehicle = {
    id: storeState.nextVehicleId++,
    name,
    plate,
    current_km: km,
    tank_capacity: tank,
    fuel_level: fuelLevel,
    avg_consumption: consumption,
    is_active: 1,
  };
  storeState.vehicles.push(newVehicle);

  const templateParts: [string, CategoryType, number, number][] = [
    ['Óleo do Motor', 'motor', 10000, 6],
    ['Filtro de Óleo', 'motor', 10000, 6],
    ['Filtro de Ar do Motor', 'motor', 15000, 12],
    ['Filtro de Combustível', 'motor', 15000, 12],
    ['Correia Dentada', 'motor', 30000, 36],
    ['Velas de Ignição', 'motor', 40000, 36],
    ['Pastilhas de Freio Dianteiras', 'freios', 25000, 24],
    ['Fluido de Freio (DOT 4)', 'freios', 20000, 24],
    ['Bateria 12V', 'eletrica', 0, 30],
    ['Palhetas do Limpador', 'eletrica', 0, 12],
    ['Alinhamento', 'pneus', 10000, 6],
    ['Pneus (Rodízio & Balanceamento)', 'pneus', 10000, 6],
    ['Pneus (Troca Completa)', 'pneus', 40000, 24],
  ];

  const todayStr = new Date().toISOString().split('T')[0];
  for (const tp of templateParts) {
    storeState.parts.push({
      id: storeState.nextPartId++,
      vehicle_id: newVehicle.id,
      name: tp[0],
      category: tp[1],
      interval_km: tp[2],
      interval_months: tp[3],
      last_change_km: km,
      last_change_date: todayStr,
    });
  }

  persistState();
  return newVehicle;
}

export function updateVehicle(
  vehicleId: number,
  name: string,
  plate: string,
  km?: number,
  tankCapacity?: number,
  avgConsumption?: number
): void {
  if (!storeState) return;
  storeState.vehicles = storeState.vehicles.map((v) => {
    if (v.id !== vehicleId) return v;
    if (km !== undefined && tankCapacity !== undefined && avgConsumption !== undefined) {
      return {
        ...v,
        name,
        plate,
        current_km: km,
        tank_capacity: tankCapacity,
        avg_consumption: avgConsumption,
      };
    }
    return { ...v, name, plate };
  });
  persistState();
}

export function updateVehicleKm(vehicleId: number, newKm: number): void {
  if (!storeState) return;
  storeState.vehicles = storeState.vehicles.map((v) =>
    v.id === vehicleId ? { ...v, current_km: newKm } : v
  );
  persistState();
}

export function updateFuelLevel(vehicleId: number, fuelLevel: number): void {
  if (!storeState) return;
  storeState.vehicles = storeState.vehicles.map((v) =>
    v.id === vehicleId ? { ...v, fuel_level: fuelLevel } : v
  );
  persistState();
}

export function addFuel(vehicleId: number, addedLitros: number): void {
  if (!storeState) return;
  storeState.vehicles = storeState.vehicles.map((v) => {
    if (v.id !== vehicleId) return v;
    const newFuel = Math.min(v.tank_capacity, v.fuel_level + addedLitros);
    return { ...v, fuel_level: newFuel };
  });
  persistState();
}

export function updateAvgConsumption(vehicleId: number, avgConsumption: number): void {
  if (!storeState) return;
  storeState.vehicles = storeState.vehicles.map((v) =>
    v.id === vehicleId ? { ...v, avg_consumption: avgConsumption } : v
  );
  persistState();
}

export function getParts(vehicleId: number): Part[] {
  if (!storeState) return [];
  return storeState.parts.filter((p) => p.vehicle_id === vehicleId).sort((a, b) => a.id - b.id);
}

export function renewPart(partId: number, currentKm: number, currentDate: string): void {
  if (!storeState) return;
  const part = storeState.parts.find((p) => p.id === partId);
  if (!part) return;

  part.last_change_km = currentKm;
  part.last_change_date = currentDate;

  storeState.history.push({
    id: storeState.nextHistoryId++,
    vehicle_id: part.vehicle_id,
    part_name: part.name,
    change_km: currentKm,
    change_date: currentDate,
  });

  persistState();
}

export function updatePart(
  partId: number,
  name: string,
  category: CategoryType,
  interval_km: number,
  interval_months: number,
  last_change_km: number,
  last_change_date: string
): void {
  if (!storeState) return;
  storeState.parts = storeState.parts.map((p) =>
    p.id === partId
      ? { ...p, name, category, interval_km, interval_months, last_change_km, last_change_date }
      : p
  );
  persistState();
}

export function createPart(
  vehicleId: number,
  name: string,
  category: CategoryType,
  interval_km: number,
  interval_months: number,
  last_change_km: number,
  last_change_date: string
): void {
  if (!storeState) return;
  storeState.parts.push({
    id: storeState.nextPartId++,
    vehicle_id: vehicleId,
    name,
    category,
    interval_km,
    interval_months,
    last_change_km,
    last_change_date,
  });
  persistState();
}

export function deletePart(partId: number): void {
  if (!storeState) return;
  storeState.parts = storeState.parts.filter((p) => p.id !== partId);
  persistState();
}

export function getHistory(vehicleId: number): MaintenanceRecord[] {
  if (!storeState) return [];
  return storeState.history
    .filter((h) => h.vehicle_id === vehicleId)
    .sort((a, b) => b.id - a.id)
    .slice(0, 50);
}

export function getSettings(): AppSettings {
  const defaultRepo = (import.meta.env.VITE_GITHUB_REPO as string | undefined) || 'wilsonlimamn/car-control';
  if (!storeState) return { theme: 'amber', bgStyle: 'gradient', githubRepo: defaultRepo };

  const rawTheme = storeState.settings.theme || 'amber';
  const theme: ThemeType = (rawTheme === 'lime' ? 'navy' : rawTheme) as ThemeType;

  const rawBg = storeState.settings.bgStyle || 'gradient';
  let bgStyle: BgStyleType = 'gradient';
  if (rawBg === 'atmosphere') bgStyle = 'gradient';
  else if (rawBg === 'carbon' || rawBg === 'midnight') bgStyle = 'gray';
  else if (rawBg === 'white' || rawBg === 'gray' || rawBg === 'gradient' || rawBg === 'oled') bgStyle = rawBg;

  const githubRepo = storeState.settings.githubRepo || defaultRepo;
  return { theme, bgStyle, githubRepo };
}

export function updateSetting(key: 'theme' | 'bgStyle' | 'githubRepo', val: string): void {
  if (!storeState) return;
  storeState.settings[key] = val;
  persistState();
}

/**
 * Lazy SQLite binary export (only loads sql.js when user clicks Export)
 */
export async function exportSqliteBinary(): Promise<Uint8Array> {
  if (!storeState) throw new Error('Database not initialized');
  const sqlEngine = await loadSqlJsEngine();
  const db = new sqlEngine.Database();

  db.run(`
    CREATE TABLE vehicles (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      plate TEXT,
      current_km INTEGER NOT NULL,
      tank_capacity REAL NOT NULL,
      fuel_level REAL NOT NULL,
      avg_consumption REAL NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE parts (
      id INTEGER PRIMARY KEY,
      vehicle_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      interval_km INTEGER NOT NULL,
      interval_months INTEGER NOT NULL,
      last_change_km INTEGER NOT NULL,
      last_change_date TEXT NOT NULL
    );
    CREATE TABLE maintenance_history (
      id INTEGER PRIMARY KEY,
      vehicle_id INTEGER NOT NULL,
      part_name TEXT NOT NULL,
      change_km INTEGER NOT NULL,
      change_date TEXT NOT NULL
    );
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  for (const v of storeState.vehicles) {
    db.run(
      'INSERT INTO vehicles (id, name, plate, current_km, tank_capacity, fuel_level, avg_consumption, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [v.id, v.name, v.plate || '', v.current_km, v.tank_capacity, v.fuel_level, v.avg_consumption, v.is_active]
    );
  }
  for (const p of storeState.parts) {
    db.run(
      'INSERT INTO parts (id, vehicle_id, name, category, interval_km, interval_months, last_change_km, last_change_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [p.id, p.vehicle_id, p.name, p.category, p.interval_km, p.interval_months, p.last_change_km, p.last_change_date]
    );
  }
  for (const h of storeState.history) {
    db.run(
      'INSERT INTO maintenance_history (id, vehicle_id, part_name, change_km, change_date) VALUES (?, ?, ?, ?, ?)',
      [h.id, h.vehicle_id, h.part_name, h.change_km, h.change_date]
    );
  }
  for (const [k, val] of Object.entries(storeState.settings)) {
    db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [k, val]);
  }

  const binary = db.export();
  db.close();
  return binary;
}

/**
 * Lazy SQLite binary restore
 */
export async function restoreSqliteBinary(bytes: Uint8Array): Promise<boolean> {
  const sqlEngine = await loadSqlJsEngine();
  try {
    const testDb = new sqlEngine.Database(bytes);
    const testRes = testDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='vehicles'");
    if (!testRes[0] || testRes[0].values.length === 0) {
      testDb.close();
      throw new Error('Arquivo de backup inválido: tabela vehicles não encontrada');
    }

    const restored = extractStoreFromSqliteDb(testDb);
    testDb.close();
    ensureAlinhamentoPart(restored);
    storeState = restored;
    persistState();
    return true;
  } catch (err) {
    console.error('Falha ao restaurar banco de dados:', err);
    throw err;
  }
}

/**
 * Export CSV with BOM UTF-8 (\uFEFF) and ; separator
 */
export function exportCsvReport(vehicle: Vehicle, parts: Part[], history: MaintenanceRecord[]): string {
  const lines: string[] = [];
  const BOM = '\uFEFF';

  lines.push('RELATÓRIO DE MANUTENÇÃO - AUTO EM DIA (CAR CONTROL)');
  lines.push(`Veículo;${vehicle.name};Placa;${vehicle.plate};Odômetro Atual;${vehicle.current_km} km;Gerado em;${new Date().toLocaleString('pt-BR')}`);
  lines.push('');
  lines.push('STATUS DAS PEÇAS CADASTRADAS');
  lines.push('Peça;Categoria;Intervalo KM;Intervalo Meses;Última Troca KM;Última Troca Data;Km Rodados;Meses Decorridos;Desgaste %;Status');

  const today = new Date();
  for (const p of parts) {
    const kmDriven = Math.max(0, vehicle.current_km - p.last_change_km);
    const monthsPassed = Math.round(
      (today.getFullYear() - new Date(p.last_change_date).getFullYear()) * 12 +
      (today.getMonth() - new Date(p.last_change_date).getMonth())
    );

    const wearByKm = p.interval_km > 0 ? (kmDriven / p.interval_km) * 100 : 0;
    const wearByTime = p.interval_months > 0 ? (monthsPassed / p.interval_months) * 100 : 0;
    const wear = Math.round(Math.max(wearByKm, wearByTime));

    let statusText = 'Em dia';
    if (wear >= 100) statusText = 'Vencida';
    else if (wear >= 80) statusText = 'Trocar em breve';

    lines.push(
      `"${p.name}";"${p.category}";${p.interval_km};${p.interval_months};${p.last_change_km};"${p.last_change_date}";${kmDriven};${monthsPassed};${wear}%;"${statusText}"`
    );
  }

  lines.push('');
  lines.push('HISTÓRICO DE TROCAS REALIZADAS');
  lines.push('ID;Peça;KM no Momento da Troca;Data da Troca');

  for (const h of history) {
    lines.push(`${h.id};"${h.part_name}";${h.change_km} km;"${h.change_date}"`);
  }

  return BOM + lines.join('\r\n');
}

export async function requestStoragePersistence(): Promise<{ supported: boolean; persisted: boolean }> {
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

export function resetToDefaults(): void {
  storeState = createEmptyState();
  persistState();
}
