/**
 * TeleCare+ design tokens. Every screen and component takes colours, spacing
 * and type from here; no hard-coded values in screens.
 *
 * Designed for older patients and people who read slowly:
 * - Text colours reach 7:1 contrast (WCAG AAA) on their backgrounds.
 * - Large type (body 19) on the phone's own font (Roboto): no download, no
 *   loading delay, and it already renders Hindi well for later.
 * - Touch targets of 56dp or more; the main action on a screen is 64dp.
 * - Indigo ink for text and actions; marigold for the appointment token and
 *   for what is selected, always with ink text on it (7.4:1).
 */
export const colors = {
  // Ink: text, main buttons, headers
  primary: '#1F2A55', // 13.8:1 on white
  primaryPressed: '#141C3D',
  onPrimary: '#FFFFFF',
  primarySoft: '#E6E9F3', // pressed rows, avatars

  // Marigold: the appointment token, selected chips/tiles
  accent: '#F4B23E',
  accentSoft: '#FDF0D5',
  onAccent: '#1F2A55', // 7.4:1 on marigold

  background: '#F2F6F4', // mint paper
  surface: '#FFFFFF',
  border: '#C9D3CF',

  text: '#1F2A55',
  textMuted: '#3E4A5C', // 9.0:1 on white
  textDisabled: '#5B6677', // 5.8:1, only for "not added" style hints

  success: '#1E5C38',
  successSoft: '#E3F1E8',
  warning: '#6A4100',
  warningSoft: '#FDF0D5',
  danger: '#A52A1F', // 7.1:1
  dangerSoft: '#FBE6E3',
  info: '#1F4E9C',
  infoSoft: '#E6EEFA',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;

// One family (the system font), weights and size doing the work.
export const typography = {
  title: { fontSize: 30, lineHeight: 38, fontWeight: '700' },
  heading: { fontSize: 23, lineHeight: 30, fontWeight: '700' },
  body: { fontSize: 19, lineHeight: 28, fontWeight: '400' },
  label: { fontSize: 19, lineHeight: 26, fontWeight: '600' },
  small: { fontSize: 17, lineHeight: 24, fontWeight: '400' },
  caption: { fontSize: 15, lineHeight: 21, fontWeight: '500' },
} as const;

/** Minimum height/width of anything tappable. Above Android's 48dp for less steady hands. */
export const minTouchTarget = 56;
/** The one main action on a screen. */
export const primaryActionHeight = 64;

export type ColorToken = keyof typeof colors;
export type TypographyVariant = keyof typeof typography;
