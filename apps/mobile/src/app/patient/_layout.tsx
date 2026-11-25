import { Tabs } from 'expo-router';
import { ICONS } from '@/features/shell/icons';
import { tabIcon } from '@/features/shell/TabIcon';
import { tabScreenOptions } from '@/features/shell/tab-options';
import { VoiceNavOverlay } from '@/features/voice/VoiceNavOverlay';

export default function Layout() {
  return (
    <>
      <Tabs screenOptions={{ ...tabScreenOptions, headerShown: false }}>
        <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: tabIcon(ICONS.home) }} />
        <Tabs.Screen name="doctors" options={{ title: 'Doctors', tabBarIcon: tabIcon(ICONS.doctor) }} />
        {/* "Bookings", not "Appointments": short enough to never be cut off, and a word people know from train tickets. */}
        <Tabs.Screen
          name="appointments"
          options={{ title: 'Bookings', tabBarIcon: tabIcon(ICONS.bookings) }}
        />
        <Tabs.Screen
          name="medicines"
          options={{ title: 'Medicines', tabBarIcon: tabIcon(ICONS.medicines) }}
        />
        <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tabIcon(ICONS.profile) }} />
      </Tabs>
      {/* Always-on voice navigation for non-technical users (floating mic). */}
      <VoiceNavOverlay />
    </>
  );
}
