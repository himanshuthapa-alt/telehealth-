import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES, STOCK_MOVEMENT_REASONS } from '@telecare/shared';
import { pharmacies, medicines } from '../pharmacy/pharmacy.schema';
import { prescriptions, prescriptionItems } from '../prescriptions/prescriptions.schema';
import { users } from '../users/users.schema';

export const orderStatus = pgEnum('order_status', ORDER_STATUSES);
export const paymentMethod = pgEnum('payment_method', PAYMENT_METHODS);
export const paymentStatus = pgEnum('payment_status', PAYMENT_STATUSES);
export const stockMovementReason = pgEnum('stock_movement_reason', STOCK_MOVEMENT_REASONS);

export const orders = pgTable(
  'orders',
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    trackingId: text().notNull().unique(),
    patientId: uuid()
      .notNull()
      .references(() => users.id),
    prescriptionId: uuid().references(() => prescriptions.id),
    pharmacyId: uuid()
      .notNull()
      .references(() => pharmacies.id),
    status: orderStatus().notNull().default('PENDING'),
    addressJson: text().notNull(),
    subtotalPaise: integer().notNull(),
    deliveryFeePaise: integer().notNull().default(0),
    totalPaise: integer().notNull(),
    paymentMethod: paymentMethod().notNull().default('CASH_ON_DELIVERY'),
    paymentStatus: paymentStatus().notNull().default('PENDING'),
    cancelReason: text(),
    idempotencyKey: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.patientId),
    index().on(t.pharmacyId),
    index().on(t.status),
    uniqueIndex('orders_patient_idempotency')
      .on(t.patientId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
    check('order_subtotal_non_negative', sql`${t.subtotalPaise} >= 0`),
    check('order_total_non_negative', sql`${t.totalPaise} >= 0`),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orderId: uuid()
      .notNull()
      .references(() => orders.id),
    prescriptionItemId: uuid().references(() => prescriptionItems.id),
    medicineId: uuid()
      .notNull()
      .references(() => medicines.id),
    medicineName: text().notNull(),
    quantity: integer().notNull(),
    pricePaise: integer().notNull(),
  },
  (t) => [
    index().on(t.orderId),
    index().on(t.medicineId),
    check('order_item_qty_positive', sql`${t.quantity} > 0`),
    check('order_item_price_non_negative', sql`${t.pricePaise} >= 0`),
  ],
);

export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orderId: uuid()
      .notNull()
      .references(() => orders.id),
    fromStatus: orderStatus(),
    toStatus: orderStatus().notNull(),
    actorId: uuid()
      .notNull()
      .references(() => users.id),
    actorRole: text().notNull(),
    note: text(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.orderId)],
);

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    medicineId: uuid()
      .notNull()
      .references(() => medicines.id),
    delta: integer().notNull(),
    reason: stockMovementReason().notNull(),
    refId: uuid(),
    actorId: uuid()
      .notNull()
      .references(() => users.id),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.medicineId), index().on(t.refId)],
);
