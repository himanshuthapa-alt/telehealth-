# TeleCare+ — Remote Health & Pharmacy Platform

College minor project: a mobile-first telemedicine + e-pharmacy app.
Journey: **discover → book → consult → prescribe → order → track**.

**Status:** Phase 8 (Orders & Pharmacy) complete. During or up to 24 h after a consultation the doctor writes a prescription from the medicine catalog (or free text), issues it, and it appears in the chat as a card and in the patient's Medicines tab. Patients can build an order directly from the prescription with Cash on Delivery (COD), tracking each order via Crockford Base32 tracking IDs (`TC-XXXX-XXXX`) and a real-time status timeline. Pharmacy staff manage incoming orders and inventory directly through the app queue. Also includes Phase 7.5 Bolo voice & symptom triage with emergency red-flag warnings.

| Path              | What                                                         |
| ----------------- | ------------------------------------------------------------ |
| `apps/mobile`     | React Native (Expo, expo-router) app for all three roles     |
| `apps/api`        | Node.js + TypeScript + Express modular monolith, PostgreSQL  |
| `packages/shared` | Types shared by app and API (roles, error codes, API shapes) |
| `docs/`           | Blueprint and project docs                                   |

## Quick start

```sh
npm install
npm run db:up        # PostgreSQL 18 in Docker
cp apps/api/.env.example apps/api/.env
npm run db:migrate
npm run db:seed      # demo patient, doctor and pharmacy accounts
npm run dev:api      # http://localhost:4000/health
npm run dev:mobile   # Expo Go QR code, Android emulator, or press "w" for web
npm run dev:web      # open the web app directly in a browser
npm run build:web    # export the production web app to apps/mobile/dist
npm run check        # format + lint + typecheck + all tests
```

For laptop phone-size preview, open the web app and use the browser's device toolbar (Ctrl+Shift+M in Edge/Chrome). For a physical Android phone, install an Expo Go build compatible with SDK 58 and scan the QR code; the phone and laptop should be on the same Wi-Fi. See [device and browser setup](docs/SETUP.md#run-on-web-and-mobile-devices).

Full setup: [docs/SETUP.md](docs/SETUP.md). Plan and decisions: [docs/BLUEPRINT.md](docs/BLUEPRINT.md).
