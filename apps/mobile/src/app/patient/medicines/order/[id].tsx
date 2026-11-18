import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useOrder, useUpdateOrderStatus } from '@/features/orders/order-queries';
import { OrderTimeline } from '@/features/orders/OrderTimeline';
import { ICONS } from '@/features/shell/icons';
import {
  AppText,
  Banner,
  Button,
  Card,
  Icon,
  QueryState,
  Screen,
  Skeleton,
  colors,
  spacing,
} from '@/ui';

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const order = useOrder(id);
  const updateStatus = useUpdateOrderStatus();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCancel = (orderId: string) => {
    Alert.alert('Cancel Order', 'Are you sure you want to cancel this medicine order?', [
      { text: 'Keep Order', style: 'cancel' },
      {
        text: 'Yes, Cancel Order',
        style: 'destructive',
        onPress: async () => {
          try {
            await updateStatus.mutateAsync({
              id: orderId,
              status: 'CANCELLED',
              note: 'Cancelled by patient',
            });
            void order.refetch();
          } catch (err: unknown) {
            setErrorMsg(err instanceof Error ? err.message : 'Failed to cancel order.');
          }
        },
      },
    ]);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container}>
        <QueryState query={order} loading={<Skeleton cards={3} />}>
          {(o) => {
            const priceRupees = (o.totalPaise / 100).toFixed(0);
            return (
              <>
                {/* Header Card */}
                <Card style={styles.headerCard}>
                  <View style={styles.trackingRow}>
                    <View style={styles.badge}>
                      <Icon name={ICONS.medicines} size={22} color={colors.primary} />
                      <AppText variant="title">{o.trackingId}</AppText>
                    </View>
                  </View>
                  <AppText color="textMuted">
                    Placed on {new Date(o.createdAt).toLocaleDateString([], { dateStyle: 'medium' })} ·{' '}
                    {o.pharmacyName ?? 'TeleCare+ Pharmacy'}
                  </AppText>
                </Card>

                {errorMsg && <Banner tone="danger" message={errorMsg} />}

                {/* Timeline */}
                <Card style={styles.sectionCard}>
                  <AppText variant="heading">Delivery Status</AppText>
                  <OrderTimeline order={o} />
                </Card>

                {/* Items */}
                <Card style={styles.sectionCard}>
                  <AppText variant="heading">Ordered Medicines</AppText>
                  {o.items.map((item) => (
                    <View key={item.id} style={styles.itemRow}>
                      <View style={{ flex: 1 }}>
                        <AppText variant="label">{item.medicineName}</AppText>
                        <AppText color="textMuted">Qty: {item.quantity}</AppText>
                      </View>
                      <AppText variant="label" style={{ fontWeight: '800' }}>
                        ₹{((item.pricePaise * item.quantity) / 100).toFixed(0)}
                      </AppText>
                    </View>
                  ))}

                  <View style={styles.totalRow}>
                    <AppText variant="label" style={{ fontWeight: '800' }}>
                      Total Amount
                    </AppText>
                    <AppText variant="title" style={{ fontWeight: '800' }}>
                      ₹{priceRupees}
                    </AppText>
                  </View>
                  <AppText variant="caption" color="textMuted">
                    Payment: Cash on Delivery (Pay upon arrival)
                  </AppText>
                </Card>

                {/* Address */}
                <Card style={styles.sectionCard}>
                  <AppText variant="heading">Delivery Address</AppText>
                  <AppText style={{ fontWeight: '600' }}>{o.address.fullName}</AppText>
                  <AppText color="textMuted">{o.address.phone}</AppText>
                  <AppText color="textMuted">
                    {o.address.addressLine}, {o.address.district}
                    {o.address.pincode ? ` - ${o.address.pincode}` : ''}
                  </AppText>
                </Card>

                {/* Cancel button if PENDING */}
                {o.status === 'PENDING' && (
                  <Button
                    label={updateStatus.isPending ? 'Cancelling…' : 'Cancel this order'}
                    variant="danger"
                    icon={ICONS.cancel}
                    loading={updateStatus.isPending}
                    onPress={() => handleCancel(o.id)}
                  />
                )}
              </>
            );
          }}
        </QueryState>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    gap: spacing.md,
  },
  headerCard: {
    gap: spacing.xs,
  },
  trackingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sectionCard: {
    gap: spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
});
