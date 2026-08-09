import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Engage Capacitor shells (iOS + Android) — Vite SPA; API via VITE_API_URL.
 * See docs/MOBILE_CAPACITOR.md
 * Sync: npm run cap:sync:ios | npx cap add android && npm run cap:sync
 */
const config: CapacitorConfig = {
  appId: 'uk.co.capstonesoftware.engage',
  // Product name is "Engage Practice"; the bundle ID stays `….engage` because it
  // is already registered and an app's bundle ID can never be changed.
  appName: 'Engage Practice',
  webDir: 'dist',
  ios: {
    contentInset: 'automatic',
    scheme: 'Engage',
    backgroundColor: '#0f172a',
  },
  android: {
    backgroundColor: '#0f172a',
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    // Practice live-reload (device on LAN):
    // url: 'http://YOUR_LAN_IP:5273',
    // cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#0f172a',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0f172a',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
