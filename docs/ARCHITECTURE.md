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
- `modules/`: one folder per business module: `health`, `users` (table + repository), `auth` (register, login, refresh, logout, reset, change password; `ResetCodeDelivery` is where SMS plugs in), `audit` (append-only `record()`), `discovery` (read-only doctor directory over `users` + `doctor_profiles`: search, filters, sort, paging, availability filter), `scheduling` (weekly rules, days off, `slots.ts` computes free slots, `slot-service.ts`), `appointments` (book with idempotency, list, cancel), `consultations` (join window, lifecycle, chat, long-poll `updates`, presence, the minute-by-minute sweep; `video.ts` is the `VideoProvider` port with the `fake` provider; `notifier.ts` wakes waiting long polls), `pharmacy` (pharmacies, medicine catalog search), `prescriptions` (draft, save, issue, void/revise, views; posts the chat card through the consultation service), `orders` (order creation from prescriptions, transactional stock reservation & release, Crockford Base32 tracking IDs, order status state machine & history timeline), `speech` (text-to-speech proxy to the self-hosted Chatterbox TTS service; the app never calls Chatterbox directly), `voice` (`POST /v1/voice/intent`: interprets a spoken phrase into a typed `VoiceIntent` via the shared rule-based parser — interpret-only, it never books/orders/cancels). Appointments ask scheduling whether a time is a real slot; scheduling gets booked times from appointments through a function passed in `app.ts`, so neither imports the other. Modules will not import each other's internals (lint rule added in Phase 2 once there are two modules).

## Mobile (`apps/mobile/src`)

- `app/`: expo-router screens. `_layout.tsx` wraps the app in the query cache, exports the crash fallback (`ErrorBoundary`), and uses `Stack.Protected`, so logged-out users reach only `(auth)/` and each role reaches only its own tabs.
  - `patient/`: five tabs, each its own stack so later phases can push screens: `home/`, `doctors/`, `appointments/` (Upcoming / Past), `medicines/` (Prescriptions / Catalog / Cart / Orders, decision D6), `profile/` (view, `edit`, `about`). Cross-tab jumps go by URL (`router.navigate('/patient/doctors')`), never by importing another tab's screen. `doctors/` has the search list (`index`) and a doctor's profile (`[id]`).
  - `patient/doctors/` also holds the booking flow: `slots` (pick a day and time) → `review` (confirm, one idempotency key per visit) → `booked` (replaces review, so Back can't resubmit). `patient/appointments/` has the lists and `[id]` detail with cancel.
  - `consultation/[appointmentId]`: the room, full screen outside the tabs (waiting room, video panel, chat, doctor Start/End). Reached from Join buttons on Home and the booking page, which appear only inside the join window.
  - `prescription/[consultationId]`: the doctor's composer (catalog search or free text, dose/frequency/days chips with auto quantity, save, issue with confirmation, withdraw/correct). Reached from the room or a finished booking.
  - `patient/medicines/`: `index.tsx` (segments for Prescriptions, searchable Catalog, and Orders), `prescription/[id]` (plain words, morning/night pictures, and "Order these medicines" button), `order-builder.tsx` (item quantities, delivery address, COD summary), `order/[id].tsx` (status timeline, tracking ID, cancellation).
  - `doctor/`: `today/`, `appointments/` (both open `[id]` detail with cancel-with-reason), `availability/` (weekly blocks + days off), `profile`.
  - `pharmacy/`: `orders.tsx` (status-segmented queue: All, Pending, Confirmed, Packed, Shipped, Delivered with fulfillment actions and cancellation), `inventory.tsx` (stock levels and catalog search), `profile.tsx`.
  - `index.tsx` redirects to the right place; `change-password.tsx` is a modal for every role.
- `features/`: pieces shared by routes: `account/` (profile queries, formatting, privacy notice, staff profile), `shell/` (tab icons and options, placeholders), `doctors/` (search and detail queries, card, formatting), `appointments/` (queries, card, list, detail, IST formatting), `availability/` (block editor mapping, queries), `consultation/` (room hook with the long-poll loop and outbox, chat incl. the prescription card, video panel, Join button), `prescriptions/` (queries, dose card with times-of-day pictures, list card, read-only view), `voice/` (voice navigation for low-literacy users: `speech-input.ts` is the `SpeechInput` port with the on-device `expo-speech-recognition` adapter, `intents.ts` the rule-based phrase→action parser, `speech-api.ts` the Chatterbox playback client, `VoiceNavOverlay.tsx` the always-on mic on the patient tabs).
- `ui/`: design tokens (`theme.ts`) and components: `Screen` (includes the offline banner), `AppText`, `Button`, `Card`, `TextField`, `Checkbox`, `Chip`, `SegmentedControl`, `Banner`, the §18 state set `Skeleton`, `EmptyState`, `ErrorState`, `OfflineBanner`, `QueryState`, and `MicButton` (large accessible voice control with idle/listening/thinking/speaking states, a listening pulse and a haptic tap).
- `lib/`: `config.ts` finds the API URL. `api-client.ts` wraps fetch with a timeout, typed failures (`offline`, `timeout`, `http`) and one silent refresh-and-retry. `session.ts` holds login state: refresh token in secure storage, access token in memory, one shared refresh, and it stays signed in when offline. `api.ts` wires them together; `errors.ts` turns failures into user-facing text. `query.ts` is the TanStack Query cache: retries only offline/timeout/5xx, pauses offline and refetches on reconnect or app resume, cleared on logout. Only queries whose key starts with `doctors` (public directory data) are also saved to disk (AsyncStorage, 7 days, reset on each app version), so the doctor list works offline; everything else stays in memory.

## Doctor network (Practo-ready)

Discovery talks to the `DoctorDirectoryProvider` port (`search`, `get`). `DOCTOR_PROVIDER` picks the adapter: `local` (default; the Postgres directory, unchanged) or `practo` (`discovery.practo.ts`, a stub that fails with a typed `503 SERVICE_UNAVAILABLE` until credentials exist — it never scrapes Practo or calls undocumented endpoints). Every doctor carries `source: 'local' | 'practo'` so the app can show where a booking goes.

To switch Practo on: a partner agreement with Practo, API credentials (added as new env vars, documented in `.env.example`), and a field mapping from their doctor/slot shape to `DoctorCard` / `DoctorDetail`. Booking and cancellation would route to the partner for `source: 'practo'` doctors while local bookings keep the existing Postgres path.

## Shared (`packages/shared`)

`ROLES`, `ERROR_CODES`, `ApiErrorBody` + guard, `HealthResponse`, auth request/response types, `normalizePhone`, `passwordProblem`. The contract between the app and the API; the two rule functions run on both sides.

## Video

Everything talks to the `VideoProvider` interface (`createRoom`, `issueJoinToken`, `endRoom`) on the server and one `VideoPanel` component in the app (blueprint §13.2). Today `VIDEO_PROVIDER` is `fake` (rooms and tokens, no media; the app says "Video demo mode") or `none` (chat-only). A real vendor (Agora, ZEGOCLOUD or LiveKit) is one more server adapter plus the vendor's client component inside `VideoPanel`, and it needs a native development build of the app, because Expo Go can't load native video code.

## Voice

The app is usable by voice alone, for low-literacy and rural users, in English/Hindi/Hinglish.

- **Speech in (STT):** `SpeechInput` port (`features/voice/speech-input.ts`). The default adapter is on-device `expo-speech-recognition` — free, offline, keeps health data on the phone — and needs a native dev build (Expo Go can't load it; see SETUP.md). A documented server-side slot (Sarvam AI / Bhashini) can replace the adapter for better Hinglish accuracy without touching callers; not built until a key exists.
- **Intent:** `parseVoiceIntent` (in `@telecare/shared`) is a pure, synchronous, rule-based parser (keyword lists, EN + Hindi/Hinglish) → a typed `VoiceIntent` from a fixed vocabulary. No LLM, so it runs the same on the phone (offline, instant) and on the server (`POST /v1/voice/intent`, the seam where a cloud/LLM parser can slot in later) and in tests. The mobile `intents.ts` maps a `VoiceIntent` to spoken copy + screen navigation. Voice only navigates: anything that books, orders, cancels or spends money happens on the destination screen behind that screen's own confirmation, so a misheard word can never spend money.
- **Emergency:** red-flag words ("chest pain", "saans nahi"…) are checked first and always win — the app does not navigate; it speaks a warning and shows large Call 108 / Call 112 buttons.
- **Speech out (TTS):** `speech-api.ts` plays audio from the API's `GET /v1/speech`, which proxies the self-hosted Chatterbox service. Navigation fires first and TTS is fire-and-forget, so the slow CPU voice never blocks the UI.
- **UI:** `VoiceNavOverlay` (always-on mic on the patient tabs) + the `MicButton` design-system component.
