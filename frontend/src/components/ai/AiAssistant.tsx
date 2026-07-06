import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SparklesIcon,
  XMarkIcon,
  PaperAirplaneIcon,
  ArrowPathIcon,
  BoltIcon,
  HeartIcon,
  EnvelopeIcon,
  PlusCircleIcon,
} from '@heroicons/react/24/outline';
import { useAiAssistantStore } from '../../stores/aiAssistantStore';
import { apiClient } from '../../utils/api';
import { matchLocalIntent } from '../../utils/aiQuickIntents';
import { showAiError } from './AiPanel';
import { AI_COPILOT } from '../../config/aiCopilot';

type Chip = {
  id: string;
  label: string;
  icon: React.ElementType;
  mode?: 'health' | 'follow_up' | 'suggest_services';
  path?: string;
  localMessage?: string;
};

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-2 h-2 rounded-full bg-violet-500"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

/** Strip simple markdown bold for display */
function formatContent(text: string) {
  return text.replace(/\*\*(.*?)\*\*/g, '$1');
}

export default function AiAssistant() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    isOpen,
    configured,
    messages,
    open,
    close,
    toggle,
    addMessage,
    setConfigured,
    clearMessages,
  } = useAiAssistantStore();

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const proposalId = params.id && location.pathname.includes('/proposals/') ? params.id : undefined;
  const clientId = params.id && location.pathname.includes('/clients/') ? params.id : undefined;
  const clientIdFromQuery = new URLSearchParams(location.search).get('clientId') || undefined;

  const context = useMemo(
    () => ({
      proposalId,
      clientId: clientId || clientIdFromQuery,
      page: location.pathname,
    }),
    [proposalId, clientId, clientIdFromQuery, location.pathname]
  );

  useEffect(() => {
    apiClient
      .getAiStatus()
      .then((res: any) => {
        if (res.success) {
          setConfigured(res.data?.configured ?? false);
        }
      })
      .catch(() => setConfigured(false));
  }, [setConfigured]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  const chips: Chip[] = useMemo(() => {
    const base: Chip[] = [
      { id: 'new', label: 'New proposal', icon: PlusCircleIcon, path: '/proposals/new' },
      { id: 'proposals', label: 'My proposals', icon: BoltIcon, path: '/proposals' },
    ];
    if (proposalId) {
      base.push(
        { id: 'health', label: 'Health check', icon: HeartIcon, mode: 'health' },
        { id: 'follow', label: 'Follow-up draft', icon: EnvelopeIcon, mode: 'follow_up' }
      );
    }
    if (context.clientId) {
      base.push({
        id: 'suggest',
        label: 'Suggest services',
        icon: SparklesIcon,
        mode: 'suggest_services',
      });
    }
    return base;
  }, [proposalId, context.clientId]);

  const runNavigate = (path: string, message: string) => {
    addMessage({ role: 'assistant', content: message, actionPath: path });
    navigate(path);
  };

  const runQuickAction = async (chip: Chip) => {
    if (chip.path) {
      runNavigate(chip.path, chip.localMessage || `Opening ${chip.label.toLowerCase()}…`);
      return;
    }
    if (!chip.mode) return;
    if (!configured) {
      addMessage({
        role: 'assistant',
        content: AI_COPILOT.unavailableMessage,
      });
      return;
    }
    setLoading(true);
    addMessage({ role: 'user', content: chip.label });
    try {
      const res = (await apiClient.aiQuick({ mode: chip.mode, context })) as any;
      if (res.success) {
        addMessage({ role: 'assistant', content: res.data.message || 'Done.' });
        if (res.data.action === 'suggest_services' && res.data.params?.clientId) {
          navigate(`/proposals/new?clientId=${res.data.params.clientId}`);
        }
      }
    } catch (e) {
      showAiError(e);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    addMessage({ role: 'user', content: text });

    const local = matchLocalIntent(text);
    if (local.handled) {
      if (local.path) {
        runNavigate(local.path, local.message);
      } else {
        addMessage({ role: 'assistant', content: local.message });
      }
      return;
    }

    if (!configured) {
      addMessage({
        role: 'assistant',
        content: `${AI_COPILOT.name} isn't available right now — try the quick actions above, or ask your administrator to enable the Engage assistant.`,
      });
      return;
    }

    setLoading(true);
    try {
      const res = (await apiClient.aiQuick({ mode: 'ask', query: text, context })) as any;
      if (res.success) {
        addMessage({ role: 'assistant', content: res.data.message || 'Here to help.' });
      }
    } catch (e) {
      showAiError(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating launcher */}
      <div className="fixed bottom-6 right-[max(1.5rem,env(safe-area-inset-right))] z-[60] flex flex-col items-end gap-2 print:hidden">
        <AnimatePresence>
          {!isOpen && (
            <motion.span
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="hidden sm:block text-xs font-medium text-violet-700 dark:text-violet-300 bg-white/90 dark:bg-slate-900/90 backdrop-blur px-3 py-1.5 rounded-full border border-violet-200 dark:border-violet-800 shadow-lg"
            >
              {AI_COPILOT.name}
            </motion.span>
          )}
        </AnimatePresence>

        <motion.button
          type="button"
          onClick={toggle}
          aria-label={AI_COPILOT.panelAriaLabel}
          className="relative group"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.97 }}
        >
          <span className="absolute inset-0 rounded-full bg-violet-500/40 blur-xl animate-pulse" />
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 via-indigo-600 to-purple-700 text-white shadow-xl shadow-violet-500/30 border border-white/20">
            <SparklesIcon className="h-7 w-7" />
          </span>
          <span
            className={`absolute top-1 right-1 h-3 w-3 rounded-full border-2 border-white dark:border-slate-900 ${
              configured ? 'bg-emerald-400' : 'bg-amber-400'
            }`}
            title={configured ? AI_COPILOT.onlineSubtitle : AI_COPILOT.offlineSubtitle}
          />
        </motion.button>
      </div>

      {/* Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[58] bg-slate-900/20 backdrop-blur-[2px] sm:bg-transparent sm:backdrop-blur-none"
              onClick={close}
            />
            <motion.div
              ref={panelRef}
              data-testid="ai-assistant-panel"
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="fixed z-[59] bottom-0 right-0 sm:bottom-6 sm:right-[max(1.5rem,env(safe-area-inset-right))] w-full sm:w-[min(520px,calc(100vw-3rem-env(safe-area-inset-right)))] max-w-[min(100vw,calc(520px+env(safe-area-inset-right)))] sm:max-h-[min(720px,calc(100dvh-3rem))] h-[min(85dvh,720px)] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden border border-violet-300/50 dark:border-violet-700/60 shadow-2xl shadow-violet-900/20 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 pb-[env(safe-area-inset-bottom)]"
            >
              {/* Header */}
              <div className="relative px-4 py-3 border-b border-white/10 bg-gradient-to-r from-violet-950/80 to-indigo-950/80">
                <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_30%_20%,rgba(139,92,246,0.4),transparent_50%)]" />
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-violet-500/20 border border-violet-400/30">
                      <SparklesIcon className="h-5 w-5 text-violet-300" />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold tracking-tight">{AI_COPILOT.name}</h2>
                      <p className="text-[10px] text-violet-300/80">
                        {configured ? AI_COPILOT.onlineSubtitle : AI_COPILOT.offlineSubtitle} ·{' '}
                        {AI_COPILOT.tagline}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={clearMessages}
                      className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                      title="Clear chat"
                    >
                      <ArrowPathIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={close}
                      className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Quick chips */}
              <div className="px-3 py-2 border-b border-white/5 flex gap-1.5 overflow-x-auto scrollbar-hide shrink-0">
                {chips.map((chip) => {
                  const Icon = chip.icon;
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      disabled={loading}
                      onClick={() => runQuickAction(chip)}
                      className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-medium bg-violet-500/15 hover:bg-violet-500/25 border border-violet-400/25 text-violet-100 transition-colors disabled:opacity-50"
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {chip.label}
                    </button>
                  );
                })}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scrollbar-hide">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? 'bg-violet-600 text-white rounded-br-md'
                          : 'bg-white/10 text-slate-100 border border-white/10 rounded-bl-md'
                      }`}
                    >
                      {formatContent(msg.content)}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl rounded-bl-md bg-white/10 border border-white/10">
                      <TypingIndicator />
                    </div>
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="p-3 border-t border-white/10 bg-slate-950/80 shrink-0">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendMessage();
                  }}
                  className="flex gap-2"
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={AI_COPILOT.askPlaceholder}
                    className="flex-1 rounded-xl bg-white/10 border border-white/15 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                    maxLength={400}
                    disabled={loading}
                  />
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="shrink-0 p-2.5 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white disabled:opacity-40 hover:from-violet-500 hover:to-indigo-500 transition-all"
                  >
                    <PaperAirplaneIcon className="h-5 w-5" />
                  </button>
                </form>
                <p className="mt-2 text-[10px] text-center text-slate-500">
                  Built into Engage · shortcuts are instant · answers stay brief
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

/** Sidebar / header trigger */
export function AiAssistantTrigger({ className = '' }: { className?: string }) {
  const { open, configured } = useAiAssistantStore();
  return (
    <button
      type="button"
      onClick={open}
      className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all bg-gradient-to-r from-violet-600/15 to-indigo-600/15 hover:from-violet-600/25 hover:to-indigo-600/25 border border-violet-400/30 text-violet-700 dark:text-violet-200 ${className}`}
    >
      <SparklesIcon className="h-4 w-4" />
      <span>{AI_COPILOT.name}</span>
      <span className={`h-2 w-2 rounded-full ${configured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
    </button>
  );
}
