import { Redirect } from 'expo-router';
import type { Role } from '@telecare/shared';
import { useSession } from '@/lib/api';

const HOME = {
  PATIENT: '/patient/home',
  DOCTOR: '/doctor/today',
  PHARMACY_ADMIN: '/pharmacy/orders',
} as const satisfies Record<Role, string>;

/** Entry point: sends each user to the right place. */
export default function Index() {
  const state = useSession();
  if (state.status !== 'signedIn') return <Redirect href="/welcome" />;
  return <Redirect href={HOME[state.user.role]} />;
}
