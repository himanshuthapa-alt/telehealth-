/**
 * TeleCare+ design tokens. Every screen and component takes colours, spacing
 * and type from here; no hard-coded values in screens.
 *
 * A clean clinical look (white cards on cool grey, one confident blue), in
 * the style of the big Indian health apps, still built for older patients:
 * - Body and muted text reach 7:1 contrast (WCAG AAA); the blue is 6.4:1 (AA+).
 * - Body text 17 on the phone's own font (renders Hindi and other scripts).
 * - Touch targets of 52dp or more; the main action on a screen is 56dp.
 * - Selected = soft blue fill + blue text + a tick, so it never relies on colour alone.
 */
export const colors = {
  // Brand blue: main buttons, links, active tab
  primary: '#0F4CD6', // 6.4:1 on white
  primaryPressed: '#0A3AA8',
  onPrimary: '#FFFFFF',
  primarySoft: '#EAF1FF', // pressed rows, avatars, icon circles

  // Selected chips/tiles and the appointment token
  accent: '#DCE7FF',
  accentSoft: '#F2F6FF',
  onAccent: '#0A3AA8', // 8.1:1 on accent

  background: '#F4F6FA',
  surface: '#FFFFFF',
  border: '#E1E6EF',

  text: '#111A2E', // 17:1
  textMuted: '#4A5468', // 7.4:1 on white
  textDisabled: '#5E6879', // 5.7:1, only for "not added" style hints

  success: '#13703F',
  successSoft: '#E5F5EC',
  warning: '#7A4A00',
  warningSoft: '#FFF3DC',
  danger: '#B3261E', // 6.5:1
  dangerSoft: '#FDECEA',
  info: '#1F4E9C',
  infoSoft: '#E6EEFA',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/** Soft card elevation (iOS shadow + Android elevation). */
export const shadow = {
  shadowColor: '#0F1B3D',
  shadowOpacity: 0.07,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

// One family (the system font), weights and size doing the work.
export const typography = {
  title: { fontSize: 26, lineHeight: 32, fontWeight: '800' },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  body: { fontSize: 17, lineHeight: 24, fontWeight: '400' },
  label: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  small: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
} as const;

/** Minimum height/width of anything tappable. Above Android's 48dp for less steady hands. */
export const minTouchTarget = 52;
/** The one main action on a screen. */
export const primaryActionHeight = 56;

export type ColorToken = keyof typeof colors;
export type TypographyVariant = keyof typeof typography;
