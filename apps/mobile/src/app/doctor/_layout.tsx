import { Tabs } from 'expo-router';
import { VerificationGate } from '@/features/doctor-account/VerificationGate';
import { tabIcon } from '@/features/shell/TabIcon';
import { tabScreenOptions } from '@/features/shell/tab-options';

export default function Layout() {
  return (
    <VerificationGate>
      <Tabs screenOptions={{ ...tabScreenOptions, headerShown: false }}>
        <Tabs.Screen
          name="today"
          options={{ title: 'Today', tabBarIcon: tabIcon({ ios: 'clock', android: 'today' }) }}
        />
        <Tabs.Screen
          name="appointments"
          options={{
            title: 'Appointments',
            tabBarIcon: tabIcon({ ios: 'calendar', android: 'calendar_month' }),
          }}
        />
        <Tabs.Screen
          name="availability"
          options={{
            title: 'Availability',
            tabBarIcon: tabIcon({ ios: 'calendar.badge.clock', android: 'event_available' }),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            headerShown: true,
            tabBarIcon: tabIcon({ ios: 'person.crop.circle', android: 'account_circle' }),
          }}
        />
      </Tabs>
    </VerificationGate>
  );
}
