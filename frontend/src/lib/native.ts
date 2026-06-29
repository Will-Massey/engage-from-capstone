import { Capacitor } from '@capacitor/core';

/** True when running inside the Capacitor native shell (iOS/Android). */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Initialise native plugins — safe to call on web (no-ops when plugins unavailable).
 */
export async function initNativeShell(): Promise<void> {
  if (!isNativeApp()) return;

  const [{ App }, { StatusBar, Style }, { SplashScreen }, { Keyboard }] = await Promise.all([
    import('@capacitor/app'),
    import('@capacitor/status-bar'),
    import('@capacitor/splash-screen'),
    import('@capacitor/keyboard'),
  ]);

  document.documentElement.classList.add('capacitor-native');

  if (Capacitor.getPlatform() === 'ios') {
    await StatusBar.setStyle({ style: Style.Light }).catch(() => undefined);
  }

  App.addListener('appStateChange', ({ isActive }) => {
    if (import.meta.env.DEV) console.log('[native] app active:', isActive);
  });

  App.addListener('backButton', () => {
    if (window.history.length > 1) {
      window.history.back();
    }
  });

  Keyboard.setAccessoryBarVisible({ isVisible: true }).catch(() => undefined);
  await SplashScreen.hide().catch(() => undefined);
}