import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { AppSettings, MaintenanceRecord, Part, Vehicle } from '../types';

const IDB_NAME = 'car_control_indexeddb';
const IDB_STORE = 'sqlite_store';
const IDB_KEY = 'car_control_sqlite_file';

let SQL: SqlJsStatic | null = null;
let dbInstance: Database | null = null;

// IndexedDB helpers
function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadFromIndexedDb(): Promise<Uint8Array | null> {
  try {
    const idb = await openIndexedDb();
    return new Promise((resolve) => {
      const transaction = idb.transaction(IDB_STORE, 'readonly');
      const store = transaction.objectStore(IDB_STORE);
      const request = store.get(IDB_KEY);
      request.onsuccess = () => {
        if (request.result instanceof Uint8Array) {
          resolve(request.result);
        } else if (request.result instanceof ArrayBuffer) {
          resolve(new Uint8Array(request.result));
        } else {
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function saveToIndexedDb(data: Uint8Array): Promise<void> {
  try {
    const idb = await openIndexedDb();
    return new Promise((resolve, reject) => {
      const transaction = idb.transaction(IDB_STORE, 'readwrite');
      const store = transaction.objectStore(IDB_STORE);
      const request = store.put(data, IDB_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Failed to save to IndexedDB', err);
  }
}

function persistDb(): void {
  if (!dbInstance) return;
  try {
    const binary = dbInstance.export();
    saveToIndexedDb(binary);
  } catch (err) {
    console.error('Error exporting SQLite database:', err);
  }
}

/**
 * Initialize SQLite via sql.js with local wasm and IndexedDB persistence
 */
export async function initDatabase(): Promise<Database> {
  if (dbInstance) return dbInstance;

  if (!SQL) {
    SQL = await initSqlJs({
      locateFile: (file) => (file.endsWith('.wasm') ? '/sql-wasm.wasm' : file),
    });
  }

  const savedData = await loadFromIndexedDb();

  if (savedData && savedData.length > 0) {
    try {
      dbInstance = new SQL.Database(savedData);
      // Run migrations in case of missing columns/tables
      ensureTables(dbInstance);
      persistDb();
      return dbInstance;
    } catch (e) {
      console.warn('Could not restore database from IndexedDB, creating fresh:', e);
    }
  }

  // Create fresh database
  dbInstance = new SQL.Database();
  ensureTables(dbInstance);
  seedDefaultData(dbInstance);
  persistDb();

  return dbInstance;
}

function ensureTables(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      plate TEXT,
      current_km INTEGER NOT NULL,
      tank_capacity REAL NOT NULL,
      fuel_level REAL NOT NULL,
      avg_consumption REAL NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      interval_km INTEGER NOT NULL,
      interval_months INTEGER NOT NULL,
      last_change_km INTEGER NOT NULL,
      last_change_date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS maintenance_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL,
      part_name TEXT NOT NULL,
      change_km INTEGER NOT NULL,
      change_date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Ensure "Alinhamento" part exists for all vehicles (requirement 1)
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const vRes = db.exec('SELECT id, current_km FROM vehicles');
    if (vRes[0]) {
      for (const row of vRes[0].values) {
        const vId = row[0] as number;
        const currentKm = (row[1] as number) || 0;
        const checkPart = db.exec(
          `SELECT id FROM parts WHERE vehicle_id = ${vId} AND lower(name) = 'alinhamento'`
        );
        if (!checkPart[0] || checkPart[0].values.length === 0) {
          db.run(
            `INSERT INTO parts (vehicle_id, name, category, interval_km, interval_months, last_change_km, last_change_date)
             VALUES (?, 'Alinhamento', 'pneus', 10000, 6, ?, ?)`,
            [vId, currentKm, todayStr]
          );
        }
      }
    }
  } catch (err) {
    console.warn('Could not auto-migrate Alinhamento part:', err);
  }
}

function seedDefaultData(db: Database) {
  // Check if vehicles already exist
  const res = db.exec('SELECT count(*) as count FROM vehicles');
  const count = res[0]?.values[0]?.[0] as number;
  if (count > 0) return;

  const currentKm = 78450;
  const today = new Date();

  // Helper for dates in past
  const pastMonthsDate = (months: number): string => {
    const d = new Date(today);
    d.setMonth(d.getMonth() - months);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  db.run(
    `INSERT INTO vehicles (name, plate, current_km, tank_capacity, fuel_level, avg_consumption, is_active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    ['Civic Touring 1.5 Turbo', 'BRA-2E19', currentKm, 56, 38, 11.8]
  );

  const vehicleId = 1;

  // Realistic parts seeded with high contrast states
  const partsList: [string, string, number, number, number, string][] = [
    // [name, category, interval_km, interval_months, last_change_km, last_change_date]
    // Motor
    ['Óleo do Motor', 'motor', 10000, 12, 71000, pastMonthsDate(6)], // 74.5% (Em dia)
    ['Filtro de Óleo', 'motor', 10000, 12, 71000, pastMonthsDate(6)], // 74.5% (Em dia)
    ['Filtro de Ar do Motor', 'motor', 15000, 12, 66000, pastMonthsDate(10)], // 83% (Trocar breve)
    ['Filtro de Combustível', 'motor', 15000, 12, 64200, pastMonthsDate(11)], // 95% (Trocar breve)
    ['Velas de Ignição', 'motor', 40000, 36, 55000, pastMonthsDate(18)], // 58% (Em dia)
    ['Correia Dentada / Acessórios', 'motor', 60000, 48, 40000, pastMonthsDate(28)], // 64% (Em dia)
    ['Líquido de Arrefecimento', 'motor', 40000, 24, 62000, pastMonthsDate(14)], // 58% (Em dia)
    
    // Freios
    ['Pastilhas de Freio Dianteiras', 'freios', 25000, 24, 62500, pastMonthsDate(16)], // 63.8% (Em dia)
    ['Discos de Freio Dianteiros', 'freios', 50000, 36, 40000, pastMonthsDate(26)], // 76.9% (Em dia)
    ['Fluido de Freio (DOT 4)', 'freios', 20000, 24, 60000, pastMonthsDate(22)], // 92.2% (Trocar breve)

    // Elétrica
    ['Bateria 12V', 'eletrica', 0, 30, 45000, pastMonthsDate(32)], // 106% (Vencida!)
    ['Palhetas do Limpador', 'eletrica', 0, 12, 72000, pastMonthsDate(6)], // 50% (Em dia)

    // Pneus & Rodagem
    ['Alinhamento', 'pneus', 10000, 6, currentKm, today.toISOString().split('T')[0]], // 100% em dia hoje
    ['Pneus (Rodízio & Balanceamento)', 'pneus', 10000, 6, 69200, pastMonthsDate(5)], // 92.5% (Trocar breve!)
    ['Pneus (Troca Completa)', 'pneus', 50000, 48, 48000, pastMonthsDate(24)], // 60.9% (Em dia)
  ];

  for (const p of partsList) {
    db.run(
      `INSERT INTO parts (vehicle_id, name, category, interval_km, interval_months, last_change_km, last_change_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [vehicleId, p[0], p[1], p[2], p[3], p[4], p[5]]
    );
  }

  // Seed initial history
  db.run(
    `INSERT INTO maintenance_history (vehicle_id, part_name, change_km, change_date)
     VALUES (?, ?, ?, ?)`,
    [vehicleId, 'Óleo do Motor & Filtro', 71000, pastMonthsDate(6)]
  );
  db.run(
    `INSERT INTO maintenance_history (vehicle_id, part_name, change_km, change_date)
     VALUES (?, ?, ?, ?)`,
    [vehicleId, 'Pastilhas de Freio', 62500, pastMonthsDate(16)]
  );
  db.run(
    `INSERT INTO maintenance_history (vehicle_id, part_name, change_km, change_date)
     VALUES (?, ?, ?, ?)`,
    [vehicleId, 'Velas de Ignição', 55000, pastMonthsDate(18)]
  );

  // Settings
  db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('theme', 'amber')`);
  db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('bgStyle', 'gradient')`);
}

// Data access operations
export function getVehicles(): Vehicle[] {
  if (!dbInstance) return [];
  const res = dbInstance.exec('SELECT * FROM vehicles ORDER BY id ASC');
  if (!res[0]) return [];
  const cols = res[0].columns;
  return res[0].values.map((row) => {
    const obj: Record<string, unknown> = {};
    cols.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj as unknown as Vehicle;
  });
}

export function getActiveVehicle(): Vehicle | null {
  const list = getVehicles();
  return list.find((v) => v.is_active === 1) || list[0] || null;
}

export function setActiveVehicle(vehicleId: number): void {
  if (!dbInstance) return;
  dbInstance.run('UPDATE vehicles SET is_active = 0');
  dbInstance.run('UPDATE vehicles SET is_active = 1 WHERE id = ?', [vehicleId]);
  persistDb();
}

export function createVehicle(name: string, plate: string, km: number, tank: number, consumption: number): Vehicle {
  if (!dbInstance) throw new Error('Database not initialized');
  dbInstance.run('UPDATE vehicles SET is_active = 0');
  dbInstance.run(
    `INSERT INTO vehicles (name, plate, current_km, tank_capacity, fuel_level, avg_consumption, is_active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    [name, plate, km, tank, Math.round(tank * 0.7), consumption]
  );
  persistDb();
  const v = getActiveVehicle();
  if (!v) throw new Error('Failed to retrieve vehicle');

  // Clone standard parts template for new vehicle
  const templateParts: [string, string, number, number][] = [
    ['Óleo do Motor', 'motor', 10000, 12],
    ['Filtro de Óleo', 'motor', 10000, 12],
    ['Filtro de Ar do Motor', 'motor', 15000, 12],
    ['Filtro de Combustível', 'motor', 15000, 12],
    ['Velas de Ignição', 'motor', 40000, 36],
    ['Pastilhas de Freio Dianteiras', 'freios', 25000, 24],
    ['Fluido de Freio (DOT 4)', 'freios', 20000, 24],
    ['Bateria 12V', 'eletrica', 0, 30],
    ['Palhetas do Limpador', 'eletrica', 0, 12],
    ['Alinhamento', 'pneus', 10000, 6],
    ['Pneus (Rodízio & Balanceamento)', 'pneus', 10000, 6],
    ['Pneus (Troca Completa)', 'pneus', 50000, 48],
  ];

  const todayStr = new Date().toISOString().split('T')[0];
  for (const tp of templateParts) {
    dbInstance.run(
      `INSERT INTO parts (vehicle_id, name, category, interval_km, interval_months, last_change_km, last_change_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [v.id, tp[0], tp[1], tp[2], tp[3], km, todayStr]
    );
  }
  persistDb();
  return v;
}

export function updateVehicle(
  vehicleId: number,
  name: string,
  plate: string,
  km?: number,
  tankCapacity?: number,
  avgConsumption?: number
): void {
  if (!dbInstance) return;
  if (km !== undefined && tankCapacity !== undefined && avgConsumption !== undefined) {
    dbInstance.run(
      'UPDATE vehicles SET name = ?, plate = ?, current_km = ?, tank_capacity = ?, avg_consumption = ? WHERE id = ?',
      [name, plate, km, tankCapacity, avgConsumption, vehicleId]
    );
  } else {
    dbInstance.run(
      'UPDATE vehicles SET name = ?, plate = ? WHERE id = ?',
      [name, plate, vehicleId]
    );
  }
  persistDb();
}

export function updateVehicleKm(vehicleId: number, newKm: number): void {
  if (!dbInstance) return;
  dbInstance.run('UPDATE vehicles SET current_km = ? WHERE id = ?', [newKm, vehicleId]);
  persistDb();
}

export function updateFuelLevel(vehicleId: number, fuelLevel: number): void {
  if (!dbInstance) return;
  dbInstance.run('UPDATE vehicles SET fuel_level = ? WHERE id = ?', [fuelLevel, vehicleId]);
  persistDb();
}

export function addFuel(vehicleId: number, addedLitros: number): void {
  if (!dbInstance) return;
  const vehicle = getActiveVehicle();
  if (!vehicle) return;
  const newFuel = Math.min(vehicle.tank_capacity, vehicle.fuel_level + addedLitros);
  dbInstance.run('UPDATE vehicles SET fuel_level = ? WHERE id = ?', [newFuel, vehicleId]);
  persistDb();
}

export function updateAvgConsumption(vehicleId: number, avgConsumption: number): void {
  if (!dbInstance) return;
  dbInstance.run('UPDATE vehicles SET avg_consumption = ? WHERE id = ?', [avgConsumption, vehicleId]);
  persistDb();
}

export function getParts(vehicleId: number): Part[] {
  if (!dbInstance) return [];
  const res = dbInstance.exec('SELECT * FROM parts WHERE vehicle_id = ? ORDER BY id ASC', [vehicleId]);
  if (!res[0]) return [];
  const cols = res[0].columns;
  return res[0].values.map((row) => {
    const obj: Record<string, unknown> = {};
    cols.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj as unknown as Part;
  });
}

/**
 * Renova a peça com o km atual e a data de hoje, e registra no histórico
 */
export function renewPart(partId: number, currentKm: number, currentDate: string): void {
  if (!dbInstance) return;
  const res = dbInstance.exec('SELECT vehicle_id, name FROM parts WHERE id = ?', [partId]);
  if (!res[0] || !res[0].values[0]) return;

  const vehicleId = res[0].values[0][0] as number;
  const partName = res[0].values[0][1] as string;

  dbInstance.run(
    'UPDATE parts SET last_change_km = ?, last_change_date = ? WHERE id = ?',
    [currentKm, currentDate, partId]
  );

  dbInstance.run(
    'INSERT INTO maintenance_history (vehicle_id, part_name, change_km, change_date) VALUES (?, ?, ?, ?)',
    [vehicleId, partName, currentKm, currentDate]
  );

  persistDb();
}

export function updatePart(
  partId: number,
  name: string,
  category: string,
  interval_km: number,
  interval_months: number,
  last_change_km: number,
  last_change_date: string
): void {
  if (!dbInstance) return;
  dbInstance.run(
    `UPDATE parts 
     SET name = ?, category = ?, interval_km = ?, interval_months = ?, last_change_km = ?, last_change_date = ? 
     WHERE id = ?`,
    [name, category, interval_km, interval_months, last_change_km, last_change_date, partId]
  );
  persistDb();
}

export function createPart(
  vehicleId: number,
  name: string,
  category: string,
  interval_km: number,
  interval_months: number,
  last_change_km: number,
  last_change_date: string
): void {
  if (!dbInstance) return;
  dbInstance.run(
    `INSERT INTO parts (vehicle_id, name, category, interval_km, interval_months, last_change_km, last_change_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [vehicleId, name, category, interval_km, interval_months, last_change_km, last_change_date]
  );
  persistDb();
}

export function deletePart(partId: number): void {
  if (!dbInstance) return;
  dbInstance.run('DELETE FROM parts WHERE id = ?', [partId]);
  persistDb();
}

export function getHistory(vehicleId: number): MaintenanceRecord[] {
  if (!dbInstance) return [];
  const res = dbInstance.exec(
    'SELECT * FROM maintenance_history WHERE vehicle_id = ? ORDER BY id DESC LIMIT 50',
    [vehicleId]
  );
  if (!res[0]) return [];
  const cols = res[0].columns;
  return res[0].values.map((row) => {
    const obj: Record<string, unknown> = {};
    cols.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj as unknown as MaintenanceRecord;
  });
}

export function getSettings(): AppSettings {
  const defaultRepo = (import.meta.env.VITE_GITHUB_REPO as string | undefined) || 'site3facil-a11y/carcontrol';
  if (!dbInstance) return { theme: 'amber', bgStyle: 'gradient', githubRepo: defaultRepo };
  let theme: AppSettings['theme'] = 'amber';
  let bgStyle: AppSettings['bgStyle'] = 'gradient';
  let githubRepo = defaultRepo;

  try {
    const res = dbInstance.exec('SELECT key, value FROM settings');
    if (res[0]) {
      for (const row of res[0].values) {
        if (row[0] === 'theme') {
          const val = String(row[1]);
          theme = (val === 'lime' ? 'navy' : val) as AppSettings['theme'];
        }
        if (row[0] === 'bgStyle') {
          const val = String(row[1]);
          if (val === 'atmosphere') bgStyle = 'gradient';
          else if (val === 'carbon' || val === 'midnight') bgStyle = 'gray';
          else if (val === 'white' || val === 'gray' || val === 'gradient' || val === 'oled') bgStyle = val;
          else bgStyle = 'gradient';
        }
        if (row[0] === 'githubRepo' && row[1]) {
          githubRepo = String(row[1]);
        }
      }
    }
  } catch {
    // fallback
  }

  return { theme, bgStyle, githubRepo };
}

export function updateSetting(key: 'theme' | 'bgStyle' | 'githubRepo', val: string): void {
  if (!dbInstance) return;
  dbInstance.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, val]);
  persistDb();
}

/**
 * Binary export of SQLite file
 */
export function exportSqliteBinary(): Uint8Array {
  if (!dbInstance) throw new Error('Database not initialized');
  return dbInstance.export();
}

/**
 * Restore SQLite binary with schema integrity verification
 */
export async function restoreSqliteBinary(bytes: Uint8Array): Promise<boolean> {
  if (!SQL) {
    SQL = await initSqlJs({
      locateFile: (file) => (file.endsWith('.wasm') ? '/sql-wasm.wasm' : file),
    });
  }

  try {
    const testDb = new SQL.Database(bytes);
    // Validate integrity
    const testRes = testDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='vehicles'");
    if (!testRes[0] || testRes[0].values.length === 0) {
      testDb.close();
      throw new Error('Arquivo de backup inválido: tabela vehicles não encontrada');
    }

    // Passed verification: replace instance
    if (dbInstance) {
      dbInstance.close();
    }
    dbInstance = testDb;
    ensureTables(dbInstance);
    await saveToIndexedDb(bytes);
    return true;
  } catch (err) {
    console.error('Falha ao restaurar banco de dados:', err);
    throw err;
  }
}

/**
 * Export CSV with BOM UTF-8 (\uFEFF) and ; separator as requested
 */
export function exportCsvReport(vehicle: Vehicle, parts: Part[], history: MaintenanceRecord[]): string {
  const lines: string[] = [];

  // BOM UTF-8
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

    let wearByKm = p.interval_km > 0 ? (kmDriven / p.interval_km) * 100 : 0;
    let wearByTime = p.interval_months > 0 ? (monthsPassed / p.interval_months) * 100 : 0;
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

/**
 * Request persistent storage
 */
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

/**
 * Reset all data to initial defaults
 */
export function resetToDefaults(): void {
  if (!dbInstance) return;
  dbInstance.run('DROP TABLE IF EXISTS vehicles');
  dbInstance.run('DROP TABLE IF EXISTS parts');
  dbInstance.run('DROP TABLE IF EXISTS maintenance_history');
  dbInstance.run('DROP TABLE IF EXISTS settings');
  ensureTables(dbInstance);
  seedDefaultData(dbInstance);
  persistDb();
}
