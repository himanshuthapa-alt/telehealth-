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

| Role           | Mobile     | Password        |
| -------------- | ---------- | --------------- |
| Patient        | 9000000001 | `TeleCare@2026` |
| Doctor         | 9000000002 | `TeleCare@2026` |
| Pharmacy admin | 9000000003 | `TeleCare@2026` |

`db:seed` also creates 16 demo doctors (phones `+919000000101`–`115`, same password), each marked "(demo)", with consulting hours (three patterns, IST) unless the doctor has already set their own. It is safe to run again. It refuses to run when `NODE_ENV=production`.

**Password reset in development:** there is no SMS yet, so the 6-digit code appears in the API's log as `password reset code (log delivery, dev/demo only)`.

## Video

`VIDEO_PROVIDER` in `apps/api/.env`: `fake` (default; rooms and tokens without real video, the app says "Video demo mode") or `none` (chat-only consultations). A real provider needs a vendor account and a native build; see ARCHITECTURE.md.

## Voice (speech navigation)

Voice navigation lets a non-technical user drive the patient app by speaking (English/Hindi/Hinglish).

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
