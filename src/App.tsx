import { useState } from 'react'
import { BottomNav, type Tab } from '@/components/BottomNav'
import { CalendarView } from '@/views/CalendarView'
import { EventsView } from '@/views/EventsView'
import { SettingsView } from '@/views/SettingsView'

export default function App() {
  const [tab, setTab] = useState<Tab>('calendar')

  return (
    <div className="flex h-dvh flex-col">
      <main className="flex flex-1 overflow-y-auto">
        {tab === 'calendar' && <CalendarView />}
        {tab === 'events' && <EventsView />}
        {tab === 'settings' && <SettingsView />}
      </main>
      <BottomNav active={tab} onChange={setTab} />
    </div>
  )
}
