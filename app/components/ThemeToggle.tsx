'use client';

import { useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'orderlyapp.theme.v1';
const THEME_CHANGE_EVENT = 'orderlyapp-theme-change';

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
}

function getTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function getServerTheme(): Theme {
  return 'light';
}

/** A theme change never replaces or remounts the page and its unsaved form state. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getTheme, getServerTheme);
  const nextTheme: Theme = theme === 'light' ? 'dark' : 'light';

  function toggleTheme(): void {
    document.documentElement.dataset.theme = nextTheme;
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));

    // Denied storage must not undo a user-requested change within this page.
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // In-memory DOM state remains authoritative for the current page.
    }
  }

  return (
    <button
      aria-label={`Switch to ${nextTheme} mode`}
      className="live-theme-toggle"
      onClick={toggleTheme}
      type="button"
    >
      Switch to {nextTheme} mode
    </button>
  );
}
