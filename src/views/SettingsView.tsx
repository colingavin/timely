import { useRef, useState } from 'react'
import { useAppData } from '@/store/useAppData'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
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
import type { WorkSchedule } from '@/lib/types'

const DAYS: { key: keyof WorkSchedule; label: string }[] = [
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday', label: 'Fri' },
  { key: 'saturday', label: 'Sat' },
  { key: 'sunday', label: 'Sun' },
]

export function SettingsView() {
  const reserveHours = useAppData((s) => s.reserveHours)
  const workSchedule = useAppData((s) => s.workSchedule)
  const setReserveHours = useAppData((s) => s.setReserveHours)
  const setWorkSchedule = useAppData((s) => s.setWorkSchedule)
  const exportJSON = useAppData((s) => s.exportJSON)
  const importJSON = useAppData((s) => s.importJSON)
  const clearAll = useAppData((s) => s.clearAll)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [showImportConfirm, setShowImportConfirm] = useState(false)
  const [pendingImport, setPendingImport] = useState<string | null>(null)

  function handleExport() {
    const json = exportJSON()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `timely-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    setImportError(null)
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      try {
        const parsed = JSON.parse(text)
        if (parsed.version !== 1 || !Array.isArray(parsed.annotations)) {
          setImportError('Invalid backup file format.')
          return
        }
        setPendingImport(text)
        setShowImportConfirm(true)
      } catch {
        setImportError('File is not valid JSON.')
      }
    }
    reader.readAsText(file)
    // Reset the input so the same file can be selected again
    e.target.value = ''
  }

  function confirmImport() {
    if (pendingImport) {
      try {
        importJSON(pendingImport)
        setImportError(null)
      } catch {
        setImportError('Failed to import backup.')
      }
    }
    setPendingImport(null)
    setShowImportConfirm(false)
  }

  function handleScheduleChange(day: keyof WorkSchedule, value: string) {
    const hours = parseFloat(value)
    if (isNaN(hours) || hours < 0) return
    setWorkSchedule({ ...workSchedule, [day]: hours })
  }

  return (
    <div className="flex w-full flex-col gap-6 p-4 pb-8">
      <h1 className="text-xl font-semibold">Settings</h1>

      {/* Reserve PTO */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Reserve PTO</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Label htmlFor="reserve" className="shrink-0">
              Reserve (hrs)
            </Label>
            <Input
              id="reserve"
              type="number"
              min={0}
              step="any"
              defaultValue={reserveHours}
              onBlur={(e) => {
                const v = parseFloat(e.target.value)
                if (!isNaN(v) && v >= 0) setReserveHours(v)
              }}
              className="w-24"
            />
          </div>
          <p className="text-muted-foreground mt-2 text-sm">
            Dates where your projected PTO drops below this amount will be flagged.
          </p>
        </CardContent>
      </Card>

      {/* Work Schedule */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Work Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
            {DAYS.map(({ key, label }) => (
              <div key={key} className="contents">
                <Label htmlFor={`schedule-${key}`} className="text-sm">
                  {label}
                </Label>
                <Input
                  id={`schedule-${key}`}
                  type="number"
                  min={0}
                  step="any"
                  defaultValue={workSchedule[key]}
                  onBlur={(e) => handleScheduleChange(key, e.target.value)}
                  className="w-24"
                />
              </div>
            ))}
          </div>
          <p className="text-muted-foreground mt-2 text-sm">
            Hours scheduled per day. Used for full-day time off and accrual pro-rating.
          </p>
        </CardContent>
      </Card>

      <Separator />

      {/* Data Management */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Data</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button variant="outline" onClick={handleExport}>
            Download backup
          </Button>

          <div>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              Restore backup
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileSelect}
            />
            {importError && <p className="text-destructive mt-2 text-sm">{importError}</p>}
          </div>

          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="destructive" />}>
              Clear all data
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear all data?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all your annotations and settings. This action cannot
                  be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={clearAll}>Clear everything</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* Import confirmation dialog */}
      <AlertDialog open={showImportConfirm} onOpenChange={setShowImportConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore backup?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace all current data with the contents of the backup file. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingImport(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmImport}>Restore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
