import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { PrescriptionItem } from '@telecare/shared';
import { usePatientProfile } from '@/features/account/profile-queries';
import { useCreateOrder } from '@/features/orders/order-queries';
import { usePrescription } from '@/features/prescriptions/prescription-queries';
import { ICONS } from '@/features/shell/icons';
import {
  AppText,
  Banner,
  Button,
  Card,
  QueryState,
  Screen,
  Skeleton,
  TextField,
  colors,
  radius,
  spacing,
} from '@/ui';

export default function OrderBuilder() {
  const { prescriptionId } = useLocalSearchParams<{ prescriptionId?: string }>();
  const prescription = usePrescription(prescriptionId ?? '');
  const profile = usePatientProfile();
  const createOrder = useCreateOrder();

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [district, setDistrict] = useState('');
  const [pincode, setPincode] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Pre-fill profile details
  useEffect(() => {
    if (profile.data) {
      if (profile.data.fullName) setFullName(profile.data.fullName);
      if (profile.data.phone) setPhone(profile.data.phone);
      if (profile.data.district) setDistrict(profile.data.district);
    }
  }, [profile.data]);

  // Pre-fill quantities from prescription
  useEffect(() => {
    if (prescription.data) {
      const initial: Record<string, number> = {};
      for (const item of prescription.data.items) {
        if (item.medicineId) {
          initial[item.id] = item.quantity;
        }
      }
      setQuantities(initial);
    }
  }, [prescription.data]);

  const updateItemQty = (itemId: string, delta: number, maxQty: number) => {
    setQuantities((prev) => {
      const current = prev[itemId] ?? maxQty;
      const next = Math.max(0, Math.min(maxQty, current + delta));
      return { ...prev, [itemId]: next };
    });
  };

  const handlePlaceOrder = async (items: PrescriptionItem[]) => {
    setErrorMsg(null);
    if (!fullName.trim() || !phone.trim() || !addressLine.trim() || !district.trim()) {
      setErrorMsg('Please enter your full name, phone number, delivery address, and district.');
      return;
    }

    const orderItems = items
      .filter((i) => i.medicineId && (quantities[i.id] ?? 0) > 0)
      .map((i) => ({
        prescriptionItemId: i.id,
        medicineId: i.medicineId!,
        quantity: quantities[i.id] ?? i.quantity,
      }));

    if (orderItems.length === 0) {
      setErrorMsg('Please select at least one available medicine to order.');
      return;
    }

    try {
      const order = await createOrder.mutateAsync({
        prescriptionId: prescriptionId || undefined,
        address: {
          fullName: fullName.trim(),
          phone: phone.trim(),
          addressLine: addressLine.trim(),
          district: district.trim(),
          pincode: pincode.trim() || undefined,
        },
        items: orderItems,
      });

      // Navigate to order detail and tracking screen
      router.replace({
        pathname: '/patient/medicines/order/[id]',
        params: { id: order.id },
      });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to place order. Please check stock and try again.');
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container}>
        <AppText variant="title">Review & Order Medicines</AppText>
        <AppText color="textMuted">
          Medicines will be delivered to your address from the TeleCare+ partner pharmacy.
        </AppText>

        {prescriptionId && (
          <QueryState query={prescription} loading={<Skeleton cards={2} />}>
            {(rx) => {
              const availableItems = rx.items.filter((i) => i.medicineId);
              const unavailableItems = rx.items.filter((i) => !i.medicineId);
              const ESTIMATED_UNIT_PRICE_PAISE = 6000;

              let subtotalPaise = 0;
              for (const i of availableItems) {
                const qty = quantities[i.id] ?? i.quantity;
                subtotalPaise += ESTIMATED_UNIT_PRICE_PAISE * qty;
              }

              return (
                <View style={styles.section}>
                  <AppText variant="heading">Prescribed Medicines</AppText>

                  {availableItems.map((item) => {
                    const currentQty = quantities[item.id] ?? item.quantity;
                    return (
                      <Card key={item.id} style={styles.itemCard}>
                        <View style={styles.itemHeader}>
                          <View style={{ flex: 1 }}>
                            <AppText variant="label">{item.medicineName}</AppText>
                            <AppText color="textMuted">
                              {item.dosage} · {item.frequency} for {item.durationDays} days
                            </AppText>
                          </View>
                          <AppText variant="label" style={{ fontWeight: '800' }}>
                            ₹{((currentQty * ESTIMATED_UNIT_PRICE_PAISE) / 100).toFixed(0)}
                          </AppText>
                        </View>

                        <View style={styles.qtyRow}>
                          <AppText variant="caption" color="textMuted">
                            Prescribed: {item.quantity} units
                          </AppText>
                          <View style={styles.counter}>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="Decrease quantity"
                              style={styles.counterBtn}
                              onPress={() => updateItemQty(item.id, -1, item.quantity)}
                            >
                              <AppText variant="label" style={styles.counterBtnText}>
                                -
                              </AppText>
                            </Pressable>
                            <AppText variant="label" style={{ minWidth: 28, textAlign: 'center' }}>
                              {currentQty}
                            </AppText>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="Increase quantity"
                              style={styles.counterBtn}
                              onPress={() => updateItemQty(item.id, 1, item.quantity)}
                            >
                              <AppText variant="label" style={styles.counterBtnText}>
                                +
                              </AppText>
                            </Pressable>
                          </View>
                        </View>
                      </Card>
                    );
                  })}

                  {unavailableItems.length > 0 && (
                    <Banner
                      tone="warning"
                      message={`${unavailableItems.length} prescribed medicine(s) are not stocked in the pharmacy catalog and must be bought locally.`}
                    />
                  )}

                  {/* Delivery Address */}
                  <View style={styles.section}>
                    <AppText variant="heading">Delivery Address</AppText>
                    <TextField label="Full Name" value={fullName} onChangeText={setFullName} />
                    <TextField label="Phone Number" value={phone} keyboardType="phone-pad" onChangeText={setPhone} />
                    <TextField
                      label="House, Street or Village"
                      value={addressLine}
                      onChangeText={setAddressLine}
                    />
                    <TextField label="District / Town" value={district} onChangeText={setDistrict} />
                    <TextField label="PIN code (optional)" value={pincode} keyboardType="number-pad" onChangeText={setPincode} />
                  </View>

                  {/* Payment Summary */}
                  <Card style={styles.summaryCard}>
                    <AppText variant="heading">Payment Summary</AppText>
                    <View style={styles.summaryRow}>
                      <AppText color="textMuted">Medicines subtotal</AppText>
                      <AppText variant="label">₹{(subtotalPaise / 100).toFixed(0)}</AppText>
                    </View>
                    <View style={styles.summaryRow}>
                      <AppText color="textMuted">Delivery fee</AppText>
                      <AppText color="success" style={{ fontWeight: '700' }}>
                        FREE
                      </AppText>
                    </View>
                    <View style={[styles.summaryRow, styles.totalRow]}>
                      <AppText variant="label" style={{ fontWeight: '800' }}>
                        Total Amount
                      </AppText>
                      <AppText variant="title" style={{ fontWeight: '800' }}>
                        ₹{(subtotalPaise / 100).toFixed(0)}
                      </AppText>
                    </View>

                    <Banner
                      tone="info"
                      message="Cash on Delivery only. Pay the delivery agent with cash when your medicines arrive."
                    />
                  </Card>

                  {errorMsg && <Banner tone="danger" message={errorMsg} />}

                  <Button
                    label={createOrder.isPending ? 'Placing Order…' : 'Confirm Order (Cash on Delivery)'}
                    icon={ICONS.medicines}
                    loading={createOrder.isPending}
                    onPress={() => handlePlaceOrder(rx.items)}
                  />
                </View>
              );
            }}
          </QueryState>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    gap: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  itemCard: {
    gap: spacing.sm,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
  },
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  counterBtn: {
    minWidth: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterBtnText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primary,
  },
  summaryCard: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
});
