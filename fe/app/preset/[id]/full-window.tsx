import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ThreeDTextScreen } from '@/app/(tabs)/three-d';
import { useBinauralBeat } from '@/utils/use-binaural-beat';
import { usePresetLoader } from '@/utils/use-preset-loader';
import { PRESET_REGISTRY } from '@/utils/slides/preset-registry';

// Pre-render one HTML file per known preset ID at build time.
export function generateStaticParams() {
  return Object.keys(PRESET_REGISTRY).map((id) => ({ id }));
}

export default function PresetFullWindowScreen() {
  const {
    id,
    'binaural-hz': binauralHzStr,
    'binaural-carrier': binauralCarrierStr,
    'binaural-volume': binauralVolumeStr,
    'pause-until-obs': pauseUntilObs,
    'ready-port': readyPortStr,
  } = useLocalSearchParams<{
    id: string;
    'binaural-hz'?: string;
    'binaural-carrier'?: string;
    'binaural-volume'?: string;
    'pause-until-obs'?: string;
    /** Localhost port a recorder script is listening on for a "first frame rendered" ping. */
    'ready-port'?: string;
  }>();

  const handleFirstMeshReady = () => {
    const port = parseInt(readyPortStr ?? '', 10);
    if (!port || typeof window === 'undefined') return;
    const url = `http://localhost:${port}/ready`;
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url);
    } else {
      fetch(url, { mode: 'no-cors', keepalive: true }).catch(() => {});
    }
  };

  // When ?pause-until-obs=1, hold the sequence at slide 0 until OBS emits the
  // startSequence custom event — so recording and animation start simultaneously.
  const [sequenceReady, setSequenceReady] = useState(pauseUntilObs !== '1');

  useEffect(() => {
    if (pauseUntilObs !== '1' || typeof window === 'undefined') return;
    const handler = (e: any) => {
      if (e.detail?.action === 'startSequence') setSequenceReady(true);
    };
    window.addEventListener('obsCustomEvent', handler);
    return () => window.removeEventListener('obsCustomEvent', handler);
  }, [pauseUntilObs]);

  useBinauralBeat({
    beatHz: parseFloat(binauralHzStr ?? '0'),
    carrier: parseFloat(binauralCarrierStr ?? '200'),
    volume: parseFloat(binauralVolumeStr ?? '0.35'),
  });
  const { ready, notFound } = usePresetLoader(id);

  if (notFound) {
    return (
      <ThemedView style={styles.screen}>
        <ThemedText>{`Preset ${id} not found.`}</ThemedText>
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
      <ThreeDTextScreen
        sequenceMode
        fullWindow
        skipSavedConfigLoad
        sequenceReady={sequenceReady}
        onFirstMeshReady={handleFirstMeshReady}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
});
