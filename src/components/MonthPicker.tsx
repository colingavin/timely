import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface MonthEntry {
  year: number
  month: number // 0-indexed
  index: number
}

interface MonthPickerProps {
  months: { year: number; month: number; key: string }[]
  currentIndex: number
  onSelect: (index: number) => void
  children: React.ReactNode
}

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

export function MonthPicker({ months, currentIndex, onSelect, children }: MonthPickerProps) {
  const [open, setOpen] = useState(false)

  // Group months by year
  const byYear = new Map<number, MonthEntry[]>()
  for (let i = 0; i < months.length; i++) {
    const m = months[i]
    const entries = byYear.get(m.year) ?? []
    entries.push({ year: m.year, month: m.month, index: i })
    byYear.set(m.year, entries)
  }

  function handleSelect(index: number) {
    onSelect(index)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button className="cursor-pointer text-right text-sm font-medium pr-2 hover:text-primary transition-colors" />
        }
      >
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-64 max-h-[60dvh] overflow-y-auto p-3">
        {[...byYear.entries()].map(([year, entries]) => (
          <div key={year} className="mb-3 last:mb-0">
            <div className="text-muted-foreground mb-1.5 text-xs font-medium">{year}</div>
            <div className="grid grid-cols-4 gap-1">
              {entries.map((entry) => (
                <Button
                  key={entry.index}
                  variant={entry.index === currentIndex ? 'default' : 'ghost'}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => handleSelect(entry.index)}
                >
                  {SHORT_MONTHS[entry.month]}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  )
}
