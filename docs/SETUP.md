# Setup

## Requirements

- Node.js 24 LTS (`.nvmrc`)
- Docker Desktop, running
- Android Studio + an emulator, or a physical Android phone with an Expo Go version compatible with SDK 58

## Steps

```sh
git clone <repo> && cd telecare-plus
npm install
npm run db:up                          # starts telecare-postgres, creates telecare + telecare_test
cp apps/api/.env.example apps/api/.env
npm run db:migrate
npm run db:seed                        # demo accounts, see below
npm run dev:api                        # check http://localhost:4000/health
npm run dev:mobile                     # QR for Expo Go, "a" for Android emulator, "w" for web
```

The app finds the API on the same machine that serves the JS bundle (port 4000), so it works on an emulator and on a phone on the same Wi-Fi. To point at another server set `EXPO_PUBLIC_API_URL`.

## Configure Bolo voice services

Third-party calls are disabled by default. To enable live voice transcription, set `EXTERNAL_SERVICES_MODE=live` and `GROQ_API_KEY` in `apps/api/.env`. Groq Whisper transcribes the short recording; the TeleCare API keeps it in memory and does not write it to disk. The phone removes its temporary recording after upload. A local phone speech engine reads prompts when hosted speech is unavailable.

Groq calls share a process-local daily request cap, controlled by GROQ_DAILY_REQUEST_LIMIT (default 300); the API logs one warning at GROQ_BUDGET_WARNING_RATIO (default 0.8). This is a request-count cap, not a dollar estimate, and resets at UTC midnight or when the API restarts. Google and Sarvam speech endpoints have per-IP rate limits.

Optional hosted voices use `GOOGLE_TTS_API_KEY` for Hindi WaveNet speech and `SARVAM_API_KEY` for Hinglish speech. Keep these keys only in the API environment, never in the mobile app. Bolo's language selector remembers a manually chosen spoken-reply language on that phone.

In external-services test mode, mic transcription and hosted speech do not call vendors. Typed symptom routing and emergency keyword checks still work locally. Offline speech recognition is not available yet; the Bolo screen reads its offline guidance aloud and supports typed symptom entry.

## Urgent doctor requests

After applying migrations, sign in with a doctor account and turn on On-call availability in the new Urgent inbox tab. Demo doctors default to off-call. Requests are assigned by specialty and escalate after three minutes; the app polls for status. This build does not place masked calls or send push notifications. Accepted requests do not trigger a phone call, so use the regular appointment flow for contact until a telephony provider is configured.

## Run on web and mobile devices

Start the API and database as shown above, then use one of these targets:

| Target                            | Command or steps                                                                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Desktop web browser               | `npm run dev:web`                                                                                                                                                                          |
| Phone-size preview on your laptop | Run `npm run dev:web`, then open the browser device toolbar with **Ctrl+Shift+M** (Edge/Chrome) and choose a device preset.                                                                |
| Android emulator                  | Start an emulator in Android Studio, then run `npm run dev:android`. This explicitly launches in Expo Go.                                                                                  |
| Physical Android phone            | Run `npm run dev:mobile`, then scan the QR code with Expo Go. Keep the phone and laptop on the same Wi-Fi.                                                                                 |
| Phone browser                     | Run `npm run dev:web` and open `http://<laptop-LAN-IP>:8081` on the phone while both are on the same Wi-Fi. The development API allows browser requests from LAN origins.                  |
| Production web export             | Run `npm run build:web`; serve the generated `apps/mobile/dist` folder with single-page-app route fallback enabled. Set `EXPO_PUBLIC_API_URL` to the public HTTPS API URL before building. |

The app uses Expo SDK 58. The current App Store version of Expo Go does not include SDK 58; native iPhone testing therefore needs an iOS development build distributed through EAS/TestFlight, while the web app can be opened in Safari. See [Expo's SDK compatibility guidance](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/). In production, set `WEB_ORIGINS` in the API environment to a comma-separated list of exact website origins (for example, `https://telecare.example.com`).

If Expo Go is not installed in the Android emulator, install an SDK 58-compatible build from [expo.dev/go](https://expo.dev/go). If the CLI says no development build is installed, use `npm run dev:android`; it forces the Expo Go target.

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

## Troubleshooting

- **App says "Could not reach the server":** API not running, or phone on a different network.
- **Android says no development build is installed:** start with `npm run dev:android` to force Expo Go, and install the SDK 58-compatible Expo Go app if needed.
- **API refuses to start with `JWT_SECRET`:** your `.env` predates Phase 2. Add `JWT_SECRET=` with `openssl rand -base64 48`.
- **App says database unavailable / `/health` is 503:** run `npm run db:up`.
- **"Invalid hook call" / duplicate React:** run `npx expo-doctor` in `apps/mobile` and keep React versions aligned with the Expo SDK.
