import { AppSettings, BgStyleType, CategoryType, MaintenanceRecord, Part, ThemeType, Vehicle } from '../types';

export const DB_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    plate TEXT,
    current_km INTEGER NOT NULL DEFAULT 0,
    tank_capacity REAL NOT NULL DEFAULT 50,
    fuel_level REAL NOT NULL DEFAULT 35,
    avg_consumption REAL NOT NULL DEFAULT 10.5,
    is_active INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    interval_km INTEGER NOT NULL DEFAULT 10000,
    interval_months INTEGER NOT NULL DEFAULT 12,
    last_change_km INTEGER NOT NULL DEFAULT 0,
    last_change_date TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS maintenance_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL,
    part_name TEXT NOT NULL,
    change_km INTEGER NOT NULL,
    change_date TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'navy');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('bgStyle', 'gradient');
`;

export const DEFAULT_PARTS_TEMPLATE: [string, CategoryType, number, number][] = [
  ['Óleo do Motor', 'motor', 10000, 6],
  ['Filtro de Óleo', 'motor', 10000, 6],
  ['Filtro de Ar do Motor', 'motor', 15000, 12],
  ['Filtro de Combustível', 'motor', 15000, 12],
  ['Correia Dentada', 'motor', 30000, 36],
  ['Velas de Ignição', 'motor', 40000, 36],
  ['Pastilhas de Freio Dianteiras', 'freios', 25000, 24],
  ['Fluido de Freio (DOT 4)', 'freios', 20000, 24],
  ['Bateria 12V', 'eletrica', 0, 30],
  ['Palhetas do Limpador', 'eletrica', 0, 12],
  ['Alinhamento', 'pneus', 10000, 6],
  ['Pneus (Rodízio & Balanceamento)', 'pneus', 10000, 6],
  ['Pneus (Troca Completa)', 'pneus', 40000, 24],
];

export function buildSampleDataset(): {
  vehicle: Omit<Vehicle, 'id'>;
  parts: [string, CategoryType, number, number, number, string][];
  history: [string, number, string][];
} {
  const currentKm = 78450;
  const today = new Date();
  const todayIso = today.toISOString().split('T')[0];

  const pastMonthsDate = (months: number): string => {
    const d = new Date(today);
    d.setMonth(d.getMonth() - months);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  return {
    vehicle: {
      name: 'Civic Touring 1.5 Turbo',
      plate: 'BRA-2E19',
      current_km: currentKm,
      tank_capacity: 56,
      fuel_level: 38,
      avg_consumption: 11.8,
      is_active: 1,
    },
    parts: [
      ['Óleo do Motor', 'motor', 10000, 12, 71000, pastMonthsDate(6)],
      ['Filtro de Óleo', 'motor', 10000, 12, 71000, pastMonthsDate(6)],
      ['Filtro de Ar do Motor', 'motor', 15000, 12, 66000, pastMonthsDate(10)],
      ['Filtro de Combustível', 'motor', 15000, 12, 64200, pastMonthsDate(11)],
      ['Velas de Ignição', 'motor', 40000, 36, 55000, pastMonthsDate(18)],
      ['Correia Dentada / Acessórios', 'motor', 60000, 48, 40000, pastMonthsDate(28)],
      ['Líquido de Arrefecimento', 'motor', 40000, 24, 62000, pastMonthsDate(14)],
      ['Pastilhas de Freio Dianteiras', 'freios', 25000, 24, 62500, pastMonthsDate(16)],
      ['Discos de Freio Dianteiros', 'freios', 50000, 36, 40000, pastMonthsDate(26)],
      ['Fluido de Freio (DOT 4)', 'freios', 20000, 24, 60000, pastMonthsDate(22)],
      ['Bateria 12V', 'eletrica', 0, 30, 45000, pastMonthsDate(32)],
      ['Palhetas do Limpador', 'eletrica', 0, 12, 72000, pastMonthsDate(6)],
      ['Alinhamento', 'pneus', 10000, 6, currentKm, todayIso],
      ['Pneus (Rodízio & Balanceamento)', 'pneus', 10000, 6, 69200, pastMonthsDate(5)],
      ['Pneus (Troca Completa)', 'pneus', 50000, 48, 48000, pastMonthsDate(24)],
    ],
    history: [
      ['Óleo do Motor & Filtro', 71000, pastMonthsDate(6)],
      ['Pastilhas de Freio', 62500, pastMonthsDate(16)],
      ['Velas de Ignição', 55000, pastMonthsDate(18)],
    ],
  };
}

export function normalizeSettingsMap(map: Record<string, string>): AppSettings {
  const defaultRepo =
    (import.meta.env.VITE_GITHUB_REPO as string | undefined) || 'wilsonlimamn/car-control';

  const rawTheme = map.theme || 'amber';
  const theme: ThemeType = (rawTheme === 'lime' ? 'navy' : rawTheme) as ThemeType;

  const rawBg = map.bgStyle || 'gradient';
  let bgStyle: BgStyleType = 'gradient';
  if (rawBg === 'atmosphere') bgStyle = 'gradient';
  else if (rawBg === 'carbon' || rawBg === 'midnight') bgStyle = 'gray';
  else if (rawBg === 'white' || rawBg === 'gray' || rawBg === 'gradient' || rawBg === 'oled') {
    bgStyle = rawBg;
  }

  const githubRepo = map.githubRepo || defaultRepo;
  return { theme, bgStyle, githubRepo };
}

export function hasSqliteMagicHeader(bytes: Uint8Array): boolean {
  if (!bytes || bytes.length < 16) return false;
  const header = 'SQLite format 3\0';
  for (let i = 0; i < header.length; i++) {
    if (bytes[i] !== header.charCodeAt(i)) return false;
  }
  return true;
}

export function uint8ToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    parts.push(String.fromCharCode.apply(null, Array.from(slice)));
  }
  return btoa(parts.join(''));
}

export function base64ToUint8(base64: string): Uint8Array {
  const clean = base64.replace(/^data:[^;]+;base64,/, '').trim();
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function buildCsvReport(
  vehicle: Vehicle,
  parts: Part[],
  history: MaintenanceRecord[]
): string {
  const lines: string[] = [];
  const BOM = '\uFEFF';

  lines.push('RELATÓRIO DE MANUTENÇÃO - AUTO EM DIA (CAR CONTROL)');
  lines.push(
    `Veículo;${vehicle.name};Placa;${vehicle.plate};Odômetro Atual;${vehicle.current_km} km;Gerado em;${new Date().toLocaleString('pt-BR')}`
  );
  lines.push('');
  lines.push('STATUS DAS PEÇAS CADASTRADAS');
  lines.push(
    'Peça;Categoria;Intervalo KM;Intervalo Meses;Última Troca KM;Última Troca Data;Km Rodados;Meses Decorridos;Desgaste %;Status'
  );

  const today = new Date();
  for (const p of parts) {
    const kmDriven = Math.max(0, vehicle.current_km - p.last_change_km);
    const monthsPassed = Math.round(
      (today.getFullYear() - new Date(p.last_change_date).getFullYear()) * 12 +
        (today.getMonth() - new Date(p.last_change_date).getMonth())
    );

    const wearByKm = p.interval_km > 0 ? (kmDriven / p.interval_km) * 100 : 0;
    const wearByTime = p.interval_months > 0 ? (monthsPassed / p.interval_months) * 100 : 0;
    const wear = Math.round(Math.max(wearByKm, wearByTime));

    let statusText = 'Em dia';
    if (wear >= 100) statusText = 'Vencida';
    else if (wear >= 80) statusText = 'Trocar em breve';

    lines.push(
      `"${p.name}";"${p.category}";${p.interval_km};${p.interval_months};${p.last_change_km};"${p.last_change_date}";${kmDriven};${monthsPassed};${wear}%;"${statusText}"`
    );
  }

  lines.push('');
  lines.push('HISTÓRICO DE TROCAS REALIZADAS');
  lines.push('ID;Peça;KM no Momento da Troca;Data da Troca');

  for (const h of history) {
    lines.push(`${h.id};"${h.part_name}";${h.change_km} km;"${h.change_date}"`);
  }

  return BOM + lines.join('\r\n');
}
