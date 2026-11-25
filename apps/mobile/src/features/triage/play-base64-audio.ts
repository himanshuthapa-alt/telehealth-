export function playBase64Audio(_audioBase64: string, _contentType: string): Promise<void> {
  return Promise.reject(new Error('Audio playback is not supported on this platform.'));
}
