import type {
  AppData,
  Annotation,
  PaydayAnnotation,
  TimeOffAnnotation,
  UnpaidAnnotation,
  WorkSchedule,
  ResolvedDayAnnotations,
  RangeEditMode,
} from './types'

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const DAY_NAMES: (keyof WorkSchedule)[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]

/** Add `days` calendar days to a YYYY-MM-DD string. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return toDateStr(d)
}

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function daysBetween(a: string, b: string): number {
  const msA = new Date(a + 'T00:00:00').getTime()
  const msB = new Date(b + 'T00:00:00').getTime()
  return Math.round((msB - msA) / 86_400_000)
}

function weekday(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00').getDay()
}

// ---------------------------------------------------------------------------
// 3.1 Work Schedule Helpers
// ---------------------------------------------------------------------------

export function getScheduledHours(schedule: WorkSchedule, date: string): number {
  return schedule[DAY_NAMES[weekday(date)]]
}

export function getScheduledHoursInRange(
  schedule: WorkSchedule,
  start: string,
  end: string,
): number {
  let total = 0
  let cur = start
  while (cur <= end) {
    total += getScheduledHours(schedule, cur)
    cur = addDays(cur, 1)
  }
  return total
}

// ---------------------------------------------------------------------------
// 3.2 Annotation Queries
// ---------------------------------------------------------------------------

function dateInRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end
}

export function getAnnotationsForDate(data: AppData, date: string): ResolvedDayAnnotations {
  const result: ResolvedDayAnnotations = {
    date,
    payday: null,
    timeoff: null,
    unpaid: null,
  }

  for (const ann of data.annotations) {
    switch (ann.type) {
      case 'payday':
        if (ann.date === date) result.payday = ann
        break
      case 'timeoff':
        if (dateInRange(date, ann.startDate, ann.endDate)) result.timeoff = ann
        break
      case 'unpaid':
        if (dateInRange(date, ann.startDate, ann.endDate)) result.unpaid = ann
        break
    }
  }

  return result
}

export function getAnnotatedDatesInRange(data: AppData, start: string, end: string): string[] {
  const dateSet = new Set<string>()

  for (const ann of data.annotations) {
    if (ann.type === 'payday') {
      if (dateInRange(ann.date, start, end)) {
        dateSet.add(ann.date)
      }
    } else {
      // Range annotation: iterate the overlap between [ann.startDate, ann.endDate] and [start, end]
      const overlapStart = ann.startDate > start ? ann.startDate : start
      const overlapEnd = ann.endDate < end ? ann.endDate : end
      let cur = overlapStart
      while (cur <= overlapEnd) {
        dateSet.add(cur)
        cur = addDays(cur, 1)
      }
    }
  }

  return [...dateSet].sort()
}

// ---------------------------------------------------------------------------
// 3.3 Balance Computation
// ---------------------------------------------------------------------------

/**
 * Build a map of date -> resolved annotations for efficient day-by-day walking.
 * Only includes dates within [start, end] that have at least one annotation.
 */
function buildDayMap(
  data: AppData,
  start: string,
  end: string,
): Map<
  string,
  { payday?: PaydayAnnotation; timeoff?: TimeOffAnnotation; unpaid?: UnpaidAnnotation }
> {
  const map = new Map<
    string,
    { payday?: PaydayAnnotation; timeoff?: TimeOffAnnotation; unpaid?: UnpaidAnnotation }
  >()

  function getEntry(date: string) {
    let e = map.get(date)
    if (!e) {
      e = {}
      map.set(date, e)
    }
    return e
  }

  for (const ann of data.annotations) {
    if (ann.type === 'payday') {
      if (ann.date >= start && ann.date <= end) {
        getEntry(ann.date).payday = ann
      }
    } else {
      const overlapStart = ann.startDate > start ? ann.startDate : start
      const overlapEnd = ann.endDate < end ? ann.endDate : end
      let cur = overlapStart
      while (cur <= overlapEnd) {
        getEntry(cur)[ann.type] = ann as TimeOffAnnotation & UnpaidAnnotation
        cur = addDays(cur, 1)
      }
    }
  }

  return map
}

/**
 * Find the most recent anchoring Pay-day (one with `currentHours` set) on or before `date`.
 */
function findAnchor(data: AppData, date: string): PaydayAnnotation | null {
  let best: PaydayAnnotation | null = null
  for (const ann of data.annotations) {
    if (ann.type === 'payday' && ann.currentHours !== undefined && ann.date <= date) {
      if (!best || ann.date > best.date) {
        best = ann
      }
    }
  }
  return best
}

export function getBalanceOnDate(data: AppData, date: string): number | null {
  const anchor = findAnchor(data, date)
  if (!anchor) return null

  const schedule = data.workSchedule

  // Build day map from anchor date to target date
  const dayMap = buildDayMap(data, anchor.date, date)

  let balance = anchor.currentHours!
  let accrualRate = anchor.hoursAccrued
  let lastPayday = anchor.date
  let unpaidHours = 0

  // The anchor's payday itself: we already used currentHours, so we just need to
  // process time off on the anchor date and set up state.
  const anchorDay = dayMap.get(anchor.date)
  if (anchorDay?.timeoff) {
    const hrs =
      anchorDay.timeoff.hours === 'full'
        ? getScheduledHours(schedule, anchor.date)
        : anchorDay.timeoff.hours
    balance -= hrs
  }
  // Unpaid on anchor day counts toward next period
  if (anchorDay?.unpaid) {
    unpaidHours += getScheduledHours(schedule, anchor.date)
  }

  // Walk forward from day after anchor to target date
  let cur = addDays(anchor.date, 1)
  while (cur <= date) {
    const entry = dayMap.get(cur)

    // Check for auto-accrual: every 14 days after lastPayday
    const daysSincePayday = daysBetween(lastPayday, cur)
    if (daysSincePayday > 0 && daysSincePayday % 14 === 0 && !entry?.payday) {
      // Auto-accrue
      const periodStart = addDays(cur, -13)
      const periodEnd = addDays(cur, 0)
      const scheduledInPeriod = getScheduledHoursInRange(schedule, periodStart, periodEnd)
      if (scheduledInPeriod > 0) {
        balance += accrualRate * ((scheduledInPeriod - unpaidHours) / scheduledInPeriod)
      }
      unpaidHours = 0
    }

    // Pay-day annotation
    if (entry?.payday) {
      if (entry.payday.currentHours !== undefined) {
        balance = entry.payday.currentHours
      } else {
        balance += entry.payday.hoursAccrued
      }
      accrualRate = entry.payday.hoursAccrued
      lastPayday = cur
      unpaidHours = 0
    }

    // Time Off deduction (after payday accrual)
    if (entry?.timeoff) {
      const hrs =
        entry.timeoff.hours === 'full' ? getScheduledHours(schedule, cur) : entry.timeoff.hours
      balance -= hrs
    }

    // Unpaid tracking
    if (entry?.unpaid) {
      unpaidHours += getScheduledHours(schedule, cur)
    }

    cur = addDays(cur, 1)
  }

  return balance
}

export function getBalanceRange(
  data: AppData,
  start: string,
  end: string,
): Map<string, number | null> {
  // For efficiency, we compute balance at `start` then walk forward.
  // But we need the full context from the anchor, so we use getBalanceOnDate
  // for consistency. For large ranges this could be optimized into a single pass,
  // but correctness first.
  const result = new Map<string, number | null>()
  let cur = start
  while (cur <= end) {
    result.set(cur, getBalanceOnDate(data, cur))
    cur = addDays(cur, 1)
  }
  return result
}

// ---------------------------------------------------------------------------
// 3.4 Reserve
// ---------------------------------------------------------------------------

export function getDatesBelowReserve(data: AppData, start: string, end: string): string[] {
  const result: string[] = []
  let cur = start
  while (cur <= end) {
    const balance = getBalanceOnDate(data, cur)
    if (balance !== null && balance < data.reserveHours) {
      result.push(cur)
    }
    cur = addDays(cur, 1)
  }
  return result
}

// ---------------------------------------------------------------------------
// 3.5 Mutations (all return new AppData, never mutate in place)
// ---------------------------------------------------------------------------

export function addAnnotation(data: AppData, annotation: Annotation): AppData {
  if (annotation.type === 'payday') {
    const existing = data.annotations.find((a) => a.type === 'payday' && a.date === annotation.date)
    if (existing) {
      throw new Error(`A payday annotation already exists on ${annotation.date}`)
    }
  }
  return { ...data, annotations: [...data.annotations, annotation] }
}

export function updatePaydayAnnotation(data: AppData, updated: PaydayAnnotation): AppData {
  return {
    ...data,
    annotations: data.annotations.map((a) =>
      a.type === 'payday' && a.date === updated.date ? updated : a,
    ),
  }
}

export function removePaydayAnnotation(data: AppData, date: string): AppData {
  return {
    ...data,
    annotations: data.annotations.filter((a) => !(a.type === 'payday' && a.date === date)),
  }
}

function rangeAnnotationsEqual(
  a: TimeOffAnnotation | UnpaidAnnotation,
  b: TimeOffAnnotation | UnpaidAnnotation,
): boolean {
  if (a.type !== b.type) return false
  if (a.startDate !== b.startDate || a.endDate !== b.endDate) return false
  if (a.type === 'timeoff' && b.type === 'timeoff') {
    return a.hours === b.hours
  }
  return true
}

export function updateRangeAnnotation(
  data: AppData,
  original: TimeOffAnnotation | UnpaidAnnotation,
  updated: TimeOffAnnotation | UnpaidAnnotation,
  rangeEdit: RangeEditMode,
): AppData {
  if (rangeEdit === 'replace') {
    return {
      ...data,
      annotations: data.annotations.map((a) =>
        a.type !== 'payday' && rangeAnnotationsEqual(a, original) ? updated : a,
      ),
    }
  }

  // 'split' mode: remove the original, add the updated plus any remainder ranges
  const newAnnotations = data.annotations.filter(
    (a) => a.type === 'payday' || !rangeAnnotationsEqual(a, original),
  )

  // Add the updated annotation
  newAnnotations.push(updated)

  // Add remainder ranges for parts of the original not covered by the updated
  // Prefix: original.startDate to day before updated.startDate
  if (updated.startDate > original.startDate) {
    const prefix = { ...original, endDate: addDays(updated.startDate, -1) }
    if (prefix.startDate <= prefix.endDate) {
      newAnnotations.push(prefix as TimeOffAnnotation | UnpaidAnnotation)
    }
  }

  // Suffix: day after updated.endDate to original.endDate
  if (updated.endDate < original.endDate) {
    const suffix = { ...original, startDate: addDays(updated.endDate, 1) }
    if (suffix.startDate <= suffix.endDate) {
      newAnnotations.push(suffix as TimeOffAnnotation | UnpaidAnnotation)
    }
  }

  return { ...data, annotations: newAnnotations }
}

export function removeRangeAnnotation(
  data: AppData,
  annotation: TimeOffAnnotation | UnpaidAnnotation,
  removeStart: string,
  removeEnd: string,
  rangeEdit: RangeEditMode,
): AppData {
  const newAnnotations = data.annotations.filter(
    (a) => a.type === 'payday' || !rangeAnnotationsEqual(a, annotation),
  )

  if (rangeEdit === 'replace') {
    return { ...data, annotations: newAnnotations }
  }

  // 'split' mode: retain prefix and/or suffix outside [removeStart, removeEnd]
  if (annotation.startDate < removeStart) {
    const prefix = { ...annotation, endDate: addDays(removeStart, -1) }
    if (prefix.startDate <= prefix.endDate) {
      newAnnotations.push(prefix as TimeOffAnnotation | UnpaidAnnotation)
    }
  }

  if (annotation.endDate > removeEnd) {
    const suffix = { ...annotation, startDate: addDays(removeEnd, 1) }
    if (suffix.startDate <= suffix.endDate) {
      newAnnotations.push(suffix as TimeOffAnnotation | UnpaidAnnotation)
    }
  }

  return { ...data, annotations: newAnnotations }
}
