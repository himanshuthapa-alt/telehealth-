import type { Role } from '@telecare/shared';
import { hashPassword } from './modules/auth/passwords';
import { doctorProfiles } from './modules/users/doctor-profile.schema';
import { createUsersRepository } from './modules/users/users.repository';
import { createDatabase } from './platform/db/client';
import { medicines, pharmacies } from './modules/pharmacy/pharmacy.schema';
import { createScheduleRepository } from './modules/scheduling/scheduling.repository';
import { SEED_DOCTORS, SEED_HOURS } from './seed-doctors';
import { SEED_MEDICINES, SEED_PHARMACY } from './seed-medicines';
import { eq } from 'drizzle-orm';

/** Demo accounts, one per role. Doctors and pharmacy staff can't self-register, so they come from here. */
export const SEED_USERS: { phone: string; fullName: string; role: Role }[] = [
  { phone: '+919000000001', fullName: 'Asha Devi (demo patient)', role: 'PATIENT' },
  { phone: '+919000000002', fullName: 'Dr. Rakesh Sharma (demo doctor)', role: 'DOCTOR' },
  { phone: '+919000000003', fullName: 'City Pharmacy (demo admin)', role: 'PHARMACY_ADMIN' },
];
export const SEED_PASSWORD = 'TeleCare@2026';

try {
  process.loadEnvFile();
} catch {
  // no .env file
}
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed demo accounts with a known password in production.');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (see apps/api/.env.example)');
  process.exit(1);
}

const database = createDatabase(url);
try {
  const users = createUsersRepository(database.db);
  const passwordHash = await hashPassword(SEED_PASSWORD);
  for (const user of SEED_USERS) {
    // Patients accept the privacy notice when they register; staff accounts are provisioned.
    const consentAt = user.role === 'PATIENT' ? new Date() : null;
    const created = await users.create({ ...user, passwordHash, consentAt });
    // eslint-disable-next-line no-console -- CLI output
    console.log(`${created ? 'created ' : 'exists  '} ${user.role.padEnd(14)} ${user.phone}`);
  }

  const schedule = createScheduleRepository(database.db);
  let doctorsAdded = 0;
  let hoursAdded = 0;
  for (const [i, { phone, name, ...profile }] of SEED_DOCTORS.entries()) {
    const user =
      (await users.create({ phone, fullName: name, role: 'DOCTOR', passwordHash, consentAt: null })) ??
      (await users.findByPhone(phone));
    const added = await database.db
      .insert(doctorProfiles)
      .values({ userId: user!.id, ...profile, isDemo: true, registrationNumber: `DEMO-${phone.slice(-4)}` })
      .onConflictDoNothing()
      .returning({ id: doctorProfiles.userId });
    doctorsAdded += added.length;
    // Only give hours to doctors who have none, so a doctor's own edits survive re-seeding.
    if ((await schedule.getAvailability(user!.id, '1970-01-01')).rules.length === 0) {
      await schedule.replaceRules(user!.id, SEED_HOURS[i % SEED_HOURS.length]!);
      hoursAdded += 1;
    }
  }
  // eslint-disable-next-line no-console -- CLI output
  console.log(`doctor profiles: ${doctorsAdded} added, ${SEED_DOCTORS.length - doctorsAdded} already there`);
  // eslint-disable-next-line no-console -- CLI output
  console.log(`consulting hours: set for ${hoursAdded} doctors`);

  // The demo pharmacy and its catalog (only filled the first time, so pharmacy edits survive re-seeding).
  const [existingPharmacy] = await database.db
    .select()
    .from(pharmacies)
    .where(eq(pharmacies.name, SEED_PHARMACY.name));
  const pharmacy =
    existingPharmacy ??
    (
      await database.db
        .insert(pharmacies)
        .values({ ...SEED_PHARMACY, isDemo: true })
        .returning()
    )[0]!;
  const stocked = await database.db
    .select({ id: medicines.id })
    .from(medicines)
    .where(eq(medicines.pharmacyId, pharmacy.id))
    .limit(1);
  if (stocked.length === 0)
    await database.db
      .insert(medicines)
      .values(SEED_MEDICINES.map((m) => ({ ...m, pharmacyId: pharmacy.id, isDemo: true })));
  // eslint-disable-next-line no-console -- CLI output
  console.log(
    `pharmacy: ${pharmacy.name}, catalog ${stocked.length === 0 ? `added (${SEED_MEDICINES.length} medicines)` : 'already there'}`,
  );
  // eslint-disable-next-line no-console -- CLI output
  console.log(`Password for all demo accounts: ${SEED_PASSWORD}`);
} finally {
  await database.close();
}
