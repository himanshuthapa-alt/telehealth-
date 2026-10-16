import { and, asc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { MedicineSummary } from '@telecare/shared';
import type { Database } from '../../platform/db/client';
import { medicines } from './pharmacy.schema';

export interface MedicineCatalog {
  /** Active medicines matching name or generic name; empty query lists the first page. */
  search(q: string | undefined, limit: number): Promise<MedicineSummary[]>;
  /** Which of these ids are active catalog medicines. */
  existing(ids: string[]): Promise<Set<string>>;
}

const summary = {
  id: medicines.id,
  name: medicines.name,
  genericName: medicines.genericName,
  form: medicines.form,
  strength: medicines.strength,
  packSize: medicines.packSize,
  pricePaise: medicines.pricePaise,
  inStock: sql<boolean>`${medicines.stockQty} > 0`,
  requiresPrescription: medicines.requiresPrescription,
};

export function createMedicineCatalog(db: Database): MedicineCatalog {
  return {
    async search(q, limit) {
      const pattern = q ? `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : undefined;
      return db
        .select(summary)
        .from(medicines)
        .where(
          and(
            eq(medicines.isActive, true),
            pattern ? or(ilike(medicines.name, pattern), ilike(medicines.genericName, pattern)) : undefined,
          ),
        )
        .orderBy(asc(medicines.name))
        .limit(limit);
    },
    async existing(ids) {
      if (ids.length === 0) return new Set();
      const rows = await db
        .select({ id: medicines.id })
        .from(medicines)
        .where(and(inArray(medicines.id, ids), eq(medicines.isActive, true)));
      return new Set(rows.map((r) => r.id));
    },
  };
}
