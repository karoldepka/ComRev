import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { createEffectInstance } from '@/utils/effect-defaults';
import { useThreeDStore } from '@/store/three-d-store';
import { useSoundscapeStore } from '@/store/soundscape-store';
import i18n from '@/utils/i18n';
import { fontFamilyForLang } from '@/utils/three-text-geometry';
import {
  parseCategoriesParam,
  PRESET_REGISTRY,
} from '@/utils/slides/preset-registry';

export function usePresetLoader(id: string) {
  const setEffectInstances = useThreeDStore((s) => s.setEffectInstances);
  const setMantraMode = useThreeDStore((s) => s.setMantraMode);
  const applyPresetConfig = useSoundscapeStore((s) => s.applyPresetConfig);
  const playPresetMusic = useSoundscapeStore((s) => s.playPresetMusic);
  const [ready, setReady] = useState(false);

  const { lang, categories } = useLocalSearchParams<{
    lang?: string;
    categories?: string | string[];
  }>();
  const displayLang = lang || undefined;
  const selectedCategories = useMemo(
    () => parseCategoriesParam(categories),
    [categories],
  );
  const selectedCategoriesKey = selectedCategories.join(',');

  const preset = PRESET_REGISTRY[id];

  const textSets = useMemo(
    () => preset?.generateSlides(displayLang, selectedCategories) ?? [],
    // id guards against preset change if router reuses component; other values track URL params
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, displayLang, selectedCategoriesKey],
  );

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
    if (preset.music) playPresetMusic(preset.music);
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
      return [
        {
          ...next,
          params: {
            ...next.params,
            text,
            textSets,
            activeTextSetId: textSets[0]?.id,
            ...(preset.sequenceLineDurationMs !== undefined
              ? { sequenceLineDurationMs: preset.sequenceLineDurationMs }
              : {}),
            // Always set explicitly (not just when the preset overrides it) so
            // switching from a preset with a custom background back to one
            // without doesn't leave the old color stuck in persisted params.
            backgroundColor: preset.background ?? 0x000000,
            ...(rtlFontFamily ? { fontFamily: rtlFontFamily } : {}),
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
    playPresetMusic,
    text,
    textSets,
    displayLang,
  ]);

  return { ready, notFound: !preset };
}
