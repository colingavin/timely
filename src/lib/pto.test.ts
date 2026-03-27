import { describe, it, expect } from 'vitest'
import {
  getScheduledHours,
  getScheduledHoursInRange,
  resolveTimeOffHours,
  getAnnotationsForDate,
  getAnnotatedDatesInRange,
  getBalanceOnDate,
  getBalanceRange,
  getDatesBelowReserve,
  addAnnotation,
  updatePaydayAnnotation,
  removePaydayAnnotation,
  updateRangeAnnotation,
  removeRangeAnnotation,
} from './pto'
import type {
  AppData,
  WorkSchedule,
  PaydayAnnotation,
  TimeOffAnnotation,
  UnpaidAnnotation,
} from './types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const schedule: WorkSchedule = {
  sunday: 0,
  monday: 8,
  tuesday: 8,
  wednesday: 8,
  thursday: 8,
  friday: 8,
  saturday: 0,
}

function makeData(overrides: Partial<AppData> = {}): AppData {
  return {
    version: 1,
    reserveHours: 0,
    workSchedule: schedule,
    annotations: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// 3.1 Work Schedule Helpers
// ---------------------------------------------------------------------------

describe('getScheduledHours', () => {
  it('returns hours for a weekday', () => {
    // 2026-01-05 is a Monday
    expect(getScheduledHours(schedule, '2026-01-05')).toBe(8)
  })

  it('returns 0 for a weekend day', () => {
    // 2026-01-04 is a Sunday
    expect(getScheduledHours(schedule, '2026-01-04')).toBe(0)
    // 2026-01-03 is a Saturday
    expect(getScheduledHours(schedule, '2026-01-03')).toBe(0)
  })

  it('handles non-standard schedule', () => {
    const custom: WorkSchedule = {
      sunday: 0,
      monday: 6,
      tuesday: 6,
      wednesday: 6,
      thursday: 6,
      friday: 0,
      saturday: 0,
    }
    // 2026-01-09 is a Friday
    expect(getScheduledHours(custom, '2026-01-09')).toBe(0)
    // 2026-01-08 is a Thursday
    expect(getScheduledHours(custom, '2026-01-08')).toBe(6)
  })
})

describe('getScheduledHoursInRange', () => {
  it('sums a full week correctly', () => {
    // Mon 2026-01-05 to Sun 2026-01-11
    expect(getScheduledHoursInRange(schedule, '2026-01-05', '2026-01-11')).toBe(40)
  })

  it('sums a partial week', () => {
    // Mon to Wed = 3 × 8 = 24
    expect(getScheduledHoursInRange(schedule, '2026-01-05', '2026-01-07')).toBe(24)
  })

  it('sums a two-week range', () => {
    expect(getScheduledHoursInRange(schedule, '2026-01-05', '2026-01-18')).toBe(80)
  })

  it('returns 0 for a weekend-only range', () => {
    // Sat to Sun
    expect(getScheduledHoursInRange(schedule, '2026-01-03', '2026-01-04')).toBe(0)
  })

  it('handles single day', () => {
    expect(getScheduledHoursInRange(schedule, '2026-01-05', '2026-01-05')).toBe(8)
  })
})

// ---------------------------------------------------------------------------
// 3.2 Annotation Queries
// ---------------------------------------------------------------------------

describe('getAnnotationsForDate', () => {
  it('returns empty result for a date with no annotations', () => {
    const data = makeData()
    const result = getAnnotationsForDate(data, '2026-01-05')
    expect(result.payday).toBeNull()
    expect(result.timeoff).toBeNull()
    expect(result.unpaid).toBeNull()
  })

  it('finds a payday annotation on the exact date', () => {
    const pd: PaydayAnnotation = { type: 'payday', date: '2026-01-09', hoursAccrued: 4 }
    const data = makeData({ annotations: [pd] })
    const result = getAnnotationsForDate(data, '2026-01-09')
    expect(result.payday).toEqual(pd)
  })

  it('does not match payday on a different date', () => {
    const pd: PaydayAnnotation = { type: 'payday', date: '2026-01-09', hoursAccrued: 4 }
    const data = makeData({ annotations: [pd] })
    expect(getAnnotationsForDate(data, '2026-01-10').payday).toBeNull()
  })

  it('finds a timeoff range that covers the date', () => {
    const to: TimeOffAnnotation = {
      type: 'timeoff',
      startDate: '2026-01-05',
      endDate: '2026-01-09',
      hours: 'full',
    }
    const data = makeData({ annotations: [to] })

    // Start boundary
    expect(getAnnotationsForDate(data, '2026-01-05').timeoff).toEqual(to)
    // Middle
    expect(getAnnotationsForDate(data, '2026-01-07').timeoff).toEqual(to)
    // End boundary
    expect(getAnnotationsForDate(data, '2026-01-09').timeoff).toEqual(to)
    // Outside
    expect(getAnnotationsForDate(data, '2026-01-04').timeoff).toBeNull()
    expect(getAnnotationsForDate(data, '2026-01-10').timeoff).toBeNull()
  })

  it('finds an unpaid range that covers the date', () => {
    const up: UnpaidAnnotation = {
      type: 'unpaid',
      startDate: '2026-02-01',
      endDate: '2026-02-03',
    }
    const data = makeData({ annotations: [up] })
    expect(getAnnotationsForDate(data, '2026-02-02').unpaid).toEqual(up)
  })

  it('returns multiple annotation types for the same date', () => {
    const pd: PaydayAnnotation = {
      type: 'payday',
      date: '2026-01-09',
      hoursAccrued: 4,
      currentHours: 40,
    }
    const to: TimeOffAnnotation = {
      type: 'timeoff',
      startDate: '2026-01-09',
      endDate: '2026-01-09',
      hours: 4,
    }
    const data = makeData({ annotations: [pd, to] })
    const result = getAnnotationsForDate(data, '2026-01-09')
    expect(result.payday).toEqual(pd)
    expect(result.timeoff).toEqual(to)
  })
})

describe('getAnnotatedDatesInRange', () => {
  it('returns empty array for no annotations', () => {
    expect(getAnnotatedDatesInRange(makeData(), '2026-01-01', '2026-01-31')).toEqual([])
  })

  it('returns payday dates within range', () => {
    const data = makeData({
      annotations: [
        { type: 'payday', date: '2026-01-09', hoursAccrued: 4 },
        { type: 'payday', date: '2026-02-06', hoursAccrued: 4 },
      ],
    })
    expect(getAnnotatedDatesInRange(data, '2026-01-01', '2026-01-31')).toEqual(['2026-01-09'])
  })

  it('expands range annotations into individual dates', () => {
    const data = makeData({
      annotations: [
        { type: 'timeoff', startDate: '2026-01-05', endDate: '2026-01-07', hours: 'full' },
      ],
    })
    expect(getAnnotatedDatesInRange(data, '2026-01-01', '2026-01-31')).toEqual([
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
    ])
  })

  it('clips range annotations to the query range', () => {
    const data = makeData({
      annotations: [{ type: 'unpaid', startDate: '2025-12-29', endDate: '2026-01-02' }],
    })
    expect(getAnnotatedDatesInRange(data, '2026-01-01', '2026-01-31')).toEqual([
      '2026-01-01',
      '2026-01-02',
    ])
  })

  it('deduplicates dates with multiple annotations', () => {
    const data = makeData({
      annotations: [
        { type: 'payday', date: '2026-01-09', hoursAccrued: 4 },
        { type: 'timeoff', startDate: '2026-01-09', endDate: '2026-01-09', hours: 4 },
      ],
    })
    expect(getAnnotatedDatesInRange(data, '2026-01-01', '2026-01-31')).toEqual(['2026-01-09'])
  })
})

// ---------------------------------------------------------------------------
// 3.3 Balance Computation
// ---------------------------------------------------------------------------

describe('getBalanceOnDate', () => {
  it('returns null when no anchoring payday exists', () => {
    const data = makeData()
    expect(getBalanceOnDate(data, '2026-01-09')).toBeNull()
  })

  it('returns null when payday has no currentHours', () => {
    const data = makeData({
      annotations: [{ type: 'payday', date: '2026-01-09', hoursAccrued: 4 }],
    })
    expect(getBalanceOnDate(data, '2026-01-09')).toBeNull()
  })

  it('returns the anchor balance on the anchor date itself', () => {
    const data = makeData({
      annotations: [{ type: 'payday', date: '2026-01-09', hoursAccrued: 4, currentHours: 40 }],
    })
    expect(getBalanceOnDate(data, '2026-01-09')).toBe(40)
  })

  it('maintains balance on days with no annotations after anchor', () => {
    const data = makeData({
      annotations: [{ type: 'payday', date: '2026-01-09', hoursAccrued: 4, currentHours: 40 }],
    })
    // Next day, no annotations, no auto-accrual yet
    expect(getBalanceOnDate(data, '2026-01-10')).toBe(40)
  })

  it('deducts full-day time off using work schedule hours', () => {
    const data = makeData({
      annotations: [
        { type: 'payday', date: '2026-01-09', hoursAccrued: 4, currentHours: 40 },
        // Mon 2026-01-12
        { type: 'timeoff', startDate: '2026-01-12', endDate: '2026-01-12', hours: 'full' as const },
      ],
    })
    expect(getBalanceOnDate(data, '2026-01-12')).toBe(32) // 40 - 8
  })

  it('deducts partial-hours time off', () => {
    const data = makeData({
      annotations: [
        { type: 'payday', date: '2026-01-09', hoursAccrued: 4, currentHours: 40 },
        { type: 'timeoff', startDate: '2026-01-12', endDate: '2026-01-12', hours: 3 },
      ],
    })
    expect(getBalanceOnDate(data, '2026-01-12')).toBe(37) // 40 - 3
  })

  it('deducts full-day time off as 0 on a weekend', () => {
    const data = makeData({
      annotations: [
        { type: 'payday', date: '2026-01-09', hoursAccrued: 4, currentHours: 40 },
        // Sat 2026-01-10
        { type: 'timeoff', startDate: '2026-01-10', endDate: '2026-01-10', hours: 'full' as const },
      ],
    })
    expect(getBalanceOnDate(data, '2026-01-10')).toBe(40) // 0 scheduled hours on Saturday
  })

  it('applies payday accrual before same-day time off deduction', () => {
    // Anchor on Jan 9 with 40 hrs. Another payday on Jan 23 (+4 accrual, no anchor).
    // Time off also on Jan 23.
    // Balance on Jan 23 = 40 + 4 - 8 = 36
    const data = makeData({
      annotations: [
        { type: 'payday', date: '2026-01-09', hoursAccrued: 4, currentHours: 40 },
        { type: 'payday', date: '2026-01-23', hoursAccrued: 4 },
        // Fri 2026-01-23
        { type: 'timeoff', startDate: '2026-01-23', endDate: '2026-01-23', hours: 'full' as const },
      ],
    })
    expect(getBalanceOnDate(data, '2026-01-23')).toBe(36)
  })

  it('uses currentHours anchor on a subsequent payday', () => {
    const data = makeData({
      annotations: [
        { type: 'payday', date: '2026-01-09', hoursAccrued: 4, currentHours: 40 },
        { type: 'payday', date: '2026-01-23', hoursAccrued: 3, currentHours: 50 },
      ],
    })
    // The second anchor should reset balance to 50
    expect(getBalanceOnDate(data, '2026-01-23')).toBe(50)
  })

  it('accrual-only payday adds hoursAccrued to balance', () => {
    const data = makeData({
      annotations: [
        { type: 'payday', date: '2026-01-09', hoursAccrued: 4, currentHours: 40 },
        { type: 'payday', date: '2026-01-23', hoursAccrued: 4 }, // no currentHours
      ],
    })
    expect(getBalanceOnDate(data, '2026-01-23')).toBe(44) // 40 + 4
  })

  it('auto-accrues every 14 days after last payday', () => {
    // Anchor on Fri 2026-01-09 with 40 hrs, rate 4.
    // No explicit payday on Jan 23, so auto-accrual fires 14 days later.
    const data = makeData({
      annotations: [{ type: 'payday', date: '2026-01-09', hoursAccrued: 4, currentHours: 40 }],
    })
    // 14 days after Jan 9 = Jan 23
    expect(getBalanceOnDate(data, '2026-01-23')).toBe(44) // 40 + 4
    // 28 days after Jan 9 = Feb 6
    expect(getBalanceOnDate(data, '2026-02-06')).toBe(48) // 40 + 4 + 4
  })

  it('pro-rates auto-accrual for unpaid days using scheduled hours', () => {
    // Anchor on Fri 2026-01-09, rate 4. Unpaid Mon-Fri 2026-01-12 to 2026-01-16.
    // 14-day period: Jan 10 to Jan 23.
    // Scheduled hours in period (Jan 10-23): 2 weeks = 80 hrs
    // Unpaid hours: Mon-Fri Jan 12-16 = 5 days × 8 = 40 hrs
    // Pro-rated accrual: 4 × (80 - 40) / 80 = 4 × 0.5 = 2
    const data = makeData({
      annotations: [
        { type: 'payday', date: '2026-01-09', hoursAccrued: 4, currentHours: 40 },
        { type: 'unpaid', startDate: '2026-01-12', endDate: '2026-01-16' },
      ],
    })
    expect(getBalanceOnDate(data, '2026-01-23')).toBe(42) // 40 + 2
  })

  it('unpaid day with zero scheduled hours has no effect on accrual', () => {
    // Unpaid on a Saturday (0 scheduled hours) should not affect pro-ration
    const data = makeData({
      annotations: [
        { type: 'payday', date: '2026-01-09', hoursAccrued: 4, currentHours: 40 },
        { type: 'unpaid', startDate: '2026-01-10', endDate: '2026-01-10' }, // Saturday
      ],
    })
    expect(getBalanceOnDate(data, '2026-01-23')).toBe(44) // Full accrual, Saturday is 0 hrs
  })

  it('allows balance to go negative', () => {
    const data = makeData({
      annotations: [
        { type: 'payday', date: '2026-01-09', hoursAccrued: 4, currentHours: 4 },
        // Take a full week off: 5 × 8 = 40
        { type: 'timeoff', startDate: '2026-01-12', endDate: '2026-01-16', hours: 'full' as const },
      ],
    })
    expect(getBalanceOnDate(data, '2026-01-16')).toBe(-36) // 4 - 40
  })

  it('multi-day time off range deducts each work day', () => {
    const data = makeData({
      annotations: [
        { type: 'payday', date: '2026-01-09', hoursAccrued: 4, currentHours: 80 },
        // Mon-Wed off
        { type: 'timeoff', startDate: '2026-01-12', endDate: '2026-01-14', hours: 'full' as const },
      ],
    })
    // 80 - 8 - 8 - 8 = 56
    expect(getBalanceOnDate(data, '2026-01-14')).toBe(56)
  })

  it('uses most recent anchor when multiple anchoring paydays exist', () => {
    const data = makeData({
      annotations: [
        { type: 'payday', date: '2026-01-09', hoursAccrued: 4, currentHours: 40 },
        { type: 'payday', date: '2026-01-23', hoursAccrued: 3, currentHours: 100 },
      ],
    })
    // Query after second anchor
    expect(getBalanceOnDate(data, '2026-01-24')).toBe(100)
    // Query between anchors: uses first anchor
    expect(getBalanceOnDate(data, '2026-01-15')).toBe(40)
  })

  it('handles time off on anchor date', () => {
    const data = makeData({
      annotations: [
        { type: 'payday', date: '2026-01-09', hoursAccrued: 4, currentHours: 40 },
        { type: 'timeoff', startDate: '2026-01-09', endDate: '2026-01-09', hours: 'full' as const },
      ],
    })
    // Fri Jan 9 = 8 hrs. Balance = 40 - 8 = 32
    expect(getBalanceOnDate(data, '2026-01-09')).toBe(32)
  })
})

describe('getBalanceRange', () => {
  it('produces consistent results with getBalanceOnDate', () => {
    const data = makeData({
      annotations: [
        { type: 'payday', date: '2026-01-09', hoursAccrued: 4, currentHours: 40 },
        { type: 'timeoff', startDate: '2026-01-12', endDate: '2026-01-14', hours: 'full' as const },
      ],
    })

    const range = getBalanceRange(data, '2026-01-09', '2026-01-16')
    let cur = '2026-01-09'
    while (cur <= '2026-01-16') {
      expect(range.get(cur)).toBe(getBalanceOnDate(data, cur))
      const d = new Date(cur + 'T00:00:00')
      d.setDate(d.getDate() + 1)
      cur = d.toISOString().slice(0, 10)
    }
  })

  it('returns null for dates before any anchor', () => {
    const data = makeData({
      annotations: [{ type: 'payday', date: '2026-01-09', hoursAccrued: 4, currentHours: 40 }],
    })
    const range = getBalanceRange(data, '2026-01-05', '2026-01-09')
    expect(range.get('2026-01-05')).toBeNull()
    expect(range.get('2026-01-08')).toBeNull()
    expect(range.get('2026-01-09')).toBe(40)
  })
})

// ---------------------------------------------------------------------------
// 3.4 Reserve
// ---------------------------------------------------------------------------

describe('getDatesBelowReserve', () => {
  it('returns empty when reserve is 0 and balance is positive', () => {
    const data = makeData({
      annotations: [{ type: 'payday', date: '2026-01-09', hoursAccrued: 4, currentHours: 40 }],
    })
    expect(getDatesBelowReserve(data, '2026-01-09', '2026-01-16')).toEqual([])
  })

  it('detects dates below a positive reserve', () => {
    const data = makeData({
      reserveHours: 10,
      annotations: [
        { type: 'payday', date: '2026-01-09', hoursAccrued: 4, currentHours: 12 },
        { type: 'timeoff', startDate: '2026-01-12', endDate: '2026-01-12', hours: 'full' as const },
      ],
    })
    // Balance on Jan 12: 12 - 8 = 4, which is < 10
    const below = getDatesBelowReserve(data, '2026-01-09', '2026-01-14')
    expect(below).toContain('2026-01-12')
    expect(below).toContain('2026-01-13') // still 4 the next day
    expect(below).not.toContain('2026-01-09') // 12 >= 10
  })

  it('ignores dates where balance is unknown (null)', () => {
    const data = makeData({ reserveHours: 10 })
    expect(getDatesBelowReserve(data, '2026-01-01', '2026-01-07')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 3.5 Mutations
// ---------------------------------------------------------------------------

describe('addAnnotation', () => {
  it('appends an annotation', () => {
    const data = makeData()
    const pd: PaydayAnnotation = { type: 'payday', date: '2026-01-09', hoursAccrued: 4 }
    const result = addAnnotation(data, pd)
    expect(result.annotations).toHaveLength(1)
    expect(result.annotations[0]).toEqual(pd)
  })

  it('does not mutate the original data', () => {
    const data = makeData()
    addAnnotation(data, { type: 'payday', date: '2026-01-09', hoursAccrued: 4 })
    expect(data.annotations).toHaveLength(0)
  })

  it('throws on duplicate payday date', () => {
    const data = makeData({
      annotations: [{ type: 'payday', date: '2026-01-09', hoursAccrued: 4 }],
    })
    expect(() =>
      addAnnotation(data, { type: 'payday', date: '2026-01-09', hoursAccrued: 3 }),
    ).toThrow()
  })

  it('allows adding timeoff and unpaid on same date', () => {
    const data = makeData({
      annotations: [
        { type: 'timeoff', startDate: '2026-01-12', endDate: '2026-01-12', hours: 'full' },
      ],
    })
    const result = addAnnotation(data, {
      type: 'unpaid',
      startDate: '2026-01-12',
      endDate: '2026-01-12',
    })
    expect(result.annotations).toHaveLength(2)
  })
})

describe('updatePaydayAnnotation', () => {
  it('replaces matching payday', () => {
    const data = makeData({
      annotations: [{ type: 'payday', date: '2026-01-09', hoursAccrued: 4 }],
    })
    const updated: PaydayAnnotation = {
      type: 'payday',
      date: '2026-01-09',
      hoursAccrued: 6,
      currentHours: 50,
    }
    const result = updatePaydayAnnotation(data, updated)
    expect(result.annotations[0]).toEqual(updated)
  })

  it('leaves other annotations untouched', () => {
    const to: TimeOffAnnotation = {
      type: 'timeoff',
      startDate: '2026-01-12',
      endDate: '2026-01-12',
      hours: 'full',
    }
    const data = makeData({
      annotations: [{ type: 'payday', date: '2026-01-09', hoursAccrued: 4 }, to],
    })
    const result = updatePaydayAnnotation(data, {
      type: 'payday',
      date: '2026-01-09',
      hoursAccrued: 6,
    })
    expect(result.annotations).toHaveLength(2)
    expect(result.annotations[1]).toEqual(to)
  })
})

describe('removePaydayAnnotation', () => {
  it('removes the payday with matching date', () => {
    const data = makeData({
      annotations: [
        { type: 'payday', date: '2026-01-09', hoursAccrued: 4 },
        { type: 'payday', date: '2026-01-23', hoursAccrued: 4 },
      ],
    })
    const result = removePaydayAnnotation(data, '2026-01-09')
    expect(result.annotations).toHaveLength(1)
    expect((result.annotations[0] as PaydayAnnotation).date).toBe('2026-01-23')
  })
})

describe('updateRangeAnnotation', () => {
  const original: TimeOffAnnotation = {
    type: 'timeoff',
    startDate: '2026-01-12',
    endDate: '2026-01-16',
    hours: 'full',
  }

  it('replace mode swaps the whole range', () => {
    const data = makeData({ annotations: [original] })
    const updated: TimeOffAnnotation = {
      type: 'timeoff',
      startDate: '2026-01-13',
      endDate: '2026-01-15',
      hours: 'full',
    }
    const result = updateRangeAnnotation(data, original, updated, 'replace')
    expect(result.annotations).toHaveLength(1)
    expect(result.annotations[0]).toEqual(updated)
  })

  it('split mode produces prefix and suffix remainders', () => {
    const data = makeData({ annotations: [original] })
    // Shrink to just Wed (Jan 14)
    const updated: TimeOffAnnotation = {
      type: 'timeoff',
      startDate: '2026-01-14',
      endDate: '2026-01-14',
      hours: 4,
    }
    const result = updateRangeAnnotation(data, original, updated, 'split')
    // Should have: prefix (Mon-Tue), updated (Wed partial), suffix (Thu-Fri)
    expect(result.annotations).toHaveLength(3)
    const sorted = [...result.annotations].sort((a, b) => {
      const aDate = a.type === 'payday' ? a.date : a.startDate
      const bDate = b.type === 'payday' ? b.date : b.startDate
      return aDate.localeCompare(bDate)
    })
    // Prefix
    expect(sorted[0]).toMatchObject({ startDate: '2026-01-12', endDate: '2026-01-13' })
    // Updated
    expect(sorted[1]).toMatchObject({ startDate: '2026-01-14', endDate: '2026-01-14', hours: 4 })
    // Suffix
    expect(sorted[2]).toMatchObject({ startDate: '2026-01-15', endDate: '2026-01-16' })
  })

  it('split mode with only a prefix remainder', () => {
    const data = makeData({ annotations: [original] })
    // Update from Thu-Fri (end of range)
    const updated: TimeOffAnnotation = {
      type: 'timeoff',
      startDate: '2026-01-15',
      endDate: '2026-01-16',
      hours: 4,
    }
    const result = updateRangeAnnotation(data, original, updated, 'split')
    expect(result.annotations).toHaveLength(2)
    const sorted = [...result.annotations].sort((a, b) => {
      const aDate = a.type === 'payday' ? a.date : a.startDate
      const bDate = b.type === 'payday' ? b.date : b.startDate
      return aDate.localeCompare(bDate)
    })
    expect(sorted[0]).toMatchObject({ startDate: '2026-01-12', endDate: '2026-01-14' })
    expect(sorted[1]).toMatchObject({ startDate: '2026-01-15', hours: 4 })
  })

  it('split mode with no remainder (same range)', () => {
    const data = makeData({ annotations: [original] })
    const updated: TimeOffAnnotation = { ...original, hours: 'full' }
    const result = updateRangeAnnotation(data, original, updated, 'split')
    expect(result.annotations).toHaveLength(1)
  })
})

describe('removeRangeAnnotation', () => {
  const annotation: TimeOffAnnotation = {
    type: 'timeoff',
    startDate: '2026-01-12',
    endDate: '2026-01-16',
    hours: 'full',
  }

  it('replace mode removes the entire range', () => {
    const data = makeData({ annotations: [annotation] })
    const result = removeRangeAnnotation(data, annotation, '2026-01-14', '2026-01-14', 'replace')
    expect(result.annotations).toHaveLength(0)
  })

  it('split mode with interior sub-range produces two remainders', () => {
    const data = makeData({ annotations: [annotation] })
    // Remove Wed Jan 14 from Mon-Fri range
    const result = removeRangeAnnotation(data, annotation, '2026-01-14', '2026-01-14', 'split')
    expect(result.annotations).toHaveLength(2)
    const sorted = [...result.annotations].sort((a, b) => {
      const aDate = a.type === 'payday' ? a.date : a.startDate
      const bDate = b.type === 'payday' ? b.date : b.startDate
      return aDate.localeCompare(bDate)
    })
    expect(sorted[0]).toMatchObject({ startDate: '2026-01-12', endDate: '2026-01-13' })
    expect(sorted[1]).toMatchObject({ startDate: '2026-01-15', endDate: '2026-01-16' })
  })

  it('split mode removing prefix produces one suffix remainder', () => {
    const data = makeData({ annotations: [annotation] })
    const result = removeRangeAnnotation(data, annotation, '2026-01-12', '2026-01-13', 'split')
    expect(result.annotations).toHaveLength(1)
    expect(result.annotations[0]).toMatchObject({
      startDate: '2026-01-14',
      endDate: '2026-01-16',
    })
  })

  it('split mode removing suffix produces one prefix remainder', () => {
    const data = makeData({ annotations: [annotation] })
    const result = removeRangeAnnotation(data, annotation, '2026-01-15', '2026-01-16', 'split')
    expect(result.annotations).toHaveLength(1)
    expect(result.annotations[0]).toMatchObject({
      startDate: '2026-01-12',
      endDate: '2026-01-14',
    })
  })

  it('split mode removing entire range produces no remainders', () => {
    const data = makeData({ annotations: [annotation] })
    const result = removeRangeAnnotation(data, annotation, '2026-01-12', '2026-01-16', 'split')
    expect(result.annotations).toHaveLength(0)
  })

  it('preserves other annotations', () => {
    const pd: PaydayAnnotation = { type: 'payday', date: '2026-01-09', hoursAccrued: 4 }
    const data = makeData({ annotations: [pd, annotation] })
    const result = removeRangeAnnotation(data, annotation, '2026-01-12', '2026-01-16', 'replace')
    expect(result.annotations).toHaveLength(1)
    expect(result.annotations[0]).toEqual(pd)
  })
})

// ---------------------------------------------------------------------------
// resolveTimeOffHours (tuple hours)
// ---------------------------------------------------------------------------

describe('resolveTimeOffHours', () => {
  it('returns scheduled hours for full single-day', () => {
    const ann: TimeOffAnnotation = {
      type: 'timeoff',
      startDate: '2026-01-12',
      endDate: '2026-01-12',
      hours: 'full',
    }
    // Monday = 8 hrs
    expect(resolveTimeOffHours(ann, '2026-01-12', schedule)).toBe(8)
  })

  it('returns partial hours for single-day', () => {
    const ann: TimeOffAnnotation = {
      type: 'timeoff',
      startDate: '2026-01-12',
      endDate: '2026-01-12',
      hours: 3,
    }
    expect(resolveTimeOffHours(ann, '2026-01-12', schedule)).toBe(3)
  })

  it('returns first-day hours from tuple on start date', () => {
    const ann: TimeOffAnnotation = {
      type: 'timeoff',
      startDate: '2026-01-12',
      endDate: '2026-01-16',
      hours: [4, 2],
    }
    expect(resolveTimeOffHours(ann, '2026-01-12', schedule)).toBe(4)
  })

  it('returns last-day hours from tuple on end date', () => {
    const ann: TimeOffAnnotation = {
      type: 'timeoff',
      startDate: '2026-01-12',
      endDate: '2026-01-16',
      hours: [4, 2],
    }
    expect(resolveTimeOffHours(ann, '2026-01-16', schedule)).toBe(2)
  })

  it('returns full scheduled hours for middle days in tuple mode', () => {
    const ann: TimeOffAnnotation = {
      type: 'timeoff',
      startDate: '2026-01-12',
      endDate: '2026-01-16',
      hours: [4, 2],
    }
    // Wed Jan 14 = 8 hrs scheduled
    expect(resolveTimeOffHours(ann, '2026-01-14', schedule)).toBe(8)
  })

  it('handles full as first/last in tuple', () => {
    const ann: TimeOffAnnotation = {
      type: 'timeoff',
      startDate: '2026-01-12',
      endDate: '2026-01-16',
      hours: ['full', 3],
    }
    expect(resolveTimeOffHours(ann, '2026-01-12', schedule)).toBe(8)
    expect(resolveTimeOffHours(ann, '2026-01-16', schedule)).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// Balance computation with tuple hours
// ---------------------------------------------------------------------------

describe('getBalanceOnDate with tuple hours', () => {
  it('deducts partial first and last day from a range', () => {
    const data = makeData({
      annotations: [
        { type: 'payday', date: '2026-01-09', hoursAccrued: 4, currentHours: 80 },
        // Mon-Fri, first day 4hrs, last day 2hrs, middle days full (8 each)
        {
          type: 'timeoff',
          startDate: '2026-01-12',
          endDate: '2026-01-16',
          hours: [4, 2] as [number, number],
        },
      ],
    })
    // Total deduction: 4 + 8 + 8 + 8 + 2 = 30
    expect(getBalanceOnDate(data, '2026-01-16')).toBe(50) // 80 - 30
  })

  it('deducts correctly day by day with tuple hours', () => {
    const data = makeData({
      annotations: [
        { type: 'payday', date: '2026-01-09', hoursAccrued: 4, currentHours: 80 },
        {
          type: 'timeoff',
          startDate: '2026-01-12',
          endDate: '2026-01-14',
          hours: [3, 5] as [number, number],
        },
      ],
    })
    // Mon: 80 - 3 = 77
    expect(getBalanceOnDate(data, '2026-01-12')).toBe(77)
    // Tue: 77 - 8 = 69
    expect(getBalanceOnDate(data, '2026-01-13')).toBe(69)
    // Wed: 69 - 5 = 64
    expect(getBalanceOnDate(data, '2026-01-14')).toBe(64)
  })
})

// ---------------------------------------------------------------------------
// Range splitting with tuple hours
// ---------------------------------------------------------------------------

describe('removeRangeAnnotation with tuple hours', () => {
  // Mon-Thu with first day 5hrs, last day full
  const annotation: TimeOffAnnotation = {
    type: 'timeoff',
    startDate: '2026-01-12',
    endDate: '2026-01-15',
    hours: [5, 'full'],
  }

  it('removing second day produces single-day partial first + full remainder', () => {
    const data = makeData({ annotations: [annotation] })
    // Remove Tue Jan 13
    const result = removeRangeAnnotation(data, annotation, '2026-01-13', '2026-01-13', 'split')
    expect(result.annotations).toHaveLength(2)
    const sorted = [...result.annotations].sort((a, b) => {
      const aDate = a.type === 'payday' ? a.date : a.startDate
      const bDate = b.type === 'payday' ? b.date : b.startDate
      return aDate.localeCompare(bDate)
    })
    // First day: single day at 5hrs
    expect(sorted[0]).toMatchObject({ startDate: '2026-01-12', endDate: '2026-01-12', hours: 5 })
    // Remainder: Wed-Thu, full days (no tuple needed since neither is the original first)
    expect(sorted[1]).toMatchObject({
      startDate: '2026-01-14',
      endDate: '2026-01-15',
      hours: 'full',
    })
  })

  it('removing first day leaves full-day remainder', () => {
    const data = makeData({ annotations: [annotation] })
    const result = removeRangeAnnotation(data, annotation, '2026-01-12', '2026-01-12', 'split')
    expect(result.annotations).toHaveLength(1)
    // Tue-Thu: no partial days, all full
    expect(result.annotations[0]).toMatchObject({
      startDate: '2026-01-13',
      endDate: '2026-01-15',
      hours: 'full',
    })
  })

  it('removing last day preserves first-day partial in remainder', () => {
    const ann: TimeOffAnnotation = {
      type: 'timeoff',
      startDate: '2026-01-12',
      endDate: '2026-01-15',
      hours: [5, 3],
    }
    const data = makeData({ annotations: [ann] })
    const result = removeRangeAnnotation(data, ann, '2026-01-15', '2026-01-15', 'split')
    expect(result.annotations).toHaveLength(1)
    // Mon-Wed: first day still partial at 5, last (Wed) becomes full
    expect(result.annotations[0]).toMatchObject({
      startDate: '2026-01-12',
      endDate: '2026-01-14',
      hours: [5, 'full'],
    })
  })

  it('removing middle of [first, last] tuple preserves both partials', () => {
    const ann: TimeOffAnnotation = {
      type: 'timeoff',
      startDate: '2026-01-12',
      endDate: '2026-01-16',
      hours: [3, 2],
    }
    const data = makeData({ annotations: [ann] })
    // Remove Wed-Thu (Jan 14-15)
    const result = removeRangeAnnotation(data, ann, '2026-01-14', '2026-01-15', 'split')
    expect(result.annotations).toHaveLength(2)
    const sorted = [...result.annotations].sort((a, b) => {
      const aDate = a.type === 'payday' ? a.date : a.startDate
      const bDate = b.type === 'payday' ? b.date : b.startDate
      return aDate.localeCompare(bDate)
    })
    // Mon-Tue: first day 3hrs, Tue is full → tuple [3, 'full']
    expect(sorted[0]).toMatchObject({
      startDate: '2026-01-12',
      endDate: '2026-01-13',
      hours: [3, 'full'],
    })
    // Fri: single day at 2hrs (was the original last day)
    expect(sorted[1]).toMatchObject({ startDate: '2026-01-16', endDate: '2026-01-16', hours: 2 })
  })
})
