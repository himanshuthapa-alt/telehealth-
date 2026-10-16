import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { OfflineBanner } from './OfflineBanner';
import { colors, spacing } from './theme';

/**
 * Standard screen container: safe areas, background, padding, scrolling, and
 * the offline banner. Most screens sit under a navigation header, which already
 * handles the top inset; a screen without a header passes `edges={['top']}`.
 */
export function Screen({ children, edges = [] }: { children: ReactNode; edges?: Edge[] }) {
  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <OfflineBanner />
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md },
});
