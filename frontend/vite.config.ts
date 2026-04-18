import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      workbox: {
        // Don't cache API routes - let them go to the network
        navigateFallbackDenylist: [/^\/api/, /^\/uploads/],
        // Exclude API routes from precaching
        globIgnores: ['**/api/**', '**/uploads/**'],
      },
      manifest: {
        name: 'Engage by Capstone',
        short_name: 'Proposals',
        description: 'Revolutionary UK Accounting Proposal Platform',
        theme_color: '#0284c7',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/images/capstone-icon.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
          },
          {
            src: '/images/capstone-icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
          },
        ],
      },
    }),
  ],
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
