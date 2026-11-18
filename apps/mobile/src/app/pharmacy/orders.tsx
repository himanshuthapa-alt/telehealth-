import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ORDER_STATUS_LABELS, type Order, type OrderStatus } from '@telecare/shared';
import { OrderCard } from '@/features/orders/OrderCard';
import { useOrders, useUpdateOrderStatus } from '@/features/orders/order-queries';
import { OrderTimeline } from '@/features/orders/OrderTimeline';
import { ICONS } from '@/features/shell/icons';
import {
  AppText,
  Banner,
  Button,
  Card,
  EmptyState,
  Icon,
  QueryState,
  Screen,
  SegmentedControl,
  TextField,
  colors,
  radius,
  spacing,
} from '@/ui';

const QUEUE_SEGMENTS = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'PACKED', label: 'Packed' },
  { value: 'SHIPPED', label: 'Shipped' },
  { value: 'DELIVERED', label: 'Delivered' },
] as const;
type QueueSegment = (typeof QUEUE_SEGMENTS)[number]['value'];

export default function PharmacyOrders() {
  const [segment, setSegment] = useState<QueueSegment>('ALL');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const statusFilter = segment === 'ALL' ? undefined : (segment as OrderStatus);
  const orders = useOrders(statusFilter);
  const updateStatus = useUpdateOrderStatus();

  const handleTransition = async (nextStatus: OrderStatus, note?: string) => {
    if (!selectedOrder) return;
    setActionError(null);
    try {
      const updated = await updateStatus.mutateAsync({
        id: selectedOrder.id,
        status: nextStatus,
        note,
      });
      setSelectedOrder(updated);
      void orders.refetch();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Status update failed.');
    }
  };

  const handleCancelOrder = async () => {
    if (!selectedOrder || !cancelReason.trim()) return;
    setActionError(null);
    try {
      const updated = await updateStatus.mutateAsync({
        id: selectedOrder.id,
        status: 'CANCELLED',
        cancelReason: cancelReason.trim(),
        note: `Cancelled by pharmacy: ${cancelReason.trim()}`,
      });
      setSelectedOrder(updated);
      setShowCancelPrompt(false);
      setCancelReason('');
      void orders.refetch();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Cancellation failed.');
    }
  };

  return (
    <Screen>
      <SegmentedControl segments={QUEUE_SEGMENTS} value={segment} onChange={setSegment} />

      <QueryState
        query={orders}
        isEmpty={(list) => list.length === 0}
        empty={
          <EmptyState
            icon={ICONS.medicines}
            title="No orders in this queue."
            body="Orders placed by patients will appear here for verification and packing."
          />
        }
      >
        {(list) => (
          <ScrollView contentContainerStyle={styles.list}>
            {list.map((order) => (
              <OrderCard key={order.id} order={order} onPress={() => setSelectedOrder(order)} />
            ))}
          </ScrollView>
        )}
      </QueryState>

      {/* Order Fulfillment Modal */}
      {selectedOrder && (
        <Modal visible={!!selectedOrder} animationType="slide" transparent onRequestClose={() => setSelectedOrder(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <View>
                  <AppText variant="title">{selectedOrder.trackingId}</AppText>
                  <AppText color="textMuted">
                    Status: {ORDER_STATUS_LABELS[selectedOrder.status].label}
                  </AppText>
                </View>
                <Pressable onPress={() => setSelectedOrder(null)} hitSlop={12}>
                  <Icon name={ICONS.cancel} size={28} color="textMuted" />
                </Pressable>
              </View>

              <ScrollView contentContainerStyle={styles.modalBody}>
                {actionError && <Banner tone="danger" message={actionError} />}

                {/* Patient & Delivery Info */}
                <Card style={styles.infoCard}>
                  <AppText variant="label">Patient & Delivery</AppText>
                  <AppText style={{ fontWeight: '600' }}>{selectedOrder.address.fullName}</AppText>
                  <AppText color="textMuted">Phone: {selectedOrder.address.phone}</AppText>
                  <AppText color="textMuted">
                    Address: {selectedOrder.address.addressLine}, {selectedOrder.address.district}
                  </AppText>
                </Card>

                {/* Medicines Checklist */}
                <Card style={styles.infoCard}>
                  <AppText variant="label">Items to Pack</AppText>
                  {selectedOrder.items.map((item) => (
                    <View key={item.id} style={styles.itemRow}>
                      <View style={{ flex: 1 }}>
                        <AppText variant="label">{item.medicineName}</AppText>
                        <AppText color="textMuted">Quantity: {item.quantity}</AppText>
                      </View>
                      <AppText variant="label" style={{ fontWeight: '800' }}>
                        ₹{((item.pricePaise * item.quantity) / 100).toFixed(0)}
                      </AppText>
                    </View>
                  ))}
                  <View style={styles.totalRow}>
                    <AppText variant="label" style={{ fontWeight: '800' }}>
                      Collect upon delivery:
                    </AppText>
                    <AppText variant="title" style={{ fontWeight: '800' }}>
                      ₹{(selectedOrder.totalPaise / 100).toFixed(0)}
                    </AppText>
                  </View>
                </Card>

                {/* Timeline */}
                <Card style={styles.infoCard}>
                  <AppText variant="label">Status History</AppText>
                  <OrderTimeline order={selectedOrder} />
                </Card>

                {/* Fulfillment Actions */}
                <View style={styles.actionSection}>
                  {selectedOrder.status === 'PENDING' && (
                    <>
                      <Button
                        label={updateStatus.isPending ? 'Confirming…' : 'Confirm Order & Verify Rx'}
                        icon={ICONS.check}
                        loading={updateStatus.isPending}
                        onPress={() => handleTransition('CONFIRMED', 'Prescription & stock verified')}
                      />
                      <Button
                        label="Reject / Cancel Order"
                        variant="danger"
                        icon={ICONS.cancel}
                        onPress={() => setShowCancelPrompt(true)}
                      />
                    </>
                  )}

                  {selectedOrder.status === 'CONFIRMED' && (
                    <>
                      <Button
                        label={updateStatus.isPending ? 'Packing…' : 'Mark as Packed & Sealed'}
                        icon={ICONS.medicines}
                        loading={updateStatus.isPending}
                        onPress={() => handleTransition('PACKED', 'Packed and sealed')}
                      />
                      <Button
                        label="Cancel Order"
                        variant="danger"
                        icon={ICONS.cancel}
                        onPress={() => setShowCancelPrompt(true)}
                      />
                    </>
                  )}

                  {selectedOrder.status === 'PACKED' && (
                    <>
                      <Button
                        label={updateStatus.isPending ? 'Dispatching…' : 'Dispatch (Out for Delivery)'}
                        icon={ICONS.forward}
                        loading={updateStatus.isPending}
                        onPress={() => handleTransition('SHIPPED', 'Dispatched with delivery partner')}
                      />
                      <Button
                        label="Cancel Order"
                        variant="danger"
                        icon={ICONS.cancel}
                        onPress={() => setShowCancelPrompt(true)}
                      />
                    </>
                  )}

                  {selectedOrder.status === 'SHIPPED' && (
                    <Button
                      label={updateStatus.isPending ? 'Updating…' : 'Mark as Delivered & Paid (Cash)'}
                      icon={ICONS.check}
                      loading={updateStatus.isPending}
                      onPress={() => handleTransition('DELIVERED', 'Delivered and cash collected')}
                    />
                  )}
                </View>

                {/* Cancel with reason box */}
                {showCancelPrompt && (
                  <Card style={styles.cancelPromptCard}>
                    <AppText variant="label" color="danger">
                      Cancellation Reason (Required)
                    </AppText>
                    <TextField
                      label="Reason"
                      placeholder="e.g. Medicine out of stock, incorrect address..."
                      value={cancelReason}
                      onChangeText={setCancelReason}
                    />
                    <Button
                      label="Confirm Cancellation & Release Stock"
                      variant="danger"
                      disabled={!cancelReason.trim() || updateStatus.isPending}
                      onPress={handleCancelOrder}
                    />
                  </Card>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '90%',
    paddingBottom: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalBody: {
    padding: spacing.md,
    gap: spacing.md,
  },
  infoCard: {
    gap: spacing.xs,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  actionSection: {
    gap: spacing.sm,
  },
  cancelPromptCard: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
    borderWidth: 1,
    gap: spacing.sm,
  },
});
