import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ThreeDTextScreen } from '@/app/(tabs)/three-d';
import { PRESET_REGISTRY } from '../../slides/preset-registry';
import { DuplicatePresetButton } from '../duplicate-preset-button';
import { usePresetLoader } from '../use-preset-loader';

export default function PresetEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, notFound } = usePresetLoader(id);
  const preset = PRESET_REGISTRY[id];

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
  return (
    <View style={styles.container}>
      <ThreeDTextScreen skipSavedConfigLoad />
      <DuplicatePresetButton defaultName={preset?.label ?? id} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
});
