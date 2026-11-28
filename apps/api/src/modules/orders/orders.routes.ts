import { Router } from 'express';
import { z } from 'zod';
import { ORDER_STATUSES } from '@telecare/shared';
import type { AuthGuards } from '../../platform/http/auth';
import { getActor } from '../../platform/http/auth';
import { parseBody, parseQuery } from '../../platform/http/validate';
import type { OrderService } from './orders.service';

const AddressSchema = z.strictObject({
  fullName: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(10).max(15),
  addressLine: z.string().trim().min(5).max(250),
  district: z.string().trim().min(2).max(100),
  pincode: z.string().trim().max(10).optional(),
});

const OrderItemInputSchema = z.strictObject({
  prescriptionItemId: z.string().uuid().optional(),
  medicineId: z.string().uuid(),
  quantity: z.number().int().min(1).max(1000),
});

const CreateOrderSchema = z.strictObject({
  prescriptionId: z.string().uuid().optional(),
  pharmacyId: z.string().uuid().optional(),
  address: AddressSchema,
  items: z.array(OrderItemInputSchema).min(1),
  idempotencyKey: z.string().trim().min(1).max(64).optional(),
});

const UpdateStatusSchema = z.strictObject({
  status: z.enum(ORDER_STATUSES),
  note: z.string().trim().max(250).optional(),
  cancelReason: z.string().trim().max(250).optional(),
});

const ListQuerySchema = z.strictObject({
  status: z.enum(ORDER_STATUSES).optional(),
});

const PartnerStatusSchema = z.strictObject({
  status: z.string().trim().min(1).max(40),
});

export function orderRoutes(service: OrderService, guards: AuthGuards): Router {
  const router = Router();

  /** GET /v1/orders/track/:trackingId: lookup order status by tracking ID (TC-XXXX-XXXX).
   * Logged-in only: an order holds the patient's address and medicines.
   * MUST be registered before /:id or Express will match "track" as an id. */
  router.get('/v1/orders/track/:trackingId', guards.requireAuth, async (req, res) => {
    const actor = getActor(res);
    const trackingId = z.string().min(1).max(20).parse(req.params.trackingId);
    const order = await service.trackOrder({ id: actor.id, role: actor.role }, trackingId);
    res.json(order);
  });

  /** POST /v1/orders: patient creates order from prescription or catalog. */
  router.post('/v1/orders', guards.requireRole('PATIENT'), async (req, res) => {
    const actor = getActor(res);
    const body = parseBody(CreateOrderSchema, req);
    const order = await service.createOrder({ id: actor.id, role: actor.role }, body);
    res.status(201).json(order);
  });

  /** GET /v1/orders: lists orders (patient sees own, pharmacy sees theirs). */
  router.get('/v1/orders', guards.requireAuth, async (req, res) => {
    const actor = getActor(res);
    const { status } = parseQuery(ListQuerySchema, req);
    const list = await service.listOrders({ id: actor.id, role: actor.role }, status);
    res.json(list);
  });

  /** GET /v1/orders/:id: detail for patient or pharmacy. */
  router.get('/v1/orders/:id', guards.requireAuth, async (req, res) => {
    const actor = getActor(res);
    const orderId = z.string().min(1).parse(req.params.id);
    const order = await service.getOrder({ id: actor.id, role: actor.role }, orderId);
    res.json(order);
  });

  /** POST /v1/orders/:id/status: transition order along state machine. */
  router.post('/v1/orders/:id/status', guards.requireAuth, async (req, res) => {
    const actor = getActor(res);
    const body = parseBody(UpdateStatusSchema, req);
    const orderId = z.string().min(1).parse(req.params.id);
    const updated = await service.updateOrderStatus({ id: actor.id, role: actor.role }, orderId, body);
    res.json(updated);
  });

  /** POST /v1/orders/:id/partner-status: apply a delivery-partner status event
   * (the status-sync seam for FULFILLMENT_PROVIDER=partner). Pharmacy oversees it. */
  router.post('/v1/orders/:id/partner-status', guards.requireRole('PHARMACY_ADMIN'), async (req, res) => {
    const actor = getActor(res);
    const { status } = parseBody(PartnerStatusSchema, req);
    const orderId = z.string().min(1).parse(req.params.id);
    const updated = await service.syncPartnerStatus({ id: actor.id, role: actor.role }, orderId, status);
    res.json(updated);
  });

  return router;
}
