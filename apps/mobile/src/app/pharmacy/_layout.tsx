import { Tabs } from 'expo-router';
import { tabIcon } from '@/features/shell/TabIcon';
import { tabScreenOptions } from '@/features/shell/tab-options';

export default function Layout() {
  return (
    <Tabs screenOptions={tabScreenOptions}>
      <Tabs.Screen
        name="orders"
        options={{ title: 'Orders', tabBarIcon: tabIcon({ ios: 'shippingbox', android: 'receipt_long' }) }}
      />
      <Tabs.Screen
        name="inventory"
        options={{ title: 'Inventory', tabBarIcon: tabIcon({ ios: 'archivebox', android: 'inventory_2' }) }}
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
