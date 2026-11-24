import { MaintenanceRecord, Part, Vehicle } from '../types';
import { base64ToUint8, hasSqliteMagicHeader, uint8ToBase64 } from './schema';
import { StorageBackendType } from './types';

export const IDB_NAME = 'car_control_indexeddb';
export const IDB_STORE = 'sqlite_store';
export const IDB_SQLITE_KEY = 'car_control_sqlite_file';
export const IDB_LEGACY_JSON_KEY = 'car_control_json_v1';
export const LS_LEGACY_KEY = 'car_control_store_v1';
export const LS_SQLITE_B64_KEY = 'car_control_sqlite_b64_v1';
export const LS_STORAGE_META_KEY = 'car_control_storage_meta_v1';

export interface LegacyJsonPayload {
  vehicles?: Vehicle[];
  parts?: Part[];
  history?: MaintenanceRecord[];
  settings?: Record<string, string>;
}

export interface SavedStorageMeta {
  backend: StorageBackendType;
  savedAtMs: number;
}

export function readSavedStorageMeta(): SavedStorageMeta | null {
  try {
    const raw = localStorage.getItem(LS_STORAGE_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedStorageMeta;
    if (
      parsed &&
      (parsed.backend === 'indexeddb' || parsed.backend === 'localstorage') &&
      typeof parsed.savedAtMs === 'number'
    ) {
      return parsed;
    }
  } catch {
    // Ignore
  }
  return null;
}

function writeSavedStorageMeta(backend: 'indexeddb' | 'localstorage', savedAtMs: number): void {
  try {
    localStorage.setItem(LS_STORAGE_META_KEY, JSON.stringify({ backend, savedAtMs }));
  } catch {
    // Ignore meta write errors if quota is tight
  }
}

function getErrMsg(err: unknown): string {
  if (!err) return 'Erro desconhecido';
  if (typeof err === 'string') return err;
  const e = err as { message?: string; name?: string };
  if (e.name && e.message) return `${e.name}: ${e.message}`;
  return e.message || String(err);
}

export function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined' || indexedDB === null) {
      reject(new Error('IndexedDB indisponível neste WebView'));
      return;
    }

    const timer = window.setTimeout(() => {
      reject(new Error('Timeout ao abrir IndexedDB'));
    }, 5000);

    try {
      const request = indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      request.onsuccess = () => {
        window.clearTimeout(timer);
        resolve(request.result);
      };
      request.onerror = () => {
        window.clearTimeout(timer);
        reject(request.error || new Error('Erro ao abrir IndexedDB'));
      };
    } catch (err) {
      window.clearTimeout(timer);
      reject(err);
    }
  });
}

export async function idbGet<T = unknown>(key: string): Promise<T | null> {
  let idb: IDBDatabase | null = null;
  try {
    idb = await openIndexedDb();
    return await new Promise<T | null>((resolve) => {
      const timer = window.setTimeout(() => resolve(null), 5000);
      try {
        const transaction = idb!.transaction(IDB_STORE, 'readonly');
        const store = transaction.objectStore(IDB_STORE);
        const request = store.get(key);
        request.onsuccess = () => {
          window.clearTimeout(timer);
          resolve((request.result as T) ?? null);
        };
        request.onerror = () => {
          window.clearTimeout(timer);
          resolve(null);
        };
      } catch {
        window.clearTimeout(timer);
        resolve(null);
      }
    });
  } catch {
    return null;
  } finally {
    if (idb) {
      try {
        idb.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}

async function idbPutOnce(idb: IDBDatabase, key: string, value: unknown): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Timeout ao gravar no IndexedDB')), 5000);
    let settled = false;
    const finishOk = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve();
    };
    const finishErr = (err: unknown) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(err);
    };

    try {
      const transaction = idb.transaction(IDB_STORE, 'readwrite');
      transaction.oncomplete = finishOk;
      transaction.onerror = () => finishErr(transaction.error || new Error('Falha na transação IndexedDB'));
      transaction.onabort = () => finishErr(transaction.error || new Error('Transação IndexedDB abortada'));
      const store = transaction.objectStore(IDB_STORE);
      const request = store.put(value, key);
      request.onerror = () => finishErr(request.error || new Error('Falha ao gravar no IndexedDB'));
    } catch (err) {
      finishErr(err);
    }
  });
}

async function idbPutStrict(key: string, value: Uint8Array): Promise<void> {
  let idb: IDBDatabase | null = null;
  try {
    idb = await openIndexedDb();
    try {
      await idbPutOnce(idb, key, new Uint8Array(value));
    } catch (firstErr) {
      // Older Android WebViews sometimes fail structured cloning TypedArrays directly
      const copyBuf = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
      try {
        await idbPutOnce(idb, key, copyBuf);
      } catch {
        throw firstErr;
      }
    }
  } finally {
    if (idb) {
      try {
        idb.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}

export async function idbPut(key: string, value: unknown): Promise<void> {
  let idb: IDBDatabase | null = null;
  try {
    idb = await openIndexedDb();
    await idbPutOnce(idb, key, value);
  } catch (err) {
    console.warn('IndexedDB save skipped:', err);
  } finally {
    if (idb) {
      try {
        idb.close();
      } catch {
        // Ignore
      }
    }
  }
}

export async function idbDelete(key: string): Promise<void> {
  let idb: IDBDatabase | null = null;
  try {
    idb = await openIndexedDb();
    await new Promise<void>((resolve) => {
      const transaction = idb!.transaction(IDB_STORE, 'readwrite');
      const store = transaction.objectStore(IDB_STORE);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } catch {
    // Ignore cleanup errors
  } finally {
    if (idb) {
      try {
        idb.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}

export interface SaveSqliteResult {
  backend: StorageBackendType;
  savedAtMs: number | null;
  error: string | null;
}

export async function saveSqliteBytesWithFallback(bytes: Uint8Array): Promise<SaveSqliteResult> {
  const now = Date.now();
  try {
    await idbPutStrict(IDB_SQLITE_KEY, bytes);
    try {
      localStorage.removeItem(LS_SQLITE_B64_KEY);
    } catch {
      // Ignore cleanup
    }
    writeSavedStorageMeta('indexeddb', now);
    return { backend: 'indexeddb', savedAtMs: now, error: null };
  } catch (idbErr) {
    const idbMsg = getErrMsg(idbErr);
    console.warn('IndexedDB indisponível/falhou, tentando localStorage base64:', idbMsg);
    try {
      const b64 = uint8ToBase64(bytes);
      localStorage.setItem(LS_SQLITE_B64_KEY, b64);
      void idbDelete(IDB_SQLITE_KEY);
      writeSavedStorageMeta('localstorage', now);
      return { backend: 'localstorage', savedAtMs: now, error: null };
    } catch (lsErr) {
      const lsMsg = getErrMsg(lsErr);
      console.warn('Falha ao salvar SQLite em base64 no localStorage:', lsMsg);
      return {
        backend: 'none',
        savedAtMs: null,
        error: `IndexedDB falhou (${idbMsg}) e localStorage falhou (${lsMsg})`,
      };
    }
  }
}

function decodeStoredBytes(raw: unknown): Uint8Array | null {
  if (!raw) return null;
  if (raw instanceof Uint8Array && raw.length > 0) {
    return hasSqliteMagicHeader(raw) ? raw : null;
  }
  if (raw instanceof ArrayBuffer && raw.byteLength > 0) {
    const arr = new Uint8Array(raw);
    return hasSqliteMagicHeader(arr) ? arr : null;
  }
  if (typeof raw === 'string' && raw.length > 0) {
    try {
      const arr = base64ToUint8(raw);
      return hasSqliteMagicHeader(arr) ? arr : null;
    } catch {
      return null;
    }
  }
  return null;
}

export async function loadSqliteBytesWithFallback(): Promise<{
  bytes: Uint8Array | null;
  source: StorageBackendType;
  savedAtMs: number | null;
}> {
  const meta = readSavedStorageMeta();

  const tryReadLs = (): Uint8Array | null => {
    try {
      const b64 = localStorage.getItem(LS_SQLITE_B64_KEY);
      return decodeStoredBytes(b64);
    } catch {
      return null;
    }
  };

  const tryReadIdb = async (): Promise<Uint8Array | null> => {
    const rawSaved = await idbGet<unknown>(IDB_SQLITE_KEY);
    return decodeStoredBytes(rawSaved);
  };

  // If the last confirmed save was in localStorage, check localStorage first
  if (meta?.backend === 'localstorage') {
    const lsBytes = tryReadLs();
    if (lsBytes) {
      return { bytes: lsBytes, source: 'localstorage', savedAtMs: meta.savedAtMs };
    }
  }

  const idbBytes = await tryReadIdb();
  if (idbBytes) {
    return {
      bytes: idbBytes,
      source: 'indexeddb',
      savedAtMs: meta?.backend === 'indexeddb' ? meta.savedAtMs : null,
    };
  }

  const lsBytes = tryReadLs();
  if (lsBytes) {
    return {
      bytes: lsBytes,
      source: 'localstorage',
      savedAtMs: meta?.backend === 'localstorage' ? meta.savedAtMs : null,
    };
  }

  return { bytes: null, source: 'none', savedAtMs: null };
}
