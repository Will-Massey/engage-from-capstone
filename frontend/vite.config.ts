import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// PWA disabled — client portal and public proposal links must not prompt "Install app".
// Staff use Engage in the browser; a standalone PWA confuses clients receiving proposal links.

const isCapacitorBuild = process.env.CAPACITOR === 'true' || process.env.VITE_CAPACITOR === 'true';

// https://vitejs.dev/config/
export default defineConfig({
  // Relative asset paths required for Capacitor WebView (capacitor:// / https://localhost)
  base: isCapacitorBuild ? './' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // Core React stack — keep stable across route chunks (order matters: react-router contains "react")
          if (
            id.includes('node_modules/react-router') ||
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react/') ||
            id.includes('node_modules/scheduler/')
          ) {
            return 'vendor-react';
          }
          // Heavy optional UI / charts (split from app bundle)
          if (id.includes('recharts')) return 'vendor-recharts';
          if (id.includes('framer-motion')) return 'vendor-motion';
          if (id.includes('react-joyride')) return 'vendor-joyride';
          if (id.includes('@headlessui')) return 'vendor-headlessui';
          if (id.includes('@heroicons')) return 'vendor-heroicons';
          if (id.includes('@stripe')) return 'vendor-stripe';
          if (id.includes('date-fns')) return 'vendor-date-fns';
          if (id.includes('axios') || id.includes('/zod/') || id.includes('zustand')) {
            return 'vendor-data';
          }
        },
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.');
          const ext = info[info.length - 1];
          return `assets/[name]-[hash][extname]`;
        },
      },
    },
  },
});
