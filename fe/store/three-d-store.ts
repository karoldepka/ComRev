import { create } from 'zustand';
import { EffectInstance } from '@/utils/config-store';
import { createEffectInstance } from '@/utils/effect-defaults';

type SetterArg = EffectInstance[] | ((prev: EffectInstance[]) => EffectInstance[]);

interface ThreeDStore {
  effectInstances: EffectInstance[];
  setEffectInstances: (arg: SetterArg) => void;
  resetToBasic: () => void;
  mantraMode: boolean;
  setMantraMode: (v: boolean) => void;
  slideEffectOverride: EffectInstance[] | null;
  setSlideEffectOverride: (override: EffectInstance[] | null) => void;
}

function normalizeEffectInstance(instance: EffectInstance): EffectInstance {
  return {
    ...instance,
    enabled: instance.enabled ?? true,
    animate: instance.animate ?? true,
    params: instance.params ?? {},
  };
}

function normalizeEffectInstances(instances: EffectInstance[]): EffectInstance[] {
  return instances.map(normalizeEffectInstance);
}

export const useThreeDStore = create<ThreeDStore>((set, get) => ({
  effectInstances: [createEffectInstance('mainText'), createEffectInstance('envMap')],
  mantraMode: false,
  setMantraMode: (v) => set({ mantraMode: v }),
  slideEffectOverride: null,
  setSlideEffectOverride: (override) => set({ slideEffectOverride: override }),

  setEffectInstances: (arg) => {
    if (typeof arg === 'function') {
      set((state) => ({ effectInstances: normalizeEffectInstances(arg(state.effectInstances)) }));
    } else {
      set({ effectInstances: normalizeEffectInstances(arg) });
    }
  },

  resetToBasic: () => {
    const currentParams = get().effectInstances.find(i => i.type === 'mainText')?.params ?? {};
    const fresh = createEffectInstance('mainText');
    fresh.params = {
      ...fresh.params,
      text: currentParams.text ?? fresh.params.text,
      textSets: currentParams.textSets ?? fresh.params.textSets,
      activeTextSetId: currentParams.activeTextSetId ?? fresh.params.activeTextSetId,
      sequenceLineDurationMs:
        currentParams.sequenceLineDurationMs ?? fresh.params.sequenceLineDurationMs,
    };
    set({ effectInstances: [fresh, createEffectInstance('envMap')] });
  },
}));
