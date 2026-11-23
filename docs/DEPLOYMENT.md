# Deployment

Not deployed yet. Hosting is decided in Phase 11 (see [BLUEPRINT.md](BLUEPRINT.md) §21–22).

Already deployment-friendly: config comes only from environment variables, the API handles SIGTERM, `/health` works as a health check, and the app reads `EXPO_PUBLIC_API_URL`.

For the browser app, run `npm run build:web` and deploy the generated `apps/mobile/dist` folder with single-page-app route fallback enabled. Set `EXPO_PUBLIC_API_URL` to the public HTTPS API URL when building the website, and set `WEB_ORIGINS` in the API environment to the website's exact origin or origins.
