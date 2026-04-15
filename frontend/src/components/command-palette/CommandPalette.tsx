import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MagnifyingGlassIcon,
  DocumentTextIcon,
  UsersIcon,
  PlusIcon,
  HomeIcon,
  CogIcon,
  ArrowRightIcon,
  WrenchScrewdriverIcon,
  CreditCardIcon,
  ClockIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '../../stores/authStore';

interface Command {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  shortcut?: string;
  action: () => void;
  category: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

const CommandPalette = ({ isOpen, onClose }: CommandPaletteProps) => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Define all available commands
  const getCommands = useCallback((): Command[] => {
    const commands: Command[] = [
      // Navigation
      {
        id: 'nav-dashboard',
        title: 'Go to Dashboard',
        icon: HomeIcon,
        shortcut: 'G D',
        category: 'Navigation',
        action: () => navigate('/'),
      },
      {
        id: 'nav-proposals',
        title: 'Go to Proposals',
        icon: DocumentTextIcon,
        shortcut: 'G P',
        category: 'Navigation',
        action: () => navigate('/proposals'),
      },
      {
        id: 'nav-clients',
        title: 'Go to Clients',
        icon: UsersIcon,
        shortcut: 'G C',
        category: 'Navigation',
        action: () => navigate('/clients'),
      },
      {
        id: 'nav-services',
        title: 'Go to Services',
        icon: WrenchScrewdriverIcon,
        shortcut: 'G S',
        category: 'Navigation',
        action: () => navigate('/services'),
      },
      {
        id: 'nav-settings',
        title: 'Go to Settings',
        icon: CogIcon,
        shortcut: 'G ,',
        category: 'Navigation',
        action: () => navigate('/settings'),
      },
      {
        id: 'nav-billing',
        title: 'Go to Billing',
        icon: CreditCardIcon,
        category: 'Navigation',
        action: () => navigate('/subscription'),
      },
      // Actions
      {
        id: 'action-new-proposal',
        title: 'Create New Proposal',
        subtitle: 'Start drafting a new proposal',
        icon: PlusIcon,
        shortcut: 'C P',
        category: 'Actions',
        action: () => navigate('/proposals/new'),
      },
      {
        id: 'action-new-client',
        title: 'Add New Client',
        subtitle: 'Add a client to your database',
        icon: PlusIcon,
        shortcut: 'C C',
        category: 'Actions',
        action: () => navigate('/clients/new'),
      },
      {
        id: 'action-recent',
        title: 'View Recent Activity',
        subtitle: 'See your latest actions',
        icon: ClockIcon,
        category: 'Actions',
        action: () => navigate('/'),
      },
    ];

    // Add AI suggestions if applicable
    if (user?.role === 'PARTNER' || user?.role === 'MANAGER') {
      commands.push({
        id: 'ai-analytics',
        title: 'View AI Insights',
        subtitle: 'AI-powered proposal recommendations',
        icon: SparklesIcon,
        category: 'AI Features',
        action: () => navigate('/'),
      });
    }

    return commands;
  }, [navigate, user]);

  const commands = getCommands();

  // Filter commands based on search
  const filteredCommands = commands.filter((cmd) => {
    const searchLower = search.toLowerCase();
    return (
      cmd.title.toLowerCase().includes(searchLower) ||
      cmd.subtitle?.toLowerCase().includes(searchLower) ||
      cmd.category.toLowerCase().includes(searchLower)
    );
  });

  // Group by category
  const groupedCommands = filteredCommands.reduce(
    (acc, cmd) => {
      if (!acc[cmd.category]) {
        acc[cmd.category] = [];
      }
      acc[cmd.category].push(cmd);
      return acc;
    },
    {} as Record<string, Command[]>
  );

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev < filteredCommands.length - 1 ? prev + 1 : prev));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            filteredCommands[selectedIndex].action();
            onClose();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex, onClose]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Reset state when closed
  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Scroll selected into view
  useEffect(() => {
    const selectedElement = containerRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    selectedElement?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] animate-fade-in">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl mx-4 modal-content overflow-hidden animate-scale-in">
        {/* Search header */}
        <div className="flex items-center px-4 py-4 border-b border-slate-200/80 dark:border-slate-700/80">
          <MagnifyingGlassIcon className="w-5 h-5 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search commands, navigate, or create..."
            className="flex-1 ml-3 bg-transparent border-none outline-none text-slate-900 dark:text-slate-100 placeholder-slate-400 text-base"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
          />
          <kbd className="hidden sm:inline-block px-2 py-1 text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 rounded">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={containerRef} className="max-h-[60vh] overflow-y-auto py-2 scrollbar-hide">
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-slate-500 dark:text-slate-400">No commands found</p>
              <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
                Try searching for "proposal", "client", or "settings"
              </p>
            </div>
          ) : (
            Object.entries(groupedCommands).map(([category, cmds]) => (
              <div key={category}>
                <div className="px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {category}
                </div>
                {cmds.map((cmd, idx) => {
                  const globalIndex = filteredCommands.indexOf(cmd);
                  const isSelected = globalIndex === selectedIndex;
                  const Icon = cmd.icon;

                  return (
                    <button
                      key={cmd.id}
                      data-index={globalIndex}
                      onClick={() => {
                        cmd.action();
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(globalIndex)}
                      className={`w-full flex items-center px-4 py-3 text-left transition-colors ${
                        isSelected
                          ? 'bg-primary-50 dark:bg-primary-900/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div
                        className={`p-2 rounded-lg ${
                          isSelected
                            ? 'bg-primary-100 dark:bg-primary-800 text-primary-600 dark:text-primary-300'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="ml-3 flex-1">
                        <p
                          className={`text-sm font-medium ${
                            isSelected
                              ? 'text-primary-700 dark:text-primary-300'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {cmd.title}
                        </p>
                        {cmd.subtitle && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {cmd.subtitle}
                          </p>
                        )}
                      </div>
                      {cmd.shortcut && (
                        <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 rounded">
                          {cmd.shortcut.split(' ').map((key, i) => (
                            <span key={i}>
                              {i > 0 && <span className="mx-0.5">+</span>}
                              {key}
                            </span>
                          ))}
                        </kbd>
                      )}
                      {isSelected && <ArrowRightIcon className="w-4 h-4 ml-2 text-primary-500" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200/80 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-700 rounded border border-slate-200 dark:border-slate-600">
                ↑
              </kbd>
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-700 rounded border border-slate-200 dark:border-slate-600">
                ↓
              </kbd>
              <span className="ml-1">to navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-700 rounded border border-slate-200 dark:border-slate-600">
                ↵
              </kbd>
              <span className="ml-1">to select</span>
            </span>
          </div>
          <span>{filteredCommands.length} commands</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
