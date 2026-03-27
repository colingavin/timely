import { useState, useMemo, useRef, useEffect } from 'react'
import { Plus, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DayPanel } from '@/components/DayPanel'
import { AnnotationForm } from '@/components/AnnotationForm'
import { useAppData } from '@/store/useAppData'
import { getAnnotatedDatesInRange, getProjectedPaydays, getBalanceOnDate } from '@/lib/pto'
import type {
  Annotation,
  AppData,
  PaydayAnnotation,
  TimeOffAnnotation,
  UnpaidAnnotation,
} from '@/lib/types'

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

type EventEntry =
  | { kind: 'annotated'; date: string }
  | { kind: 'projected-payday'; date: string; hoursAccrued: number }

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatBalance(balance: number): string {
  if (balance % 1 === 0) return String(balance)
  return String(parseFloat(balance.toFixed(2)))
}

export function EventsView() {
  const data = useData()
  const addAnnotation = useAppData((s) => s.addAnnotation)
  const updatePayday = useAppData((s) => s.updatePayday)
  const updateRange = useAppData((s) => s.updateRange)

  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<{ annotation: Annotation; date: string } | null>(
    null,
  )
  const [formDate, setFormDate] = useState<string | null>(null)
  const [defaultPayday, setDefaultPayday] = useState<PaydayAnnotation | null>(null)
  const [scrollTarget, setScrollTarget] = useState<string | null>('today')

  const todayRef = useRef<HTMLDivElement>(null)
  const dateRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const today = new Date().toISOString().slice(0, 10)

  // Build combined event list: annotated dates + projected paydays
  const entries = useMemo(() => {
    const annotatedDates = getAnnotatedDatesInRange(data, '2000-01-01', '2099-12-31')
    const seen = new Set<string>()
    const entryMap = new Map<string, EventEntry>()

    for (const date of annotatedDates) {
      if (!seen.has(date)) {
        seen.add(date)
        entryMap.set(date, { kind: 'annotated', date })
      }
    }

    // Add projected paydays (only future ones, within 12 months)
    const futureEnd = new Date()
    futureEnd.setFullYear(futureEnd.getFullYear() + 1)
    const endStr = futureEnd.toISOString().slice(0, 10)
    const projected = getProjectedPaydays(data, today, endStr)
    for (const pp of projected) {
      if (!entryMap.has(pp.date)) {
        entryMap.set(pp.date, {
          kind: 'projected-payday',
          date: pp.date,
          hoursAccrued: pp.hoursAccrued,
        })
      }
    }

    return [...entryMap.values()].sort((a, b) => a.date.localeCompare(b.date))
  }, [data, today])

  const pastEntries = entries.filter((e) => e.date < today)
  const upcomingEntries = entries.filter((e) => e.date > today)

  // Scroll to target after render
  useEffect(() => {
    if (!scrollTarget) return

    requestAnimationFrame(() => {
      if (scrollTarget === 'today') {
        todayRef.current?.scrollIntoView({ block: 'start' })
      } else {
        const el = dateRefs.current.get(scrollTarget)
        el?.scrollIntoView({ block: 'start' })
      }
      setScrollTarget(null)
    })
  }, [scrollTarget])

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
    const savedDate = annotation.type === 'payday' ? annotation.date : annotation.startDate
    setScrollTarget(savedDate === today ? 'today' : savedDate)
    setShowForm(false)
    setEditTarget(null)
  }

  function handleEdit(annotation: Annotation, date: string) {
    setEditTarget({ annotation, date })
    setShowForm(true)
  }

  function handleAdd(date: string) {
    setEditTarget(null)
    setFormDate(date)
    setShowForm(true)
  }

  function handleEditProjectedPayday(date: string, hoursAccrued: number) {
    // Open form as a new event (not edit), pre-populated with projected values
    setEditTarget(null)
    setFormDate(date)
    setDefaultPayday({ type: 'payday', date, hoursAccrued })
    setShowForm(true)
  }

  if (showForm) {
    return (
      <div className="w-full">
        <AnnotationForm
          defaultDate={editTarget?.date ?? formDate ?? today}
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

  function renderEntry(entry: EventEntry) {
    if (entry.kind === 'annotated') {
      return (
        <DayPanel date={entry.date} onAddAnnotation={handleAdd} onEditAnnotation={handleEdit} />
      )
    }
    return (
      <ProjectedPaydayPanel
        date={entry.date}
        hoursAccrued={entry.hoursAccrued}
        data={data}
        onEdit={() => handleEditProjectedPayday(entry.date, entry.hoursAccrued)}
      />
    )
  }

  return (
    <div className="relative w-full pb-20">
      {pastEntries.length > 0 && (
        <>
          <div className="bg-muted/50 px-4 py-2">
            <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Past
            </span>
          </div>
          {pastEntries.map((entry) => (
            <div
              key={entry.date}
              ref={(el) => {
                if (el) dateRefs.current.set(entry.date, el)
              }}
              className="border-border border-b"
            >
              {renderEntry(entry)}
            </div>
          ))}
        </>
      )}

      {/* Today — always visible */}
      <div ref={todayRef}>
        <div className="bg-muted/50 px-4 py-2">
          <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Today
          </span>
        </div>
        <div
          ref={(el) => {
            if (el) dateRefs.current.set(today, el)
          }}
          className="border-border border-b"
        >
          <DayPanel date={today} onAddAnnotation={handleAdd} onEditAnnotation={handleEdit} />
        </div>
      </div>

      {upcomingEntries.length > 0 && (
        <>
          <div className="bg-muted/50 px-4 py-2">
            <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Upcoming
            </span>
          </div>
          {upcomingEntries.map((entry) => (
            <div
              key={entry.date}
              ref={(el) => {
                if (el) dateRefs.current.set(entry.date, el)
              }}
              className="border-border border-b"
            >
              {renderEntry(entry)}
            </div>
          ))}
        </>
      )}

      <AddButton
        onClick={() => {
          setEditTarget(null)
          setFormDate(today)
          setShowForm(true)
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Projected Payday Panel
// ---------------------------------------------------------------------------

interface ProjectedPaydayPanelProps {
  date: string
  hoursAccrued: number
  data: AppData
  onEdit: () => void
}

function ProjectedPaydayPanel({ date, hoursAccrued, data, onEdit }: ProjectedPaydayPanelProps) {
  const balance = getBalanceOnDate(data, date)
  const belowReserve = balance !== null && balance < data.reserveHours

  return (
    <div className="flex flex-col gap-2 p-4">
      <h2 className="text-base font-medium">{formatDate(date)}</h2>
      <p
        className={`text-sm ${belowReserve ? 'text-destructive font-medium' : 'text-muted-foreground'}`}
      >
        Remaining PTO: {balance !== null ? `${formatBalance(balance)} hrs` : '—'}
      </p>
      <div className="flex items-center gap-2 py-1.5">
        <span className="text-muted-foreground flex-1 text-sm italic">
          Projected pay-day · +{hoursAccrued} hrs accrued
        </span>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// FAB
// ---------------------------------------------------------------------------

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      size="icon"
      className="fixed right-4 bottom-20 z-10 h-14 w-14 rounded-full shadow-lg"
      onClick={onClick}
    >
      <Plus className="h-6 w-6" />
    </Button>
  )
}
