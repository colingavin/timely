import { create } from 'zustand'
import { useEffect } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'timely_theme'

function getStoredTheme(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    // ignore
  }
  return 'system'
}

interface ThemeStore {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
}

export const useThemeStore = create<ThemeStore>((set) => ({
  mode: getStoredTheme(),
  setMode: (mode) => {
    window.localStorage.setItem(STORAGE_KEY, mode)
    set({ mode })
  },
}))

function applyTheme(mode: ThemeMode) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const isDark = mode === 'dark' || (mode === 'system' && prefersDark)

  document.documentElement.classList.toggle('dark', isDark)
}

/** Hook that syncs the theme to the DOM. Call once at the app root. */
export function useThemeEffect() {
  const mode = useThemeStore((s) => s.mode)

  useEffect(() => {
    applyTheme(mode)

    if (mode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => applyTheme('system')
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [mode])
}
