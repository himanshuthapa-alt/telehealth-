# Security

Wording rule: TeleCare+ is "designed with reference to DPDP/DISHA principles", never "compliant".

## In place (Phase 1)

- Config is validated at startup; the API won't boot with bad config.
- Secrets live in `.env` (gitignored). Only `.env.example` is committed, with dev-only values.
- Request bodies are never logged, so health data doesn't end up in logs.
- 500 responses return a generic message and request ID, no stack traces.
- `x-powered-by` disabled, JSON body limit 100 kB.
- Tests use a separate `telecare_test` database.

## In place (Phase 2)

- **Passwords:** argon2id from Node's built-in crypto (19 MiB, 2 passes), PHC format. 8–128 characters, a short common-password list, and not the phone number. Same rule in the app and API (`packages/shared`). The synopsis says bcrypt; argon2id is its recommended successor (blueprint §16 allows either).
- **Sessions:** 15-minute HS256 access JWT (`JWT_SECRET`, min 32 chars, checked at boot) holding only user id and role. 30-day refresh token: random, only its SHA-256 stored, rotated on every use. Rotation is atomic, so concurrent refreshes can't both win. Reuse of a rotated token revokes all sessions and is audited.
- **On device:** refresh token in Android Keystore / iOS Keychain (`expo-secure-store`, this-device-only). Access token in memory only.
- **Authorization:** `requireAuth` and `requireRole(...)` guards. Denials return 403 and are audited. Ownership checks will live in each service (§12 layer 2) from Phase 4 on. The app's role-based navigation only picks screens.
- **No account enumeration:** same login error for unknown phone and wrong password (a dummy hash keeps timing equal); forgot-password always answers 202.
- **Privilege escalation:** register is patient-only and rejects unknown fields such as `role` (tested).
- **Rate limits:** see API.md.
- **Audit:** `audit_events` records register, login success/failure, logout, refresh reuse, reset request/complete, password change and access denied. Append-only enforced by a database trigger (tested).
- **Consent:** registration requires accepting the privacy notice; time stored in `users.consent_at`.

## In place (Phase 3)

- **Cached data stays in memory.** The query cache is never written to disk and is wiped on logout, so health data doesn't stay on the phone (blueprint §17). From Phase 4 the public doctor directory is the one exception (see below).
- **Profile access** is by token only (`/v1/me/profile`), patients only, strict validation.

## In place (Phase 4)

- **Doctor directory** is for logged-in patients and doctors only. Responses list public fields explicitly, so private ones (registration number) can't leak by accident (tested on list and detail).
- **Search input** is length-capped, and LIKE wildcards are escaped so `%` or `_` can't widen a search.
- **Offline cache on disk holds only the public doctor directory.** The rule is one function (`shouldPersistQuery`), and a test checks that profile data is never written.

## In place (Phase 5)

- **Double-booking is impossible at the database level** (exclusion constraints per doctor and per patient), tested with 10 simultaneous requests for one slot. Each booking first takes short transaction locks (doctor, then patient) so racing bookings queue instead of deadlocking: without them, heavy concurrency gave some requests a 500 instead of "slot taken" (found in Phase 7, fixed).
- **Idempotent booking:** the app sends one UUID per booking attempt; retries return the original appointment. Tested with 5 simultaneous identical requests.
- **Ownership:** appointments are visible to and cancellable by only their patient and doctor; anyone else gets `404`. Doctors see patient name, age and reason, never the phone number. Doctors can only manage their own hours and see their own slots.
- **Audit:** `APPOINTMENT_BOOKED` and `APPOINTMENT_CANCELLED`.

## In place (Phase 6)

- **Join is checked on the server every time:** who (the appointment's patient or doctor), when (inside the window) and state. Strangers get `404` and the attempt is audited (`CONSULTATION_JOIN_DENIED`). The app never builds room names, and video tokens expire within an hour.
- **Only the doctor** starts and ends a consultation.
- **Chat is stored on our server**, visible only to the two participants, and message bodies are never logged.
- **Audit:** `CONSULTATION_JOINED`, `CONSULTATION_STARTED`, `CONSULTATION_ENDED`.

## In place (Phase 7)

- **Issued prescriptions can't be altered, by anyone:** Postgres triggers refuse updates to issued/voided prescriptions (except ISSUED → VOIDED) and any change to their items, even from code that bypasses the API (tested with direct database writes).
- **Ownership:** only the prescribing doctor can draft, issue or void; only that doctor and the patient can read it; patients never see drafts; strangers get `404`.
- **Writing window:** only during the consultation or within 24 h after it.
- **Audit:** `PRESCRIPTION_ISSUED`, `PRESCRIPTION_VOIDED`.

## Known

- **Reset codes are written to the API log** (decision D3, no SMS). This is the one intended exception to "no secrets in logs". Swap in an SMS `ResetCodeDelivery` before real users depend on reset.
- **Presence, long-poll wake-ups and the closing sweep are in-process**, like the rate limits: run one API instance, or move them to Postgres/Redis and a scheduled job.
- **Rate limits are in memory**, so they reset on restart and are per process. Move them to Postgres/Redis if the API runs as more than one instance.
- **Access tokens stay valid up to 15 minutes** after logout or a password change (refresh tokens are revoked at once).
- `npm audit` reports moderate advisories in transitive dependencies of the Expo toolchain (e.g. `uuid`, `decode-uri-component`). The only fix offered (`--force`) breaks Expo SDK pins. Re-check on each Expo SDK upgrade.
