import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useCatalogMedicines } from '@/features/orders/order-queries';
import { ICONS } from '@/features/shell/icons';
import {
  AppText,
  Card,
  EmptyState,
  Icon,
  QueryState,
  Screen,
  TextField,
  colors,
  radius,
  spacing,
} from '@/ui';

export default function PharmacyInventory() {
  const [search, setSearch] = useState('');
  const catalog = useCatalogMedicines(search);

  return (
    <Screen>
      <View style={styles.header}>
        <TextField
          label="Search Pharmacy Inventory"
          placeholder="Filter by medicine or generic name..."
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <QueryState
        query={catalog}
        isEmpty={(list) => list.length === 0}
        empty={
          <EmptyState
            icon={ICONS.medicines}
            title="No medicines match."
            body="Try searching for another medicine name."
          />
        }
      >
        {(medicines) => (
          <ScrollView contentContainerStyle={styles.list}>
            {medicines.map((m) => (
              <Card key={m.id} style={styles.card}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="label">{m.name}</AppText>
                    {m.genericName && (
                      <AppText variant="caption" color="textMuted">
                        Generic: {m.genericName}
                      </AppText>
                    )}
                    <AppText color="textMuted">
                      {m.form} {m.strength ? `· ${m.strength}` : ''}{' '}
                      {m.packSize ? `(${m.packSize})` : ''}
                    </AppText>
                  </View>
                  <View style={styles.priceCol}>
                    <AppText variant="label" style={{ fontWeight: '800' }}>
                      ₹{(m.pricePaise / 100).toFixed(0)}
                    </AppText>
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: m.inStock ? colors.successSoft : colors.dangerSoft },
                      ]}
                    >
                      <AppText
                        variant="caption"
                        color={m.inStock ? 'success' : 'danger'}
                        style={{ fontWeight: '800' }}
                      >
                        {m.inStock ? 'In Stock' : 'Out of Stock'}
                      </AppText>
                    </View>
                  </View>
                </View>

                {m.requiresPrescription && (
                  <View style={styles.rxTag}>
                    <Icon name={ICONS.doctor} size={14} color={colors.primary} />
                    <AppText variant="caption" color="primary">
                      Requires Doctor Prescription
                    </AppText>
                  </View>
                )}
              </Card>
            ))}
          </ScrollView>
        )}
      </QueryState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: spacing.sm,
  },
  list: {
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  card: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  priceCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  rxTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
});
