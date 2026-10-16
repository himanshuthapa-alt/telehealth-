import { Text, type TextProps } from 'react-native';
import { colors, typography, type ColorToken, type TypographyVariant } from './theme';

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  color?: ColorToken;
}

/** The only text component screens should use, so type stays consistent. */
export function AppText({ variant = 'body', color = 'text', style, ...rest }: AppTextProps) {
  const role = variant === 'title' || variant === 'heading' ? 'header' : undefined;
  return (
    <Text accessibilityRole={role} style={[typography[variant], { color: colors[color] }, style]} {...rest} />
  );
}
