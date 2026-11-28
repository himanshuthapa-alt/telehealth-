import type { Notify } from '../notifications/notifications';
import {
  istDate,
  canTransitionOrder,
  generateTrackingId,
  isExpired,
  type CreateOrderRequest,
  type FulfillmentSource,
  type Order,
  type OrderStatus,
  type Role,
  type UpdateOrderStatusRequest,
} from '@telecare/shared';
import { AppError } from '../../platform/http/errors';
import type { AuditLog } from '../audit/audit';
import type { PrescriptionRepository } from '../prescriptions/prescriptions.repository';
import { mapPartnerStatus } from './fulfillment.partner';
import type { OrderRepository } from './orders.repository';

export interface OrderServiceActor {
  id: string;
  role: Role;
}

export interface OrderServiceDeps {
  repo: OrderRepository;
  prescriptions: PrescriptionRepository;
  audit: AuditLog;
  now?: () => Date;
  /** Who fulfils orders: 'local' (pharmacy queue) or 'partner' (external). */
  fulfillmentProvider?: FulfillmentSource;
  /** Inbox message to the patient on each status change. */
  notify?: Notify;
}

const ORDER_WORDS: Record<string, string> = {
  PENDING: 'received',
  CONFIRMED: 'confirmed',
  PACKED: 'packed',
  SHIPPED: 'on the way',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
};

export function createOrderService({
  repo,
  prescriptions,
  audit,
  now = () => new Date(),
  fulfillmentProvider = 'local',
  notify = async () => undefined,
}: OrderServiceDeps) {
  const service = {
    async createOrder(actor: OrderServiceActor, request: CreateOrderRequest): Promise<Order> {
      if (actor.role !== 'PATIENT') {
        throw new AppError(403, 'FORBIDDEN', 'Only patients can create orders');
      }

      if (!request.items || request.items.length === 0) {
        throw new AppError(400, 'VALIDATION_FAILED', 'Order must have at least one medicine item');
      }

      // IST calendar date: prescriptions expire at IST midnight, not UTC midnight.
      const todayStr = istDate(now());
      if (!request.prescriptionId && request.items.some((i) => i.prescriptionItemId))
        throw new AppError(400, 'INVALID_PRESCRIPTION_ITEM', 'Prescription items need their prescription');
      let prescriptionId: string | null = null;

      // If ordering from a prescription, validate prescription rules
      if (request.prescriptionId) {
        const rx = await prescriptions.view(request.prescriptionId);
        if (!rx) {
          throw new AppError(404, 'NOT_FOUND', 'Prescription not found');
        }
        if (rx.patient.id !== actor.id) {
          // Do not leak existence
          throw new AppError(404, 'NOT_FOUND', 'Prescription not found');
        }
        if (rx.status !== 'ISSUED') {
          throw new AppError(400, 'PRESCRIPTION_NOT_VALID', 'Can only order from an ISSUED prescription');
        }
        if (isExpired(rx, todayStr)) {
          throw new AppError(400, 'PRESCRIPTION_EXPIRED', 'Prescription has expired');
        }

        prescriptionId = rx.id;

        // Verify requested quantities against remaining prescription allowance
        for (const item of request.items) {
          if (item.prescriptionItemId) {
            const rxItem = rx.items.find((i) => i.id === item.prescriptionItemId);
            // The line must be the same medicine the doctor prescribed, not just any line's allowance.
            if (!rxItem || rxItem.medicineId !== item.medicineId) {
              throw new AppError(
                400,
                'INVALID_PRESCRIPTION_ITEM',
                'Prescription item not found in prescription',
              );
            }

            const alreadyOrdered = await repo.getOrderedQuantityForPrescriptionItem(item.prescriptionItemId);
            const remainingAllowance = rxItem.quantity - alreadyOrdered;

            if (item.quantity > remainingAllowance) {
              throw new AppError(
                400,
                'QUANTITY_EXCEEDS_PRESCRIPTION',
                `Quantity of ${rxItem.medicineName} exceeds remaining prescription allowance (Remaining: ${remainingAllowance})`,
              );
            }
          }
        }
      }

      // Pharmacy selection
      const pharmacyId = request.pharmacyId ?? (await repo.getDefaultPharmacyId());

      // Prepare items and snapshots
      let subtotalPaise = 0;
      const orderItemsToCreate: {
        prescriptionItemId?: string | null;
        medicineId: string;
        medicineName: string;
        quantity: number;
        pricePaise: number;
      }[] = [];

      for (const item of request.items) {
        if (item.quantity <= 0) {
          throw new AppError(400, 'VALIDATION_FAILED', 'Item quantity must be greater than zero');
        }

        const med = await repo.getMedicineStock(item.medicineId);
        if (!med) {
          throw new AppError(404, 'NOT_FOUND', 'Medicine not found in catalog');
        }

        if (med.requiresPrescription && !item.prescriptionItemId) {
          throw new AppError(
            400,
            'PRESCRIPTION_REQUIRED',
            `${med.name} needs a doctor's prescription. Order it from your prescription.`,
          );
        }

        if (med.stockQty < item.quantity) {
          throw new AppError(
            400,
            'INSUFFICIENT_STOCK',
            `Insufficient stock for ${med.name}. Available: ${med.stockQty}, requested: ${item.quantity}`,
          );
        }

        subtotalPaise += med.pricePaise * item.quantity;
        orderItemsToCreate.push({
          prescriptionItemId: item.prescriptionItemId ?? null,
          medicineId: item.medicineId,
          medicineName: med.name,
          quantity: item.quantity,
          pricePaise: med.pricePaise,
        });
      }

      const trackingId = generateTrackingId();
      let order: Order;
      try {
        order = await repo.create({
          trackingId,
          patientId: actor.id,
          prescriptionId,
          pharmacyId,
          address: request.address,
          subtotalPaise,
          deliveryFeePaise: 0,
          totalPaise: subtotalPaise,
          idempotencyKey: request.idempotencyKey,
          items: orderItemsToCreate,
          actorId: actor.id,
          actorRole: actor.role,
        });
      } catch (err: unknown) {
        if (err instanceof Error && err.message.startsWith('INSUFFICIENT_STOCK')) {
          throw new AppError(400, 'INSUFFICIENT_STOCK', err.message);
        }
        if (err instanceof Error && err.message.startsWith('QUANTITY_EXCEEDS_PRESCRIPTION')) {
          throw new AppError(
            400,
            'QUANTITY_EXCEEDS_PRESCRIPTION',
            'This is more than the prescription allows',
          );
        }
        throw err;
      }

      await audit.record({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'ORDER_CREATED',
        entityType: 'ORDER',
        entityId: order.id,
        metadata: {
          trackingId: order.trackingId,
          totalPaise: order.totalPaise,
          itemCount: order.items.length,
        },
      });

      return order;
    },

    async getOrder(actor: OrderServiceActor, orderId: string): Promise<Order> {
      const order = await repo.findById(orderId);
      if (!order) {
        throw new AppError(404, 'NOT_FOUND', 'Order not found');
      }

      if (actor.role === 'PATIENT' && order.patientId !== actor.id) {
        // Blueprint §12: return 404 to avoid leaking existence
        throw new AppError(404, 'NOT_FOUND', 'Order not found');
      }

      if (actor.role === 'DOCTOR') {
        throw new AppError(404, 'NOT_FOUND', 'Order not found');
      }

      return order;
    },

    async listOrders(actor: OrderServiceActor, status?: OrderStatus): Promise<Order[]> {
      if (actor.role === 'PATIENT') {
        return repo.listByPatient(actor.id);
      }
      if (actor.role === 'PHARMACY_ADMIN') {
        return repo.listByPharmacy(undefined, status);
      }
      return [];
    },

    async updateOrderStatus(
      actor: OrderServiceActor,
      orderId: string,
      request: UpdateOrderStatusRequest,
    ): Promise<Order> {
      const order = await repo.findById(orderId);
      if (!order) {
        throw new AppError(404, 'NOT_FOUND', 'Order not found');
      }

      if (actor.role === 'PATIENT') {
        if (order.patientId !== actor.id) {
          throw new AppError(404, 'NOT_FOUND', 'Order not found');
        }
      }

      if (!canTransitionOrder(order.status, request.status, actor.role)) {
        throw new AppError(
          409,
          'INVALID_TRANSITION',
          `Cannot transition order from ${order.status} to ${request.status} as ${actor.role}`,
        );
      }

      if (request.status === 'CANCELLED' && actor.role === 'PHARMACY_ADMIN' && !request.cancelReason) {
        throw new AppError(
          400,
          'VALIDATION_FAILED',
          'Cancel reason is required when pharmacy cancels an order',
        );
      }

      const updated = await repo.updateStatus({
        orderId,
        expectedCurrentStatus: order.status,
        nextStatus: request.status,
        actorId: actor.id,
        actorRole: actor.role,
        note: request.note,
        cancelReason: request.cancelReason,
      });

      if (!updated) {
        throw new AppError(409, 'CONFLICT', 'Order status was modified concurrently, please retry');
      }

      await audit.record({
        actorId: actor.id,
        actorRole: actor.role,
        action: request.status === 'CANCELLED' ? 'ORDER_CANCELLED' : 'ORDER_STATUS_CHANGED',
        entityType: 'ORDER',
        entityId: order.id,
        metadata: { fromStatus: order.status, toStatus: request.status },
      });
      if (actor.id !== order.patientId)
        await notify(order.patientId, {
          title: `Order ${order.trackingId}: ${ORDER_WORDS[request.status]}`,
          body:
            request.status === 'CANCELLED'
              ? `The pharmacy cancelled it${request.cancelReason ? `: ${request.cancelReason}` : '.'}`
              : 'Tap to see where your medicines are.',
          link: `/patient/medicines/order/${order.id}`,
        });

      return updated;
    },

    /** Patients can track only their own orders; pharmacy staff any. Others get 404 (no existence leak). */
    async trackOrder(actor: OrderServiceActor, trackingId: string): Promise<Order> {
      const order = await repo.findByTrackingId(trackingId);
      const allowed =
        actor.role === 'PHARMACY_ADMIN' || (actor.role === 'PATIENT' && order?.patientId === actor.id);
      if (!order || !allowed) {
        throw new AppError(404, 'NOT_FOUND', 'Order with tracking ID not found');
      }
      return order;
    },

    /**
     * Apply a status event from the external delivery partner. Maps the partner's
     * status onto our state machine and applies it through the normal, guarded
     * update path (the pharmacy admin oversees partner orders), so history is
     * recorded and `canTransitionOrder` rejects any out-of-order event.
     */
    async syncPartnerStatus(actor: OrderServiceActor, orderId: string, rawStatus: string): Promise<Order> {
      if (fulfillmentProvider !== 'partner') {
        throw new AppError(409, 'INVALID_STATE', 'Partner fulfillment is not enabled');
      }
      const mapped = mapPartnerStatus(rawStatus);
      if (!mapped) {
        throw new AppError(400, 'VALIDATION_FAILED', `Unknown partner status: ${rawStatus}`);
      }
      return service.updateOrderStatus(actor, orderId, {
        status: mapped,
        note: `partner: ${rawStatus}`,
        cancelReason: mapped === 'CANCELLED' ? `partner: ${rawStatus}` : undefined,
      });
    },
  };

  return service;
}

export type OrderService = ReturnType<typeof createOrderService>;
