import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { colors, radius, spacing } from './theme';

export interface EmptyStateProps {
  /** One short sentence: what is (not) here. */
  title: string;
  /** Optional second sentence: what will appear here, or what to do. */
  body?: string;
  icon?: IconName;
  action?: { label: string; onPress: () => void; icon?: IconName };
}

/** Shown when there is nothing to list (blueprint §18): a picture, one sentence, one way forward. */
export function EmptyState({ title, body, icon, action }: EmptyStateProps) {
  return (
    <View style={styles.box}>
      {icon && (
        <View style={styles.iconWrap}>
          <Icon name={icon} size={44} color="primary" />
        </View>
      )}
      <AppText variant="heading" style={styles.center}>
        {title}
      </AppText>
      {body && (
        <AppText color="textMuted" style={styles.center}>
          {body}
        </AppText>
      )}
      {action && <Button label={action.label} icon={action.icon} onPress={action.onPress} />}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { paddingVertical: spacing.xl, paddingHorizontal: spacing.sm, gap: spacing.md, alignItems: 'stretch' },
  iconWrap: {
    alignSelf: 'center',
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
});
