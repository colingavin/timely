import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import type { Annotation, AnnotationType } from '@/lib/types'

interface AnnotationFormProps {
  defaultDate: string
  editingAnnotation?: Annotation | null
  onSave: (annotation: Annotation) => void
  onCancel: () => void
}

const TYPE_OPTIONS: { value: AnnotationType; label: string }[] = [
  { value: 'timeoff', label: 'Time Off' },
  { value: 'payday', label: 'Pay-day' },
  { value: 'unpaid', label: 'Unpaid' },
]

export function AnnotationForm({
  defaultDate,
  editingAnnotation,
  onSave,
  onCancel,
}: AnnotationFormProps) {
  const isEditing = !!editingAnnotation

  const [type, setType] = useState<AnnotationType>(editingAnnotation?.type ?? 'timeoff')

  // Date fields
  const defaultStart = editingAnnotation
    ? editingAnnotation.type === 'payday'
      ? editingAnnotation.date
      : editingAnnotation.startDate
    : defaultDate
  const defaultEnd =
    editingAnnotation && editingAnnotation.type !== 'payday'
      ? editingAnnotation.endDate
      : defaultStart

  const [startDate, setStartDate] = useState(defaultStart)
  const [endDate, setEndDate] = useState(defaultEnd)

  // Time Off fields
  const defaultDuration =
    editingAnnotation?.type === 'timeoff'
      ? editingAnnotation.hours === 'full'
        ? 'full'
        : 'partial'
      : 'full'
  const defaultPartialHours =
    editingAnnotation?.type === 'timeoff' && editingAnnotation.hours !== 'full'
      ? String(editingAnnotation.hours)
      : ''

  const [duration, setDuration] = useState<'full' | 'partial'>(defaultDuration)
  const [partialHours, setPartialHours] = useState(defaultPartialHours)

  // Pay-day fields
  const [hoursAccrued, setHoursAccrued] = useState(
    editingAnnotation?.type === 'payday' ? String(editingAnnotation.hoursAccrued) : '',
  )
  const [anchorEnabled, setAnchorEnabled] = useState(
    editingAnnotation?.type === 'payday' && editingAnnotation.currentHours !== undefined,
  )
  const [currentHours, setCurrentHours] = useState(
    editingAnnotation?.type === 'payday' && editingAnnotation.currentHours !== undefined
      ? String(editingAnnotation.currentHours)
      : '',
  )

  const [error, setError] = useState<string | null>(null)

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const annotation = validate()
    if (annotation) onSave(annotation)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
      <h2 className="text-base font-medium">{isEditing ? 'Edit Annotation' : 'Add Annotation'}</h2>

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
      {type === 'timeoff' && (
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
            {!isMultiDay && (
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="duration"
                  checked={duration === 'partial'}
                  onChange={() => setDuration('partial')}
                />
                Partial
              </label>
            )}
          </div>
          {duration === 'partial' && !isMultiDay && (
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
  )
}
