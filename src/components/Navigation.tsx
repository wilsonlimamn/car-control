import React from 'react';
import { Gauge, Wrench, Car, Sliders, LucideIcon } from 'lucide-react';
import { TabType } from '../types';

interface NavigationProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  alertCount: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentTab,
  onSelectTab,
  alertCount,
}) => {
  const navItems: { id: TabType; label: string; icon: LucideIcon }[] = [
    { id: 'home', label: 'Início', icon: Gauge },
    { id: 'parts', label: 'Peças', icon: Wrench },
    { id: 'vehicle', label: 'Veículo', icon: Car },
    { id: 'settings', label: 'Ajustes', icon: Sliders },
  ];

  return (
    <>
      {/* MULTIMÍDIA HORIZONTAL: 4 botões ~116px de largura distribuídos em toda a altura */}
      <aside
        aria-label="Menu principal multimídia"
        className="cockpit-sidebar cockpit-nav-bg fixed top-0 left-0 bottom-0 border-r z-30 select-none flex-col items-stretch shadow-2xl"
      >
        <nav className="flex flex-col gap-2 w-full h-full items-center">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                className={`relative w-[116px] flex-1 min-h-[56px] px-2 py-2 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 focus-visible:outline-3 focus-visible:outline-[var(--accent)] ${
                  isActive
                    ? 'bg-[var(--accent)] text-[var(--accent-fg)] font-black shadow-[0_0_24px_rgba(var(--accent-rgb),0.45)] border-2 border-[var(--accent-border)]'
                    : 'cockpit-nav-idle'
                }`}
              >
                <div className="relative flex items-center justify-center">
                  <Icon size={30} strokeWidth={isActive ? 2.8 : 2.2} />
                  {item.id === 'parts' && alertCount > 0 && !isActive && (
                    <span
                      aria-label={`${alertCount} alertas`}
                      className="absolute -top-2 -right-3.5 min-w-[22px] h-[22px] px-1 rounded-full bg-red-600 text-white text-[14px] leading-none font-mono-numbers font-black flex items-center justify-center border-2 border-white/80"
                    >
                      {alertCount}
                    </span>
                  )}
                </div>
                <span
                  className={`text-[15px] sm:text-[16px] tracking-tight leading-none ${
                    isActive ? 'font-black text-[var(--accent-fg)]' : 'font-bold'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* CELULAR EM PÉ (PORTRAIT): Barra Inferior horizontal */}
      <nav
        aria-label="Menu inferior multimídia"
        className="cockpit-bottom-nav cockpit-nav-bg fixed bottom-0 left-0 right-0 z-40 border-t shadow-[0_-8px_30px_rgba(0,0,0,0.45)]"
      >
        <div className="grid grid-cols-4 gap-2 max-w-xl mx-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                className={`min-h-[64px] py-2 px-1 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all active:scale-95 focus-visible:outline-3 focus-visible:outline-[var(--accent)] ${
                  isActive
                    ? 'bg-[var(--accent)] text-[var(--accent-fg)] font-black shadow-[0_0_20px_rgba(var(--accent-rgb),0.4)]'
                    : 'cockpit-nav-idle'
                }`}
              >
                <div className="relative">
                  <Icon size={26} strokeWidth={isActive ? 2.8 : 2.2} />
                  {item.id === 'parts' && alertCount > 0 && !isActive && (
                    <span className="absolute -top-2 -right-3 min-w-[20px] h-[20px] px-1 rounded-full bg-red-600 text-white text-[14px] leading-none font-mono-numbers font-black flex items-center justify-center border border-white/80">
                      {alertCount}
                    </span>
                  )}
                </div>
                <span
                  className={`text-[14px] font-bold leading-none ${
                    isActive ? 'font-black text-[var(--accent-fg)]' : ''
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
