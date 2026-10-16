# TeleCare+ — Remote Health & Pharmacy Platform

College minor project: a mobile-first telemedicine + e-pharmacy app.
Journey: **discover → book → consult → prescribe → order → track**.

**Status:** Phase 7 (Prescriptions) complete. During or up to 24 h after a consultation the doctor writes a prescription from the medicine catalog (or free text), issues it, and it appears in the chat as a card and in the patient's Medicines tab, shown in plain words with morning/night pictures. Issued prescriptions are locked by the database; corrections are a withdraw plus a new version. Ordering medicines arrives in Phase 8.

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
npm run dev:mobile   # Expo; press "a" for Android
npm run check        # format + lint + typecheck + all tests
```

Full setup: [docs/SETUP.md](docs/SETUP.md). Plan and decisions: [docs/BLUEPRINT.md](docs/BLUEPRINT.md).
