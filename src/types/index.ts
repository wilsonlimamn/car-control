export type CategoryType = 'motor' | 'freios' | 'eletrica' | 'pneus';

export type StatusType = 'ok' | 'warning' | 'expired';

export type TabType = 'home' | 'parts' | 'vehicle' | 'settings';

export interface Vehicle {
  id: number;
  name: string;
  plate: string;
  current_km: number;
  tank_capacity: number;
  fuel_level: number;
  avg_consumption: number;
  is_active: number;
}

export interface Part {
  id: number;
  vehicle_id: number;
  name: string;
  category: CategoryType;
  interval_km: number;
  interval_months: number;
  last_change_km: number;
  last_change_date: string; // YYYY-MM-DD
}

export interface PartWithStats extends Part {
  wearPercent: number; // 0 - 100+
  lifeRemainingPercent: number; // 100 - wearPercent (clamped at 0)
  status: StatusType; // ok (<80%), warning (80-99%), expired (>=100%)
  remainingKm: number;
  remainingDays: number;
  primaryMetric: 'km' | 'time';
  shortDueText: string; // "Vencida", "Faltam X km", "Faltam X dias"
}

export interface MaintenanceRecord {
  id: number;
  vehicle_id: number;
  part_name: string;
  change_km: number;
  change_date: string; // YYYY-MM-DD
}

export type ThemeType = 'amber' | 'emerald' | 'crimson' | 'cobalt' | 'violet' | 'navy';
export type BgStyleType = 'white' | 'gray' | 'gradient' | 'oled';

export interface AppSettings {
  theme: ThemeType;
  bgStyle: BgStyleType;
  githubRepo?: string;
}
