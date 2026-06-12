import { create } from 'zustand';
import { EffectInstance } from '@/utils/config-store';
import { createEffectInstance } from '@/utils/effect-defaults';

type SetterArg = EffectInstance[] | ((prev: EffectInstance[]) => EffectInstance[]);

interface ThreeDStore {
  effectInstances: EffectInstance[];
  setEffectInstances: (arg: SetterArg) => void;
  resetToBasic: () => void;
}

export const useThreeDStore = create<ThreeDStore>((set, get) => ({
  effectInstances: [createEffectInstance('mainText')],

  setEffectInstances: (arg) => {
    if (typeof arg === 'function') {
      set((state) => ({ effectInstances: arg(state.effectInstances) }));
    } else {
      set({ effectInstances: arg });
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
    set({ effectInstances: [fresh] });
  },
}));
