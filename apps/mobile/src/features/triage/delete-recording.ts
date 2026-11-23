/** Platform-specific implementations are selected by Expo; this is a type-checking fallback. */
export function deleteRecording(_uri: string): Promise<void> {
  return Promise.resolve();
}
