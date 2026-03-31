import { create } from 'zustand'
import type {
  AppData,
  Annotation,
  PaydayAnnotation,
  TimeOffAnnotation,
  UnpaidAnnotation,
  WorkSchedule,
  RangeEditMode,
} from '@/lib/types'
import { DEFAULT_APP_DATA } from '@/lib/types'
import {
  addAnnotation,
  updatePaydayAnnotation,
  removePaydayAnnotation,
  updateRangeAnnotation,
  removeRangeAnnotation,
} from '@/lib/pto'

const STORAGE_KEY = 'timely_data'

function loadFromStorage(): AppData {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as AppData
      if (parsed.version === 1 && Array.isArray(parsed.annotations)) {
        return {
          ...DEFAULT_APP_DATA,
          ...parsed,
        }
      }
    }
  } catch {
    // Corrupt or missing data — fall through to defaults
  }
  return {
    ...DEFAULT_APP_DATA,
    workSchedule: { ...DEFAULT_APP_DATA.workSchedule },
    annotations: [],
  }
}

function persist(data: AppData): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

interface AppDataStore extends AppData {
  // Mutations
  addAnnotation: (annotation: Annotation) => void
  updatePayday: (updated: PaydayAnnotation) => void
  removePayday: (date: string) => void
  updateRange: (
    original: TimeOffAnnotation | UnpaidAnnotation,
    updated: TimeOffAnnotation | UnpaidAnnotation,
    mode: RangeEditMode,
  ) => void
  removeRange: (
    annotation: TimeOffAnnotation | UnpaidAnnotation,
    removeStart: string,
    removeEnd: string,
    mode: RangeEditMode,
  ) => void

  // Settings
  setReserveHours: (hours: number) => void
  setYearlyAdditionalHours: (hours: number) => void
  setWorkSchedule: (schedule: WorkSchedule) => void

  // Import / Export
  exportJSON: () => string
  importJSON: (json: string) => void
  clearAll: () => void
}

function dataFromState(state: AppDataStore): AppData {
  return {
    version: state.version,
    reserveHours: state.reserveHours,
    yearlyAdditionalHours: state.yearlyAdditionalHours,
    workSchedule: state.workSchedule,
    annotations: state.annotations,
  }
}

function applyData(newData: AppData): Partial<AppDataStore> {
  persist(newData)
  return {
    version: newData.version,
    reserveHours: newData.reserveHours,
    yearlyAdditionalHours: newData.yearlyAdditionalHours,
    workSchedule: newData.workSchedule,
    annotations: newData.annotations,
  }
}

export const useAppData = create<AppDataStore>((set, get) => {
  const initial = loadFromStorage()

  return {
    ...initial,

    addAnnotation: (annotation) => {
      const result = addAnnotation(dataFromState(get()), annotation)
      set(applyData(result))
    },

    updatePayday: (updated) => {
      const result = updatePaydayAnnotation(dataFromState(get()), updated)
      set(applyData(result))
    },

    removePayday: (date) => {
      const result = removePaydayAnnotation(dataFromState(get()), date)
      set(applyData(result))
    },

    updateRange: (original, updated, mode) => {
      const result = updateRangeAnnotation(dataFromState(get()), original, updated, mode)
      set(applyData(result))
    },

    removeRange: (annotation, removeStart, removeEnd, mode) => {
      const result = removeRangeAnnotation(
        dataFromState(get()),
        annotation,
        removeStart,
        removeEnd,
        mode,
      )
      set(applyData(result))
    },

    setReserveHours: (hours) => {
      const newData = { ...dataFromState(get()), reserveHours: hours }
      set(applyData(newData))
    },

    setYearlyAdditionalHours: (hours) => {
      const newData = { ...dataFromState(get()), yearlyAdditionalHours: hours }
      set(applyData(newData))
    },

    setWorkSchedule: (schedule) => {
      const newData = { ...dataFromState(get()), workSchedule: schedule }
      set(applyData(newData))
    },

    exportJSON: () => {
      return JSON.stringify(dataFromState(get()), null, 2)
    },

    importJSON: (json) => {
      const parsed = JSON.parse(json) as AppData
      if (parsed.version !== 1 || !Array.isArray(parsed.annotations)) {
        throw new Error('Invalid data format')
      }
      set(applyData(parsed))
    },

    clearAll: () => {
      const fresh: AppData = {
        ...DEFAULT_APP_DATA,
        workSchedule: { ...DEFAULT_APP_DATA.workSchedule },
        annotations: [],
      }
      set(applyData(fresh))
    },
  }
})
