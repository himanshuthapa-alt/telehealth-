/**
 * Garhwali (gbm) marker words — a PLACEHOLDER list (project map §7.3).
 *
 * Garhwali has no hosted STT/TTS today, so we treat it as "close to Hindi" for
 * understanding and reply with recorded native-speaker clips. These markers are
 * only a weak signal that the speaker is using Garhwali rather than Hindi.
 *
 * ⚠️ This list MUST be rebuilt and verified with native speakers before real use.
 */
export const GARHWALI_MARKERS: readonly string[] = [
  // Devanagari
  'छौं',
  'छन',
  'च',
  'जख',
  'कख',
  'मि',
  'तु',
  'बल',
  'ऐगे',
  'ग्ये',
  'बोडी',
  'ब्वारी',
  'द्वी',
  'स्या',
  // romanised
  'chhaun',
  'jakh',
  'kakh',
  'baadi',
  'bwari',
];

/** Count how many Garhwali markers appear in a transcript. */
export function countGarhwaliMarkers(transcript: string): number {
  const low = transcript.toLowerCase();
  let n = 0;
  for (const m of GARHWALI_MARKERS) {
    if (transcript.includes(m) || low.includes(m.toLowerCase())) n += 1;
  }
  return n;
}
