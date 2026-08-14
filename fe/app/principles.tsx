import { StyleSheet } from 'react-native';

import { ThreeDTextScreen } from '@/app/(tabs)/three-d';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePresetLoader } from '@/utils/use-preset-loader';

const PRINCIPLES_PRESET_ID = 'principles';

export default function PrinciplesScreen() {
  const { ready, notFound } = usePresetLoader(PRINCIPLES_PRESET_ID);

  if (notFound) {
    return (
      <ThemedView style={styles.screen}>
        <ThemedText>Principles preset not found.</ThemedText>
      </ThemedView>
    );
  }

  if (ready) {
    return <ThreeDTextScreen sequenceMode skipSavedConfigLoad />;
  }

  return (
    <ThemedView style={styles.screen}>
      <ThemedText>Opening principles slideshow...</ThemedText>
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
