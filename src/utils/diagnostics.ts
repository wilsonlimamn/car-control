export type LowPerfPreference = 'auto' | 'on' | 'off';

export interface LowPerfCacheEntry {
  lowPerf: boolean;
  reason: string;
  benchmarkMs: number;
  bootElapsedMs: number;
  checkedAt: number;
}

export interface BootStep {
  label: string;
  elapsedMs: number;
  deltaMs: number;
}

export interface PersistedBootEvent {
  sessionId: string;
  type: 'step' | 'error' | 'done';
  label: string;
  tsIso: string;
  elapsedMs: number;
  deltaMs: number;
}

export interface PersistedBootState {
  sessionId?: string;
  startedAtIso?: string;
  finishedAtIso?: string;
  completed?: boolean;
  lastStep?: string;
}

export interface BootDiagGlobal {
  sessionId?: string;
  startTime: number;
  lastTime: number;
  done: boolean;
  reactMounted?: boolean;
  currentLabel?: string;
  previousBootFailed?: boolean;
  previousBootState?: PersistedBootState | null;
  previousEventsSnapshot?: PersistedBootEvent[];
  steps: BootStep[];
  errors: string[];
  listeners?: Array<(label: string) => void>;
  recordStep: (label: string) => void;
  recordError: (msg: string) => void;
  markDone?: () => void;
}

const LS_EVENTS_KEY = 'car_control_boot_events_v1';
const LS_LOW_PERF_PREF_KEY = 'car_control_low_perf_pref_v1';
const LS_LOW_PERF_AUTO_KEY = 'car_control_low_perf_auto_v1';
const LOW_PERF_RECHECK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

function getDiag(): BootDiagGlobal | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { __BOOT_DIAG__?: BootDiagGlobal }).__BOOT_DIAG__ || null;
}

export function getCurrentBootLabel(): string {
  return getDiag()?.currentLabel || 'Carregando…';
}

export function subscribeBootStep(cb: (label: string) => void): () => void {
  const diag = getDiag();
  if (!diag) return () => {};
  if (!diag.listeners) {
    diag.listeners = [];
  }
  diag.listeners.push(cb);
  return () => {
    if (!diag.listeners) return;
    diag.listeners = diag.listeners.filter((fn) => fn !== cb);
  };
}

export function recordBootStep(label: string): void {
  const diag = getDiag();
  if (diag && typeof diag.recordStep === 'function') {
    diag.recordStep(label);
  }
}

export function recordBootError(msg: string): void {
  const diag = getDiag();
  if (diag && typeof diag.recordError === 'function') {
    diag.recordError(msg);
  }
}

export function markReactMounted(): void {
  const diag = getDiag();
  if (diag) {
    diag.reactMounted = true;
  }
}

export function markBootDone(): void {
  const diag = getDiag();
  if (diag) {
    if (typeof diag.markDone === 'function') {
      diag.markDone();
    } else {
      diag.done = true;
    }
  }
}

export function hasPreviousBootFailure(): boolean {
  return Boolean(getDiag()?.previousBootFailed);
}

export function dismissPreviousBootFailure(): void {
  const diag = getDiag();
  if (diag) {
    diag.previousBootFailed = false;
  }
}

export function getPersistedBootEvents(): PersistedBootEvent[] {
  try {
    const raw = localStorage.getItem(LS_EVENTS_KEY);
    if (!raw) return getDiag()?.previousEventsSnapshot || [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PersistedBootEvent[]).slice(-100) : [];
  } catch {
    return getDiag()?.previousEventsSnapshot || [];
  }
}

export function hasIndexedDbSupport(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

export function hasServiceWorkerSupport(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

export function getPreviousCrashReportText(): string {
  const diag = getDiag();
  const prevState = diag?.previousBootState;
  const events = getPersistedBootEvents();
  const lines: string[] = [
    '=== RELATÓRIO DE INICIALIZAÇÃO - CAR CONTROL ===',
    `Navegador/WebView: ${getChromiumVersion()}`,
    `User-Agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A'}`,
    `WebAssembly: ${hasWebAssemblySupport() ? 'Sim' : 'Não (asm.js)'}`,
    `IndexedDB: ${hasIndexedDbSupport() ? 'Disponível' : 'Indisponível (fallback localStorage)'}`,
    `Service Worker: ${hasServiceWorkerSupport() ? 'Disponível' : 'Indisponível'}`,
    `Memória: ${getAvailableMemoryInfo()}`,
    `Modo leve ativo: ${isLowPerfActive() ? 'Sim' : 'Não'}`,
  ];

  if (prevState) {
    lines.push(
      `Tentativa anterior iniciada em: ${prevState.startedAtIso || 'desconhecido'}`,
      `Última etapa antes de fechar/travar: ${prevState.lastStep || 'desconhecida'}`
    );
  }

  lines.push('', `Eventos persistidos (últimos ${events.length}/100):`);
  for (const ev of events) {
    const prefix = ev.type === 'error' ? '[ERRO]' : ev.type === 'done' ? '[OK]' : '[ETAPA]';
    lines.push(`  ${ev.tsIso} ${prefix} ${ev.label} (${ev.elapsedMs}ms)`);
  }

  return lines.join('\n');
}

export async function copyTextWithFallback(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand fallback for older Android WebViews
    }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', 'true');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export const MIN_TESTED_CHROMIUM: number =
  parseInt((import.meta.env.VITE_MIN_CHROMIUM as string | undefined) || '50', 10) || 50;

export interface OutdatedWebViewStatus {
  outdated: boolean;
  detectedMajor: number | null;
  minTested: number;
}

export function checkOutdatedWebView(): OutdatedWebViewStatus {
  const detectedMajor = getChromiumMajorVersion();
  return {
    outdated: detectedMajor !== null && detectedMajor < MIN_TESTED_CHROMIUM,
    detectedMajor,
    minTested: MIN_TESTED_CHROMIUM,
  };
}

export function getChromiumMajorVersion(): number | null {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const match = ua.match(/(?:Chrome|Chromium|CriOS)\/(\d+)/i);
  if (!match) return null;
  const parsed = parseInt(match[1], 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function getChromiumVersion(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const match = ua.match(/(?:Chrome|Chromium|CriOS)\/([\d.]+)/i);
  if (match) return `Chromium ${match[1]}`;
  return ua || 'Desconhecido';
}

export function hasWebAssemblySupport(): boolean {
  return (
    typeof WebAssembly === 'object' &&
    typeof WebAssembly.instantiate === 'function'
  );
}

export function getAvailableMemoryInfo(): string {
  if (typeof navigator === 'undefined') return 'Indisponível';
  const parts: string[] = [];
  const nav = navigator as Navigator & { deviceMemory?: number };
  if (typeof nav.deviceMemory === 'number') {
    parts.push(`RAM aprox. do dispositivo: ${nav.deviceMemory} GB`);
  }
  const perf = performance as Performance & {
    memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
  };
  if (perf && perf.memory) {
    const usedMb = Math.round(perf.memory.usedJSHeapSize / (1024 * 1024));
    const limitMb = Math.round(perf.memory.jsHeapSizeLimit / (1024 * 1024));
    parts.push(`Heap JS: ${usedMb} MB / ${limitMb} MB`);
  }
  return parts.length > 0 ? parts.join(' | ') : 'API de memória não exposta por este WebView';
}

export function getLowPerfPreference(): LowPerfPreference {
  try {
    const val = localStorage.getItem(LS_LOW_PERF_PREF_KEY);
    if (val === 'on' || val === 'off' || val === 'auto') {
      return val;
    }
  } catch {
    // Ignore
  }
  return 'auto';
}

export function getLowPerfAutoCache(): LowPerfCacheEntry | null {
  try {
    const raw = localStorage.getItem(LS_LOW_PERF_AUTO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LowPerfCacheEntry;
    if (typeof parsed?.lowPerf === 'boolean' && typeof parsed?.checkedAt === 'number') {
      return parsed;
    }
  } catch {
    // Ignore
  }
  return null;
}

function saveLowPerfAutoCache(entry: LowPerfCacheEntry): void {
  try {
    localStorage.setItem(LS_LOW_PERF_AUTO_KEY, JSON.stringify(entry));
  } catch {
    // Ignore
  }
}

export function runCpuMicroBenchmarkMs(): number {
  const start =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  let acc = 0;
  for (let i = 1; i <= 25000; i++) {
    acc = (acc + ((i * 31) % 97) * Math.sqrt(i)) % 100000;
  }
  if (acc < 0) console.log(acc);
  const end =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  return Math.round((end - start) * 10) / 10;
}

export function applyLowPerfClass(enabled: boolean): void {
  if (typeof document === 'undefined') return;
  if (enabled) {
    document.documentElement.classList.add('low-perf');
  } else {
    document.documentElement.classList.remove('low-perf');
  }
}

export function isLowPerfActive(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('low-perf');
}

export function setLowPerfPreference(pref: LowPerfPreference): boolean {
  try {
    localStorage.setItem(LS_LOW_PERF_PREF_KEY, pref);
  } catch {
    // Ignore
  }
  if (pref === 'on') {
    applyLowPerfClass(true);
    return true;
  }
  if (pref === 'off') {
    applyLowPerfClass(false);
    return false;
  }
  // Re-evaluate immediately in Auto mode
  const evaluated = detectAndApplyLowPerfMode(undefined, true);
  return evaluated;
}

export function detectAndApplyLowPerfMode(bootElapsedMs?: number, forceReeval = false): boolean {
  if (typeof document === 'undefined' || typeof navigator === 'undefined') return false;

  const pref = getLowPerfPreference();
  if (pref === 'on') {
    applyLowPerfClass(true);
    return true;
  }
  if (pref === 'off') {
    applyLowPerfClass(false);
    return false;
  }

  const cached = getLowPerfAutoCache();
  const isCacheExpired = !cached || Date.now() - cached.checkedAt > LOW_PERF_RECHECK_INTERVAL_MS;
  const isSlowBootNow = typeof bootElapsedMs === 'number' && bootElapsedMs > 2500;

  if (!forceReeval && cached && !isCacheExpired && !isSlowBootNow) {
    applyLowPerfClass(cached.lowPerf);
    return cached.lowPerf;
  }

  const nav = navigator as Navigator & { deviceMemory?: number };
  const isLowRam = typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 1;
  const benchmarkMs = runCpuMicroBenchmarkMs();
  const isSlowBench = benchmarkMs > 22;
  const isLow = Boolean(isLowRam || isSlowBootNow || isSlowBench || (cached && isSlowBootNow));

  const reasons: string[] = [];
  if (isLowRam) reasons.push(`RAM <= 1GB (${nav.deviceMemory} GB)`);
  if (isSlowBootNow && bootElapsedMs) reasons.push(`Boot lento (${bootElapsedMs} ms)`);
  if (isSlowBench) reasons.push(`Benchmark CPU (${benchmarkMs} ms)`);

  saveLowPerfAutoCache({
    lowPerf: isLow,
    reason: reasons.length > 0 ? reasons.join(', ') : `Normal (CPU ${benchmarkMs} ms)`,
    benchmarkMs,
    bootElapsedMs: typeof bootElapsedMs === 'number' ? bootElapsedMs : cached?.bootElapsedMs || 0,
    checkedAt: Date.now(),
  });

  applyLowPerfClass(isLow);
  return isLow;
}

export function getDiagnosticText(extraError?: string): string {
  const diag = getDiag();
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A';
  const wasm = hasWebAssemblySupport() ? 'Sim' : 'Não (usando fallback asm.js)';
  const idb = hasIndexedDbSupport() ? 'Disponível' : 'Indisponível (fallback localStorage)';
  const sw = hasServiceWorkerSupport() ? 'Disponível' : 'Indisponível';
  const mem = getAvailableMemoryInfo();
  const lpPref = getLowPerfPreference();
  const lpCache = getLowPerfAutoCache();
  const steps = diag?.steps || [];
  const errors = [...(diag?.errors || [])];
  if (extraError && !errors.includes(extraError)) {
    errors.push(extraError);
  }

  const lines: string[] = [
    `Navegador/WebView: ${getChromiumVersion()}`,
    `User-Agent: ${ua}`,
    `Suporte WebAssembly: ${wasm}`,
    `IndexedDB: ${idb}`,
    `Service Worker: ${sw}`,
    `Memória: ${mem}`,
    `Modo leve: ${lpPref} (ativo: ${isLowPerfActive() ? 'Sim' : 'Não'}${lpCache ? `, motivo: ${lpCache.reason}` : ''})`,
    '',
    'Etapas de inicialização:',
    ...(steps.length > 0
      ? steps.map((s) => `  - ${s.label}: ${s.elapsedMs} ms (+${s.deltaMs} ms)`)
      : ['  (nenhuma etapa registrada)']),
  ];

  if (errors.length > 0) {
    lines.push('', 'Erros capturados:');
    errors.forEach((e) => lines.push(`  ! ${e}`));
  }

  return lines.join('\n');
}
