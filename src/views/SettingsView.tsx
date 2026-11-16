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
  ExternalLink
} from 'lucide-react';
import { BgStyleType, ThemeType, Vehicle } from '../types';
import { 
  exportCsvReport, 
  exportSqliteBinary, 
  getHistory, 
  getParts, 
  getSettings,
  requestStoragePersistence, 
  restoreSqliteBinary,
  resetToDefaults,
  updateSetting
} from '../db/sqlite';
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
  const [githubRepo, setGithubRepo] = useState<string>(() => getSettings().githubRepo || '');
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{
    status: 'idle' | 'available' | 'latest' | 'error';
    latestVersion?: string;
    downloadUrl?: string;
    releasePageUrl?: string;
    message?: string;
  }>({ status: 'idle' });

  useEffect(() => {
    checkStorage();
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
  const handleDownloadBackup = () => {
    try {
      const bytes = exportSqliteBinary();
      const blob = new Blob([bytes as BlobPart], { type: 'application/x-sqlite3' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = url;
      a.download = `car_control_backup_${dateStr}.sqlite`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatusMsg({ text: 'Backup SQLite baixado com sucesso!' });
    } catch (err) {
      setStatusMsg({ text: 'Erro ao gerar backup: ' + (err as Error).message, isError: true });
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
  const handleDownloadCsv = () => {
    try {
      const parts = getParts(activeVehicle.id);
      const history = getHistory(activeVehicle.id);
      const csvContent = exportCsvReport(activeVehicle, parts, history);

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `relatorio_manutencao_${activeVehicle.name.toLowerCase().replace(/\s+/g, '_')}_${dateStr}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatusMsg({ text: 'Relatório CSV exportado com sucesso!' });
    } catch (err) {
      setStatusMsg({ text: 'Erro ao exportar CSV: ' + (err as Error).message, isError: true });
    }
  };

  const handleResetData = () => {
    resetToDefaults();
    setConfirmReset(false);
    onReloadData();
    setStatusMsg({ text: 'Dados restaurados para os padrões originais com sucesso!' });
  };

  const handleSaveGithubRepo = (value: string) => {
    setGithubRepo(value);
    updateSetting('githubRepo', normalizeRepoPath(value));
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

    updateSetting('githubRepo', cleanRepo);
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
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto pb-16 animate-in fade-in duration-200">
      <div>
        <h2 className="text-3xl sm:text-4xl font-black cockpit-text-primary tracking-tight uppercase">
          Ajustes do Cockpit
        </h2>
      </div>

      {statusMsg && (
        <div
          className={`p-5 rounded-2xl flex items-center justify-between gap-4 border-2 ${
            statusMsg.isError ? 'cockpit-alert-exp' : 'cockpit-alert-ok'
          }`}
        >
          <div className="flex items-center gap-3">
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
      <div className="cockpit-card rounded-3xl p-6 sm:p-8 flex flex-col gap-5">
        <div className="flex items-center gap-3">
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
                className={`flex flex-col items-center gap-2.5 p-3.5 rounded-2xl border-2 transition-all active:scale-95 ${
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
      <div className="cockpit-card rounded-3xl p-6 sm:p-8 flex flex-col gap-5">
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
                className={`min-h-[84px] p-5 rounded-2xl border-2 text-left flex items-center justify-between gap-4 transition-all active:scale-98 ${
                  isSelected
                    ? 'bg-[var(--accent)]/15 border-[var(--accent)] shadow-[0_0_24px_rgba(var(--accent-rgb),0.28)]'
                    : 'cockpit-subcard hover:opacity-95'
                }`}
              >
                <div className="flex items-center gap-4 min-w-0">
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

      {/* SEÇÃO 3: Backup SQLite & Exportação CSV */}
      <div className="cockpit-card rounded-3xl p-6 sm:p-8 flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="cockpit-subcard w-12 h-12 rounded-2xl flex items-center justify-center text-[var(--accent-text)]">
            <HardDrive size={26} />
          </div>
          <div>
            <h3 className="text-2xl font-black cockpit-text-primary tracking-tight uppercase">
              Backup & Dados Locais (100% Offline)
            </h3>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={handleDownloadBackup}
            className="cockpit-btn-secondary min-h-[72px] p-5 rounded-2xl active:scale-95 font-black text-lg flex items-center justify-center gap-3 transition-all text-center"
          >
            <Download size={24} className="text-amber-500 shrink-0" />
            <span>Baixar Backup (.sqlite)</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="cockpit-btn-secondary min-h-[72px] p-5 rounded-2xl active:scale-95 font-black text-lg flex items-center justify-center gap-3 transition-all text-center"
          >
            <Upload size={24} className="text-cyan-500 shrink-0" />
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
            className="cockpit-btn-secondary min-h-[72px] p-5 rounded-2xl active:scale-95 font-black text-lg flex items-center justify-center gap-3 transition-all text-center"
          >
            <FileSpreadsheet size={24} className="text-emerald-500 shrink-0" />
            <span>Exportar CSV (Excel)</span>
          </button>
        </div>

        {/* Armazenamento Persistente */}
        <div className="cockpit-subcard p-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
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

        {/* Instalar App na Central / Tela Inicial (PWA) */}
        {!isInstalled && (isInstallable || isIOS) && (
          <div className="p-6 rounded-2xl bg-[var(--accent)]/10 border-2 border-[var(--accent)]/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--accent)]/20 flex items-center justify-center text-[var(--accent-text)] shrink-0">
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
                className="min-h-[60px] px-7 rounded-2xl bg-[var(--accent)] hover:brightness-110 active:scale-95 text-[var(--accent-fg)] font-black text-base shrink-0 shadow-[0_0_20px_rgba(var(--accent-rgb),0.4)] transition-all flex items-center justify-center gap-2.5"
              >
                <Download size={22} strokeWidth={2.8} />
                Instalar Aplicativo
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
        <div className="cockpit-subcard p-6 rounded-2xl flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
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
              className="cockpit-btn-secondary min-h-[58px] px-6 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60"
            >
              <RefreshCw size={20} className={checkingUpdate ? 'animate-spin' : ''} />
              {checkingUpdate ? 'Consultando GitHub...' : 'Verificar Atualização'}
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
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
            <div className="cockpit-alert-warn p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3">
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
                  className="min-h-[58px] px-6 rounded-2xl bg-[var(--accent)] hover:brightness-110 active:scale-95 text-[var(--accent-fg)] font-black text-base flex items-center justify-center gap-2 shadow-md"
                >
                  <Download size={20} strokeWidth={2.8} />
                  Baixar APK v{updateInfo.latestVersion}
                </a>
              ) : updateInfo.releasePageUrl ? (
                <a
                  href={updateInfo.releasePageUrl}
                  className="min-h-[58px] px-6 rounded-2xl bg-[var(--accent)] hover:brightness-110 active:scale-95 text-[var(--accent-fg)] font-black text-base flex items-center justify-center gap-2 shadow-md"
                >
                  <ExternalLink size={20} />
                  Abrir Release
                </a>
              ) : null}
            </div>
          )}

          {updateInfo.status === 'latest' && (
            <div className="cockpit-alert-ok p-4 rounded-2xl flex items-center gap-2.5 text-base font-black">
              <Check size={22} strokeWidth={3} />
              Você já está na versão mais recente (v{updateInfo.latestVersion}).
            </div>
          )}

          {updateInfo.status === 'error' && (
            <div className="cockpit-alert-exp p-4 rounded-2xl flex items-center gap-2.5 text-[14px] sm:text-base font-bold">
              <AlertCircle size={22} className="shrink-0" />
              <span>{updateInfo.message}</span>
            </div>
          )}
        </div>

        {/* Reset de Fábrica */}
        <div className="pt-3 border-t cockpit-divider flex flex-wrap items-center justify-between gap-3 text-base cockpit-text-secondary font-bold">
          <span>Restaurar dados originais de fábrica?</span>
          {confirmReset ? (
            <div className="flex items-center gap-2.5">
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
              className="min-h-[56px] px-5 rounded-2xl text-red-500 hover:text-red-400 font-black hover:bg-red-500/10 transition-colors flex items-center gap-2 text-base"
            >
              <RefreshCw size={20} />
              Redefinir Padrões
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
