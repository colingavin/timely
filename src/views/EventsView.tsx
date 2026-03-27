import { useState, useMemo, useRef, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DayPanel } from '@/components/DayPanel'
import { AnnotationForm } from '@/components/AnnotationForm'
import { useAppData } from '@/store/useAppData'
import { getAnnotatedDatesInRange } from '@/lib/pto'
import type { Annotation, TimeOffAnnotation, UnpaidAnnotation } from '@/lib/types'

function useData() {
  const version = useAppData((s) => s.version)
  const reserveHours = useAppData((s) => s.reserveHours)
  const workSchedule = useAppData((s) => s.workSchedule)
  const annotations = useAppData((s) => s.annotations)
  return useMemo(
    () => ({ version, reserveHours, workSchedule, annotations }),
    [version, reserveHours, workSchedule, annotations],
  )
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
  const [scrollTarget, setScrollTarget] = useState<string | null>('today')

  const todayRef = useRef<HTMLDivElement>(null)
  const dateRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const today = new Date().toISOString().slice(0, 10)

  // Get all annotated dates in a wide range
  const allDates = useMemo(() => {
    const start = '2000-01-01'
    const end = '2099-12-31'
    return getAnnotatedDatesInRange(data, start, end)
  }, [data])

  const eventDates = useMemo(() => {
    const seen = new Set<string>()
    const result: string[] = []
    for (const date of allDates) {
      if (!seen.has(date)) {
        seen.add(date)
        result.push(date)
      }
    }
    return result
  }, [allDates])

  const pastDates = eventDates.filter((d) => d < today)
  const upcomingDates = eventDates.filter((d) => d > today)
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
    // Scroll to the date of the saved annotation
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

  if (showForm) {
    return (
      <div className="w-full">
        <AnnotationForm
          defaultDate={editTarget?.date ?? formDate ?? today}
          editingAnnotation={editTarget?.annotation}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false)
            setEditTarget(null)
          }}
        />
      </div>
    )
  }

  return (
    <div className="relative w-full pb-20">
      {pastDates.length > 0 && (
        <>
          <div className="bg-muted/50 px-4 py-2">
            <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Past
            </span>
          </div>
          {pastDates.map((date) => (
            <div
              key={date}
              ref={(el) => {
                if (el) dateRefs.current.set(date, el)
              }}
              className="border-border border-b"
            >
              <DayPanel date={date} onAddAnnotation={handleAdd} onEditAnnotation={handleEdit} />
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

      {upcomingDates.length > 0 && (
        <>
          <div className="bg-muted/50 px-4 py-2">
            <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Upcoming
            </span>
          </div>
          {upcomingDates.map((date) => (
            <div
              key={date}
              ref={(el) => {
                if (el) dateRefs.current.set(date, el)
              }}
              className="border-border border-b"
            >
              <DayPanel date={date} onAddAnnotation={handleAdd} onEditAnnotation={handleEdit} />
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
