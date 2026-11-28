# Deployment

The API is ready to host: config comes only from environment variables, migrations run before each
deploy, `/health` is the health check, and SIGTERM shuts down cleanly. The app finds the server
through `EXPO_PUBLIC_API_URL` at build time **or** the in-app "Server settings" on the welcome screen
(no rebuild needed when the URL changes).

## 1. Database: Neon (free)

1. Create a project at neon.tech (region: Singapore or Mumbai if offered).
2. Copy the connection string (`postgres://…?sslmode=require`).

## 2. API: Render (free)

1. Push the branch to GitHub. In Render: **New → Blueprint** → pick the repo. It reads `render.yaml`.
2. Set `DATABASE_URL` to the Neon string. `JWT_SECRET` is generated for you.
3. Deploy. Render runs `npm run db:migrate`, then starts the API. Open `https://<name>.onrender.com/health`:
   `{"status":"ok", … "database":"up"}`.

Free Render services sleep after ~15 minutes idle; the first request then takes ~30 s.
**Before a demo, open `/health` two minutes early.** (Railway or Fly don't sleep, if that matters.)

## 3. Demo accounts on the hosted database

The seed refuses `NODE_ENV=production` on purpose (it creates accounts with a known password).
Seed once from your laptop against the hosted database:

```sh
DATABASE_URL='postgres://…neon…' NODE_ENV=development npm run db:seed
```

Before each rehearsal, clear bookings, chats, prescriptions and orders (accounts are kept):

```sh
DATABASE_URL='postgres://…neon…' npm run db:demo-reset -- --confirm
```

## 4. Video (100ms)

Set `VIDEO_PROVIDER=hms` and `HMS_ACCESS_KEY`, `HMS_APP_SECRET`, `HMS_TEMPLATE_ID` in Render. See
[SETUP.md](SETUP.md#video).

## 5. Android APK

```sh
cd apps/mobile
EXPO_PUBLIC_API_URL=https://<name>.onrender.com npx expo prebuild --platform android --clean
cd android && ./gradlew :app:assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

The generated project signs release builds with the debug key: fine for installing from a file on
your own phones, **not** for the Play Store (that needs your own upload key or EAS Build).
Without `EXPO_PUBLIC_API_URL`, set the server on the welcome screen → Server settings.

## Checklist before the viva

- [ ] `/health` is ok on the hosted URL
- [ ] Demo reset run; seeded accounts log in from the APK on mobile data (not Wi-Fi)
- [ ] One full journey on the hosted setup (doctor, patient, pharmacy)
- [ ] Video call tested on two phones (or `VIDEO_PROVIDER=fake` decided)
- [ ] Fallback screen recording on the laptop
