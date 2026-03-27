/** Hours scheduled for each day of the week. 0 means not a work day. */
export interface WorkSchedule {
  sunday: number
  monday: number
  tuesday: number
  wednesday: number
  thursday: number
  friday: number
  saturday: number
}

export interface PaydayAnnotation {
  type: 'payday'
  date: string // ISO 8601 date (YYYY-MM-DD)
  hoursAccrued: number // Hours accrued this pay period (>= 0)
  currentHours?: number // Optional balance anchor (>= 0)
}

/** Hours specification for a time-off day. */
export type DayHours = number | 'full'

export interface TimeOffAnnotation {
  type: 'timeoff'
  startDate: string // ISO 8601 date (YYYY-MM-DD)
  endDate: string // ISO 8601 date; equal to startDate for single day
  hours: DayHours | [DayHours, DayHours]
  // number: partial hours (single-day only)
  // 'full': full scheduled hours every day
  // [first, last]: first day hours, last day hours; middle days are 'full'
}

export interface UnpaidAnnotation {
  type: 'unpaid'
  startDate: string // ISO 8601 date (YYYY-MM-DD)
  endDate: string
}

export type Annotation = PaydayAnnotation | TimeOffAnnotation | UnpaidAnnotation

export type AnnotationType = 'payday' | 'timeoff' | 'unpaid'

export interface AppData {
  version: 1
  reserveHours: number
  workSchedule: WorkSchedule
  annotations: Annotation[]
}

/** Expanded annotations for a single date, as returned by getAnnotationsForDate. */
export interface ResolvedDayAnnotations {
  date: string
  payday: PaydayAnnotation | null
  timeoff: TimeOffAnnotation | null
  unpaid: UnpaidAnnotation | null
}

export type RangeEditMode = 'replace' | 'split'

/** Default work schedule: Mon–Fri 8 hrs, Sat–Sun 0. */
export const DEFAULT_WORK_SCHEDULE: WorkSchedule = {
  sunday: 0,
  monday: 9,
  tuesday: 9,
  wednesday: 9,
  thursday: 0,
  friday: 8,
  saturday: 0,
}

export const DEFAULT_APP_DATA: AppData = {
  version: 1,
  reserveHours: 0,
  workSchedule: { ...DEFAULT_WORK_SCHEDULE },
  annotations: [],
}
