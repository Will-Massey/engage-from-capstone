import { create } from 'zustand';

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
  provider: string | null;
  model: string | null;
  messages: AiMessage[];
  setConfigured: (configured: boolean, provider?: string | null, model?: string | null) => void;
  open: () => void;
  close: () => void;
  toggle: () => void;
  addMessage: (msg: Omit<AiMessage, 'id'>) => void;
  clearMessages: () => void;
}

export const useAiAssistantStore = create<AiAssistantState>((set) => ({
  isOpen: false,
  configured: false,
  provider: null,
  model: null,
  messages: [
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "I'm your Engage AI co-pilot. Use the quick actions below or ask a short question about proposals, clients, and renewals.",
    },
  ],
  setConfigured: (configured, provider = null, model = null) =>
    set({ configured, provider, model }),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  addMessage: (msg) =>
    set((s) => ({
      messages: [...s.messages, { ...msg, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }],
    })),
  clearMessages: () =>
    set({
      messages: [
        {
          id: 'welcome',
          role: 'assistant',
          content:
            "I'm your Engage AI co-pilot. Use the quick actions below or ask a short question about proposals, clients, and renewals.",
        },
      ],
    }),
}));
