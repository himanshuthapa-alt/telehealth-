export const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PACKED',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_METHODS = ['CASH_ON_DELIVERY'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['PENDING', 'PAID'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const STOCK_MOVEMENT_REASONS = ['ORDER', 'CANCEL', 'ADJUST'] as const;
export type StockMovementReason = (typeof STOCK_MOVEMENT_REASONS)[number];

export interface OrderAddress {
  fullName: string;
  phone: string;
  addressLine: string;
  district: string;
  pincode?: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  prescriptionItemId: string | null;
  medicineId: string;
  medicineName: string;
  quantity: number;
  pricePaise: number;
}

export interface OrderStatusHistory {
  id: string;
  orderId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorRole: string;
  note: string | null;
  at: string;
}

export interface Order {
  id: string;
  trackingId: string;
  patientId: string;
  patientName?: string;
  prescriptionId: string | null;
  pharmacyId: string;
  pharmacyName?: string;
  status: OrderStatus;
  address: OrderAddress;
  subtotalPaise: number;
  deliveryFeePaise: number;
  totalPaise: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  cancelReason: string | null;
  items: OrderItem[];
  history: OrderStatusHistory[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderRequest {
  prescriptionId?: string;
  pharmacyId?: string;
  address: OrderAddress;
  items: {
    prescriptionItemId?: string;
    medicineId: string;
    quantity: number;
  }[];
  idempotencyKey?: string;
}

export interface UpdateOrderStatusRequest {
  status: OrderStatus;
  note?: string;
  cancelReason?: string;
}

/**
 * Validates state transitions per the Blueprint §15 state machine:
 * PENDING -> CONFIRMED -> PACKED -> SHIPPED -> DELIVERED
 * Cancellations:
 * - Patient: can cancel only while PENDING
 * - Pharmacy: can cancel while PENDING, CONFIRMED, or PACKED (reason required)
 */
export function canTransitionOrder(
  from: OrderStatus,
  to: OrderStatus,
  role: 'PATIENT' | 'PHARMACY_ADMIN' | 'DOCTOR',
): boolean {
  if (from === to) return false;
  if (from === 'CANCELLED' || from === 'DELIVERED') return false; // terminal

  if (role === 'PATIENT') {
    return from === 'PENDING' && to === 'CANCELLED';
  }

  if (role === 'PHARMACY_ADMIN') {
    switch (from) {
      case 'PENDING':
        return to === 'CONFIRMED' || to === 'CANCELLED';
      case 'CONFIRMED':
        return to === 'PACKED' || to === 'CANCELLED';
      case 'PACKED':
        return to === 'SHIPPED' || to === 'CANCELLED';
      case 'SHIPPED':
        return to === 'DELIVERED';
      default:
        return false;
    }
  }

  return false;
}

const CROCKFORD_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Generates TC-XXXX-XXXX tracking ID using Crockford Base32
 * (no ambiguous 0/O/1/I characters, easy to read aloud over phone).
 */
export function generateTrackingId(randomBytes?: number[]): string {
  const bytes = randomBytes ?? Array.from({ length: 8 }, () => Math.floor(Math.random() * 256));
  if (bytes.length !== 8) {
    throw new RangeError('Tracking ID generation requires exactly 8 bytes');
  }

  const encodeByte = (byte: number | undefined): string => {
    if (byte === undefined || !Number.isInteger(byte) || byte < 0 || byte > 255) {
      throw new RangeError('Tracking ID bytes must be integers from 0 to 255');
    }

    const character = CROCKFORD_CHARS[byte % CROCKFORD_CHARS.length];
    if (character === undefined) throw new RangeError('Invalid tracking ID character index');
    return character;
  };

  const segment1 = Array.from({ length: 4 }, (_, i) => encodeByte(bytes[i])).join('');
  const segment2 = Array.from({ length: 4 }, (_, i) => encodeByte(bytes[i + 4])).join('');
  return `TC-${segment1}-${segment2}`;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, { label: string; description: string }> = {
  PENDING: { label: 'Order Placed', description: 'Waiting for pharmacy confirmation' },
  CONFIRMED: { label: 'Confirmed', description: 'Pharmacy verified prescription and stock' },
  PACKED: { label: 'Packed', description: 'Medicine package packed and sealed' },
  SHIPPED: { label: 'Out for Delivery', description: 'Courier or delivery agent en route' },
  DELIVERED: { label: 'Delivered', description: 'Order delivered to patient address' },
  CANCELLED: { label: 'Cancelled', description: 'Order cancelled, stock released' },
};
