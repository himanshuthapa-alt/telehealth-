try {
  process.loadEnvFile();
} catch {
  // CI provides env vars directly
}
