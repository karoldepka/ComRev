import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import '@/utils/i18n';
import { Toaster } from 'react-hot-toast';
import { Platform } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { installShaderErrorReporter } from '@/utils/shader-error-reporter';

installShaderErrorReporter();

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="preset" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
      {Platform.OS === 'web' && (
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: { maxWidth: 480, fontSize: 13 },
            error: { duration: 10000 },
          }}
        />
      )}
    </ThemeProvider>
  );
}
