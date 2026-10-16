import type { Specialization } from '@telecare/shared';
import { icon, type IconName } from '@/ui';

/**
 * Everyday words for each specialty, for patients who don't know medical
 * terms. The medical name is still shown smaller, since doctors and the
 * printed prescription use it.
 */
export const SPECIALTY: Record<Specialization, { plain: string; icon: IconName }> = {
  'General Physician': { plain: 'Fever, cough & general', icon: icon('thermometer', 'thermometer.medium') },
  Pediatrics: { plain: 'Child doctor', icon: icon('child_care', 'figure.and.child.holdinghands') },
  Gynecology: { plain: "Women's health", icon: icon('pregnant_woman', 'figure.stand.dress') },
  Dermatology: { plain: 'Skin & hair', icon: icon('dermatology', 'hand.raised') },
  Orthopedics: { plain: 'Bones & joints', icon: icon('orthopedics', 'figure.walk') },
  ENT: { plain: 'Ear, nose & throat', icon: icon('hearing', 'ear') },
  Cardiology: { plain: 'Heart', icon: icon('cardiology', 'heart') },
  Psychiatry: { plain: 'Mind & sleep', icon: icon('psychology', 'brain.head.profile') },
};
