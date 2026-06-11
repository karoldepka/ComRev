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
    const currentText = get().effectInstances.find(i => i.type === 'mainText')?.params?.text;
    const fresh = createEffectInstance('mainText');
    if (currentText !== undefined) {
      fresh.params = { ...fresh.params, text: currentText };
    }
    set({ effectInstances: [fresh] });
  },
}));
