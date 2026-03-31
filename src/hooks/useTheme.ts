import { useState } from 'react';

export type Theme = 'dark' | 'light';
const STORAGE_KEY = 'radboard_theme';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(STORAGE_KEY) as Theme) ?? 'dark',
  );

  function toggle() {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }

  return { theme, toggle };
}
