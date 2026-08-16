import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { createEffectInstance } from '@/utils/effect-defaults';
import { useThreeDStore } from '@/store/three-d-store';
import { useSoundscapeStore } from '@/store/soundscape-store';
import i18n from '@/utils/i18n';
import { fontFamilyForLang } from '@/utils/three-text-geometry';
import { resolveAbVariant } from '@/utils/slides/ab-variants';
import {
  parseCategoriesParam,
  PRESET_REGISTRY,
  reportAudioConfig,
} from '@/utils/slides/preset-registry';
import { shiftMusicKind } from '@/utils/music-tracks';

export function usePresetLoader(id: string) {
  const setEffectInstances = useThreeDStore((s) => s.setEffectInstances);
  const setMantraMode = useThreeDStore((s) => s.setMantraMode);
  const applyPresetConfig = useSoundscapeStore((s) => s.applyPresetConfig);
  const [ready, setReady] = useState(false);

  const { lang, categories, variant } = useLocalSearchParams<{
    lang?: string;
    categories?: string | string[];
    variant?: string;
  }>();
  const displayLang = lang || undefined;
  const selectedCategories = useMemo(
    () => parseCategoriesParam(categories),
    [categories],
  );
  const selectedCategoriesKey = selectedCategories.join(',');
  const abVariant = useMemo(() => resolveAbVariant(variant), [variant]);

  const preset = PRESET_REGISTRY[id];

  const textSets = useMemo(
    () => preset?.generateSlides(displayLang, selectedCategories) ?? [],
    // id guards against preset change if router reuses component; other values track URL params
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, displayLang, selectedCategoriesKey],
  );

  // The title slide is always textSets[0] (see makeTitleSlide) — override its
  // duration in place rather than threading the variant through every
  // generateSlides implementation.
  const effectiveTextSets = useMemo(() => {
    if (!abVariant.titleSlideDurationMs || textSets.length === 0) return textSets;
    const [titleSlide, ...rest] = textSets;
    return [{ ...titleSlide, durationMsOverride: abVariant.titleSlideDurationMs }, ...rest];
  }, [textSets, abVariant.titleSlideDurationMs]);

  const text = useMemo(
    () => textSets.map((s) => s.text).join('\n\n'),
    [textSets],
  );

  useEffect(() => {
    if (!preset) {
      setReady(false);
      return;
    }

    const prevLang = i18n.language;
    const languageToApply =
      displayLang && displayLang !== prevLang ? displayLang : null;
    if (languageToApply) {
      void i18n.changeLanguage(languageToApply).catch((error) => {
        console.warn(`Could not switch preset language to ${languageToApply}:`, error);
      });
    }
    if (preset.soundscape) applyPresetConfig(preset.soundscape);
    // The site no longer auto-plays music (or any other sound) on preset
    // load — it was disrupting whatever else was happening on the user's
    // speakers just from navigating here. Report which track the preset
    // wants instead, so a recorder can mix it into the video afterward
    // (see reportAudioConfig / setAudioConfigListener in preset-registry.ts).
    reportAudioConfig(shiftMusicKind(preset.music, abVariant.musicOffset ?? 0));
    setMantraMode(true);
    // fa/ar have no glyphs in the default Latin fonts — force the bundled
    // Persian/Arabic font for those languages. Only ever set when actually
    // needed so it never overrides a font the user picked manually for any
    // other language (see fontFamilyForLang).
    const rtlFontFamily = fontFamilyForLang(displayLang);
    setEffectInstances((instances) => {
      const mainText = instances.find((i) => i.type === 'mainText');
      const next = mainText ?? createEffectInstance('mainText');
      const rest = instances.filter((i) => i.type !== 'mainText');
      // Hard cap at 8, always applied (not just for fresh instances): a
      // curveSegments value persisted from before this cap existed (the old
      // default was 48) can make a full-sentence caption's geometry balloon
      // to millions of vertices, which the text-geometry worker can take so
      // long to build/serialize that it looks hung — and since a Worker
      // processes one postMessage at a time, every slide after it stalls too.
      // See the curveSegments comment in utils/three-text-geometry.ts.
      const safeCurveSegments = Math.min((next.params.curveSegments as number | undefined) ?? 8, 8);
      return [
        {
          ...next,
          params: {
            ...next.params,
            text,
            textSets: effectiveTextSets,
            activeTextSetId: effectiveTextSets[0]?.id,
            ...((abVariant.sequenceLineDurationMs ?? preset.sequenceLineDurationMs) !== undefined
              ? { sequenceLineDurationMs: abVariant.sequenceLineDurationMs ?? preset.sequenceLineDurationMs }
              : {}),
            // Always set explicitly (not just when the preset overrides it) so
            // switching from a preset with a custom background back to one
            // without doesn't leave the old color stuck in persisted params.
            backgroundColor: preset.background ?? 0x000000,
            ...(rtlFontFamily ? { fontFamily: rtlFontFamily } : {}),
            curveSegments: safeCurveSegments,
          },
        },
        ...rest,
      ];
    });
    setReady(true);
    return () => {
      setMantraMode(false);
      if (languageToApply) {
        void i18n.changeLanguage(prevLang).catch((error) => {
          console.warn(`Could not restore preset language to ${prevLang}:`, error);
        });
      }
    };
  }, [
    preset,
    setEffectInstances,
    setMantraMode,
    applyPresetConfig,
    text,
    effectiveTextSets,
    displayLang,
    abVariant,
  ]);

  return { ready, notFound: !preset };
}
