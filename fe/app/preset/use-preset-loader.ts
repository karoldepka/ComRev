import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { createEffectInstance } from '@/utils/effect-defaults';
import { useThreeDStore } from '@/store/three-d-store';
import i18n from '@/utils/i18n';
import { PRESET_REGISTRY } from '../slides/preset-registry';

export function usePresetLoader(id: string) {
  const setEffectInstances = useThreeDStore((s) => s.setEffectInstances);
  const setMantraMode = useThreeDStore((s) => s.setMantraMode);
  const [ready, setReady] = useState(false);

  const { lang } = useLocalSearchParams<{ lang?: string }>();
  const displayLang = lang || undefined;

  const preset = PRESET_REGISTRY[id];

  const textSets = useMemo(
    () => preset?.generateSlides(displayLang) ?? [],
    // id guards against preset change if router reuses component; displayLang for ?lang= param
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, displayLang],
  );

  const text = useMemo(() => textSets.map((s) => s.text).join('\n\n'), [textSets]);

  useEffect(() => {
    if (!preset) return;
    const prevLang = i18n.language;
    if (displayLang && displayLang !== prevLang) i18n.changeLanguage(displayLang);
    setMantraMode(true);
    setEffectInstances((instances) => {
      const mainText = instances.find((i) => i.type === 'mainText');
      const next = mainText ?? createEffectInstance('mainText');
      const rest = instances.filter((i) => i.type !== 'mainText');
      return [
        { ...next, params: { ...next.params, text, textSets, activeTextSetId: textSets[0]?.id } },
        ...rest,
      ];
    });
    setReady(true);
    return () => {
      setMantraMode(false);
      if (displayLang && displayLang !== prevLang) i18n.changeLanguage(prevLang);
    };
  }, [preset, setEffectInstances, setMantraMode, text, textSets, displayLang]);

  return { ready, notFound: !preset };
}
