import { Capacitor } from '@capacitor/core';

/** True when running inside the Capacitor native shell (iOS/Android). */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function nativePlatform(): 'ios' | 'android' | 'web' {
  if (!Capacitor.isNativePlatform()) return 'web';
  const p = Capacitor.getPlatform();
  if (p === 'ios') return 'ios';
  if (p === 'android') return 'android';
  return 'web';
}

/** Staff home for native tab shells */
export function nativeStaffHomePath(): string {
  return '/jobs';
}

/** Client portal path for deep links */
export function nativePortalPath(token: string): string {
  return `/portal/${token}`;
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
  document.documentElement.dataset.nativePlatform = nativePlatform();

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

  // App URL open (custom scheme / universal link) → SPA route
  App.addListener('appUrlOpen', ({ url }) => {
    try {
      const u = new URL(url);
      const path = u.pathname + u.search + u.hash;
      if (path && path !== '/') {
        window.location.hash = '';
        window.history.pushState({}, '', path.startsWith('/') ? path : `/${path}`);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    } catch {
      /* ignore malformed */
    }
  });

  Keyboard.setAccessoryBarVisible({ isVisible: true }).catch(() => undefined);
  await SplashScreen.hide().catch(() => undefined);
}
