import type { ColorValue } from 'react-native';
import { Icon, type IconName } from '@/ui';

/** Tab bar icon: Material Symbol on Android, SF Symbol on iOS. */
export function tabIcon(name: IconName) {
  return function TabIcon({ color }: { color: ColorValue }) {
    return <Icon name={name} color={color} size={30} />;
  };
}
