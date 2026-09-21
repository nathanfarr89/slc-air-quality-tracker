import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type ColorMode = 'light' | 'dark';

interface ColorModeValue {
  mode: ColorMode;
  toggle: () => void;
}

const KEY = 'slc-aq-color-mode';
const ColorModeContext = createContext<ColorModeValue | null>(null);

function initialMode(): ColorMode {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Applied synchronously so charts reading CSS variables never see a stale mode. */
function applyMode(mode: ColorMode) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(mode);
  root.style.colorScheme = mode;
}

export function ColorModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ColorMode>(() => {
    const m = initialMode();
    applyMode(m);
    return m;
  });

  const toggle = useCallback(() => {
    const next = mode === 'dark' ? 'light' : 'dark';
    applyMode(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
    setMode(next);
  }, [mode]);

  const value = useMemo(() => ({ mode, toggle }), [mode, toggle]);
  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useColorMode(): ColorModeValue {
  const ctx = useContext(ColorModeContext);
  if (!ctx) throw new Error('useColorMode must be used inside ColorModeProvider');
  return ctx;
}
