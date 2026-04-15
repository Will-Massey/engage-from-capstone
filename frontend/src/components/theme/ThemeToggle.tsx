import { SunIcon, MoonIcon, ComputerDesktopIcon } from '@heroicons/react/24/outline';
import { useState, useEffect, useRef } from 'react';
import { useThemeStore } from '../../stores/themeStore';

type Theme = 'light' | 'dark' | 'system';

const ThemeToggle = () => {
  const { theme, isDark, setTheme } = useThemeStore();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const themes: { value: Theme; label: string; icon: React.ElementType }[] = [
    { value: 'light', label: 'Light', icon: SunIcon },
    { value: 'dark', label: 'Dark', icon: MoonIcon },
    { value: 'system', label: 'System', icon: ComputerDesktopIcon },
  ];

  const CurrentIcon = themes.find((t) => t.value === theme)?.icon || SunIcon;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="theme-toggle"
        aria-label="Toggle theme"
      >
        <CurrentIcon className="h-5 w-5" />
      </button>

      {showMenu && (
        <div
          className="absolute right-0 mt-2 w-40 rounded-xl overflow-hidden animate-scale-in z-50"
          style={{
            background:
              'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.9) 100%)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.5)',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
          }}
        >
          <div className="dark:hidden">
            {themes.map((t) => {
              const Icon = t.icon;
              const isActive = theme === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => {
                    setTheme(t.value);
                    setShowMenu(false);
                  }}
                  className={`w-full flex items-center px-4 py-3 text-sm transition-colors ${
                    isActive ? 'bg-primary-50 text-primary-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="h-4 w-4 mr-3" />
                  {t.label}
                  {isActive && <span className="ml-auto w-2 h-2 rounded-full bg-primary-500" />}
                </button>
              );
            })}
          </div>
          <div
            className="hidden dark:block"
            style={{
              background:
                'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.9) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            {themes.map((t) => {
              const Icon = t.icon;
              const isActive = theme === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => {
                    setTheme(t.value);
                    setShowMenu(false);
                  }}
                  className={`w-full flex items-center px-4 py-3 text-sm transition-colors ${
                    isActive
                      ? 'bg-primary-900/30 text-primary-300'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Icon className="h-4 w-4 mr-3" />
                  {t.label}
                  {isActive && <span className="ml-auto w-2 h-2 rounded-full bg-primary-400" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ThemeToggle;
