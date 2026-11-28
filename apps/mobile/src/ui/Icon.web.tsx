import { Text, type ColorValue } from 'react-native';
import type { SymbolViewProps } from 'expo-symbols';
import { colors, type ColorToken } from './theme';

export type IconName = Extract<SymbolViewProps['name'], { android?: unknown }>;

// expo-symbols draws nothing on the web. Android already uses Material Symbols names,
// so the web build renders the same names with Google's Material Symbols font (ligatures).
const FONT = 'Material Symbols Outlined';
if (typeof document !== 'undefined' && !document.getElementById('material-symbols')) {
  const link = document.createElement('link');
  link.id = 'material-symbols';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined';
  document.head.appendChild(link);
}

/** Web version of the platform icon: same props, same names as Android. */
export function Icon({
  name,
  size = 28,
  color = 'text',
}: {
  name: IconName;
  size?: number;
  color?: ColorToken | ColorValue;
}) {
  const tint = typeof color === 'string' && color in colors ? colors[color as ColorToken] : color;
  return (
    <Text
      aria-hidden
      selectable={false}
      style={{
        fontFamily: FONT,
        fontSize: size,
        lineHeight: size,
        color: tint,
        width: size,
        overflow: 'hidden',
      }}
    >
      {String(name.android ?? '')}
    </Text>
  );
}

export const icon = (
  android: NonNullable<IconName['android']>,
  ios: NonNullable<IconName['ios']>,
): IconName => ({ android, ios });
