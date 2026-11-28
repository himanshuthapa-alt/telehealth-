import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateOrderRequest,
  MedicineSummary,
  Order,
  OrderStatus,
  UpdateOrderStatusRequest,
} from '@telecare/shared';
import { api } from '@/lib/api';

export function useOrders(status?: OrderStatus) {
  const query = status ? `?status=${status}` : '';
  return useQuery({
    queryKey: ['orders', { status }],
    queryFn: () => api.get<Order[]>(`/v1/orders${query}`),
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: ['orders', id],
    queryFn: () => api.get<Order>(`/v1/orders/${id}`),
    enabled: !!id,
  });
}

export function useCatalogMedicines(q?: string) {
  const query = q ? `?q=${encodeURIComponent(q)}` : '';
  return useQuery({
    queryKey: ['medicines', { q }],
    queryFn: () => api.get<MedicineSummary[]>(`/v1/medicines${query}`),
  });
}

/** Pharmacy stock correction: +/- units. The list refreshes with the server's new count. */
export function useAdjustStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, delta }: { id: string; delta: number }) =>
      api.post<MedicineSummary>(`/v1/medicines/${encodeURIComponent(id)}/stock`, { delta }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['medicines'] }),
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateOrderRequest) => api.post<Order>('/v1/orders', data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateOrderStatusRequest & { id: string }) =>
      api.post<Order>(`/v1/orders/${id}/status`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useTrackOrder(trackingId: string) {
  return useQuery({
    queryKey: ['orders', 'track', trackingId],
    queryFn: () => api.get<Order>(`/v1/orders/track/${encodeURIComponent(trackingId)}`),
    enabled: !!trackingId,
  });
}
