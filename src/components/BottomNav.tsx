import { Calendar, List, Settings } from 'lucide-react'

export type Tab = 'calendar' | 'events' | 'settings'

interface BottomNavProps {
  active: Tab
  onChange: (tab: Tab) => void
}

const tabs: { id: Tab; label: string; icon: typeof Calendar }[] = [
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'events', label: 'Events', icon: List },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav className="border-border bg-background flex shrink-0 border-t pb-[env(safe-area-inset-bottom)]">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-xs transition-colors ${
            active === id ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <Icon className="h-5 w-5" />
          {label}
        </button>
      ))}
    </nav>
  )
}
