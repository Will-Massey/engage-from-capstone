import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

// Unified storage key for all Capstone products
const UNIFIED_KEY = 'capstone-theme';
const THEME_CHANGE_EVENT = 'capstone-theme-change';

// Helper to resolve system preference
const getSystemTheme = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

// Get theme from unified storage
const getUnifiedTheme = (): Theme => {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem(UNIFIED_KEY);
  if (stored && ['light', 'dark', 'system'].includes(stored)) {
    return stored as Theme;
  }
  return 'system';
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

// Apply theme to document
const applyTheme = (theme: 'light' | 'dark') => {
  if (typeof document === 'undefined') return;
  
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
    root.setAttribute('data-theme', 'dark');
  } else {
    root.classList.remove('dark');
    root.setAttribute('data-theme', 'light');
  }
  
  // Update meta theme-color
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', theme === 'dark' ? '#0f172a' : '#ffffff');
  }
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      resolvedTheme: getSystemTheme(),
      
      setTheme: (theme) => {
        const resolved = theme === 'system' ? getSystemTheme() : theme;
        set({ theme, resolvedTheme: resolved });
        applyTheme(resolved);
        setUnifiedTheme(theme);
      },
      
      toggleTheme: () => {
        const current = get().resolvedTheme;
        const newTheme = current === 'light' ? 'dark' : 'light';
        set({ theme: newTheme, resolvedTheme: newTheme });
        applyTheme(newTheme);
        setUnifiedTheme(newTheme);
      },
    }),
    {
      name: 'theme-storage', // Keep for backward compatibility
      onRehydrateStorage: () => (state) => {
        // Apply theme when store is rehydrated, but use unified storage as source of truth
        if (state) {
          const unifiedTheme = getUnifiedTheme();
          const resolved = unifiedTheme === 'system' ? getSystemTheme() : unifiedTheme;
          
          state.theme = unifiedTheme;
          state.resolvedTheme = resolved;
          applyTheme(resolved);
        }
      },
    }
  )
);

// Initialize theme on app load
export const initializeTheme = () => {
  const store = useThemeStore.getState();
  
  // Always use unified storage as source of truth
  const unifiedTheme = getUnifiedTheme();
  const resolved = unifiedTheme === 'system' ? getSystemTheme() : unifiedTheme;
  
  store.setTheme(unifiedTheme);
  
  // Listen for storage changes from other tabs/pages (e.g., AccountFlow)
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === UNIFIED_KEY) {
        const newTheme = (e.newValue as Theme) || 'system';
        const newResolved = newTheme === 'system' ? getSystemTheme() : newTheme;
        
        // Update store without triggering another storage event
        useThemeStore.setState({ theme: newTheme, resolvedTheme: newResolved });
        applyTheme(newResolved);
      }
    });
    
    // Listen for custom events from same window
    window.addEventListener(THEME_CHANGE_EVENT, (e: any) => {
      const newTheme = e.detail?.theme as Theme;
      if (newTheme) {
        const newResolved = newTheme === 'system' ? getSystemTheme() : newTheme;
        useThemeStore.setState({ theme: newTheme, resolvedTheme: newResolved });
        applyTheme(newResolved);
      }
    });
    
    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', (e) => {
      if (store.theme === 'system') {
        const newTheme = e.matches ? 'dark' : 'light';
        useThemeStore.setState({ resolvedTheme: newTheme });
        applyTheme(newTheme);
      }
    });
  }
};

export default useThemeStore;
