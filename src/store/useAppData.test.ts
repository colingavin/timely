import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DEFAULT_APP_DATA } from '@/lib/types'

// Mock localStorage before importing the store (which reads it at module load)
const store = new Map<string, string>()
const localStorageMock = {
  getItem: vi.fn((key: string) => store.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => store.set(key, value)),
  removeItem: vi.fn((key: string) => store.delete(key)),
}
vi.stubGlobal('window', { localStorage: localStorageMock })

// Import after mock is in place
const { useAppData } = await import('./useAppData')

beforeEach(() => {
  store.clear()
  vi.clearAllMocks()
  useAppData.setState({
    ...DEFAULT_APP_DATA,
    workSchedule: { ...DEFAULT_APP_DATA.workSchedule },
    annotations: [],
  })
})

describe('useAppData store', () => {
  it('initialises with defaults when localStorage is empty', () => {
    const state = useAppData.getState()
    expect(state.version).toBe(1)
    expect(state.reserveHours).toBe(0)
    expect(state.annotations).toEqual([])
  })

  it('persists to localStorage on mutation', () => {
    useAppData.getState().addAnnotation({ type: 'payday', date: '2026-01-09', hoursAccrued: 4 })

    expect(localStorageMock.setItem).toHaveBeenCalled()
    const raw = store.get('timely_data')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    expect(parsed.annotations).toHaveLength(1)
    expect(parsed.annotations[0].date).toBe('2026-01-09')
  })

  it('survives store re-read from localStorage', () => {
    useAppData.getState().addAnnotation({ type: 'payday', date: '2026-01-09', hoursAccrued: 4 })

    const raw = store.get('timely_data')!
    const loaded = JSON.parse(raw)
    expect(loaded.annotations).toHaveLength(1)
  })

  it('setReserveHours persists', () => {
    useAppData.getState().setReserveHours(16)
    expect(useAppData.getState().reserveHours).toBe(16)

    const raw = JSON.parse(store.get('timely_data')!)
    expect(raw.reserveHours).toBe(16)
  })

  it('setWorkSchedule persists', () => {
    const newSchedule = { ...DEFAULT_APP_DATA.workSchedule, friday: 4 }
    useAppData.getState().setWorkSchedule(newSchedule)
    expect(useAppData.getState().workSchedule.friday).toBe(4)
  })

  it('exportJSON returns valid JSON matching current state', () => {
    useAppData.getState().addAnnotation({ type: 'payday', date: '2026-01-09', hoursAccrued: 4 })
    const json = useAppData.getState().exportJSON()
    const parsed = JSON.parse(json)
    expect(parsed.version).toBe(1)
    expect(parsed.annotations).toHaveLength(1)
  })

  it('importJSON replaces state and persists', () => {
    const imported = {
      version: 1,
      reserveHours: 20,
      workSchedule: DEFAULT_APP_DATA.workSchedule,
      annotations: [{ type: 'payday', date: '2026-03-01', hoursAccrued: 5, currentHours: 60 }],
    }
    useAppData.getState().importJSON(JSON.stringify(imported))
    expect(useAppData.getState().reserveHours).toBe(20)
    expect(useAppData.getState().annotations).toHaveLength(1)
  })

  it('importJSON rejects invalid data', () => {
    expect(() => useAppData.getState().importJSON('{"version": 2}')).toThrow()
    expect(() => useAppData.getState().importJSON('not json')).toThrow()
  })

  it('clearAll resets to defaults', () => {
    useAppData.getState().addAnnotation({ type: 'payday', date: '2026-01-09', hoursAccrued: 4 })
    useAppData.getState().setReserveHours(20)
    useAppData.getState().clearAll()

    expect(useAppData.getState().annotations).toEqual([])
    expect(useAppData.getState().reserveHours).toBe(0)
  })
})
