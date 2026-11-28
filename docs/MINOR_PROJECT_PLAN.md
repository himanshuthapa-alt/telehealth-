# TeleCare+ — Build, Test & Demo Plan (Minor Project)

> Working branch: `sandbox/minor-project-demo` (local sandbox; `main` is untouched until the team merges).
> Team: Himanshu Thapa, Tanay Nagar, Vishnu Oberoi · Guide: Dr. Nutan Singh
> Companion docs: [BLUEPRINT.md](BLUEPRINT.md) (approved design), [TESTING.md](TESTING.md), [SETUP.md](SETUP.md).

---

## 1. What "done" means for the minor project

The project is ready to show when **all of these are true**:

1. The primary journey runs end-to-end on real devices with no developer help:
   **Register → find doctor → book → consult (video + chat) → prescription → order → pharmacy ships → patient tracks.**
2. A real doctor can sign up, be verified by an admin, set hours, and be booked (no seeded data needed).
3. The backend runs on a hosted server (no laptop needed); the APK installs from a file.
4. `npm run check` is green (format, lint, types, all automated tests).
5. Every case in §5 is either covered by an automated test or ticked in the manual E2E log (§6).
6. The demo script (§8) has been rehearsed twice on the hosted setup, with the fallback (§8.3) ready.

---

## 2. Requirements and their status

Legend: ✅ done and tested · 🟡 works with a known gap · ⬜ not built

| #   | Requirement (blueprint §)                                                      | Status | Evidence                                                                  |
| --- | ------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------- |
| R1  | Phone + password auth, 4 roles, refresh rotation, reset (§12, §16)             | ✅     | `apps/api/test/auth.test.ts`, mobile `session.test.ts`                    |
| R2  | Patient shell: 5 tabs, empty/offline/error states (§4, §18)                    | ✅     | `patient-tabs.test.tsx`, `QueryState.test.tsx`                            |
| R3  | Doctor discovery: search, filters, sorts, paging, offline cache                | ✅     | `discovery.test.ts`, `doctors.test.tsx`                                   |
| R4  | **Doctor self-registration + admin verification** (new)                        | ✅     | `doctor-verification.test.ts`; manual E2E-02..05                          |
| R5  | Real doctors listed above demo doctors; unverified never bookable              | ✅     | `doctor-verification.test.ts`; E2E-08                                     |
| R6  | Doctor dashboard: stats, editable public profile, approval screen              | ✅     | `booking.test.tsx` (stats), E2E-04/06                                     |
| R7  | Weekly hours, days off, IST slots, lead time, horizon (§11)                    | ✅     | `appointments.test.ts`, `slots.test.ts`, E2E-07                           |
| R8  | Booking: idempotent, conflict-safe, cancel cutoff (§11, J2)                    | ✅     | 10-way concurrency test, idempotent replay test                           |
| R9  | Consultation lifecycle, waiting room, presence, rejoin (§13)                   | ✅     | `consultations.test.ts`, `room.test.tsx`                                  |
| R10 | **Real video (100ms)** with chat fallback (§13.2, J4)                          | 🟡     | Adapter + call screen built and unit-tested; needs 100ms keys + 2 devices |
| R11 | Structured, immutable prescription posted into chat (D8)                       | ✅     | `prescriptions.test.ts` (immutability via API and DB)                     |
| R12 | Prescription shows doctor's registration number (Telemedicine Guidelines 2020) | ✅     | P0-1 below                                                                |
| R13 | Order from prescription, stock reservation, COD, tracking ID (D9)              | ✅     | `orders.test.ts`, `fulfillment.test.ts`                                   |
| R14 | Pharmacy queue + inventory, status timeline (D10)                              | ✅     | `orders.test.ts`                                                          |
| R15 | Voice navigation (Bolo) EN/HI/Hinglish                                         | ✅     | `voice.test.ts`, `intents.test.ts`                                        |
| R16 | Notification inbox ("prescription ready", order updates) (Ph. 9)               | ✅     | `journey.test.ts` (inbox per step), `inbox.test.tsx`                      |
| R17 | Hosted API + DB, installable APK (Ph. 11)                                      | ⬜     | P0-3, P0-4 below                                                          |
| R18 | Web build for admin / pharmacy / testing (T5)                                  | ✅     | Runs in Chrome, icons included (BUG-04 fixed)                             |
| R19 | Security: RBAC, ownership 404s, audit log, no secrets in client                | ✅     | `auth.test.ts`, ownership tests in every module, `SECURITY.md`            |

---

## 3. Remaining work (prioritised)

Each item has an acceptance test. **P0 = needed for the demo. P1 = should do. P2 = only if time remains.**

### P0 — must have

| ID   | Work                                                                                                                                       | Acceptance                                                                                       | Est.    | Owner (suggested) |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------- | ----------------- |
| P0-1 | ✅ Done. Prescription shows doctor name, qualification and registration number                                                             | Card + detail screen show them; API test asserts fields; patient never sees other private data   | 2 h     | Backend + Mobile  |
| P0-2 | 100ms live test: create account, set `VIDEO_PROVIDER=hms`, call between two Android phones                                                 | Both see/hear each other; mute/camera work; ending closes the room; deny camera → chat continues | 3 h     | Third member      |
| P0-3 | Host the API: Neon Postgres + Render/Railway; `JWT_SECRET` new; `CORS_ORIGINS`; migrations; seed once                                      | `/health` = ok on the public URL; login works from the APK on mobile data                        | 3 h     | Backend           |
| P0-4 | Release APK pointed at the hosted API (`EXPO_PUBLIC_API_URL`), signed                                                                      | Installs on a phone that has never seen Metro; full journey works                                | 2 h     | Mobile            |
| P0-5 | ✅ Done: `npm run db:demo-reset -- --confirm`. Demo reset script: wipes demo bookings/orders, keeps accounts; warm-up call before the viva | One command restores the demo state in < 1 min                                                   | 1 h     | Backend           |
| P0-6 | Fix every open bug in §7 with severity High/Medium                                                                                         | §7 shows them Fixed with a test or E2E reference                                                 | ongoing | All               |

### P1 — should have

| ID   | Work                                                                                                | Acceptance                                                                |
| ---- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| P1-1 | ✅ Done. Notification inbox (Phase 9): prescription issued, order status changed, booking cancelled | Bell on Home with unread count; tapping opens the right screen; API tests |
| P1-2 | Low-network pass (Phase 10): Android emulator 3G profile + airplane-mode toggles                    | No screen hangs; every write shows retry; chat outbox survives reconnect  |
| P1-3 | Accessibility pass: TalkBack walk of the main journey, 1.3× font, 48 dp targets                     | Checklist in TESTING.md ticked                                            |
| P1-4 | ✅ Done. Web icons (BUG-04): a web fallback for `expo-symbols` (Material icons font)                | Icons visible in Chrome                                                   |
| P1-5 | Doctor "Prescriptions issued" list screen                                                           | Lists the doctor's prescriptions, opens detail                            |

### P2 — nice to have (do not start before P0/P1 are done)

- ABHA (ABDM) health-ID creation via Eka Care's ABDM Connect sandbox.
- A partner doctor network adapter (myUpchar / Apollo) behind `DoctorDirectoryProvider`.
- Hindi UI strings (translation catalog).
- Online payment behind the existing `PaymentProvider` port.

---

## 4. Timeline (3 people, ~2 weeks)

| Days | Tanay (backend)                                      | Vishnu (mobile)          | Himanshu (lead / third)                 |
| ---- | ---------------------------------------------------- | ------------------------ | --------------------------------------- |
| 1–2  | P0-1 API, P0-5 reset script                          | P0-1 screens, BUG fixes  | P0-2 100ms account + two-phone test     |
| 3–4  | P0-3 hosting                                         | P0-4 release APK         | E2E pass #1 on hosted setup (§6)        |
| 5–7  | P1-1 inbox API                                       | P1-1 inbox screens       | P1-2 low-network, P1-3 accessibility    |
| 8–9  | Fix bugs from E2E pass #2                            | Fix bugs, P1-4 web icons | E2E pass #2, screenshots for the report |
| 10   | Freeze. Rehearse demo ×2. Record the fallback video. |                          |                                         |

Rule: nothing new after day 9. Every change after that must fix a bug found in a rehearsal.

---

## 5. Test plan

### 5.1 Levels

| Level                | Tool                                   | Runs                | Scope                                                     |
| -------------------- | -------------------------------------- | ------------------- | --------------------------------------------------------- |
| Unit / shared rules  | Vitest                                 | `npm run check`     | time zones, join window, cutoffs, passwords, phone format |
| API integration      | Vitest + real PostgreSQL (`_test` DB)  | `npm run check`     | every endpoint, permissions, concurrency, idempotency     |
| Screen               | Jest + Testing Library                 | `npm run check`     | each screen's loading/empty/error/offline + main actions  |
| End-to-end (manual)  | Chrome (web build) + Android emulator  | before each release | §6 log, all roles                                         |
| Two-device           | 2 Android phones (or phone + emulator) | before the demo     | video, presence, live chat, prescription card             |
| Security spot checks | curl against the API                   | before the demo     | §5.2 SEC cases                                            |

### 5.2 Case matrix

"Auto" names the test file; "E2E" refers to §6. Every row must be ✅ before the demo.

**Auth (AUTH)**

| ID      | Case                                                | Expected                                   | Covered by                     |
| ------- | --------------------------------------------------- | ------------------------------------------ | ------------------------------ |
| AUTH-01 | Register with empty fields                          | Each field shows its own message           | E2E-09 ✅                      |
| AUTH-02 | Register with a phone that already exists           | "already has an account" message, no crash | Auto `auth.test.ts`, E2E-10 ✅ |
| AUTH-03 | Weak / common / phone-number password               | Refused with a reason                      | Auto `auth.test.ts`            |
| AUTH-04 | Login wrong password ×6                             | 401, then rate-limited                     | Auto                           |
| AUTH-05 | Unknown phone vs wrong password                     | Same message (no account enumeration)      | Auto                           |
| AUTH-06 | Access token expires mid-task                       | Silent refresh, request succeeds           | Auto `session.test.ts`         |
| AUTH-07 | Stolen refresh token reused                         | All sessions of that user ended            | Auto                           |
| AUTH-08 | Forgot password → code → reset → old password fails | Works; code single-use, 5 attempts, 10 min | Auto                           |
| AUTH-09 | Role escalation in register body (`role: "DOCTOR"`) | 400 (strict schema)                        | Auto                           |

**Doctor onboarding & admin (DOC)**

| ID     | Case                                                            | Expected                                       | Covered by         |
| ------ | --------------------------------------------------------------- | ---------------------------------------------- | ------------------ |
| DOC-01 | Doctor signs up with all fields                                 | Logged in, sees "Awaiting approval"            | Auto, E2E-02 ✅    |
| DOC-02 | Sign-up without registration number / specialization / language | Field errors                                   | Auto               |
| DOC-03 | Pending doctor calls a doctor API directly                      | 403 `DOCTOR_NOT_VERIFIED`                      | Auto               |
| DOC-04 | Pending doctor is not in search and slots return 404            | Hidden                                         | Auto               |
| DOC-05 | Non-admin opens admin queue                                     | 403                                            | Auto               |
| DOC-06 | Admin rejects without a reason                                  | Button disabled; API 400                       | Auto, E2E-04 ✅    |
| DOC-07 | Admin approves                                                  | Doctor listed, first among demo doctors        | Auto, E2E-05/08 ✅ |
| DOC-08 | Admin removes approval from a doctor with bookings              | Doctor locked out; upcoming bookings cancelled | Auto               |
| DOC-09 | Doctor edits fee / languages                                    | Saved; duplicates removed; cannot edit status  | Auto, E2E-06 ✅    |
| DOC-10 | Registration number never reaches patients                      | Not in search/detail JSON                      | Auto               |

**Scheduling & booking (BOOK)**

| ID      | Case                                             | Expected                                  | Covered by                  |
| ------- | ------------------------------------------------ | ----------------------------------------- | --------------------------- |
| BOOK-01 | Doctor saves weekly hours                        | Saved; existing bookings kept             | Auto, E2E-07 ✅             |
| BOOK-02 | Overlapping blocks on one day                    | Refused                                   | Auto                        |
| BOOK-03 | Slots inside the 30-min lead time                | Not offered                               | Auto, E2E-11 ✅             |
| BOOK-04 | Day with no hours                                | Shown as "No times", not pickable         | E2E-11 (BUG-01 fixed)       |
| BOOK-05 | Two patients book the same slot at once (10-way) | Exactly one wins                          | Auto (concurrency)          |
| BOOK-06 | Double-tap / retry after timeout                 | One appointment (idempotency key)         | Auto                        |
| BOOK-07 | Patient double-books themselves at the same time | Refused                                   | Auto                        |
| BOOK-08 | Cancel more / less than 2 h before               | Allowed / refused; review screen explains | Auto, E2E-12 (BUG-02 fixed) |
| BOOK-09 | Doctor cancels without a reason                  | Refused                                   | Auto                        |
| BOOK-10 | Booking appears on doctor's Today and stats      | Yes                                       | Auto, E2E-13                |

**Consultation & video (CONS)**

| ID      | Case                                                     | Expected                                         | Covered by               |
| ------- | -------------------------------------------------------- | ------------------------------------------------ | ------------------------ |
| CONS-01 | Join before window (10 min before start)                 | "Not open yet" with the time                     | Auto                     |
| CONS-02 | Stranger joins someone else's consultation               | 404 + audit entry                                | Auto                     |
| CONS-03 | Waiting room shows who is present                        | Updates live                                     | Auto, E2E-14             |
| CONS-04 | Only the doctor can start / end                          | Patient gets 403                                 | Auto                     |
| CONS-05 | Chat: order kept, duplicates removed, survives reconnect | Yes                                              | Auto                     |
| CONS-06 | Network drops and comes back                             | "Reconnecting…" then rejoins; outbox resent      | Auto, P1-2               |
| CONS-07 | 100ms: both join, see and hear each other                | Yes                                              | P0-2 (two devices)       |
| CONS-08 | 100ms: camera permission denied                          | Message; chat still works; VIDEO_FAILED recorded | P0-2                     |
| CONS-09 | 100ms secret never sent to the app; token role per side  | Doctor=host, patient=guest; 30-min token         | Auto `video-hms.test.ts` |
| CONS-10 | Consultation window passes                               | Sweep closes it; appointment COMPLETED / NO_SHOW | Auto                     |

**Prescription (RX)** — draft/issue/void/revise, immutability (API + DB), 24 h window, ownership 404s, chat card: all **Auto** `prescriptions.test.ts`; live check E2E-15. RX-NEW: registration number on the card (P0-1).

**Orders & pharmacy (ORD)** — order only from an issued prescription and within quantity, stock reserved atomically, out-of-stock refused, patient cancel only while PENDING, pharmacy transitions in order only, cancel needs a reason, tracking ID format, cross-user 404: **Auto** `orders.test.ts`, `fulfillment.test.ts`; live check E2E-16/17.

**Security (SEC)**

| ID     | Case                                                  | Expected                  | Covered by            |
| ------ | ----------------------------------------------------- | ------------------------- | --------------------- |
| SEC-01 | Every role calls every other role's endpoints         | 403, written to audit log | Auto                  |
| SEC-02 | IDs of other users' appointments/prescriptions/orders | 404 (never 403, no leak)  | Auto                  |
| SEC-03 | Unknown fields in any body (mass assignment)          | 400                       | Auto                  |
| SEC-04 | Web origin not in `CORS_ORIGINS`                      | No CORS headers           | Auto `health.test.ts` |
| SEC-05 | Demo seed refuses to run with `NODE_ENV=production`   | Exits                     | Code check            |
| SEC-06 | `.env` and keys are not committed                     | `git ls-files` shows none | Before each commit    |

---

## 6. Manual end-to-end log (sandbox run, 28 Nov 2026)

Environment: local API + Postgres (Docker), Expo web build in Chrome, Android emulator (dev build with 100ms).

| ID     | Step                                                                   | Result                                          |
| ------ | ---------------------------------------------------------------------- | ----------------------------------------------- |
| E2E-01 | App opens on web (Chrome) and Android                                  | ✅ (web needed CORS + web token storage: fixed) |
| E2E-02 | "I am a doctor" → sign up Dr. Meera Iyer (DMC-2018/45678, Pediatrics)  | ✅ lands on "Awaiting approval"                 |
| E2E-03 | Log in as admin 9000000004                                             | ✅ queue shows her with all details             |
| E2E-04 | Reject without reason                                                  | ✅ Reject disabled                              |
| E2E-05 | Approve                                                                | ✅ moves to Approved                            |
| E2E-06 | Doctor logs in: dashboard + stats + editable profile                   | ✅                                              |
| E2E-07 | Doctor sets Sat afternoon/evening + Sun morning, 15-min slots          | ✅ "Hours saved"                                |
| E2E-08 | New patient Ramesh → Child doctor → Dr. Meera listed first ("New")     | ✅                                              |
| E2E-09 | Register with empty form                                               | ✅ all field errors                             |
| E2E-10 | Register with the doctor's phone                                       | ✅ clear message                                |
| E2E-11 | Slot picker hides times inside the lead time                           | ✅ (BUG-01 found)                               |
| E2E-12 | Book 12:30 today with a reason                                         | ✅ "room opens at 12:20" (BUG-02 found)         |
| E2E-13 | Doctor sees booking on Today; stats update                             | see below                                       |
| E2E-14 | Both join; doctor starts; chat both ways                               | see below                                       |
| E2E-15 | Doctor issues prescription; patient sees card and Medicines tab        | see below                                       |
| E2E-16 | Patient orders from prescription (COD); tracking ID shown              | see below                                       |
| E2E-17 | Pharmacy confirms → packs → ships → delivers; patient timeline updates | see below                                       |

---

## 7. Bug log

| ID     | Severity           | Found in          | Description                                                                                            | Status                                                                          |
| ------ | ------------------ | ----------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| BUG-01 | Medium             | E2E-11            | Days without hours were labelled "Full" (sounds booked out)                                            | Fixed: "No times"                                                               |
| BUG-02 | Medium             | E2E-12            | Review screen promised cancelling "up to 2 h before" for a slot < 2 h away                             | Fixed: says it can't be cancelled                                               |
| BUG-03 | Low                | E2E-03            | "Verify doctors" title shown twice (tab header + screen title)                                         | Fixed                                                                           |
| BUG-04 | Low                | E2E-01            | Icons don't render on the web build (`expo-symbols` is native-only)                                    | Fixed: `Icon.web.tsx` uses the Material Symbols web font                        |
| BUG-05 | High               | review            | Unverified doctor could call doctor APIs directly (only the app hid them)                              | Fixed: server guard + tests                                                     |
| BUG-06 | Medium             | E2E-01            | Web build couldn't log in (no secure storage on web) or reach the API (no CORS)                        | Fixed                                                                           |
| BUG-07 | Low                | check             | Doctor Today test mock didn't answer the new stats request                                             | Fixed                                                                           |
| BUG-08 | **Critical**       | `journey.test.ts` | `POST /v1/orders` crashed with 500 for everyone: the route used the role guard without the login guard | Fixed at the root: the role guard now authenticates itself; regression asserted |
| BUG-09 | **High** (privacy) | review            | `GET /v1/orders/track/:id` was public and returned name, phone, address and medicines                  | Fixed: login required, patients only see their own (404 otherwise)              |
| BUG-10 | Medium             | route audit       | Public `/v1/speech` (CPU-heavy TTS) had no rate limit and no upstream timeout                          | Fixed: 60 req / 15 min per IP, 90 s timeout                                     |

---

## 8. Demo script (10 minutes)

### 8.1 Devices

- **Phone A** (patient): release APK.
- **Phone B or laptop browser** (doctor): APK for video; web build works for chat-only.
- **Laptop** (admin + pharmacy): web build in Chrome, projected.

### 8.2 Flow

1. (1 min) Problem: rural patients travel hours for a 5-minute consult. One connected journey.
2. (1 min) Doctor signs up with a registration number → admin verifies on the laptop → doctor appears first in the list.
3. (2 min) Patient: Home → "Child doctor" → profile → slot → booking token. Show "Bolo" voice: say "doctor dikhao".
4. (3 min) Consultation: waiting room presence → doctor starts → **video call** + chat → doctor issues prescription → card appears in chat.
5. (2 min) Patient orders from the prescription (COD) → pharmacy confirms/packs/ships on the laptop → patient's timeline updates live.
6. (1 min) Engineering: modular monolith, PostgreSQL constraints prevent double booking (show the concurrency test), immutable prescriptions, audit log, 270+ automated tests.

### 8.3 Fallbacks

- Video fails → "the consultation continues in chat" (that is a designed feature, J4).
- Hosted API asleep → open `/health` 2 minutes before (warm-up). If the internet fails: laptop runs API locally, phones on the laptop's hotspot.
- Everything fails → recorded screen video of the full journey.

---

## 9. Risks

| Risk                                | Mitigation                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| 100ms free tier or keys not ready   | `VIDEO_PROVIDER=fake` still demos the full flow with chat                                          |
| Free hosting sleeps / cold start    | Warm-up step; or Railway (no sleep)                                                                |
| Real doctor unavailable on demo day | A teammate signs up as the doctor (same verified flow)                                             |
| Claiming medical/legal compliance   | Say "designed with reference to Telemedicine Practice Guidelines 2020 and DPDP"; never "compliant" |
| Scope creep                         | §3 order is fixed; P2 only after P0+P1                                                             |
