# Timely — Application Specification

## 1. Overview

Timely is a single-user, client-side web application for tracking PTO accrual and usage. It runs entirely in the browser as a static site with no backend. All data is persisted in the browser's local storage. The UI is mobile-first and vertically oriented.

---

## 2. Core Concepts

### 2.1 PTO Balance

The PTO balance is a running total of hours available. It is computed forward in time from a known starting point (an anchoring Pay-day annotation) by applying accruals and time-off deductions in chronological order.

### 2.2 Accrual

PTO accrues on a biweekly basis. Each pay period ends on a "Pay-day" date. The accrual rate (hours per pay period) is set on each Pay-day annotation and is assumed to remain constant until a subsequent Pay-day annotation changes it. There is no default accrual rate — the user must enter at least one Pay-day annotation for forward projection to work.

### 2.3 Work Schedule

The user is assumed to have a fixed weekly work schedule with a set number of hours on each work day.

### 2.4 Annotations

An annotation is a piece of data attached to a specific calendar date. Each date may carry **at most one** annotation of each type. The three annotation types are:

| Type         | Description                                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Pay-day**  | Marks the end of a pay period. Includes the hours accrued this period and establishes the accrual rate going forward. Optionally allows the user to anchor current accured time off. |
| **Time Off** | Marks a partial or full day of PTO usage. Can span a date range. Future dates are "planned"; past dates are "taken".                                                                 |
| **Unpaid**   | Marks a day (or range) as unpaid leave — no PTO is used, and PTO does not accrue on these days.                                                                                      |

### 2.5 Balance Computation Algorithm

Given the full set of annotations, the projected balance on any date D is computed as follows:

1. Find the most recent "Pay-day" annotation with `currentHours` set on or before D. That value is the starting balance B and its date is the starting date S.
2. Walk forward from S to D in chronological order, processing each calendar day:
   - If the day has a **Pay-day** annotation: if `currentHours` is set, replace B with that value; otherwise add `hoursAccrued` to B. Update the current accrual rate. Accrual is applied **before** any Time Off deduction on the same day.
   - If the day has a **Time Off** annotation: subtract the hours (based on work schedule for a full day, or the specified partial hours) from B.
   - If the day has an **Unpaid** annotation: add the scheduled hours for that day (from the work schedule) to a running unpaid-hours counter.
   - Every 14 days after the last **Pay-day** annotation, add the current accrual rate to B, pro-rated by scheduled hours: `hoursAccrued × (scheduledHoursInPeriod - unpaidHours) / scheduledHoursInPeriod`, where `scheduledHoursInPeriod` is the sum of scheduled hours across all days in the 14-day period. Reset the unpaid-hours counter.
3. The result is B, the projected balance on date D.

If no anchoring "Pay-day" annotation exists on or before D, the balance is unknown and displayed as "—".

### 2.6 Reserve

The user may configure a reserve amount (in hours). The reserve is a floor the user does not want their PTO balance to fall below. Dates where the projected balance would drop below the reserve are visually flagged.

---

## 3. Data Model

All data is stored as a single JSON object in `localStorage` under the key `timely_data`.

```ts
type AnnotationType = 'payday' | 'timeoff' | 'unpaid'

interface WorkSchedule {
  monday: number // scheduled work hours (0 = not a work day)
  tuesday: number
  wednesday: number
  thursday: number
  friday: number
  saturday: number
  sunday: number
}

interface PaydayAnnotation {
  type: 'payday'
  date: string // ISO 8601 date string (YYYY-MM-DD)
  hoursAccrued: number // Hours accrued this pay period (>= 0)
  currentHours?: number // Optional balance anchor: exact PTO balance as of this date (>= 0)
}

interface TimeOffAnnotation {
  type: 'timeoff'
  startDate: string // ISO 8601 date string (YYYY-MM-DD)
  endDate: string // ISO 8601 date string; equal to startDate for single day
  hours: number | 'full' // 'full' = scheduled hours per day from work schedule
  // number only valid when startDate === endDate (single day)
}

interface UnpaidAnnotation {
  type: 'unpaid'
  startDate: string
  endDate: string
}

type Annotation = PaydayAnnotation | TimeOffAnnotation | UnpaidAnnotation

interface AppData {
  version: 1
  reserveHours: number // default 0
  workSchedule: WorkSchedule // default: Mon–Fri 8hrs, Sat–Sun 0hrs
  annotations: Annotation[]
}
```

> **Implementation note:** All annotations are stored in a single flat array. `payday` annotations carry a single `date`; `timeoff` and `unpaid` carry a `startDate`/`endDate` range (equal for single-day entries). The business logic expands ranges and sorts by date at query time.

---

## 4. Business Logic Module

The business logic must be implemented in a separate module (e.g., `src/lib/pto.ts`) that is fully decoupled from the UI. It must have thorough unit tests.

### 4.1 Exported Functions

```ts
// Returns projected PTO balance on a given date, or null if unknown.
function getBalanceOnDate(data: AppData, date: string): number | null

// Returns a map of date -> projected balance for all dates in [start, end].
function getBalanceRange(data: AppData, start: string, end: string): Map<string, number | null>

// Returns all annotations (expanded) that apply to a given date.
function getAnnotationsForDate(data: AppData, date: string): ResolvedDayAnnotations

// Returns all dates in a range that have at least one annotation.
function getAnnotatedDatesInRange(data: AppData, start: string, end: string): string[]

// Returns all dates where projected balance < reserveHours.
function getDatesBelowReserve(data: AppData, start: string, end: string): string[]

// Returns scheduled work hours for a given date per the work schedule.
function getScheduledHours(schedule: WorkSchedule, date: string): number

// Adds a new annotation; returns updated AppData.
// Throws if a payday annotation already exists on that date (caller must remove first).
function addAnnotation(data: AppData, annotation: Annotation): AppData

// Updates an existing range annotation. `rangeEdit` controls behavior when the edit
// affects only part of a range: 'replace' replaces the whole range, 'split' splits it
// into two ranges leaving unaffected days intact.
function updateRangeAnnotation(
  data: AppData,
  original: TimeOffAnnotation | UnpaidAnnotation,
  updated: TimeOffAnnotation | UnpaidAnnotation,
  rangeEdit: 'replace' | 'split',
): AppData

// Updates an existing payday annotation in place; returns updated AppData.
function updatePaydayAnnotation(data: AppData, updated: PaydayAnnotation): AppData

// Removes a payday annotation by date; returns updated AppData.
function removePaydayAnnotation(data: AppData, date: string): AppData

// Removes a range annotation. `rangeEdit` controls behavior when only part of the range
// is being removed: 'replace' removes the entire range, 'split' removes only the
// specified sub-range and retains the remainder as one or two new ranges.
function removeRangeAnnotation(
  data: AppData,
  annotation: TimeOffAnnotation | UnpaidAnnotation,
  removeStart: string,
  removeEnd: string,
  rangeEdit: 'replace' | 'split',
): AppData
```

### 4.2 Unit Test Coverage Requirements

- Balance computation from a Pay-day anchor with `currentHours` set
- Balance computation across multiple pay periods (every-14-days accrual)
- Pro-rated accrual when Unpaid days fall within a pay period, using scheduled-hours formula
- Pay-day accrual applied before same-day Time Off deduction
- Time Off deduction — full day (uses work schedule hours per day) and partial hours (single day only)
- Work schedule: full day hours vary by day of week; non-work days contribute 0 hours
- Pay-day annotation without `currentHours` (accrual-only, no anchor reset)
- `removeRangeAnnotation` with `'replace'` removes the whole range
- `removeRangeAnnotation` with `'split'` correctly produces zero, one, or two remainder ranges
- `updateRangeAnnotation` with `'split'` leaves unaffected days intact
- Overlapping ranges (should be prevented at UI level but handled gracefully)
- Edge cases: no anchoring Pay-day annotation, future-only data, balance going negative
- Reserve threshold detection

---

## 5. Views

### 5.1 Navigation

The app has a bottom navigation bar with three tabs:

- **Calendar** (default)
- **Events**
- **Settings**

### 5.2 Calendar View

#### Layout

- A vertically scrollable page.
- A fixed header at the top shows the current month/year and navigation controls.
- Below the header is the monthly calendar grid. The user can scroll up and down to navigate months. The rendered range is ±12 months from the current month; scrolling beyond either boundary is not possible.
- When a date is selected, a **Day Panel** slides up from the bottom (or appears below the calendar) showing details for that date.

#### Calendar Grid

- Standard 7-column grid (Sun–Sat).
- Displays one month at a time.
- Each day cell shows:
  - The day number.
  - Up to three colored indicator dots, one per annotation type present on that day:
    - **Pay-day**: green (filled circle if anchored with `currentHours`, outline if accrual-only)
    - **Time Off**: blue (planned) / orange (taken, i.e., in the past)
    - **Unpaid**: gray
  - A red underline or tint if the projected balance on that date drops below the reserve.
- Days outside the current month are shown in a muted style. When selected the current month automatically adjusts to the month including that day.
- Today's date is visually distinguished (e.g., bold or circled).

#### Header Controls

- Month/year label in the center.
- **Today** button to jump to the current month and select today's date.
- **← / →** buttons as an alternative to scrolling for month navigation.

#### Day Panel

Shown when a date is selected. Contains:

1. **Date heading** — full date string (e.g., "Thursday, March 26, 2026").
2. **Projected balance** — "Remaining PTO: X.X hrs" (or "—" if unknown). Shown in red if below reserve.
3. **Annotation list** — one row per annotation on this date, each with:
   - Annotation type label and summary (e.g., "Pay-day · +4.0 hrs accrued (balance: 40.0 hrs)", "Pay-day · +4.0 hrs accrued", "Time Off · Full day (planned)", "Unpaid · 3 days").
   - Edit button (pencil icon).
   - Delete button (trash icon) with confirmation.
4. **Add annotation** button — opens the Add Annotation form for this date.

### 5.3 Events View

- A scrollable list of all dates that have at least one annotation, sorted chronologically.
- Each list item renders identically to the Day Panel in the Calendar view (date heading, projected balance, annotation rows with edit/delete controls).
- A floating **+** button in the bottom-right corner opens the Add Annotation modal for a user-specified date.
- Dates in the past are shown normally; a subtle divider or label separates past from upcoming events.

### 5.4 Settings View

- **Reserve PTO** — numeric input (hours). Label: "Reserve (hrs)". Saved on blur/change.
- **Work schedule** - table allowing the user to specify number of scheduled work hours for each day of the week
- **Export data** — "Download backup" button that triggers a JSON file download of the current `AppData`.
- **Import data** — "Restore backup" button that opens a file picker. On selection, the JSON is validated and, after a confirmation prompt, replaces the current data. Invalid files show an error message.
- **Clear all data** — destructive action behind a confirmation dialog.

---

## 6. Add / Edit Annotation Form

Used both inline (Day Panel "Add" button) and in a modal (Events view "+" button).

### 6.1 Fields

**Date / Date Range**

- Single date picker (default: the selected date or today).
- For `timeoff` and `unpaid`: a second date picker appears for the end date; by default the end date is the same as the start date.
- `payday` is always single-date.

**Annotation Type** — segmented control or select:

- Time Off (default)
- Pay-day
- Unpaid

**Type-specific fields:**

| Type     | Fields                                                                                                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Time Off | Duration: "Full day (scheduled hours)" for any range; or "Partial" + hours input for single-day entries only — the partial option is hidden when `endDate ≠ startDate` |
| Pay-day  | Hours accrued this period (number input, > 0); optional "Current balance" toggle + hours input (≥ 0) to anchor the running total                                       |
| Unpaid   | (no additional fields)                                                                                                                                                 |

### 6.2 Validation

- Required fields must be filled.
- Hours values must be non-negative numbers.
- End date must be ≥ start date for range annotations.
- If the date already has an annotation of the same type, warn the user that it will be replaced.

### 6.3 Submission

- "Save" button adds/updates the annotation in `AppData` and refreshes all derived state.
- "Cancel" closes the form without changes.
- In edit mode, the form is pre-populated with existing values. The annotation type cannot be changed.
- When an edit or delete affects only part of an existing range (e.g. the user changes the start date of a multi-day time-off block, or deletes a single day from within it), the app prompts: **"Update entire range"** vs **"Split range"**. "Update entire range" replaces the whole annotation; "Split range" modifies only the targeted portion and preserves the remainder as separate annotations.

---

## 7. Technology Stack

| Concern       | Choice                                       |
| ------------- | -------------------------------------------- |
| Language      | TypeScript (strict mode)                     |
| Framework     | React                                        |
| UI Components | shadcn/ui (built on Radix UI + Tailwind CSS) |
| Build tool    | Vite                                         |
| Testing       | Vitest                                       |
| Storage       | `localStorage`                               |
| Deployment    | Static site (no server)                      |

---

## 8. Project Structure

```
timely/
├── public/
├── src/
│   ├── lib/
│   │   ├── pto.ts          # Business logic (pure functions)
│   │   └── pto.test.ts     # Unit tests
│   ├── store/
│   │   └── useAppData.ts   # Zustand (or similar) store wrapping localStorage
│   ├── components/
│   │   ├── ui/             # shadcn generated components
│   │   ├── MonthCalendar.tsx
│   │   ├── DayPanel.tsx
│   │   ├── AnnotationRow.tsx
│   │   ├── AnnotationForm.tsx
│   │   └── BottomNav.tsx
│   ├── views/
│   │   ├── CalendarView.tsx
│   │   ├── EventsView.tsx
│   │   └── SettingsView.tsx
│   ├── App.tsx
│   └── main.tsx
├── index.html
├── vite.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

---

## 9. State Management

A single reactive store (e.g., Zustand) holds the `AppData` object. All mutations go through the store, which persists to `localStorage` after every change. Derived state (projected balances, annotated date sets) is computed on demand from the store — either via selectors or `useMemo` hooks — rather than being stored.

---

## 10. UX & Design Guidelines

- **Mobile-first:** target 390px viewport width; all touch targets ≥ 44px.
- **No horizontal scroll** on any view.
- **Color palette:** use shadcn/ui default theme; rely on semantic color tokens (primary, destructive, muted, etc.) so a future dark mode works without changes.
- **Annotation dot colors** defined as Tailwind classes: `bg-green-500` (payday anchored) / `border-green-500 border-2` outline (payday accrual-only), `bg-blue-400` (planned time off), `bg-orange-500` (taken time off), `bg-gray-400` (unpaid).
- **Empty states:** Calendar shows no dots; Events view shows "No events yet. Tap + to add one."
- **Error states:** Import failure, invalid hours input — show inline error text, never silent failure.
- **Confirmation dialogs:** Required before delete and before data import/clear.

---

## 11. Out of Scope

The following are explicitly out of scope for v1:

- Multi-user support or authentication
- Server-side storage or sync
- Push notifications or reminders
- Multiple PTO buckets (sick leave, vacation, etc.)
- Holiday calendars or automatic non-accrual days
- Recurring time-off entries
- Native mobile app packaging
