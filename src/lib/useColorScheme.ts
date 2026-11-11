import { useEffect, useState } from 'react';

export function useColorScheme(): 'light' | 'dark' {
  const q = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const [dark, setDark] = useState(q?.matches ?? false);
  useEffect(() => {
    if (!q) return;
    const h = (e: MediaQueryListEvent) => setDark(e.matches);
    q.addEventListener('change', h);
    return () => q.removeEventListener('change', h);
  }, [q]);
  return dark ? 'dark' : 'light';
}
