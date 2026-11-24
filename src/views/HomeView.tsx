import React from 'react';
import { Check, Fuel, Gauge, ArrowRight, Droplet } from 'lucide-react';
import { PartWithStats, Vehicle } from '../types';
import { formatDecimal, formatNumber } from '../utils/calculations';

interface HomeViewProps {
  vehicle: Vehicle;
  parts: PartWithStats[];
  onOpenFuelModal: () => void;
  onOpenFuelLevelModal?: () => void;
  onOpenKmModal: () => void;
  onRenewPart: (partId: number) => void;
  onGoToParts: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  vehicle,
  parts,
  onOpenFuelModal,
  onOpenFuelLevelModal,
  onOpenKmModal,
  onRenewPart,
  onGoToParts,
}) => {
  // Alert banner filter: SOMENTE peças com desgaste >= 80%
  const alertParts = parts
    .filter((p) => p.wearPercent >= 80)
    .sort((a, b) => b.wearPercent - a.wearPercent);

  const hasExpired = alertParts.some((p) => p.status === 'expired');
  const alertCount = alertParts.length;
  const visibleAlerts = alertParts.slice(0, 3);
  const hiddenAlertsCount = Math.max(0, alertCount - 3);

  // Autonomia calculation
  const fuelLiters = Math.max(0, vehicle.fuel_level);
  const tankCapacity = Math.max(1, vehicle.tank_capacity);
  const fuelPercent = Math.min(100, Math.max(0, (fuelLiters / tankCapacity) * 100));
  const estimatedRangeKm = Math.round(fuelLiters * vehicle.avg_consumption);
  const isFuelLow = fuelPercent < 20;

  // Specific parts for the right column mini gauges
  const oilPart =
    parts.find((p) => p.name.toLowerCase() === 'óleo do motor') ||
    parts.find((p) => p.name.toLowerCase().includes('óleo')) ||
    parts.find((p) => p.category === 'motor');

  const alignmentPart =
    parts.find((p) => p.name.toLowerCase() === 'alinhamento') ||
    parts.find((p) => p.name.toLowerCase().includes('alinhamento')) ||
    parts.find((p) => p.category === 'pneus');

  const getStatusStyle = (status: 'ok' | 'warning' | 'expired') => {
    if (status === 'expired') {
      return { stroke: '#dc2626', textClass: 'cockpit-status-exp', glow: 'rgba(239, 68, 68, 0.4)' };
    }
    if (status === 'warning') {
      return { stroke: '#d97706', textClass: 'cockpit-status-warn', glow: 'rgba(245, 158, 11, 0.4)' };
    }
    return { stroke: '#10b981', textClass: 'cockpit-status-ok', glow: 'rgba(16, 185, 129, 0.4)' };
  };

  const oilColors = getStatusStyle(oilPart?.status || 'ok');
  const alignmentColors = getStatusStyle(alignmentPart?.status || 'ok');

  // SVG calculations for main HUD ring
  const hudRadius = 82;
  const hudCircumference = 2 * Math.PI * hudRadius;
  const hudStrokeDashoffset = hudCircumference - (fuelPercent / 100) * hudCircumference;

  // SVG calculations for mini rings
  const miniRadius = 45;
  const miniCircumference = 2 * Math.PI * miniRadius;

  const oilLifeVal = oilPart ? oilPart.lifeRemainingPercent : 100;
  const oilStrokeDashoffset = miniCircumference - (oilLifeVal / 100) * miniCircumference;

  const alignmentLifeVal = alignmentPart ? alignmentPart.lifeRemainingPercent : 100;
  const alignmentStrokeDashoffset = miniCircumference - (alignmentLifeVal / 100) * miniCircumference;

  return (
    <div className="cockpit-home-root max-w-[1440px] mx-auto animate-in fade-in duration-200">
      {/* ============================================================ */}
      {/* a) FAIXA DE ALERTAS                                          */}
      {/* ============================================================ */}
      <section aria-label="Alertas do veículo" className="w-full shrink-0">
        {alertCount === 0 ? (
          // Sem alertas: faixa verde enxuta em 1 linha
          <div className="cockpit-alert-ok cockpit-alert-strip-pad w-full rounded-2xl flex items-center justify-between space-x-3">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="cockpit-alert-icon-box rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <Check size={30} strokeWidth={3.5} />
              </div>
              <div className="min-w-0">
                <h2 className="cockpit-alert-title-lg font-black tracking-tight uppercase leading-none">
                  Tudo em dia
                </h2>
                <p className="text-[14px] sm:text-[16px] font-bold opacity-90 mt-0.5 truncate">
                  Todas as manutenções estão dentro do prazo
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onGoToParts}
              className="cockpit-alert-btn px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[15px] sm:text-[16px] transition-all active:scale-95 flex items-center space-x-2 shrink-0 shadow-sm"
            >
              <span>Ver peças</span>
              <ArrowRight size={20} strokeWidth={2.8} />
            </button>
          </div>
        ) : alertCount === 1 ? (
          // 1 alerta: faixa horizontal enxuta
          <div
            className={`cockpit-alert-strip-pad w-full rounded-2xl flex flex-wrap sm:flex-nowrap items-center justify-between transition-all ${
              hasExpired ? 'cockpit-alert-exp' : 'cockpit-alert-warn'
            }`}
          >
            <div className="flex items-center space-x-3 min-w-0 flex-1 my-1 mr-2">
              <div
                className={`cockpit-alert-num-badge rounded-xl flex items-center justify-center shrink-0 font-mono-numbers font-black ${
                  hasExpired ? 'bg-red-600 text-white' : 'bg-amber-500 text-black'
                }`}
              >
                1
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center space-x-2">
                  <span className="text-[14px] font-black uppercase tracking-wide opacity-90">
                    {hasExpired ? 'Precisa de troca' : 'Para trocar em breve'}
                  </span>
                </div>
                <div className="flex items-baseline flex-wrap cockpit-wrap-2 min-w-0">
                  <span className="cockpit-alert-title-md font-black truncate">
                    {visibleAlerts[0].name}
                  </span>
                  <span
                    className={`text-[16px] font-black whitespace-nowrap ${
                      visibleAlerts[0].status === 'expired' ? 'cockpit-status-exp' : 'cockpit-status-warn'
                    }`}
                  >
                    · {visibleAlerts[0].shortDueText}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0 ml-auto my-1">
              <button
                type="button"
                onClick={() => onRenewPart(visibleAlerts[0].id)}
                aria-label={`Confirmar troca de ${visibleAlerts[0].name}`}
                className="cockpit-btn-secondary cockpit-alert-btn-tall px-5 rounded-2xl active:bg-[var(--accent)] active:text-[var(--accent-fg)] font-black text-[16px] sm:text-[18px] transition-all flex items-center justify-center shrink-0"
              >
                Troquei
              </button>
              <button
                type="button"
                onClick={onGoToParts}
                className="cockpit-btn-secondary cockpit-alert-btn-tall px-4 rounded-2xl active:scale-95 font-black text-[15px] sm:text-[16px] transition-all flex items-center space-x-1.5 shrink-0"
              >
                <span>Ver peças</span>
                <ArrowRight size={18} strokeWidth={2.6} />
              </button>
            </div>
          </div>
        ) : (
          // 2 ou 3+ alertas: cabeçalho compacto + cards lado a lado
          <div
            className={`cockpit-alert-strip-pad w-full rounded-2xl flex flex-col space-y-2 transition-all ${
              hasExpired ? 'cockpit-alert-exp' : 'cockpit-alert-warn'
            }`}
          >
            {/* Cabeçalho inline compacto */}
            <div className="flex items-center justify-between flex-wrap cockpit-wrap-2">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div
                  className={`min-w-[36px] h-[36px] px-2 rounded-xl flex items-center justify-center shrink-0 font-mono-numbers text-[20px] font-black ${
                    hasExpired ? 'bg-red-600 text-white' : 'bg-amber-500 text-black'
                  }`}
                >
                  {alertCount}
                </div>
                <h2 className="cockpit-alert-title-sm font-black tracking-tight uppercase leading-none">
                  {hasExpired ? 'Precisa de troca' : 'Peças para trocar em breve'}
                </h2>
                {hiddenAlertsCount > 0 && (
                  <span className="text-[14px] sm:text-[16px] font-black opacity-95 whitespace-nowrap">
                    · +{hiddenAlertsCount} na lista de peças
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={onGoToParts}
                className="cockpit-btn-secondary cockpit-alert-btn-compact px-4 rounded-xl active:scale-95 font-black text-[15px] flex items-center space-x-1.5 transition-all shrink-0"
              >
                <span>Ver peças</span>
                <ArrowRight size={18} strokeWidth={2.6} />
              </button>
            </div>

            {/* Máximo de 3 itens críticos lado a lado em horizontal */}
            <div
              className={`cockpit-alerts-grid ${
                visibleAlerts.length === 2 ? 'cockpit-alerts-grid-2' : 'cockpit-alerts-grid-3'
              }`}
            >
              {visibleAlerts.map((item) => (
                <div
                  key={item.id}
                  className="cockpit-alert-item rounded-xl px-2.5 py-1.5 flex items-center justify-between space-x-2 min-w-0"
                >
                  <div className="min-w-0 flex-1">
                    <h4 className="text-[15px] lg:text-[16px] font-black truncate leading-tight">
                      {item.name}
                    </h4>
                    <p
                      className={`text-[16px] font-black tracking-tight truncate leading-tight mt-0.5 ${
                        item.status === 'expired' ? 'cockpit-status-exp' : 'cockpit-status-warn'
                      }`}
                    >
                      {item.shortDueText}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onRenewPart(item.id)}
                    aria-label={`Confirmar troca de ${item.name}`}
                    className="cockpit-btn-secondary cockpit-alert-btn-item px-3.5 rounded-xl active:bg-[var(--accent)] active:text-[var(--accent-fg)] font-black text-[15px] sm:text-[16px] transition-all flex items-center justify-center shrink-0"
                  >
                    Troquei
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ============================================================ */}
      {/* GRADE PRINCIPAL: 2 Colunas em Horizontal / 1 em Retrato      */}
      {/* ============================================================ */}
      <div className="cockpit-home-cols">
        {/* ============================================================ */}
        {/* b) CARD DE AUTONOMIA (Coluna Esquerda)                       */}
        {/* ============================================================ */}
        <div className="cockpit-card cockpit-home-card-pad rounded-3xl flex flex-col justify-between space-y-2 relative overflow-hidden min-h-0">
          {/* Header compacto */}
          <div className="flex items-center justify-between space-x-2 shrink-0">
            <div className="flex items-center space-x-2.5">
              <div className="cockpit-subcard cockpit-home-fuel-icon rounded-xl flex items-center justify-center text-[var(--accent-text)] shrink-0">
                <Fuel size={22} />
              </div>
              <div>
                <h3 className="cockpit-home-heading font-black cockpit-text-primary tracking-tight leading-none">
                  Autonomia
                </h3>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[14px] cockpit-text-muted font-bold uppercase mr-1.5">Média</span>
              <span className="cockpit-home-avg-val font-mono-numbers font-black cockpit-text-primary">
                {formatDecimal(vehicle.avg_consumption)}{' '}
                <span className="text-[14px] cockpit-text-secondary font-bold">km/L</span>
              </span>
            </div>
          </div>

          {/* Anel circular HUD */}
          <div className="flex-1 min-h-0 flex items-center justify-center py-0.5">
            <div className="relative cockpit-hud-ring-box flex items-center justify-center">
              <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 200 200">
                <circle
                  cx="100"
                  cy="100"
                  r={hudRadius}
                  className="cockpit-ring-track"
                  strokeWidth="16"
                  fill="none"
                />
                <circle
                  cx="100"
                  cy="100"
                  r={hudRadius}
                  stroke={isFuelLow ? '#ef4444' : 'var(--accent)'}
                  strokeWidth="16"
                  strokeDasharray={hudCircumference}
                  strokeDashoffset={hudStrokeDashoffset}
                  strokeLinecap="round"
                  fill="none"
                  style={{
                    transition: 'stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                    filter: isFuelLow
                      ? 'drop-shadow(0 0 12px rgba(239, 68, 68, 0.55))'
                      : 'drop-shadow(0 0 12px var(--accent-glow))',
                  }}
                />
              </svg>

              {/* Centro do Anel */}
              <div className="absolute top-0 right-0 bottom-0 left-0 flex flex-col items-center justify-center text-center select-none pointer-events-none px-5">
                <span
                  className={`font-mono-numbers cockpit-hud-range-num font-black tracking-tight leading-none ${
                    isFuelLow ? 'cockpit-status-exp' : 'cockpit-text-primary'
                  }`}
                >
                  {formatNumber(estimatedRangeKm)}
                </span>
                <span className="cockpit-hud-range-label font-black cockpit-text-secondary uppercase tracking-widest mt-1">
                  autonomia
                </span>
              </div>
            </div>
          </div>

          {/* Régua do tanque Reserva · ½ · Cheio */}
          <div className="flex flex-col space-y-1 shrink-0">
            <div className="cockpit-subcard relative w-full h-3.5 rounded-full overflow-hidden p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isFuelLow
                    ? 'bg-gradient-to-r from-red-600 to-red-500 shadow-[0_0_12px_rgba(239,68,68,0.6)]'
                    : 'bg-[var(--accent)] shadow-[0_0_12px_var(--accent-glow)]'
                }`}
                style={{ width: `${fuelPercent}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[14px] font-black cockpit-text-secondary tracking-wide px-0.5 leading-none">
              <span className={isFuelLow ? 'cockpit-status-exp uppercase' : 'uppercase'}>Reserva</span>
              <span className="font-mono-numbers cockpit-text-primary">
                ½ · {formatDecimal(fuelLiters)}/{vehicle.tank_capacity} L ({Math.round(fuelPercent)}%)
              </span>
              <span className="uppercase">Cheio</span>
            </div>
          </div>

          {/* Botões "+ Abastecimento" e "Ajustar L" */}
          <div className="w-full shrink-0 flex items-center space-x-2.5">
            <button
              type="button"
              onClick={onOpenFuelModal}
              className="flex-1 cockpit-home-cta-btn rounded-2xl bg-[var(--accent)] hover:brightness-110 active:scale-98 text-[var(--accent-fg)] font-black shadow-[0_0_22px_rgba(var(--accent-rgb),0.4)] flex items-center justify-center space-x-2 transition-all"
            >
              <Fuel size={22} strokeWidth={2.8} />
              <span>+ Abastecimento</span>
            </button>
            {onOpenFuelLevelModal && (
              <button
                type="button"
                onClick={onOpenFuelLevelModal}
                aria-label="Ajustar nível atual do tanque em litros"
                className="cockpit-btn-secondary cockpit-home-cta-btn px-4 rounded-2xl active:scale-98 font-black flex items-center justify-center space-x-1.5 shrink-0 transition-all"
              >
                <Droplet size={20} className="text-cyan-400 shrink-0" />
                <span>Ajustar L</span>
              </button>
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/* c) COLUNA DIREITA (Odômetro + Óleo + Alinhamento)            */}
        {/* ============================================================ */}
        <div className="flex flex-col space-y-2.5 justify-between min-h-0">
          {/* Card Odômetro Digital */}
          <div className="cockpit-card cockpit-right-top cockpit-home-card-sm-pad rounded-3xl flex flex-col justify-between space-y-2 relative overflow-hidden">
            <div className="flex items-center justify-between space-x-2 shrink-0">
              <span className="text-[14px] uppercase tracking-widest cockpit-text-secondary font-black">
                Veículo Ativo
              </span>
              {vehicle.plate && (
                <div className="cockpit-display px-3 py-0.5 rounded-xl flex items-center justify-center font-mono-numbers text-[14px] sm:text-[16px] font-black tracking-widest uppercase">
                  {vehicle.plate}
                </div>
              )}
            </div>

            {/* ODÔMETRO digital */}
            <div className="cockpit-display flex-1 min-h-0 rounded-2xl px-3 py-1.5 text-center flex flex-col items-center justify-center shadow-inner overflow-hidden">
              <div className="font-mono-numbers cockpit-odo-num leading-none font-black text-[var(--accent-text)] tracking-tight whitespace-nowrap">
                {formatNumber(vehicle.current_km)}
                <span className="text-[0.42em] cockpit-text-muted font-bold ml-1.5">km</span>
              </div>
            </div>

            {/* Botão "Atualizar km" */}
            <button
              type="button"
              onClick={onOpenKmModal}
              className="cockpit-btn-secondary w-full cockpit-home-cta-btn shrink-0 rounded-2xl active:scale-98 font-black flex items-center justify-center space-x-2.5 transition-all"
            >
              <Gauge size={24} strokeWidth={2.8} />
              <span>Atualizar km</span>
            </button>
          </div>

          {/* Dois anéis menores lado a lado: ÓLEO e ALINHAMENTO */}
          <div className="cockpit-card cockpit-right-bottom cockpit-home-rings-pad cockpit-home-rings-card rounded-3xl">
            {/* Anel Óleo */}
            <div className="cockpit-subcard cockpit-home-ring-item-pad flex flex-col items-center justify-between text-center rounded-2xl min-h-0">
              <span className="text-[14px] sm:text-[15px] font-black uppercase tracking-wide cockpit-text-secondary leading-none truncate w-full shrink-0">
                Óleo do Motor
              </span>
              <div className="relative cockpit-mini-ring-box flex items-center justify-center my-auto">
                <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 110 110">
                  <circle
                    cx="55"
                    cy="55"
                    r={miniRadius}
                    className="cockpit-ring-track"
                    strokeWidth="11"
                    fill="none"
                  />
                  <circle
                    cx="55"
                    cy="55"
                    r={miniRadius}
                    stroke={oilColors.stroke}
                    strokeWidth="11"
                    strokeDasharray={miniCircumference}
                    strokeDashoffset={oilStrokeDashoffset}
                    strokeLinecap="round"
                    fill="none"
                    style={{
                      transition: 'stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                      filter: `drop-shadow(0 0 6px ${oilColors.glow})`,
                    }}
                  />
                </svg>
                <div className="absolute top-0 right-0 bottom-0 left-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className={`font-mono-numbers cockpit-mini-ring-num leading-none font-black ${oilColors.textClass}`}>
                    {oilLifeVal}%
                  </span>
                </div>
              </div>
              <span className="text-[16px] font-black cockpit-text-primary leading-tight truncate w-full shrink-0">
                {oilPart ? oilPart.shortDueText : 'Em dia'}
              </span>
            </div>

            {/* Anel Alinhamento */}
            <div className="cockpit-subcard cockpit-home-ring-item-pad flex flex-col items-center justify-between text-center rounded-2xl min-h-0">
              <span className="text-[14px] sm:text-[15px] font-black uppercase tracking-wide cockpit-text-secondary leading-none truncate w-full shrink-0">
                Alinhamento
              </span>
              <div className="relative cockpit-mini-ring-box flex items-center justify-center my-auto">
                <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 110 110">
                  <circle
                    cx="55"
                    cy="55"
                    r={miniRadius}
                    className="cockpit-ring-track"
                    strokeWidth="11"
                    fill="none"
                  />
                  <circle
                    cx="55"
                    cy="55"
                    r={miniRadius}
                    stroke={alignmentColors.stroke}
                    strokeWidth="11"
                    strokeDasharray={miniCircumference}
                    strokeDashoffset={alignmentStrokeDashoffset}
                    strokeLinecap="round"
                    fill="none"
                    style={{
                      transition: 'stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                      filter: `drop-shadow(0 0 6px ${alignmentColors.glow})`,
                    }}
                  />
                </svg>
                <div className="absolute top-0 right-0 bottom-0 left-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className={`font-mono-numbers cockpit-mini-ring-num leading-none font-black ${alignmentColors.textClass}`}>
                    {alignmentLifeVal}%
                  </span>
                </div>
              </div>
              <span className="text-[16px] font-black cockpit-text-primary leading-tight truncate w-full shrink-0">
                {alignmentPart ? alignmentPart.shortDueText : 'Em dia'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
