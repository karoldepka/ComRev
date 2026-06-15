import { useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ThreeDTextScreen } from '@/app/(tabs)/three-d';
import { usePresetLoader } from '../use-preset-loader';

export default function PresetSlideshowScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, notFound } = usePresetLoader(id);

  if (notFound) {
    return (
      <ThemedView style={styles.screen}>
        <ThemedText>Preset "{id}" not found.</ThemedText>
      </ThemedView>
    );
  }
  if (!ready) {
    return (
      <ThemedView style={styles.screen}>
        <ThemedText>Loading…</ThemedText>
      </ThemedView>
    );
  }
  return <ThreeDTextScreen sequenceMode skipSavedConfigLoad />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
});
