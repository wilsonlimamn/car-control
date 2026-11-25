import type { Database, SqlJsStatic } from 'sql.js';
import { AppSettings, CategoryType, MaintenanceRecord, Part, Vehicle } from '../types';
import {
  getCachedSqlEngine,
  hasWebAssemblySupport,
  prewarmAsmJsScript,
  recordBootError,
  recordBootStep,
  recordBootWarning,
  resolvePublicAssetPath,
  setBootAsmMode,
  setCachedSqlEngine,
} from '../utils/diagnostics';
import {
  idbDelete,
  idbGet,
  IDB_LEGACY_JSON_KEY,
  LegacyJsonPayload,
  loadSqliteBytesWithFallback,
  LS_LEGACY_KEY,
  readSavedStorageMeta,
  saveSqliteBytesWithFallback,
} from './legacyIndexedDb';
import {
  buildSampleDataset,
  DB_SCHEMA_SQL,
  DEFAULT_PARTS_TEMPLATE,
  hasSqliteMagicHeader,
  normalizeSettingsMap,
} from './schema';
import { DataStore, PersistenceStatus } from './types';

export class SqlJsStore implements DataStore {
  public readonly engineName = 'sql.js' as const;
  private sqlEngine: SqlJsStatic | null = null;
  private dbInstance: Database | null = null;
  private initPromise: Promise<void> | null = null;
  private persistChain: Promise<void> = Promise.resolve();
  private persistTimer: number | null = null;
  private dirty = false;
  private lifecycleBound = false;

  private status: PersistenceStatus = {
    backend: readSavedStorageMeta()?.backend || 'none',
    lastSavedAtMs: readSavedStorageMeta()?.savedAtMs || null,
    lastError: null,
    saving: false,
    allFailed: false,
    engineDetail: 'sql.js',
  };
  private statusListeners: Array<(status: PersistenceStatus) => void> = [];

  private updateStatus(patch: Partial<PersistenceStatus>): void {
    this.status = { ...this.status, ...patch };
    const snapshot = { ...this.status };
    for (const cb of this.statusListeners) {
      try {
        cb(snapshot);
      } catch {
        // Ignore listener errors
      }
    }
  }

  public getPersistenceStatus(): PersistenceStatus {
    return { ...this.status };
  }

  public subscribePersistenceStatus(cb: (status: PersistenceStatus) => void): () => void {
    this.statusListeners.push(cb);
    return () => {
      this.statusListeners = this.statusListeners.filter((fn) => fn !== cb);
    };
  }

  private bindLifecycleFlush(): void {
    if (this.lifecycleBound || typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    this.lifecycleBound = true;

    const handleFlush = () => {
      if (this.dirty || this.persistTimer !== null) {
        void this.flushPersist();
      }
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        handleFlush();
      }
    });
    window.addEventListener('pagehide', handleFlush);
  }

  private schedulePersist(): void {
    if (!this.dbInstance) return;
    this.dirty = true;
    if (this.persistTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.persistTimer);
    }
    if (typeof window !== 'undefined') {
      this.persistTimer = window.setTimeout(() => {
        this.persistTimer = null;
        void this.flushPersist();
      }, 500);
    } else {
      void this.flushPersist();
    }
  }

  public async flushPersist(): Promise<boolean> {
    if (this.persistTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (!this.dbInstance) {
      return false;
    }
    if (!this.dirty) {
      await this.persistChain;
      return !this.status.allFailed;
    }

    this.dirty = false;
    this.updateStatus({ saving: true });

    let savedOk = false;
    this.persistChain = this.persistChain.then(async () => {
      if (!this.dbInstance) return;
      let exported: Uint8Array | null = null;
      try {
        exported = this.dbInstance.export();
        const res = await saveSqliteBytesWithFallback(exported);
        if (res.backend !== 'none') {
          savedOk = true;
          this.updateStatus({
            backend: res.backend,
            lastSavedAtMs: res.savedAtMs || Date.now(),
            lastError: null,
            saving: false,
            allFailed: false,
          });
        } else {
          this.dirty = true;
          const errMsg = res.error || 'Falha ao gravar no IndexedDB e no localStorage';
          recordBootError(`Falha ao salvar banco: ${errMsg}`);
          this.updateStatus({
            backend: 'none',
            lastError: errMsg,
            saving: false,
            allFailed: true,
          });
        }
      } catch (err) {
        this.dirty = true;
        const msg = (err as Error)?.message || String(err);
        recordBootError(`Erro ao exportar/salvar banco: ${msg}`);
        this.updateStatus({
          lastError: msg,
          saving: false,
          allFailed: true,
        });
      } finally {
        exported = null;
      }
    });

    await this.persistChain;
    return savedOk;
  }

  public async retryPersistNow(): Promise<boolean> {
    if (!this.dbInstance) return false;
    this.dirty = true;
    return this.flushPersist();
  }

  private loadAsmJsScript(): Promise<SqlJsStatic> {
    return new Promise((resolve, reject) => {
      const win = window as unknown as {
        initSqlJs?: (config?: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic>;
      };

      if (typeof win.initSqlJs === 'function') {
        win.initSqlJs().then(resolve).catch(reject);
        return;
      }

      let settled = false;
      const timer = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Timeout ao carregar sql-asm.js'));
        }
      }, 60000);

      const finishOk = () => {
        if (settled) return;
        if (typeof win.initSqlJs === 'function') {
          win.initSqlJs()
            .then((engine) => {
              if (!settled) {
                settled = true;
                window.clearTimeout(timer);
                resolve(engine);
              }
            })
            .catch((err) => {
              if (!settled) {
                settled = true;
                window.clearTimeout(timer);
                reject(err);
              }
            });
        } else {
          settled = true;
          window.clearTimeout(timer);
          reject(new Error('initSqlJs indisponível após carregar sql-asm.js'));
        }
      };

      const finishErr = (msg: string) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        reject(new Error(msg));
      };

      let existing = document.querySelector('script[data-sql-asm="true"]') as HTMLScriptElement | null;
      if (existing) {
        const scriptState = existing.getAttribute('data-sql-asm-status');
        if (scriptState === 'loaded') {
          finishOk();
          return;
        }
        if (scriptState === 'error') {
          existing.parentNode?.removeChild(existing);
          existing = null;
        } else {
          existing.addEventListener('load', finishOk);
          existing.addEventListener('error', () => finishErr('Falha ao carregar sql-asm.js'));
          return;
        }
      }

      prewarmAsmJsScript();
      const prewarmed = document.querySelector('script[data-sql-asm="true"]') as HTMLScriptElement | null;
      if (prewarmed) {
        if (prewarmed.getAttribute('data-sql-asm-status') === 'loaded' || typeof win.initSqlJs === 'function') {
          finishOk();
          return;
        }
        prewarmed.addEventListener('load', finishOk);
        prewarmed.addEventListener('error', () => finishErr('Não foi possível carregar sql-asm.js'));
        return;
      }

      const script = document.createElement('script');
      script.src = resolvePublicAssetPath('sql-asm.js');
      script.async = true;
      script.setAttribute('data-sql-asm', 'true');
      script.setAttribute('data-sql-asm-status', 'loading');
      script.onload = () => {
        script.setAttribute('data-sql-asm-status', 'loaded');
        finishOk();
      };
      script.onerror = () => {
        script.setAttribute('data-sql-asm-status', 'error');
        finishErr('Não foi possível carregar sql-asm.js');
      };
      document.head.appendChild(script);
    });
  }

  private async loadEngine(): Promise<SqlJsStatic> {
    if (this.sqlEngine) return this.sqlEngine;

    const cachedEngine = getCachedSqlEngine();
    const wasmSupported = hasWebAssemblySupport();

    if (cachedEngine !== 'asmjs' && wasmSupported) {
      let wasmBuffer: ArrayBuffer | null = null;
      try {
        recordBootStep('Importando sql.js (lazy)');
        const sqlModule = await import('sql.js');
        const initSqlJsFn =
          sqlModule.default ||
          (sqlModule as unknown as SqlJsStatic & ((cfg?: unknown) => Promise<SqlJsStatic>));

        recordBootStep('Carregando sql-wasm.wasm local');
        const res = await fetch(resolvePublicAssetPath('sql-wasm.wasm'));
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} ao buscar sql-wasm.wasm`);
        }

        wasmBuffer = await res.arrayBuffer();
        recordBootStep('Iniciando… (SQLite WASM)');
        const binaryToPass = wasmBuffer;
        wasmBuffer = null;

        this.sqlEngine = await initSqlJsFn({ wasmBinary: binaryToPass });
        setCachedSqlEngine('wasm');
        setBootAsmMode(false);
        this.updateStatus({ engineDetail: 'sql.js (WebAssembly)' });
        recordBootStep('SQLite WASM pronto');
        return this.sqlEngine;
      } catch (wasmErr) {
        const msg = (wasmErr as Error)?.message || String(wasmErr);
        console.warn('Falha ao iniciar SQLite via WebAssembly, ativando fallback asm.js:', msg);
        recordBootWarning(`WASM indisponível; usando fallback asm.js: ${msg}`);
        setCachedSqlEngine('asmjs');
      } finally {
        wasmBuffer = null;
      }
    } else if (!wasmSupported) {
      setCachedSqlEngine('asmjs');
      recordBootStep('WebAssembly ausente; usando modo compatível (asm.js)');
    } else {
      recordBootStep('Usando motor asm.js em cache');
    }

    setBootAsmMode(true);
    recordBootStep('Carregando banco em modo compatível (asm.js)…');
    this.sqlEngine = await this.loadAsmJsScript();
    setCachedSqlEngine('asmjs');
    this.updateStatus({ engineDetail: 'sql-asm.js (asm.js puro)' });
    recordBootStep('SQLite asm.js pronto');
    return this.sqlEngine;
  }

  private queryRows<T>(db: Database, sql: string, params: (string | number | null)[] = []): T[] {
    const stmt = db.prepare(sql);
    const rows: T[] = [];
    try {
      if (params.length > 0) {
        stmt.bind(params);
      }
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as unknown as T);
      }
    } finally {
      stmt.free();
    }
    return rows;
  }

  private ensureTables(db: Database): void {
    db.run(DB_SCHEMA_SQL);
  }

  private ensureAlinhamentoPart(db: Database): boolean {
    let changed = false;
    const todayStr = new Date().toISOString().split('T')[0];
    const vehicles = this.queryRows<Vehicle>(db, 'SELECT id, current_km FROM vehicles');
    for (const v of vehicles) {
      const existing = this.queryRows<{ id: number }>(
        db,
        "SELECT id FROM parts WHERE vehicle_id = ? AND lower(name) = 'alinhamento' LIMIT 1",
        [v.id]
      );
      if (existing.length === 0) {
        db.run(
          `INSERT INTO parts (vehicle_id, name, category, interval_km, interval_months, last_change_km, last_change_date)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [v.id, 'Alinhamento', 'pneus', 10000, 6, v.current_km || 0, todayStr]
        );
        changed = true;
      }
    }
    return changed;
  }

  private importLegacyJsonIntoDb(db: Database, rawJson: string): boolean {
    try {
      const parsed = JSON.parse(rawJson) as LegacyJsonPayload;
      if (!parsed || !Array.isArray(parsed.vehicles)) return false;

      db.run('BEGIN TRANSACTION');
      try {
        for (const v of parsed.vehicles) {
          db.run(
            `INSERT INTO vehicles (id, name, plate, current_km, tank_capacity, fuel_level, avg_consumption, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              v.id,
              v.name,
              v.plate || '',
              v.current_km,
              v.tank_capacity,
              v.fuel_level,
              v.avg_consumption,
              v.is_active,
            ]
          );
        }

        if (Array.isArray(parsed.parts)) {
          for (const p of parsed.parts) {
            db.run(
              `INSERT INTO parts (id, vehicle_id, name, category, interval_km, interval_months, last_change_km, last_change_date)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                p.id,
                p.vehicle_id,
                p.name,
                p.category,
                p.interval_km,
                p.interval_months,
                p.last_change_km,
                p.last_change_date,
              ]
            );
          }
        }

        if (Array.isArray(parsed.history)) {
          for (const h of parsed.history) {
            db.run(
              `INSERT INTO maintenance_history (id, vehicle_id, part_name, change_km, change_date)
               VALUES (?, ?, ?, ?, ?)`,
              [h.id, h.vehicle_id, h.part_name, h.change_km, h.change_date]
            );
          }
        }

        if (parsed.settings && typeof parsed.settings === 'object') {
          for (const [k, val] of Object.entries(parsed.settings)) {
            db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [k, String(val)]);
          }
        }
        db.run('COMMIT');
        return true;
      } catch (innerErr) {
        db.run('ROLLBACK');
        throw innerErr;
      }
    } catch (err) {
      console.warn('Falha ao migrar JSON legado para SQLite:', err);
      return false;
    }
  }

  private getDb(): Database {
    if (!this.dbInstance) {
      throw new Error('Banco de dados não inicializado');
    }
    return this.dbInstance;
  }

  public async init(): Promise<void> {
    if (this.dbInstance) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.bindLifecycleFlush();
      const engine = await this.loadEngine();

      recordBootStep('Carregando banco salvo (IndexedDB / localStorage)');
      const loaded = await loadSqliteBytesWithFallback();
      let savedBytes: Uint8Array | null = loaded.bytes;
      let shouldPersistNow = false;

      let db: Database;
      if (savedBytes && savedBytes.length > 0) {
        recordBootStep(`Abrindo banco SQLite salvo (${loaded.source})`);
        try {
          db = new engine.Database(savedBytes);
          this.updateStatus({
            backend: loaded.source,
            lastSavedAtMs: loaded.savedAtMs || this.status.lastSavedAtMs,
            lastError: null,
            allFailed: false,
          });
        } catch (corruptErr) {
          console.warn('Banco SQLite salvo corrompido, criando novo banco:', corruptErr);
          recordBootError('Banco salvo inválido, recriando estrutura');
          db = new engine.Database();
          shouldPersistNow = true;
        } finally {
          savedBytes = null;
        }
      } else {
        savedBytes = null;
        recordBootStep('Nenhum banco salvo encontrado; iniciando estrutura');
        db = new engine.Database();
      }

      this.ensureTables(db);

      const vehicleCountRows = this.queryRows<{ cnt: number }>(db, 'SELECT COUNT(*) AS cnt FROM vehicles');
      const vehicleCount = vehicleCountRows[0]?.cnt || 0;

      if (vehicleCount === 0) {
        let legacyJson: string | null = null;
        try {
          legacyJson = localStorage.getItem(LS_LEGACY_KEY);
        } catch {
          legacyJson = null;
        }
        if (!legacyJson) {
          legacyJson = await idbGet<string>(IDB_LEGACY_JSON_KEY);
        }

        if (legacyJson && legacyJson.length > 0) {
          recordBootStep('Migrando dados locais para SQLite');
          const migrated = this.importLegacyJsonIntoDb(db, legacyJson);
          legacyJson = null;
          if (migrated) {
            shouldPersistNow = true;
            try {
              localStorage.removeItem(LS_LEGACY_KEY);
            } catch {
              // Ignore
            }
            void idbDelete(IDB_LEGACY_JSON_KEY);
          }
        }
      }

      const addedAlinhamento = this.ensureAlinhamentoPart(db);
      if (addedAlinhamento) {
        shouldPersistNow = true;
      }

      this.dbInstance = db;

      if (shouldPersistNow) {
        this.dirty = true;
        await this.flushPersist();
      }
      recordBootStep('Banco SQLite pronto');
    })();

    try {
      await this.initPromise;
    } catch (err) {
      this.initPromise = null;
      throw err;
    }
  }

  public async getVehicles(): Promise<Vehicle[]> {
    if (!this.dbInstance) return [];
    return this.queryRows<Vehicle>(this.dbInstance, 'SELECT * FROM vehicles ORDER BY id ASC');
  }

  public async getActiveVehicle(): Promise<Vehicle | null> {
    const list = await this.getVehicles();
    return list.find((v) => v.is_active === 1) || list[0] || null;
  }

  public async setActiveVehicle(vehicleId: number): Promise<void> {
    const db = this.getDb();
    db.run('UPDATE vehicles SET is_active = CASE WHEN id = ? THEN 1 ELSE 0 END', [vehicleId]);
    this.schedulePersist();
  }

  public async createVehicle(
    name: string,
    plate: string,
    km: number,
    tank: number,
    consumption: number,
    initialFuelLiters?: number
  ): Promise<Vehicle> {
    const db = this.getDb();
    const fuelLevel =
      initialFuelLiters !== undefined
        ? Math.min(tank, Math.max(0, initialFuelLiters))
        : Math.round(tank * 0.7);

    let newId = 1;
    const todayStr = new Date().toISOString().split('T')[0];

    db.run('BEGIN TRANSACTION');
    try {
      db.run('UPDATE vehicles SET is_active = 0');
      db.run(
        `INSERT INTO vehicles (name, plate, current_km, tank_capacity, fuel_level, avg_consumption, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [name, plate, km, tank, fuelLevel, consumption]
      );

      const idRows = this.queryRows<{ id: number }>(db, 'SELECT last_insert_rowid() AS id');
      newId = idRows[0]?.id || 1;

      for (const tp of DEFAULT_PARTS_TEMPLATE) {
        db.run(
          `INSERT INTO parts (vehicle_id, name, category, interval_km, interval_months, last_change_km, last_change_date)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [newId, tp[0], tp[1], tp[2], tp[3], km, todayStr]
        );
      }

      db.run('COMMIT');
    } catch (err) {
      db.run('ROLLBACK');
      throw err;
    }

    this.schedulePersist();
    return this.queryRows<Vehicle>(db, 'SELECT * FROM vehicles WHERE id = ? LIMIT 1', [newId])[0];
  }

  public async updateVehicle(
    vehicleId: number,
    name: string,
    plate: string,
    km?: number,
    tankCapacity?: number,
    avgConsumption?: number
  ): Promise<void> {
    const db = this.getDb();
    if (km !== undefined && tankCapacity !== undefined && avgConsumption !== undefined) {
      db.run(
        `UPDATE vehicles
         SET name = ?, plate = ?, current_km = ?, tank_capacity = ?, fuel_level = MIN(fuel_level, ?), avg_consumption = ?
         WHERE id = ?`,
        [name, plate, km, tankCapacity, tankCapacity, avgConsumption, vehicleId]
      );
    } else {
      db.run('UPDATE vehicles SET name = ?, plate = ? WHERE id = ?', [name, plate, vehicleId]);
    }
    this.schedulePersist();
  }

  public async updateVehicleKm(vehicleId: number, newKm: number): Promise<void> {
    const db = this.getDb();
    db.run('UPDATE vehicles SET current_km = ? WHERE id = ?', [newKm, vehicleId]);
    this.schedulePersist();
  }

  public async updateFuelLevel(vehicleId: number, fuelLevel: number): Promise<void> {
    const db = this.getDb();
    db.run('UPDATE vehicles SET fuel_level = ? WHERE id = ?', [fuelLevel, vehicleId]);
    this.schedulePersist();
  }

  public async addFuel(vehicleId: number, addedLitros: number): Promise<void> {
    const db = this.getDb();
    db.run(
      'UPDATE vehicles SET fuel_level = MIN(tank_capacity, fuel_level + ?) WHERE id = ?',
      [addedLitros, vehicleId]
    );
    this.schedulePersist();
  }

  public async updateAvgConsumption(vehicleId: number, avgConsumption: number): Promise<void> {
    const db = this.getDb();
    db.run('UPDATE vehicles SET avg_consumption = ? WHERE id = ?', [avgConsumption, vehicleId]);
    this.schedulePersist();
  }

  public async getParts(vehicleId: number): Promise<Part[]> {
    if (!this.dbInstance) return [];
    return this.queryRows<Part>(
      this.dbInstance,
      'SELECT * FROM parts WHERE vehicle_id = ? ORDER BY id ASC',
      [vehicleId]
    );
  }

  public async renewPart(partId: number, currentKm: number, currentDate: string): Promise<void> {
    const db = this.getDb();
    const part = this.queryRows<Part>(db, 'SELECT * FROM parts WHERE id = ? LIMIT 1', [partId])[0];
    if (!part) return;

    db.run('BEGIN TRANSACTION');
    try {
      db.run('UPDATE parts SET last_change_km = ?, last_change_date = ? WHERE id = ?', [
        currentKm,
        currentDate,
        partId,
      ]);
      db.run(
        'INSERT INTO maintenance_history (vehicle_id, part_name, change_km, change_date) VALUES (?, ?, ?, ?)',
        [part.vehicle_id, part.name, currentKm, currentDate]
      );
      db.run('COMMIT');
    } catch (err) {
      db.run('ROLLBACK');
      throw err;
    }

    this.schedulePersist();
  }

  public async updatePart(
    partId: number,
    name: string,
    category: CategoryType,
    interval_km: number,
    interval_months: number,
    last_change_km: number,
    last_change_date: string
  ): Promise<void> {
    const db = this.getDb();
    db.run(
      `UPDATE parts
       SET name = ?, category = ?, interval_km = ?, interval_months = ?, last_change_km = ?, last_change_date = ?
       WHERE id = ?`,
      [name, category, interval_km, interval_months, last_change_km, last_change_date, partId]
    );
    this.schedulePersist();
  }

  public async createPart(
    vehicleId: number,
    name: string,
    category: CategoryType,
    interval_km: number,
    interval_months: number,
    last_change_km: number,
    last_change_date: string
  ): Promise<void> {
    const db = this.getDb();
    db.run(
      `INSERT INTO parts (vehicle_id, name, category, interval_km, interval_months, last_change_km, last_change_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [vehicleId, name, category, interval_km, interval_months, last_change_km, last_change_date]
    );
    this.schedulePersist();
  }

  public async deletePart(partId: number): Promise<void> {
    const db = this.getDb();
    db.run('DELETE FROM parts WHERE id = ?', [partId]);
    this.schedulePersist();
  }

  public async getHistory(vehicleId: number): Promise<MaintenanceRecord[]> {
    if (!this.dbInstance) return [];
    return this.queryRows<MaintenanceRecord>(
      this.dbInstance,
      'SELECT * FROM maintenance_history WHERE vehicle_id = ? ORDER BY id DESC LIMIT 50',
      [vehicleId]
    );
  }

  public async getSettings(): Promise<AppSettings> {
    if (!this.dbInstance) {
      return normalizeSettingsMap({});
    }
    const rows = this.queryRows<{ key: string; value: string }>(
      this.dbInstance,
      'SELECT key, value FROM settings'
    );
    const map: Record<string, string> = {};
    for (const r of rows) {
      map[r.key] = r.value;
    }
    return normalizeSettingsMap(map);
  }

  public async updateSetting(key: 'theme' | 'bgStyle' | 'githubRepo', val: string): Promise<void> {
    const db = this.getDb();
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, val]);
    this.schedulePersist();
  }

  public async loadSampleData(): Promise<Vehicle> {
    const db = this.getDb();
    const settings = await this.getSettings();
    const sample = buildSampleDataset();

    db.run('BEGIN TRANSACTION');
    try {
      db.run('DELETE FROM maintenance_history');
      db.run('DELETE FROM parts');
      db.run('DELETE FROM vehicles');

      db.run(
        `INSERT INTO vehicles (id, name, plate, current_km, tank_capacity, fuel_level, avg_consumption, is_active)
         VALUES (1, ?, ?, ?, ?, ?, ?, 1)`,
        [
          sample.vehicle.name,
          sample.vehicle.plate,
          sample.vehicle.current_km,
          sample.vehicle.tank_capacity,
          sample.vehicle.fuel_level,
          sample.vehicle.avg_consumption,
        ]
      );

      for (const p of sample.parts) {
        db.run(
          `INSERT INTO parts (vehicle_id, name, category, interval_km, interval_months, last_change_km, last_change_date)
           VALUES (1, ?, ?, ?, ?, ?, ?)`,
          [p[0], p[1], p[2], p[3], p[4], p[5]]
        );
      }

      for (const h of sample.history) {
        db.run(
          'INSERT INTO maintenance_history (vehicle_id, part_name, change_km, change_date) VALUES (1, ?, ?, ?)',
          [h[0], h[1], h[2]]
        );
      }

      db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['theme', settings.theme]);
      db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['bgStyle', settings.bgStyle]);
      if (settings.githubRepo) {
        db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
          'githubRepo',
          settings.githubRepo,
        ]);
      }
      db.run('COMMIT');
    } catch (err) {
      db.run('ROLLBACK');
      throw err;
    }

    this.schedulePersist();
    const created = await this.getActiveVehicle();
    if (!created) throw new Error('Falha ao criar veículo de exemplo');
    return created;
  }

  public async resetToDefaults(): Promise<void> {
    const db = this.getDb();
    db.run('BEGIN TRANSACTION');
    try {
      db.run('DELETE FROM maintenance_history');
      db.run('DELETE FROM parts');
      db.run('DELETE FROM vehicles');
      db.run('DELETE FROM settings');
      db.run("INSERT INTO settings (key, value) VALUES ('theme', 'navy')");
      db.run("INSERT INTO settings (key, value) VALUES ('bgStyle', 'gradient')");
      db.run('COMMIT');
    } catch (err) {
      db.run('ROLLBACK');
      throw err;
    }
    this.schedulePersist();
  }

  public async exportSqliteBinary(): Promise<Uint8Array> {
    await this.init();
    return this.getDb().export();
  }

  public async restoreSqliteBinary(bytes: Uint8Array): Promise<boolean> {
    if (!hasSqliteMagicHeader(bytes)) {
      throw new Error('Arquivo de backup inválido: formato SQLite não reconhecido');
    }

    const engine = await this.loadEngine();
    let incomingBytes: Uint8Array | null = bytes;
    let testDb: Database | null = null;
    try {
      testDb = new engine.Database(incomingBytes);
      incomingBytes = null;

      const tables = this.queryRows<{ name: string }>(
        testDb,
        "SELECT name FROM sqlite_master WHERE type='table' AND name='vehicles'"
      );
      if (tables.length === 0) {
        testDb.close();
        testDb = null;
        throw new Error('Arquivo de backup inválido: tabela vehicles não encontrada');
      }

      this.ensureTables(testDb);
      this.ensureAlinhamentoPart(testDb);

      if (this.dbInstance) {
        this.dbInstance.close();
      }
      this.dbInstance = testDb;
      testDb = null;
      this.dirty = true;
      await this.flushPersist();
      return true;
    } catch (err) {
      if (testDb) {
        try {
          testDb.close();
        } catch {
          // Ignore
        }
      }
      throw err;
    } finally {
      incomingBytes = null;
    }
  }
}
