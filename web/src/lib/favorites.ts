import { useEffect, useReducer } from 'react';

// App-wide "My teams" favorites, persisted to localStorage and reactive everywhere.
const KEY = 'gp-favorites';
let favs = new Set<string>(load());
const listeners = new Set<() => void>();

function load(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

function persist() {
  localStorage.setItem(KEY, JSON.stringify([...favs]));
  listeners.forEach((l) => l());
}

export function toggleFav(id: string) {
  if (favs.has(id)) favs.delete(id);
  else favs.add(id);
  persist();
}

export function isFav(id: string): boolean {
  return favs.has(id);
}

export function useFavorites() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    const l = () => force();
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return { has: isFav, toggle: toggleFav, all: favs, count: favs.size };
}
