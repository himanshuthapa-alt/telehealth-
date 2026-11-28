import { Tabs } from 'expo-router';
import { tabIcon } from '@/features/shell/TabIcon';
import { tabScreenOptions } from '@/features/shell/tab-options';

export default function Layout() {
  return (
    <Tabs screenOptions={tabScreenOptions}>
      <Tabs.Screen
        name="doctors"
        options={{
          title: 'Verify doctors',
          tabBarIcon: tabIcon({ ios: 'checkmark.seal', android: 'verified' }),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: tabIcon({ ios: 'person.crop.circle', android: 'account_circle' }),
        }}
      />
    </Tabs>
  );
}
