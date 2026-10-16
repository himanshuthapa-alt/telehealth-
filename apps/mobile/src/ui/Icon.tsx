import type { ColorValue } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { colors, type ColorToken } from './theme';

export type IconName = Extract<SymbolViewProps['name'], { android?: unknown }>;

/**
 * An icon from the platform's own set (Material Symbols on Android, SF Symbols
 * on iOS): nothing to download. Decorative by default, because every icon in
 * this app sits next to a word that says the same thing.
 */
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
    <SymbolView
      name={name}
      size={size}
      tintColor={tint}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

/** Shorthand for an icon that is the same idea on both platforms. */
export const icon = (
  android: NonNullable<IconName['android']>,
  ios: NonNullable<IconName['ios']>,
): IconName => ({ android, ios });
