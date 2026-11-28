import { and, desc, eq, ne, sql } from 'drizzle-orm';
import type { Order, OrderAddress, OrderStatus } from '@telecare/shared';
import type { Database, DbExecutor } from '../../platform/db/client';
import { medicines, pharmacies } from '../pharmacy/pharmacy.schema';
import { users } from '../users/users.schema';
import { prescriptionItems } from '../prescriptions/prescriptions.schema';
import { orderItems, orders, orderStatusHistory, stockMovements } from './orders.schema';

export interface CreateOrderParams {
  trackingId: string;
  patientId: string;
  prescriptionId?: string | null;
  pharmacyId: string;
  address: OrderAddress;
  subtotalPaise: number;
  deliveryFeePaise: number;
  totalPaise: number;
  idempotencyKey?: string;
  items: {
    prescriptionItemId?: string | null;
    medicineId: string;
    medicineName: string;
    quantity: number;
    pricePaise: number;
  }[];
  actorId: string;
  actorRole: string;
}

export interface UpdateOrderStatusParams {
  orderId: string;
  expectedCurrentStatus?: OrderStatus;
  nextStatus: OrderStatus;
  actorId: string;
  actorRole: string;
  note?: string;
  cancelReason?: string;
}

export interface OrderRepository {
  create(params: CreateOrderParams): Promise<Order>;
  findById(id: string): Promise<Order | null>;
  findByTrackingId(trackingId: string): Promise<Order | null>;
  listByPatient(patientId: string): Promise<Order[]>;
  listByPharmacy(pharmacyId?: string, status?: OrderStatus): Promise<Order[]>;
  updateStatus(params: UpdateOrderStatusParams): Promise<Order | null>;
  getOrderedQuantityForPrescriptionItem(prescriptionItemId: string): Promise<number>;
  getDefaultPharmacyId(): Promise<string>;
  getMedicineStock(
    medicineId: string,
  ): Promise<{ stockQty: number; pricePaise: number; name: string; requiresPrescription: boolean } | null>;
}

export function createOrderRepository(db: Database): OrderRepository {
  async function loadOrderWithDetails(orderId: string, tx: DbExecutor = db): Promise<Order | null> {
    const [orderRow] = await tx
      .select({
        id: orders.id,
        trackingId: orders.trackingId,
        patientId: orders.patientId,
        patientName: users.fullName,
        prescriptionId: orders.prescriptionId,
        pharmacyId: orders.pharmacyId,
        pharmacyName: pharmacies.name,
        status: orders.status,
        addressJson: orders.addressJson,
        subtotalPaise: orders.subtotalPaise,
        deliveryFeePaise: orders.deliveryFeePaise,
        totalPaise: orders.totalPaise,
        paymentMethod: orders.paymentMethod,
        paymentStatus: orders.paymentStatus,
        cancelReason: orders.cancelReason,
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
      })
      .from(orders)
      .innerJoin(users, eq(orders.patientId, users.id))
      .innerJoin(pharmacies, eq(orders.pharmacyId, pharmacies.id))
      .where(eq(orders.id, orderId));

    if (!orderRow) return null;

    const itemsRows = await tx
      .select({
        id: orderItems.id,
        orderId: orderItems.orderId,
        prescriptionItemId: orderItems.prescriptionItemId,
        medicineId: orderItems.medicineId,
        medicineName: orderItems.medicineName,
        quantity: orderItems.quantity,
        pricePaise: orderItems.pricePaise,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));

    const historyRows = await tx
      .select({
        id: orderStatusHistory.id,
        orderId: orderStatusHistory.orderId,
        fromStatus: orderStatusHistory.fromStatus,
        toStatus: orderStatusHistory.toStatus,
        actorRole: orderStatusHistory.actorRole,
        note: orderStatusHistory.note,
        at: orderStatusHistory.at,
      })
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, orderId))
      .orderBy(orderStatusHistory.at);

    return {
      id: orderRow.id,
      trackingId: orderRow.trackingId,
      patientId: orderRow.patientId,
      patientName: orderRow.patientName,
      prescriptionId: orderRow.prescriptionId,
      pharmacyId: orderRow.pharmacyId,
      pharmacyName: orderRow.pharmacyName,
      status: orderRow.status,
      address: JSON.parse(orderRow.addressJson) as OrderAddress,
      subtotalPaise: orderRow.subtotalPaise,
      deliveryFeePaise: orderRow.deliveryFeePaise,
      totalPaise: orderRow.totalPaise,
      paymentMethod: orderRow.paymentMethod,
      paymentStatus: orderRow.paymentStatus,
      cancelReason: orderRow.cancelReason,
      items: itemsRows,
      history: historyRows.map((h) => ({
        ...h,
        at: h.at.toISOString(),
      })),
      createdAt: orderRow.createdAt.toISOString(),
      updatedAt: orderRow.updatedAt.toISOString(),
    };
  }

  return {
    async getDefaultPharmacyId() {
      const [row] = await db.select({ id: pharmacies.id }).from(pharmacies).limit(1);
      if (!row) throw new Error('No pharmacy found in database');
      return row.id;
    },

    async getMedicineStock(medicineId: string) {
      const [row] = await db
        .select({
          stockQty: medicines.stockQty,
          pricePaise: medicines.pricePaise,
          name: medicines.name,
          requiresPrescription: medicines.requiresPrescription,
        })
        .from(medicines)
        .where(eq(medicines.id, medicineId));
      return row ?? null;
    },

    async getOrderedQuantityForPrescriptionItem(prescriptionItemId: string) {
      const [result] = await db
        .select({
          totalQty: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::integer`,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(and(eq(orderItems.prescriptionItemId, prescriptionItemId), ne(orders.status, 'CANCELLED')));
      return result?.totalQty ?? 0;
    },

    async create(params) {
      return db.transaction(async (tx) => {
        // Idempotency check
        if (params.idempotencyKey) {
          const [existing] = await tx
            .select({ id: orders.id })
            .from(orders)
            .where(
              and(eq(orders.patientId, params.patientId), eq(orders.idempotencyKey, params.idempotencyKey)),
            );
          if (existing) {
            const loaded = await loadOrderWithDetails(existing.id, tx);
            if (loaded) return loaded;
          }
        }

        // 0. Re-check prescription allowances under a row lock, so two orders placed at the
        //    same moment can't both pass the service's pre-check and exceed the prescription.
        for (const item of params.items) {
          if (!item.prescriptionItemId) continue;
          const [rxItem] = await tx
            .select({ quantity: prescriptionItems.quantity })
            .from(prescriptionItems)
            .where(eq(prescriptionItems.id, item.prescriptionItemId))
            .for('update');
          const [ordered] = await tx
            .select({ qty: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::integer` })
            .from(orderItems)
            .innerJoin(orders, eq(orderItems.orderId, orders.id))
            .where(
              and(eq(orderItems.prescriptionItemId, item.prescriptionItemId), ne(orders.status, 'CANCELLED')),
            );
          if (!rxItem || (ordered?.qty ?? 0) + item.quantity > rxItem.quantity)
            throw new Error(`QUANTITY_EXCEEDS_PRESCRIPTION: ${item.medicineName}`);
        }

        // 1. Reserve stock for each item (must not go below 0)
        for (const item of params.items) {
          const updated = await tx
            .update(medicines)
            .set({
              stockQty: sql`${medicines.stockQty} - ${item.quantity}`,
              updatedAt: new Date(),
            })
            .where(and(eq(medicines.id, item.medicineId), sql`${medicines.stockQty} >= ${item.quantity}`))
            .returning({ id: medicines.id, stockQty: medicines.stockQty });

          if (updated.length === 0) {
            throw new Error(`INSUFFICIENT_STOCK: ${item.medicineName}`);
          }
        }

        // 2. Insert order
        const [createdOrder] = await tx
          .insert(orders)
          .values({
            trackingId: params.trackingId,
            patientId: params.patientId,
            prescriptionId: params.prescriptionId ?? null,
            pharmacyId: params.pharmacyId,
            status: 'PENDING',
            addressJson: JSON.stringify(params.address),
            subtotalPaise: params.subtotalPaise,
            deliveryFeePaise: params.deliveryFeePaise,
            totalPaise: params.totalPaise,
            paymentMethod: 'CASH_ON_DELIVERY',
            paymentStatus: 'PENDING',
            idempotencyKey: params.idempotencyKey ?? null,
          })
          .returning({ id: orders.id });

        if (!createdOrder) throw new Error('Failed to create order record');

        // 3. Insert order items & record stock movements
        for (const item of params.items) {
          await tx.insert(orderItems).values({
            orderId: createdOrder.id,
            prescriptionItemId: item.prescriptionItemId ?? null,
            medicineId: item.medicineId,
            medicineName: item.medicineName,
            quantity: item.quantity,
            pricePaise: item.pricePaise,
          });

          await tx.insert(stockMovements).values({
            medicineId: item.medicineId,
            delta: -item.quantity,
            reason: 'ORDER',
            refId: createdOrder.id,
            actorId: params.actorId,
          });
        }

        // 4. Record first order history row
        await tx.insert(orderStatusHistory).values({
          orderId: createdOrder.id,
          fromStatus: null,
          toStatus: 'PENDING',
          actorId: params.actorId,
          actorRole: params.actorRole,
          note: 'Order placed by patient (Cash on Delivery)',
        });

        const loaded = await loadOrderWithDetails(createdOrder.id, tx);
        if (!loaded) throw new Error('Failed to load created order');
        return loaded;
      });
    },

    async findById(id) {
      return loadOrderWithDetails(id);
    },

    async findByTrackingId(trackingId) {
      const [row] = await db.select({ id: orders.id }).from(orders).where(eq(orders.trackingId, trackingId));
      if (!row) return null;
      return loadOrderWithDetails(row.id);
    },

    async listByPatient(patientId) {
      const rows = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.patientId, patientId))
        .orderBy(desc(orders.createdAt));

      const results: Order[] = [];
      for (const row of rows) {
        const order = await loadOrderWithDetails(row.id);
        if (order) results.push(order);
      }
      return results;
    },

    async listByPharmacy(pharmacyId, status) {
      const condition = and(
        pharmacyId ? eq(orders.pharmacyId, pharmacyId) : undefined,
        status ? eq(orders.status, status) : undefined,
      );

      const rows = await db
        .select({ id: orders.id })
        .from(orders)
        .where(condition)
        .orderBy(desc(orders.createdAt));

      const results: Order[] = [];
      for (const row of rows) {
        const order = await loadOrderWithDetails(row.id);
        if (order) results.push(order);
      }
      return results;
    },

    async updateStatus(params) {
      return db.transaction(async (tx) => {
        // Fetch current order
        const [current] = await tx
          .select({
            id: orders.id,
            status: orders.status,
            pharmacyId: orders.pharmacyId,
          })
          .from(orders)
          .where(eq(orders.id, params.orderId));

        if (!current) return null;

        if (params.expectedCurrentStatus && current.status !== params.expectedCurrentStatus) {
          return null; // Concurrency conflict
        }

        // Conditional status update
        const updated = await tx
          .update(orders)
          .set({
            status: params.nextStatus,
            cancelReason: params.cancelReason ?? null,
            updatedAt: new Date(),
          })
          .where(and(eq(orders.id, params.orderId), eq(orders.status, current.status)))
          .returning({ id: orders.id });

        if (updated.length === 0) return null;

        // If transitioning to CANCELLED, release reserved stock
        if (params.nextStatus === 'CANCELLED') {
          const items = await tx
            .select({
              medicineId: orderItems.medicineId,
              quantity: orderItems.quantity,
            })
            .from(orderItems)
            .where(eq(orderItems.orderId, params.orderId));

          for (const item of items) {
            await tx
              .update(medicines)
              .set({
                stockQty: sql`${medicines.stockQty} + ${item.quantity}`,
                updatedAt: new Date(),
              })
              .where(eq(medicines.id, item.medicineId));

            await tx.insert(stockMovements).values({
              medicineId: item.medicineId,
              delta: item.quantity,
              reason: 'CANCEL',
              refId: params.orderId,
              actorId: params.actorId,
            });
          }
        }

        // Record history row
        await tx.insert(orderStatusHistory).values({
          orderId: params.orderId,
          fromStatus: current.status,
          toStatus: params.nextStatus,
          actorId: params.actorId,
          actorRole: params.actorRole,
          note: params.note ?? null,
        });

        return loadOrderWithDetails(params.orderId, tx);
      });
    },
  };
}
