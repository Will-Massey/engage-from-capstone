import { create } from 'zustand';
import { AI_COPILOT } from '../config/aiCopilot';

export interface AiMessage {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  actionLabel?: string;
  actionPath?: string;
}

interface AiAssistantState {
  isOpen: boolean;
  configured: boolean;
  messages: AiMessage[];
  setConfigured: (configured: boolean) => void;
  open: () => void;
  close: () => void;
  toggle: () => void;
  addMessage: (msg: Omit<AiMessage, 'id'>) => void;
  clearMessages: () => void;
}

const welcomeMessage = (): AiMessage => ({
  id: 'welcome',
  role: 'assistant',
  content: AI_COPILOT.welcomeMessage,
});

export const useAiAssistantStore = create<AiAssistantState>((set) => ({
  isOpen: false,
  configured: false,
  messages: [welcomeMessage()],
  setConfigured: (configured) => set({ configured }),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  addMessage: (msg) =>
    set((s) => ({
      messages: [...s.messages, { ...msg, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }],
    })),
  clearMessages: () => set({ messages: [welcomeMessage()] }),
}));
