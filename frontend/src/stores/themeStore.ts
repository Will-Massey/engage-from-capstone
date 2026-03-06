import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

// Helper to resolve system preference
const getSystemTheme = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

// Apply theme to document
const applyTheme = (theme: 'light' | 'dark') => {
  if (typeof document === 'undefined') return;
  
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
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
      },
      
      toggleTheme: () => {
        const current = get().resolvedTheme;
        const newTheme = current === 'light' ? 'dark' : 'light';
        set({ theme: newTheme, resolvedTheme: newTheme });
        applyTheme(newTheme);
      },
    }),
    {
      name: 'theme-storage',
      onRehydrateStorage: () => (state) => {
        // Apply theme when store is rehydrated
        if (state) {
          const resolved = state.theme === 'system' ? getSystemTheme() : state.theme;
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
  const resolved = store.theme === 'system' ? getSystemTheme() : store.theme;
  store.resolvedTheme = resolved;
  applyTheme(resolved);
  
  // Listen for system theme changes
  if (typeof window !== 'undefined') {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', (e) => {
      if (store.theme === 'system') {
        const newTheme = e.matches ? 'dark' : 'light';
        store.resolvedTheme = newTheme;
        applyTheme(newTheme);
      }
    });
  }
};

export default useThemeStore;
