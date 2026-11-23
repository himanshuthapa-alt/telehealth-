import { Pressable, StyleSheet, View } from 'react-native';
import { ORDER_STATUS_LABELS, type Order, type OrderStatus } from '@telecare/shared';
import { ICONS } from '@/features/shell/icons';
import { AppText, Card, Icon, type IconName, colors, radius, spacing } from '@/ui';

const STATUS_ICONS: Record<OrderStatus, IconName> = {
  PENDING: ICONS.time,
  CONFIRMED: ICONS.check,
  PACKED: ICONS.medicines,
  SHIPPED: ICONS.forward,
  DELIVERED: ICONS.check,
  CANCELLED: ICONS.cancel,
};

const STATUS_TONES: Record<OrderStatus, 'primary' | 'success' | 'warning' | 'danger'> = {
  PENDING: 'warning',
  CONFIRMED: 'primary',
  PACKED: 'primary',
  SHIPPED: 'primary',
  DELIVERED: 'success',
  CANCELLED: 'danger',
};

const SOFT_BG: Record<'primary' | 'success' | 'warning' | 'danger', keyof typeof colors> = {
  primary: 'primarySoft',
  success: 'successSoft',
  warning: 'warningSoft',
  danger: 'dangerSoft',
};

export function OrderCard({ order, onPress }: { order: Order; onPress: () => void }) {
  const statusInfo = ORDER_STATUS_LABELS[order.status];
  const icon = STATUS_ICONS[order.status] ?? ICONS.medicines;
  const tone = STATUS_TONES[order.status] ?? 'primary';
  const priceRupees = (order.totalPaise / 100).toFixed(0);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Order ${order.trackingId}, status ${statusInfo.label}, total ₹${priceRupees}`}
      onPress={onPress}
      style={({ pressed }) => [styles.wrapper, pressed && { opacity: 0.85 }]}
    >
      <Card style={styles.card}>
        <View style={styles.header}>
          <View style={styles.idBadge}>
            <Icon name={ICONS.medicines} size={20} color={colors.primary} />
            <AppText variant="label" style={{ fontWeight: '800' }}>
              {order.trackingId}
            </AppText>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: colors[SOFT_BG[tone]] }]}>
            <Icon name={icon} size={16} color={colors[tone]} />
            <AppText variant="caption" color={tone} style={{ fontWeight: '800' }}>
              {statusInfo.label}
            </AppText>
          </View>
        </View>

        <View style={styles.content}>
          <AppText color="textMuted">
            {order.items.length === 1 ? '1 medicine' : `${order.items.length} medicines`} · Cash on Delivery
          </AppText>
          <AppText variant="small" numberOfLines={1} color="textMuted">
            Deliver to: {order.address.fullName}, {order.address.district}
          </AppText>
        </View>

        <View style={styles.footer}>
          <AppText variant="label" style={{ fontWeight: '800' }}>
            ₹{priceRupees}
          </AppText>
          <View style={styles.viewRow}>
            <AppText variant="caption" color="primary" style={{ fontWeight: '700' }}>
              Track order
            </AppText>
            <Icon name={ICONS.forward} size={16} color="primary" />
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: radius.lg,
  },
  card: {
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  idBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  content: {
    gap: 2,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
    marginTop: spacing.xs,
  },
  viewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
