# API

Base URL in development: `http://localhost:4000`. JSON only, body limit 100 kB.

## Errors

Every non-2xx response:

```json
{ "error": { "code": "NOT_FOUND", "message": "Route not found", "requestId": "…" } }
```

`code` is one of `ERROR_CODES` in `packages/shared/src/api.ts`. The app shows its own text per code, never `message`. Every response carries an `x-request-id` header.

`VALIDATION_FAILED` adds `details.fields`: `{ "<field>": "<message>" }`. Unknown body fields are rejected. `RATE_LIMITED` (429) adds `details.retryAfterSeconds`.

Phone numbers are accepted in any common Indian format (`98765 43210`, `+91…`, `0…`) and returned as `+919876543210`.

## Auth

Send `Authorization: Bearer <accessToken>` on protected endpoints. Access tokens last 15 minutes. On `401 UNAUTHENTICATED`, call refresh once and retry.

`AuthSession` = `{ user: { id, phone, fullName, role }, accessToken, accessTokenExpiresIn, refreshToken }`

| Endpoint                        | Auth | Body                                       | Success           | Errors                                          |
| ------------------------------- | ---- | ------------------------------------------ | ----------------- | ----------------------------------------------- |
| `POST /v1/auth/register`        | —    | `fullName, phone, password, consent: true` | 201 `AuthSession` | 400 `VALIDATION_FAILED`, 409 `PHONE_TAKEN`      |
| `POST /v1/auth/login`           | —    | `phone, password`                          | 200 `AuthSession` | 401 `INVALID_CREDENTIALS`, 429                  |
| `POST /v1/auth/refresh`         | —    | `refreshToken`                             | 200 `AuthSession` | 401 `UNAUTHENTICATED`                           |
| `POST /v1/auth/logout`          | —    | `refreshToken`                             | 204 (always)      | —                                               |
| `POST /v1/auth/password/forgot` | —    | `phone`                                    | 202 (always)      | 429                                             |
| `POST /v1/auth/password/reset`  | —    | `phone, code, newPassword`                 | 204               | 400 `INVALID_RESET_CODE` / `VALIDATION_FAILED`  |
| `POST /v1/auth/password/change` | ✅   | `currentPassword, newPassword`             | 200 `AuthSession` | 400 `INVALID_CREDENTIALS` / `VALIDATION_FAILED` |
| `GET /v1/me`                    | ✅   | —                                          | 200 user          | 401                                             |

- Register always creates a **patient**. Doctors and pharmacy admins are provisioned (`npm run db:seed` for demo accounts).
- Login gives the same error for a wrong password and an unknown phone.
- Refresh rotates the token. Reusing a rotated token revokes every session of that user.
- Reset and change password revoke all refresh tokens. Change password returns a fresh session.
- Rate limits: 100 auth requests per IP per 15 min; 5 logins per phone per 15 min; 3 reset requests per phone per hour.

## Patient profile

Patients only (`403` for other roles). "Me" comes from the token, so there is no id in the URL to tamper with.

| Endpoint               | Body                                                                | Success              |
| ---------------------- | ------------------------------------------------------------------- | -------------------- |
| `GET /v1/me/profile`   | —                                                                   | 200 `PatientProfile` |
| `PATCH /v1/me/profile` | any of `fullName, dateOfBirth, gender, preferredLanguage, district` | 200 `PatientProfile` |

`PatientProfile` = `{ fullName, phone, dateOfBirth (YYYY-MM-DD), gender, preferredLanguage, district, consentAt }`, with optional fields `null` until set. In a PATCH, a field left out is unchanged and `null` clears it. Date of birth must be a real date in the last 120 years. Unknown fields → `400`.

## Doctors

Patients and doctors (`403` for pharmacy admins, `401` without a token).

### `GET /v1/doctors`

| Param            | Values                                     |
| ---------------- | ------------------------------------------ |
| `q`              | Part of a name or specialty (max 60 chars) |
| `specialization` | One of `SPECIALIZATIONS`                   |
| `language`       | One of `LANGUAGES`                         |
| `minRating`      | 0–5                                        |
| `sort`           | `rating` (default), `experience`, `fee`    |
| `page`           | 1-based, 20 per page                       |

Returns `Page<DoctorCard>` = `{ items, page, pageSize, total }`. A card has `id, name, specializations, languages, experienceYears, feeInr, ratingAvg (null = no ratings), ratingCount, photoUrl, isDemo`. Filters combine with AND. `rating` sorts unrated doctors last and breaks ties by rating count; every sort ends with name and id, so paging never repeats or skips. Unknown params → `400`.

### `GET /v1/doctors/:id`

`DoctorCard` + `bio`. `404` for an unknown, inactive or malformed id. Never includes the registration number.

## Slots and availability

All times are UTC ISO strings; dates (`YYYY-MM-DD`) and weekly hours are IST.

| Endpoint                                   | Who                                              | Notes                                                                                                                                                           |
| ------------------------------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/doctors/:id/slots?from=&days=`    | patients (any doctor), doctors (only themselves) | `{ doctorId, days: [{ date, slots: [{ startAt, endAt }] }] }`. Free slots only. `from` defaults to today; days 1–14 (default 7), clipped at the 14-day horizon. |
| `GET /v1/availability`                     | doctor                                           | `{ rules: [{ weekday, startTime, endTime, slotMinutes }], exceptions: [{ date, reason }] }`                                                                     |
| `PUT /v1/availability/rules`               | doctor                                           | `{ rules }` replaces the whole weekly template. Slot length 15/20/30; blocks on one day can't overlap. Existing bookings are kept.                              |
| `PUT /v1/availability/exceptions/:date`    | doctor                                           | Blocks a date (idempotent), body `{ reason? }`. Returns `bookedThatDay` so the app can warn.                                                                    |
| `DELETE /v1/availability/exceptions/:date` | doctor                                           | `204`, or `404` if not blocked.                                                                                                                                 |

`GET /v1/doctors` also takes `available=today|week`: doctors with hours on an unblocked day in that window (today: hours not yet over).

## Appointments

| Endpoint                                           | Who                   | Notes                                                                                                                                |
| -------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /v1/appointments`                            | patient               | Header **`Idempotency-Key: <uuid>`** (required). Body `{ doctorId, startAt, reasonNote? }`. `201` new, `200` replay of the same key. |
| `GET /v1/appointments?scope=upcoming\|past\|today` | patient, doctor       | Their own. `upcoming`: booked and not over, soonest first. `past`: everything else, newest first. `today`: today in IST.             |
| `GET /v1/appointments/:id`                         | its patient or doctor | Anyone else gets `404` (not `403`, so existence isn't revealed).                                                                     |
| `POST /v1/appointments/:id/cancel`                 | its patient or doctor | Body `{ reason? }`. Patients: up to 2 h before the start. Doctors: before the start, reason required.                                |

`Appointment` = `{ id, status, startAt, endAt, reasonNote, doctor: { id, name, specializations }, patient: { id, name, age }, cancelledBy, cancelReason, createdAt }`. The patient's phone is never included.

Booking errors (`409`): `SLOT_UNAVAILABLE` (not a real slot, too soon, too far, day off), `SLOT_TAKEN` (someone else has it), `TIME_CONFLICT` (the patient has another appointment then), `CONFLICT` (idempotency key reused for a different booking). Cancel errors: `CANCEL_TOO_LATE`, `INVALID_STATE` (already cancelled).

## Consultations

Patients and doctors of the appointment only; anyone else gets `404` (and a join attempt is audited).

| Endpoint                                         | Notes                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /v1/appointments/:id/join`                 | Opens 10 min before the start, closes 15 min after the end. Creates the consultation on first join (`WAITING`), logs JOINED or RECONNECTED, returns `{ consultation, video, cursor }`. `video` is `{ provider, roomId, token, expiresAt }` (token valid 1 h) or `null` in chat-only mode. Errors: `JOIN_NOT_OPEN` (with `details.opensAt`), `CONSULTATION_CLOSED`. |
| `GET /v1/consultations/:id/updates?after=&wait=` | **Long poll.** Messages with id > `after`, the consultation (status, who is present). If nothing is new, waits up to `wait` seconds (max 25) and returns as soon as something happens.                                                                                                                                                                             |
| `POST /v1/consultations/:id/messages`            | `{ clientMsgId (uuid), body (≤2000) }`. `201` new, `200` if this `clientMsgId` was already sent. Only while WAITING/ACTIVE.                                                                                                                                                                                                                                        |
| `POST /v1/consultations/:id/start`               | Doctor only. WAITING → ACTIVE.                                                                                                                                                                                                                                                                                                                                     |
| `POST /v1/consultations/:id/end`                 | Doctor only. ACTIVE → COMPLETED; the appointment becomes COMPLETED.                                                                                                                                                                                                                                                                                                |
| `POST /v1/consultations/:id/leave`               | Logs LEFT. Not the end: the same join call rejoins.                                                                                                                                                                                                                                                                                                                |
| `POST /v1/consultations/:id/video-failed`        | Logs VIDEO_FAILED (the chat carries on).                                                                                                                                                                                                                                                                                                                           |

`Consultation` = `{ id, appointmentId, status, startedAt, endedAt, present: { patient, doctor } }`. "Present" means the person's app checked in within the last ~35 s (an open long poll checks in every ≤25 s).

Every minute the server closes consultations whose window has passed: ACTIVE → COMPLETED; WAITING → EXPIRED and the appointment `NO_SHOW`; a booking nobody joined → `NO_SHOW`.

## Medicines and prescriptions

| Endpoint                                  | Who                                | Notes                                                                                                                                                                                                                                  |
| ----------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/medicines?q=`                    | anyone logged in                   | Active catalog medicines by name or generic name (30). `MedicineSummary` shows `inStock`, never the exact stock. Prices in paise.                                                                                                      |
| `POST /v1/consultations/:id/prescription` | its doctor                         | Opens (or returns) the draft. Only while the consultation is ACTIVE or within 24 h after it ended, else `PRESCRIBE_WINDOW_CLOSED`.                                                                                                     |
| `PUT /v1/prescriptions/:id`               | its doctor                         | `{ items, generalInstructions, validDays }` replaces the draft. Items: `{ medicineId \| null, medicineName, dosage, frequency, durationDays, quantity, instructions }`. Unknown medicine → `400`. Not a draft → `PRESCRIPTION_LOCKED`. |
| `POST /v1/prescriptions/:id/issue`        | its doctor                         | Needs ≥1 item. Sets `validUntil` = today + `validDays`, posts a `PRESCRIPTION_CARD` message (`{ prescriptionId, itemCount }`) into the chat. A second one in force for the same consultation → `INVALID_STATE` (void the first).       |
| `POST /v1/prescriptions/:id/void`         | its doctor                         | `{ reason (≥3), revise? }`. ISSUED → VOIDED, posts a system message. With `revise`, also returns a new draft copying it, with `supersedesId`.                                                                                          |
| `GET /v1/prescriptions`                   | patient, doctor                    | Patient: their issued/voided ones (never drafts). Doctor: the ones they wrote.                                                                                                                                                         |
| `GET /v1/prescriptions/:id`               | its patient (not drafts) or doctor | Anyone else: `404`.                                                                                                                                                                                                                    |
| `GET /v1/consultations/:id/prescriptions` | its patient or doctor              | Same visibility rules.                                                                                                                                                                                                                 |

## Endpoints

### `GET /health`

No auth. `200` when the DB answers, `503` when it doesn't.

```json
{ "status": "ok", "version": "0.1.0", "checks": { "database": "up" } }
```
