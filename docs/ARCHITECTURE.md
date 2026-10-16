# Architecture

Describes what is built. The target design is in [BLUEPRINT.md](BLUEPRINT.md).

## Shape

```
apps/mobile (Expo) ──HTTP/JSON──▶ apps/api (Express) ──▶ PostgreSQL
        └──────── both import ────────▶ packages/shared (types only)
```

## API (`apps/api/src`)

- `server.ts`: entry point. Loads `.env`, validates config, connects to the DB, starts HTTP, handles SIGINT/SIGTERM shutdown. Starts even if the DB is down (`/health` then says `degraded`).
- `app.ts`: `createApp(deps)` builds the Express app. Dependencies are passed in, so tests use fakes.
- `config/env.ts`: zod schema for environment variables. Invalid config = refuses to boot.
- `platform/`: shared plumbing, no business logic.
  - `logger.ts`: JSON logs to stdout.
  - `http/request-context.ts`: request ID per request (`x-request-id`), one log line per request. Request bodies are never logged (health data).
  - `http/errors.ts`: `AppError`, 404 handler, and the single error handler. Every error response has the shape `{ error: { code, message, requestId } }`. 500s never leak internals.
  - `db/`: Drizzle + `pg` client, migration runner.
- `platform/http/auth.ts`: access tokens (JWT) and the `requireAuth` / `requireRole` guards. `validate.ts` turns zod failures into field errors; `rate-limit.ts` is an in-memory limiter.
- `app.ts` composes the modules. It builds repositories from the DB and gives the auth service an `inTransaction` that rebinds them to one transaction.
- `app.ts` also passes a clock (`now`) to every booking rule; tests fix it at a known date.
- `seed.ts`: demo accounts, the 16 demo doctors and their hours (`seed-doctors.ts`), and the demo pharmacy with 26 generic medicines (`seed-medicines.ts`).
- `modules/`: one folder per business module: `health`, `users` (table + repository), `auth` (register, login, refresh, logout, reset, change password; `ResetCodeDelivery` is where SMS plugs in), `audit` (append-only `record()`), `discovery` (read-only doctor directory over `users` + `doctor_profiles`: search, filters, sort, paging, availability filter), `scheduling` (weekly rules, days off, `slots.ts` computes free slots, `slot-service.ts`), `appointments` (book with idempotency, list, cancel), `consultations` (join window, lifecycle, chat, long-poll `updates`, presence, the minute-by-minute sweep; `video.ts` is the `VideoProvider` port with the `fake` provider; `notifier.ts` wakes waiting long polls), `pharmacy` (pharmacies, medicine catalog search), `prescriptions` (draft, save, issue, void/revise, views; posts the chat card through the consultation service). Appointments ask scheduling whether a time is a real slot; scheduling gets booked times from appointments through a function passed in `app.ts`, so neither imports the other. Modules will not import each other's internals (lint rule added in Phase 2 once there are two modules).

## Mobile (`apps/mobile/src`)

- `app/`: expo-router screens. `_layout.tsx` wraps the app in the query cache, exports the crash fallback (`ErrorBoundary`), and uses `Stack.Protected`, so logged-out users reach only `(auth)/` and each role reaches only its own tabs.
  - `patient/`: five tabs, each its own stack so later phases can push screens: `home/`, `doctors/`, `appointments/` (Upcoming / Past), `medicines/` (Prescriptions / Catalog / Cart / Orders, decision D6), `profile/` (view, `edit`, `about`). Cross-tab jumps go by URL (`router.navigate('/patient/doctors')`), never by importing another tab's screen. `doctors/` has the search list (`index`) and a doctor's profile (`[id]`).
  - `patient/doctors/` also holds the booking flow: `slots` (pick a day and time) → `review` (confirm, one idempotency key per visit) → `booked` (replaces review, so Back can't resubmit). `patient/appointments/` has the lists and `[id]` detail with cancel.
  - `consultation/[appointmentId]`: the room, full screen outside the tabs (waiting room, video panel, chat, doctor Start/End). Reached from Join buttons on Home and the booking page, which appear only inside the join window.
  - `prescription/[consultationId]`: the doctor's composer (catalog search or free text, dose/frequency/days chips with auto quantity, save, issue with confirmation, withdraw/correct). Reached from the room or a finished booking.
  - `patient/medicines/` lists prescriptions; `prescription/[id]` shows one in plain words with morning/night pictures.
  - `doctor/`: `today/`, `appointments/` (both open `[id]` detail with cancel-with-reason), `availability/` (weekly blocks + days off), `profile`.
  - `pharmacy/`: placeholder tabs until Phase 8.
  - `index.tsx` redirects to the right place; `change-password.tsx` is a modal for every role.
- `features/`: pieces shared by routes: `account/` (profile queries, formatting, privacy notice, staff profile), `shell/` (tab icons and options, placeholders), `doctors/` (search and detail queries, card, formatting), `appointments/` (queries, card, list, detail, IST formatting), `availability/` (block editor mapping, queries), `consultation/` (room hook with the long-poll loop and outbox, chat incl. the prescription card, video panel, Join button), `prescriptions/` (queries, dose card with times-of-day pictures, list card, read-only view).
- `ui/`: design tokens (`theme.ts`) and components: `Screen` (includes the offline banner), `AppText`, `Button`, `Card`, `TextField`, `Checkbox`, `Chip`, `SegmentedControl`, `Banner`, and the §18 state set `Skeleton`, `EmptyState`, `ErrorState`, `OfflineBanner`, `QueryState`.
- `lib/`: `config.ts` finds the API URL. `api-client.ts` wraps fetch with a timeout, typed failures (`offline`, `timeout`, `http`) and one silent refresh-and-retry. `session.ts` holds login state: refresh token in secure storage, access token in memory, one shared refresh, and it stays signed in when offline. `api.ts` wires them together; `errors.ts` turns failures into user-facing text. `query.ts` is the TanStack Query cache: retries only offline/timeout/5xx, pauses offline and refetches on reconnect or app resume, cleared on logout. Only queries whose key starts with `doctors` (public directory data) are also saved to disk (AsyncStorage, 7 days, reset on each app version), so the doctor list works offline; everything else stays in memory.

## Shared (`packages/shared`)

`ROLES`, `ERROR_CODES`, `ApiErrorBody` + guard, `HealthResponse`, auth request/response types, `normalizePhone`, `passwordProblem`. The contract between the app and the API; the two rule functions run on both sides.

## Video

Everything talks to the `VideoProvider` interface (`createRoom`, `issueJoinToken`, `endRoom`) on the server and one `VideoPanel` component in the app (blueprint §13.2). Today `VIDEO_PROVIDER` is `fake` (rooms and tokens, no media; the app says "Video demo mode") or `none` (chat-only). A real vendor (Agora, ZEGOCLOUD or LiveKit) is one more server adapter plus the vendor's client component inside `VideoPanel`, and it needs a native development build of the app, because Expo Go can't load native video code.
