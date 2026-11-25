/**
 * Mobile voice controller: turns a shared `VoiceIntent` into spoken/visible
 * copy and the matching screen navigation. The parsing itself lives in
 * `@telecare/shared` (`parseVoiceIntent`) so the app and the API agree.
 *
 * Voice only navigates. Anything that books, orders, cancels or spends money
 * happens on the destination screen, behind that screen's own confirmation —
 * so a misheard word can never spend money.
 */
import { router } from 'expo-router';
import { parseVoiceIntent, type VoiceIntent } from '@telecare/shared';

export { parseVoiceIntent };
export type { VoiceIntent };

/** English confirmation, spoken via Chatterbox and shown on screen. */
export function sayForIntent(intent: VoiceIntent): string {
  switch (intent.kind) {
    case 'emergency':
      return 'This may be an emergency. Please call 108 or 112 now.';
    case 'find_doctor':
      return intent.specialization ? `Finding a ${intent.specialization} doctor` : 'Opening doctors';
    case 'list_appointments':
      return 'Opening your bookings';
    case 'show_prescriptions':
      return 'Opening medicines';
    case 'go_home':
      return 'Opening home';
    case 'go_back':
      return 'Going back';
    case 'help':
      return 'You can say: find a doctor, my bookings, medicines, or go home. You can also name a problem like skin, child, heart, or fever. Say go back to return.';
    case 'unknown':
      return "Sorry, I didn't understand. Say help to hear what you can do.";
  }
}

/** Navigate for the intent. Emergency, help and unknown stay put. */
export function navigateIntent(intent: VoiceIntent): void {
  switch (intent.kind) {
    case 'find_doctor':
      router.navigate(
        intent.specialization
          ? ({ pathname: '/patient/doctors', params: { specialization: intent.specialization } } as never)
          : ('/patient/doctors' as never),
      );
      break;
    case 'list_appointments':
      router.navigate('/patient/appointments' as never);
      break;
    case 'show_prescriptions':
      router.navigate('/patient/medicines' as never);
      break;
    case 'go_home':
      router.navigate('/patient/home' as never);
      break;
    case 'go_back':
      router.back();
      break;
    case 'emergency':
    case 'help':
    case 'unknown':
      break;
  }
}
