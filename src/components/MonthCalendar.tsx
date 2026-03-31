import { useMemo } from 'react'
import { useAppData } from '@/store/useAppData'
import { getAnnotationsForDate, getBalanceOnDate } from '@/lib/pto'
import type { AppData } from '@/lib/types'

interface MonthCalendarProps {
  year: number
  month: number // 0-indexed
  selectedDate: string | null
  onSelectDate: (date: string) => void
}

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface DayCell {
  date: string
  day: number
  inMonth: boolean
}

function buildGrid(year: number, month: number): DayCell[] {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: DayCell[] = []

  // Previous month fill
  const prevMonthDays = new Date(year, month, 0).getDate()
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevMonthDays - i
    const m = month === 0 ? 11 : month - 1
    const y = month === 0 ? year - 1 : year
    cells.push({ date: toDateStr(y, m, d), day: d, inMonth: false })
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: toDateStr(year, month, d), day: d, inMonth: true })
  }

  // Next month fill to complete 6 rows
  const remaining = 42 - cells.length
  for (let d = 1; d <= remaining; d++) {
    const m = month === 11 ? 0 : month + 1
    const y = month === 11 ? year + 1 : year
    cells.push({ date: toDateStr(y, m, d), day: d, inMonth: false })
  }

  return cells
}

type HighlightLevel = 'none' | 'yellow' | 'red'
type RunPosition = 'none' | 'solo' | 'start' | 'middle' | 'end'

interface CellInfo {
  cell: DayCell
  balance: number | null
  balanceChanged: boolean // balance differs from previous day
  highlight: HighlightLevel
  runPosition: RunPosition
  hasPayday: boolean
  hasTimeoff: boolean
  hasUnpaid: boolean
  paydayAnchored: boolean
  timeoffPast: boolean
}

function useData(): AppData {
  const version = useAppData((s) => s.version)
  const reserveHours = useAppData((s) => s.reserveHours)
  const yearlyAdditionalHours = useAppData((s) => s.yearlyAdditionalHours)
  const workSchedule = useAppData((s) => s.workSchedule)
  const annotations = useAppData((s) => s.annotations)
  return useMemo(
    () => ({ version, reserveHours, yearlyAdditionalHours, workSchedule, annotations }),
    [version, reserveHours, yearlyAdditionalHours, workSchedule, annotations],
  )
}

function computeCellInfos(cells: DayCell[], data: AppData, today: string): CellInfo[] {
  // Compute balances for all cells plus the day before the first cell
  const prevDate = addDays(cells[0].date, -1)
  const prevBalance = getBalanceOnDate(data, prevDate)

  const infos: CellInfo[] = []
  let lastBalance = prevBalance

  for (const cell of cells) {
    const balance = getBalanceOnDate(data, cell.date)
    const resolved = getAnnotationsForDate(data, cell.date)

    let highlight: HighlightLevel = 'none'
    if (cell.inMonth && balance !== null) {
      if (balance < 0) highlight = 'red'
      else if (balance < data.reserveHours) highlight = 'yellow'
    }

    const balanceChanged =
      cell.inMonth && balance !== null && (lastBalance === null || balance !== lastBalance)

    infos.push({
      cell,
      balance,
      balanceChanged,
      highlight,
      runPosition: 'none', // computed below
      hasPayday: !!resolved.payday,
      hasTimeoff: !!resolved.timeoff,
      hasUnpaid: !!resolved.unpaid,
      paydayAnchored: !!resolved.payday?.currentHours,
      timeoffPast: !!resolved.timeoff && cell.date <= today,
    })

    lastBalance = balance
  }

  // Compute run positions for highlighted cells within each row of 7
  for (let row = 0; row < 6; row++) {
    const start = row * 7
    for (let col = 0; col < 7; col++) {
      const i = start + col
      const info = infos[i]
      if (info.highlight === 'none') continue

      const prevHighlighted = col > 0 && infos[i - 1].highlight !== 'none'
      const nextHighlighted = col < 6 && infos[i + 1].highlight !== 'none'

      if (prevHighlighted && nextHighlighted) info.runPosition = 'middle'
      else if (prevHighlighted) info.runPosition = 'end'
      else if (nextHighlighted) info.runPosition = 'start'
      else info.runPosition = 'solo'
    }
  }

  return infos
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export function MonthCalendar({ year, month, selectedDate, onSelectDate }: MonthCalendarProps) {
  const data = useData()
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const cells = useMemo(() => buildGrid(year, month), [year, month])
  const cellInfos = useMemo(() => computeCellInfos(cells, data, today), [cells, data, today])

  return (
    <div className="w-full px-2">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 text-center">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-muted-foreground py-1 text-xs font-medium">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {cellInfos.map((info) => (
          <DayCellView
            key={info.cell.date}
            info={info}
            today={today}
            isSelected={selectedDate === info.cell.date}
            onSelect={() => onSelectDate(info.cell.date)}
          />
        ))}
      </div>
    </div>
  )
}

interface DayCellViewProps {
  info: CellInfo
  today: string
  isSelected: boolean
  onSelect: () => void
}

function roundingClass(pos: RunPosition): string {
  switch (pos) {
    case 'solo':
      return 'rounded-md'
    case 'start':
      return 'rounded-l-md'
    case 'end':
      return 'rounded-r-md'
    case 'middle':
      return ''
    case 'none':
      return 'rounded-md'
  }
}

function highlightClass(level: HighlightLevel): string {
  switch (level) {
    case 'yellow':
      return 'bg-yellow-100'
    case 'red':
      return 'bg-red-100'
    case 'none':
      return ''
  }
}

function formatBalance(balance: number): string {
  return balance % 1 === 0 ? String(balance) : balance.toFixed(1)
}

function DayCellView({ info, today, isSelected, onSelect }: DayCellViewProps) {
  const { cell, balance, balanceChanged, highlight, runPosition } = info
  const isToday = cell.date === today

  return (
    <button
      onClick={onSelect}
      className={`relative flex min-h-[44px] flex-col items-center justify-start gap-0.5 py-1 text-sm transition-colors ${
        !cell.inMonth ? 'text-muted-foreground/40' : ''
      } ${isSelected ? 'ring-primary ring-1 ring-inset rounded-md' : ''} ${
        highlight !== 'none' ? `${highlightClass(highlight)} ${roundingClass(runPosition)}` : ''
      }`}
    >
      <span
        className={`flex h-5 w-5 items-center justify-center text-xs leading-none ${
          isToday ? 'bg-primary text-primary-foreground rounded-full font-bold' : ''
        }`}
      >
        {cell.day}
      </span>

      {/* Annotation dots */}
      <div className="flex gap-0.5">
        {info.hasPayday && (
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              info.paydayAnchored ? 'bg-green-500' : 'border-green-500 border bg-transparent'
            }`}
          />
        )}
        {info.hasTimeoff && (
          <span
            className={`h-1.5 w-1.5 rounded-full ${info.timeoffPast ? 'bg-orange-500' : 'bg-blue-400'}`}
          />
        )}
        {info.hasUnpaid && <span className="bg-gray-400 h-1.5 w-1.5 rounded-full" />}
      </div>

      {/* Balance display: show on any day with payday/timeoff, or where balance changed */}
      {cell.inMonth &&
        balance !== null &&
        (balanceChanged || info.hasPayday || info.hasTimeoff) && (
          <span className="text-muted-foreground text-[9px] leading-none">
            {formatBalance(balance)}
          </span>
        )}
    </button>
  )
}
