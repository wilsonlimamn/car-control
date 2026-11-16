import { Part, PartWithStats, StatusType } from '../types';

/**
 * Safely parse ISO date string (YYYY-MM-DD) avoiding timezone shifts
 */
export function parseIsoDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return new Date(y, m, d);
    }
  }
  return new Date(dateStr);
}

/**
 * Calculates months between two date strings (or from date to now)
 */
export function getMonthsPassed(fromDateStr: string, toDate: Date = new Date()): number {
  const fromDate = parseIsoDate(fromDateStr);
  if (isNaN(fromDate.getTime())) return 0;

  const diffMs = toDate.getTime() - fromDate.getTime();
  const daysPassed = Math.max(0, diffMs / (1000 * 60 * 60 * 24));
  return daysPassed / 30.4375; // average month length
}

/**
 * Computes remaining days from last change date + interval in months.
 * Returns negative if overdue.
 */
export function getRemainingDays(fromDateStr: string, intervalMonths: number): number {
  if (intervalMonths <= 0) return 99999;
  const fromDate = parseIsoDate(fromDateStr);
  if (isNaN(fromDate.getTime())) return 0;

  const dueDate = new Date(fromDate.getFullYear(), fromDate.getMonth() + intervalMonths, fromDate.getDate());
  const now = new Date();
  // Strip hours for pure day comparison
  const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = dueDate.getTime() - todayZero.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Core calculation rule:
 * Desgaste da peça = o MAIOR entre (km rodados ÷ intervalo em km) e (tempo decorrido ÷ intervalo em tempo).
 * Intervalo 0 é ignorado.
 * Se o tempo passou do intervalo, o desgaste é >= 100%, status = 'expired' e anel fica vermelho.
 * Prazo nunca exibe números negativos.
 * Se vencida: "Vencida há X km" ou "Vencida há X dias/meses".
 * Se faltar menos de 60 dias, exibe em dias; acima de 60 dias, exibe em meses.
 */
export function calculatePartStats(part: Part, currentVehicleKm: number): PartWithStats {
  const kmDriven = Math.max(0, currentVehicleKm - part.last_change_km);
  const monthsPassed = getMonthsPassed(part.last_change_date);

  let wearByKm = 0;
  if (part.interval_km > 0) {
    wearByKm = (kmDriven / part.interval_km) * 100;
  }

  let wearByTime = 0;
  if (part.interval_months > 0) {
    wearByTime = (monthsPassed / part.interval_months) * 100;
  }

  // Desgaste da peça = o MAIOR entre os dois
  const rawWear = Math.max(wearByKm, wearByTime);
  const wearPercent = Math.round(rawWear);

  // Status determination
  let status: StatusType = 'ok';
  if (wearPercent >= 100 || rawWear >= 99.9) {
    status = 'expired';
  } else if (wearPercent >= 80) {
    status = 'warning';
  } else {
    status = 'ok';
  }

  // Life remaining percentage (strictly 0% if expired)
  const lifeRemainingPercent = status === 'expired'
    ? 0
    : Math.max(0, Math.min(100, Math.round(100 - wearPercent)));

  // Remaining positive metrics
  const remainingKm = part.interval_km > 0 ? Math.max(0, part.interval_km - kmDriven) : 999999;
  const rawRemainingDays = part.interval_months > 0 ? getRemainingDays(part.last_change_date, part.interval_months) : 99999;
  const remainingDays = Math.max(0, rawRemainingDays);

  const primaryMetric: 'km' | 'time' = wearByKm >= wearByTime ? 'km' : 'time';

  let shortDueText = '';

  if (status === 'expired') {
    // Vencida: exibir quanto tempo ou quantos km ultrapassou, SEMPRE positivo
    if (primaryMetric === 'km' && part.interval_km > 0) {
      const overdueKm = Math.max(0, kmDriven - part.interval_km);
      shortDueText = overdueKm > 0 ? `Vencida há ${formatNumber(overdueKm)} km` : 'Vencida';
    } else if (part.interval_months > 0) {
      const overdueDays = Math.max(1, -rawRemainingDays);
      if (overdueDays < 60) {
        shortDueText = `Vencida há ${overdueDays} ${overdueDays === 1 ? 'dia' : 'dias'}`;
      } else {
        const overdueMonths = Math.max(2, Math.round(overdueDays / 30.4375));
        shortDueText = `Vencida há ${overdueMonths} meses`;
      }
    } else {
      shortDueText = 'Vencida';
    }
  } else {
    // Em dia ou Trocar breve:
    if (primaryMetric === 'km' && part.interval_km > 0) {
      shortDueText = `Faltam ${formatNumber(remainingKm)} km`;
    } else if (part.interval_months > 0) {
      // Exibir prazos curtos em dias quando faltarem menos de 60 dias, e em meses acima disso
      if (remainingDays < 60) {
        shortDueText = `Faltam ${remainingDays} ${remainingDays === 1 ? 'dia' : 'dias'}`;
      } else {
        const months = Math.ceil(remainingDays / 30.4375);
        shortDueText = `Faltam ~${months} meses`;
      }
    } else {
      shortDueText = 'Em dia';
    }
  }

  return {
    ...part,
    wearPercent,
    lifeRemainingPercent,
    status,
    remainingKm,
    remainingDays,
    primaryMetric,
    shortDueText,
  };
}

/**
 * Format numbers with dots (e.g. 78.450)
 */
export function formatNumber(val: number): string {
  if (isNaN(val)) return '0';
  return Math.round(val).toLocaleString('pt-BR');
}

/**
 * Format decimal numbers (e.g. 11,8 or 38,5)
 */
export function formatDecimal(val: number, decimals: number = 1): string {
  if (isNaN(val)) return '0';
  return val.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Format ISO date string YYYY-MM-DD to DD/MM/YYYY
 */
export function formatDate(isoStr: string): string {
  if (!isoStr) return '--/--/----';
  const parts = isoStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoStr;
}

/**
 * Get current date as YYYY-MM-DD in local time
 */
export function getTodayIso(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
