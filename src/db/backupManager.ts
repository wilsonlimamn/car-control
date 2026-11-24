import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { base64ToUint8, hasSqliteMagicHeader, uint8ToBase64 } from './schema';
import { idbGet, idbPut } from './legacyIndexedDb';
import { DataStore } from './types';

const BACKUP_DIR = 'car-control-backups';
const MAX_BACKUPS = 3;
const DEBOUNCE_MS = 2000;
const IDB_WEB_BACKUPS_KEY = 'car_control_auto_backups_v1';
const LS_BACKUP_META_KEY = 'car_control_auto_backup_meta_v1';
const LS_SKIP_AUTORESTORE_KEY = 'car_control_skip_autorestore';

export interface AutoBackupEntry {
  id: string;
  fileName: string;
  createdAtMs: number;
  dateText: string;
  dateTimeText: string;
}

interface WebBackupRecord extends AutoBackupEntry {
  base64: string;
}

function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export function formatDateDDMMYYYY(ms: number): string {
  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function formatDateTimeBR(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${formatDateDDMMYYYY(ms)} às ${hh}:${min}`;
}

function makeBackupFilename(ms: number): string {
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const mmm = String(d.getMilliseconds()).padStart(3, '0');
  return `backup-${yyyy}${mm}${dd}-${hh}${min}${ss}-${mmm}.sqlite`;
}

function parseTimestampFromFilename(name: string): number | null {
  const m = name.match(/^backup-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:-(\d{3}))?\.sqlite$/);
  if (!m) return null;
  const dt = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
    Number(m[7] || 0)
  );
  const ms = dt.getTime();
  return Number.isNaN(ms) ? null : ms;
}

function saveMetaSummary(entries: AutoBackupEntry[]): void {
  try {
    const slim = entries.slice(0, MAX_BACKUPS).map((e) => ({
      id: e.id,
      fileName: e.fileName,
      createdAtMs: e.createdAtMs,
      dateText: e.dateText,
      dateTimeText: e.dateTimeText,
    }));
    localStorage.setItem(LS_BACKUP_META_KEY, JSON.stringify(slim));
  } catch {
    // Ignore localStorage quota/availability errors
  }
}

export function getCachedLastBackupInfo(): AutoBackupEntry | null {
  try {
    const raw = localStorage.getItem(LS_BACKUP_META_KEY);
    if (!raw) return null;
    const list = JSON.parse(raw) as AutoBackupEntry[];
    return Array.isArray(list) && list.length > 0 ? list[0] : null;
  } catch {
    return null;
  }
}

export function markManualFactoryReset(active: boolean): void {
  try {
    if (active) {
      localStorage.setItem(LS_SKIP_AUTORESTORE_KEY, '1');
    } else {
      localStorage.removeItem(LS_SKIP_AUTORESTORE_KEY);
    }
  } catch {
    // Ignore
  }
}

function isAutoRestoreSuppressed(): boolean {
  try {
    return localStorage.getItem(LS_SKIP_AUTORESTORE_KEY) === '1';
  } catch {
    return false;
  }
}

async function ensureNativeBackupDir(): Promise<void> {
  try {
    await Filesystem.mkdir({
      path: BACKUP_DIR,
      directory: Directory.Data,
      recursive: true,
    });
  } catch {
    // Directory may already exist
  }
}

async function listNativeBackups(): Promise<AutoBackupEntry[]> {
  try {
    await ensureNativeBackupDir();
    const res = await Filesystem.readdir({
      path: BACKUP_DIR,
      directory: Directory.Data,
    });

    const parsed: AutoBackupEntry[] = [];
    for (const f of res.files) {
      const name = typeof f === 'string' ? f : f.name;
      if (!name || !name.endsWith('.sqlite')) continue;
      const fromName = parseTimestampFromFilename(name);
      const fromMtime =
        typeof f !== 'string' && typeof f.mtime === 'number' && f.mtime > 0 ? f.mtime : null;
      const createdAtMs = fromName || fromMtime || Date.now();
      parsed.push({
        id: name,
        fileName: name,
        createdAtMs,
        dateText: formatDateDDMMYYYY(createdAtMs),
        dateTimeText: formatDateTimeBR(createdAtMs),
      });
    }

    parsed.sort((a, b) => b.createdAtMs - a.createdAtMs);
    return parsed;
  } catch {
    return [];
  }
}

async function listWebBackups(): Promise<WebBackupRecord[]> {
  const saved = await idbGet<WebBackupRecord[]>(IDB_WEB_BACKUPS_KEY);
  if (!Array.isArray(saved)) return [];
  return [...saved].sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export async function listAutoBackups(): Promise<AutoBackupEntry[]> {
  const list = isNativePlatform() ? await listNativeBackups() : await listWebBackups();
  const normalized: AutoBackupEntry[] = list.map((item) => ({
    id: item.id,
    fileName: item.fileName,
    createdAtMs: item.createdAtMs,
    dateText: item.dateText,
    dateTimeText: item.dateTimeText,
  }));
  saveMetaSummary(normalized);
  return normalized.slice(0, MAX_BACKUPS);
}

async function writeAutoBackupSnapshot(store: DataStore): Promise<AutoBackupEntry | null> {
  const vehicles = await store.getVehicles();
  if (vehicles.length === 0) {
    return null;
  }

  let bytes: Uint8Array | null = await store.exportSqliteBinary();
  if (!bytes || !hasSqliteMagicHeader(bytes)) {
    bytes = null;
    return null;
  }

  const now = Date.now();
  const fileName = makeBackupFilename(now);
  const entry: AutoBackupEntry = {
    id: fileName,
    fileName,
    createdAtMs: now,
    dateText: formatDateDDMMYYYY(now),
    dateTimeText: formatDateTimeBR(now),
  };

  let b64 = uint8ToBase64(bytes);
  bytes = null;

  if (isNativePlatform()) {
    await ensureNativeBackupDir();
    await Filesystem.writeFile({
      path: `${BACKUP_DIR}/${fileName}`,
      data: b64,
      directory: Directory.Data,
    });
    b64 = '';

    const all = await listNativeBackups();
    const toDelete = all.slice(MAX_BACKUPS);
    for (const old of toDelete) {
      try {
        await Filesystem.deleteFile({
          path: `${BACKUP_DIR}/${old.fileName}`,
          directory: Directory.Data,
        });
      } catch {
        // Ignore cleanup failure
      }
    }
    saveMetaSummary(all.slice(0, MAX_BACKUPS));
  } else {
    const existing = await listWebBackups();
    const next: WebBackupRecord[] = [{ ...entry, base64: b64 }, ...existing].slice(0, MAX_BACKUPS);
    b64 = '';
    await idbPut(IDB_WEB_BACKUPS_KEY, next);
    saveMetaSummary(next);
  }

  markManualFactoryReset(false);
  return entry;
}

let debounceTimer: number | null = null;
let backupChain: Promise<void> = Promise.resolve();

export function scheduleAutoBackup(store: DataStore): void {
  if (typeof window === 'undefined') return;
  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
  }

  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    backupChain = backupChain
      .then(async () => {
        await writeAutoBackupSnapshot(store);
      })
      .catch((err) => {
        console.warn('Falha no backup automático:', err);
      });
  }, DEBOUNCE_MS);
}

export async function runImmediateAutoBackup(store: DataStore): Promise<AutoBackupEntry | null> {
  if (typeof window !== 'undefined' && debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  return writeAutoBackupSnapshot(store);
}

async function readBackupBytes(entryId?: string): Promise<{ entry: AutoBackupEntry; bytes: Uint8Array } | null> {
  if (isNativePlatform()) {
    const list = await listNativeBackups();
    const target = entryId ? list.find((e) => e.id === entryId) : list[0];
    if (!target) return null;

    const readRes = await Filesystem.readFile({
      path: `${BACKUP_DIR}/${target.fileName}`,
      directory: Directory.Data,
    });
    if (typeof readRes.data !== 'string') return null;
    const bytes = base64ToUint8(readRes.data);
    if (!hasSqliteMagicHeader(bytes)) return null;
    return { entry: target, bytes };
  }

  const list = await listWebBackups();
  const target = entryId ? list.find((e) => e.id === entryId) : list[0];
  if (!target || !target.base64) return null;
  const bytes = base64ToUint8(target.base64);
  if (!hasSqliteMagicHeader(bytes)) return null;
  return { entry: target, bytes };
}

export async function restoreFromAutoBackup(
  store: DataStore,
  backupId?: string
): Promise<{ restored: boolean; entry?: AutoBackupEntry }> {
  const list = await listAutoBackups();
  const candidates = backupId ? list.filter((b) => b.id === backupId) : list;

  for (const candidate of candidates) {
    try {
      const payload = await readBackupBytes(candidate.id);
      if (!payload) continue;
      await store.restoreSqliteBinary(payload.bytes);
      markManualFactoryReset(false);
      return { restored: true, entry: payload.entry };
    } catch {
      // Try next older backup if the newest one was somehow incomplete
    }
  }

  return { restored: false };
}

export async function tryAutoRestoreIfEmpty(
  store: DataStore
): Promise<{ restored: boolean; dateText?: string }> {
  try {
    if (isAutoRestoreSuppressed()) {
      return { restored: false };
    }

    const vehicles = await store.getVehicles();
    if (vehicles.length > 0) {
      return { restored: false };
    }

    const result = await restoreFromAutoBackup(store);
    if (result.restored && result.entry) {
      return {
        restored: true,
        dateText: result.entry.dateText,
      };
    }
  } catch (err) {
    console.warn('Auto-restauração não aplicada:', err);
  }

  return { restored: false };
}

// Re-export Encoding unused suppression if needed by bundlers
export type { Encoding };
