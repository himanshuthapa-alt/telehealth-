/**
 * Voice receptionist: its only job is to connect the patient to the right
 * doctor. It never gives medical advice. Speech arrives as English (Sarvam
 * translates any Indian language), so every rule here works on English text.
 *
 * Flow: problem → specialty (shared keyword parser; vague → General Physician)
 * → best doctor who speaks the patient's language, earliest free time → "Book?"
 * → yes books it, no offers the next one.
 */
import type {
  DoctorCard,
  Language,
  Page,
  SlotsResponse,
  Specialization,
  VoiceIntent,
} from '@telecare/shared';
import { formatWhen } from '@/features/appointments/format';

/** Sarvam's detected language → the language a doctor lists. */
export const LANGUAGE_BY_CODE: Record<string, Language> = {
  'hi-IN': 'Hindi',
  'en-IN': 'English',
  'bn-IN': 'Bengali',
  'mr-IN': 'Marathi',
  'te-IN': 'Telugu',
  'ta-IN': 'Tamil',
  'gu-IN': 'Gujarati',
  'ur-IN': 'Urdu',
  'kn-IN': 'Kannada',
  'od-IN': 'Odia',
  'ml-IN': 'Malayalam',
  'pa-IN': 'Punjabi',
  'as-IN': 'Assamese',
};

const NO = /\b(no|nope|nah|not|don'?t|another|other|different|later|nahi|nahin|mat)\b/;
const YES = /\b(yes|yeah|yep|ok|okay|sure|book|confirm|go ahead|please do|haan|han|ha|theek|thik|done)\b/;

/** "yes" / "no" / null (didn't say either). "No" wins, so "no, book another" is a no. */
export function yesNo(text: string): 'yes' | 'no' | null {
  const t = text.toLowerCase();
  if (NO.test(t)) return 'no';
  if (YES.test(t)) return 'yes';
  return null;
}

/** What the patient's words mean for the receptionist. */
export type Heard =
  { kind: 'emergency' } | { kind: 'specialty'; specialization: Specialization } | { kind: 'unclear' };

export function understandProblem(intent: VoiceIntent): Heard {
  if (intent.kind === 'emergency') return { kind: 'emergency' };
  if (intent.kind === 'find_doctor')
    return { kind: 'specialty', specialization: intent.specialization ?? 'General Physician' };
  return { kind: 'unclear' };
}

export interface Offer {
  doctor: DoctorCard;
  startAt: string;
}

export const offerKey = (o: Offer) => `${o.doctor.id}@${o.startAt}`;

type Get = <T>(path: string) => Promise<T>;

/**
 * The best next offer: among top-rated doctors of this specialty (speaking the
 * patient's language if any do), the earliest free time. `declined` holds doctor
 * ids the patient said no to (a "no" means "someone else") and offer keys of
 * times that were taken meanwhile.
 * ponytail: looks at the top 5 doctors only; page further if specialties grow large.
 */
export async function findOffer(
  get: Get,
  specialization: Specialization,
  language: Language | undefined,
  declined: Set<string>,
): Promise<Offer | null> {
  const search = async (lang?: Language) => {
    const qs = new URLSearchParams({ specialization, sort: 'rating', available: 'week' });
    if (lang) qs.set('language', lang);
    return (await get<Page<DoctorCard>>(`/v1/doctors?${qs}`)).items.slice(0, 5);
  };
  let doctors = language ? await search(language) : [];
  if (doctors.length === 0) doctors = await search();

  const offers = await Promise.all(
    doctors
      .filter((d) => !declined.has(d.id))
      .map(async (doctor) => {
        const slots = await get<SlotsResponse>(`/v1/doctors/${encodeURIComponent(doctor.id)}/slots?days=14`);
        const free = slots.days
          .flatMap((d) => d.slots)
          .map((s) => ({ doctor, startAt: s.startAt }))
          .find((o) => !declined.has(offerKey(o)));
        return free ?? null;
      }),
  );
  // Earliest time wins; doctors are already in rating order for ties.
  return (
    offers
      .filter((o): o is Offer => o !== null)
      .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))[0] ?? null
  );
}

/** "Kannada, English and Hindi" */
const listOf = (items: readonly string[]) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

/** What the receptionist says (English; the server speaks it in the patient's language). */
export const SAY = {
  greet:
    "Namaste! I'm the TeleCare receptionist. Tell me what the problem is, and I'll connect you to the right doctor.",
  unclear: 'Please tell me the problem, like fever, cough, skin, a child, heart, or pain.',
  emergency: 'This may be an emergency. Please call 108 or 112 now.',
  offer: (o: Offer, now?: Date) =>
    `${o.doctor.name}, ${o.doctor.specializations[0]} specialist, speaks ${listOf(o.doctor.languages)}, fee ${o.doctor.feeInr} rupees. Free ${formatWhen(o.startAt, now)}. Shall I book it? Say yes or no.`,
  askYesNo: 'Please say yes to book, or no for another doctor.',
  booked: (o: Offer, now?: Date) =>
    `Done! You are booked with ${o.doctor.name}, ${formatWhen(o.startAt, now)}. I will remind you before it starts.`,
  none: 'Sorry, no doctor is free in the next two weeks for this. You can look at all doctors yourself.',
  tooMany: 'Let me show you all the doctors, so you can choose yourself.',
  taken: 'That time was just taken. Let me find the next one.',
  failed: "Sorry, I couldn't book that. Please try again.",
};
