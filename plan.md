# Timely — Implementation Plan

## Phase 1: Project Scaffold

- [x] Initialise Vite + React + TypeScript project (`npm create vite@latest`)
- [x] Configure TypeScript strict mode in `tsconfig.json`
- [x] Install and configure Tailwind CSS
- [x] Install and initialise shadcn/ui (`npx shadcn@latest init`)
- [x] Install Vitest and configure `vite.config.ts` for unit tests
- [x] Install Zustand
- [x] Add `index.html` viewport meta tag for mobile layout
- [x] Verify dev server, build, and test runner all work with a hello-world component

---

## Phase 2: Data Types

- [x] Define `WorkSchedule`, `PaydayAnnotation`, `TimeOffAnnotation`, `UnpaidAnnotation`, `Annotation`, and `AppData` types in `src/lib/types.ts`
- [x] Define `ResolvedDayAnnotations` type (expanded annotations for a single date, used as the return type of `getAnnotationsForDate`)
- [x] Define `RangeEditMode` type (`'replace' | 'split'`)
- [x] Export all types from a barrel `src/lib/index.ts` — skipped; types exported directly from `src/lib/types.ts`

---

## Phase 3: Business Logic

All functions implemented in `src/lib/pto.ts` as pure functions. Tests in `src/lib/pto.test.ts`.

### 3.1 Work Schedule Helpers

- [x] `getScheduledHours(schedule, date)` — returns scheduled hours for the weekday of `date`
- [x] `getScheduledHoursInRange(schedule, start, end)` — sum of scheduled hours over a date range
- [x] Tests: hours vary by weekday; non-work days return 0; multi-week ranges sum correctly

### 3.2 Annotation Queries

- [x] `getAnnotationsForDate(data, date)` — returns all annotations (expanding ranges) that apply to a date
- [x] `getAnnotatedDatesInRange(data, start, end)` — returns sorted list of dates with at least one annotation
- [x] Tests: single-day, multi-day ranges, date on boundary, date outside all ranges

### 3.3 Balance Computation

- [x] `getBalanceOnDate(data, date)` — implements the §2.5 algorithm:
  - Find most recent anchoring Pay-day on or before `date`
  - Walk forward day by day, applying Pay-day accrual (before same-day Time Off), Time Off deductions, and tracking unpaid hours
  - Apply auto-accrual every 14 days with hours-based pro-ration formula
  - Return `null` if no anchoring Pay-day exists
- [x] `getBalanceRange(data, start, end)` — calls `getBalanceOnDate` efficiently across a range (single forward pass)
- [x] Tests:
  - [x] Balance from a Pay-day anchor with `currentHours`
  - [x] Accrual-only Pay-day (no `currentHours`)
  - [x] Multiple pay periods with auto-accrual every 14 days
  - [x] Pay-day accrual applied before same-day Time Off deduction
  - [x] Full-day Time Off uses work schedule hours for that weekday
  - [x] Partial-hours Time Off (single day)
  - [x] Unpaid days reduce accrual via scheduled-hours formula
  - [x] Unpaid day with zero scheduled hours has no effect on accrual
  - [x] No anchoring Pay-day → returns `null`
  - [x] Balance going negative
  - [x] `getBalanceRange` produces consistent results with repeated `getBalanceOnDate` calls

### 3.4 Reserve

- [x] `getDatesBelowReserve(data, start, end)` — returns dates where projected balance < `reserveHours`
- [x] Tests: reserve = 0, reserve > 0, dates straddling threshold

### 3.5 Mutations

- [x] `addAnnotation(data, annotation)` — appends to `annotations[]`; throws if a Pay-day already exists on that date
- [x] `updatePaydayAnnotation(data, updated)` — replaces the Pay-day matching `updated.date`
- [x] `removePaydayAnnotation(data, date)` — removes Pay-day with matching date
- [x] `updateRangeAnnotation(data, original, updated, rangeEdit)`:
  - `'replace'`: swap `original` for `updated` entirely
  - `'split'`: derive changed sub-range from diff of `original` and `updated`; keep unaffected remainder as one or two new annotations
- [x] `removeRangeAnnotation(data, annotation, removeStart, removeEnd, rangeEdit)`:
  - `'replace'`: remove the entire annotation
  - `'split'`: remove `[removeStart, removeEnd]` sub-range; retain prefix and/or suffix as separate annotations
- [x] Tests:
  - [x] `addAnnotation` throws on duplicate Pay-day date
  - [x] `updateRangeAnnotation 'replace'` replaces whole range
  - [x] `updateRangeAnnotation 'split'` produces 0, 1, or 2 remainder ranges correctly
  - [x] `removeRangeAnnotation 'replace'` removes entire range
  - [x] `removeRangeAnnotation 'split'` with interior sub-range produces two remainders
  - [x] `removeRangeAnnotation 'split'` with prefix/suffix sub-range produces one remainder

---

## Phase 4: State Store

- [x] Implement `src/store/useAppData.ts` Zustand store:
  - Holds `AppData`; initialises from `localStorage` (key `timely_data`); persists on every mutation
  - Default value: `{ version: 1, reserveHours: 0, workSchedule: { mon–fri: 8, sat–sun: 0 }, annotations: [] }`
  - Exposes mutation actions wrapping the business logic functions from Phase 3
  - Exposes `exportJSON()` (returns serialised `AppData`) and `importJSON(json)` (validates and replaces data)
- [x] Write a basic smoke test: store initialises with defaults; a mutation persists to localStorage and survives a store re-initialisation

---

## Phase 5: App Shell & Navigation

- [x] `BottomNav` — three-tab bar (Calendar, Events, Settings); highlights active tab; fixed to bottom of viewport
- [x] `App.tsx` — renders active view based on selected tab; passes `BottomNav` selected state
- [x] No router library needed; tab state held in local React state
- [x] Global layout: full-height flex column, scrollable view area, fixed bottom nav
- [x] Placeholder components for each view so the shell is immediately usable

---

## Phase 6: Settings View

- [x] `SettingsView`:
  - [x] Reserve PTO numeric input (saves on blur)
  - [x] Work schedule table — one row per day of week, hours input per row
  - [x] Export: triggers JSON file download
  - [x] Import: file picker → JSON validation → confirmation prompt → data replacement; inline error on invalid file
  - [x] Clear all data: confirmation dialog before wiping store

---

## Phase 7: Events View & Shared Components

### 7.1 Annotation Row

- [x] `AnnotationRow` — single row displaying one annotation with type label, summary text, edit and delete buttons
  - [x] Pay-day: "Pay-day · +X.X hrs accrued" or "Pay-day · +X.X hrs accrued (balance: Y.Y hrs)"
  - [x] Time Off: "Time Off · Full day (planned)" / "Time Off · X.X hrs (taken)" etc.
  - [x] Unpaid: "Unpaid · X days"
  - [x] Delete triggers confirmation dialog before calling `onDelete`; multi-day ranges prompt "Just this day" vs "Entire range"
  - [x] Edit calls `onEdit`

### 7.2 Day Panel

- [x] `DayPanel` — date heading, projected balance (red if below reserve, "—" if unknown), list of `AnnotationRow`s, Add annotation button
- [x] Handles empty state (no annotations yet)

### 7.3 Annotation Form

- [x] `AnnotationForm` — add/edit form component:
  - [x] Date picker (start); end date picker appears for `timeoff` / `unpaid`
  - [x] Annotation type selector (Time Off / Pay-day / Unpaid); locked in edit mode
  - [x] Type-specific fields: Time Off duration (full / partial — partial hidden for ranges); Pay-day hours + optional balance anchor toggle; Unpaid has no extra fields
  - [x] Validation per §6.2
  - [x] Save / Cancel actions
- [x] Range-split prompt dialog: "Just this day" vs "Entire range" — shown when deleting from a multi-day range

### 7.4 Events View

- [x] `EventsView` — scrollable list of annotated dates using `DayPanel` per date
- [x] Past/upcoming divider
- [x] Floating + button opens `AnnotationForm` with date picker defaulting to today
- [x] Empty state: "No events yet. Tap + to add one."

---

## Phase 8: Calendar View

### 8.1 Monthly Calendar

- [x] `MonthCalendar` — renders a single month grid (Sun–Sat, 7 columns)
  - [x] Day cells with day number and up to three annotation dots (green payday / blue-amber-orange timeoff / gray unpaid)
  - [x] Red tint/underline on days below reserve
  - [x] Today highlighted
  - [x] Out-of-month days muted; clicking one shifts the displayed month to include it
  - [x] `onSelectDate` callback prop

### 8.2 Calendar View

- [x] `CalendarView` — assembles scrollable multi-month list (±12 months), fixed header, `MonthCalendar` per month, `DayPanel` for selected date
- [x] Header: month/year label (updates as user scrolls), Today button, ← / → buttons
- [x] Today button scrolls to current month and selects today

---

## Phase 9: Polish & Edge Cases

- [ ] Mobile viewport QA at 390px width — no horizontal overflow on any view
- [ ] All touch targets verified ≥ 44px
- [ ] Empty states: calendar (no dots, no panel), events view
- [ ] Error states: import failure, invalid form input inline messages
- [ ] Confirm dialogs on all destructive actions (delete annotation, clear data, import overwrite)
- [ ] Verify `localStorage` quota handling (warn gracefully if storage is full)
- [ ] Cross-browser smoke test (Safari iOS, Chrome Android)
- [ ] Production build passes with no TypeScript errors (`tsc --noEmit`)
- [ ] All unit tests pass (`vitest run`)
