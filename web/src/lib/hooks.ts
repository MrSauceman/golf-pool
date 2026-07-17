import { useEffect, useRef, useState } from 'react';

export type Theme = 'light' | 'dark';

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('gp-theme') as Theme | null;
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('gp-theme', theme);
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}

/** Returns true briefly after `value` changes (for flash-on-update effects). */
export function useChanged(value: unknown, ms = 1400): boolean {
  const prev = useRef(value);
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setChanged(true);
      const t = setTimeout(() => setChanged(false), ms);
      return () => clearTimeout(t);
    }
  }, [value, ms]);
  return changed;
}
