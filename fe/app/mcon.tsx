import { StyleSheet } from 'react-native';

import { ThreeDTextScreen } from '@/app/(tabs)/three-d';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePresetLoader } from '@/utils/use-preset-loader';

const MCON_PRESET_ID = 'mcon';

export default function MconScreen() {
  const { ready, notFound } = usePresetLoader(MCON_PRESET_ID);

  if (notFound) {
    return (
      <ThemedView style={styles.screen}>
        <ThemedText>Mantra preset not found.</ThemedText>
      </ThemedView>
    );
  }

  if (ready) {
    return <ThreeDTextScreen sequenceMode skipSavedConfigLoad />;
  }

  return (
    <ThemedView style={styles.screen}>
      <ThemedText>Opening mantra slideshow...</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
});
