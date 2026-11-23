import { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  DOCTOR_AVAILABILITY_FILTERS,
  DOCTOR_SORTS,
  type DoctorAvailabilityFilter,
  LANGUAGES,
  MIN_RATING_OPTIONS,
  SPECIALIZATIONS,
  type DoctorSort,
  type Language,
  type Specialization,
} from '@telecare/shared';
import { DoctorCardView } from '@/features/doctors/DoctorCardView';
import { useDoctorSearch } from '@/features/doctors/doctor-queries';
import { SORT_LABEL } from '@/features/doctors/format';
import { SPECIALTY } from '@/features/doctors/specialties';
import { ICONS } from '@/features/shell/icons';
import { errorMessage } from '@/lib/errors';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import {
  AppText,
  Button,
  Chip,
  EmptyState,
  OfflineBanner,
  QueryState,
  Skeleton,
  TextField,
  colors,
  spacing,
} from '@/ui';

const isSpecialization = (v: unknown): v is Specialization => SPECIALIZATIONS.includes(v as Specialization);

export default function Doctors() {
  const params = useLocalSearchParams<{ specialization?: string }>();
  const [text, setText] = useState('');
  const [specialization, setSpecialization] = useState<Specialization | undefined>(
    isSpecialization(params.specialization) ? params.specialization : undefined,
  );
  const [language, setLanguage] = useState<Language>();
  const [minRating, setMinRating] = useState<number>();
  const [available, setAvailable] = useState<DoctorAvailabilityFilter>();
  const [sort, setSort] = useState<DoctorSort>('rating');
  const [showFilters, setShowFilters] = useState(false);
  const q = useDebouncedValue(text.trim());

  // A specialty shortcut tapped on Home while this screen is already open (React's
  // "adjust state when a prop changes" pattern: compare during render, no effect).
  const [seenParam, setSeenParam] = useState(params.specialization);
  if (params.specialization !== seenParam) {
    setSeenParam(params.specialization);
    if (isSpecialization(params.specialization)) setSpecialization(params.specialization);
  }

  const search = useDoctorSearch({ q: q || undefined, specialization, language, minRating, available, sort });
  const doctors = search.data?.pages.flatMap((p) => p.items) ?? [];
  const total = search.data?.pages[0]?.total;
  const extraFilters = [language, minRating, available, sort !== 'rating' ? sort : undefined].filter(
    Boolean,
  ).length;
  const clearFilters = () => {
    setSpecialization(undefined);
    setLanguage(undefined);
    setMinRating(undefined);
    setAvailable(undefined);
    setSort('rating');
    setText('');
  };

  const header = (
    <View style={styles.header}>
      <OfflineBanner />
      <TextField
        label="Search doctors"
        placeholder="Doctor's name or problem"
        value={text}
        onChangeText={setText}
        returnKeyType="search"
        autoCorrect={false}
      />
      <View style={styles.wrap}>
        {SPECIALIZATIONS.map((s) => (
          <Chip
            key={s}
            label={SPECIALTY[s].plain}
            selected={specialization === s}
            onPress={() => setSpecialization(specialization === s ? undefined : s)}
          />
        ))}
      </View>
      <Button
        label={
          showFilters ? 'Hide filters' : extraFilters ? `More filters (${extraFilters})` : 'More filters'
        }
        variant="secondary"
        icon={ICONS.filters}
        onPress={() => setShowFilters((v) => !v)}
      />
      {showFilters && (
        <View style={styles.panel}>
          <AppText variant="label">Language</AppText>
          <View style={styles.wrap}>
            {LANGUAGES.map((l) => (
              <Chip
                key={l}
                label={l}
                selected={language === l}
                onPress={() => setLanguage(language === l ? undefined : l)}
              />
            ))}
          </View>
          <AppText variant="label">Available</AppText>
          <View style={styles.wrap}>
            <Chip
              label="Any time"
              selected={available === undefined}
              onPress={() => setAvailable(undefined)}
            />
            {DOCTOR_AVAILABILITY_FILTERS.map((a) => (
              <Chip
                key={a}
                label={a === 'today' ? 'Today' : 'This week'}
                selected={available === a}
                onPress={() => setAvailable(a)}
              />
            ))}
          </View>
          <AppText variant="label">Rating</AppText>
          <View style={styles.wrap}>
            <Chip label="Any" selected={minRating === undefined} onPress={() => setMinRating(undefined)} />
            {MIN_RATING_OPTIONS.map((r) => (
              <Chip key={r} label={`${r}+ ★`} selected={minRating === r} onPress={() => setMinRating(r)} />
            ))}
          </View>
          <AppText variant="label">Sort by</AppText>
          <View style={styles.wrap}>
            {DOCTOR_SORTS.map((s) => (
              <Chip key={s} label={SORT_LABEL[s]} selected={sort === s} onPress={() => setSort(s)} />
            ))}
          </View>
        </View>
      )}
      {total !== undefined && (
        <AppText variant="small" color="textMuted" accessibilityLiveRegion="polite">
          {total === 1 ? '1 doctor' : `${total} doctors`}
        </AppText>
      )}
    </View>
  );

  return (
    <FlatList
      testID="doctor-list"
      style={styles.list}
      contentContainerStyle={styles.content}
      data={doctors}
      keyExtractor={(d) => d.id}
      renderItem={({ item }) => (
        <DoctorCardView
          doctor={item}
          onPress={() => router.push({ pathname: '/patient/doctors/[id]', params: { id: item.id } })}
        />
      )}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <QueryState
          query={search}
          isEmpty={(data) => data.pages[0]?.total === 0}
          empty={
            <EmptyState
              icon={ICONS.doctor}
              title="No doctors match."
              body="Try another problem or language, or clear the filters."
              action={{ label: 'Clear filters', onPress: clearFilters }}
            />
          }
          loading={<Skeleton cards={4} />}
        >
          {() => null}
        </QueryState>
      }
      onEndReached={() => {
        if (search.hasNextPage && !search.isFetchingNextPage && !search.isFetchNextPageError)
          void search.fetchNextPage();
      }}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        search.isFetchingNextPage ? (
          <ActivityIndicator color={colors.primary} accessibilityLabel="Loading more doctors" />
        ) : search.isFetchNextPageError ? (
          <View style={{ gap: spacing.sm }}>
            <AppText color="danger">{errorMessage(search.error)}</AppText>
            <Button
              label="Load more"
              variant="secondary"
              icon={{ android: 'refresh', ios: 'arrow.clockwise' }}
              onPress={() => void search.fetchNextPage()}
            />
          </View>
        ) : undefined
      }
      keyboardShouldPersistTaps="handled"
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md },
  header: { gap: spacing.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  panel: { gap: spacing.sm },
});
