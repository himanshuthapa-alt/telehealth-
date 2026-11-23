import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { OrderCard } from '@/features/orders/OrderCard';
import { useCatalogMedicines, useOrders } from '@/features/orders/order-queries';
import { PrescriptionCard } from '@/features/prescriptions/PrescriptionCard';
import { usePrescriptions } from '@/features/prescriptions/prescription-queries';
import { ICONS } from '@/features/shell/icons';
import {
  AppText,
  Card,
  EmptyState,
  QueryState,
  Screen,
  SegmentedControl,
  TextField,
  colors,
  radius,
  spacing,
} from '@/ui';

const SEGMENTS = [
  { value: 'prescriptions', label: 'Prescriptions' },
  { value: 'catalog', label: 'Catalog' },
  { value: 'orders', label: 'Orders' },
] as const;
type Segment = (typeof SEGMENTS)[number]['value'];

export default function Medicines() {
  const [segment, setSegment] = useState<Segment>('prescriptions');
  const [catalogSearch, setCatalogSearch] = useState('');

  const prescriptions = usePrescriptions();
  const orders = useOrders();
  const catalog = useCatalogMedicines(catalogSearch);

  const findDoctor = {
    label: 'Find a doctor',
    icon: ICONS.search,
    onPress: () => router.navigate('/patient/doctors'),
  };

  return (
    <Screen>
      <SegmentedControl segments={SEGMENTS} value={segment} onChange={setSegment} />

      {segment === 'prescriptions' && (
        <QueryState
          query={prescriptions}
          isEmpty={(list) => list.length === 0}
          empty={
            <EmptyState
              icon={ICONS.medicines}
              title="No prescriptions yet."
              body="After a consultation, your doctor's prescription appears here."
              action={findDoctor}
            />
          }
        >
          {(list) => (
            <ScrollView contentContainerStyle={styles.list}>
              {list.map((p) => (
                <PrescriptionCard
                  key={p.id}
                  prescription={p}
                  onPress={() =>
                    router.push({
                      pathname: '/patient/medicines/prescription/[id]',
                      params: { id: p.id },
                    })
                  }
                />
              ))}
            </ScrollView>
          )}
        </QueryState>
      )}

      {segment === 'catalog' && (
        <View style={styles.tabContent}>
          <TextField
            label="Search Medicines"
            placeholder="Search by brand or generic name..."
            value={catalogSearch}
            onChangeText={setCatalogSearch}
          />

          <QueryState
            query={catalog}
            isEmpty={(list) => list.length === 0}
            empty={
              <EmptyState
                icon={ICONS.search}
                title="No medicines found."
                body="Try searching for another generic or medicine name."
              />
            }
          >
            {(medicines) => (
              <ScrollView contentContainerStyle={styles.list}>
                {medicines.map((m) => (
                  <Card key={m.id} style={styles.catalogCard}>
                    <View style={styles.catalogHeader}>
                      <View style={{ flex: 1 }}>
                        <AppText variant="label">{m.name}</AppText>
                        {m.genericName && (
                          <AppText variant="caption" color="textMuted">
                            Generic: {m.genericName}
                          </AppText>
                        )}
                        <AppText variant="small" color="textMuted">
                          {m.form} {m.strength ? `· ${m.strength}` : ''} {m.packSize ? `(${m.packSize})` : ''}
                        </AppText>
                      </View>
                      <View style={styles.priceCol}>
                        <AppText variant="label" style={{ fontWeight: '800' }}>
                          ₹{(m.pricePaise / 100).toFixed(0)}
                        </AppText>
                        <View
                          style={[
                            styles.stockTag,
                            { backgroundColor: m.inStock ? colors.successSoft : colors.dangerSoft },
                          ]}
                        >
                          <AppText
                            variant="caption"
                            color={m.inStock ? 'success' : 'danger'}
                            style={{ fontWeight: '700' }}
                          >
                            {m.inStock ? 'In Stock' : 'Out of Stock'}
                          </AppText>
                        </View>
                      </View>
                    </View>
                  </Card>
                ))}
              </ScrollView>
            )}
          </QueryState>
        </View>
      )}

      {segment === 'orders' && (
        <QueryState
          query={orders}
          isEmpty={(list) => list.length === 0}
          empty={
            <EmptyState
              icon={ICONS.bookings}
              title="No medicine orders yet."
              body="Order prescribed medicines from your doctor's prescription."
            />
          }
        >
          {(list) => (
            <ScrollView contentContainerStyle={styles.list}>
              {list.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  onPress={() =>
                    router.push({
                      pathname: '/patient/medicines/order/[id]',
                      params: { id: o.id },
                    })
                  }
                />
              ))}
            </ScrollView>
          )}
        </QueryState>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabContent: {
    flex: 1,
    gap: spacing.sm,
  },
  list: {
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  catalogCard: {
    gap: spacing.xs,
  },
  catalogHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  priceCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
  stockTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
});
