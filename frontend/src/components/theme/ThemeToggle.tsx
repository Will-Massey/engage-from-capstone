import { useThemeStore } from '../../stores/themeStore';
import { SunIcon, MoonIcon, ComputerDesktopIcon } from '@heroicons/react/24/outline';
import { useState, useRef, useEffect } from 'react';

const ThemeToggle = () => {
  const { theme, resolvedTheme, setTheme } = useThemeStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const options = [
    { value: 'light' as const, label: 'Light', icon: SunIcon },
    { value: 'dark' as const, label: 'Dark', icon: MoonIcon },
    { value: 'system' as const, label: 'System', icon: ComputerDesktopIcon },
  ];

  const currentOption = options.find(o => o.value === theme) || options[2];
  const Icon = currentOption.icon;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 
                   dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800
                   transition-colors duration-200"
        title={`Theme: ${currentOption.label} (${resolvedTheme})`}
      >
        <Icon className="h-5 w-5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg 
                        border border-gray-200 dark:border-gray-700 py-1 z-50 animate-fade-in">
          {options.map((option) => {
            const OptionIcon = option.icon;
            const isActive = theme === option.value;
            
            return (
              <button
                key={option.value}
                onClick={() => {
                  setTheme(option.value);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center px-4 py-2 text-sm transition-colors
                  ${isActive 
                    ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' 
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
              >
                <OptionIcon className="h-4 w-4 mr-3" />
                <span className="flex-1 text-left">{option.label}</span>
                {isActive && (
                  <span className="text-primary-500">✓</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ThemeToggle;
