import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { APP_BASENAME } from './utils/appBase';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { initializeTheme } from './stores/themeStore';
import ErrorBoundary from './components/ErrorBoundary';
import { initNativeShell } from './lib/native';
// Build v5 - FORCE REBUILD - 2026-04-07T18:45:00Z - No Stripe
import './index.css';

// Retire legacy PWA service workers (client portal must not run as installed app)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
}

// Capacitor iOS shell (status bar, splash, safe-area class)
void initNativeShell();

// Initialize theme before rendering
try {
  initializeTheme();
} catch (e: any) {
  console.error('Theme initialization failed:', e);
  // Show error on page if theme init fails
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `<div style="padding: 20px; color: red;">Theme init error: ${e.message}</div>`;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={APP_BASENAME || undefined}>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            className: 'glass-toast',
            style: {
              // Theming now handled primarily by .glass-toast + .dark .glass-toast in index.css for light/dark
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
              borderRadius: '16px',
              padding: '16px 20px',
            },
            success: {
              duration: 3000,
              iconTheme: {
                primary: '#22c55e',
                secondary: '#fff',
              },
              style: {
                borderLeft: '4px solid #22c55e',
              },
            },
            error: {
              duration: 5000,
              iconTheme: {
                primary: '#ef4444',
                secondary: '#fff',
              },
              style: {
                borderLeft: '4px solid #ef4444',
              },
            },
            loading: {
              iconTheme: {
                primary: '#2563eb',
                secondary: '#fff',
              },
              style: {
                borderLeft: '4px solid #2563eb',
              },
            },
          }}
        />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
// Deploy Tue Apr  7 15:19:47 BST 2026
// Cache bust: Thu Apr  9 23:21:01 BST 2026
// Sat Apr 11 10:36:05 BST 2026
