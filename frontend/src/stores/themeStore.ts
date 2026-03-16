import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light';

interface ThemeState {
  theme: Theme;
  resolvedTheme: 'light';
  setTheme: (theme: Theme) => void;
}

// Unified storage key for all Capstone products
const UNIFIED_KEY = 'capstone-theme';
const THEME_CHANGE_EVENT = 'capstone-theme-change';

// Always use light theme
const getSystemTheme = (): 'light' => {
  return 'light';
};

// Get theme from unified storage - always light
const getUnifiedTheme = (): Theme => {
  return 'light';
};

// Set theme in unified storage
const setUnifiedTheme = (theme: Theme) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(UNIFIED_KEY, theme);
  // Dispatch storage event for cross-tab communication
  window.dispatchEvent(new StorageEvent('storage', {
    key: UNIFIED_KEY,
    newValue: theme,
    storageArea: localStorage
  }));
  // Also dispatch custom event for same-tab
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme } }));
};

// Apply theme to document - always light
const applyTheme = (theme: 'light') => {
  if (typeof document === 'undefined') return;
  
  const root = document.documentElement;
  root.classList.remove('dark');
  root.setAttribute('data-theme', 'light');
  
  // Update meta theme-color
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', '#ffffff');
  }
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'light' as Theme,
      resolvedTheme: 'light',
      
      setTheme: (theme) => {
        set({ theme: 'light', resolvedTheme: 'light' });
        applyTheme('light');
        setUnifiedTheme('light');
      },
    }),
    {
      name: 'theme-storage',
      onRehydrateStorage: () => (state) => {
        // Always force light theme
        if (state) {
          state.theme = 'light';
          state.resolvedTheme = 'light';
          applyTheme('light');
        }
      },
    }
  )
);

// Initialize theme on app load - always light
export const initializeTheme = () => {
  useThemeStore.setState({ theme: 'light', resolvedTheme: 'light' });
  applyTheme('light');
};

export default useThemeStore;
