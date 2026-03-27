# Timely — Implementation Plan

## Phase 1: Project Scaffold

- [ ] Initialise Vite + React + TypeScript project (`npm create vite@latest`)
- [ ] Configure TypeScript strict mode in `tsconfig.json`
- [ ] Install and configure Tailwind CSS
- [ ] Install and initialise shadcn/ui (`npx shadcn@latest init`)
- [ ] Install Vitest and configure `vite.config.ts` for unit tests
- [ ] Install Zustand
- [ ] Add `index.html` viewport meta tag for mobile layout
- [ ] Verify dev server, build, and test runner all work with a hello-world component

---

## Phase 2: Data Types

- [ ] Define `WorkSchedule`, `PaydayAnnotation`, `TimeOffAnnotation`, `UnpaidAnnotation`, `Annotation`, and `AppData` types in `src/lib/types.ts`
- [ ] Define `ResolvedDayAnnotations` type (expanded annotations for a single date, used as the return type of `getAnnotationsForDate`)
- [ ] Define `RangeEditMode` type (`'replace' | 'split'`)
- [ ] Export all types from a barrel `src/lib/index.ts`

---

## Phase 3: Business Logic

All functions implemented in `src/lib/pto.ts` as pure functions. Tests in `src/lib/pto.test.ts`.

### 3.1 Work Schedule Helpers
- [ ] `getScheduledHours(schedule, date)` — returns scheduled hours for the weekday of `date`
- [ ] `getScheduledHoursInRange(schedule, start, end)` — sum of scheduled hours over a date range
- [ ] Tests: hours vary by weekday; non-work days return 0; multi-week ranges sum correctly

### 3.2 Annotation Queries
- [ ] `getAnnotationsForDate(data, date)` — returns all annotations (expanding ranges) that apply to a date
- [ ] `getAnnotatedDatesInRange(data, start, end)` — returns sorted list of dates with at least one annotation
- [ ] Tests: single-day, multi-day ranges, date on boundary, date outside all ranges

### 3.3 Balance Computation
- [ ] `getBalanceOnDate(data, date)` — implements the §2.5 algorithm:
  - Find most recent anchoring Pay-day on or before `date`
  - Walk forward day by day, applying Pay-day accrual (before same-day Time Off), Time Off deductions, and tracking unpaid hours
  - Apply auto-accrual every 14 days with hours-based pro-ration formula
  - Return `null` if no anchoring Pay-day exists
- [ ] `getBalanceRange(data, start, end)` — calls `getBalanceOnDate` efficiently across a range (single forward pass)
- [ ] Tests:
  - [ ] Balance from a Pay-day anchor with `currentHours`
  - [ ] Accrual-only Pay-day (no `currentHours`)
  - [ ] Multiple pay periods with auto-accrual every 14 days
  - [ ] Pay-day accrual applied before same-day Time Off deduction
  - [ ] Full-day Time Off uses work schedule hours for that weekday
  - [ ] Partial-hours Time Off (single day)
  - [ ] Unpaid days reduce accrual via scheduled-hours formula
  - [ ] Unpaid day with zero scheduled hours has no effect on accrual
  - [ ] No anchoring Pay-day → returns `null`
  - [ ] Balance going negative
  - [ ] `getBalanceRange` produces consistent results with repeated `getBalanceOnDate` calls

### 3.4 Reserve
- [ ] `getDatesBelowReserve(data, start, end)` — returns dates where projected balance < `reserveHours`
- [ ] Tests: reserve = 0, reserve > 0, dates straddling threshold

### 3.5 Mutations
- [ ] `addAnnotation(data, annotation)` — appends to `annotations[]`; throws if a Pay-day already exists on that date
- [ ] `updatePaydayAnnotation(data, updated)` — replaces the Pay-day matching `updated.date`
- [ ] `removePaydayAnnotation(data, date)` — removes Pay-day with matching date
- [ ] `updateRangeAnnotation(data, original, updated, rangeEdit)`:
  - `'replace'`: swap `original` for `updated` entirely
  - `'split'`: derive changed sub-range from diff of `original` and `updated`; keep unaffected remainder as one or two new annotations
- [ ] `removeRangeAnnotation(data, annotation, removeStart, removeEnd, rangeEdit)`:
  - `'replace'`: remove the entire annotation
  - `'split'`: remove `[removeStart, removeEnd]` sub-range; retain prefix and/or suffix as separate annotations
- [ ] Tests:
  - [ ] `addAnnotation` throws on duplicate Pay-day date
  - [ ] `updateRangeAnnotation 'replace'` replaces whole range
  - [ ] `updateRangeAnnotation 'split'` produces 0, 1, or 2 remainder ranges correctly
  - [ ] `removeRangeAnnotation 'replace'` removes entire range
  - [ ] `removeRangeAnnotation 'split'` with interior sub-range produces two remainders
  - [ ] `removeRangeAnnotation 'split'` with prefix/suffix sub-range produces one remainder

---

## Phase 4: State Store

- [ ] Implement `src/store/useAppData.ts` Zustand store:
  - Holds `AppData`; initialises from `localStorage` (key `timely_data`); persists on every mutation
  - Default value: `{ version: 1, reserveHours: 0, workSchedule: { mon–fri: 8, sat–sun: 0 }, annotations: [] }`
  - Exposes mutation actions wrapping the business logic functions from Phase 3
  - Exposes `exportJSON()` (returns serialised `AppData`) and `importJSON(json)` (validates and replaces data)
- [ ] Write a basic smoke test: store initialises with defaults; a mutation persists to localStorage and survives a store re-initialisation

---

## Phase 5: Core Components

### 5.1 Bottom Navigation
- [ ] `BottomNav` — three-tab bar (Calendar, Events, Settings); highlights active tab; fixed to bottom of viewport

### 5.2 Monthly Calendar
- [ ] `MonthCalendar` — renders a single month grid (Sun–Sat, 7 columns)
  - [ ] Day cells with day number and up to three annotation dots (green payday / blue-amber-orange timeoff / gray unpaid)
  - [ ] Red tint/underline on days below reserve
  - [ ] Today highlighted
  - [ ] Out-of-month days muted; clicking one shifts the displayed month to include it
  - [ ] `onSelectDate` callback prop

### 5.3 Annotation Row
- [ ] `AnnotationRow` — single row displaying one annotation with type label, summary text, edit and delete buttons
  - [ ] Pay-day: "Pay-day · +X.X hrs accrued" or "Pay-day · +X.X hrs accrued (balance: Y.Y hrs)"
  - [ ] Time Off: "Time Off · Full day (planned)" / "Time Off · X.X hrs (taken)" etc.
  - [ ] Unpaid: "Unpaid · X days"
  - [ ] Delete triggers confirmation dialog before calling `onDelete`
  - [ ] Edit calls `onEdit`

### 5.4 Day Panel
- [ ] `DayPanel` — date heading, projected balance (red if below reserve, "—" if unknown), list of `AnnotationRow`s, Add annotation button
- [ ] Handles empty state (no annotations yet)

### 5.5 Annotation Form
- [ ] `AnnotationForm` — add/edit form component:
  - [ ] Date picker (start); end date picker appears for `timeoff` / `unpaid`
  - [ ] Annotation type selector (Time Off / Pay-day / Unpaid); locked in edit mode
  - [ ] Type-specific fields: Time Off duration (full / partial — partial hidden for ranges); Pay-day hours + optional balance anchor toggle; Unpaid has no extra fields
  - [ ] Validation per §6.2
  - [ ] Save / Cancel actions
- [ ] Range-split prompt dialog: "Update entire range" vs "Split range" — shown when an edit targets part of an existing range

---

## Phase 6: Views

### 6.1 Calendar View
- [ ] `CalendarView` — assembles scrollable multi-month list (±12 months), fixed header, `MonthCalendar` per month, `DayPanel` for selected date
- [ ] Header: month/year label (updates as user scrolls), Today button, ← / → buttons
- [ ] Scroll snaps or anchors to month boundaries; Today button scrolls to current month and selects today

### 6.2 Events View
- [ ] `EventsView` — scrollable list of annotated dates using `DayPanel` per date
- [ ] Past/upcoming divider
- [ ] Floating + button opens `AnnotationForm` modal with date picker defaulting to today
- [ ] Empty state: "No events yet. Tap + to add one."

### 6.3 Settings View
- [ ] `SettingsView`:
  - [ ] Reserve PTO numeric input (saves on blur)
  - [ ] Work schedule table — one row per day of week, hours input per row
  - [ ] Export: triggers JSON file download
  - [ ] Import: file picker → JSON validation → confirmation prompt → data replacement; inline error on invalid file
  - [ ] Clear all data: confirmation dialog before wiping store

---

## Phase 7: App Shell & Routing

- [ ] `App.tsx` — renders active view based on selected tab; passes `BottomNav` selected state
- [ ] No router library needed; tab state held in local React state or Zustand
- [ ] Global layout: full-height flex column, scrollable view area, fixed bottom nav

---

## Phase 8: Polish & Edge Cases

- [ ] Mobile viewport QA at 390px width — no horizontal overflow on any view
- [ ] All touch targets verified ≥ 44px
- [ ] Empty states: calendar (no dots, no panel), events view
- [ ] Error states: import failure, invalid form input inline messages
- [ ] Confirm dialogs on all destructive actions (delete annotation, clear data, import overwrite)
- [ ] Verify `localStorage` quota handling (warn gracefully if storage is full)
- [ ] Cross-browser smoke test (Safari iOS, Chrome Android)
- [ ] Production build passes with no TypeScript errors (`tsc --noEmit`)
- [ ] All unit tests pass (`vitest run`)
