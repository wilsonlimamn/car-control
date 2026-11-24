import React, { useRef, useState, useEffect } from 'react';
import {
  Palette,
  Download,
  Upload,
  FileSpreadsheet,
  HardDrive,
  Check,
  RefreshCw,
  ShieldCheck,
  AlertCircle,
  Smartphone,
  GitBranch,
  ExternalLink,
  Gauge,
  Copy,
  FileText,
} from 'lucide-react';
import { BgStyleType, ThemeType, Vehicle } from '../types';
import {
  exportCsvReport,
  exportSqliteBinary,
  getAutoBackupStatus,
  getHistory,
  getParts,
  getPersistenceStatus,
  getSettings,
  isNativeCapacitorPlatform,
  requestStoragePersistence,
  restoreLatestAutoBackup,
  restoreSqliteBinary,
  retryPersistDatabaseNow,
  resetToDefaults,
  subscribePersistenceStatus,
  triggerManualAutoBackupSnapshot,
  updateSetting,
} from '../db/sqlite';
import { base64ToUint8, uint8ToBase64 } from '../db/schema';
import type { AutoBackupEntry } from '../db/backupManager';
import type { PersistenceStatus } from '../db/types';
import { copyTextWithFallback } from '../utils/diagnostics';
import {
  getLowPerfAutoCache,
  getLowPerfPreference,
  isLowPerfActive,
  LowPerfPreference,
  setLowPerfPreference,
} from '../utils/diagnostics';
import { usePWAInstall } from '../hooks/usePWAInstall';

const CURRENT_APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) || '1.0.0';

function normalizeRepoPath(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '');
}

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

function formatLastSavedTime(ms: number | null): string {
  if (!ms) return 'Ainda não gravado';
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return `${hh}:${min}:${ss}`;
  }
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm} às ${hh}:${min}:${ss}`;
}

function getStorageBackendLabel(status: PersistenceStatus): string {
  if (status.backend === 'indexeddb') return 'IndexedDB';
  if (status.backend === 'localstorage') return 'localStorage';
  if (status.allFailed) return 'Indisponível';
  return 'Aguardando gravação';
}

interface SettingsViewProps {
  currentTheme: ThemeType;
  currentBgStyle: BgStyleType;
  activeVehicle: Vehicle;
  onThemeChange: (theme: ThemeType) => void;
  onBgStyleChange: (bg: BgStyleType) => void;
  onReloadData: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  currentTheme,
  currentBgStyle,
  activeVehicle,
  onThemeChange,
  onBgStyleChange,
  onReloadData,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [persistStatus, setPersistStatus] = useState<string>('Verificando...');
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError?: boolean } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  // GitHub APK update state
  const [githubRepo, setGithubRepo] = useState<string>('wilsonlimamn/car-control');
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{
    status: 'idle' | 'available' | 'latest' | 'error';
    latestVersion?: string;
    downloadUrl?: string;
    releasePageUrl?: string;
    message?: string;
  }>({ status: 'idle' });

  const [lastAutoBackup, setLastAutoBackup] = useState<AutoBackupEntry | null>(null);
  const [autoBackups, setAutoBackups] = useState<AutoBackupEntry[]>([]);
  const [restoringAutoBackup, setRestoringAutoBackup] = useState(false);
  const [dbStatus, setDbStatus] = useState<PersistenceStatus>(() => getPersistenceStatus());
  const [retryingSave, setRetryingSave] = useState(false);
  const [textBackupMode, setTextBackupMode] = useState<'none' | 'export' | 'import'>('none');
  const [textBackupValue, setTextBackupValue] = useState<string>('');
  const [restoringText, setRestoringText] = useState(false);
  const [lowPerfPref, setLowPerfPref] = useState<LowPerfPreference>(() => getLowPerfPreference());
  const [lowPerfActiveNow, setLowPerfActiveNow] = useState<boolean>(() => isLowPerfActive());
  const [lowPerfDetail, setLowPerfDetail] = useState<string>(
    () => getLowPerfAutoCache()?.reason || 'Avaliado automaticamente no boot'
  );

  const refreshAutoBackups = () => {
    getAutoBackupStatus()
      .then((res) => {
        setLastAutoBackup(res.lastBackup);
        setAutoBackups(res.backups);
      })
      .catch(() => {});
  };

  useEffect(() => {
    const unsubPersist = subscribePersistenceStatus((st) => {
      setDbStatus(st);
    });
    checkStorage();
    refreshAutoBackups();
    getSettings()
      .then((st) => {
        if (st.githubRepo) setGithubRepo(st.githubRepo);
      })
      .catch(() => {});
    return unsubPersist;
  }, []);

  const checkStorage = async () => {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persisted) {
      const persisted = await navigator.storage.persisted();
      setPersistStatus(persisted ? 'Persistente Ativo (Protegido)' : 'Padrão do Navegador (Pode ser limpo se o disco encher)');
    } else {
      setPersistStatus('Armazenamento local padrão disponível');
    }
  };

  const handleRequestPersistence = async () => {
    const res = await requestStoragePersistence();
    if (res.persisted) {
      setPersistStatus('Persistente Ativo (Protegido)');
      setStatusMsg({ text: 'Armazenamento permanente concedido com sucesso!' });
    } else {
      setPersistStatus('Armazenamento padrão mantido');
      setStatusMsg({ text: 'Armazenamento padrão mantido pelo navegador.' });
    }
  };

  const themes: { id: ThemeType; name: string; gradient: string }[] = [
    { id: 'amber', name: 'Âmbar Rally', gradient: 'from-amber-500 via-amber-400 to-yellow-500' },
    { id: 'emerald', name: 'Verde Piloto', gradient: 'from-emerald-500 via-emerald-400 to-teal-400' },
    { id: 'crimson', name: 'Carmesim GT', gradient: 'from-red-600 via-red-500 to-rose-400' },
    { id: 'cobalt', name: 'Azul Hi-Tech', gradient: 'from-cyan-500 via-cyan-400 to-blue-500' },
    { id: 'violet', name: 'Roxo F1', gradient: 'from-purple-500 via-purple-400 to-fuchsia-400' },
    { id: 'navy', name: 'Azul Escuro', gradient: 'from-blue-800 via-blue-700 to-indigo-800' },
  ];

  const bgStyles: { id: BgStyleType; label: string; desc: string; swatchClass: string }[] = [
    {
      id: 'white',
      label: 'Branco Dia',
      desc: 'Fundo claro fosco com letras escuras para sol forte',
      swatchClass: 'bg-gradient-to-br from-white via-slate-100 to-slate-300 border-slate-400',
    },
    {
      id: 'gray',
      label: 'Cinza Titânio',
      desc: 'Cinza automotivo neutro sem reflexo para dia e noite',
      swatchClass: 'bg-gradient-to-br from-slate-600 via-slate-700 to-slate-800 border-slate-400',
    },
    {
      id: 'gradient',
      label: 'Degradê Cockpit',
      desc: 'Degradê suave elegante acompanhando a cor do tema',
      swatchClass: 'bg-gradient-to-br from-slate-900 via-blue-950 to-black border-white/30',
    },
    {
      id: 'oled',
      label: 'Preto OLED',
      desc: 'Preto absoluto para dirigir à noite sem ofuscar',
      swatchClass: 'bg-black border-white/30',
    },
  ];

  // Backup SQLite export
  const handleDownloadBackup = async () => {
    try {
      const bytes = await exportSqliteBinary();
      const blob = new Blob([bytes as BlobPart], { type: 'application/x-sqlite3' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = url;
      a.download = `car_control_backup_${dateStr}.sqlite`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatusMsg({
        text: isNativeCapacitorPlatform()
          ? 'Download do .sqlite iniciado. Se o WebView não baixar arquivos, toque em "Copiar backup (texto)".'
          : 'Backup SQLite baixado com sucesso!',
      });
    } catch (err) {
      setStatusMsg({
        text:
          'Download direto indisponível (' +
          (err as Error).message +
          '). Use "Copiar backup (texto)" como alternativa.',
        isError: true,
      });
    }
  };

  // Copy SQLite backup as text (Base64) for Android WebViews where file download fails
  const handleCopyTextBackup = async () => {
    try {
      const bytes = await exportSqliteBinary();
      const b64 = uint8ToBase64(bytes);
      setTextBackupValue(b64);
      setTextBackupMode('export');
      const copied = await copyTextWithFallback(b64);
      if (copied) {
        setStatusMsg({ text: 'Backup em texto copiado! Guarde em local seguro ou envie para outro aparelho.' });
      } else {
        setStatusMsg({
          text: 'Backup em texto gerado abaixo. Selecione e copie manualmente caso o WebView bloqueie a cópia.',
        });
      }
    } catch (err) {
      setStatusMsg({ text: 'Erro ao gerar backup em texto: ' + (err as Error).message, isError: true });
    }
  };

  const handleRestoreTextBackup = async () => {
    const raw = textBackupValue.trim();
    if (!raw) {
      setStatusMsg({ text: 'Cole o texto do backup antes de restaurar.', isError: true });
      return;
    }
    setRestoringText(true);
    try {
      const bytes = base64ToUint8(raw);
      await restoreSqliteBinary(bytes);
      setTextBackupMode('none');
      setTextBackupValue('');
      setStatusMsg({ text: 'Backup em texto restaurado com sucesso!' });
      onReloadData();
    } catch (err) {
      setStatusMsg({
        text: 'Texto de backup inválido: ' + (err as Error).message,
        isError: true,
      });
    } finally {
      setRestoringText(false);
    }
  };

  const handleRetrySaveNow = async () => {
    setRetryingSave(true);
    try {
      const ok = await retryPersistDatabaseNow();
      if (ok) {
        setStatusMsg({ text: 'Dados gravados com sucesso neste aparelho!' });
      } else {
        const latest = getPersistenceStatus();
        setStatusMsg({
          text: 'Falha ao gravar: ' + (latest.lastError || 'IndexedDB e localStorage indisponíveis.'),
          isError: true,
        });
      }
    } finally {
      setRetryingSave(false);
    }
  };

  // Restore SQLite import
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      await restoreSqliteBinary(bytes);
      setStatusMsg({ text: 'Backup SQLite restaurado com sucesso!' });
      onReloadData();
    } catch (err) {
      setStatusMsg({ text: 'Falha na validação do arquivo SQLite: ' + (err as Error).message, isError: true });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Export CSV Report (BOM UTF-8, separator ;)
  const handleDownloadCsv = async () => {
    try {
      const parts = await getParts(activeVehicle.id);
      const history = await getHistory(activeVehicle.id);
      const csvContent = exportCsvReport(activeVehicle, parts, history);

      try {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const dateStr = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `relatorio_manutencao_${activeVehicle.name.toLowerCase().replace(/\s+/g, '_')}_${dateStr}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setStatusMsg({
          text: isNativeCapacitorPlatform()
            ? 'Exportação CSV acionada. Se o WebView não baixar, use "Copiar backup (texto)".'
            : 'Relatório CSV exportado com sucesso!',
        });
      } catch (downloadErr) {
        const copied = await copyTextWithFallback(csvContent);
        if (copied) {
          setStatusMsg({ text: 'Download bloqueado no WebView; relatório CSV copiado para a área de transferência!' });
        } else {
          throw downloadErr;
        }
      }
    } catch (err) {
      setStatusMsg({ text: 'Erro ao exportar CSV: ' + (err as Error).message, isError: true });
    }
  };

  const handleResetData = async () => {
    await resetToDefaults();
    setConfirmReset(false);
    await onReloadData();
    setStatusMsg({ text: 'Dados restaurados para os padrões originais com sucesso!' });
  };

  const handleRestoreAutoBackup = async (backupId?: string) => {
    setRestoringAutoBackup(true);
    try {
      const res = await restoreLatestAutoBackup(backupId);
      if (res.restored && res.entry) {
        setStatusMsg({ text: `Dados restaurados do backup de ${res.entry.dateText}` });
        await onReloadData();
        refreshAutoBackups();
      } else {
        setStatusMsg({ text: 'Nenhum backup automático encontrado neste aparelho.', isError: true });
      }
    } catch (err) {
      setStatusMsg({
        text: 'Falha ao restaurar backup automático: ' + (err as Error).message,
        isError: true,
      });
    } finally {
      setRestoringAutoBackup(false);
    }
  };

  const handleSaveAutoBackupNow = async () => {
    try {
      const entry = await triggerManualAutoBackupSnapshot();
      refreshAutoBackups();
      if (entry) {
        setStatusMsg({ text: `Backup automático atualizado (${entry.dateTimeText}).` });
      }
    } catch (err) {
      setStatusMsg({ text: 'Erro ao gravar backup automático: ' + (err as Error).message, isError: true });
    }
  };

  const handleChangeLowPerf = (next: LowPerfPreference) => {
    const active = setLowPerfPreference(next);
    setLowPerfPref(next);
    setLowPerfActiveNow(active);
    const cache = getLowPerfAutoCache();
    setLowPerfDetail(cache?.reason || 'Avaliado automaticamente');
    const labels: Record<LowPerfPreference, string> = {
      auto: 'Automático',
      on: 'Ligado',
      off: 'Desligado',
    };
    setStatusMsg({
      text: `Modo leve alterado para "${labels[next]}" (${active ? 'efeitos reduzidos ativos' : 'efeitos visuais completos'}).`,
    });
  };

  const handleSaveGithubRepo = (value: string) => {
    setGithubRepo(value);
    void updateSetting('githubRepo', normalizeRepoPath(value));
  };

  const handleCheckGithubUpdate = async () => {
    const cleanRepo = normalizeRepoPath(githubRepo);
    if (!cleanRepo || !cleanRepo.includes('/')) {
      setUpdateInfo({
        status: 'error',
        message: 'Informe o repositório no formato usuario/repositorio (ex: joao/car-control).',
      });
      return;
    }

    await updateSetting('githubRepo', cleanRepo);
    setGithubRepo(cleanRepo);
    setCheckingUpdate(true);
    setUpdateInfo({ status: 'idle' });

    try {
      const response = await fetch(`https://api.github.com/repos/${cleanRepo}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' },
      });

      if (response.status === 404) {
        setUpdateInfo({
          status: 'error',
          message: 'Nenhuma versão (Release) publicada encontrada neste repositório.',
        });
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as {
        tag_name?: string;
        html_url?: string;
        assets?: Array<{ name?: string; browser_download_url?: string }>;
      };

      const latestTag = (data.tag_name || '').replace(/^v/i, '');
      const apkAsset = data.assets?.find((a) => a.name?.toLowerCase().endsWith('.apk'));
      const downloadUrl = apkAsset?.browser_download_url;

      if (!latestTag) {
        setUpdateInfo({
          status: 'error',
          message: 'Release sem número de versão válido.',
        });
        return;
      }

      if (compareVersions(latestTag, CURRENT_APP_VERSION) > 0) {
        setUpdateInfo({
          status: 'available',
          latestVersion: latestTag,
          downloadUrl,
          releasePageUrl: data.html_url,
        });
      } else {
        setUpdateInfo({
          status: 'latest',
          latestVersion: latestTag,
        });
      }
    } catch {
      setUpdateInfo({
        status: 'error',
        message: 'Sem conexão ou não foi possível consultar o GitHub agora.',
      });
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <div className="flex flex-col space-y-6 w-full max-w-5xl mx-auto pb-16 animate-in fade-in duration-200">
      <div>
        <h2 className="text-3xl sm:text-4xl font-black cockpit-text-primary tracking-tight uppercase">
          Ajustes do Cockpit
        </h2>
      </div>

      {statusMsg && (
        <div
          className={`p-5 rounded-2xl flex items-center justify-between space-x-4 border-2 ${
            statusMsg.isError ? 'cockpit-alert-exp' : 'cockpit-alert-ok'
          }`}
        >
          <div className="flex items-center space-x-3">
            {statusMsg.isError ? <AlertCircle size={26} /> : <Check size={26} />}
            <span className="font-black text-lg">{statusMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMsg(null)}
            className="text-sm uppercase font-black opacity-80 hover:opacity-100"
          >
            Fechar
          </button>
        </div>
      )}

      {/* SEÇÃO 1: Os 6 Temas em amostras grandes (80px) */}
      <div className="cockpit-card rounded-3xl p-6 sm:p-8 flex flex-col space-y-5">
        <div className="flex items-center space-x-3">
          <div className="cockpit-subcard w-12 h-12 rounded-2xl flex items-center justify-center text-[var(--accent-text)]">
            <Palette size={26} />
          </div>
          <div>
            <h3 className="text-2xl font-black cockpit-text-primary tracking-tight uppercase">
              Cores do Cockpit (6 Temas)
            </h3>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 pt-2">
          {themes.map((t) => {
            const isSelected = currentTheme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onThemeChange(t.id)}
                className={`flex flex-col items-center space-y-2.5 p-3.5 rounded-2xl border-2 transition-all active:scale-95 ${
                  isSelected
                    ? 'cockpit-btn-secondary border-[var(--accent)] shadow-[0_0_24px_rgba(var(--accent-rgb),0.4)]'
                    : 'cockpit-subcard hover:opacity-95'
                }`}
              >
                <div
                  className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${t.gradient} flex items-center justify-center shadow-lg transition-transform ${
                    isSelected ? 'scale-105 ring-4 ring-white/30' : 'opacity-90'
                  }`}
                >
                  {isSelected && (
                    <div className="w-9 h-9 rounded-full bg-black/75 flex items-center justify-center text-white shadow">
                      <Check size={22} strokeWidth={3.5} />
                    </div>
                  )}
                </div>
                <span className="text-base font-black text-center leading-tight cockpit-text-primary">
                  {t.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* SEÇÃO 2: Os 4 Estilos de Fundo */}
      <div className="cockpit-card rounded-3xl p-6 sm:p-8 flex flex-col space-y-5">
        <h3 className="text-2xl font-black cockpit-text-primary tracking-tight uppercase">
          Estilo do Fundo (4 Modos)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {bgStyles.map((b) => {
            const isSelected = currentBgStyle === b.id;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => onBgStyleChange(b.id)}
                className={`min-h-[84px] p-5 rounded-2xl border-2 text-left flex items-center justify-between space-x-4 transition-all active:scale-98 ${
                  isSelected
                    ? 'bg-accent/15 border-[var(--accent)] shadow-[0_0_24px_rgba(var(--accent-rgb),0.28)]'
                    : 'cockpit-subcard hover:opacity-95'
                }`}
              >
                <div className="flex items-center space-x-4 min-w-0">
                  <div className={`w-12 h-12 rounded-xl border-2 shrink-0 shadow-sm ${b.swatchClass}`} />
                  <div className="min-w-0">
                    <h4 className="text-xl font-black cockpit-text-primary leading-tight">{b.label}</h4>
                    <p className="text-[14px] cockpit-text-secondary font-semibold mt-0.5 leading-snug">{b.desc}</p>
                  </div>
                </div>
                {isSelected && (
                  <div className="w-9 h-9 rounded-xl bg-[var(--accent)] text-[var(--accent-fg)] flex items-center justify-center shrink-0">
                    <Check size={22} strokeWidth={3.5} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* SEÇÃO 2.5: Modo Leve (Desempenho para Centrais com 1 GB RAM) */}
      <div className="cockpit-card rounded-3xl p-6 sm:p-8 flex flex-col space-y-5">
        <div className="flex flex-wrap items-center justify-between cockpit-wrap-3">
          <div className="flex items-center space-x-3">
            <div className="cockpit-subcard w-12 h-12 rounded-2xl flex items-center justify-center text-[var(--accent-text)]">
              <Gauge size={26} />
            </div>
            <div>
              <h3 className="text-2xl font-black cockpit-text-primary tracking-tight uppercase">
                Modo Leve (Desempenho)
              </h3>
              <p className="text-sm sm:text-base cockpit-text-secondary font-bold mt-0.5">
                Reduz sombras, blur e animações pesadas. Status atual:{' '}
                <span className="cockpit-text-primary">{lowPerfActiveNow ? 'Ativado' : 'Desativado'}</span>
                {lowPerfPref === 'auto' ? ` (${lowPerfDetail})` : ''}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(
            [
              { id: 'auto', label: 'Automático', desc: 'Detecta RAM, CPU e tempo de boot' },
              { id: 'on', label: 'Ligado', desc: 'Sempre sem sombras e animações' },
              { id: 'off', label: 'Desligado', desc: 'Visual completo com efeitos' },
            ] as const
          ).map((opt) => {
            const isSelected = lowPerfPref === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleChangeLowPerf(opt.id)}
                className={`min-h-[72px] p-4 rounded-2xl border-2 text-left flex items-center justify-between space-x-3 transition-all ${
                  isSelected
                    ? 'bg-accent/15 border-[var(--accent)]'
                    : 'cockpit-subcard hover:opacity-95'
                }`}
              >
                <div>
                  <div className="text-lg font-black cockpit-text-primary">{opt.label}</div>
                  <div className="text-xs sm:text-sm cockpit-text-secondary font-semibold mt-0.5">
                    {opt.desc}
                  </div>
                </div>
                {isSelected && (
                  <div className="w-8 h-8 rounded-xl bg-[var(--accent)] text-[var(--accent-fg)] flex items-center justify-center shrink-0">
                    <Check size={18} strokeWidth={3.5} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* SEÇÃO 3: Backup SQLite & Exportação CSV */}
      <div className="cockpit-card rounded-3xl p-6 sm:p-8 flex flex-col space-y-6">
        <div className="flex items-center space-x-3">
          <div className="cockpit-subcard w-12 h-12 rounded-2xl flex items-center justify-center text-[var(--accent-text)]">
            <HardDrive size={26} />
          </div>
          <div>
            <h3 className="text-2xl font-black cockpit-text-primary tracking-tight uppercase">
              Backup & Dados Locais (100% Offline)
            </h3>
          </div>
        </div>

        {/* Linha de status: Dados salvos neste aparelho */}
        <div
          className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between space-y-2.5 sm:space-y-0 sm:space-x-4 ${
            dbStatus.allFailed ? 'cockpit-alert-warn' : 'cockpit-subcard'
          }`}
        >
          <div className="flex items-center space-x-3 min-w-0">
            <ShieldCheck
              size={22}
              className={dbStatus.allFailed ? 'shrink-0' : 'text-emerald-400 shrink-0'}
            />
            <div className="min-w-0 text-sm sm:text-base font-bold cockpit-text-primary leading-snug">
              <span className="font-black">Dados salvos neste aparelho</span>
              <span className="cockpit-text-secondary">
                {' — '}
                {dbStatus.saving
                  ? 'Salvando alterações…'
                  : dbStatus.allFailed
                  ? `Falha ao gravar: ${dbStatus.lastError || 'IndexedDB e localStorage falharam'}`
                  : `Última gravação: ${formatLastSavedTime(dbStatus.lastSavedAtMs)} • Armazenamento: ${getStorageBackendLabel(dbStatus)}`}
              </span>
            </div>
          </div>
          {dbStatus.allFailed && (
            <button
              type="button"
              disabled={retryingSave}
              onClick={handleRetrySaveNow}
              className="min-h-[44px] px-4 rounded-xl bg-[var(--accent)] text-[var(--accent-fg)] font-black text-sm shrink-0 disabled:opacity-60"
            >
              {retryingSave ? 'Tentando…' : 'Tentar novamente'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            type="button"
            onClick={handleDownloadBackup}
            className="cockpit-btn-secondary min-h-[72px] p-4 rounded-2xl active:scale-95 font-black text-base sm:text-lg flex items-center justify-center space-x-2.5 transition-all text-center"
          >
            <Download size={22} className="text-amber-500 shrink-0" />
            <span>Baixar Backup (.sqlite)</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="cockpit-btn-secondary min-h-[72px] p-4 rounded-2xl active:scale-95 font-black text-base sm:text-lg flex items-center justify-center space-x-2.5 transition-all text-center"
          >
            <Upload size={22} className="text-cyan-500 shrink-0" />
            <span>Restaurar (.sqlite)</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".sqlite,.db"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            type="button"
            onClick={handleDownloadCsv}
            className="cockpit-btn-secondary min-h-[72px] p-4 rounded-2xl active:scale-95 font-black text-base sm:text-lg flex items-center justify-center space-x-2.5 transition-all text-center"
          >
            <FileSpreadsheet size={22} className="text-emerald-500 shrink-0" />
            <span>Exportar CSV (Excel)</span>
          </button>

          <button
            type="button"
            onClick={handleCopyTextBackup}
            className="cockpit-btn-secondary min-h-[72px] p-4 rounded-2xl active:scale-95 font-black text-base sm:text-lg flex items-center justify-center space-x-2.5 transition-all text-center"
          >
            <Copy size={22} className="text-blue-400 shrink-0" />
            <span>Copiar backup (texto)</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between cockpit-wrap-2 text-xs sm:text-sm cockpit-text-secondary font-bold">
          <span>
            No WebView Android, se o download direto não iniciar, use &quot;Copiar backup (texto)&quot;.
          </span>
          <button
            type="button"
            onClick={() => {
              if (textBackupMode === 'import') {
                setTextBackupMode('none');
              } else {
                setTextBackupValue('');
                setTextBackupMode('import');
              }
            }}
            className="underline font-black cockpit-text-primary hover:opacity-80 flex items-center space-x-1.5"
          >
            <FileText size={16} />
            <span>{textBackupMode === 'import' ? 'Fechar restauração por texto' : 'Colar backup (texto)'}</span>
          </button>
        </div>

        {textBackupMode !== 'none' && (
          <div className="cockpit-subcard p-4 sm:p-5 rounded-2xl flex flex-col space-y-3 border border-[var(--accent-border)]">
            <div className="flex flex-wrap items-center justify-between cockpit-wrap-2">
              <h4 className="text-base font-black cockpit-text-primary">
                {textBackupMode === 'export'
                  ? 'Backup em texto (Base64 do arquivo .sqlite)'
                  : 'Colar backup em texto para restaurar'}
              </h4>
              <button
                type="button"
                onClick={() => setTextBackupMode('none')}
                className="text-xs uppercase font-black px-3 py-1.5 rounded-xl bg-black/25 hover:bg-black/40 cockpit-text-primary"
              >
                Fechar
              </button>
            </div>
            <textarea
              value={textBackupValue}
              onChange={(e) => {
                if (textBackupMode === 'import') setTextBackupValue(e.target.value);
              }}
              readOnly={textBackupMode === 'export'}
              rows={4}
              placeholder={
                textBackupMode === 'import'
                  ? 'Cole aqui o texto gerado anteriormente por "Copiar backup (texto)"...'
                  : ''
              }
              className="cockpit-input w-full p-3 rounded-xl text-xs font-mono break-all focus:border-[var(--accent)] focus:outline-none"
            />
            <div className="flex flex-wrap items-center cockpit-wrap-2">
              {textBackupMode === 'export' ? (
                <button
                  type="button"
                  onClick={handleCopyTextBackup}
                  className="min-h-[48px] px-5 rounded-xl bg-[var(--accent)] text-[var(--accent-fg)] font-black text-sm flex items-center space-x-2"
                >
                  <Copy size={18} />
                  <span>Copiar novamente</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={restoringText}
                  onClick={handleRestoreTextBackup}
                  className="min-h-[48px] px-5 rounded-xl bg-[var(--accent)] text-[var(--accent-fg)] font-black text-sm disabled:opacity-60"
                >
                  {restoringText ? 'Restaurando…' : 'Restaurar backup colado'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Backup Automático & Armazenamento Persistente */}
        <div className="cockpit-subcard p-6 rounded-2xl flex flex-col space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0 md:space-x-4">
            <div>
              <h4 className="text-lg font-black cockpit-text-primary">Backup Automático Local (Últimas 3 cópias)</h4>
              <p className="text-base cockpit-text-secondary font-bold mt-0.5">
                Último backup automático:{' '}
                <span className="cockpit-text-primary font-mono-numbers">
                  {lastAutoBackup ? lastAutoBackup.dateTimeText : 'Nenhum gravado ainda'}
                </span>
              </p>
              {autoBackups.length > 1 && (
                <p className="text-xs sm:text-sm cockpit-text-muted font-semibold mt-1">
                  Cópias disponíveis: {autoBackups.map((b) => b.dateTimeText).join(' • ')}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center cockpit-wrap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleSaveAutoBackupNow}
                className="cockpit-btn-secondary min-h-[54px] px-5 rounded-2xl font-black text-sm sm:text-base transition-all active:scale-95"
              >
                Salvar Agora
              </button>
              <button
                type="button"
                disabled={restoringAutoBackup || !lastAutoBackup}
                onClick={() => handleRestoreAutoBackup(lastAutoBackup?.id)}
                className="min-h-[54px] px-6 rounded-2xl bg-[var(--accent)] text-[var(--accent-fg)] font-black text-sm sm:text-base transition-all active:scale-95 disabled:opacity-50"
              >
                {restoringAutoBackup ? 'Restaurando…' : 'Restaurar backup'}
              </button>
            </div>
          </div>

          <div className="pt-4 border-t cockpit-divider flex flex-col md:flex-row md:items-center justify-between space-y-5 md:space-y-0 md:space-x-5">
            <div className="flex items-start space-x-4">
              <div className="cockpit-display w-12 h-12 rounded-xl flex items-center justify-center cockpit-text-primary shrink-0">
                <ShieldCheck size={26} />
              </div>
              <div>
                <h4 className="text-lg font-black cockpit-text-primary">Armazenamento no Navegador</h4>
                <p className="text-base cockpit-text-secondary font-bold mt-0.5">{persistStatus}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRequestPersistence}
              className="cockpit-btn-secondary min-h-[58px] px-6 rounded-2xl font-black text-base shrink-0 transition-all active:scale-95"
            >
              Solicitar Persistência Total
            </button>
          </div>
        </div>

        {/* Instalar App na Central / Tela Inicial (PWA) */}
        {!isInstalled && (isInstallable || isIOS) && (
          <div className="p-6 rounded-2xl bg-accent/10 border-2 border-accent/40 flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0 md:space-x-4">
            <div className="flex items-start space-x-4">
              <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center text-[var(--accent-text)] shrink-0">
                <Smartphone size={26} />
              </div>
              <div>
                <h4 className="text-lg font-black cockpit-text-primary">Instalar na Central Multimídia</h4>
                <p className="text-base cockpit-text-secondary font-bold mt-0.5">
                  Abre em tela cheia horizontal e funciona 100% offline sem barra do navegador.
                </p>
              </div>
            </div>

            {isInstallable ? (
              <button
                type="button"
                onClick={install}
                className="min-h-[60px] px-7 rounded-2xl bg-[var(--accent)] hover:brightness-110 active:scale-95 text-[var(--accent-fg)] font-black text-base shrink-0 shadow-[0_0_20px_rgba(var(--accent-rgb),0.4)] transition-all flex items-center justify-center space-x-2.5"
              >
                <Download size={22} strokeWidth={2.8} />
                <span>Instalar Aplicativo</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowIOSGuide((v) => !v)}
                className="min-h-[60px] px-7 rounded-2xl bg-[var(--accent)] hover:brightness-110 active:scale-95 text-[var(--accent-fg)] font-black text-base shrink-0 transition-all"
              >
                Como Instalar no iOS
              </button>
            )}
          </div>
        )}

        {showIOSGuide && !isInstalled && (
          <div className="cockpit-subcard p-5 rounded-2xl text-base cockpit-text-secondary font-semibold leading-relaxed">
            1. Toque no botão <strong className="cockpit-text-primary">Compartilhar</strong> do Safari.{' '}
            2. Role e escolha <strong className="cockpit-text-primary">Adicionar à Tela de Início</strong>.
          </div>
        )}

        {/* Atualização pelo GitHub (APK) */}
        <div className="cockpit-subcard p-6 rounded-2xl flex flex-col space-y-4">
          <div className="flex flex-wrap items-center justify-between cockpit-wrap-3">
            <div className="flex items-center space-x-3">
              <div className="cockpit-display w-12 h-12 rounded-xl flex items-center justify-center text-[var(--accent-text)] shrink-0">
                <GitBranch size={24} />
              </div>
              <div>
                <h4 className="text-lg font-black cockpit-text-primary">
                  Atualização pelo GitHub (APK)
                </h4>
                <p className="text-[14px] cockpit-text-secondary font-bold">
                  Versão instalada: <span className="font-mono-numbers cockpit-text-primary">v{CURRENT_APP_VERSION}</span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCheckGithubUpdate}
              disabled={checkingUpdate}
              className="cockpit-btn-secondary min-h-[58px] px-6 rounded-2xl font-black text-base flex items-center justify-center space-x-2 transition-all active:scale-95 disabled:opacity-60"
            >
              <RefreshCw size={20} className={checkingUpdate ? 'animate-spin' : ''} />
              <span>{checkingUpdate ? 'Consultando GitHub...' : 'Verificar Atualização'}</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-2">
            <label htmlFor="github-repo-input" className="text-[14px] font-bold cockpit-text-secondary shrink-0">
              Repositório GitHub:
            </label>
            <input
              id="github-repo-input"
              type="text"
              placeholder="usuario/car-control"
              value={githubRepo}
              onChange={(e) => handleSaveGithubRepo(e.target.value)}
              className="cockpit-input flex-1 h-14 px-4 rounded-xl focus:border-[var(--accent)] focus:outline-none text-base font-mono-numbers font-bold"
            />
          </div>

          {updateInfo.status === 'available' && (
            <div className="cockpit-alert-warn p-4 rounded-2xl flex flex-wrap items-center justify-between cockpit-wrap-3">
              <div>
                <p className="text-base font-black">
                  Nova versão disponível: v{updateInfo.latestVersion}
                </p>
                <p className="text-[14px] font-bold opacity-90">
                  Baixe e instale o novo APK por cima do atual sem perder seus dados.
                </p>
              </div>
              {updateInfo.downloadUrl ? (
                <a
                  href={updateInfo.downloadUrl}
                  download
                  className="min-h-[58px] px-6 rounded-2xl bg-[var(--accent)] hover:brightness-110 active:scale-95 text-[var(--accent-fg)] font-black text-base flex items-center justify-center space-x-2 shadow-md"
                >
                  <Download size={20} strokeWidth={2.8} />
                  <span>Baixar APK v{updateInfo.latestVersion}</span>
                </a>
              ) : updateInfo.releasePageUrl ? (
                <a
                  href={updateInfo.releasePageUrl}
                  className="min-h-[58px] px-6 rounded-2xl bg-[var(--accent)] hover:brightness-110 active:scale-95 text-[var(--accent-fg)] font-black text-base flex items-center justify-center space-x-2 shadow-md"
                >
                  <ExternalLink size={20} />
                  <span>Abrir Release</span>
                </a>
              ) : null}
            </div>
          )}

          {updateInfo.status === 'latest' && (
            <div className="cockpit-alert-ok p-4 rounded-2xl flex items-center space-x-2.5 text-base font-black">
              <Check size={22} strokeWidth={3} />
              <span>Você já está na versão mais recente (v{updateInfo.latestVersion}).</span>
            </div>
          )}

          {updateInfo.status === 'error' && (
            <div className="cockpit-alert-exp p-4 rounded-2xl flex items-center space-x-2.5 text-[14px] sm:text-base font-bold">
              <AlertCircle size={22} className="shrink-0" />
              <span>{updateInfo.message}</span>
            </div>
          )}
        </div>

        {/* Reset de Fábrica */}
        <div className="pt-3 border-t cockpit-divider flex flex-wrap items-center justify-between cockpit-wrap-3 text-base cockpit-text-secondary font-bold">
          <span>Restaurar dados originais de fábrica?</span>
          {confirmReset ? (
            <div className="flex items-center space-x-2.5">
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="cockpit-btn-secondary min-h-[56px] px-5 rounded-2xl font-black text-base"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleResetData}
                className="min-h-[56px] px-5 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-black text-base"
              >
                Confirmar Reset
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="min-h-[56px] px-5 rounded-2xl text-red-500 hover:text-red-400 font-black hover:bg-red-500/10 transition-colors flex items-center space-x-2 text-base"
            >
              <RefreshCw size={20} />
              <span>Redefinir Padrões</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
