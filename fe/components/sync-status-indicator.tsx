import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  ConfigSyncStatus,
  getConfigSyncStatusSnapshot,
  refreshConfigSyncStatus,
  subscribeConfigSyncStatus,
} from '@/utils/config-store';

function getStatusTone(status: ConfigSyncStatus) {
  if (status.phase === 'error') return 'error';
  if (status.phase === 'offline') return 'offline';
  if (status.phase === 'syncing') return 'syncing';
  if (status.pendingCount > 0) return 'local';
  if (status.phase === 'synced') return 'synced';
  return 'idle';
}

function getStatusLabel(status: ConfigSyncStatus) {
  if (status.phase === 'syncing') return 'Syncing';
  if (status.phase === 'offline') {
    return status.pendingCount > 0
      ? `Saved locally · ${status.pendingCount} pending`
      : 'Offline';
  }
  if (status.phase === 'error') {
    return status.pendingCount > 0
      ? `Sync needs attention · ${status.pendingCount} pending`
      : 'Sync needs attention';
  }
  if (status.pendingCount > 0)
    return `Saved locally · ${status.pendingCount} pending`;
  if (status.phase === 'synced') return 'Synced';
  return 'Ready';
}

function getStatusDescription(status: ConfigSyncStatus) {
  const parts = [getStatusLabel(status)];
  if (status.lastLocalSaveAt) {
    parts.push(
      `Last local save ${new Date(status.lastLocalSaveAt).toLocaleString()}`,
    );
  }
  if (status.lastSyncAt) {
    parts.push(`Last sync ${new Date(status.lastSyncAt).toLocaleString()}`);
  }
  if (status.lastError) {
    parts.push(`Latest error: ${status.lastError}`);
  }
  return parts.join('. ');
}

export function SyncStatusIndicator() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const dark = colorScheme === 'dark';
  const [status, setStatus] = React.useState(getConfigSyncStatusSnapshot);

  React.useEffect(() => {
    const unsubscribe = subscribeConfigSyncStatus(setStatus);
    refreshConfigSyncStatus().catch(() => undefined);

    if (typeof window === 'undefined') return unsubscribe;

    const refresh = () => {
      refreshConfigSyncStatus().catch(() => undefined);
    };
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
      unsubscribe();
    };
  }, []);

  const tone = getStatusTone(status);
  const toneColor = {
    error: '#d14343',
    idle: dark ? '#8c98a4' : '#6b7280',
    local: '#c77d00',
    offline: '#c77d00',
    synced: colors.tint,
    syncing: '#2478d4',
  }[tone];
  const label = getStatusLabel(status);
  const webLiveProps =
    Platform.OS === 'web'
      ? ({
          role: 'status',
          'aria-live': status.phase === 'error' ? 'assertive' : 'polite',
          'aria-atomic': true,
        } as Record<string, unknown>)
      : {};

  return (
    <View pointerEvents="box-none" style={styles.container}>
      <View
        {...webLiveProps}
        accessibilityLabel={getStatusDescription(status)}
        accessibilityLiveRegion={
          status.phase === 'error' ? 'assertive' : 'polite'
        }
        accessibilityRole="text"
        style={[
          styles.pill,
          {
            backgroundColor: dark
              ? 'rgba(22, 24, 27, 0.94)'
              : 'rgba(255, 255, 255, 0.96)',
            borderColor: dark ? '#343a40' : '#e6ded7',
          },
        ]}
      >
        <MaterialIcons
          name={
            status.phase === 'syncing'
              ? 'sync'
              : status.phase === 'error'
                ? 'sync-problem'
                : 'cloud-done'
          }
          size={14}
          color={toneColor}
        />
        <View style={[styles.dot, { backgroundColor: toneColor }]} />
        <Text
          numberOfLines={1}
          style={[styles.label, { color: dark ? '#f4f4f5' : colors.text }]}
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-end',
    position: 'absolute',
    right: 12,
    top: 12,
    zIndex: 1000,
  },
  dot: {
    borderRadius: 99,
    height: 7,
    width: 7,
  },
  label: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  pill: {
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    boxShadow: '0 6px 20px rgba(0, 0, 0, 0.12)',
    flexDirection: 'row',
    gap: 6,
    maxWidth: 320,
    minHeight: 30,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
