import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
} from '@/components/ui/alert-dialog'
import { useAppData } from '@/store/useAppData'
import { getAnnotationsForDate } from '@/lib/pto'
import type { Annotation, AnnotationType, AppData } from '@/lib/types'

interface AnnotationFormProps {
  defaultDate: string
  editingAnnotation?: Annotation | null
  /** Pre-populate fields without entering edit mode (e.g. for projected paydays) */
  defaultValues?: Annotation
  onSave: (annotation: Annotation) => void
  onCancel: () => void
}

const TYPE_OPTIONS: { value: AnnotationType; label: string }[] = [
  { value: 'timeoff', label: 'Time Off' },
  { value: 'payday', label: 'Pay-day' },
  { value: 'unpaid', label: 'Unpaid' },
]

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

export function AnnotationForm({
  defaultDate,
  editingAnnotation,
  defaultValues,
  onSave,
  onCancel,
}: AnnotationFormProps) {
  const data = useData()
  const isEditing = !!editingAnnotation

  // Use editingAnnotation for pre-population, falling back to defaultValues
  const prefill = editingAnnotation ?? defaultValues

  const [type, setType] = useState<AnnotationType>(prefill?.type ?? 'timeoff')

  // Date fields
  const defaultStart = prefill
    ? prefill.type === 'payday'
      ? prefill.date
      : prefill.startDate
    : defaultDate
  const defaultEnd = prefill && prefill.type !== 'payday' ? prefill.endDate : defaultStart

  const [startDate, setStartDate] = useState(defaultStart)
  const [endDate, setEndDate] = useState(defaultEnd)

  // Time Off fields
  // Single-day: duration is 'full' or 'partial' with partialHours
  // Multi-day: always full middle days; first/last can be overridden
  function initTimeOffState() {
    if (prefill?.type !== 'timeoff') {
      return {
        duration: 'full' as const,
        partialHours: '',
        firstPartial: false,
        firstHours: '',
        lastPartial: false,
        lastHours: '',
      }
    }
    const { hours } = prefill
    if (Array.isArray(hours)) {
      const [first, last] = hours
      return {
        duration: 'full' as const,
        partialHours: '',
        firstPartial: first !== 'full',
        firstHours: first === 'full' ? '' : String(first),
        lastPartial: last !== 'full',
        lastHours: last === 'full' ? '' : String(last),
      }
    }
    if (hours === 'full') {
      return {
        duration: 'full' as const,
        partialHours: '',
        firstPartial: false,
        firstHours: '',
        lastPartial: false,
        lastHours: '',
      }
    }
    return {
      duration: 'partial' as const,
      partialHours: String(hours),
      firstPartial: false,
      firstHours: '',
      lastPartial: false,
      lastHours: '',
    }
  }

  const initTO = initTimeOffState()
  const [duration, setDuration] = useState<'full' | 'partial'>(initTO.duration)
  const [partialHours, setPartialHours] = useState(initTO.partialHours)
  const [firstPartial, setFirstPartial] = useState(initTO.firstPartial)
  const [firstHours, setFirstHours] = useState(initTO.firstHours)
  const [lastPartial, setLastPartial] = useState(initTO.lastPartial)
  const [lastHours, setLastHours] = useState(initTO.lastHours)

  // Pay-day fields
  const [hoursAccrued, setHoursAccrued] = useState(
    prefill?.type === 'payday' ? String(prefill.hoursAccrued) : '',
  )
  const [anchorEnabled, setAnchorEnabled] = useState(
    prefill?.type === 'payday' && prefill.currentHours !== undefined,
  )
  const [currentHours, setCurrentHours] = useState(
    prefill?.type === 'payday' && prefill.currentHours !== undefined
      ? String(prefill.currentHours)
      : '',
  )

  const [error, setError] = useState<string | null>(null)
  const [pendingAnnotation, setPendingAnnotation] = useState<Annotation | null>(null)
  const [showReplaceDialog, setShowReplaceDialog] = useState(false)

  const isRange = type !== 'payday'
  const isMultiDay = isRange && startDate !== endDate

  function validate(): Annotation | null {
    setError(null)

    if (isRange && endDate < startDate) {
      setError('End date must be on or after start date.')
      return null
    }

    switch (type) {
      case 'timeoff': {
        if (!isMultiDay) {
          // Single day
          if (duration === 'partial') {
            const hrs = parseFloat(partialHours)
            if (isNaN(hrs) || hrs <= 0) {
              setError('Enter a positive number of hours.')
              return null
            }
            return { type: 'timeoff', startDate, endDate: startDate, hours: hrs }
          }
          return { type: 'timeoff', startDate, endDate, hours: 'full' }
        }
        // Multi-day: check first/last partial overrides
        if (firstPartial || lastPartial) {
          let first: number | 'full' = 'full'
          let last: number | 'full' = 'full'
          if (firstPartial) {
            const hrs = parseFloat(firstHours)
            if (isNaN(hrs) || hrs <= 0) {
              setError('Enter positive hours for the first day.')
              return null
            }
            first = hrs
          }
          if (lastPartial) {
            const hrs = parseFloat(lastHours)
            if (isNaN(hrs) || hrs <= 0) {
              setError('Enter positive hours for the last day.')
              return null
            }
            last = hrs
          }
          return { type: 'timeoff', startDate, endDate, hours: [first, last] }
        }
        return { type: 'timeoff', startDate, endDate, hours: 'full' }
      }
      case 'payday': {
        const accrued = parseFloat(hoursAccrued)
        if (isNaN(accrued) || accrued < 0) {
          setError('Enter hours accrued (>= 0).')
          return null
        }
        const ann: Annotation = { type: 'payday', date: startDate, hoursAccrued: accrued }
        if (anchorEnabled) {
          const cur = parseFloat(currentHours)
          if (isNaN(cur) || cur < 0) {
            setError('Enter current balance (>= 0).')
            return null
          }
          ;(ann as { currentHours: number }).currentHours = cur
        }
        return ann
      }
      case 'unpaid': {
        return { type: 'unpaid', startDate, endDate }
      }
    }
  }

  function checkForConflict(annotation: Annotation): boolean {
    if (isEditing) return false // editing doesn't conflict with itself

    const dateToCheck = annotation.type === 'payday' ? annotation.date : annotation.startDate
    const resolved = getAnnotationsForDate(data, dateToCheck)

    if (annotation.type === 'payday' && resolved.payday) return true
    if (annotation.type === 'timeoff' && resolved.timeoff) return true
    if (annotation.type === 'unpaid' && resolved.unpaid) return true

    return false
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const annotation = validate()
    if (!annotation) return

    if (checkForConflict(annotation)) {
      setPendingAnnotation(annotation)
      setShowReplaceDialog(true)
    } else {
      onSave(annotation)
    }
  }

  function confirmReplace() {
    if (pendingAnnotation) onSave(pendingAnnotation)
    setPendingAnnotation(null)
    setShowReplaceDialog(false)
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
        <h2 className="text-base font-medium">{isEditing ? 'Edit Event' : 'Add Event'}</h2>

        {/* Annotation Type */}
        <div className="flex flex-col gap-1.5">
          <Label>Type</Label>
          <div className="flex gap-1">
            {TYPE_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                type="button"
                variant={type === opt.value ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                disabled={isEditing}
                onClick={() => setType(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Date */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="start-date">{isRange ? 'Start Date' : 'Date'}</Label>
          <Input
            id="start-date"
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value)
              if (!isRange || endDate < e.target.value) setEndDate(e.target.value)
            }}
          />
        </div>

        {isRange && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="end-date">End Date</Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        )}

        {/* Type-specific fields */}
        {type === 'timeoff' && !isMultiDay && (
          <div className="flex flex-col gap-2">
            <Label>Duration</Label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="duration"
                  checked={duration === 'full'}
                  onChange={() => setDuration('full')}
                />
                Full day
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="duration"
                  checked={duration === 'partial'}
                  onChange={() => setDuration('partial')}
                />
                Partial
              </label>
            </div>
            {duration === 'partial' && (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  step="any"
                  placeholder="Hours"
                  value={partialHours}
                  onChange={(e) => setPartialHours(e.target.value)}
                  className="w-24"
                />
                <span className="text-muted-foreground text-sm">hrs</span>
              </div>
            )}
          </div>
        )}

        {type === 'timeoff' && isMultiDay && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={firstPartial}
                  onChange={(e) => setFirstPartial(e.target.checked)}
                />
                Partial first day
              </label>
              {firstPartial && (
                <div className="flex items-center gap-2 pl-6">
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    placeholder="Hours"
                    value={firstHours}
                    onChange={(e) => setFirstHours(e.target.value)}
                    className="w-24"
                  />
                  <span className="text-muted-foreground text-sm">hrs</span>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={lastPartial}
                  onChange={(e) => setLastPartial(e.target.checked)}
                />
                Partial last day
              </label>
              {lastPartial && (
                <div className="flex items-center gap-2 pl-6">
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    placeholder="Hours"
                    value={lastHours}
                    onChange={(e) => setLastHours(e.target.value)}
                    className="w-24"
                  />
                  <span className="text-muted-foreground text-sm">hrs</span>
                </div>
              )}
            </div>
          </div>
        )}

        {type === 'payday' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hours-accrued">Hours accrued this period</Label>
              <Input
                id="hours-accrued"
                type="number"
                min={0}
                step="any"
                placeholder="e.g. 4"
                value={hoursAccrued}
                onChange={(e) => setHoursAccrued(e.target.value)}
                className="w-32"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={anchorEnabled}
                  onChange={(e) => setAnchorEnabled(e.target.checked)}
                />
                Set current balance
              </label>
              {anchorEnabled && (
                <Input
                  type="number"
                  min={0}
                  step="any"
                  placeholder="Current PTO balance"
                  value={currentHours}
                  onChange={(e) => setCurrentHours(e.target.value)}
                  className="w-32"
                />
              )}
            </div>
          </div>
        )}

        {error && <p className="text-destructive text-sm">{error}</p>}

        <div className="flex gap-2">
          <Button type="submit" className="flex-1">
            Save
          </Button>
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>

      {/* Replace confirmation dialog */}
      <AlertDialog open={showReplaceDialog} onOpenChange={setShowReplaceDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace existing event?</AlertDialogTitle>
            <AlertDialogDescription>
              An event of this type already exists on this date. Saving will replace it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingAnnotation(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReplace}>Replace</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
