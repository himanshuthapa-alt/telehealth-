import { StyleSheet, View } from 'react-native';
import type { Order, OrderStatus } from '@telecare/shared';
import { ICONS } from '@/features/shell/icons';
import { AppText, Icon, colors, radius, spacing } from '@/ui';

const STEPS: { status: OrderStatus; title: string; subtitle: string }[] = [
  { status: 'PENDING', title: 'Order Placed', subtitle: 'Order received, awaiting verification' },
  { status: 'CONFIRMED', title: 'Prescription Verified', subtitle: 'Pharmacy confirmed prescription and stock' },
  { status: 'PACKED', title: 'Packed & Sealed', subtitle: 'Package ready for delivery' },
  { status: 'SHIPPED', title: 'Out for Delivery', subtitle: 'Delivery partner en route to your address' },
  { status: 'DELIVERED', title: 'Delivered', subtitle: 'Package handed over, payment collected' },
];

const ORDER_RANK: Record<OrderStatus, number> = {
  PENDING: 1,
  CONFIRMED: 2,
  PACKED: 3,
  SHIPPED: 4,
  DELIVERED: 5,
  CANCELLED: -1,
};

export function OrderTimeline({ order }: { order: Order }) {
  const currentRank = ORDER_RANK[order.status];
  const isCancelled = order.status === 'CANCELLED';

  const historyMap = new Map<OrderStatus, { at: string; note: string | null }>();
  for (const h of order.history) {
    historyMap.set(h.toStatus, { at: h.at, note: h.note });
  }

  if (isCancelled) {
    const cancelHistory = historyMap.get('CANCELLED');
    return (
      <View style={styles.cancelledBox}>
        <View style={styles.cancelledHeader}>
          <Icon name={ICONS.cancel} size={28} color="danger" />
          <View style={{ flex: 1 }}>
            <AppText variant="label" color="danger">
              Order Cancelled
            </AppText>
            {cancelHistory?.at && (
              <AppText variant="caption" color="textMuted">
                {new Date(cancelHistory.at).toLocaleString()}
              </AppText>
            )}
          </View>
        </View>
        <AppText color="textMuted">
          Reason: {order.cancelReason ?? cancelHistory?.note ?? 'Order was cancelled'}
        </AppText>
      </View>
    );
  }

  return (
    <View style={styles.timeline}>
      {STEPS.map((step, idx) => {
        const stepRank = ORDER_RANK[step.status];
        const isComplete = currentRank >= stepRank;
        const isCurrent = currentRank === stepRank;
        const historyEntry = historyMap.get(step.status);

        return (
          <View key={step.status} style={styles.stepRow}>
            {/* Step dot and vertical line */}
            <View style={styles.indicatorCol}>
              <View
                style={[
                  styles.dot,
                  isComplete && styles.dotComplete,
                  isCurrent && styles.dotCurrent,
                ]}
              >
                {isComplete ? (
                  <Icon name={ICONS.check} size={14} color={colors.surface} />
                ) : (
                  <View style={styles.innerDot} />
                )}
              </View>
              {idx < STEPS.length - 1 && (
                <View style={[styles.line, isComplete && currentRank > stepRank && styles.lineComplete]} />
              )}
            </View>

            {/* Step content */}
            <View style={styles.stepContent}>
              <View style={styles.titleRow}>
                <AppText
                  variant="label"
                  color={isComplete ? 'text' : 'textMuted'}
                  style={{ fontWeight: isCurrent ? '800' : '600' }}
                >
                  {step.title}
                </AppText>
                {historyEntry && (
                  <AppText variant="caption" color="textMuted">
                    {new Date(historyEntry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </AppText>
                )}
              </View>
              <AppText variant="small" color="textMuted">
                {historyEntry?.note ?? step.subtitle}
              </AppText>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  timeline: {
    paddingVertical: spacing.sm,
  },
  stepRow: {
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 56,
  },
  indicatorCol: {
    alignItems: 'center',
    width: 24,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  dotComplete: {
    backgroundColor: colors.primary,
  },
  dotCurrent: {
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  innerDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.textDisabled,
  },
  line: {
    width: 2,
    flex: 1,
    backgroundColor: colors.border,
    marginVertical: 2,
  },
  lineComplete: {
    backgroundColor: colors.primary,
  },
  stepContent: {
    flex: 1,
    paddingBottom: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cancelledBox: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cancelledHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
