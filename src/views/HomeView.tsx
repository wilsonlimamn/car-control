import React from 'react';
import { Check, Fuel, Gauge, ArrowRight } from 'lucide-react';
import { PartWithStats, Vehicle } from '../types';
import { formatDecimal, formatNumber } from '../utils/calculations';

interface HomeViewProps {
  vehicle: Vehicle;
  parts: PartWithStats[];
  onOpenFuelModal: () => void;
  onOpenKmModal: () => void;
  onRenewPart: (partId: number) => void;
  onGoToParts: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  vehicle,
  parts,
  onOpenFuelModal,
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
      {/* a) FAIXA DE ALERTAS (~18dvh máx; menor com 0 ou 1 alerta)    */}
      {/* ============================================================ */}
      <section aria-label="Alertas do veículo" className="w-full shrink-0">
        {alertCount === 0 ? (
          // Sem alertas: faixa verde enxuta em 1 linha
          <div className="cockpit-alert-ok w-full rounded-2xl px-[clamp(12px,1.8vw,20px)] py-[clamp(8px,1.3dvh,12px)] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-[clamp(44px,7.5dvh,56px)] h-[clamp(44px,7.5dvh,56px)] rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <Check size={30} strokeWidth={3.5} />
              </div>
              <div className="min-w-0">
                <h2 className="text-[clamp(20px,3.6dvh,28px)] font-black tracking-tight uppercase leading-none">
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
              className="h-[clamp(48px,9dvh,58px)] px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[15px] sm:text-[16px] transition-all active:scale-95 flex items-center gap-2 shrink-0 shadow-sm"
            >
              <span>Ver peças</span>
              <ArrowRight size={20} strokeWidth={2.8} />
            </button>
          </div>
        ) : alertCount === 1 ? (
          // 1 alerta: faixa horizontal enxuta
          <div
            className={`w-full rounded-2xl px-[clamp(10px,1.5vw,16px)] py-[clamp(7px,1.1dvh,10px)] flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 transition-all ${
              hasExpired ? 'cockpit-alert-exp' : 'cockpit-alert-warn'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div
                className={`w-[clamp(46px,8dvh,56px)] h-[clamp(46px,8dvh,56px)] rounded-xl flex items-center justify-center shrink-0 font-mono-numbers text-[clamp(24px,4dvh,32px)] font-black ${
                  hasExpired ? 'bg-red-600 text-white' : 'bg-amber-500 text-black'
                }`}
              >
                1
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-black uppercase tracking-wide opacity-90">
                    {hasExpired ? 'Precisa de troca' : 'Para trocar em breve'}
                  </span>
                </div>
                <div className="flex items-baseline gap-2.5 min-w-0 flex-wrap">
                  <span className="text-[clamp(17px,2.8dvh,22px)] font-black truncate">
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

            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <button
                type="button"
                onClick={() => onRenewPart(visibleAlerts[0].id)}
                aria-label={`Confirmar troca de ${visibleAlerts[0].name}`}
                className="cockpit-btn-secondary h-[clamp(50px,9.8dvh,64px)] px-5 rounded-2xl active:bg-[var(--accent)] active:text-[var(--accent-fg)] font-black text-[16px] sm:text-[18px] transition-all flex items-center justify-center shrink-0"
              >
                Troquei
              </button>
              <button
                type="button"
                onClick={onGoToParts}
                className="cockpit-btn-secondary h-[clamp(50px,9.8dvh,64px)] px-4 rounded-2xl active:scale-95 font-black text-[15px] sm:text-[16px] transition-all flex items-center gap-1.5 shrink-0"
              >
                <span>Ver peças</span>
                <ArrowRight size={18} strokeWidth={2.6} />
              </button>
            </div>
          </div>
        ) : (
          // 2 ou 3+ alertas: cabeçalho compacto + cards lado a lado
          <div
            className={`w-full rounded-2xl px-[clamp(10px,1.4vw,16px)] py-[clamp(6px,1dvh,10px)] flex flex-col gap-[clamp(6px,1dvh,8px)] transition-all ${
              hasExpired ? 'cockpit-alert-exp' : 'cockpit-alert-warn'
            }`}
          >
            {/* Cabeçalho inline compacto */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`min-w-[36px] h-[36px] px-2 rounded-xl flex items-center justify-center shrink-0 font-mono-numbers text-[20px] font-black ${
                    hasExpired ? 'bg-red-600 text-white' : 'bg-amber-500 text-black'
                  }`}
                >
                  {alertCount}
                </div>
                <h2 className="text-[clamp(16px,2.7dvh,22px)] font-black tracking-tight uppercase leading-none">
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
                className="cockpit-btn-secondary h-[clamp(40px,7.4dvh,52px)] px-4 rounded-xl active:scale-95 font-black text-[15px] flex items-center gap-1.5 transition-all shrink-0"
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
                  className="cockpit-alert-item rounded-xl px-2.5 py-1.5 flex items-center justify-between gap-2 min-w-0"
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
                    className="cockpit-btn-secondary h-[clamp(48px,9.5dvh,64px)] px-3.5 rounded-xl active:bg-[var(--accent)] active:text-[var(--accent-fg)] font-black text-[15px] sm:text-[16px] transition-all flex items-center justify-center shrink-0"
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
        <div className="cockpit-card rounded-3xl p-[clamp(10px,1.9dvh,20px)] flex flex-col justify-between gap-[clamp(4px,1dvh,12px)] relative overflow-hidden min-h-0">
          {/* Header compacto */}
          <div className="flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="cockpit-subcard w-[clamp(36px,6.2dvh,46px)] h-[clamp(36px,6.2dvh,46px)] rounded-xl flex items-center justify-center text-[var(--accent-text)] shrink-0">
                <Fuel size={22} />
              </div>
              <div>
                <h3 className="text-[clamp(18px,3dvh,24px)] font-black cockpit-text-primary tracking-tight leading-none">
                  Autonomia
                </h3>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[14px] cockpit-text-muted font-bold uppercase mr-1.5">Média</span>
              <span className="text-[clamp(16px,2.8dvh,22px)] font-mono-numbers font-black cockpit-text-primary">
                {formatDecimal(vehicle.avg_consumption)}{' '}
                <span className="text-[14px] cockpit-text-secondary font-bold">km/L</span>
              </span>
            </div>
          </div>

          {/* Anel circular HUD */}
          <div className="flex-1 min-h-0 flex items-center justify-center py-0.5">
            <div className="relative h-full max-h-[clamp(132px,35dvh,268px)] max-w-full aspect-square flex items-center justify-center">
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
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-none pointer-events-none px-5">
                <span
                  className={`font-mono-numbers text-[clamp(2rem,7.8dvh,4.5rem)] font-black tracking-tight leading-none ${
                    isFuelLow ? 'cockpit-status-exp' : 'cockpit-text-primary'
                  }`}
                >
                  {formatNumber(estimatedRangeKm)}
                </span>
                <span className="text-[clamp(14px,2.2dvh,18px)] font-black cockpit-text-secondary uppercase tracking-widest mt-1">
                  autonomia
                </span>
              </div>
            </div>
          </div>

          {/* Régua do tanque Reserva · ½ · Cheio */}
          <div className="flex flex-col gap-1 shrink-0">
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

          {/* Botão "+ Abastecimento" */}
          <button
            type="button"
            onClick={onOpenFuelModal}
            className="w-full h-[clamp(50px,10.5dvh,64px)] shrink-0 rounded-2xl bg-[var(--accent)] hover:brightness-110 active:scale-98 text-[var(--accent-fg)] font-black text-[clamp(16px,2.8dvh,20px)] shadow-[0_0_22px_rgba(var(--accent-rgb),0.4)] flex items-center justify-center gap-2.5 transition-all"
          >
            <Fuel size={24} strokeWidth={2.8} />
            + Abastecimento
          </button>
        </div>

        {/* ============================================================ */}
        {/* c) COLUNA DIREITA (Odômetro + Óleo + Alinhamento)            */}
        {/* ============================================================ */}
        <div className="flex flex-col gap-[clamp(8px,1.3dvh,12px)] justify-between min-h-0">
          {/* Card Odômetro Digital */}
          <div className="cockpit-card cockpit-right-top rounded-3xl p-[clamp(8px,1.6dvh,18px)] flex flex-col justify-between gap-[clamp(6px,1dvh,12px)] relative overflow-hidden">
            <div className="flex items-center justify-between gap-2 shrink-0">
              <span className="text-[14px] uppercase tracking-widest cockpit-text-secondary font-black">
                Veículo Ativo
              </span>
              {vehicle.plate && (
                <div className="cockpit-display px-3 py-0.5 rounded-xl flex items-center justify-center font-mono-numbers text-[14px] sm:text-[16px] font-black tracking-widest uppercase">
                  {vehicle.plate}
                </div>
              )}
            </div>

            {/* ODÔMETRO digital ~15vh */}
            <div className="cockpit-display flex-1 min-h-0 rounded-2xl px-3 py-1.5 text-center flex flex-col items-center justify-center shadow-inner overflow-hidden">
              <div className="font-mono-numbers text-[clamp(2rem,min(13dvh,6.3vw),5.25rem)] leading-none font-black text-[var(--accent-text)] tracking-tight whitespace-nowrap">
                {formatNumber(vehicle.current_km)}
                <span className="text-[0.42em] cockpit-text-muted font-bold ml-1.5">km</span>
              </div>
            </div>

            {/* Botão "Atualizar km" */}
            <button
              type="button"
              onClick={onOpenKmModal}
              className="cockpit-btn-secondary w-full h-[clamp(50px,10.5dvh,64px)] shrink-0 rounded-2xl active:scale-98 font-black text-[clamp(16px,2.8dvh,20px)] flex items-center justify-center gap-2.5 transition-all"
            >
              <Gauge size={24} strokeWidth={2.8} />
              Atualizar km
            </button>
          </div>

          {/* Dois anéis menores lado a lado: ÓLEO e ALINHAMENTO (~22vh) */}
          <div className="cockpit-card cockpit-right-bottom rounded-3xl p-[clamp(8px,1.4dvh,14px)] grid grid-cols-2 gap-[clamp(8px,1.2vw,12px)] min-h-0">
            {/* Anel Óleo */}
            <div className="cockpit-subcard flex flex-col items-center justify-between text-center p-[clamp(6px,1dvh,10px)] rounded-2xl min-h-0">
              <span className="text-[14px] sm:text-[15px] font-black uppercase tracking-wide cockpit-text-secondary leading-none truncate w-full shrink-0">
                Óleo do Motor
              </span>
              <div className="relative h-[clamp(68px,21dvh,132px)] max-h-[calc(100%-40px)] aspect-square flex items-center justify-center my-auto">
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
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className={`font-mono-numbers text-[clamp(18px,4dvh,30px)] leading-none font-black ${oilColors.textClass}`}>
                    {oilLifeVal}%
                  </span>
                </div>
              </div>
              <span className="text-[16px] font-black cockpit-text-primary leading-tight truncate w-full shrink-0">
                {oilPart ? oilPart.shortDueText : 'Em dia'}
              </span>
            </div>

            {/* Anel Alinhamento */}
            <div className="cockpit-subcard flex flex-col items-center justify-between text-center p-[clamp(6px,1dvh,10px)] rounded-2xl min-h-0">
              <span className="text-[14px] sm:text-[15px] font-black uppercase tracking-wide cockpit-text-secondary leading-none truncate w-full shrink-0">
                Alinhamento
              </span>
              <div className="relative h-[clamp(68px,21dvh,132px)] max-h-[calc(100%-40px)] aspect-square flex items-center justify-center my-auto">
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
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className={`font-mono-numbers text-[clamp(18px,4dvh,30px)] leading-none font-black ${alignmentColors.textClass}`}>
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
