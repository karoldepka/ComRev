import { ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { useTranslation } from 'react-i18next';
import 'react-native-reanimated';

import { SyncStatusIndicator } from '@/components/sync-status-indicator';
import ToastHost from '@/components/toast-host';
import { AppThemeProvider, useAppTheme } from '@/components/app-theme-provider';
import { ErrorAlert } from '@/components/error-alert';
import { useFeatureFlag } from '@/utils/feature-flags';
import { installShaderErrorReporter } from '@/utils/shader-error-reporter';
import { startConfigSyncRetryLoop } from '@/utils/config-store';
import { API_BASE } from '@/utils/api-config';
import { getLanguageDirection, normalizeLanguageCode } from '@/utils/i18n';

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
      <DocumentLanguage />
      <ConfigSyncRetryCoordinator />
      {showSyncIndicator ? <SyncStatusIndicator /> : null}
      <ToastHost />
    </ThemeProvider>
  );
}

function DocumentLanguage() {
  const { i18n } = useTranslation();

  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const language = normalizeLanguageCode(
      i18n.resolvedLanguage ?? i18n.language,
    ) ?? 'en';
    document.documentElement.lang = language;
    document.documentElement.dir = getLanguageDirection(language);
  }, [i18n.language, i18n.resolvedLanguage]);

  return null;
}

function ConfigSyncRetryCoordinator() {
  React.useEffect(() => startConfigSyncRetryLoop(API_BASE), []);
  return null;
}
