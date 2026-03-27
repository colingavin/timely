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

function useData(): AppData {
  const version = useAppData((s) => s.version)
  const reserveHours = useAppData((s) => s.reserveHours)
  const workSchedule = useAppData((s) => s.workSchedule)
  const annotations = useAppData((s) => s.annotations)
  return useMemo(
    () => ({ version, reserveHours, workSchedule, annotations }),
    [version, reserveHours, workSchedule, annotations],
  )
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export function MonthCalendar({ year, month, selectedDate, onSelectDate }: MonthCalendarProps) {
  const data = useData()
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const cells = useMemo(() => buildGrid(year, month), [year, month])

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
        {cells.map((cell) => (
          <DayCellView
            key={cell.date}
            cell={cell}
            data={data}
            today={today}
            isSelected={selectedDate === cell.date}
            onSelect={() => onSelectDate(cell.date)}
          />
        ))}
      </div>
    </div>
  )
}

interface DayCellViewProps {
  cell: DayCell
  data: AppData
  today: string
  isSelected: boolean
  onSelect: () => void
}

function DayCellView({ cell, data, today, isSelected, onSelect }: DayCellViewProps) {
  const resolved = useMemo(() => getAnnotationsForDate(data, cell.date), [data, cell.date])
  const balance = useMemo(() => getBalanceOnDate(data, cell.date), [data, cell.date])
  const belowReserve = balance !== null && balance < data.reserveHours

  const isToday = cell.date === today

  return (
    <button
      onClick={onSelect}
      className={`relative flex min-h-[44px] flex-col items-center justify-start gap-0.5 rounded-md py-1 text-sm transition-colors ${
        !cell.inMonth ? 'text-muted-foreground/40' : ''
      } ${isSelected ? 'bg-primary/10 ring-primary ring-1' : ''} ${
        belowReserve && cell.inMonth ? 'bg-destructive/10' : ''
      }`}
    >
      <span
        className={`text-xs leading-none ${
          isToday
            ? 'bg-primary text-primary-foreground inline-flex h-5 w-5 items-center justify-center rounded-full font-bold'
            : ''
        }`}
      >
        {cell.day}
      </span>

      {/* Annotation dots */}
      <div className="flex gap-0.5">
        {resolved.payday && (
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              resolved.payday.currentHours !== undefined
                ? 'bg-green-500'
                : 'border-green-500 border bg-transparent'
            }`}
          />
        )}
        {resolved.timeoff && (
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              cell.date <= today ? 'bg-orange-500' : 'bg-blue-400'
            }`}
          />
        )}
        {resolved.unpaid && <span className="bg-gray-400 h-1.5 w-1.5 rounded-full" />}
      </div>
    </button>
  )
}
