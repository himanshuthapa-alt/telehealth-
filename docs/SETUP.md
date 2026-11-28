# Setup

## Requirements

- Node.js 24 LTS (`.nvmrc`)
- Docker Desktop, running
- Android Studio + an emulator, or a phone with Expo Go on the same Wi-Fi

## Steps

```sh
git clone <repo> && cd telecare-plus
npm install
npm run db:up                          # starts telecare-postgres, creates telecare + telecare_test
cp apps/api/.env.example apps/api/.env
npm run db:migrate
npm run db:seed                        # demo accounts, see below
npm run dev:api                        # check http://localhost:4000/health
npm run dev:mobile                     # "a" = Android emulator, or scan QR in Expo Go
```

The app finds the API on the same machine that serves the JS bundle (port 4000), so it works on an emulator and on a phone on the same Wi-Fi. To point at another server set `EXPO_PUBLIC_API_URL`.

## Demo accounts

| Role                     | Mobile     | Password        |
| ------------------------ | ---------- | --------------- |
| Patient                  | 9000000001 | `TeleCare@2026` |
| Doctor                   | 9000000002 | `TeleCare@2026` |
| Pharmacy admin           | 9000000003 | `TeleCare@2026` |
| Admin (verifies doctors) | 9000000004 | `TeleCare@2026` |

New doctors sign up from the welcome screen ("I am a doctor") and appear to patients after the admin approves them.

`db:seed` also creates 16 demo doctors (phones `+919000000101`–`115`, same password), each marked "(demo)", with consulting hours (three patterns, IST) unless the doctor has already set their own. It is safe to run again. It refuses to run when `NODE_ENV=production`.

**Password reset in development:** there is no SMS yet, so the 6-digit code appears in the API's log as `password reset code (log delivery, dev/demo only)`.

## Video

**Free, no account (default for the demo):** `VIDEO_PROVIDER=p2p` in `apps/api/.env`. The two
devices send video directly to each other; the API only introduces them (`/v1/rtc/*`, gated by a
short-lived call token). Works on the same Wi-Fi and most home networks; some mobile networks block
direct connections (no relay server), and then the chat still works. Browsers only allow the camera
on https or localhost pages, which the app handles for you.

**Daily.co:** `VIDEO_PROVIDER=daily` + `DAILY_API_KEY`. Joining calls needs a card on file at Daily.

**100ms:**

`VIDEO_PROVIDER` in `apps/api/.env`:

- `hms`: real video calls through [100ms](https://www.100ms.live). Free tier: 10,000 minutes/month (check current limits).
  1. Create a 100ms account and a "Video Conferencing" template.
  2. From the dashboard's Developer page copy the **App Access Key** and **App Secret**; copy the template's **Template ID**.
  3. Set `HMS_ACCESS_KEY`, `HMS_APP_SECRET`, `HMS_TEMPLATE_ID`. If your template's roles are not named `host`/`guest`, set `HMS_DOCTOR_ROLE` / `HMS_PATIENT_ROLE` to match.
  4. Restart the API. The app needs the native dev build (`npm run android -w @telecare/mobile`); Expo Go can't run 100ms.
     The secret stays on the server: the app only ever gets a short-lived join token.
- `fake` (default): rooms and tokens without real video; the app says "Video demo mode".
- `none`: chat-only consultations.

If video can't start (no permission, network), the consultation continues in the chat.

## Voice (speech navigation)

Voice navigation lets a non-technical user drive the patient app by speaking.

### Indian languages (Sarvam AI) — recommended

With a Sarvam key the mic understands **23 Indian languages** (Hindi, Tamil, Telugu, Bengali,
Marathi, Gujarati, Kannada, Malayalam, Punjabi, Odia, Urdu, Assamese, …) and answers out loud in
the speaker's language (11 voice languages).

1. Sign up at **dashboard.sarvam.ai** (₹100 free credits, no card) → API keys → create a key.
2. Put it in `apps/api/.env`: `SARVAM_API_KEY=...` (never in the app; the app only talks to our API).
3. Restart the API. `GET /v1/voice/capabilities` now returns `{"indianLanguages": true}`.

How it works: the app records ≤8 s → `POST /v1/voice/understand` (signed-in users only, 40 per
15 min) → Sarvam translates the speech to English → the same keyword parser picks the intent
(emergency words always win) → the app navigates → the reply is translated and spoken via
`GET /v1/speech?lang=ta-IN`. Audio and transcripts are never stored or logged.
Cost: roughly ₹0.5 per command; ₹100 lasts a whole project demo comfortably.

### Without a key (English, on device)

- **Speech-to-text needs a native dev build.** On-device recognition uses `expo-speech-recognition`, which Expo Go cannot load. Build and install the dev client once:

  ```sh
  npm run android -w @telecare/mobile    # expo run:android — builds, installs, needs Android SDK + NDK
  ```

  On an emulator, enable the host mic (`adb emu avd hostmicon`) and route your computer's microphone to it. A real phone is more reliable than the emulator for voice.

- **Text-to-speech (Chatterbox).** Spoken replies come from a self-hosted Chatterbox TTS service (OpenAI-compatible `/v1/audio/speech`). Run it in Docker on port 4123; the API reaches it via `TTS_BASE_URL` (default `http://localhost:4123`) and the app only ever calls the API's `GET /v1/speech`. On CPU-only machines the first phrases are slow (tens of seconds) — expected; navigation never waits on it.

## Troubleshooting

- **App says "Could not reach the server":** API not running, or phone on a different network.
- **API refuses to start with `JWT_SECRET`:** your `.env` predates Phase 2. Add `JWT_SECRET=` with `openssl rand -base64 48`.
- **App says database unavailable / `/health` is 503:** run `npm run db:up`.
- **"Invalid hook call" / duplicate React:** run `npx expo-doctor` in `apps/mobile`. React is pinned at the root on purpose; don't remove it.
