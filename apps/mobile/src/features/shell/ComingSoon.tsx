import { AppText, Card, Screen } from '@/ui';

/** Placeholder for a tab whose feature arrives in a later phase. */
export function ComingSoon({ title, phase, what }: { title: string; phase: number; what: string }) {
  return (
    <Screen>
      <Card>
        <AppText variant="heading">{title}</AppText>
        <AppText>{what}</AppText>
        <AppText variant="caption" color="textMuted">
          Coming in phase {phase}
        </AppText>
      </Card>
    </Screen>
  );
}
