# Deployment

Not deployed yet. Hosting is decided in Phase 11 (see [BLUEPRINT.md](BLUEPRINT.md) §21–22).

Already deployment-friendly: config comes only from environment variables, the API handles SIGTERM, `/health` works as a health check, and the app reads `EXPO_PUBLIC_API_URL`.
