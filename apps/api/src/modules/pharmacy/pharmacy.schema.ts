import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { MEDICINE_FORMS } from '@telecare/shared';

export const medicineForm = pgEnum('medicine_form', MEDICINE_FORMS);

/** One pharmacy in the MVP; the model allows more (blueprint §11). */
export const pharmacies = pgTable('pharmacies', {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text().notNull(),
  address: text().notNull(),
  isDemo: boolean().notNull().default(false),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const medicines = pgTable(
  'medicines',
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    pharmacyId: uuid()
      .notNull()
      .references(() => pharmacies.id),
    name: text().notNull(),
    genericName: text(),
    form: medicineForm().notNull(),
    strength: text(),
    packSize: text(),
    /** Paise (₹1 = 100): money is never a float. */
    pricePaise: integer().notNull(),
    stockQty: integer().notNull().default(0),
    requiresPrescription: boolean().notNull().default(true),
    isActive: boolean().notNull().default(true),
    isDemo: boolean().notNull().default(false),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.pharmacyId),
    check('medicine_price_non_negative', sql`${t.pricePaise} >= 0`),
    check('medicine_stock_non_negative', sql`${t.stockQty} >= 0`),
  ],
);
