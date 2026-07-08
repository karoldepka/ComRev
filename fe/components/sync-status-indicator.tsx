import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import React from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  ConfigSyncStatus,
  getPendingConfigs,
  getConfigSyncStatusSnapshot,
  refreshConfigSyncStatus,
  setPendingConfigToLoad,
  subscribeConfigSyncStatus,
  type ThreeDConfig,
} from '@/utils/config-store';
import { useFeatureFlag } from '@/utils/feature-flags';

type SyncStatusTone =
  'error' | 'idle' | 'local' | 'offline' | 'synced' | 'syncing';
type MaterialIconName = React.ComponentProps<typeof MaterialIcons>['name'];

function getStatusTone(
  status: ConfigSyncStatus,
  showSyncAttention: boolean,
): SyncStatusTone {
  if (status.phase === 'error') {
    return showSyncAttention ? 'error' : 'local';
  }
  if (status.phase === 'offline') return 'offline';
  if (status.phase === 'syncing') return 'syncing';
  if (status.pendingCount > 0) return 'local';
  if (status.phase === 'synced') return 'synced';
  return 'idle';
}

function getStatusLabel(status: ConfigSyncStatus, showSyncAttention: boolean) {
  if (status.phase === 'syncing') return 'Syncing';
  if (status.phase === 'offline') {
    return status.pendingCount > 0
      ? `Saved locally · ${status.pendingCount} pending`
      : 'Offline';
  }
  if (status.phase === 'error') {
    if (showSyncAttention) {
      return status.pendingCount > 0
        ? `Sync needs attention · ${status.pendingCount} pending`
        : 'Sync needs attention';
    }
    return status.pendingCount > 0
      ? `Saved locally · ${status.pendingCount} pending`
      : 'Sync delayed';
  }
  if (status.pendingCount > 0)
    return `Saved locally · ${status.pendingCount} pending`;
  if (status.phase === 'synced') return 'Synced';
  return 'Ready';
}

function getStatusDescription(
  status: ConfigSyncStatus,
  showSyncAttention: boolean,
) {
  const parts = [getStatusLabel(status, showSyncAttention)];
  if (status.lastLocalSaveAt) {
    parts.push(
      `Last local save ${new Date(status.lastLocalSaveAt).toLocaleString()}`,
    );
  }
  if (status.lastSyncAt) {
    parts.push(`Last sync ${new Date(status.lastSyncAt).toLocaleString()}`);
  }
  if (showSyncAttention && status.lastError) {
    parts.push(`Latest error: ${status.lastError}`);
  }
  return parts.join('. ');
}

function getStatusIcon(
  status: ConfigSyncStatus,
  showSyncAttention: boolean,
): MaterialIconName {
  if (status.phase === 'syncing') return 'sync';
  if (status.phase === 'error' && showSyncAttention) return 'sync-problem';
  if (status.phase === 'synced' && status.pendingCount === 0)
    return 'cloud-done';
  return 'sync';
}

function getPendingItemTitle(config: ThreeDConfig) {
  return config.name?.trim() || config.text?.trim() || config.id;
}

function formatPendingItemTime(config: ThreeDConfig) {
  const timestamp = config.updatedAt || config.savedAt;
  if (!timestamp) return 'Pending local save';
  return `Updated ${new Date(timestamp).toLocaleString()}`;
}

export function SyncStatusIndicator() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const dark = colorScheme === 'dark';
  const showSyncAttention = useFeatureFlag('syncAttentionIndicator');
  const [status, setStatus] = React.useState(getConfigSyncStatusSnapshot);
  const [expanded, setExpanded] = React.useState(false);
  const [pendingItems, setPendingItems] = React.useState<ThreeDConfig[]>([]);
  const [pendingLoading, setPendingLoading] = React.useState(false);
  const [pendingLoadError, setPendingLoadError] = React.useState<string | null>(
    null,
  );

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

  const hasPendingItems = showSyncAttention && status.pendingCount > 0;

  const loadPendingItems = React.useCallback(async () => {
    setPendingLoading(true);
    try {
      const pending = await getPendingConfigs();
      setPendingItems(
        pending.sort((a, b) =>
          (b.updatedAt || b.savedAt || '').localeCompare(
            a.updatedAt || a.savedAt || '',
          ),
        ),
      );
      setPendingLoadError(null);
    } catch (error) {
      setPendingLoadError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setPendingLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!expanded) return;
    if (!hasPendingItems) {
      setExpanded(false);
      setPendingItems([]);
      return;
    }
    loadPendingItems().catch(() => undefined);
  }, [expanded, hasPendingItems, loadPendingItems, status.pendingCount]);

  React.useEffect(() => {
    if (!expanded || typeof window === 'undefined') return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [expanded]);

  const tone = getStatusTone(status, showSyncAttention);
  const toneColor = {
    error: '#d14343',
    idle: dark ? '#8c98a4' : '#6b7280',
    local: '#c77d00',
    offline: '#c77d00',
    synced: colors.tint,
    syncing: '#2478d4',
  }[tone];
  const label = getStatusLabel(status, showSyncAttention);
  const toggleExpanded = () => {
    if (!hasPendingItems) return;
    setExpanded((value) => !value);
  };
  const openPendingItem = (config: ThreeDConfig) => {
    setPendingConfigToLoad(config);
    setExpanded(false);
    router.push(
      `/(tabs)/three-d?syncItemId=${encodeURIComponent(config.id)}&syncOpen=${Date.now()}`,
    );
  };
  const webLiveProps =
    Platform.OS === 'web'
      ? ({
          role: 'status',
          'aria-live':
            status.phase === 'error' && showSyncAttention
              ? 'assertive'
              : 'polite',
          'aria-atomic': true,
        } as Record<string, unknown>)
      : {};

  return (
    <View pointerEvents="box-none" style={styles.container}>
      <Pressable
        disabled={!hasPendingItems}
        onPress={toggleExpanded}
        accessibilityRole={hasPendingItems ? 'button' : 'text'}
        accessibilityHint={
          hasPendingItems ? 'Shows pending sync items.' : undefined
        }
        accessibilityState={{
          expanded: hasPendingItems ? expanded : undefined,
        }}
      >
        <View
          {...webLiveProps}
          accessibilityLabel={getStatusDescription(status, showSyncAttention)}
          accessibilityLiveRegion={
            status.phase === 'error' && showSyncAttention
              ? 'assertive'
              : 'polite'
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
            name={getStatusIcon(status, showSyncAttention)}
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
          {hasPendingItems ? (
            <MaterialIcons
              name={expanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
              size={16}
              color={toneColor}
            />
          ) : null}
        </View>
      </Pressable>

      {expanded && hasPendingItems ? (
        <View
          style={[
            styles.pendingPanel,
            {
              backgroundColor: dark
                ? 'rgba(22, 24, 27, 0.98)'
                : 'rgba(255, 255, 255, 0.99)',
              borderColor: dark ? '#343a40' : '#e6ded7',
            },
          ]}
        >
          <View
            style={[
              styles.pendingHeader,
              { borderColor: dark ? '#343a40' : '#eee4dc' },
            ]}
          >
            <Text
              style={[
                styles.pendingHeaderText,
                { color: dark ? '#f4f4f5' : colors.text },
              ]}
            >
              Pending sync items
            </Text>
            <Pressable
              onPress={() => setExpanded(false)}
              accessibilityRole="button"
              accessibilityLabel="Close pending sync items"
              hitSlop={8}
              style={styles.pendingCloseButton}
            >
              <MaterialIcons
                name="close"
                size={16}
                color={dark ? '#a1a1aa' : '#6b7280'}
              />
            </Pressable>
          </View>
          {pendingLoadError ? (
            <Text
              style={[
                styles.pendingBodyMessage,
                styles.pendingError,
                { color: '#d14343' },
              ]}
              numberOfLines={3}
            >
              {pendingLoadError}
            </Text>
          ) : pendingLoading ? (
            <Text
              style={[
                styles.pendingBodyMessage,
                styles.pendingMeta,
                { color: dark ? '#a1a1aa' : '#6b7280' },
              ]}
            >
              Loading pending items...
            </Text>
          ) : pendingItems.length === 0 ? (
            <Text
              style={[
                styles.pendingBodyMessage,
                styles.pendingMeta,
                { color: dark ? '#a1a1aa' : '#6b7280' },
              ]}
            >
              No pending items found.
            </Text>
          ) : (
            <ScrollView style={styles.pendingList} nestedScrollEnabled>
              {pendingItems.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => openPendingItem(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open pending sync item ${getPendingItemTitle(item)}`}
                  accessibilityHint="Opens this local save in the 3D editor."
                  style={[
                    styles.pendingItem,
                    { borderColor: dark ? '#343a40' : '#eee4dc' },
                  ]}
                >
                  <View style={styles.pendingItemText}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.pendingTitle,
                        { color: dark ? '#f4f4f5' : colors.text },
                      ]}
                    >
                      {getPendingItemTitle(item)}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.pendingMeta,
                        { color: dark ? '#a1a1aa' : '#6b7280' },
                      ]}
                    >
                      {formatPendingItemTime(item)}
                    </Text>
                    {item.syncError ? (
                      <Text
                        numberOfLines={2}
                        style={[styles.pendingError, { color: '#d14343' }]}
                      >
                        {item.syncError}
                      </Text>
                    ) : null}
                  </View>
                  <MaterialIcons
                    name="open-in-new"
                    size={16}
                    color={toneColor}
                  />
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      ) : null}
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
  pendingBodyMessage: {
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  pendingCloseButton: {
    alignItems: 'center',
    borderRadius: 4,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  pendingError: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
  },
  pendingHeader: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  pendingHeaderText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
  pendingItem: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  pendingItemText: {
    flex: 1,
    minWidth: 0,
  },
  pendingList: {
    maxHeight: 280,
  },
  pendingMeta: {
    fontSize: 11,
    lineHeight: 15,
  },
  pendingPanel: {
    borderRadius: 6,
    borderWidth: 1,
    boxShadow: '0 8px 26px rgba(0, 0, 0, 0.16)',
    marginTop: 6,
    maxWidth: 360,
    minWidth: 300,
    overflow: 'hidden',
  },
  pendingTitle: {
    fontSize: 12,
    fontWeight: '800',
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
