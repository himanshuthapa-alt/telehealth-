# TeleCare+ — Remote Health & Pharmacy Platform

College minor project: a mobile-first telemedicine + e-pharmacy app.
Journey: **discover → book → consult → prescribe → order → track**.

**Status:** feature-complete for the minor-project demo (branch `sandbox/minor-project-demo`). The full journey runs: doctors sign up with their medical council registration and are verified by an admin; patients find (real doctors first), book, consult (chat; real video via 100ms with `VIDEO_PROVIDER=hms`), receive a prescription that shows the doctor's qualification and registration number, order it for cash on delivery and track it, while the pharmacy confirms, packs, ships and manages stock. An in-app inbox tells each person what happened. Voice navigation (English/Hindi/Hinglish) helps low-literacy patients. The plan, test matrix, bug log and demo script are in **[docs/MINOR_PROJECT_PLAN.md](docs/MINOR_PROJECT_PLAN.md)**.

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
npm run db:seed      # demo patient, doctor, pharmacy and admin accounts
npm run dev:api      # http://localhost:4000/health
npm run dev:mobile   # Expo; press "a" for Android
npm run check        # format + lint + typecheck + all tests
```

Full setup: [docs/SETUP.md](docs/SETUP.md). Plan and decisions: [docs/BLUEPRINT.md](docs/BLUEPRINT.md).
