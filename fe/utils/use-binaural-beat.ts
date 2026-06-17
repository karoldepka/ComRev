import { useEffect } from 'react';
import { startBinaural, stopBinaural, updateBinaural, isBinauralPlaying } from './binaural-engine';

export function useBinauralBeat({
  beatHz,
  carrier = 200,
  volume = 0.35,
}: {
  beatHz: number;
  carrier?: number;
  volume?: number;
}) {
  useEffect(() => {
    if (!beatHz) return;
    if (isBinauralPlaying()) {
      updateBinaural(beatHz, carrier, volume);
    } else {
      startBinaural(beatHz, carrier, volume);
    }
    return () => {
      stopBinaural();
    };
  }, [beatHz, carrier, volume]);
}
