import { colors, radius, typography } from '@/ui';

/**
 * Shared look for every role's tab bar: white bar, blue icon + label for the
 * current tab, with a soft blue pill behind it so it doesn't rely on colour alone.
 */
export const tabScreenOptions = {
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: colors.textMuted,
  tabBarActiveBackgroundColor: colors.accentSoft,
  tabBarLabelStyle: { fontSize: 12, fontWeight: '700' as const },
  // Labels stay one size so they are never cut off on a narrow phone with large text on; the icons carry the meaning too.
  tabBarAllowFontScaling: false,
  tabBarStyle: {
    minHeight: 72,
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  tabBarItemStyle: { paddingVertical: 2, marginHorizontal: 2, marginVertical: 4, borderRadius: radius.md },
  headerStyle: { backgroundColor: colors.surface },
  headerShadowVisible: false,
  headerTitleStyle: { fontSize: typography.heading.fontSize, color: colors.text, fontWeight: '700' as const },
  sceneStyle: { backgroundColor: colors.background },
};

/** Shared look for the stack inside each tab (the stack, not the tab bar, shows the header). */
export const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerShadowVisible: false,
  headerTintColor: colors.primary,
  headerTitleStyle: { fontSize: typography.heading.fontSize, color: colors.text, fontWeight: '700' as const },
  contentStyle: { backgroundColor: colors.background },
};
