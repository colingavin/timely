import { useMemo } from 'react'
import { Plus, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AnnotationRow } from '@/components/AnnotationRow'
import { useAppData } from '@/store/useAppData'
import { getAnnotationsForDate, getBalanceOnDate, getProjectedPaydays } from '@/lib/pto'
import type { Annotation, AppData, RangeEditMode } from '@/lib/types'

interface DayPanelProps {
  date: string
  onAddAnnotation: (date: string) => void
  onEditAnnotation: (annotation: Annotation, date: string) => void
  /** Called when the user taps edit on a projected payday (not a real event) */
  onEditProjectedPayday?: (date: string, hoursAccrued: number) => void
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

export function DayPanel({
  date,
  onAddAnnotation,
  onEditAnnotation,
  onEditProjectedPayday,
}: DayPanelProps) {
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

  // Check if this date is a projected payday (no explicit payday, but auto-accrual falls here)
  const projectedPayday = useMemo(() => {
    if (resolved.payday) return null // already has an explicit payday
    const projected = getProjectedPaydays(data, date, date)
    return projected.length > 0 ? projected[0] : null
  }, [data, date, resolved.payday])

  function handleDelete(annotation: Annotation, mode: RangeEditMode) {
    if (annotation.type === 'payday') {
      removePayday(annotation.date)
    } else {
      removeRange(annotation, date, date, mode)
    }
  }

  const hasContent = annotations.length > 0 || projectedPayday

  return (
    <div className="flex flex-col gap-2 p-4">
      <h2 className="text-base font-medium">{formatDate(date)}</h2>
      <p
        className={`text-sm ${belowReserve ? 'text-destructive font-medium' : 'text-muted-foreground'}`}
      >
        Remaining APL:{' '}
        {balance !== null
          ? `${balance % 1 === 0 ? balance : parseFloat(balance.toFixed(2))} hrs`
          : '—'}
      </p>

      {hasContent ? (
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
          {projectedPayday && (
            <div className="flex items-center gap-2 py-1.5">
              <span className="text-muted-foreground flex-1 text-sm italic">
                Projected pay-day · +{projectedPayday.hoursAccrued} hrs accrued
              </span>
              {onEditProjectedPayday && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onEditProjectedPayday(date, projectedPayday.hoursAccrued)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground py-2 text-sm">No events</p>
      )}

      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onAddAnnotation(date)}
      >
        <Plus className="mr-1 h-4 w-4" />
        Add event
      </Button>
    </div>
  )
}
