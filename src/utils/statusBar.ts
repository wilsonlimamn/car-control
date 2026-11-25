import { BgStyleType, ThemeType } from '../types';
import { isNativeCapacitorPlatform } from '../db/sqlite';

interface StatusBarSpec {
  color: string;
  isLightBackground: boolean;
}

export function getStatusBarSpec(bgStyle: BgStyleType, _theme?: ThemeType): StatusBarSpec {
  switch (bgStyle) {
    case 'white':
      return { color: '#e8edf4', isLightBackground: true };
    case 'gray':
      return { color: '#1f252e', isLightBackground: false };
    case 'oled':
      return { color: '#000000', isLightBackground: false };
    case 'gradient':
    default:
      return { color: '#080c15', isLightBackground: false };
  }
}

export async function syncStatusBarTheme(theme: ThemeType, bgStyle: BgStyleType): Promise<void> {
  const spec = getStatusBarSpec(bgStyle, theme);

  if (typeof document !== 'undefined') {
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', spec.color);
    }
  }

  if (!isNativeCapacitorPlatform()) {
    return;
  }

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
    await StatusBar.setBackgroundColor({ color: spec.color }).catch(() => {});
    await StatusBar.setStyle({
      style: spec.isLightBackground ? Style.Light : Style.Dark,
    }).catch(() => {});
  } catch {
    // Some custom Android head unit ROMs do not implement all StatusBar methods
  }
}
