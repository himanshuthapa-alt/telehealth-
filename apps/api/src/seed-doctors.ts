import type { AvailabilityRule, Language, Specialization } from '@telecare/shared';

export interface SeedDoctor {
  phone: string;
  name: string;
  specializations: Specialization[];
  languages: Language[];
  experienceYears: number;
  feeInr: number;
  ratingAvg: number | null;
  ratingCount: number;
  bio: string;
}

/**
 * Demo doctor directory. Fictional people, marked "(demo)" and is_demo=true
 * (blueprint §16). Varied on purpose so every filter and sort has something to show.
 */
export const SEED_DOCTORS: SeedDoctor[] = [
  {
    phone: '+919000000002',
    name: 'Dr. Rakesh Sharma (demo doctor)',
    specializations: ['General Physician'],
    languages: ['Hindi', 'English'],
    experienceYears: 12,
    feeInr: 300,
    ratingAvg: 4.6,
    ratingCount: 212,
    bio: 'Family doctor for fevers, infections, diabetes and blood pressure follow-ups.',
  },
  {
    phone: '+919000000101',
    name: 'Dr. Meera Iyer (demo)',
    specializations: ['Pediatrics'],
    languages: ['Tamil', 'English', 'Hindi'],
    experienceYears: 9,
    feeInr: 400,
    ratingAvg: 4.8,
    ratingCount: 158,
    bio: 'Child health, vaccinations, growth and nutrition.',
  },
  {
    phone: '+919000000102',
    name: 'Dr. Anil Kumar (demo)',
    specializations: ['General Physician', 'Cardiology'],
    languages: ['Hindi', 'English'],
    experienceYears: 22,
    feeInr: 700,
    ratingAvg: 4.5,
    ratingCount: 340,
    bio: 'Heart health, chest pain review and long-term blood pressure care.',
  },
  {
    phone: '+919000000103',
    name: 'Dr. Farhana Siddiqui (demo)',
    specializations: ['Gynecology'],
    languages: ['Urdu', 'Hindi', 'English'],
    experienceYears: 15,
    feeInr: 500,
    ratingAvg: 4.7,
    ratingCount: 190,
    bio: "Pregnancy care, periods and women's health.",
  },
  {
    phone: '+919000000104',
    name: 'Dr. Suresh Patil (demo)',
    specializations: ['Orthopedics'],
    languages: ['Marathi', 'Hindi'],
    experienceYears: 18,
    feeInr: 600,
    ratingAvg: 4.2,
    ratingCount: 97,
    bio: 'Joint pain, back pain, fractures follow-up and arthritis.',
  },
  {
    phone: '+919000000105',
    name: 'Dr. Ananya Banerjee (demo)',
    specializations: ['Dermatology'],
    languages: ['Bengali', 'English', 'Hindi'],
    experienceYears: 7,
    feeInr: 450,
    ratingAvg: 4.4,
    ratingCount: 76,
    bio: 'Skin rashes, acne, fungal infections and hair loss.',
  },
  {
    phone: '+919000000106',
    name: 'Dr. Venkat Reddy (demo)',
    specializations: ['ENT'],
    languages: ['Telugu', 'English'],
    experienceYears: 11,
    feeInr: 400,
    ratingAvg: 4.1,
    ratingCount: 64,
    bio: 'Ear, nose and throat problems, sinus and hearing complaints.',
  },
  {
    phone: '+919000000107',
    name: 'Dr. Harpreet Kaur (demo)',
    specializations: ['General Physician'],
    languages: ['Punjabi', 'Hindi', 'English'],
    experienceYears: 6,
    feeInr: 250,
    ratingAvg: 4.3,
    ratingCount: 51,
    bio: 'Everyday illnesses, seasonal flu and general check-ups.',
  },
  {
    phone: '+919000000108',
    name: 'Dr. Joseph Thomas (demo)',
    specializations: ['Psychiatry'],
    languages: ['Malayalam', 'English'],
    experienceYears: 14,
    feeInr: 800,
    ratingAvg: 4.9,
    ratingCount: 120,
    bio: 'Anxiety, depression, sleep problems and stress.',
  },
  {
    phone: '+919000000109',
    name: 'Dr. Kavya Rao (demo)',
    specializations: ['Pediatrics', 'General Physician'],
    languages: ['Kannada', 'English', 'Hindi'],
    experienceYears: 4,
    feeInr: 300,
    ratingAvg: 3.9,
    ratingCount: 23,
    bio: 'Common childhood illnesses and family medicine.',
  },
  {
    phone: '+919000000110',
    name: 'Dr. Bhavesh Shah (demo)',
    specializations: ['Dermatology'],
    languages: ['Gujarati', 'Hindi', 'English'],
    experienceYears: 20,
    feeInr: 650,
    ratingAvg: 4.6,
    ratingCount: 205,
    bio: 'Chronic skin conditions, eczema and psoriasis.',
  },
  {
    phone: '+919000000111',
    name: 'Dr. Subhashree Mohanty (demo)',
    specializations: ['Gynecology'],
    languages: ['Odia', 'Hindi', 'English'],
    experienceYears: 10,
    feeInr: 400,
    ratingAvg: 4.0,
    ratingCount: 44,
    bio: 'Antenatal care and family planning advice.',
  },
  {
    phone: '+919000000112',
    name: 'Dr. Pranjal Bora (demo)',
    specializations: ['General Physician'],
    languages: ['Assamese', 'Hindi', 'English'],
    experienceYears: 3,
    feeInr: 200,
    ratingAvg: null,
    ratingCount: 0,
    bio: 'Recently joined. General consultations and follow-ups.',
  },
  {
    phone: '+919000000113',
    name: 'Dr. Sunita Verma (demo)',
    specializations: ['Cardiology'],
    languages: ['Hindi', 'English'],
    experienceYears: 25,
    feeInr: 900,
    ratingAvg: 4.8,
    ratingCount: 410,
    bio: 'Heart rhythm problems, heart failure and post-surgery follow-up.',
  },
  {
    phone: '+919000000114',
    name: 'Dr. Arjun Nair (demo)',
    specializations: ['Orthopedics'],
    languages: ['Malayalam', 'Tamil', 'English'],
    experienceYears: 8,
    feeInr: 500,
    ratingAvg: 3.7,
    ratingCount: 31,
    bio: 'Sports injuries and knee and shoulder pain.',
  },
  {
    phone: '+919000000115',
    name: 'Dr. Ritu Singh (demo)',
    specializations: ['ENT', 'General Physician'],
    languages: ['Hindi', 'Bengali'],
    experienceYears: 13,
    feeInr: 350,
    ratingAvg: 4.4,
    ratingCount: 88,
    bio: 'Throat infections, allergies and general medicine.',
  },
];

const days = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const block = (
  weekdays: number[],
  startTime: string,
  endTime: string,
  slotMinutes: number,
): AvailabilityRule[] => weekdays.map((weekday) => ({ weekday, startTime, endTime, slotMinutes }));

/** Demo consulting hours (IST), cycled across the demo doctors so the slot picker has variety. */
export const SEED_HOURS: AvailabilityRule[][] = [
  block(days(1, 6), '09:00', '13:00', 15), // Mon–Sat mornings
  [...block(days(1, 5), '10:00', '13:00', 20), ...block(days(1, 5), '17:00', '20:00', 20)], // weekdays, morning + evening
  block(days(1, 7), '08:00', '20:00', 30), // every day, long hours: always something bookable in a demo
];
