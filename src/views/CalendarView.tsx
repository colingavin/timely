import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MonthCalendar } from '@/components/MonthCalendar'
import { DayPanel } from '@/components/DayPanel'
import { AnnotationForm } from '@/components/AnnotationForm'
import { useAppData } from '@/store/useAppData'
import type { Annotation, PaydayAnnotation, TimeOffAnnotation, UnpaidAnnotation } from '@/lib/types'

const MONTHS_BEFORE = 12
const MONTHS_AFTER = 12
const TOTAL_MONTHS = MONTHS_BEFORE + 1 + MONTHS_AFTER // 25

interface MonthEntry {
  year: number
  month: number // 0-indexed
  key: string
}

function buildMonthList(): MonthEntry[] {
  const now = new Date()
  const entries: MonthEntry[] = []
  for (let i = -MONTHS_BEFORE; i <= MONTHS_AFTER; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    entries.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      key: `${d.getFullYear()}-${d.getMonth()}`,
    })
  }
  return entries
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function CalendarView() {
  const addAnnotation = useAppData((s) => s.addAnnotation)
  const updatePayday = useAppData((s) => s.updatePayday)
  const updateRange = useAppData((s) => s.updateRange)

  const months = useMemo(() => buildMonthList(), [])
  const scrollRef = useRef<HTMLDivElement>(null)
  const monthRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const [visibleMonth, setVisibleMonth] = useState(MONTHS_BEFORE)
  const visibleMonthRef = useRef(MONTHS_BEFORE)
  const [selectedDate, setSelectedDate] = useState<string | null>(
    new Date().toISOString().slice(0, 10),
  )
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<{ annotation: Annotation; date: string } | null>(
    null,
  )
  const [defaultPayday, setDefaultPayday] = useState<PaydayAnnotation | null>(null)

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  // Scroll to selected date's month whenever the calendar DOM appears
  // (on initial mount and when returning from the form)
  const [scrollKey, setScrollKey] = useState(0)
  const prevShowForm = useRef(showForm)
  useEffect(() => {
    if (prevShowForm.current && !showForm) {
      // Form just closed — trigger a scroll
      setScrollKey((k) => k + 1)
    }
    prevShowForm.current = showForm
  }, [showForm])

  useEffect(() => {
    // Small delay to let refs populate after conditional render
    requestAnimationFrame(() => {
      const target = selectedDate ?? today
      const d = new Date(target + 'T00:00:00')
      const idx = months.findIndex((m) => m.year === d.getFullYear() && m.month === d.getMonth())
      const key = idx !== -1 ? months[idx].key : months[MONTHS_BEFORE].key
      const el = monthRefs.current.get(key)
      if (el) {
        el.scrollIntoView({ block: 'start' })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey])

  // Track which month is visible via IntersectionObserver
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        let bestIdx = -1
        let bestRatio = 0
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
            const idx = months.findIndex((m) => m.key === entry.target.getAttribute('data-month'))
            if (idx !== -1) {
              bestIdx = idx
              bestRatio = entry.intersectionRatio
            }
          }
        }
        if (bestIdx !== -1) {
          setVisibleMonth(bestIdx)
          visibleMonthRef.current = bestIdx
        }
      },
      { root: container, threshold: [0.1, 0.3, 0.5, 0.7] },
    )

    for (const el of monthRefs.current.values()) {
      observer.observe(el)
    }

    return () => observer.disconnect()
  }, [months])

  const scrollToMonth = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(TOTAL_MONTHS - 1, idx))
      const el = monthRefs.current.get(months[clamped].key)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    },
    [months],
  )

  function handleToday() {
    scrollToMonth(MONTHS_BEFORE)
    setSelectedDate(today)
  }

  const handleSelectDate = useCallback(
    (date: string) => {
      setSelectedDate(date)
      // If the selected date is in a different month, scroll to it
      const d = new Date(date + 'T00:00:00')
      const idx = months.findIndex((m) => m.year === d.getFullYear() && m.month === d.getMonth())
      if (idx !== -1 && idx !== visibleMonth) {
        scrollToMonth(idx)
      }
    },
    [months, visibleMonth, scrollToMonth],
  )

  function handleSave(annotation: Annotation) {
    if (editTarget) {
      const original = editTarget.annotation
      if (original.type === 'payday' && annotation.type === 'payday') {
        updatePayday(annotation)
      } else if (original.type !== 'payday' && annotation.type !== 'payday') {
        updateRange(
          original as TimeOffAnnotation | UnpaidAnnotation,
          annotation as TimeOffAnnotation | UnpaidAnnotation,
          'replace',
        )
      }
    } else {
      addAnnotation(annotation)
    }
    setShowForm(false)
    setEditTarget(null)
  }

  function handleAddAnnotation(date: string) {
    setEditTarget(null)
    setSelectedDate(date)
    setShowForm(true)
  }

  function handleEditAnnotation(annotation: Annotation, date: string) {
    setEditTarget({ annotation, date })
    setShowForm(true)
  }

  function handleEditProjectedPayday(date: string, hoursAccrued: number) {
    setEditTarget(null)
    setDefaultPayday({ type: 'payday', date, hoursAccrued })
    setSelectedDate(date)
    setShowForm(true)
  }

  if (showForm) {
    return (
      <div className="w-full">
        <AnnotationForm
          defaultDate={editTarget?.date ?? selectedDate ?? today}
          editingAnnotation={editTarget?.annotation}
          defaultValues={defaultPayday ?? undefined}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false)
            setEditTarget(null)
            setDefaultPayday(null)
          }}
        />
      </div>
    )
  }

  const current = months[visibleMonth]

  return (
    <div className="flex h-full flex-col">
      {/* Fixed header */}
      <div className="border-border bg-background grid shrink-0 grid-cols-[auto_1fr_1fr_auto] items-center border-b px-2 py-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => scrollToMonth(visibleMonthRef.current - 1)}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <span className="text-right text-sm font-medium pr-2">
          {monthLabel(current.year, current.month)}
        </span>
        <div className="pl-2">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleToday}>
            Today
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => scrollToMonth(visibleMonthRef.current + 1)}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Scrollable month list */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {months.map((m) => (
          <div
            key={m.key}
            data-month={m.key}
            ref={(el) => {
              if (el) monthRefs.current.set(m.key, el)
            }}
          >
            <div className="text-muted-foreground px-3 pt-4 pb-1 text-xs font-medium">
              {monthLabel(m.year, m.month)}
            </div>
            <MonthCalendar
              year={m.year}
              month={m.month}
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
            />
          </div>
        ))}
      </div>

      {/* Day Panel */}
      {selectedDate && (
        <div
          className="border-border shrink-0 overflow-y-auto border-t"
          style={{ maxHeight: '40%' }}
        >
          <DayPanel
            date={selectedDate}
            onAddAnnotation={handleAddAnnotation}
            onEditAnnotation={handleEditAnnotation}
            onEditProjectedPayday={handleEditProjectedPayday}
          />
        </div>
      )}
    </div>
  )
}
