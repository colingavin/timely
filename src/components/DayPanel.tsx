import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AnnotationRow } from '@/components/AnnotationRow'
import { useAppData } from '@/store/useAppData'
import { getAnnotationsForDate, getBalanceOnDate } from '@/lib/pto'
import type { Annotation, AppData, RangeEditMode } from '@/lib/types'

interface DayPanelProps {
  date: string
  onAddAnnotation: (date: string) => void
  onEditAnnotation: (annotation: Annotation, date: string) => void
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
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

export function DayPanel({ date, onAddAnnotation, onEditAnnotation }: DayPanelProps) {
  const data = useData()
  const removePayday = useAppData((s) => s.removePayday)
  const removeRange = useAppData((s) => s.removeRange)

  const resolved = getAnnotationsForDate(data, date)
  const balance = getBalanceOnDate(data, date)
  const belowReserve = balance !== null && balance < data.reserveHours

  const annotations: Annotation[] = []
  if (resolved.payday) annotations.push(resolved.payday)
  if (resolved.timeoff) annotations.push(resolved.timeoff)
  if (resolved.unpaid) annotations.push(resolved.unpaid)

  function handleDelete(annotation: Annotation, mode: RangeEditMode) {
    if (annotation.type === 'payday') {
      removePayday(annotation.date)
    } else {
      removeRange(annotation, date, date, mode)
    }
  }

  return (
    <div className="flex flex-col gap-2 p-4">
      <h2 className="text-base font-medium">{formatDate(date)}</h2>
      <p
        className={`text-sm ${belowReserve ? 'text-destructive font-medium' : 'text-muted-foreground'}`}
      >
        Remaining PTO: {balance !== null ? `${balance} hrs` : '—'}
      </p>

      {annotations.length > 0 ? (
        <div className="flex flex-col">
          {annotations.map((ann, i) => (
            <AnnotationRow
              key={`${ann.type}-${i}`}
              annotation={ann}
              date={date}
              onEdit={() => onEditAnnotation(ann, date)}
              onDelete={(mode) => handleDelete(ann, mode)}
            />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground py-2 text-sm">No annotations</p>
      )}

      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onAddAnnotation(date)}
      >
        <Plus className="mr-1 h-4 w-4" />
        Add annotation
      </Button>
    </div>
  )
}
