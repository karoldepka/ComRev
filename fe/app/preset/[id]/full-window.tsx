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

/** Fire-and-forget ping to a recorder script's local HTTP server (see scripts/record-obs.mjs "Ready signal"). */
function pingRecorder(port: number, path: string) {
  if (!port || typeof window === 'undefined') return;
  const url = `http://localhost:${port}${path}`;
  if (navigator.sendBeacon) {
    navigator.sendBeacon(url);
  } else {
    fetch(url, { mode: 'no-cors', keepalive: true }).catch(() => {});
  }
}

export default function PresetFullWindowScreen() {
  const {
    id,
    'binaural-hz': binauralHzStr,
    'binaural-carrier': binauralCarrierStr,
    'binaural-volume': binauralVolumeStr,
    'pause-until-obs': pauseUntilObs,
    'ready-port': readyPortStr,
    'stop-after-slides': stopAfterSlidesStr,
  } = useLocalSearchParams<{
    id: string;
    'binaural-hz'?: string;
    'binaural-carrier'?: string;
    'binaural-volume'?: string;
    'pause-until-obs'?: string;
    /** Localhost port a recorder script is listening on for "ready"/"stop-recording" pings. */
    'ready-port'?: string;
    /** When set, ping the recorder to stop once this many sequence slides have displayed. */
    'stop-after-slides'?: string;
  }>();

  const readyPort = parseInt(readyPortStr ?? '', 10) || 0;
  const stopAfterSlideCount = parseInt(stopAfterSlidesStr ?? '', 10) || undefined;

  const handleFirstMeshReady = () => pingRecorder(readyPort, '/ready');
  const handleStopAfterSlideCount = () => pingRecorder(readyPort, '/stop-recording');

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
        stopAfterSlideCount={stopAfterSlideCount}
        onStopAfterSlideCount={handleStopAfterSlideCount}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
});
