import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Engage iOS (Capacitor) — bundles the Vite SPA; API calls use VITE_API_URL.
 * Sync after each web build: npm run cap:sync:ios
 */
const config: CapacitorConfig = {
  appId: 'uk.co.capstonesoftware.engage',
  appName: 'Engage',
  webDir: 'dist',
  ios: {
    contentInset: 'automatic',
    scheme: 'Engage',
    backgroundColor: '#0D47A1',
  },
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    // Uncomment for live-reload against local Vite during native dev (Mac + device/simulator):
    // url: 'http://YOUR_LAN_IP:5173',
    // cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#0D47A1',
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#0D47A1',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
