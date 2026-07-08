import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import '@/utils/i18n';

import { SyncStatusIndicator } from '@/components/sync-status-indicator';
import ToastHost from '@/components/toast-host';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFeatureFlag } from '@/utils/feature-flags';
import { installShaderErrorReporter } from '@/utils/shader-error-reporter';

installShaderErrorReporter();

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const showSyncIndicator = useFeatureFlag('syncStatusIndicator');

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="preset" options={{ headerShown: false }} />
        <Stack.Screen name="update" options={{ headerShown: false }} />
        <Stack.Screen
          name="modal"
          options={{ presentation: 'modal', title: 'Modal' }}
        />
      </Stack>
      <StatusBar style="auto" />
      {showSyncIndicator ? <SyncStatusIndicator /> : null}
      <ToastHost />
    </ThemeProvider>
  );
}
