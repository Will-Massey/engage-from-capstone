import { useCommandPaletteStore } from '../stores/commandPaletteStore';

interface UseCommandPaletteReturn {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

/** Shared command palette state (Ctrl/Cmd+K is registered in App.tsx). */
export const useCommandPalette = (): UseCommandPaletteReturn => {
  const isOpen = useCommandPaletteStore((s) => s.isOpen);
  const open = useCommandPaletteStore((s) => s.open);
  const close = useCommandPaletteStore((s) => s.close);
  const toggle = useCommandPaletteStore((s) => s.toggle);

  return { isOpen, open, close, toggle };
};

export default useCommandPalette;
