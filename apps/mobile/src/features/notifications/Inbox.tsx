import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationList } from '@telecare/shared';
import { api } from '@/lib/api';
import { AppText, Card, EmptyState, Icon, QueryState, Screen, colors, radius, spacing } from '@/ui';

// Personal: never persisted to disk (see lib/query.ts).
const key = ['notifications'] as const;

export function useNotifications() {
  return useQuery({
    queryKey: key,
    queryFn: () => api.get<NotificationList>('/v1/notifications'),
    refetchInterval: 60_000, // ponytail: polling; push notifications if users need them instantly
  });
}

/** Bell with the unread count; opens the inbox. */
export function InboxBell() {
  const { data } = useNotifications();
  const unread = data?.unread ?? 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread ? `Notifications, ${unread} new` : 'Notifications'}
      onPress={() => router.push('/notifications')}
      style={styles.bell}
      hitSlop={8}
    >
      <Icon name={{ android: 'notifications', ios: 'bell' }} size={30} color="primary" />
      {unread > 0 && (
        <View style={styles.badge}>
          <AppText variant="caption" color="onAccent">
            {unread > 9 ? '9+' : unread}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

/** The inbox: newest first. Opening it marks everything read. */
export function InboxScreen() {
  const query = useNotifications();
  const queryClient = useQueryClient();
  const markRead = useMutation({
    mutationFn: () => api.post('/v1/notifications/read'),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
  const unread = query.data?.unread ?? 0;
  useEffect(() => {
    if (unread > 0) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per new batch of unread
  }, [unread]);

  return (
    <Screen>
      <QueryState
        query={query}
        isEmpty={(d) => d.items.length === 0}
        empty={
          <EmptyState title="Nothing yet." body="Bookings, prescriptions and order updates appear here." />
        }
      >
        {(d) =>
          d.items.map((n) => (
            <Pressable
              key={n.id}
              accessibilityRole="button"
              disabled={!n.link}
              onPress={() => n.link && router.push(n.link as Href)}
            >
              <Card style={!n.read && styles.unread}>
                <AppText variant="label">{n.title}</AppText>
                {n.body ? <AppText variant="small">{n.body}</AppText> : null}
                <AppText variant="caption" color="textMuted">
                  {new Date(n.createdAt).toLocaleString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </AppText>
              </Card>
            </Pressable>
          ))
        }
      </QueryState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bell: { padding: spacing.xs },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 22,
    height: 22,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  unread: { borderLeftWidth: 4, borderLeftColor: colors.accent },
});
