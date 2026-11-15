import { Tabs } from 'expo-router';
import { ICONS } from '@/features/shell/icons';
import { tabIcon } from '@/features/shell/TabIcon';
import { tabScreenOptions } from '@/features/shell/tab-options';

export default function Layout() {
  return (
    <Tabs screenOptions={{ ...tabScreenOptions, headerShown: false }}>
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: tabIcon(ICONS.home) }} />
      {/* Voice-first front door: a villager speaks instead of reading or searching (project map §4). */}
      <Tabs.Screen name="voice" options={{ title: 'बोलिए', tabBarIcon: tabIcon(ICONS.mic) }} />
      <Tabs.Screen name="doctors" options={{ title: 'Doctors', tabBarIcon: tabIcon(ICONS.doctor) }} />
      {/* "Bookings", not "Appointments": short enough to never be cut off, and a word people know from train tickets. */}
      <Tabs.Screen name="appointments" options={{ title: 'Bookings', tabBarIcon: tabIcon(ICONS.bookings) }} />
      <Tabs.Screen name="medicines" options={{ title: 'Medicines', tabBarIcon: tabIcon(ICONS.medicines) }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tabIcon(ICONS.profile) }} />
    </Tabs>
  );
}
