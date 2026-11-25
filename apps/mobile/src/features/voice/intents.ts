/**
 * Maps a spoken phrase to an app action. Pure and synchronous so it is trivial
 * to test. Matching is keyword-based (English + Hindi/Hinglish) — no LLM — so a
 * non-technical user can navigate by voice offline.
 */

export type VoiceAction =
  | { kind: 'navigate'; path: string; say: string }
  | { kind: 'specialty'; specialization: string; say: string }
  | { kind: 'back'; say: string }
  | { kind: 'help'; say: string }
  | { kind: 'unknown'; say: string };

/** Specialty keywords → the app's Specialization value. Checked before generic nav. */
const SPECIALTIES: { words: string[]; specialization: string }[] = [
  { words: ['skin', 'rash', 'itch', 'khujli', 'daane', 'pimple', 'acne'], specialization: 'Dermatology' },
  {
    words: ['child', 'baby', 'baccha', 'bachha', 'kid', 'infant', 'pediatric'],
    specialization: 'Pediatrics',
  },
  { words: ['heart', 'chest', 'dil', 'dhadkan', 'cardio', 'bp'], specialization: 'Cardiology' },
  { words: ['bone', 'joint', 'knee', 'haddi', 'back pain', 'ortho'], specialization: 'Orthopedics' },
  { words: ['ear', 'nose', 'throat', 'kaan', 'gala', 'naak', 'ent'], specialization: 'ENT' },
  { words: ['women', 'woman', 'pregnan', 'gynae', 'gyno', 'mahila', 'period'], specialization: 'Gynecology' },
  {
    words: ['mind', 'mental', 'tension', 'depress', 'anxiety', 'stress', 'mann'],
    specialization: 'Psychiatry',
  },
  {
    words: ['fever', 'cough', 'cold', 'general', 'bukhar', 'physician'],
    specialization: 'General Physician',
  },
];

/** Simple screen navigation keywords. */
const SCREENS: { words: string[]; path: string; say: string }[] = [
  { words: ['home', 'ghar', 'start', 'main screen', 'mukhya'], path: '/patient/home', say: 'Opening home' },
  {
    words: ['booking', 'appointment', 'appointments', 'my visits', 'meeting'],
    path: '/patient/appointments',
    say: 'Opening your bookings',
  },
  {
    words: ['medicine', 'medicines', 'dawai', 'dawa', 'pharmacy', 'order', 'prescription'],
    path: '/patient/medicines',
    say: 'Opening medicines',
  },
  {
    words: ['profile', 'my account', 'my detail', 'settings'],
    path: '/patient/profile',
    say: 'Opening your profile',
  },
];

function has(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

export function parseVoiceCommand(transcript: string): VoiceAction {
  const text = transcript.toLowerCase().trim();
  if (!text) return { kind: 'unknown', say: "I didn't catch that. Please try again." };

  // Go back
  if (has(text, ['go back', 'back', 'wapas', 'peeche', 'previous', 'cancel'])) {
    return { kind: 'back', say: 'Going back' };
  }

  // Help / what can I say
  if (has(text, ['help', 'madad', 'what can i say', 'commands', 'kya bol', 'options'])) {
    return {
      kind: 'help',
      say: 'You can say: find a doctor, my bookings, medicines, or profile. You can also name a problem like skin, child, heart, or fever. Say go back to return.',
    };
  }

  // Specialty-specific doctor search (check before generic "doctor")
  for (const s of SPECIALTIES) {
    if (has(text, s.words)) {
      return {
        kind: 'specialty',
        specialization: s.specialization,
        say: `Finding a ${s.specialization} doctor`,
      };
    }
  }

  // Generic "find a doctor"
  if (has(text, ['doctor', 'doctors', 'find a doctor', 'dhundo', 'consult'])) {
    return { kind: 'navigate', path: '/patient/doctors', say: 'Opening doctors' };
  }

  // Other screens
  for (const sc of SCREENS) {
    if (has(text, sc.words)) return { kind: 'navigate', path: sc.path, say: sc.say };
  }

  return {
    kind: 'unknown',
    say: "Sorry, I didn't understand. Say help to hear what you can do.",
  };
}
