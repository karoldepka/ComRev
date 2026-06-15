import { useEffect, useMemo, useState } from 'react';
import { createEffectInstance } from '@/utils/effect-defaults';
import { useThreeDStore } from '@/store/three-d-store';
import { PRESET_REGISTRY } from '../slides/preset-registry';

export function usePresetLoader(id: string) {
  const setEffectInstances = useThreeDStore((s) => s.setEffectInstances);
  const setMantraMode = useThreeDStore((s) => s.setMantraMode);
  const [ready, setReady] = useState(false);

  const preset = PRESET_REGISTRY[id];

  // Generate slide ids once on mount so they don't change on re-render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const textSets = useMemo(() => preset?.generateSlides() ?? [], []);

  const text = useMemo(() => textSets.map((s) => s.text).join('\n\n'), [textSets]);

  useEffect(() => {
    if (!preset) return;
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
    return () => setMantraMode(false);
  }, [preset, setEffectInstances, setMantraMode, text, textSets]);

  return { ready, notFound: !preset };
}
