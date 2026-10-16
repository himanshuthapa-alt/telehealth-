import { colors, radius, typography } from '@/ui';

/**
 * Shared look for every role's tab bar: tall, large labels, and the current
 * tab marked three ways (marigold background, bold ink, filled icon colour)
 * so it's obvious where you are.
 */
export const tabScreenOptions = {
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: colors.textMuted,
  tabBarActiveBackgroundColor: colors.accentSoft,
  tabBarLabelStyle: { fontSize: 14, fontWeight: '700' as const },
  // Labels stay one size so they are never cut off on a narrow phone with large text on; the icons carry the meaning too.
  tabBarAllowFontScaling: false,
  tabBarStyle: { minHeight: 76, borderTopColor: colors.border, borderTopWidth: 1 },
  tabBarItemStyle: { paddingVertical: 4, marginHorizontal: 1, marginVertical: 6, borderRadius: radius.md },
  headerStyle: { backgroundColor: colors.background },
  headerShadowVisible: false,
  headerTitleStyle: { fontSize: typography.heading.fontSize, color: colors.text },
  sceneStyle: { backgroundColor: colors.background },
};

/** Shared look for the stack inside each tab (the stack, not the tab bar, shows the header). */
export const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.background },
  headerShadowVisible: false,
  headerTintColor: colors.primary,
  headerTitleStyle: { fontSize: typography.heading.fontSize, color: colors.text, fontWeight: '700' as const },
  contentStyle: { backgroundColor: colors.background },
};
