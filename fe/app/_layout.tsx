import { ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import '@/utils/i18n';

import { SyncStatusIndicator } from '@/components/sync-status-indicator';
import ToastHost from '@/components/toast-host';
import { AppThemeProvider, useAppTheme } from '@/components/app-theme-provider';
import { ErrorAlert } from '@/components/error-alert';
import { useFeatureFlag } from '@/utils/feature-flags';
import { installShaderErrorReporter } from '@/utils/shader-error-reporter';

installShaderErrorReporter();

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <ErrorAlert>
        <RootLayoutContents />
      </ErrorAlert>
    </AppThemeProvider>
  );
}

function RootLayoutContents() {
  const { colorScheme, navigationTheme } = useAppTheme();
  const showSyncIndicator = useFeatureFlag('syncStatusIndicator');

  return (
    <ThemeProvider value={navigationTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="preset" options={{ headerShown: false }} />
        <Stack.Screen name="update" options={{ headerShown: false }} />
        <Stack.Screen
          name="modal"
          options={{ presentation: 'modal', title: 'Modal' }}
        />
      </Stack>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      {showSyncIndicator ? <SyncStatusIndicator /> : null}
      <ToastHost />
    </ThemeProvider>
  );
}
