import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  isDark: boolean;

  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

let mediaQueryListener: ((e: MediaQueryListEvent) => void) | null = null;

function getSystemIsDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyDocumentTheme(isDark: boolean) {
  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

function setupSystemListener() {
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  if (mediaQueryListener) {
    media.removeEventListener('change', mediaQueryListener);
  }

  mediaQueryListener = (e: MediaQueryListEvent) => {
    const state = useThemeStore.getState();
    if (state.theme === 'system') {
      const isDark = e.matches;
      useThemeStore.setState({ isDark });
      applyDocumentTheme(isDark);
    }
  };

  media.addEventListener('change', mediaQueryListener);
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      isDark: false,

      setTheme: (theme) => {
        const isDark = theme === 'dark' || (theme === 'system' && getSystemIsDark());

        set({ theme, isDark });
        applyDocumentTheme(isDark);

        if (theme === 'system') {
          setupSystemListener();
        } else if (mediaQueryListener) {
          const media = window.matchMedia('(prefers-color-scheme: dark)');
          media.removeEventListener('change', mediaQueryListener);
          mediaQueryListener = null;
        }
      },

      toggleTheme: () => {
        const current = get();
        const newTheme = current.isDark ? 'light' : 'dark';
        get().setTheme(newTheme);
      },
    }),
    {
      name: 'theme-storage',
      onRehydrateStorage: () => (state) => {
        if (state) {
          const isDark = state.theme === 'dark' || (state.theme === 'system' && getSystemIsDark());
          applyDocumentTheme(isDark);
          useThemeStore.setState({ isDark });

          if (state.theme === 'system') {
            setupSystemListener();
          }
        }
      },
    }
  )
);

// Initialize theme on app load
export const initializeTheme = () => {
  const state = useThemeStore.getState();
  const theme = state.theme;
  const isDark = theme === 'dark' || (theme === 'system' && getSystemIsDark());
  applyDocumentTheme(isDark);
  useThemeStore.setState({ isDark });
  if (theme === 'system') {
    setupSystemListener();
  }
};
