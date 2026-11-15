/**
 * Last-line safety net on any model-written reply (project map §11, §12).
 * TeleCare+ must never say anything that sounds like a diagnosis, a medicine or
 * a dose. If a reply trips this guard, the service discards it and speaks a
 * neutral template instead.
 */
const BANNED = [
  // diagnosis phrasing
  /\byou (probably )?have\b/i,
  /\byou are suffering from\b/i,
  /\baapko .* (hai|hai\.)\b/i,
  /\bआपको .* है\b/,
  /\bdiagnos/i,
  // medicines / doses
  /\b\d+\s?(mg|ml|mcg|tablet|tablets|capsule|drops?)\b/i,
  /\b(paracetamol|ibuprofen|amoxicillin|azithromycin|cipla|crocin|dolo|antibiotic|antibiotics)\b/i,
  /\b\w+(cillin|mycin|prazole|olol|statin)\b/i,
  /\bले लीजिए|खा लीजिए|दवा लें|गोली लें\b/,
  /\btake (this|the) (medicine|tablet|pill)/i,
];

/** True if the text contains anything that reads as medical advice. */
export function readsAsAdvice(text: string): boolean {
  if (!text) return false;
  return BANNED.some((re) => re.test(text));
}
