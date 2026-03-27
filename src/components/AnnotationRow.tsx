import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import type { Annotation, RangeEditMode } from '@/lib/types'

interface AnnotationRowProps {
  annotation: Annotation
  date: string
  onEdit: () => void
  onDelete: (mode: RangeEditMode) => void
}

function daysBetweenInclusive(start: string, end: string): number {
  const ms = new Date(end + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()
  return Math.round(ms / 86_400_000) + 1
}

function isMultiDayRange(annotation: Annotation): boolean {
  return annotation.type !== 'payday' && annotation.startDate !== annotation.endDate
}

function summarize(annotation: Annotation, date: string): string {
  switch (annotation.type) {
    case 'payday': {
      const accrual = `+${annotation.hoursAccrued} hrs accrued`
      if (annotation.currentHours !== undefined) {
        return `Pay-day · ${accrual} (balance: ${annotation.currentHours} hrs)`
      }
      return `Pay-day · ${accrual}`
    }
    case 'timeoff': {
      const today = new Date().toISOString().slice(0, 10)
      const status = date <= today ? 'taken' : 'planned'
      if (annotation.hours === 'full') {
        const days = daysBetweenInclusive(annotation.startDate, annotation.endDate)
        if (days > 1) return `Time Off · ${days} days, full day (${status})`
        return `Time Off · Full day (${status})`
      }
      return `Time Off · ${annotation.hours} hrs (${status})`
    }
    case 'unpaid': {
      const days = daysBetweenInclusive(annotation.startDate, annotation.endDate)
      return `Unpaid · ${days} day${days !== 1 ? 's' : ''}`
    }
  }
}

function formatShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function AnnotationRow({ annotation, date, onEdit, onDelete }: AnnotationRowProps) {
  const summary = summarize(annotation, date)
  const multiDay = isMultiDayRange(annotation)

  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="flex-1 text-sm">{summary}</span>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
        <Pencil className="h-4 w-4" />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
          <Trash2 className="text-destructive h-4 w-4" />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete annotation?</AlertDialogTitle>
            <AlertDialogDescription>
              {multiDay
                ? `This ${annotation.type === 'timeoff' ? 'time off' : 'unpaid'} annotation spans ${formatShort((annotation as { startDate: string }).startDate)} – ${formatShort((annotation as { endDate: string }).endDate)}. Delete just this day or the entire range?`
                : `This will remove this ${annotation.type === 'payday' ? 'pay-day' : annotation.type === 'timeoff' ? 'time off' : 'unpaid'} annotation.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {multiDay ? (
              <>
                <AlertDialogAction variant="outline" onClick={() => onDelete('split')}>
                  Just this day
                </AlertDialogAction>
                <AlertDialogAction onClick={() => onDelete('replace')}>
                  Entire range
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction onClick={() => onDelete('replace')}>Delete</AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
