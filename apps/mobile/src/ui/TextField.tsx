import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { AppText } from './AppText';
import { colors, minTouchTarget, radius, spacing, typography } from './theme';

export interface TextFieldProps extends Omit<TextInputProps, 'style' | 'secureTextEntry'> {
  label: string;
  error?: string;
  hint?: string;
  /** Password field: hidden by default, with a Show/Hide button. */
  secret?: boolean;
}

export function TextField({ label, error, hint, secret = false, ...input }: TextFieldProps) {
  const [hidden, setHidden] = useState(secret);
  const message = error ?? hint;
  return (
    <View style={styles.field}>
      <AppText variant="label">{label}</AppText>
      <View style={[styles.box, error ? styles.boxError : null]}>
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={message}
          placeholderTextColor={colors.textDisabled}
          secureTextEntry={hidden}
          style={styles.input}
          {...input}
        />
        {secret && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? `Show ${label.toLowerCase()}` : `Hide ${label.toLowerCase()}`}
            onPress={() => setHidden((h) => !h)}
            style={styles.toggle}
          >
            <AppText variant="small" color="primary">
              {hidden ? 'Show' : 'Hide'}
            </AppText>
          </Pressable>
        )}
      </View>
      {message && (
        <AppText variant="small" color={error ? 'danger' : 'textMuted'}>
          {message}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: minTouchTarget + 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  boxError: { borderColor: colors.danger },
  input: { flex: 1, paddingHorizontal: spacing.md, ...typography.body, color: colors.text },
  toggle: {
    minHeight: minTouchTarget,
    minWidth: minTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
});
