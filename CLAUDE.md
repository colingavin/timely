# Timely

PTO accrual and usage tracker. Single-user, client-side only (localStorage). See `brief.md` for product overview, `spec.md` for full specification, `plan.md` for implementation progress.

## Tech Stack

- React + TypeScript (strict), Vite, Tailwind CSS v4, shadcn/ui
- State: Zustand with localStorage persistence
- Testing: Vitest

## Project Structure

- `src/lib/` — pure business logic (types, PTO calculations) + unit tests
- `src/store/` — Zustand store wrapping business logic + localStorage
- `src/components/` — reusable UI components (`ui/` = shadcn generated)
- `src/views/` — top-level view components (Calendar, Events, Settings)

## Commands

- `npm run dev` — start dev server
- `npm run build` — typecheck + production build
- `npm test` — run unit tests (vitest)
- `npm run lint` — eslint
- `npm run format` — prettier on all files

## Pre-commit Hooks (husky)

Runs automatically on `git commit`:

1. `tsc -b --noEmit` — full project typecheck
2. `lint-staged` — on staged files only:
   - `.ts/.tsx`: prettier + eslint
   - `.json/.css/.md`: prettier

To run manually: `npx tsc -b --noEmit && npx lint-staged`

## Conventions

- `@/` path alias maps to `src/`
- Business logic in `src/lib/` must be pure functions with no UI dependencies
- shadcn components go in `src/components/ui/` — eslint `react-refresh/only-export-components` is disabled there
