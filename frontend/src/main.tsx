import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { initializeTheme } from './stores/themeStore';
import ErrorBoundary from './components/ErrorBoundary';
// Build v5 - FORCE REBUILD - 2026-04-07T18:45:00Z - No Stripe
import './index.css';

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
      <BrowserRouter>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.9) 100%)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              color: '#0f172a',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.6)',
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
                primary: '#6366f1',
                secondary: '#fff',
              },
              style: {
                borderLeft: '4px solid #6366f1',
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
