import { eq } from 'drizzle-orm';
import type { Role } from '@telecare/shared';
import type { DbExecutor } from '../../platform/db/client';
import { users } from './users.schema';

export interface UserRecord {
  id: string;
  phone: string;
  fullName: string;
  role: Role;
  passwordHash: string;
}

export interface NewUser {
  phone: string;
  fullName: string;
  role: Role;
  passwordHash: string;
  consentAt: Date | null;
}

/** Storage for users. Business rules depend on this interface, not on PostgreSQL (decision D1). */
export interface UsersRepository {
  findByPhone(phone: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  /** Returns null if the phone number is already registered. */
  create(user: NewUser): Promise<UserRecord | null>;
  updatePassword(id: string, passwordHash: string): Promise<void>;
}

const columns = {
  id: users.id,
  phone: users.phone,
  fullName: users.fullName,
  role: users.role,
  passwordHash: users.passwordHash,
};

export function createUsersRepository(db: DbExecutor): UsersRepository {
  return {
    async findByPhone(phone) {
      const [row] = await db.select(columns).from(users).where(eq(users.phone, phone));
      return row ?? null;
    },
    async findById(id) {
      const [row] = await db.select(columns).from(users).where(eq(users.id, id));
      return row ?? null;
    },
    async create(user) {
      const [row] = await db.insert(users).values(user).onConflictDoNothing().returning(columns);
      return row ?? null;
    },
    async updatePassword(id, passwordHash) {
      await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, id));
    },
  };
}
