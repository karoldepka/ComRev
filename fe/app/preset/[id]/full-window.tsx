import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ThreeDTextScreen, type TransitionSoundVariant } from '@/app/(tabs)/three-d';
import { usePresetLoader } from '@/utils/use-preset-loader';
import {
  PRESET_REGISTRY,
  setAudioConfigListener,
  setMissingTranslationListener,
} from '@/utils/slides/preset-registry';

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

/** Reported keys are deduped per page load — one ping per missing key is
 * plenty; the recorder aborts on the first one it receives anyway. */
const reportedMissingKeys = new Set<string>();

function pingMissingTranslation(port: number, key: string, lang: string) {
  const dedupeKey = `${lang} ${key}`;
  if (reportedMissingKeys.has(dedupeKey)) return;
  reportedMissingKeys.add(dedupeKey);
  pingRecorder(port, `/translation-missing?key=${encodeURIComponent(key)}&lang=${encodeURIComponent(lang)}`);
}

/** The site itself never plays this sound — see the TRANSITION_SOUND_VARIANTS
 * comment in three-d.tsx. `tMs` is relative to the same ready-ping that marks
 * the recording's own t=0 (see recordingStartPerfNowRef below), so the
 * recorder can place the real audio at the right spot during post-processing. */
function pingSoundEvent(port: number, variant: TransitionSoundVariant, tMs: number) {
  pingRecorder(port, `/sound-event?variant=${encodeURIComponent(variant)}&t=${Math.round(tMs)}`);
}

function pingAudioConfig(port: number, music: string | undefined) {
  if (!music) return;
  pingRecorder(port, `/sound-config?music=${encodeURIComponent(music)}`);
}

export default function PresetFullWindowScreen() {
  const {
    id,
    'pause-until-obs': pauseUntilObs,
    'ready-port': readyPortStr,
    'stop-after-slides': stopAfterSlidesStr,
  } = useLocalSearchParams<{
    id: string;
    'pause-until-obs'?: string;
    /** Localhost port a recorder script is listening on for "ready"/"stop-recording" pings. */
    'ready-port'?: string;
    /** When set, ping the recorder to stop once this many sequence slides have displayed. */
    'stop-after-slides'?: string;
  }>();

  const readyPort = parseInt(readyPortStr ?? '', 10) || 0;
  const stopAfterSlideCount = parseInt(stopAfterSlidesStr ?? '', 10) || undefined;

  // performance.now() at the moment the *last* "page ready" ping fires (i.e.
  // the post-refresh one — record-obs.mjs calls StartRecord right after
  // receiving it), so it's the same instant as the video's own t=0. Every
  // later sound event's timestamp is reported relative to this anchor.
  const recordingStartPerfNowRef = useRef<number | null>(null);
  const handleFirstMeshReady = () => {
    recordingStartPerfNowRef.current = typeof performance !== 'undefined' ? performance.now() : 0;
    pingRecorder(readyPort, '/ready');
  };
  const handleStopAfterSlideCount = () => pingRecorder(readyPort, '/stop-recording');
  const handleTransitionSound = (variant: TransitionSoundVariant) => {
    const anchor = recordingStartPerfNowRef.current;
    const tMs = anchor != null && typeof performance !== 'undefined' ? performance.now() - anchor : 0;
    pingSoundEvent(readyPort, variant, tMs);
  };

  // Registered synchronously (not in an effect) so it's in place before
  // usePresetLoader below builds this preset's slides — the recorder needs to
  // hear about a miss the moment it happens, not on some later render pass.
  setMissingTranslationListener(
    readyPort ? (key, lang) => pingMissingTranslation(readyPort, key, lang) : null,
  );
  setAudioConfigListener(
    readyPort ? (music) => pingAudioConfig(readyPort, music) : null,
  );

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
        onTransitionSound={handleTransitionSound}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
});
