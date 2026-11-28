import { and, asc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { MedicineSummary } from '@telecare/shared';
import type { Database } from '../../platform/db/client';
import { AppError } from '../../platform/http/errors';
import { stockMovements } from '../orders/orders.schema';
import { medicines } from './pharmacy.schema';

export interface MedicineCatalog {
  /** Active medicines matching name or generic name; empty query lists the first page. */
  search(q: string | undefined, limit: number, withStock?: boolean): Promise<MedicineSummary[]>;
  /** Pharmacy stock correction (blueprint J9). Never below zero; logged as an ADJUST movement. */
  adjustStock(medicineId: string, delta: number, actorId: string): Promise<MedicineSummary>;
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
    async search(q, limit, withStock = false) {
      const pattern = q ? `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : undefined;
      return db
        .select(withStock ? { ...summary, stockQty: medicines.stockQty } : summary)
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
    async adjustStock(medicineId, delta, actorId) {
      return db.transaction(async (tx) => {
        // One conditional UPDATE: concurrent orders and adjustments can never drive stock negative.
        const [row] = await tx
          .update(medicines)
          .set({ stockQty: sql`${medicines.stockQty} + ${delta}` })
          .where(and(eq(medicines.id, medicineId), sql`${medicines.stockQty} + ${delta} >= 0`))
          .returning({ ...summary, stockQty: medicines.stockQty });
        if (!row) {
          const [exists] = await tx
            .select({ id: medicines.id })
            .from(medicines)
            .where(eq(medicines.id, medicineId));
          if (!exists) throw new AppError(404, 'NOT_FOUND', 'Medicine not found');
          throw new AppError(409, 'INSUFFICIENT_STOCK', 'Stock cannot go below zero');
        }
        await tx.insert(stockMovements).values({ medicineId, delta, reason: 'ADJUST', actorId });
        return row;
      });
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
